import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { api } from '@/lib/api';
import { LOCATIONS, type Location } from '@/lib/locations';
import { allowsDecimals } from '@/lib/uom';
import { useFormDirty } from '@/context/FormDirtyContext';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Combobox } from '@/components/ui/combobox';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { CheckCircle } from 'lucide-react';
import { ImportTab } from '@/components/ImportTab';

type Item = { id: number; itemCode: string; description: string; unitOfMeasure: string; allowDecimalQty?: boolean };

const schema = z.object({
  itemId: z.string().min(1, 'Item is required'),
  location: z.enum(LOCATIONS, { message: 'Location is required' }),
  quantity: z.coerce.number({ message: 'Must be a number' }).positive('Must be greater than 0'),
  unitCost: z.coerce.number({ message: 'Must be a number' }).positive('Must be greater than 0').optional().or(z.literal(NaN).transform(() => undefined)),
  notes: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

export function OpeningBalancePage() {
  const [items, setItems] = useState<Item[]>([]);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<FormValues>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(schema) as any,
    defaultValues: {
      location: LOCATIONS[0],
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

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingValues, setPendingValues] = useState<FormValues | null>(null);

  useEffect(() => {
    api
      .get<{ items: Item[] }>('/api/items')
      .then((data) => setItems(data.items))
      .catch(() => {});
  }, []);

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
      const data = await api.post<{ transaction: { id: number } }>(
        '/api/transactions/opening-balances',
        {
          itemId: parseInt(pendingValues.itemId),
          location: pendingValues.location,
          quantity: pendingValues.quantity,
          unitCost: pendingValues.unitCost || undefined,
          notes: pendingValues.notes?.trim() || '',
        }
      );
      const itemCode = items.find((i) => String(i.id) === pendingValues.itemId)?.itemCode ?? '';
      setSuccessMessage(`Opening balance #${data.transaction.id} recorded — ${pendingValues.quantity} ${itemCode} at ${pendingValues.location}.`);
      const prevLocation = pendingValues.location;
      setUserInteracted(false);
      setFormDirty(false);
      reset({
        itemId: '',
        location: prevLocation,
        quantity: '' as unknown as number,
        unitCost: '' as unknown as number,
        notes: '',
      });
      setPendingValues(null);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to save opening balance.';
      setSubmitError(message);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Opening Balances</h1>
        <p className="mt-1 text-sm text-gray-500">
          Set initial stock counts for go-live. Enter one at a time or bulk-load from a CSV file.
        </p>
      </div>

      <Tabs defaultValue="single">
        <TabsList>
          <TabsTrigger value="single">Single Entry</TabsTrigger>
          <TabsTrigger value="csv">CSV Import</TabsTrigger>
        </TabsList>

        <TabsContent value="single" className="mt-4">
          <div className="max-w-2xl">
            {successMessage && (
              <Alert className="border-green-200 bg-green-50 mb-6">
                <CheckCircle className="h-4 w-4 text-green-600" />
                <AlertDescription className="text-green-800">{successMessage}</AlertDescription>
              </Alert>
            )}

            <form onSubmit={handleSubmit(onFormValid)} className="space-y-6">
              {/* Row 1: Part # + Description + Location */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-1">
                  <Label>Part # <span className="text-red-500">*</span></Label>
                  <Combobox
                    options={items.map((item) => ({
                      value: String(item.id),
                      label: item.itemCode,
                      searchText: item.itemCode,
                    }))}
                    value={watch('itemId')}
                    onValueChange={(v) => setValue('itemId', v, { shouldDirty: true })}
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
                    onValueChange={(v) => setValue('itemId', v, { shouldDirty: true })}
                    placeholder="Select description..."
                    searchPlaceholder="Search description..."
                  />
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

              {/* Row 2: Quantity + Unit Cost */}
              <div className="grid grid-cols-2 gap-4">
                {(() => {
                  const watchedItemId = watch('itemId');
                  const selectedItem = items.find((i) => String(i.id) === watchedItemId);
                  const isWholeUnit = selectedItem && !allowsDecimals(selectedItem.unitOfMeasure) && !selectedItem.allowDecimalQty;
                  return (
                    <div className="space-y-1">
                      <Label htmlFor="quantity">Quantity <span className="text-red-500">*</span></Label>
                      <Input
                        id="quantity"
                        type="number"
                        step="any"
                        min="0.01"
                        placeholder={isWholeUnit ? '0' : '0.00'}
                        {...register('quantity', {
                          validate: (v) => {
                            if (isWholeUnit && v !== undefined && v % 1 !== 0) {
                              return `${selectedItem?.itemCode ?? 'Item'} is measured in ${selectedItem?.unitOfMeasure ?? 'EA'} — quantity must be a whole number.`;
                            }
                            return true;
                          },
                        })}
                      />
                      {errors.quantity && (
                        <p className="text-xs text-red-600 animate-field-error">{errors.quantity.message}</p>
                      )}
                    </div>
                  );
                })()}


                <div className="space-y-1">
                  <Label htmlFor="unitCost">Unit Cost ($) <span className="text-gray-400">(optional)</span></Label>
                  <Input
                    id="unitCost"
                    type="number"
                    step="0.01"
                    min="0.01"
                    placeholder="0.00"
                    {...register('unitCost')}
                    onBlur={(e) => {
                      const val = parseFloat(e.target.value);
                      if (!isNaN(val)) {
                        e.target.value = val.toFixed(2);
                        setValue('unitCost', val);
                      }
                    }}
                  />
                  {errors.unitCost && (
                    <p className="text-xs text-red-600 animate-field-error">{errors.unitCost.message}</p>
                  )}
                </div>
              </div>

              {/* Notes */}
              <div className="space-y-1">
                <Label htmlFor="notes">Notes <span className="text-gray-400">(optional)</span></Label>
                <Textarea
                  id="notes"
                  placeholder="Any notes about this opening balance..."
                  rows={3}
                  {...register('notes')}
                />
              </div>

              {submitError && (
                <p className="text-sm text-red-600">{submitError}</p>
              )}

              <div className="flex justify-end">
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting ? 'Saving...' : 'Submit Opening Balance'}
                </Button>
              </div>
            </form>
          </div>
        </TabsContent>

        <TabsContent value="csv" className="mt-4">
          <ImportTab
            label="Opening Balance"
            previewEndpoint="/api/transactions/opening-balances/import/preview"
            commitEndpoint="/api/transactions/opening-balances/import"
            columnHint="item_code, location, quantity, unit_cost"
          />
        </TabsContent>
      </Tabs>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Confirm Opening Balance"
        confirmLabel="Submit Opening Balance"
        description={
          pendingValues && (
            <div className="space-y-1 text-sm">
              <p><span className="font-medium">Item:</span> {items.find((i) => String(i.id) === pendingValues.itemId)?.itemCode ?? '--'}</p>
              <p><span className="font-medium">Location:</span> {pendingValues.location}</p>
              <p><span className="font-medium">Quantity:</span> {pendingValues.quantity}</p>
              {pendingValues.unitCost && (
                <p><span className="font-medium">Unit Cost:</span> ${pendingValues.unitCost}</p>
              )}
            </div>
          )
        }
        onConfirm={onConfirmed}
      />
    </div>
  );
}
