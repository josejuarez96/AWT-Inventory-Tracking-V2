import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { api } from '@/lib/api';
import { LOCATIONS, type Location } from '@/lib/locations';
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

type Item = { id: number; itemCode: string; description: string; unitOfMeasure: string };
type StockPosition = {
  item: { id: number };
  qtyByLocation: Record<string, number>;
};

const schema = z.object({
  itemId: z.string().min(1, 'Item is required'),
  fromLocation: z.enum(LOCATIONS, { required_error: 'From location is required' }),
  toLocation: z.enum(LOCATIONS),
  quantity: z.coerce.number({ invalid_type_error: 'Must be a number' }).positive('Must be greater than 0'),
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
    resolver: zodResolver(schema),
    defaultValues: {
      fromLocation: LOCATIONS[0],
      toLocation: LOCATIONS[1],
    },
  });

  const { setDirty: setFormDirty } = useFormDirty();
  useEffect(() => {
    setFormDirty(isDirty);
    return () => setFormDirty(false);
  }, [isDirty, setFormDirty]);

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (isDirty) { e.preventDefault(); e.returnValue = ''; }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);

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
  useEffect(() => {
    if (!selectedItemId) {
      setSourceStock(null);
      return;
    }
    const position = positions.find((p) => p.item.id === parseInt(selectedItemId));
    if (position) {
      setSourceStock(position.qtyByLocation[fromLocation] ?? 0);
    } else {
      setSourceStock(0);
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
        notes: pendingValues.notes || undefined,
      });
      setSuccessMessage(
        `Transfer recorded. ${pendingValues.quantity} units moved from ${pendingValues.fromLocation} to ${pendingValues.toLocation}.`
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
      reset({
        itemId: '',
        fromLocation: prevFrom,
        toLocation: prevTo,
        quantity: undefined,
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
        {/* Row 1: Item */}
        <div className="space-y-1">
          <Label htmlFor="itemId">Item <span className="text-red-500">*</span></Label>
          <Combobox
            options={items.map((item) => ({
              value: String(item.id),
              label: `${item.itemCode} — ${item.description}`,
              searchText: `${item.itemCode} ${item.description}`,
            }))}
            value={watch('itemId')}
            onValueChange={(v) => setValue('itemId', v)}
            placeholder="Search items..."
            searchPlaceholder="Type code or description..."
          />
          {errors.itemId && (
            <p className="text-xs text-red-600 animate-field-error">{errors.itemId.message}</p>
          )}
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

        {/* Row 3: Quantity */}
        <div className="space-y-1">
          <Label htmlFor="quantity">Quantity <span className="text-red-500">*</span></Label>
          <Input
            id="quantity"
            type="number"
            step="0.01"
            min="0.01"
            placeholder="0"
            {...register('quantity')}
          />
          {sourceStock !== null && (
            <p className="text-xs text-gray-500">
              Available at {fromLocation}: <span className="font-semibold">{sourceStock}</span>
            </p>
          )}
          {errors.quantity && (
            <p className="text-xs text-red-600 animate-field-error">{errors.quantity.message}</p>
          )}
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
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Saving...' : 'Save Transfer'}
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
              <p><span className="font-medium">From:</span> {pendingValues.fromLocation}</p>
              <p><span className="font-medium">To:</span> {pendingValues.toLocation}</p>
            </div>
          )
        }
        onConfirm={onConfirmed}
      />
    </div>
  );
}
