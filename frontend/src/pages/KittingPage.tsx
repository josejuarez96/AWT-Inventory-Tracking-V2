import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { api, ApiError } from '@/lib/api';
import { LOCATIONS, type Location } from '@/lib/locations';
import { allowsDecimals } from '@/lib/uom';
import { formatCurrency } from '@/lib/utils';
import { formatCutDescription, formatConsumption, formatEffectiveQtyTooltip } from '@/lib/cutDisplay';
import { useAuth } from '@/hooks/useAuth';
import { useFormDirty } from '@/context/FormDirtyContext';
import { AdminAuthDialog } from '@/components/AdminAuthDialog';
import { OptionSelectorSidebar, type OptionGroup, type Selection } from '@/components/OptionSelectorSidebar';
import { RepeatOrderDialog, type RepeatOrderConfig } from '@/components/RepeatOrderDialog';
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

type Item = { id: number; itemCode: string; description: string; unitOfMeasure: string; itemType?: string; allowDecimalQty?: boolean; stockLength?: number | null };

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

type ResolvedEntry = {
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
  resolved: ResolvedEntry[];
  changes: string[];
  selections: Array<{
    groupId: number;
    groupName: string;
    selectionType: string;
    packageId: number | null;
    packageName: string;
    quantity: number;
    allowQuantity: boolean;
  }>;
  warnings: string[];
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
  void user;
  const [items, setItems] = useState<Item[]>([]);
  const [activeBoms, setActiveBoms] = useState<BomOption[]>([]);
  const [stockMap, setStockMap] = useState<Map<number, StockPosition>>(new Map());
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [adminAuthOpen, setAdminAuthOpen] = useState(false);
  const [adminAuthError, setAdminAuthError] = useState<string | null>(null);
  const [adminAuthSubmitting, setAdminAuthSubmitting] = useState(false);

  // ── Option state ─────────────────────────────────────────────────
  const [optionGroups, setOptionGroups] = useState<OptionGroup[]>([]);
  const [selections, setSelections] = useState<Selection[]>([]);
  const [vinReference, setVinReference] = useState('');
  const [isResolving, setIsResolving] = useState(false);
  const [repeatDialogOpen, setRepeatDialogOpen] = useState(false);
  const [resolvedData, setResolvedData] = useState<ResolvedData | null>(null);
  const resolveDebounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const isResolutionUpdate = useRef(false);

  const hasOptions = optionGroups.length > 0;
  const isConfigured = hasOptions && resolvedData !== null;

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
    const sub = watch(() => {
      if (!isResolutionUpdate.current) {
        setUserInteracted(true);
      }
    });
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

  // ── Resolution ───────────────────────────────────────────────────

  async function resolveWithSelections(bomId: string, sels: Selection[]) {
    setIsResolving(true);
    try {
      // Include explicit "None" selections (packageId: null with groupId)
      // so the backend can suppress defaults for those groups
      const payload = sels.map(s => ({
        packageId: s.packageId,
        groupId: s.groupId,
        quantity: s.quantity,
      }));

      const result = await api.post<ResolvedData>(`/api/boms/${bomId}/resolve`, {
        selections: payload,
      });

      setResolvedData(result);

      // Populate form components from resolved data (for form validation to pass)
      isResolutionUpdate.current = true;
      replace(
        result.resolved.map(r => ({
          itemId: String(r.itemId),
          quantityPer: r.effectiveQty,
          fromBom: true,
        }))
      );
      requestAnimationFrame(() => {
        isResolutionUpdate.current = false;
      });
    } catch (err) {
      if (err instanceof ApiError) {
        setSubmitError(err.message);
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
    const bomId = watch('bomId');
    if (bomId) {
      resolveDebounceRef.current = setTimeout(() => {
        void resolveWithSelections(bomId, newSelections);
      }, 300);
    }
  }

  // ── BOM Loading ──────────────────────────────────────────────────

  async function loadBomTemplate(bomId: string, initialSelections?: Selection[]) {
    if (!bomId) return;
    try {
      const data = await api.get<{ bom: BomDetail }>(`/api/boms/${bomId}`);
      const bom = data.bom;
      setValue('finishedGoodId', String(bom.finishedGood.id));

      // Fetch option groups
      const optRes = await api.get<{ groups: OptionGroup[] }>(`/api/boms/${bomId}/options`);
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
          // Filter to only groups that still exist, and validate packages are still active
          initSels = initialSelections.filter((s) => {
            const group = groups.find((g) => g.id === s.groupId);
            if (!group) return false;
            if (s.packageId === null) return true; // "None" selection
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
            // PICK_MANY: no default selections
          }
        }
        setSelections(initSels);
        await resolveWithSelections(bomId, initSels);
      } else {
        // No options — legacy behavior
        setResolvedData(null);
        setSelections([]);
        isResolutionUpdate.current = true;
        replace(
          bom.lines.map((l) => ({
            itemId: String(l.itemId),
            quantityPer: l.quantityPer,
            fromBom: true,
          }))
        );
        requestAnimationFrame(() => {
          isResolutionUpdate.current = false;
        });
      }
    } catch {
      // non-fatal
    }
  }

  function handleRepeatOrderSelect(config: RepeatOrderConfig) {
    setValue('bomId', String(config.bomId));
    setValue('finishedGoodId', String(config.finishedGoodId));
    setSubmitError(null);
    const mappedSelections: Selection[] = config.selections.map((s) => ({
      groupId: s.groupId,
      packageId: s.packageId,
      quantity: s.quantity,
    }));
    void loadBomTemplate(String(config.bomId), mappedSelections);
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
        setOptionGroups([]);
        setSelections([]);
        setResolvedData(null);
        replace([{ itemId: '', quantityPer: undefined as unknown as number, fromBom: false }]);
        setSubmitError('No active BOM found for this finished good. Select a BOM template or add components manually.');
      }
    } catch {
      setSubmitError('Failed to look up BOM for this item. Select a BOM template or add components manually.');
    }
  }

  // ── Stock & Cost ─────────────────────────────────────────────────

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

  const componentSummary = isConfigured && resolvedData
    ? resolvedData.resolved.map((r, index) => {
        const required = r.effectiveQty * watchedQtyProduced;
        const available = getAvailable(String(r.itemId));
        const lineCost = r.unitCost * required;
        if (lineCost > 0) totalCost += lineCost;
        if (available !== null && required > 0 && available < required) {
          insufficientLines.push(index);
        }
        return { required, available, avgCost: r.unitCost, lineCost };
      })
    : watchedComponents.map((comp, index) => {
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
  const fgIsWholeUnit = fgItem && !allowsDecimals(fgItem.unitOfMeasure) && !fgItem.allowDecimalQty;

  // ── Removed/reduced by options — parsed for in-table display ─────
  const removedByOptions = useMemo(() => {
    if (!isConfigured || !resolvedData) return [];
    return resolvedData.changes
      .filter(c => c.startsWith('Removed:'))
      .map(c => {
        // Format: "Removed: ITEM-CODE (by Package Name)"
        const match = c.match(/^Removed:\s+(\S+)\s+\(by (.+)\)$/);
        if (!match) return null;
        const [, itemCode, packageName] = match;
        const item = items.find(i => i.itemCode === itemCode);
        return item ? { itemCode, description: item.description ?? '', packageName } : null;
      })
      .filter(Boolean) as { itemCode: string; description: string; packageName: string }[];
  }, [isConfigured, resolvedData, items]);

  // ── Form Submission ──────────────────────────────────────────────

  function onFormValid(values: KittingFormValues) {
    // Enforce whole numbers for EA finished goods
    if (fgIsWholeUnit && !Number.isInteger(values.quantityProduced)) {
      setSubmitError(`${fgItem!.itemCode} is measured in ${fgItem!.unitOfMeasure} — quantity produced must be a whole number.`);
      return;
    }
    // Enforce whole numbers for EA component items (legacy path only)
    if (!isConfigured) {
      for (const comp of values.components) {
        const item = items.find((i) => i.id === parseInt(comp.itemId));
        if (item && !allowsDecimals(item.unitOfMeasure) && !item.allowDecimalQty && !Number.isInteger(comp.quantityPer)) {
          setSubmitError(`${item.itemCode} is measured in ${item.unitOfMeasure} — Qty Per must be a whole number.`);
          return;
        }
      }
    }
    setSubmitError(null);
    setPendingValues(values);
    setConfirmOpen(true);
  }

  function buildKitPayload(values: KittingFormValues) {
    if (isConfigured) {
      // Resolution path: backend owns the component list
      return {
        bomId: values.bomId ? parseInt(values.bomId) : undefined,
        finishedGoodId: parseInt(values.finishedGoodId),
        location: values.location,
        quantityProduced: values.quantityProduced,
        notes: values.notes?.trim() || '',
        vinReference: vinReference.trim() || undefined,
        selections: selections.map(s => ({
          packageId: s.packageId,
          groupId: s.groupId,
          quantity: s.quantity,
        })),
      };
    }
    // Legacy path: frontend sends components
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
    // Clear option state
    setOptionGroups([]);
    setSelections([]);
    setVinReference('');
    setResolvedData(null);
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

  // ── Render ───────────────────────────────────────────────────────

  const selectedOptionCount = selections.filter(s => s.packageId !== null).length;

  return (
    <div className={`space-y-6 ${hasOptions ? 'max-w-[1200px]' : 'max-w-6xl'}`}>
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

      <div className={hasOptions ? 'flex gap-6' : ''}>
        {/* Main content area */}
        <div className={hasOptions ? 'flex-1 min-w-0' : ''}>
          <form onSubmit={handleSubmit(onFormValid)} className="space-y-6">
            {/* ====== TEMPLATE + HEADER ====== */}
            <div className="rounded-lg border bg-white p-4 space-y-4">
              <h2 className="text-sm font-medium text-gray-700">Production Details</h2>

              {/* Row 1: BOM Template + FG Part # + FG Description */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-1">
                  <Label>BOM Template <span className="text-gray-400">(optional)</span></Label>
                  <div className="flex gap-2">
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
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="whitespace-nowrap text-xs h-9"
                      onClick={() => setRepeatDialogOpen(true)}
                    >
                      Copy from Previous Order
                    </Button>
                  </div>
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
                    step={fgIsWholeUnit ? '1' : 'any'}
                    min={fgIsWholeUnit ? '1' : '0.01'}
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
                {!isConfigured && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => append({ itemId: '', quantityPer: undefined as unknown as number, fromBom: false })}
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    Add Component
                  </Button>
                )}
              </div>

              {/* Deviation warning (legacy path only) */}
              {!isConfigured && (() => {
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
                      <TableHead className="w-24">
                        {isConfigured ? 'Source' : ''}
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isConfigured && resolvedData ? (
                      <>
                        {/* ── Resolved component rows (read-only) ── */}
                        {resolvedData.resolved.map((r, index) => {
                          const summary = componentSummary[index];
                          const isInsufficient = insufficientLines.includes(index);
                          const cutDesc = formatCutDescription(r.cutDetails);
                          const item = items.find(i => i.id === r.itemId);
                          const consumption = formatConsumption(r.effectiveQty, item?.stockLength ?? null);
                          return (
                            <TableRow key={`${r.itemId}-${r.source}`}>
                              <TableCell className="text-gray-400 text-sm">{index + 1}</TableCell>
                              <TableCell className="text-sm font-mono">{r.itemCode}</TableCell>
                              <TableCell className="text-sm">
                                {r.description}
                                {cutDesc && (
                                  <div className="text-xs text-gray-500 mt-0.5">
                                    {cutDesc}
                                    {consumption && (
                                      <span
                                        className="text-gray-400 ml-1"
                                        title={formatEffectiveQtyTooltip(r.effectiveQty, r.unitOfMeasure, r.scrapPercent)}
                                      >
                                        ({consumption})
                                      </span>
                                    )}
                                  </div>
                                )}
                              </TableCell>
                              <TableCell className="text-sm font-mono">
                                <span title={r.scrapPercent ? `Base: ${r.quantityPer}, +${r.scrapPercent}% scrap` : undefined}>
                                  {r.effectiveQty}
                                </span>
                              </TableCell>
                              <TableCell className="text-right font-mono text-sm">
                                {summary?.required > 0 ? summary.required : '--'}
                              </TableCell>
                              <TableCell className="text-right text-sm">
                                {summary?.available !== null ? (
                                  <span className={isInsufficient ? 'text-red-600 font-medium' : 'text-green-600'}>
                                    {summary.available}
                                    {isInsufficient && <AlertTriangle className="inline h-3.5 w-3.5 ml-1 -mt-0.5" />}
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
                                <SourceBadge source={r.source} />
                              </TableCell>
                            </TableRow>
                          );
                        })}
                        {/* ── Removed-by-option rows (greyed-out strikethrough) ── */}
                        {removedByOptions.map((removed) => (
                          <TableRow key={`removed-${removed.itemCode}`} className="bg-gray-50/50">
                            <TableCell className="text-gray-300 text-sm">—</TableCell>
                            <TableCell className="text-sm font-mono text-gray-400 line-through">{removed.itemCode}</TableCell>
                            <TableCell className="text-sm text-gray-400 line-through">{removed.description}</TableCell>
                            <TableCell className="text-gray-400 line-through text-sm">—</TableCell>
                            <TableCell className="text-right text-gray-400">—</TableCell>
                            <TableCell className="text-right text-gray-400">—</TableCell>
                            <TableCell className="text-right text-gray-400">—</TableCell>
                            <TableCell className="text-right text-gray-400">—</TableCell>
                            <TableCell>
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0.5 h-auto leading-none whitespace-nowrap text-red-600 border-red-300 bg-red-50">
                                Removed by {removed.packageName}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        ))}
                      </>
                    ) : (
                      // ── Editable component rows (legacy) ──
                      fields.map((field, index) => {
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
                                  {isInsufficient && <AlertTriangle className="inline h-3.5 w-3.5 ml-1 -mt-0.5" />}
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
                      })
                    )}
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

              {/* Removed-by-options changes summary (reduced items) */}
              {isConfigured && resolvedData && resolvedData.changes.filter(c => c.startsWith('Reduced:')).length > 0 && (
                <div className="rounded-md border border-gray-200 bg-gray-50 px-4 py-2 text-xs text-gray-600">
                  <span className="font-medium">Option changes:</span>{' '}
                  {resolvedData.changes.filter(c => c.startsWith('Reduced:')).join('; ')}
                </div>
              )}

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
                {isConfigured ? resolvedData!.resolved.length : fields.length} component{(isConfigured ? resolvedData!.resolved.length : fields.length) !== 1 ? 's' : ''}
                {totalCost > 0 && (
                  <>
                    {' '}&middot; Total: <span className="font-medium">{formatCurrency(totalCost)}</span>
                  </>
                )}
              </div>
              <Button type="submit" disabled={isSubmitting || hasInsufficientStock || isResolving}>
                {isSubmitting ? 'Processing...' : 'Submit Kitting Order'}
              </Button>
            </div>
          </form>
        </div>

        {/* Sidebar when BOM has options */}
        {hasOptions && (
          <OptionSelectorSidebar
            groups={optionGroups}
            selections={selections}
            onSelectionsChange={handleSelectionsChange}
            vinReference={vinReference}
            onVinReferenceChange={setVinReference}
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
              <p><span className="font-medium">Components:</span> {isConfigured ? resolvedData!.resolved.length : pendingValues.components.length}</p>
              {isConfigured && selectedOptionCount > 0 && (
                <p><span className="font-medium">Options:</span> {selectedOptionCount} selected</p>
              )}
              {vinReference && (
                <p><span className="font-medium">VIN:</span> {vinReference}</p>
              )}
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

// ── Source Badge ──────────────────────────────────────────────────────

function SourceBadge({ source }: { source: string }) {
  const base = "text-[10px] px-1.5 py-0.5 h-auto leading-none whitespace-nowrap inline-flex items-center";
  if (source === 'BASE') {
    return <Badge variant="secondary" className={base}>Base</Badge>;
  }
  if (source.includes('+')) {
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
