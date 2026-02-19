import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { api, ApiError } from '@/lib/api';
import { LOCATIONS, type Location } from '@/lib/locations';
import { useAuth } from '@/hooks/useAuth';
import { useFormDirty } from '@/context/FormDirtyContext';
import { AdminAuthDialog } from '@/components/AdminAuthDialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { CheckCircle, ArrowDown, ArrowUp } from 'lucide-react';
import { Combobox } from '@/components/ui/combobox';

type Item = { id: number; itemCode: string; description: string; unitOfMeasure: string };
type StockPosition = {
  item: { id: number };
  qtyByLocation: Record<string, number>;
};

const REASONS = ['Damage', 'Shrinkage', 'Correction', 'Other'] as const;

// Reasons that always reduce inventory
const DECREASE_REASONS: string[] = ['Damage', 'Shrinkage'];
// Reasons that could go either way
const FLEXIBLE_REASONS: string[] = ['Correction', 'Other'];

type AdjustmentDirection = 'decrease' | 'increase';

const schema = z.object({
  itemId: z.string().min(1, 'Item is required'),
  location: z.enum(LOCATIONS, { required_error: 'Location is required' }),
  quantity: z.coerce
    .number({ invalid_type_error: 'Must be a number' })
    .positive('Must be greater than 0'),
  reason: z.enum(REASONS, { required_error: 'Reason is required' }),
  direction: z.enum(['decrease', 'increase']),
  notes: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

export function AdjustmentPage() {
  const { user } = useAuth();
  const [items, setItems] = useState<Item[]>([]);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [adminAuthOpen, setAdminAuthOpen] = useState(false);
  const [adminAuthError, setAdminAuthError] = useState<string | null>(null);
  const [adminAuthSubmitting, setAdminAuthSubmitting] = useState(false);
  const [positions, setPositions] = useState<StockPosition[]>([]);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      location: LOCATIONS[0],
      direction: 'decrease',
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

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingValues, setPendingValues] = useState<FormValues | null>(null);

  const selectedReason = watch('reason');
  const selectedDirection = watch('direction') as AdjustmentDirection;
  const watchedQty = watch('quantity');

  // Auto-set direction when reason changes
  useEffect(() => {
    if (selectedReason && DECREASE_REASONS.includes(selectedReason)) {
      setValue('direction', 'decrease');
    }
  }, [selectedReason, setValue]);

  useEffect(() => {
    Promise.all([
      api.get<{ items: Item[] }>('/api/items'),
      api.get<{ positions: StockPosition[] }>('/api/transactions/stock-position'),
    ]).then(([itemData, stockData]) => {
      setItems(itemData.items);
      setPositions(stockData.positions);
    }).catch(() => {});
  }, []);

  const isDecreaseOnly = selectedReason ? DECREASE_REASONS.includes(selectedReason) : false;
  const isFlexible = selectedReason ? FLEXIBLE_REASONS.includes(selectedReason) : true;

  function onFormValid(values: FormValues) {
    // Pre-check: block negative stock before showing confirm dialog
    if (values.direction === 'decrease') {
      const pos = positions.find((p) => p.item.id === parseInt(values.itemId));
      const currentStock = pos
        ? (pos.qtyByLocation[values.location] ?? 0)
        : 0;
      if (values.quantity > currentStock) {
        setSubmitError(
          `Cannot remove ${values.quantity} units — only ${currentStock} available at ${values.location}.`
        );
        return;
      }
    }
    setSubmitError(null);
    setPendingValues(values);
    setConfirmOpen(true);
  }

  function buildAdjPayload(values: FormValues) {
    const finalQty = values.direction === 'decrease' ? -Math.abs(values.quantity) : Math.abs(values.quantity);
    return {
      itemId: parseInt(values.itemId),
      location: values.location,
      quantity: finalQty,
      reason: values.reason,
      notes: values.notes || undefined,
    };
  }

  function handleAdjSuccess(data: { transaction: { id: number } }, values: FormValues) {
    const action = values.direction === 'decrease' ? 'removed from' : 'added to';
    setSuccessMessage(`Adjustment #${data.transaction.id} recorded — ${values.quantity} units ${action} inventory.`);
    const prevLocation = values.location;
    reset({
      itemId: '',
      location: prevLocation,
      quantity: undefined,
      direction: 'decrease',
      reason: undefined,
      notes: '',
    });
    setPendingValues(null);
  }

  async function onConfirmed() {
    if (!pendingValues) return;
    setConfirmOpen(false);
    setSubmitError(null);
    setSuccessMessage(null);
    try {
      const data = await api.post<{ transaction: { id: number } }>(
        '/api/transactions/adjustments',
        buildAdjPayload(pendingValues)
      );
      handleAdjSuccess(data, pendingValues);
    } catch (err: unknown) {
      if (err instanceof ApiError && err.data?.requiresApproval) {
        setAdminAuthError(null);
        setAdminAuthOpen(true);
      } else {
        const message = err instanceof Error ? err.message : 'Failed to save adjustment.';
        setSubmitError(message);
      }
    }
  }

  async function handleAdminAuthorize(credentials: { username: string; password: string }) {
    if (!pendingValues) return;
    setAdminAuthSubmitting(true);
    setAdminAuthError(null);
    try {
      const encoded = btoa(`${credentials.username}:${credentials.password}`);
      const data = await api.post<{ transaction: { id: number } }>(
        '/api/transactions/adjustments',
        buildAdjPayload(pendingValues),
        { 'X-Admin-Authorization': `Basic ${encoded}` }
      );
      setAdminAuthOpen(false);
      handleAdjSuccess(data, pendingValues);
    } catch (err: unknown) {
      if (err instanceof ApiError && err.data?.requiresApproval) {
        setAdminAuthError(err.message);
      } else {
        setAdminAuthOpen(false);
        const message = err instanceof Error ? err.message : 'Failed to save adjustment.';
        setSubmitError(message);
      }
    } finally {
      setAdminAuthSubmitting(false);
    }
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">New Adjustment</h1>
        <p className="mt-1 text-sm text-gray-500">
          Record inventory corrections — damage, shrinkage, cycle counts, or other adjustments.
        </p>
      </div>

      {successMessage && (
        <Alert className="border-green-200 bg-green-50">
          <CheckCircle className="h-4 w-4 text-green-600" />
          <AlertDescription className="text-green-800">{successMessage}</AlertDescription>
        </Alert>
      )}

      <form onSubmit={handleSubmit(onFormValid)} className="space-y-6">
        {/* Row 1: Item + Location */}
        <div className="grid grid-cols-2 gap-4">
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

          <div className="space-y-1">
            <Label htmlFor="location">Location <span className="text-red-500">*</span></Label>
            <Select
              defaultValue={LOCATIONS[0]}
              onValueChange={(v) => setValue('location', v as Location)}
            >
              <SelectTrigger id="location">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LOCATIONS.map((loc) => (
                  <SelectItem key={loc} value={loc}>{loc}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.location && (
              <p className="text-xs text-red-600 animate-field-error">{errors.location.message}</p>
            )}
          </div>
        </div>

        {/* Row 2: Reason */}
        <div className="space-y-1">
          <Label htmlFor="reason">Reason <span className="text-red-500">*</span></Label>
          <Select onValueChange={(v) => setValue('reason', v as typeof REASONS[number])}>
            <SelectTrigger id="reason">
              <SelectValue placeholder="Select reason..." />
            </SelectTrigger>
            <SelectContent>
              {REASONS.map((r) => (
                <SelectItem key={r} value={r}>{r}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {errors.reason && (
            <p className="text-xs text-red-600 animate-field-error">{errors.reason.message}</p>
          )}
        </div>

        {/* Row 3: Direction + Quantity */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <Label>Direction <span className="text-red-500">*</span></Label>
            <div className="flex gap-2">
              <button
                type="button"
                className={`flex-1 flex items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
                  selectedDirection === 'decrease'
                    ? 'border-red-300 bg-red-50 text-red-700'
                    : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                } ${isDecreaseOnly ? 'opacity-100' : ''}`}
                onClick={() => setValue('direction', 'decrease')}
              >
                <ArrowDown className="h-4 w-4" />
                Remove from stock
              </button>
              <button
                type="button"
                className={`flex-1 flex items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
                  selectedDirection === 'increase'
                    ? 'border-green-300 bg-green-50 text-green-700'
                    : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                } ${isDecreaseOnly ? 'opacity-40 cursor-not-allowed' : ''}`}
                onClick={() => { if (!isDecreaseOnly) setValue('direction', 'increase'); }}
                disabled={isDecreaseOnly}
              >
                <ArrowUp className="h-4 w-4" />
                Add to stock
              </button>
            </div>
            {isDecreaseOnly && (
              <p className="text-xs text-gray-500">{selectedReason} always removes inventory.</p>
            )}
          </div>

          <div className="space-y-1">
            <Label htmlFor="quantity">Quantity <span className="text-red-500">*</span></Label>
            <Input
              id="quantity"
              type="number"
              step="0.01"
              min="0.01"
              placeholder="Enter quantity..."
              {...register('quantity')}
            />
            {errors.quantity && (
              <p className="text-xs text-red-600 animate-field-error">{errors.quantity.message}</p>
            )}
          </div>
        </div>

        {/* Preview of what will happen */}
        {watchedQty > 0 && selectedReason && (
          <div className={`rounded-md px-4 py-3 text-sm font-medium ${
            selectedDirection === 'decrease'
              ? 'bg-red-50 text-red-800 border border-red-200'
              : 'bg-green-50 text-green-800 border border-green-200'
          }`}>
            {selectedDirection === 'decrease'
              ? `This will REMOVE ${watchedQty} units from inventory (${selectedReason})`
              : `This will ADD ${watchedQty} units to inventory (${selectedReason})`
            }
          </div>
        )}

        {/* Notes */}
        <div className="space-y-1">
          <Label htmlFor="notes">Notes <span className="text-gray-400">(optional)</span></Label>
          <Textarea
            id="notes"
            placeholder="Details about this adjustment..."
            rows={3}
            {...register('notes')}
          />
        </div>

        {submitError && (
          <p className="text-sm text-red-600">{submitError}</p>
        )}

        <div className="flex justify-end">
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Saving...' : 'Save Adjustment'}
          </Button>
        </div>
      </form>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Confirm Adjustment"
        confirmLabel="Save Adjustment"
        confirmVariant={pendingValues?.direction === 'decrease' ? 'destructive' : 'default'}
        description={
          pendingValues && (
            <div className="space-y-1 text-sm">
              <p><span className="font-medium">Item:</span> {items.find((i) => String(i.id) === pendingValues.itemId)?.itemCode ?? '--'}</p>
              <p><span className="font-medium">Action:</span>{' '}
                {pendingValues.direction === 'decrease' ? 'REMOVE' : 'ADD'}{' '}
                {pendingValues.quantity} units
              </p>
              <p><span className="font-medium">Reason:</span> {pendingValues.reason}</p>
              <p><span className="font-medium">Location:</span> {pendingValues.location}</p>
            </div>
          )
        }
        onConfirm={onConfirmed}
      />

      <AdminAuthDialog
        open={adminAuthOpen}
        onOpenChange={setAdminAuthOpen}
        description="This adjustment exceeds the threshold (>10% of stock or >$500 value impact). Enter admin credentials to authorize."
        onAuthorize={handleAdminAuthorize}
        isSubmitting={adminAuthSubmitting}
        error={adminAuthError}
      />
    </div>
  );
}
