import { useEffect, useState, useCallback } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { api, ApiError } from '@/lib/api';
import { LOCATIONS, type Location } from '@/lib/locations';
import { formatCurrency } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { useFormDirty } from '@/context/FormDirtyContext';
import { AdminAuthDialog } from '@/components/AdminAuthDialog';
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
import { Combobox } from '@/components/ui/combobox';

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
  qtyByLocation: Record<string, number>;
  availableByLocation: Record<string, number>;
  avgCost: number | null;
};

const componentSchema = z.object({
  itemId: z.string().min(1, 'Item is required'),
  quantityPer: z.coerce.number({ message: 'Required' }).positive('Must be > 0'),
  fromBom: z.boolean().default(false),
});

const kittingSchema = z.object({
  bomId: z.string().optional(),
  finishedGoodId: z.string().min(1, 'Finished good is required'),
  location: z.enum(LOCATIONS, { message: 'Location is required' }),
  quantityProduced: z.coerce.number({ message: 'Required' }).positive('Must be > 0'),
  notes: z.string().optional(),
  components: z.array(componentSchema).min(1, 'At least one component is required'),
});

type KittingFormValues = z.infer<typeof kittingSchema>;

export function KittingPage() {
  const { user } = useAuth();
  void user; // available for future admin-specific UI
  const [items, setItems] = useState<Item[]>([]);
  const [activeBoms, setActiveBoms] = useState<BomOption[]>([]);
  const [stockMap, setStockMap] = useState<Map<number, StockPosition>>(new Map());
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [adminAuthOpen, setAdminAuthOpen] = useState(false);
  const [adminAuthError, setAdminAuthError] = useState<string | null>(null);
  const [adminAuthSubmitting, setAdminAuthSubmitting] = useState(false);

  const form = useForm<KittingFormValues>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(kittingSchema) as any,
    defaultValues: {
      bomId: '',
      finishedGoodId: '',
      location: LOCATIONS[0],
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

  const { setDirty: setFormDirty } = useFormDirty();
  const [userInteracted, setUserInteracted] = useState(false);

  useEffect(() => {
    const sub = watch(() => setUserInteracted(true));
    return () => sub.unsubscribe();
  }, [watch]);

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (isDirty && userInteracted) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty, userInteracted]);

  useEffect(() => {
    setFormDirty(isDirty && userInteracted);
    return () => setFormDirty(false);
  }, [isDirty, userInteracted, setFormDirty]);

  // Auto-dismiss success message after 5 seconds
  useEffect(() => {
    if (!successMessage) return;
    const timer = setTimeout(() => setSuccessMessage(null), 5000);
    return () => clearTimeout(timer);
  }, [successMessage]);

  const watchedLocation = watch('location');
  const watchedComponents = watch('components');
  const watchedQtyProduced = watch('quantityProduced') || 0;

  // Load reference data
  useEffect(() => {
    async function loadData() {
      try {
        const [itemData, bomData] = await Promise.all([
          api.get<{ items: Item[] }>('/api/items'),
          api.get<{ boms: BomOption[] }>('/api/boms?status=ACTIVE&limit=200'),
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
          item: { id: number };
          qtyByLocation: Record<string, number>;
          availableByLocation: Record<string, number>;
          avgCost: number | null;
        }>;
      }>('/api/transactions/stock-position?limit=9999');
      const map = new Map<number, StockPosition>();
      for (const p of data.positions) {
        map.set(p.item.id, {
          itemId: p.item.id,
          qtyByLocation: p.qtyByLocation,
          availableByLocation: p.availableByLocation ?? p.qtyByLocation,
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
    setSubmitError(null);
    try {
      const data = await api.get<{ boms: BomOption[] }>(
        `/api/boms?finishedGoodId=${itemId}&status=ACTIVE&limit=1`
      );
      if (data.boms.length > 0) {
        const bom = data.boms[0];
        setValue('bomId', String(bom.id));
        await loadBomTemplate(String(bom.id));
      } else {
        setValue('bomId', '');
        replace([{ itemId: '', quantityPer: undefined as unknown as number, fromBom: false }]);
        setSubmitError('No active BOM found for this finished good. Select a BOM template or add components manually.');
      }
    } catch {
      setSubmitError('Failed to look up BOM for this item. Select a BOM template or add components manually.');
    }
  }

  function getAvailable(itemId: string): number | null {
    if (!itemId) return null;
    const pos = stockMap.get(parseInt(itemId));
    if (!pos) return 0;
    return pos.availableByLocation[watchedLocation] ?? 0;
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

  const watchedFgId = watch('finishedGoodId');
  const fgItem = items.find((i) => String(i.id) === watchedFgId);
  const fgIsWholeUnit = fgItem && ['EA', 'SET', 'PAIR'].includes(fgItem.unitOfMeasure.toUpperCase());

  function onFormValid(values: KittingFormValues) {
    // Enforce whole numbers for EA finished goods
    if (fgIsWholeUnit && !Number.isInteger(values.quantityProduced)) {
      setSubmitError(`${fgItem!.itemCode} is measured in ${fgItem!.unitOfMeasure} — quantity produced must be a whole number.`);
      return;
    }
    // Enforce whole numbers for EA component items
    for (const comp of values.components) {
      const item = items.find((i) => i.id === parseInt(comp.itemId));
      if (item && item.unitOfMeasure.toUpperCase() === 'EA' && !Number.isInteger(comp.quantityPer)) {
        setSubmitError(`${item.itemCode} is measured in EA — Qty Per must be a whole number.`);
        return;
      }
    }
    setSubmitError(null);
    setPendingValues(values);
    setConfirmOpen(true);
  }

  function buildKitPayload(values: KittingFormValues) {
    return {
      bomId: values.bomId ? parseInt(values.bomId) : undefined,
      finishedGoodId: parseInt(values.finishedGoodId),
      location: values.location,
      quantityProduced: values.quantityProduced,
      notes: values.notes?.trim() || '',
      components: values.components.map((c) => ({
        itemId: parseInt(c.itemId),
        quantityPer: c.quantityPer,
      })),
    };
  }

  function handleKitSuccess(data: { order: { orderNumber: string; totalCost: number; quantityProduced: number } }) {
    const fgCode = items.find((i) => String(i.id) === pendingValues?.finishedGoodId)?.itemCode ?? '';
    setSuccessMessage(
      `Kitting order ${data.order.orderNumber} created — ${data.order.quantityProduced} ${fgCode} produced, total cost ${formatCurrency(Number(data.order.totalCost))}.`
    );

    const prevLocation = pendingValues?.location ?? LOCATIONS[0];
    setUserInteracted(false);
    setFormDirty(false);
    reset({
      bomId: '',
      finishedGoodId: '',
      location: prevLocation,
      quantityProduced: '' as unknown as number,
      notes: '',
      components: [{ itemId: '', quantityPer: '' as unknown as number, fromBom: false }],
    });
    setPendingValues(null);
    void loadStock();
  }

  async function onConfirmed() {
    if (!pendingValues) return;
    setConfirmOpen(false);
    setSubmitError(null);
    setSuccessMessage(null);
    try {
      const data = await api.post<{
        order: { orderNumber: string; totalCost: number; quantityProduced: number };
      }>('/api/production/kit', buildKitPayload(pendingValues));

      handleKitSuccess(data);
    } catch (err) {
      if (err instanceof ApiError && err.data?.requiresApproval) {
        setAdminAuthError(null);
        setAdminAuthOpen(true);
      } else {
        setSubmitError(err instanceof ApiError ? err.message : 'Failed to create kitting order.');
      }
    }
  }

  async function handleAdminAuthorize(credentials: { username: string; password: string }) {
    if (!pendingValues) return;
    setAdminAuthSubmitting(true);
    setAdminAuthError(null);
    try {
      const encoded = btoa(`${credentials.username}:${credentials.password}`);
      const data = await api.post<{
        order: { orderNumber: string; totalCost: number; quantityProduced: number };
      }>('/api/production/kit', buildKitPayload(pendingValues), {
        'X-Admin-Authorization': `Basic ${encoded}`,
      });

      setAdminAuthOpen(false);
      handleKitSuccess(data);
    } catch (err) {
      if (err instanceof ApiError && err.data?.requiresApproval) {
        setAdminAuthError(err.message);
      } else {
        setAdminAuthOpen(false);
        setSubmitError(err instanceof ApiError ? err.message : 'Failed to create kitting order.');
      }
    } finally {
      setAdminAuthSubmitting(false);
    }
  }

  return (
    <div className="space-y-6 max-w-6xl">
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

          {/* Row 1: BOM Template + FG Part # + FG Description */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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
              <Label>FG Part # <span className="text-red-500">*</span></Label>
              <Combobox
                options={items.filter((i) => i.itemType === 'FINISHED').map((item) => ({
                  value: String(item.id),
                  label: item.itemCode,
                  searchText: item.itemCode,
                }))}
                value={watch('finishedGoodId')}
                onValueChange={(v) => void handleFinishedGoodChange(v)}
                placeholder="Select part #..."
                searchPlaceholder="Search part #..."
              />
              {errors.finishedGoodId && (
                <p className="text-xs text-red-600 animate-field-error">{errors.finishedGoodId.message}</p>
              )}
            </div>
            <div className="space-y-1">
              <Label>FG Description</Label>
              <Combobox
                options={items.filter((i) => i.itemType === 'FINISHED').map((item) => ({
                  value: String(item.id),
                  label: item.description,
                  searchText: item.description,
                }))}
                value={watch('finishedGoodId')}
                onValueChange={(v) => void handleFinishedGoodChange(v)}
                placeholder="Select description..."
                searchPlaceholder="Search description..."
              />
            </div>
          </div>

          {/* Row 2: Location + Quantity */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label>Location <span className="text-red-500">*</span></Label>
              <Select
                defaultValue={LOCATIONS[0]}
                onValueChange={(v) => setValue('location', v as Location)}
              >
                <SelectTrigger>
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

            <div className="space-y-1">
              <Label>Quantity Produced <span className="text-red-500">*</span></Label>
              <Input
                type="number"
                step="any"
                min="0.01"
                placeholder={fgIsWholeUnit ? '1' : '0.01'}
                {...register('quantityProduced', {
                  validate: (v) => {
                    if (fgIsWholeUnit && v !== undefined && v % 1 !== 0) {
                      return `${fgItem?.itemCode} is measured in ${fgItem?.unitOfMeasure} — quantity must be a whole number.`;
                    }
                    return true;
                  },
                })}
              />
              {errors.quantityProduced && (
                <p className="text-xs text-red-600 animate-field-error">{errors.quantityProduced.message}</p>
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
                  <TableHead className="w-36">Part #</TableHead>
                  <TableHead>Description</TableHead>
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
                        <Combobox
                          options={items
                            .filter((i) => i.itemType !== 'FINISHED' && String(i.id) !== watch('finishedGoodId'))
                            .map((item) => ({
                              value: String(item.id),
                              label: item.itemCode,
                              searchText: item.itemCode,
                            }))}
                          value={comp?.itemId || ''}
                          onValueChange={(v) => setValue(`components.${index}.itemId`, v)}
                          placeholder="Part #..."
                          searchPlaceholder="Search part #..."
                          triggerClassName="h-9"
                          disabled={isBomLocked}
                        />
                        {errors.components?.[index]?.itemId && (
                          <p className="text-xs text-red-600 mt-0.5">
                            {errors.components[index].itemId?.message}
                          </p>
                        )}
                      </TableCell>
                      <TableCell>
                        <Combobox
                          options={items
                            .filter((i) => i.itemType !== 'FINISHED' && String(i.id) !== watch('finishedGoodId'))
                            .map((item) => ({
                              value: String(item.id),
                              label: item.description,
                              searchText: item.description,
                            }))}
                          value={comp?.itemId || ''}
                          onValueChange={(v) => setValue(`components.${index}.itemId`, v)}
                          placeholder="Description..."
                          searchPlaceholder="Search description..."
                          triggerClassName="h-9"
                          disabled={isBomLocked}
                        />
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
                  <TableCell colSpan={7} className="text-right font-medium">
                    Total Cost
                  </TableCell>
                  <TableCell className="text-right font-mono font-bold">
                    {totalCost > 0 ? formatCurrency(totalCost) : '--'}
                  </TableCell>
                  <TableCell />
                </TableRow>
                {watchedQtyProduced > 0 && totalCost > 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-right text-sm text-gray-500">
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

      <AdminAuthDialog
        open={adminAuthOpen}
        onOpenChange={setAdminAuthOpen}
        description="Kitting operations require admin approval. Enter admin credentials to authorize this production order."
        onAuthorize={handleAdminAuthorize}
        isSubmitting={adminAuthSubmitting}
        error={adminAuthError}
      />
    </div>
  );
}
