import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { api } from '@/lib/api';
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
  adelQty: number;
  calhounQty: number;
};

const schema = z.object({
  itemId: z.string().min(1, 'Item is required'),
  fromLocation: z.enum(['ADEL', 'CALHOUN'], { required_error: 'From location is required' }),
  toLocation: z.enum(['ADEL', 'CALHOUN']),
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
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      fromLocation: 'ADEL',
      toLocation: 'CALHOUN',
    },
  });

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

  // Auto-set toLocation when fromLocation changes
  useEffect(() => {
    setValue('toLocation', fromLocation === 'ADEL' ? 'CALHOUN' : 'ADEL');
  }, [fromLocation, setValue]);

  // Update source stock display when item or fromLocation changes
  useEffect(() => {
    if (!selectedItemId) {
      setSourceStock(null);
      return;
    }
    const position = positions.find((p) => p.item.id === parseInt(selectedItemId));
    if (position) {
      setSourceStock(fromLocation === 'ADEL' ? position.adelQty : position.calhounQty);
    } else {
      setSourceStock(0);
    }
  }, [selectedItemId, fromLocation, positions]);

  const showStockWarning =
    sourceStock !== null && currentQty && Number(currentQty) > sourceStock;

  async function onSubmit(values: FormValues) {
    setSubmitError(null);
    setSuccessMessage(null);
    try {
      const data = await api.post<{
        transfer: {
          outbound: { id: number; quantity: number };
          inbound: { id: number; quantity: number };
        };
      }>('/api/transactions/transfers', {
        itemId: parseInt(values.itemId),
        fromLocation: values.fromLocation,
        toLocation: values.toLocation,
        quantity: values.quantity,
        notes: values.notes || undefined,
      });
      setSuccessMessage(
        `Transfer recorded. ${values.quantity} units moved from ${values.fromLocation} to ${values.toLocation}.`
      );
      // Refresh stock positions
      try {
        const stockData = await api.get<{ positions: StockPosition[] }>(
          '/api/transactions/stock-position'
        );
        setPositions(stockData.positions);
      } catch {
        // non-fatal
      }
      const prevFrom = values.fromLocation;
      reset({
        itemId: '',
        fromLocation: prevFrom,
        toLocation: prevFrom === 'ADEL' ? 'CALHOUN' : 'ADEL',
        quantity: undefined,
        notes: '',
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to save transfer.';
      setSubmitError(message);
    }
  }

  const toLocation = fromLocation === 'ADEL' ? 'CALHOUN' : 'ADEL';

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">New Transfer</h1>
        <p className="mt-1 text-sm text-gray-500">
          Move inventory between ADEL and CALHOUN locations.
        </p>
      </div>

      {successMessage && (
        <Alert className="border-green-200 bg-green-50">
          <CheckCircle className="h-4 w-4 text-green-600" />
          <AlertDescription className="text-green-800">{successMessage}</AlertDescription>
        </Alert>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
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
            <p className="text-xs text-red-600">{errors.itemId.message}</p>
          )}
        </div>

        {/* Row 2: From Location + To Location */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <Label htmlFor="fromLocation">From <span className="text-red-500">*</span></Label>
            <Select
              defaultValue="ADEL"
              onValueChange={(v) => setValue('fromLocation', v as 'ADEL' | 'CALHOUN')}
            >
              <SelectTrigger id="fromLocation">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ADEL">ADEL</SelectItem>
                <SelectItem value="CALHOUN">CALHOUN</SelectItem>
              </SelectContent>
            </Select>
            {errors.fromLocation && (
              <p className="text-xs text-red-600">{errors.fromLocation.message}</p>
            )}
          </div>

          <div className="space-y-1">
            <Label htmlFor="toLocation">To</Label>
            <div className="flex h-10 w-full items-center rounded-md border bg-gray-50 px-3 text-sm font-medium text-gray-700">
              {toLocation}
            </div>
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
            <p className="text-xs text-red-600">{errors.quantity.message}</p>
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
    </div>
  );
}
