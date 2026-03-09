import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { api } from '@/lib/api';
import { LOCATIONS, type Location } from '@/lib/locations';
import { allowsDecimals } from '@/lib/uom';
import { todayLocalStr } from '@/lib/utils';
import { useFormDirty } from '@/context/FormDirtyContext';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { CheckCircle, AlertTriangle } from 'lucide-react';
import { Combobox } from '@/components/ui/combobox';

type Item = { id: number; itemCode: string; description: string; unitOfMeasure: string; allowDecimalQty?: boolean };
type StockPosition = {
  item: { id: number };
  qtyByLocation: Record<string, number>;
  reservedByLocation: Record<string, number>;
  availableByLocation: Record<string, number>;
};

const schema = z.object({
  itemId: z.string().min(1, 'Item is required'),
  fromLocation: z.enum(LOCATIONS, { message: 'From location is required' }),
  toLocation: z.enum(LOCATIONS),
  transactionDate: z.string().min(1, 'Date is required'),
  quantity: z.coerce.number({ message: 'Must be a number' }).positive('Must be greater than 0'),
  notes: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

export function TransferPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [positions, setPositions] = useState<StockPosition[]>([]);
  const [sourceStock, setSourceStock] = useState<number | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<FormValues>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(schema) as any,
    defaultValues: {
      fromLocation: LOCATIONS[0],
      toLocation: LOCATIONS[1],
      transactionDate: todayLocalStr(),
    },
  });

  const { setDirty: setFormDirty } = useFormDirty();
  const [userInteracted, setUserInteracted] = useState(false);

  useEffect(() => {
    const sub = watch(() => setUserInteracted(true));
    return () => sub.unsubscribe();
  }, [watch]);

  useEffect(() => {
    setFormDirty(isDirty && userInteracted);
    return () => setFormDirty(false);
  }, [isDirty, userInteracted, setFormDirty]);

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (isDirty && userInteracted) { e.preventDefault(); e.returnValue = ''; }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty, userInteracted]);

  // Auto-dismiss success message after 5 seconds
  useEffect(() => {
    if (!successMessage) return;
    const timer = setTimeout(() => setSuccessMessage(null), 5000);
    return () => clearTimeout(timer);
  }, [successMessage]);

  const fromLocation = watch('fromLocation');
  const selectedItemId = watch('itemId');
  const currentQty = watch('quantity');

  // Load items and stock positions on mount
  useEffect(() => {
    async function loadData() {
      try {
        const [itemData, stockData] = await Promise.all([
          api.get<{ items: Item[] }>('/api/items'),
          api.get<{ positions: StockPosition[] }>('/api/transactions/stock-position'),
        ]);
        setItems(itemData.items);
        setPositions(stockData.positions);
      } catch {
        // non-fatal
      }
    }
    loadData();
  }, []);

  const toLocation = watch('toLocation');

  // When fromLocation changes, reset toLocation if it conflicts
  useEffect(() => {
    if (toLocation === fromLocation) {
      const other = LOCATIONS.find((l) => l !== fromLocation);
      if (other) setValue('toLocation', other);
    }
  }, [fromLocation, toLocation, setValue]);

  // Update source stock display when item or fromLocation changes
  const [sourceReserved, setSourceReserved] = useState(0);
  useEffect(() => {
    if (!selectedItemId) {
      setSourceStock(null);
      setSourceReserved(0);
      return;
    }
    const position = positions.find((p) => p.item.id === parseInt(selectedItemId));
    if (position) {
      const onHand = position.qtyByLocation[fromLocation] ?? 0;
      const reserved = position.reservedByLocation?.[fromLocation] ?? 0;
      setSourceStock(onHand - reserved);
      setSourceReserved(reserved);
    } else {
      setSourceStock(0);
      setSourceReserved(0);
    }
  }, [selectedItemId, fromLocation, positions]);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingValues, setPendingValues] = useState<FormValues | null>(null);

  const showStockWarning =
    sourceStock !== null && currentQty && Number(currentQty) > sourceStock;

  function onFormValid(values: FormValues) {
    setPendingValues(values);
    setConfirmOpen(true);
  }

  async function onConfirmed() {
    if (!pendingValues) return;
    setConfirmOpen(false);
    setSubmitError(null);
    setSuccessMessage(null);
    try {
      await api.post('/api/transactions/transfers', {
        itemId: parseInt(pendingValues.itemId),
        fromLocation: pendingValues.fromLocation,
        toLocation: pendingValues.toLocation,
        quantity: pendingValues.quantity,
        transactionDate: pendingValues.transactionDate,
        notes: pendingValues.notes?.trim() || '',
      });
      const itemCode = items.find((i) => String(i.id) === pendingValues.itemId)?.itemCode ?? '';
      setSuccessMessage(
        `Transfer recorded. ${pendingValues.quantity} ${itemCode} moved from ${pendingValues.fromLocation} to ${pendingValues.toLocation}.`
      );
      try {
        const stockData = await api.get<{ positions: StockPosition[] }>(
          '/api/transactions/stock-position'
        );
        setPositions(stockData.positions);
      } catch {
        // non-fatal
      }
      const prevFrom = pendingValues.fromLocation;
      const prevTo = pendingValues.toLocation;
      setUserInteracted(false);
      setFormDirty(false);
      reset({
        itemId: '',
        fromLocation: prevFrom,
        toLocation: prevTo,
        transactionDate: todayLocalStr(),
        quantity: '' as unknown as number,
        notes: '',
      });
      setPendingValues(null);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to save transfer.';
      setSubmitError(message);
    }
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">New Transfer</h1>
        <p className="mt-1 text-sm text-gray-500">
          Move inventory between locations.
        </p>
      </div>

      {successMessage && (
        <Alert className="border-green-200 bg-green-50">
          <CheckCircle className="h-4 w-4 text-green-600" />
          <AlertDescription className="text-green-800">{successMessage}</AlertDescription>
        </Alert>
      )}

      <form onSubmit={handleSubmit(onFormValid)} className="space-y-6">
        {/* Row 1: Part # + Description */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <Label>Part # <span className="text-red-500">*</span></Label>
            <Combobox
              options={items.map((item) => ({
                value: String(item.id),
                label: item.itemCode,
                searchText: item.itemCode,
              }))}
              value={watch('itemId')}
              onValueChange={(v) => setValue('itemId', v)}
              placeholder="Select part #..."
              searchPlaceholder="Search part #..."
            />
            {errors.itemId && (
              <p className="text-xs text-red-600 animate-field-error">{errors.itemId.message}</p>
            )}
          </div>

          <div className="space-y-1">
            <Label>Description</Label>
            <Combobox
              options={items.map((item) => ({
                value: String(item.id),
                label: item.description,
                searchText: item.description,
              }))}
              value={watch('itemId')}
              onValueChange={(v) => setValue('itemId', v)}
              placeholder="Select description..."
              searchPlaceholder="Search description..."
            />
          </div>
        </div>

        {/* Row 2: From Location + To Location */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <Label htmlFor="fromLocation">From <span className="text-red-500">*</span></Label>
            <Select
              defaultValue={LOCATIONS[0]}
              onValueChange={(v) => setValue('fromLocation', v as Location)}
            >
              <SelectTrigger id="fromLocation">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LOCATIONS.map((loc) => (
                  <SelectItem key={loc} value={loc}>{loc}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.fromLocation && (
              <p className="text-xs text-red-600 animate-field-error">{errors.fromLocation.message}</p>
            )}
          </div>

          <div className="space-y-1">
            <Label htmlFor="toLocation">To <span className="text-red-500">*</span></Label>
            <Select
              value={toLocation}
              onValueChange={(v) => setValue('toLocation', v as Location)}
            >
              <SelectTrigger id="toLocation">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LOCATIONS.filter((loc) => loc !== fromLocation).map((loc) => (
                  <SelectItem key={loc} value={loc}>{loc}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.toLocation && (
              <p className="text-xs text-red-600 animate-field-error">{errors.toLocation.message}</p>
            )}
          </div>
        </div>

        {/* Row 3: Date + Quantity */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <Label>Date <span className="text-red-500">*</span></Label>
            <Input type="date" max={todayLocalStr()} {...register('transactionDate')} />
            {errors.transactionDate && (
              <p className="text-xs text-red-600 animate-field-error">{errors.transactionDate.message}</p>
            )}
          </div>

        <div className="space-y-1">
          <Label htmlFor="quantity">Quantity <span className="text-red-500">*</span></Label>
          <Input
            id="quantity"
            type="number"
            step="any"
            min="0.01"
            placeholder="0"
            {...register('quantity', {
              validate: (v) => {
                const item = items.find((i) => String(i.id) === watch('itemId'));
                if (item && !allowsDecimals(item.unitOfMeasure) && !item.allowDecimalQty && v !== undefined && v % 1 !== 0) {
                  return `${item.itemCode} is measured in ${item.unitOfMeasure} — quantity must be a whole number.`;
                }
                return true;
              },
            })}
          />
          {sourceStock !== null && (
            <p className="text-xs text-gray-500">
              Available at {fromLocation}: <span className="font-semibold">{sourceStock}</span>
              {sourceReserved > 0 && (
                <span className="text-amber-600 ml-1">(On hand: {sourceStock + sourceReserved}, Reserved: {sourceReserved})</span>
              )}
            </p>
          )}
          {errors.quantity && (
            <p className="text-xs text-red-600 animate-field-error">{errors.quantity.message}</p>
          )}
        </div>
        </div>

        {/* Stock warning */}
        {showStockWarning && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              Requested quantity ({currentQty}) exceeds available stock at {fromLocation} ({sourceStock}).
            </AlertDescription>
          </Alert>
        )}

        {/* Notes */}
        <div className="space-y-1">
          <Label htmlFor="notes">Notes <span className="text-gray-400">(optional)</span></Label>
          <Textarea
            id="notes"
            placeholder="Reason for transfer..."
            rows={3}
            {...register('notes')}
          />
        </div>

        {submitError && (
          <p className="text-sm text-red-600">{submitError}</p>
        )}

        <div className="flex justify-end">
          <Button type="submit" disabled={isSubmitting || !!showStockWarning}>
            {isSubmitting ? 'Saving...' : 'Submit Transfer'}
          </Button>
        </div>
      </form>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Confirm Transfer"
        confirmLabel="Submit Transfer"
        description={
          pendingValues && (
            <div className="space-y-1 text-sm">
              <p><span className="font-medium">Item:</span> {items.find((i) => String(i.id) === pendingValues.itemId)?.itemCode ?? '--'}</p>
              <p><span className="font-medium">Quantity:</span> {pendingValues.quantity}</p>
              <p><span className="font-medium">From:</span> {pendingValues.fromLocation}{sourceStock !== null ? ` (${sourceStock} available)` : ''}</p>
              <p><span className="font-medium">To:</span> {pendingValues.toLocation}</p>
            </div>
          )
        }
        onConfirm={onConfirmed}
      />
    </div>
  );
}
