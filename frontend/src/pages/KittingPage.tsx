import { useEffect, useState, useCallback } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { api, ApiError } from '@/lib/api';
import { formatCurrency } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Badge } from '@/components/ui/badge';
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
import { AlertTriangle, CheckCircle, Plus, X } from 'lucide-react';

type Item = { id: number; itemCode: string; description: string; unitOfMeasure: string; itemType?: string };

type BomOption = {
  id: number;
  bomCode: string;
  name: string;
  finishedGood: { id: number; itemCode: string; description: string };
};

type BomDetail = BomOption & {
  lines: Array<{
    itemId: number;
    quantityPer: number;
    item: { id: number; itemCode: string; description: string; unitOfMeasure: string };
  }>;
};

type StockPosition = {
  itemId: number;
  adelQty: number;
  calhounQty: number;
  avgCost: number | null;
};

const componentSchema = z.object({
  itemId: z.string().min(1, 'Item is required'),
  quantityPer: z.coerce.number({ invalid_type_error: 'Required' }).positive('Must be > 0'),
  fromBom: z.boolean().default(false),
});

const kittingSchema = z.object({
  bomId: z.string().optional(),
  finishedGoodId: z.string().min(1, 'Finished good is required'),
  location: z.enum(['ADEL', 'CALHOUN'], { required_error: 'Location is required' }),
  quantityProduced: z.coerce.number({ invalid_type_error: 'Required' }).positive('Must be > 0'),
  notes: z.string().optional(),
  components: z.array(componentSchema).min(1, 'At least one component is required'),
});

type KittingFormValues = z.infer<typeof kittingSchema>;

export function KittingPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [activeBoms, setActiveBoms] = useState<BomOption[]>([]);
  const [stockMap, setStockMap] = useState<Map<number, StockPosition>>(new Map());
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const form = useForm<KittingFormValues>({
    resolver: zodResolver(kittingSchema),
    defaultValues: {
      bomId: '',
      finishedGoodId: '',
      location: 'ADEL',
      quantityProduced: undefined as unknown as number,
      notes: '',
      components: [{ itemId: '', quantityPer: undefined as unknown as number, fromBom: false }],
    },
  });

  const { fields, append, remove, replace } = useFieldArray({
    control: form.control,
    name: 'components',
  });

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors, isSubmitting, isDirty },
  } = form;

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingValues, setPendingValues] = useState<KittingFormValues | null>(null);

  // Warn before browser close/refresh if form is dirty
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);

  const watchedLocation = watch('location');
  const watchedComponents = watch('components');
  const watchedQtyProduced = watch('quantityProduced') || 0;

  // Load reference data
  useEffect(() => {
    async function loadData() {
      try {
        const [itemData, bomData] = await Promise.all([
          api.get<{ items: Item[] }>('/api/items'),
          api.get<{ boms: BomOption[] }>('/api/boms?status=ACTIVE&limit=500'),
        ]);
        setItems(itemData.items);
        setActiveBoms(bomData.boms);
      } catch {
        // non-fatal
      }
    }
    loadData();
  }, []);

  // Load stock positions
  const loadStock = useCallback(async () => {
    try {
      const data = await api.get<{
        positions: Array<{
          id: number;
          adelQty: number;
          calhounQty: number;
          avgCost: number | null;
        }>;
      }>('/api/transactions/stock-position?limit=9999');
      const map = new Map<number, StockPosition>();
      for (const p of data.positions) {
        map.set(p.id, {
          itemId: p.id,
          adelQty: p.adelQty,
          calhounQty: p.calhounQty,
          avgCost: p.avgCost,
        });
      }
      setStockMap(map);
    } catch {
      // non-fatal
    }
  }, []);

  useEffect(() => {
    loadStock();
  }, [loadStock]);

  // Load BOM template by BOM ID
  async function loadBomTemplate(bomId: string) {
    if (!bomId) return;
    try {
      const data = await api.get<{ bom: BomDetail }>(`/api/boms/${bomId}`);
      const bom = data.bom;
      setValue('finishedGoodId', String(bom.finishedGood.id));
      replace(
        bom.lines.map((l) => ({
          itemId: String(l.itemId),
          quantityPer: l.quantityPer,
          fromBom: true,
        }))
      );
    } catch {
      // non-fatal
    }
  }

  // When user selects a finished good directly, auto-load its active BOM
  async function handleFinishedGoodChange(itemId: string) {
    setValue('finishedGoodId', itemId);
    try {
      const data = await api.get<{ boms: BomOption[] }>(
        `/api/boms?finishedGoodId=${itemId}&status=ACTIVE&limit=1`
      );
      if (data.boms.length > 0) {
        const bom = data.boms[0];
        setValue('bomId', String(bom.id));
        await loadBomTemplate(String(bom.id));
      }
    } catch {
      // non-fatal — no active BOM for this item, user adds components manually
    }
  }

  function getAvailable(itemId: string): number | null {
    if (!itemId) return null;
    const pos = stockMap.get(parseInt(itemId));
    if (!pos) return 0;
    return watchedLocation === 'ADEL' ? pos.adelQty : pos.calhounQty;
  }

  function getAvgCost(itemId: string): number | null {
    if (!itemId) return null;
    const pos = stockMap.get(parseInt(itemId));
    return pos?.avgCost ?? null;
  }

  // Check if any component has insufficient stock
  const insufficientLines: number[] = [];
  let totalCost = 0;

  const componentSummary = watchedComponents.map((comp, index) => {
    const qtyPer = Number(comp.quantityPer) || 0;
    const required = qtyPer * watchedQtyProduced;
    const available = getAvailable(comp.itemId);
    const avgCost = getAvgCost(comp.itemId);
    const lineCost = avgCost !== null ? required * avgCost : null;

    if (lineCost !== null) totalCost += lineCost;
    if (available !== null && required > 0 && available < required) {
      insufficientLines.push(index);
    }

    return { required, available, avgCost, lineCost };
  });

  const unitCost = watchedQtyProduced > 0 ? totalCost / watchedQtyProduced : 0;
  const hasInsufficientStock = insufficientLines.length > 0;

  function onFormValid(values: KittingFormValues) {
    setPendingValues(values);
    setConfirmOpen(true);
  }

  async function onConfirmed() {
    if (!pendingValues) return;
    setConfirmOpen(false);
    setSubmitError(null);
    setSuccessMessage(null);
    try {
      const data = await api.post<{
        order: { orderNumber: string; totalCost: number; quantityProduced: number };
      }>('/api/production/kit', {
        bomId: pendingValues.bomId ? parseInt(pendingValues.bomId) : undefined,
        finishedGoodId: parseInt(pendingValues.finishedGoodId),
        location: pendingValues.location,
        quantityProduced: pendingValues.quantityProduced,
        notes: pendingValues.notes || undefined,
        components: pendingValues.components.map((c) => ({
          itemId: parseInt(c.itemId),
          quantityPer: c.quantityPer,
        })),
      });

      setSuccessMessage(
        `Kitting order ${data.order.orderNumber} created successfully. ` +
        `Produced ${data.order.quantityProduced} unit(s), total cost ${formatCurrency(Number(data.order.totalCost))}.`
      );

      const prevLocation = pendingValues.location;
      reset({
        bomId: '',
        finishedGoodId: '',
        location: prevLocation,
        quantityProduced: undefined as unknown as number,
        notes: '',
        components: [{ itemId: '', quantityPer: undefined as unknown as number, fromBom: false }],
      });
      setPendingValues(null);

      // Refresh stock after production
      void loadStock();
    } catch (err) {
      setSubmitError(err instanceof ApiError ? err.message : 'Failed to create kitting order.');
    }
  }

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Kitting / Production</h1>
        <p className="mt-1 text-sm text-gray-500">
          Record production by consuming components into finished goods.
        </p>
      </div>

      {successMessage && (
        <Alert className="border-green-200 bg-green-50">
          <CheckCircle className="h-4 w-4 text-green-600" />
          <AlertDescription className="text-green-800">{successMessage}</AlertDescription>
        </Alert>
      )}

      <form onSubmit={handleSubmit(onFormValid)} className="space-y-6">
        {/* ====== TEMPLATE + HEADER ====== */}
        <div className="rounded-lg border bg-white p-4 space-y-4">
          <h2 className="text-sm font-medium text-gray-700">Production Details</h2>

          {/* Row 1: BOM Template + Finished Good */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label>BOM Template <span className="text-gray-400">(optional)</span></Label>
              <Select
                onValueChange={(v) => {
                  setValue('bomId', v);
                  void loadBomTemplate(v);
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Load from BOM..." />
                </SelectTrigger>
                <SelectContent>
                  {activeBoms.map((bom) => (
                    <SelectItem key={bom.id} value={String(bom.id)}>
                      {bom.bomCode} — {bom.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label>Finished Good <span className="text-red-500">*</span></Label>
              <Select
                value={watch('finishedGoodId')}
                onValueChange={(v) => void handleFinishedGoodChange(v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select finished good..." />
                </SelectTrigger>
                <SelectContent>
                  {items.filter((i) => i.itemType === 'FINISHED').map((item) => (
                    <SelectItem key={item.id} value={String(item.id)}>
                      {item.itemCode} — {item.description}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.finishedGoodId && (
                <p className="text-xs text-red-600">{errors.finishedGoodId.message}</p>
              )}
            </div>
          </div>

          {/* Row 2: Location + Quantity */}
          <div className="grid grid-cols-2 gap-4">
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

            <div className="space-y-1">
              <Label>Quantity Produced <span className="text-red-500">*</span></Label>
              <Input
                type="number"
                step="1"
                min="1"
                placeholder="1"
                {...register('quantityProduced')}
              />
              {errors.quantityProduced && (
                <p className="text-xs text-red-600">{errors.quantityProduced.message}</p>
              )}
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-1">
            <Label>Notes <span className="text-gray-400">(optional)</span></Label>
            <Textarea
              placeholder="Build notes, custom modifications..."
              rows={2}
              {...register('notes')}
            />
          </div>
        </div>

        {/* ====== COMPONENTS TABLE ====== */}
        <div className="rounded-lg border bg-white p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium text-gray-700">Components</h2>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => append({ itemId: '', quantityPer: undefined as unknown as number, fromBom: false })}
            >
              <Plus className="h-4 w-4 mr-1" />
              Add Component
            </Button>
          </div>

          {(() => {
            const extraCount = watchedComponents?.filter((c) => !c.fromBom && c.itemId).length ?? 0;
            const hasBom = !!watch('bomId');
            if (hasBom && extraCount > 0) {
              return (
                <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  This kit includes {extraCount} extra component{extraCount !== 1 ? 's' : ''} not in the BOM template. These will be tracked as deviations.
                </div>
              );
            }
            return null;
          })()}

          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">#</TableHead>
                  <TableHead>Component Item</TableHead>
                  <TableHead className="w-24">Qty/Unit</TableHead>
                  <TableHead className="w-24 text-right">Required</TableHead>
                  <TableHead className="w-28 text-right">Available</TableHead>
                  <TableHead className="w-24 text-right">Unit Cost</TableHead>
                  <TableHead className="w-28 text-right">Line Total</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {fields.map((field, index) => {
                  const comp = watchedComponents?.[index];
                  const isBomLocked = comp?.fromBom === true;
                  const isExtra = !comp?.fromBom && !!comp?.itemId;
                  const summary = componentSummary[index];
                  const isInsufficient = insufficientLines.includes(index);
                  return (
                    <TableRow key={field.id} className={isExtra ? 'bg-amber-50' : ''}>
                      <TableCell className="text-gray-400 text-sm">
                        <div className="flex items-center gap-1">
                          {index + 1}
                          {isExtra && (
                            <Badge variant="outline" className="text-[10px] px-1 py-0 border-amber-300 text-amber-700 bg-amber-100">
                              Extra
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Select
                          value={comp?.itemId || ''}
                          onValueChange={(v) => setValue(`components.${index}.itemId`, v)}
                          disabled={isBomLocked}
                        >
                          <SelectTrigger className={`h-9 ${isBomLocked ? 'opacity-75 bg-gray-50' : ''}`}>
                            <SelectValue placeholder="Select component..." />
                          </SelectTrigger>
                          <SelectContent>
                            {items
                              .filter((i) => i.itemType !== 'FINISHED' && String(i.id) !== watch('finishedGoodId'))
                              .map((item) => (
                                <SelectItem key={item.id} value={String(item.id)}>
                                  {item.itemCode} — {item.description}
                                </SelectItem>
                              ))}
                          </SelectContent>
                        </Select>
                        {errors.components?.[index]?.itemId && (
                          <p className="text-xs text-red-600 mt-0.5">
                            {errors.components[index].itemId?.message}
                          </p>
                        )}
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          step="0.0001"
                          min="0.0001"
                          placeholder="1"
                          className={`h-9 ${isBomLocked ? 'opacity-75 bg-gray-50' : ''}`}
                          disabled={isBomLocked}
                          {...register(`components.${index}.quantityPer`)}
                        />
                        {errors.components?.[index]?.quantityPer && (
                          <p className="text-xs text-red-600 mt-0.5">
                            {errors.components[index].quantityPer?.message}
                          </p>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {summary?.required > 0 ? summary.required : '--'}
                      </TableCell>
                      <TableCell className="text-right text-sm">
                        {summary?.available !== null ? (
                          <span className={isInsufficient ? 'text-red-600 font-medium' : 'text-green-600'}>
                            {summary.available}
                            {isInsufficient ? ' !' : ''}
                          </span>
                        ) : '--'}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {summary?.avgCost !== null ? formatCurrency(summary.avgCost) : '--'}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {summary?.lineCost !== null && summary.lineCost > 0
                          ? formatCurrency(summary.lineCost)
                          : '--'}
                      </TableCell>
                      <TableCell>
                        {fields.length > 1 && !isBomLocked && (
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
                  <TableCell colSpan={6} className="text-right font-medium">
                    Total Cost
                  </TableCell>
                  <TableCell className="text-right font-mono font-bold">
                    {totalCost > 0 ? formatCurrency(totalCost) : '--'}
                  </TableCell>
                  <TableCell />
                </TableRow>
                {watchedQtyProduced > 0 && totalCost > 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-right text-sm text-gray-500">
                      Cost Per Unit
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm text-gray-500">
                      {formatCurrency(unitCost)}
                    </TableCell>
                    <TableCell />
                  </TableRow>
                )}
              </TableFooter>
            </Table>
          </div>

          {hasInsufficientStock && (
            <Alert variant="destructive" className="py-2">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                Insufficient stock for {insufficientLines.length} component(s) at {watchedLocation}.
                Adjust quantities or change location before submitting.
              </AlertDescription>
            </Alert>
          )}
        </div>

        {submitError && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>{submitError}</AlertDescription>
          </Alert>
        )}

        <div className="flex items-center justify-between">
          <div className="text-sm text-gray-500">
            {fields.length} component{fields.length !== 1 ? 's' : ''}
            {totalCost > 0 && (
              <>
                {' '}&middot; Total: <span className="font-medium">{formatCurrency(totalCost)}</span>
              </>
            )}
          </div>
          <Button type="submit" disabled={isSubmitting || hasInsufficientStock}>
            {isSubmitting ? 'Processing...' : 'Submit Kitting Order'}
          </Button>
        </div>
      </form>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Confirm Kitting Order"
        confirmLabel="Submit Kitting Order"
        description={
          pendingValues && (
            <div className="space-y-1 text-sm">
              <p><span className="font-medium">Finished Good:</span> {items.find((i) => String(i.id) === pendingValues.finishedGoodId)?.itemCode ?? '--'}</p>
              {pendingValues.bomId && (
                <p><span className="font-medium">BOM:</span> {activeBoms.find((b) => String(b.id) === pendingValues.bomId)?.bomCode ?? '--'}</p>
              )}
              <p><span className="font-medium">Quantity:</span> {pendingValues.quantityProduced}</p>
              <p><span className="font-medium">Location:</span> {pendingValues.location}</p>
              <p><span className="font-medium">Components:</span> {pendingValues.components.length}</p>
              {totalCost > 0 && (
                <p><span className="font-medium">Est. Total Cost:</span> {formatCurrency(totalCost)}</p>
              )}
            </div>
          )
        }
        onConfirm={onConfirmed}
      />
    </div>
  );
}
