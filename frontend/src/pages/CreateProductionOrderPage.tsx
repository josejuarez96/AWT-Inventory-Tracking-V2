import { useState, useEffect, useRef } from 'react';
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
import {
  OptionSelectorSidebar,
  type OptionGroup,
  type Selection,
} from '@/components/OptionSelectorSidebar';
import { formatCutDescription, formatConsumption, formatEffectiveQtyTooltip } from '@/lib/cutDisplay';
import { RepeatOrderDialog, type RepeatOrderConfig } from '@/components/RepeatOrderDialog';

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

type ResolvedComponent = {
  itemId: number;
  itemCode: string;
  description: string;
  unitOfMeasure: string;
  quantityPer: number;
  scrapPercent: number | null;
  cutDetails: unknown;
  effectiveQty: number;
  unitCost: number;
  source: string;
};

type ResolvedData = {
  resolved: ResolvedComponent[];
  changes: string[];
  selections: { groupId: number; groupName: string; packageId: number | null; packageName: string; quantity: number; allowQuantity: boolean }[];
  warnings: string[];
  errors: string[];
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

  // ── Option state ─────────────────────────────────────────────────
  const [optionGroups, setOptionGroups] = useState<OptionGroup[]>([]);
  const [selections, setSelections] = useState<Selection[]>([]);
  const [vinReference, setVinReference] = useState('');
  const [isResolving, setIsResolving] = useState(false);
  const [resolvedData, setResolvedData] = useState<ResolvedData | null>(null);
  const [repeatDialogOpen, setRepeatDialogOpen] = useState(false);
  const resolveDebounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const isResolutionUpdate = useRef(false);

  const hasOptions = optionGroups.length > 0;
  const isConfigured = hasOptions && resolvedData !== null;

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

  // Dirty form tracking (suppress resolution-driven updates)
  useEffect(() => {
    const sub = watch(() => {
      if (!isResolutionUpdate.current) setUserInteracted(true);
    });
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

  // ── Resolution helpers ──────────────────────────────────────────

  async function resolveWithSelections(bomId: string, sels: Selection[]) {
    setIsResolving(true);
    try {
      const payload = sels.map(s => ({
        packageId: s.packageId,
        groupId: s.groupId,
        quantity: s.quantity,
      }));

      const result = await api.post<ResolvedData>(`/api/boms/${bomId}/resolve`, {
        selections: payload,
      });

      setResolvedData(result);

      isResolutionUpdate.current = true;
      replace(
        result.resolved.map(r => ({
          itemId: String(r.itemId),
          quantityPer: r.effectiveQty,
        }))
      );
      requestAnimationFrame(() => {
        isResolutionUpdate.current = false;
      });
    } catch (err) {
      if (err instanceof ApiError) {
        setAlert({ type: 'error', message: err.message });
      }
    } finally {
      setIsResolving(false);
    }
  }

  function handleSelectionsChange(newSelections: Selection[]) {
    setSelections(newSelections);
    if (resolveDebounceRef.current) {
      clearTimeout(resolveDebounceRef.current);
    }
    const bomId = watchedBomId;
    if (bomId) {
      resolveDebounceRef.current = setTimeout(() => {
        void resolveWithSelections(bomId, newSelections);
      }, 300);
    }
  }

  // ── BOM Loading ──────────────────────────────────────────────────

  async function loadBomTemplate(bomIdStr: string, initialSelections?: Selection[]) {
    try {
      const detail = await api.get<{ bom: BomOption }>(`/api/boms/${bomIdStr}`);
      if (!detail.bom?.lines) return;
      setSelectedBomDetail(detail.bom);
      setValue('finishedGoodId', String(detail.bom.finishedGoodId));

      // Fetch option groups
      const optRes = await api.get<{ groups: OptionGroup[] }>(`/api/boms/${bomIdStr}/options`);
      const rawGroups = Array.isArray(optRes) ? optRes : (optRes.groups ?? []);
      const groups = rawGroups.map((g: OptionGroup) => ({
        ...g,
        packages: g.packages.filter(p => p.status === 'ACTIVE'),
      }));
      setOptionGroups(groups);

      if (groups.length > 0) {
        // Use provided selections (repeat order) or compute defaults
        let initSels: Selection[];
        if (initialSelections) {
          initSels = initialSelections.filter((s) => {
            const group = groups.find((g) => g.id === s.groupId);
            if (!group) return false;
            if (s.packageId === null) return true;
            return group.packages.some((p) => p.id === s.packageId);
          });
        } else {
          initSels = [];
          for (const g of groups) {
            if (g.selectionType === 'PICK_ONE') {
              const defaultPkg = g.packages.find(p => p.isDefault);
              initSels.push({
                groupId: g.id,
                packageId: defaultPkg?.id ?? null,
                quantity: 1,
              });
            }
            // PICK_MANY: no initial selection (defaults applied by backend)
          }
        }
        setSelections(initSels);
        await resolveWithSelections(bomIdStr, initSels);
      } else {
        // No options — legacy behavior
        setResolvedData(null);
        setSelections([]);
        isResolutionUpdate.current = true;
        replace(
          detail.bom.lines.map((line) => ({
            itemId: String(line.itemId),
            quantityPer: Number(line.quantityPer),
          }))
        );
        requestAnimationFrame(() => {
          isResolutionUpdate.current = false;
        });
      }
    } catch {
      setSelectedBomDetail(null);
      setOptionGroups([]);
      setSelections([]);
      setResolvedData(null);
      replace([]);
    }
  }

  function handleBomChange(bomIdStr: string) {
    setValue('bomId', bomIdStr);
    if (!bomIdStr) return;
    loadBomTemplate(bomIdStr);
  }

  function handleRepeatOrderSelect(config: RepeatOrderConfig) {
    setValue('bomId', String(config.bomId));
    setValue('finishedGoodId', String(config.finishedGoodId));
    const mappedSelections: Selection[] = config.selections.map((s) => ({
      groupId: s.groupId,
      packageId: s.packageId,
      quantity: s.quantity,
    }));
    void loadBomTemplate(String(config.bomId), mappedSelections);
  }

  useEffect(() => {
    if (!watchedFinishedGoodId || watchedBomId) return;
    const matchingBom = boms.find((b) => b.finishedGoodId === parseInt(watchedFinishedGoodId));
    if (matchingBom) {
      setValue('bomId', String(matchingBom.id));
      loadBomTemplate(String(matchingBom.id));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchedFinishedGoodId, watchedBomId, boms]);

  // ── Stock helpers ────────────────────────────────────────────────

  function getAvailable(itemId: string): number | null {
    if (!itemId || !watchedLocation) return null;
    const pos = stockPositions.find((p) => p.item.id === parseInt(itemId));
    if (!pos) return 0;
    return pos.availableByLocation?.[watchedLocation] ?? pos.qtyByLocation[watchedLocation] ?? 0;
  }

  const stockWarnings = isConfigured
    ? resolvedData!.resolved
        .map(r => {
          const available = getAvailable(String(r.itemId));
          const totalNeeded = r.effectiveQty * (watchedQuantity || 0);
          if (available !== null && available < totalNeeded) {
            return { itemCode: r.itemCode, required: totalNeeded, available, short: totalNeeded - available };
          }
          return null;
        })
        .filter(Boolean)
    : watchedComponents
        .map((comp) => {
          if (!comp.itemId) return null;
          const available = getAvailable(comp.itemId);
          const totalNeeded = (Number(comp.quantityPer) || 0) * (watchedQuantity || 0);
          if (available !== null && available < totalNeeded) {
            const item = items.find((i) => i.id === parseInt(comp.itemId));
            return { itemCode: item?.itemCode ?? comp.itemId, required: totalNeeded, available, short: totalNeeded - available };
          }
          return null;
        })
        .filter(Boolean);

  const finishedGoods = items.filter((i) => i.itemType === 'FINISHED');
  const componentItems = items;
  const bomItemIds = new Set(selectedBomDetail?.lines?.map((l) => l.itemId) ?? []);

  // ── Submission ───────────────────────────────────────────────────

  function onFormValid(values: FormValues) {
    setPendingValues(values);
    setConfirmOpen(true);
  }

  function buildPayload(values: FormValues) {
    if (isConfigured) {
      return {
        finishedGoodId: parseInt(values.finishedGoodId),
        location: values.location,
        totalQuantity: values.totalQuantity,
        bomId: values.bomId ? parseInt(values.bomId) : null,
        notes: values.notes?.trim() || '',
        vinReference: vinReference.trim() || undefined,
        selections: selections.map(s => ({
          packageId: s.packageId,
          groupId: s.groupId,
          quantity: s.quantity,
        })),
      };
    }
    return {
      finishedGoodId: parseInt(values.finishedGoodId),
      location: values.location,
      totalQuantity: values.totalQuantity,
      bomId: values.bomId ? parseInt(values.bomId) : null,
      components: values.components.map((c) => ({
        itemId: parseInt(c.itemId),
        quantityPer: c.quantityPer,
      })),
      notes: values.notes?.trim() || '',
    };
  }

  async function onConfirmed() {
    if (!pendingValues) return;
    setSubmitting(true);
    setAlert(null);
    try {
      const res = await api.post<{ order: { id: number; orderNumber: string }; warnings: unknown[] }>(
        '/api/production/orders',
        buildPayload(pendingValues)
      );

      setUserInteracted(false);
      setFormDirty(false);
      setOptionGroups([]);
      setSelections([]);
      setVinReference('');
      setResolvedData(null);
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
  const selectedOptionCount = selections.filter(s => s.packageId !== null).length;

  // ── Removed-by-options summary ───────────────────────────────────
  const removedByOptions = isConfigured
    ? resolvedData!.changes.filter(c => c.startsWith('Removed:') || c.startsWith('Reduced:'))
    : [];

  return (
    <div className={`mx-auto space-y-6 p-6 ${hasOptions ? 'max-w-[1200px]' : 'max-w-4xl'}`}>
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Create Production Order</h1>
        <p className="text-sm text-gray-500">Reserve components for staged production</p>
      </div>

      {alert && (
        <Alert variant={alert.type === 'error' ? 'destructive' : 'default'}>
          <AlertDescription>{alert.message}</AlertDescription>
        </Alert>
      )}

      <div className={hasOptions ? 'flex gap-6' : ''}>
        <div className="flex-1 min-w-0">
          <form onSubmit={handleSubmit(onFormValid)} className="space-y-4">
            {/* BOM + Finished Good + Location */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <Label>BOM Template (optional)</Label>
                <div className="flex gap-2">
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
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="whitespace-nowrap text-xs h-9"
                    onClick={() => setRepeatDialogOpen(true)}
                  >
                    Load Previous
                  </Button>
                </div>
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
                {!isConfigured && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => append({ itemId: '', quantityPer: 1 })}
                  >
                    <Plus className="mr-1 h-3 w-3" /> Add Component
                  </Button>
                )}
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
                    <TableHead className="w-48">Part #</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Qty / Unit</TableHead>
                    <TableHead>Total Needed</TableHead>
                    <TableHead>Available</TableHead>
                    <TableHead className="w-[50px]">{isConfigured ? 'Source' : ''}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isConfigured && resolvedData ? (
                    resolvedData.resolved.map((r) => {
                      const available = getAvailable(String(r.itemId));
                      const totalNeeded = r.effectiveQty * (watchedQuantity || 0);
                      const isShort = available !== null && available < totalNeeded;
                      const cutDesc = formatCutDescription(r.cutDetails);

                      return (
                        <TableRow key={r.itemId}>
                          <TableCell className="text-sm font-mono">{r.itemCode}</TableCell>
                          <TableCell className="text-sm">
                            {r.description}
                            {cutDesc && (
                              <div className="text-xs text-muted-foreground mt-0.5">{cutDesc}</div>
                            )}
                          </TableCell>
                          <TableCell
                            className="text-sm"
                            title={formatEffectiveQtyTooltip(r.effectiveQty, r.unitOfMeasure, r.scrapPercent)}
                          >
                            {r.effectiveQty}
                            {r.scrapPercent != null && r.scrapPercent > 0 && (
                              <span className="text-xs text-muted-foreground ml-1">
                                (+{r.scrapPercent}% scrap)
                              </span>
                            )}
                            {cutDesc && (() => {
                              const hint = formatConsumption(r.effectiveQty, (r as any).stockLength);
                              return hint ? (
                                <div className="text-xs text-muted-foreground">{hint}</div>
                              ) : null;
                            })()}
                          </TableCell>
                          <TableCell className="text-sm">
                            {totalNeeded > 0 ? totalNeeded : '—'}
                          </TableCell>
                          <TableCell>
                            {available !== null ? (
                              <span className={isShort ? 'text-red-600 font-medium' : 'text-green-600'}>
                                {available}
                                {isShort && (
                                  <span className="text-xs ml-1">(short {(totalNeeded - available).toFixed(2)})</span>
                                )}
                              </span>
                            ) : (
                              <span className="text-gray-400">—</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <SourceBadge source={r.source} />
                          </TableCell>
                        </TableRow>
                      );
                    })
                  ) : (
                    fields.map((field, index) => {
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
                    })
                  )}
                  {fields.length === 0 && !isConfigured && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-gray-400 py-4">
                        {watchedBomId
                          ? 'Loading BOM components...'
                          : 'Select a BOM or add components manually'}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>

              {/* Removed by options summary */}
              {removedByOptions.length > 0 && (
                <div className="mt-2 px-3 py-2 bg-orange-50 border border-orange-200 rounded-md text-xs text-orange-800">
                  <span className="font-medium">Modified by options: </span>
                  {removedByOptions.join('; ')}
                </div>
              )}

              {/* Component count */}
              {(fields.length > 0 || isConfigured) && (
                <p className="text-xs text-muted-foreground mt-2">
                  {isConfigured ? resolvedData!.resolved.length : fields.length} component{(isConfigured ? resolvedData!.resolved.length : fields.length) !== 1 ? 's' : ''}
                </p>
              )}
            </div>

            <div className="flex justify-end gap-3">
              <Button type="button" variant="outline" onClick={() => navigate('/in-production')}>
                Cancel
              </Button>
              <Button type="submit" disabled={submitting || (fields.length === 0 && !isConfigured)}>
                {submitting ? 'Creating...' : 'Create Production Order'}
              </Button>
            </div>
          </form>
        </div>

        {/* Option Sidebar */}
        {hasOptions && (
          <OptionSelectorSidebar
            groups={optionGroups}
            selections={selections}
            onSelectionsChange={handleSelectionsChange}
            vinReference={vinReference}
            onVinReferenceChange={setVinReference}
            unitCount={watchedQuantity || 1}
            isResolving={isResolving}
          />
        )}
      </div>

      <RepeatOrderDialog
        open={repeatDialogOpen}
        onClose={() => setRepeatDialogOpen(false)}
        onSelect={handleRepeatOrderSelect}
      />

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Create Production Order?"
        description={
          pendingValues
            ? `This will reserve components for ${pendingValues.totalQuantity} unit(s) of ${
                fgItem?.itemCode ?? ''
              } at ${pendingValues.location}.${
                isConfigured ? ` ${selectedOptionCount} option(s) selected.` : ''
              }${vinReference.trim() ? ` VIN: ${vinReference.trim()}.` : ''}${
                stockWarnings.length > 0
                  ? ` Warning: ${stockWarnings.length} component(s) have insufficient stock.`
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

// ── Source Badge ───────────────────────────────────────────────────

function SourceBadge({ source }: { source: string }) {
  const base = "text-[10px] px-1.5 py-0.5 h-auto leading-none whitespace-nowrap inline-flex items-center";
  if (source === 'BASE') {
    return <Badge variant="secondary" className={base}>Base</Badge>;
  }
  if (source.startsWith('BASE +')) {
    return (
      <Badge variant="outline" className={`${base} text-purple-700 border-purple-300`}>
        {source.length > 20 ? source.slice(0, 18) + '...' : source}
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className={`${base} text-blue-700 border-blue-300`}>
      {source.length > 20 ? source.slice(0, 18) + '...' : source}
    </Badge>
  );
}
