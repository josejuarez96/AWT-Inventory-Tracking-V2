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
import { AlertTriangle, CheckCircle } from 'lucide-react';

type Vendor = { id: number; vendorCode: string; vendorName: string };
type Item = { id: number; itemCode: string; description: string; unitOfMeasure: string };

const schema = z.object({
  itemId: z.string().min(1, 'Item is required'),
  vendorId: z.string().min(1, 'Vendor is required'),
  location: z.enum(['ADEL', 'CALHOUN'], { required_error: 'Location is required' }),
  quantity: z.coerce.number({ invalid_type_error: 'Must be a number' }).positive('Must be greater than 0'),
  unitCost: z.coerce.number({ invalid_type_error: 'Must be a number' }).positive('Must be greater than 0'),
  transactionDate: z.string().min(1, 'Date is required'),
  invoiceNumber: z.string().optional(),
  notes: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

export function ReceiptPage() {
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [lastPaidPrice, setLastPaidPrice] = useState<number | null>(null);
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
      transactionDate: new Date().toISOString().split('T')[0],
      location: 'ADEL',
    },
  });

  useEffect(() => {
    async function loadData() {
      try {
        const [vendorData, itemData] = await Promise.all([
          api.get<{ vendors: Vendor[] }>('/api/vendors'),
          api.get<{ items: Item[] }>('/api/items'),
        ]);
        setVendors(vendorData.vendors);
        setItems(itemData.items);
      } catch {
        // non-fatal — user will see empty dropdowns
      }
    }
    loadData();
  }, []);

  const currentUnitCost = watch('unitCost');
  const priceDelta =
    lastPaidPrice && currentUnitCost
      ? Math.abs((Number(currentUnitCost) - lastPaidPrice) / lastPaidPrice)
      : 0;
  const showCostWarning = lastPaidPrice !== null && priceDelta > 0.1;

  async function onSubmit(values: FormValues) {
    setSubmitError(null);
    setSuccessMessage(null);
    try {
      const data = await api.post<{ transaction: { id: number }; lastPaidPrice: number | null }>(
        '/api/transactions/receipts',
        {
          itemId: parseInt(values.itemId),
          vendorId: parseInt(values.vendorId),
          location: values.location,
          quantity: values.quantity,
          unitCost: values.unitCost,
          transactionDate: values.transactionDate,
          invoiceNumber: values.invoiceNumber || undefined,
          notes: values.notes || undefined,
        }
      );
      setLastPaidPrice(data.lastPaidPrice);
      setSuccessMessage(`Receipt #${data.transaction.id} recorded successfully.`);
      // Reset form but keep location for fast sequential entry
      const prevLocation = values.location;
      reset({
        itemId: '',
        vendorId: '',
        location: prevLocation,
        quantity: undefined,
        unitCost: undefined,
        transactionDate: new Date().toISOString().split('T')[0],
        invoiceNumber: '',
        notes: '',
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to save receipt.';
      setSubmitError(message);
    }
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">New Receipt</h1>
        <p className="mt-1 text-sm text-gray-500">
          Record inventory received from a vendor.
        </p>
      </div>

      {successMessage && (
        <Alert className="border-green-200 bg-green-50">
          <CheckCircle className="h-4 w-4 text-green-600" />
          <AlertDescription className="text-green-800">{successMessage}</AlertDescription>
        </Alert>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {/* Row 1: Item + Vendor */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <Label htmlFor="itemId">Item <span className="text-red-500">*</span></Label>
            <Select onValueChange={(v) => { setValue('itemId', v); setLastPaidPrice(null); }}>
              <SelectTrigger id="itemId">
                <SelectValue placeholder="Select item…" />
              </SelectTrigger>
              <SelectContent>
                {items.map((item) => (
                  <SelectItem key={item.id} value={String(item.id)}>
                    {item.itemCode} — {item.description}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.itemId && (
              <p className="text-xs text-red-600">{errors.itemId.message}</p>
            )}
          </div>

          <div className="space-y-1">
            <Label htmlFor="vendorId">Vendor <span className="text-red-500">*</span></Label>
            <Select onValueChange={(v) => setValue('vendorId', v)}>
              <SelectTrigger id="vendorId">
                <SelectValue placeholder="Select vendor…" />
              </SelectTrigger>
              <SelectContent>
                {vendors.map((v) => (
                  <SelectItem key={v.id} value={String(v.id)}>
                    {v.vendorName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.vendorId && (
              <p className="text-xs text-red-600">{errors.vendorId.message}</p>
            )}
          </div>
        </div>

        {/* Row 2: Location + Date */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <Label htmlFor="location">Location <span className="text-red-500">*</span></Label>
            <Select
              defaultValue="ADEL"
              onValueChange={(v) => setValue('location', v as 'ADEL' | 'CALHOUN')}
            >
              <SelectTrigger id="location">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ADEL">ADEL</SelectItem>
                <SelectItem value="CALHOUN">CALHOUN</SelectItem>
              </SelectContent>
            </Select>
            {errors.location && (
              <p className="text-xs text-red-600">{errors.location.message}</p>
            )}
          </div>

          <div className="space-y-1">
            <Label htmlFor="transactionDate">Date <span className="text-red-500">*</span></Label>
            <Input
              id="transactionDate"
              type="date"
              {...register('transactionDate')}
            />
            {errors.transactionDate && (
              <p className="text-xs text-red-600">{errors.transactionDate.message}</p>
            )}
          </div>
        </div>

        {/* Row 3: Quantity + Unit Cost */}
        <div className="grid grid-cols-2 gap-4">
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
            {errors.quantity && (
              <p className="text-xs text-red-600">{errors.quantity.message}</p>
            )}
          </div>

          <div className="space-y-1">
            <Label htmlFor="unitCost">
              Unit Cost ($) <span className="text-red-500">*</span>
              {lastPaidPrice !== null && (
                <span className="ml-2 text-xs font-normal text-gray-500">
                  Last paid: ${lastPaidPrice.toFixed(2)}
                </span>
              )}
            </Label>
            <Input
              id="unitCost"
              type="number"
              step="0.01"
              min="0.01"
              placeholder="0.00"
              {...register('unitCost')}
            />
            {errors.unitCost && (
              <p className="text-xs text-red-600">{errors.unitCost.message}</p>
            )}
          </div>
        </div>

        {/* Cost variance warning */}
        {showCostWarning && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              This cost differs from the last paid price (${lastPaidPrice!.toFixed(2)}) by{' '}
              {(priceDelta * 100).toFixed(1)}%. Double-check before saving.
            </AlertDescription>
          </Alert>
        )}

        {/* Invoice Number */}
        <div className="space-y-1">
          <Label htmlFor="invoiceNumber">Invoice Number <span className="text-gray-400">(optional)</span></Label>
          <Input
            id="invoiceNumber"
            placeholder="INV-12345"
            {...register('invoiceNumber')}
          />
        </div>

        {/* Notes */}
        <div className="space-y-1">
          <Label htmlFor="notes">Notes <span className="text-gray-400">(optional)</span></Label>
          <Textarea
            id="notes"
            placeholder="Any notes about this receipt…"
            rows={3}
            {...register('notes')}
          />
        </div>

        {submitError && (
          <p className="text-sm text-red-600">{submitError}</p>
        )}

        <div className="flex justify-end">
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Saving…' : 'Save Receipt'}
          </Button>
        </div>
      </form>
    </div>
  );
}
