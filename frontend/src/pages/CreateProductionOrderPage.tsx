import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Plus, Trash2, AlertTriangle } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { LOCATIONS } from '@/lib/locations';
import { useFormDirty } from '@/context/FormDirtyContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Combobox } from '@/components/ui/combobox';

const schema = z.object({
  bomId: z.string().optional(),
  finishedGoodId: z.string().min(1, 'Finished good is required'),
  location: z.string().min(1, 'Location is required'),
  totalQuantity: z.coerce.number().int().min(1, 'Must be at least 1'),
  notes: z.string().optional(),
  components: z
    .array(
      z.object({
        itemId: z.string().min(1, 'Item is required'),
        quantityPer: z.coerce.number().min(0.0001, 'Must be > 0'),
      })
    )
    .min(1, 'At least one component is required'),
});

type FormValues = z.infer<typeof schema>;

type ItemOption = {
  id: number;
  itemCode: string;
  description: string;
  unitOfMeasure: string;
  itemType: string;
};

type BomOption = {
  id: number;
  bomCode: string;
  name: string;
  finishedGoodId: number;
  lines: { itemId: number; quantityPer: number; item: { itemCode: string; description: string } }[];
};

type StockPosition = {
  item: { id: number };
  qtyByLocation: Record<string, number>;
  availableByLocation: Record<string, number>;
};

export function CreateProductionOrderPage() {
  const navigate = useNavigate();
  const { setDirty: setFormDirty } = useFormDirty();

  const [items, setItems] = useState<ItemOption[]>([]);
  const [boms, setBoms] = useState<BomOption[]>([]);
  const [selectedBomDetail, setSelectedBomDetail] = useState<BomOption | null>(null);
  const [stockPositions, setStockPositions] = useState<StockPosition[]>([]);
  const [alert, setAlert] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingValues, setPendingValues] = useState<FormValues | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [userInteracted, setUserInteracted] = useState(false);

  const {
    register,
    control,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors, isDirty },
  } = useForm<FormValues>({
    resolver: zodResolver(schema) as any, // eslint-disable-line @typescript-eslint/no-explicit-any -- Zod v4 coerce types
    defaultValues: {
      bomId: '',
      finishedGoodId: '',
      location: '',
      totalQuantity: 1,
      notes: '',
      components: [],
    },
  });

  const { fields, append, remove, replace } = useFieldArray({ control, name: 'components' });

  const watchedLocation = watch('location');
  const watchedQuantity = watch('totalQuantity');
  const watchedComponents = watch('components');
  const watchedFinishedGoodId = watch('finishedGoodId');
  const watchedBomId = watch('bomId');

  // Dirty form tracking
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
      if (isDirty && userInteracted) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty, userInteracted]);

  // Load items, BOMs, stock
  useEffect(() => {
    Promise.all([
      api.get<{ items: ItemOption[] }>('/api/items?limit=1000&activeOnly=true'),
      api.get<{ boms: BomOption[] }>('/api/boms?status=ACTIVE&limit=200'),
      api.get<{ positions: StockPosition[] }>('/api/transactions/stock-position?limit=1000'),
    ]).then(([itemsRes, bomsRes, stockRes]) => {
      setItems(itemsRes.items);
      setBoms(bomsRes.boms);
      setStockPositions(stockRes.positions);
    });
  }, []);

  // Fetch full BOM detail and populate component lines
  async function loadBomTemplate(bomIdStr: string) {
    try {
      const detail = await api.get<{ bom: BomOption }>(`/api/boms/${bomIdStr}`);
      if (detail.bom?.lines) {
        setSelectedBomDetail(detail.bom);
        setValue('finishedGoodId', String(detail.bom.finishedGoodId));
        replace(
          detail.bom.lines.map((line) => ({
            itemId: String(line.itemId),
            quantityPer: Number(line.quantityPer),
          }))
        );
      }
    } catch {
      setSelectedBomDetail(null);
      replace([]);
    }
  }

  // When BOM is selected from dropdown
  function handleBomChange(bomIdStr: string) {
    setValue('bomId', bomIdStr);
    if (!bomIdStr) return;
    loadBomTemplate(bomIdStr);
  }

  // When finished good changes and matches a BOM, auto-select it
  useEffect(() => {
    if (!watchedFinishedGoodId || watchedBomId) return;
    const matchingBom = boms.find((b) => b.finishedGoodId === parseInt(watchedFinishedGoodId));
    if (matchingBom) {
      setValue('bomId', String(matchingBom.id));
      loadBomTemplate(String(matchingBom.id));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchedFinishedGoodId, watchedBomId, boms]);

  // Get available stock for a component at the selected location
  function getAvailable(itemId: string): number | null {
    if (!itemId || !watchedLocation) return null;
    const pos = stockPositions.find((p) => p.item.id === parseInt(itemId));
    if (!pos) return 0;
    return pos.availableByLocation?.[watchedLocation] ?? pos.qtyByLocation[watchedLocation] ?? 0;
  }

  // Calculate stock warnings
  const stockWarnings = watchedComponents
    .map((comp, idx) => {
      if (!comp.itemId) return null;
      const available = getAvailable(comp.itemId);
      const totalNeeded = (Number(comp.quantityPer) || 0) * (watchedQuantity || 0);
      if (available !== null && available < totalNeeded) {
        const item = items.find((i) => i.id === parseInt(comp.itemId));
        return {
          index: idx,
          itemCode: item?.itemCode ?? comp.itemId,
          required: totalNeeded,
          available,
          short: totalNeeded - available,
        };
      }
      return null;
    })
    .filter(Boolean);

  const finishedGoods = items.filter((i) => i.itemType === 'FINISHED');
  const componentItems = items.filter((i) => i.itemType !== 'FINISHED' || true); // All items can be components

  // Lookup BOM to identify locked components (uses fetched detail which includes lines)
  const bomItemIds = new Set(selectedBomDetail?.lines?.map((l) => l.itemId) ?? []);

  function onFormValid(values: FormValues) {
    setPendingValues(values);
    setConfirmOpen(true);
  }

  async function onConfirmed() {
    if (!pendingValues) return;
    setSubmitting(true);
    setAlert(null);
    try {
      const res = await api.post<{ order: { id: number; orderNumber: string }; warnings: unknown[] }>(
        '/api/production/orders',
        {
          finishedGoodId: parseInt(pendingValues.finishedGoodId),
          location: pendingValues.location,
          totalQuantity: pendingValues.totalQuantity,
          bomId: pendingValues.bomId ? parseInt(pendingValues.bomId) : null,
          components: pendingValues.components.map((c) => ({
            itemId: parseInt(c.itemId),
            quantityPer: c.quantityPer,
          })),
          notes: pendingValues.notes?.trim() || '',
        }
      );

      setUserInteracted(false);
      setFormDirty(false);
      reset();
      navigate(`/in-production/${res.order.id}`);
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Failed to create production order';
      setAlert({ type: 'error', message: msg });
    } finally {
      setSubmitting(false);
      setConfirmOpen(false);
      setPendingValues(null);
    }
  }

  const fgItem = watchedFinishedGoodId ? items.find((i) => i.id === parseInt(watchedFinishedGoodId)) : null;

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Create Production Order</h1>
        <p className="text-sm text-gray-500">Reserve components for staged production</p>
      </div>

      {alert && (
        <Alert variant={alert.type === 'error' ? 'destructive' : 'default'}>
          <AlertDescription>{alert.message}</AlertDescription>
        </Alert>
      )}

      <form onSubmit={handleSubmit(onFormValid)} className="space-y-6">
        {/* BOM + Finished Good + Location */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <Label>BOM Template (optional)</Label>
            <Select value={watchedBomId || ''} onValueChange={handleBomChange}>
              <SelectTrigger>
                <SelectValue placeholder="Select BOM..." />
              </SelectTrigger>
              <SelectContent>
                {boms.map((b) => (
                  <SelectItem key={b.id} value={String(b.id)}>
                    {b.bomCode} — {b.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>FG Part # *</Label>
            <Combobox
              options={finishedGoods.map((i) => ({
                value: String(i.id),
                label: i.itemCode,
                searchText: i.itemCode,
              }))}
              value={watchedFinishedGoodId}
              onValueChange={(v) => setValue('finishedGoodId', v)}
              placeholder="Select part #..."
              searchPlaceholder="Search part #..."
            />
            {errors.finishedGoodId && (
              <p className="text-sm text-red-600">{errors.finishedGoodId.message}</p>
            )}
          </div>
          <div>
            <Label>FG Description</Label>
            <Combobox
              options={finishedGoods.map((i) => ({
                value: String(i.id),
                label: i.description,
                searchText: i.description,
              }))}
              value={watchedFinishedGoodId}
              onValueChange={(v) => setValue('finishedGoodId', v)}
              placeholder="Select description..."
              searchPlaceholder="Search description..."
            />
          </div>

          <div>
            <Label>Location *</Label>
            <Select value={watchedLocation} onValueChange={(v) => setValue('location', v)}>
              <SelectTrigger>
                <SelectValue placeholder="Select location..." />
              </SelectTrigger>
              <SelectContent>
                {LOCATIONS.map((loc) => (
                  <SelectItem key={loc} value={loc}>
                    {loc}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.location && <p className="text-sm text-red-600">{errors.location.message}</p>}
          </div>

          <div>
            <Label>Quantity (# of units) *</Label>
            <Input
              type="number"
              min={1}
              step={1}
              {...register('totalQuantity')}
            />
            {errors.totalQuantity && (
              <p className="text-sm text-red-600">{errors.totalQuantity.message}</p>
            )}
            {fgItem && (
              <p className="text-xs text-gray-500 mt-1">
                Creates {watchedQuantity || 0} production line(s) of 1 {fgItem.unitOfMeasure} each
              </p>
            )}
          </div>
        </div>

        <div>
          <Label>Notes (optional)</Label>
          <Textarea {...register('notes')} placeholder="Build notes, batch reference, etc." />
        </div>

        {/* Components Table */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <Label className="text-base">Components (per unit)</Label>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => append({ itemId: '', quantityPer: 1 })}
            >
              <Plus className="mr-1 h-3 w-3" /> Add Component
            </Button>
          </div>

          {stockWarnings.length > 0 && (
            <Alert variant="destructive" className="mb-3">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                Insufficient stock for {stockWarnings.length} component(s). Order will still be
                created — lines will stay staged until stock arrives.
              </AlertDescription>
            </Alert>
          )}

          {errors.components?.root && (
            <p className="text-sm text-red-600 mb-2">{errors.components.root.message}</p>
          )}

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-36">Part #</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Qty / Unit</TableHead>
                <TableHead>Total Needed</TableHead>
                <TableHead>Available</TableHead>
                <TableHead className="w-[50px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {fields.map((field, index) => {
                const comp = watchedComponents[index];
                const available = comp ? getAvailable(comp.itemId) : null;
                const totalNeeded = (Number(comp?.quantityPer) || 0) * (watchedQuantity || 0);
                const isShort = available !== null && available < totalNeeded;
                const isBomLocked = comp && bomItemIds.has(parseInt(comp.itemId));

                return (
                  <TableRow key={field.id}>
                    <TableCell>
                      <Combobox
                        options={componentItems.map((i) => ({
                          value: String(i.id),
                          label: i.itemCode,
                          searchText: i.itemCode,
                        }))}
                        value={comp?.itemId || ''}
                        onValueChange={(v) => setValue(`components.${index}.itemId`, v)}
                        placeholder="Part #..."
                        searchPlaceholder="Search part #..."
                        triggerClassName="h-9"
                        disabled={!!isBomLocked}
                      />
                      {isBomLocked && (
                        <Badge variant="secondary" className="mt-1 text-xs">
                          BOM
                        </Badge>
                      )}
                      {errors.components?.[index]?.itemId && (
                        <p className="text-xs text-red-600">
                          {errors.components[index].itemId?.message}
                        </p>
                      )}
                    </TableCell>
                    <TableCell>
                      <Combobox
                        options={componentItems.map((i) => ({
                          value: String(i.id),
                          label: i.description,
                          searchText: i.description,
                        }))}
                        value={comp?.itemId || ''}
                        onValueChange={(v) => setValue(`components.${index}.itemId`, v)}
                        placeholder="Description..."
                        searchPlaceholder="Search description..."
                        triggerClassName="h-9"
                        disabled={!!isBomLocked}
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        step="any"
                        min={0.0001}
                        className="w-24"
                        {...register(`components.${index}.quantityPer`)}
                        disabled={!!isBomLocked}
                      />
                    </TableCell>
                    <TableCell className="text-sm">
                      {totalNeeded > 0 ? totalNeeded : '—'}
                    </TableCell>
                    <TableCell>
                      {available !== null ? (
                        <span className={isShort ? 'text-red-600 font-medium' : 'text-green-600'}>
                          {available}
                          {isShort && (
                            <span className="text-xs ml-1">(short {totalNeeded - available})</span>
                          )}
                        </span>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {!isBomLocked && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => remove(index)}
                        >
                          <Trash2 className="h-3 w-3 text-red-500" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
              {fields.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-gray-400 py-8">
                    {watchedBomId
                      ? 'Loading BOM components...'
                      : 'Select a BOM or add components manually'}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        <div className="flex justify-end gap-3">
          <Button type="button" variant="outline" onClick={() => navigate('/in-production')}>
            Cancel
          </Button>
          <Button type="submit" disabled={submitting || fields.length === 0}>
            {submitting ? 'Creating...' : 'Create Production Order'}
          </Button>
        </div>
      </form>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Create Production Order?"
        description={
          pendingValues
            ? `This will reserve components for ${pendingValues.totalQuantity} unit(s) of ${
                fgItem?.itemCode ?? ''
              } at ${pendingValues.location}. ${
                stockWarnings.length > 0
                  ? `Warning: ${stockWarnings.length} component(s) have insufficient stock.`
                  : ''
              }`
            : ''
        }
        confirmLabel={submitting ? 'Creating...' : 'Create Order'}
        onConfirm={onConfirmed}
      />
    </div>
  );
}
