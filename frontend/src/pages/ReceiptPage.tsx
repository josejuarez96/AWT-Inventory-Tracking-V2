import { useEffect, useState, useMemo } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { api } from '@/lib/api';
import { useAuthContext } from '@/context/AuthContext';
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
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { AlertTriangle, CheckCircle, Plus, X, Clock } from 'lucide-react';
import { Combobox } from '@/components/ui/combobox';

type Vendor = { id: number; vendorCode: string; vendorName: string };
type Item = { id: number; itemCode: string; description: string; category?: string; unitOfMeasure: string; lastPurchaseCost: number | null };

const lineItemSchema = z.object({
  itemId: z.string().min(1, 'Item is required'),
  quantity: z.coerce.number({ invalid_type_error: 'Required' }).positive('Must be > 0'),
  unitCost: z.coerce.number({ invalid_type_error: 'Required' }).positive('Must be > 0'),
});

const receiptSchema = z.object({
  vendorId: z.string().min(1, 'Vendor is required'),
  location: z.enum(['ADEL', 'CALHOUN'], { required_error: 'Location is required' }),
  transactionDate: z.string().min(1, 'Date is required'),
  invoiceNumber: z.string().optional(),
  notes: z.string().optional(),
  lineItems: z.array(lineItemSchema).min(1, 'At least one line item is required'),
});

type ReceiptFormValues = z.infer<typeof receiptSchema>;

// ---------------------------------------------------------------------------
// Date validation helpers
// ---------------------------------------------------------------------------
const WARN_DAYS = 7;
const MAX_DAYS = 30;

function toLocalDateStr(d: Date) {
  return d.toISOString().split('T')[0];
}

/** How many days ago is this date string (negative = future)? */
function daysAgo(dateStr: string): number {
  const d = new Date(dateStr + 'T00:00:00');
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.floor((now.getTime() - d.getTime()) / 86_400_000);
}

type DateStatus = 'ok' | 'warn' | 'blocked-role' | 'blocked-hard' | 'future';

function getDateStatus(dateStr: string, isAdmin: boolean): DateStatus {
  if (!dateStr) return 'ok';
  const age = daysAgo(dateStr);
  if (age < 0) return 'future';
  if (age > MAX_DAYS) return 'blocked-hard';
  if (age > WARN_DAYS && !isAdmin) return 'blocked-role';
  if (age > WARN_DAYS && isAdmin) return 'warn';
  return 'ok';
}

export function ReceiptPage() {
  const { user } = useAuthContext();
  const isAdmin = user?.role === 'admin';

  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [lastPaidPrices, setLastPaidPrices] = useState<Record<number, number | null>>({});
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const form = useForm<ReceiptFormValues>({
    resolver: zodResolver(receiptSchema),
    defaultValues: {
      vendorId: '',
      location: 'ADEL',
      transactionDate: new Date().toISOString().split('T')[0],
      invoiceNumber: '',
      notes: '',
      lineItems: [{ itemId: '', quantity: undefined as unknown as number, unitCost: undefined as unknown as number }],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'lineItems',
  });

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = form;

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
        // non-fatal
      }
    }
    loadData();
  }, []);

  // Preload last paid prices from items data
  useEffect(() => {
    const priceMap: Record<number, number | null> = {};
    for (const item of items) {
      priceMap[item.id] = item.lastPurchaseCost;
    }
    setLastPaidPrices((prev) => ({ ...prev, ...priceMap }));
  }, [items]);

  // Date validation
  const watchedDate = watch('transactionDate');
  const dateStatus = useMemo(() => getDateStatus(watchedDate, isAdmin), [watchedDate, isAdmin]);
  const todayStr = toLocalDateStr(new Date());
  const dateBlocked = dateStatus === 'future' || dateStatus === 'blocked-hard' || dateStatus === 'blocked-role';

  // Compute line totals and receipt total
  const watchedLines = watch('lineItems');

  // Build item lookup map for UOM checks
  const itemMap = useMemo(() => {
    const map = new Map<string, Item>();
    for (const item of items) map.set(String(item.id), item);
    return map;
  }, [items]);

  function isWholeUnitItem(index: number): boolean {
    const itemId = watchedLines[index]?.itemId;
    if (!itemId) return false;
    const uom = itemMap.get(itemId)?.unitOfMeasure;
    return uom === 'EA' || uom === 'SET' || uom === 'PAIR';
  }
  const lineTotals = watchedLines.map((li) => {
    const qty = Number(li.quantity) || 0;
    const cost = Number(li.unitCost) || 0;
    return qty * cost;
  });
  const receiptTotal = lineTotals.reduce((sum, lt) => sum + lt, 0);

  // Price variance check per line
  function getVariance(index: number) {
    const li = watchedLines[index];
    if (!li?.itemId || !li?.unitCost) return null;
    const itemId = parseInt(li.itemId);
    const lastPaid = lastPaidPrices[itemId];
    if (lastPaid === null || lastPaid === undefined) return null;
    const cost = Number(li.unitCost);
    if (!cost) return null;
    const delta = Math.abs((cost - lastPaid) / lastPaid);
    if (delta <= 0.1) return null;
    return { delta, lastPaid };
  }

  function getLastPaid(index: number) {
    const li = watchedLines[index];
    if (!li?.itemId) return null;
    const itemId = parseInt(li.itemId);
    return lastPaidPrices[itemId] ?? null;
  }

  async function onSubmit(values: ReceiptFormValues) {
    setSubmitError(null);
    setSuccessMessage(null);
    try {
      const data = await api.post<{
        transactions: Array<{ id: number }>;
        lastPaidPrices: Record<number, number | null>;
      }>('/api/transactions/receipts/batch', {
        vendorId: parseInt(values.vendorId),
        location: values.location,
        transactionDate: values.transactionDate,
        invoiceNumber: values.invoiceNumber || undefined,
        notes: values.notes || undefined,
        lineItems: values.lineItems.map((li) => ({
          itemId: parseInt(li.itemId),
          quantity: li.quantity,
          unitCost: li.unitCost,
        })),
      });

      setLastPaidPrices(data.lastPaidPrices);
      const count = data.transactions.length;
      setSuccessMessage(
        `Receipt saved: ${count} item${count !== 1 ? 's' : ''} received successfully.`
      );

      const prevLocation = values.location;
      form.reset({
        vendorId: '',
        location: prevLocation,
        transactionDate: new Date().toISOString().split('T')[0],
        invoiceNumber: '',
        notes: '',
        lineItems: [{ itemId: '', quantity: undefined as unknown as number, unitCost: undefined as unknown as number }],
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to save receipt.';
      setSubmitError(message);
    }
  }

  const formatCurrency = (val: number) =>
    `$${val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">New Receipt</h1>
        <p className="mt-1 text-sm text-gray-500">
          Record inventory received from a vendor. Add multiple items per receipt.
        </p>
      </div>

      {successMessage && (
        <Alert className="border-green-200 bg-green-50">
          <CheckCircle className="h-4 w-4 text-green-600" />
          <AlertDescription className="text-green-800">{successMessage}</AlertDescription>
        </Alert>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {/* ====== HEADER SECTION ====== */}
        <div className="rounded-lg border bg-white p-4 space-y-4">
          <h2 className="text-sm font-medium text-gray-700">Receipt Details</h2>

          {/* Row 1: Vendor + Location */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label>Vendor <span className="text-red-500">*</span></Label>
              <Combobox
                options={vendors.map((v) => ({
                  value: String(v.id),
                  label: v.vendorName,
                  searchText: `${v.vendorCode} ${v.vendorName}`,
                }))}
                value={watch('vendorId')}
                onValueChange={(v) => setValue('vendorId', v)}
                placeholder="Search vendors..."
                searchPlaceholder="Type to search vendors..."
              />
              {errors.vendorId && (
                <p className="text-xs text-red-600">{errors.vendorId.message}</p>
              )}
            </div>

            <div className="space-y-1">
              <Label>Location <span className="text-red-500">*</span></Label>
              <Select
                defaultValue="ADEL"
                onValueChange={(v) => setValue('location', v as 'ADEL' | 'CALHOUN')}
              >
                <SelectTrigger>
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
          </div>

          {/* Row 2: Date + Invoice */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label>Date <span className="text-red-500">*</span></Label>
              <Input type="date" max={todayStr} {...register('transactionDate')} />
              {errors.transactionDate && (
                <p className="text-xs text-red-600">{errors.transactionDate.message}</p>
              )}
              {dateStatus === 'future' && (
                <p className="text-xs text-red-600">Future dates are not allowed.</p>
              )}
              {dateStatus === 'blocked-hard' && (
                <p className="text-xs text-red-600">Cannot post receipts older than {MAX_DAYS} days.</p>
              )}
              {dateStatus === 'blocked-role' && (
                <p className="text-xs text-red-600">
                  Dates older than {WARN_DAYS} days must be posted by an admin. Ask your admin to log in and enter this receipt.
                </p>
              )}
              {dateStatus === 'warn' && (
                <div className="flex items-center gap-1 mt-1">
                  <Clock className="h-3 w-3 text-amber-500" />
                  <p className="text-xs text-amber-600">
                    This date is over {WARN_DAYS} days ago. Verify this is correct before saving.
                  </p>
                </div>
              )}
            </div>

            <div className="space-y-1">
              <Label>Invoice Number <span className="text-gray-400">(optional)</span></Label>
              <Input placeholder="INV-12345" {...register('invoiceNumber')} />
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-1">
            <Label>Notes <span className="text-gray-400">(optional)</span></Label>
            <Textarea
              placeholder="Any notes about this receipt..."
              rows={2}
              {...register('notes')}
            />
          </div>
        </div>

        {/* ====== LINE ITEMS SECTION ====== */}
        <div className="rounded-lg border bg-white p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium text-gray-700">Line Items</h2>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => append({ itemId: '', quantity: undefined as unknown as number, unitCost: undefined as unknown as number })}
            >
              <Plus className="h-4 w-4 mr-1" />
              Add Line
            </Button>
          </div>

          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">#</TableHead>
                  <TableHead>Item</TableHead>
                  <TableHead className="w-28">Qty</TableHead>
                  <TableHead className="w-32">Unit Cost ($)</TableHead>
                  <TableHead className="w-28 text-right">Line Total</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {fields.map((field, index) => {
                  const variance = getVariance(index);
                  return (
                    <TableRow key={field.id} className={variance ? 'border-b-0' : undefined}>
                      <TableCell className="text-gray-400 text-sm">{index + 1}</TableCell>
                      <TableCell>
                        <Combobox
                          options={items.map((item) => ({
                            value: String(item.id),
                            label: `${item.itemCode} — ${item.description}`,
                            searchText: `${item.itemCode} ${item.description} ${item.category ?? ''}`,
                          }))}
                          value={watchedLines[index]?.itemId}
                          onValueChange={(v) => setValue(`lineItems.${index}.itemId`, v)}
                          placeholder="Search items..."
                          searchPlaceholder="Type code or description..."
                          triggerClassName="h-9"
                        />
                        {errors.lineItems?.[index]?.itemId && (
                          <p className="text-xs text-red-600 mt-0.5">{errors.lineItems[index].itemId?.message}</p>
                        )}
                      </TableCell>
                      <TableCell>
                        {(() => {
                          const wholeUnit = isWholeUnitItem(index);
                          return (
                            <Input
                              type="number"
                              step={wholeUnit ? '1' : '0.01'}
                              min={wholeUnit ? '1' : '0.01'}
                              placeholder={wholeUnit ? '0' : '0.00'}
                              className="h-9"
                              {...register(`lineItems.${index}.quantity`, {
                                validate: (v) => {
                                  if (wholeUnit && v !== undefined && v % 1 !== 0) {
                                    return 'Whole numbers only for this item';
                                  }
                                  return true;
                                },
                              })}
                            />
                          );
                        })()}
                        {errors.lineItems?.[index]?.quantity && (
                          <p className="text-xs text-red-600 mt-0.5">{errors.lineItems[index].quantity?.message}</p>
                        )}
                      </TableCell>
                      <TableCell className="align-top">
                        <Input
                          type="number"
                          step="0.01"
                          min="0.01"
                          placeholder="0.00"
                          className="h-9"
                          {...register(`lineItems.${index}.unitCost`)}
                        />
                        {(() => {
                          const lp = getLastPaid(index);
                          return lp !== null ? (
                            <p className="text-xs text-gray-400 mt-0.5 leading-none">Last: {formatCurrency(lp)}</p>
                          ) : null;
                        })()}
                        {errors.lineItems?.[index]?.unitCost && (
                          <p className="text-xs text-red-600 mt-0.5">{errors.lineItems[index].unitCost?.message}</p>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {lineTotals[index] > 0 ? formatCurrency(lineTotals[index]) : '--'}
                      </TableCell>
                      <TableCell>
                        {fields.length > 1 && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => remove(index)}
                          >
                            <X className="h-4 w-4 text-gray-400" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell colSpan={4} className="text-right font-medium">
                    Receipt Total
                  </TableCell>
                  <TableCell className="text-right font-mono font-bold">
                    {receiptTotal > 0 ? formatCurrency(receiptTotal) : '--'}
                  </TableCell>
                  <TableCell />
                </TableRow>
              </TableFooter>
            </Table>
          </div>

          {/* Per-line variance warnings */}
          {watchedLines.map((_, index) => {
            const variance = getVariance(index);
            if (!variance) return null;
            return (
              <Alert key={index} variant="destructive" className="py-2">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  Line {index + 1}: Unit cost differs from last paid ({formatCurrency(variance.lastPaid)}) by{' '}
                  {(variance.delta * 100).toFixed(1)}%. Double-check before saving.
                </AlertDescription>
              </Alert>
            );
          })}
        </div>

        {submitError && (
          <p className="text-sm text-red-600">{submitError}</p>
        )}

        <div className="flex justify-end">
          <Button type="submit" disabled={isSubmitting || dateBlocked}>
            {isSubmitting
              ? 'Saving...'
              : `Save Receipt (${fields.length} item${fields.length !== 1 ? 's' : ''})`
            }
          </Button>
        </div>
      </form>
    </div>
  );
}
