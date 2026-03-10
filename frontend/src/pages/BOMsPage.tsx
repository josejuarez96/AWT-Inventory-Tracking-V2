import { Fragment, useEffect, useState, useCallback, useMemo } from 'react';
import { useAuthContext } from '@/context/AuthContext';
import { api, ApiError } from '@/lib/api';
import { formatCurrency } from '@/lib/utils';
import { allowsDecimals } from '@/lib/uom';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { AlertTriangle, ChevronDown, ChevronRight, MoreHorizontal, Plus, Search, X } from 'lucide-react';
import { Combobox } from '@/components/ui/combobox';
import { OptionGroupsSection } from '@/components/OptionGroupsSection';
import CutPieceEditor from '@/components/CutPieceEditor';
import { CATEGORY_PRESETS } from '@/lib/categoryPresets';

type Item = { id: number; itemCode: string; description: string; unitOfMeasure: string; category?: string | null; itemType?: string; allowDecimalQty?: boolean; stockLength?: number | null; purchaseUom?: string | null; conversionFactor?: number | null };

type BomLine = {
  itemId: string;
  quantityPer: string;
  scrapPercent: string;
  cutDetails: unknown;
  notes: string;
};

type BomListItem = {
  id: number;
  bomCode: string;
  name: string;
  status: string;
  notes: string | null;
  finishedGood: { id: number; itemCode: string; description: string };
  lineCount: number;
};

type BomDetail = BomListItem & {
  lines: Array<{
    id: number;
    itemId: number;
    quantityPer: number;
    notes: string | null;
    sortOrder: number;
    scrapPercent: number | null;
    cutDetails: unknown;
    item: { id: number; itemCode: string; description: string; unitOfMeasure: string; allowDecimalQty?: boolean; stockLength?: number | null };
  }>;
};

type BomForm = {
  bomCode: string;
  name: string;
  finishedGoodId: string;
  notes: string;
  lines: BomLine[];
};

const EMPTY_LINE: BomLine = { itemId: '', quantityPer: '', scrapPercent: '', cutDetails: null, notes: '' };

const EMPTY_FORM: BomForm = {
  bomCode: '',
  name: '',
  finishedGoodId: '',
  notes: '',
  lines: [{ ...EMPTY_LINE }],
};

const STATUS_BADGE: Record<string, 'outline' | 'default' | 'secondary' | 'destructive'> = {
  DRAFT: 'secondary',
  ACTIVE: 'default',
  RETIRED: 'secondary',
};

export function BOMsPage() {
  const { user } = useAuthContext();
  const isAdmin = user?.role === 'admin';
  const [boms, setBoms] = useState<BomListItem[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [viewOnly, setViewOnly] = useState(false);
  const [form, setForm] = useState<BomForm>(EMPTY_FORM);
  const [formError, setFormError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [actionError, setActionError] = useState('');
  const [actionSuccess, setActionSuccess] = useState('');
  const [confirmStatus, setConfirmStatus] = useState<{ id: number; newStatus: string; name: string } | null>(null);
  const [expandedCutLines, setExpandedCutLines] = useState<Set<number>>(new Set());
  const [stagingLine, setStagingLine] = useState<BomLine>({ ...EMPTY_LINE });
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());
  const [componentsSectionCollapsed, setComponentsSectionCollapsed] = useState(false);
  const [costEstimate, setCostEstimate] = useState<{
    components: { itemId: number; itemCode: string; unitCost: number; effectiveQty: number; lineCost: number; costSource: string }[];
    totalCost: number;
    warnings: string[];
  } | null>(null);

  // Group form.lines by item category for display
  const groupedLines = useMemo(() => {
    const catOrder = new Map<string, number>(CATEGORY_PRESETS.map((c, i) => [c, i]));
    const groups: { category: string; entries: { line: BomLine; originalIndex: number }[] }[] = [];
    const catMap = new Map<string, { line: BomLine; originalIndex: number }[]>();

    form.lines.forEach((line, index) => {
      if (!line.itemId) return;
      const item = items.find((i) => String(i.id) === line.itemId);
      const cat = item?.category || 'Uncategorized';
      if (!catMap.has(cat)) catMap.set(cat, []);
      catMap.get(cat)!.push({ line, originalIndex: index });
    });

    // Sort categories by CATEGORY_PRESETS order, unknowns at end
    const sorted = [...catMap.entries()].sort(([a], [b]) => {
      const ai = catOrder.get(a) ?? Infinity;
      const bi = catOrder.get(b) ?? Infinity;
      if (ai !== bi) return ai - bi;
      return a.localeCompare(b);
    });

    for (const [category, entries] of sorted) {
      groups.push({ category, entries });
    }
    return groups;
  }, [form.lines, items]);

  // Sequential numbering across all groups
  const lineNumberMap = useMemo(() => {
    const map = new Map<number, number>();
    let num = 1;
    for (const group of groupedLines) {
      for (const entry of group.entries) {
        map.set(entry.originalIndex, num++);
      }
    }
    return map;
  }, [groupedLines]);

  function toggleCategory(cat: string) {
    setCollapsedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  }

  function addStagingLine() {
    if (!stagingLine.itemId) return;
    // Auto-expand the target category
    const item = items.find((i) => String(i.id) === stagingLine.itemId);
    const cat = item?.category || 'Uncategorized';
    setCollapsedCategories((prev) => {
      const next = new Set(prev);
      next.delete(cat);
      return next;
    });
    // Append to form.lines
    setForm((f) => {
      const newIndex = f.lines.length;
      // Auto-expand cut editor if cut material
      if (item?.allowDecimalQty && item.stockLength) {
        setExpandedCutLines((prev) => new Set(prev).add(newIndex));
      }
      return { ...f, lines: [...f.lines, { ...stagingLine }] };
    });
    setStagingLine({ ...EMPTY_LINE });
  }

  useEffect(() => {
    if (actionSuccess) {
      const t = setTimeout(() => setActionSuccess(''), 5000);
      return () => clearTimeout(t);
    }
  }, [actionSuccess]);

  const fetchBoms = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({ limit: '200' });
      if (statusFilter !== 'ALL') params.set('status', statusFilter);
      const data = await api.get<{ boms: BomListItem[] }>(`/api/boms?${params}`);
      setBoms(data.boms);
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Failed to load BOMs');
    } finally {
      setIsLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    void fetchBoms();
    api.get<{ items: Item[] }>('/api/items').then((d) => setItems(d.items)).catch(() => {});
  }, [fetchBoms]);

  function openCreate() {
    setEditingId(null);
    setViewOnly(false);
    setForm(EMPTY_FORM);
    setFormError('');
    setExpandedCutLines(new Set());
    setStagingLine({ ...EMPTY_LINE });
    setCostEstimate(null);
    setCollapsedCategories(new Set());
    setDialogOpen(true);
  }

  async function openBomDialog(bom: BomListItem, readOnly: boolean) {
    setFormError('');
    try {
      const data = await api.get<{ bom: BomDetail }>(`/api/boms/${bom.id}`);
      const detail = data.bom;
      setEditingId(detail.id);
      setViewOnly(readOnly);
      const lines = detail.lines.length > 0
        ? detail.lines.map((l) => ({
            itemId: String(l.itemId),
            quantityPer: String(l.quantityPer),
            scrapPercent: l.scrapPercent != null ? String(l.scrapPercent) : '',
            cutDetails: l.cutDetails ?? null,
            notes: l.notes ?? '',
          }))
        : [{ ...EMPTY_LINE }];
      setForm({
        bomCode: detail.bomCode,
        name: detail.name,
        finishedGoodId: String(detail.finishedGood.id),
        notes: detail.notes ?? '',
        lines,
      });
      // Auto-expand cut material lines that already have cut details
      const cutExpanded = new Set<number>();
      lines.forEach((l, i) => { if (l.cutDetails) cutExpanded.add(i); });
      setExpandedCutLines(cutExpanded);
      setStagingLine({ ...EMPTY_LINE });
      setCollapsedCategories(new Set());
      setCostEstimate(null);
      setDialogOpen(true);
      // Fetch cost estimate for view mode
      if (readOnly) {
        api.get<{ components: { itemId: number; itemCode: string; unitCost: number; effectiveQty: number; lineCost: number; costSource: string }[]; totalCost: number; warnings: string[] }>(`/api/boms/${bom.id}/cost-estimate`).then(setCostEstimate).catch(() => {});
      }
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Failed to load BOM details');
    }
  }

  // Auto-generate BOM code and name when finished good is selected (create mode only)
  function handleFinishedGoodChange(itemId: string) {
    const item = items.find((i) => String(i.id) === itemId);
    setForm((f) => {
      const updates: Partial<BomForm> = { finishedGoodId: itemId };
      // Only auto-fill on create, not edit
      if (!editingId && item) {
        updates.bomCode = `BOM-${item.itemCode}`;
        updates.name = `${item.description} Build`;
      }
      return { ...f, ...updates };
    });
  }

  function updateLine(index: number, field: keyof BomLine, value: string) {
    setForm((f) => {
      const lines = [...f.lines];
      lines[index] = { ...lines[index], [field]: value };
      return { ...f, lines };
    });
  }

  function updateLineMulti(index: number, updates: Partial<BomLine>) {
    setForm((f) => {
      const lines = [...f.lines];
      lines[index] = { ...lines[index], ...updates };
      return { ...f, lines };
    });
    // Auto-expand cut editor when a cut material item is selected
    if (updates.itemId !== undefined) {
      const selectedItem = items.find((i) => String(i.id) === updates.itemId);
      if (selectedItem?.allowDecimalQty && selectedItem.stockLength) {
        setExpandedCutLines((prev) => new Set(prev).add(index));
      } else {
        setExpandedCutLines((prev) => {
          const next = new Set(prev);
          next.delete(index);
          return next;
        });
      }
    }
  }

  function removeLine(index: number) {
    setForm((f) => ({ ...f, lines: f.lines.filter((_, i) => i !== index) }));
    setExpandedCutLines((prev) => {
      const next = new Set<number>();
      for (const idx of prev) {
        if (idx < index) next.add(idx);
        else if (idx > index) next.add(idx - 1);
      }
      return next;
    });
  }


  function toggleCutExpand(index: number) {
    setExpandedCutLines((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError('');
    setIsSaving(true);

    const payload = {
      bomCode: form.bomCode.trim(),
      name: form.name.trim(),
      finishedGoodId: parseInt(form.finishedGoodId),
      notes: form.notes.trim() || null,
      lines: form.lines
        .filter((l) => l.itemId)
        .map((l, i) => ({
          itemId: parseInt(l.itemId),
          quantityPer: parseFloat(l.quantityPer) || 0,
          scrapPercent: l.scrapPercent ? parseFloat(l.scrapPercent) : null,
          cutDetails: l.cutDetails ?? null,
          notes: l.notes.trim() || null,
          sortOrder: i,
        })),
    };

    if (payload.lines.length === 0) {
      setFormError('At least one component is required.');
      setIsSaving(false);
      return;
    }

    // Enforce whole numbers for EA (each) items
    for (const line of payload.lines) {
      const item = items.find((i) => i.id === line.itemId);
      if (item && !allowsDecimals(item.unitOfMeasure) && !item.allowDecimalQty && !Number.isInteger(line.quantityPer)) {
        setFormError(`${item.itemCode} is measured in ${item.unitOfMeasure} — Qty Per must be a whole number.`);
        setIsSaving(false);
        return;
      }
    }

    try {
      if (editingId) {
        await api.put(`/api/boms/${editingId}`, payload);
        setActionSuccess('BOM updated successfully.');
        setDialogOpen(false);
        void fetchBoms();
      } else {
        const data = await api.post<{ bom: BomDetail }>('/api/boms', payload);
        setActionSuccess('BOM created — add Option Groups below.');
        void fetchBoms();
        // Re-open in edit mode with full server data
        await openBomDialog({ id: data.bom.id } as BomListItem, false);
      }
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Failed to save BOM');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleStatusChange(id: number, status: string) {
    setActionError('');
    setActionSuccess('');
    try {
      const result = await api.patch<{ status: string; retiredBom?: { id: number; bomCode: string } }>(`/api/boms/${id}/status`, { status });
      const bom = boms.find((b) => b.id === id);
      const action = status === 'ACTIVE' ? 'activated' : status === 'RETIRED' ? 'retired' : 'updated';
      let msg = `BOM "${bom?.bomCode ?? id}" ${action} successfully.`;
      if (result.retiredBom) {
        msg += ` Previous active BOM "${result.retiredBom.bomCode}" was auto-retired.`;
      }
      setActionSuccess(msg);
      void fetchBoms();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Failed to change status');
    }
  }

  async function handleDuplicate(id: number) {
    setActionError('');
    try {
      await api.post(`/api/boms/${id}/duplicate`, {});
      void fetchBoms();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Failed to duplicate BOM');
    }
  }

  // Split items by itemType for the finished good selector
  const finishedGoodItems = items.filter((i) => i.itemType === 'FINISHED');
  const otherItems = items.filter((i) => i.itemType !== 'FINISHED');

  // Filter component items to exclude finished goods and the selected finished good
  const componentItems = items.filter((i) => i.itemType !== 'FINISHED' && String(i.id) !== form.finishedGoodId);

  const filtered = boms.filter((bom) => {
    const q = search.toLowerCase();
    return (
      bom.bomCode.toLowerCase().includes(q) ||
      bom.name.toLowerCase().includes(q) ||
      bom.finishedGood.itemCode.toLowerCase().includes(q) ||
      bom.finishedGood.description.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Bills of Materials</h1>
          <p className="mt-1 text-sm text-gray-500">
            Define component recipes for finished goods.
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          {isAdmin && (
            <DialogTrigger asChild>
              <Button size="sm" onClick={openCreate}>
                <Plus className="mr-2 h-4 w-4" />
                New BOM
              </Button>
            </DialogTrigger>
          )}
          <DialogContent className="sm:max-w-[90vw] sm:max-h-[90vh] overflow-y-auto" onInteractOutside={(e) => e.preventDefault()}>
            <DialogHeader>
              <DialogTitle>{viewOnly ? 'View BOM' : editingId ? 'Edit BOM' : 'Create New BOM'}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4 pt-2">
              {/* Header fields */}
              {viewOnly ? (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">BOM Code</Label>
                      <p className="text-sm font-medium">{form.bomCode}</p>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">FG Part #</Label>
                      <p className="text-sm font-medium">{[...finishedGoodItems, ...otherItems].find((i) => String(i.id) === form.finishedGoodId)?.itemCode ?? '—'}</p>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">FG Description</Label>
                      <p className="text-sm font-medium">{[...finishedGoodItems, ...otherItems].find((i) => String(i.id) === form.finishedGoodId)?.description ?? '—'}</p>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Name</Label>
                    <p className="text-sm">{form.name || '—'}</p>
                  </div>
                  {form.notes && (
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Notes</Label>
                      <p className="text-sm text-muted-foreground">{form.notes}</p>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="bomCode">BOM Code <span className="text-red-500">*</span></Label>
                      <Input
                        id="bomCode"
                        value={form.bomCode}
                        onChange={(e) => setForm((f) => ({ ...f, bomCode: e.target.value }))}
                        placeholder="Auto-generated from finished good"
                        maxLength={50}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>FG Part # <span className="text-red-500">*</span></Label>
                      <Combobox
                        options={[...finishedGoodItems, ...otherItems].map((item) => ({
                          value: String(item.id),
                          label: item.itemCode,
                          searchText: item.itemCode,
                        }))}
                        value={form.finishedGoodId}
                        onValueChange={handleFinishedGoodChange}
                        placeholder="Select part #..."
                        searchPlaceholder="Search part #..."
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>FG Description</Label>
                      <Combobox
                        options={[...finishedGoodItems, ...otherItems].map((item) => ({
                          value: String(item.id),
                          label: item.description,
                          searchText: item.description,
                        }))}
                        value={form.finishedGoodId}
                        onValueChange={handleFinishedGoodChange}
                        placeholder="Select description..."
                        searchPlaceholder="Search description..."
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="bomName">Name <span className="text-red-500">*</span></Label>
                    <Input
                      id="bomName"
                      value={form.name}
                      onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                      placeholder="Auto-generated from finished good"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="bomNotes">Notes</Label>
                    <Textarea
                      id="bomNotes"
                      value={form.notes}
                      onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                      rows={2}
                      placeholder="Build notes, special instructions..."
                    />
                  </div>
                </>
              )}

              {/* Component lines — grouped by category */}
              <div className="space-y-3">
                <button
                  type="button"
                  className="w-full flex items-center gap-2 px-3 py-2 bg-slate-700 text-white rounded-md hover:bg-slate-800 transition-colors text-left"
                  onClick={() => setComponentsSectionCollapsed((v) => !v)}
                >
                  {componentsSectionCollapsed
                    ? <ChevronRight className="h-4 w-4" />
                    : <ChevronDown className="h-4 w-4" />
                  }
                  <span className="text-sm font-semibold">Base Components</span>
                  <span className="text-xs text-slate-300 ml-1">
                    {form.lines.filter((l) => l.itemId).length} item{form.lines.filter((l) => l.itemId).length !== 1 ? 's' : ''}
                  </span>
                </button>

                {!componentsSectionCollapsed && <>
                {/* Staging row — add new components here */}
                {!viewOnly && (
                  <div className="rounded-md border bg-gray-50/50 p-3">
                    <div className="flex items-end gap-2">
                      <div className="flex-1 min-w-0">
                        <Label className="text-xs text-muted-foreground mb-1 block">Part #</Label>
                        <Combobox
                          options={componentItems.map((item) => ({
                            value: String(item.id),
                            label: item.itemCode,
                            searchText: item.itemCode,
                          }))}
                          value={stagingLine.itemId}
                          onValueChange={(v) => setStagingLine((s) => ({ ...s, itemId: v }))}
                          placeholder="Part #..."
                          searchPlaceholder="Search part #..."
                          triggerClassName="h-9"
                        />
                      </div>
                      <div className="flex-[2] min-w-0">
                        <Label className="text-xs text-muted-foreground mb-1 block">Description</Label>
                        <Combobox
                          options={componentItems.map((item) => ({
                            value: String(item.id),
                            label: item.description,
                            searchText: item.description,
                          }))}
                          value={stagingLine.itemId}
                          onValueChange={(v) => setStagingLine((s) => ({ ...s, itemId: v }))}
                          placeholder="Description..."
                          searchPlaceholder="Search description..."
                          triggerClassName="h-9"
                        />
                      </div>
                      <div className="w-[72px]">
                        <Label className="text-xs text-muted-foreground mb-1 block">Qty</Label>
                        <Input
                          type="number"
                          step="any"
                          min="0.01"
                          placeholder="1"
                          className="h-9"
                          value={stagingLine.quantityPer}
                          onChange={(e) => setStagingLine((s) => ({ ...s, quantityPer: e.target.value }))}
                          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addStagingLine(); } }}
                        />
                      </div>
                      <div className="w-16">
                        <Label className="text-xs text-muted-foreground mb-1 block">UOM</Label>
                        <div className="h-9 flex items-center text-sm text-muted-foreground">
                          {(() => {
                            const si = stagingLine.itemId ? items.find((i) => String(i.id) === stagingLine.itemId) : null;
                            if (!si) return '—';
                            return (
                              <div>
                                {si.unitOfMeasure}
                                {si.purchaseUom && <div className="text-xs text-blue-500 leading-tight">bought in {si.purchaseUom}</div>}
                              </div>
                            );
                          })()}
                        </div>
                      </div>
                      <div className="w-28">
                        <Label className="text-xs text-muted-foreground mb-1 block">Notes</Label>
                        <Input
                          placeholder="Optional..."
                          className="h-9 text-xs"
                          value={stagingLine.notes}
                          onChange={(e) => setStagingLine((s) => ({ ...s, notes: e.target.value }))}
                          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addStagingLine(); } }}
                        />
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        className="h-9"
                        onClick={addStagingLine}
                        disabled={!stagingLine.itemId}
                      >
                        <Plus className="h-4 w-4 mr-1" />
                        Add
                      </Button>
                    </div>
                    {stagingLine.itemId && (() => {
                      const si = items.find((i) => String(i.id) === stagingLine.itemId);
                      return si?.category ? (
                        <p className="text-xs text-muted-foreground mt-1.5">
                          Will be added to <span className="font-medium">{si.category}</span>
                        </p>
                      ) : null;
                    })()}
                  </div>
                )}

                {/* Grouped category sections */}
                {groupedLines.length === 0 && (
                  <div className="text-center py-8 text-muted-foreground text-sm border rounded-md">
                    {viewOnly ? 'No base components.' : 'Add base components above — they will be automatically grouped by category.'}
                  </div>
                )}
                <div className="space-y-2">
                  {groupedLines.map(({ category, entries }) => {
                    const isCatCollapsed = collapsedCategories.has(category);
                    return (
                      <div key={category} className="rounded-md border border-l-[3px] border-l-slate-400 overflow-hidden">
                        {/* Category header */}
                        <button
                          type="button"
                          className="w-full flex items-center gap-2 px-3 py-2 bg-gray-100 hover:bg-gray-150 transition-colors text-left"
                          onClick={() => toggleCategory(category)}
                        >
                          {isCatCollapsed
                            ? <ChevronRight className="h-4 w-4 text-gray-500" />
                            : <ChevronDown className="h-4 w-4 text-gray-500" />
                          }
                          <span className="text-sm font-medium text-gray-700">{category}</span>
                          <span className="text-xs text-gray-400 ml-1">({entries.length})</span>
                        </button>

                        {/* Items table — hidden when collapsed */}
                        {!isCatCollapsed && (
                          <Table className="table-fixed w-full">
                            <TableHeader>
                              <TableRow className="bg-gray-50/50">
                                <TableHead className="w-10">#</TableHead>
                                <TableHead className="w-44">Part #</TableHead>
                                <TableHead className="w-[42%]">Description</TableHead>
                                <TableHead className="w-[72px]">Qty</TableHead>
                                <TableHead className="w-16">UOM</TableHead>
                                <TableHead className="w-28">Notes</TableHead>
                                <TableHead className="w-10" />
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {entries.map(({ line, originalIndex }) => {
                                const selectedItem = items.find((i) => String(i.id) === line.itemId);
                                const isCutMaterial = !!(selectedItem?.allowDecimalQty && selectedItem.stockLength);
                                const isExpanded = isCutMaterial && expandedCutLines.has(originalIndex);

                                return (
                                  <Fragment key={originalIndex}>
                                    <TableRow>
                                      <TableCell className="text-gray-400 text-sm">{lineNumberMap.get(originalIndex) ?? ''}</TableCell>
                                      {viewOnly ? (
                                        <>
                                          <TableCell className="whitespace-nowrap text-sm font-mono">{selectedItem?.itemCode ?? '—'}</TableCell>
                                          <TableCell className="text-sm">{selectedItem?.description ?? '—'}</TableCell>
                                          <TableCell className="text-sm">
                                            {line.quantityPer || '—'}
                                            {selectedItem?.purchaseUom && selectedItem.conversionFactor && line.quantityPer && (
                                              <div className="text-xs text-muted-foreground">= {(parseFloat(line.quantityPer) / selectedItem.conversionFactor).toFixed(2)} {selectedItem.purchaseUom}</div>
                                            )}
                                          </TableCell>
                                          <TableCell className="text-sm text-muted-foreground">
                                            {selectedItem?.unitOfMeasure ?? '—'}
                                            {selectedItem?.purchaseUom && (
                                              <div className="text-xs text-blue-500">bought in {selectedItem.purchaseUom}</div>
                                            )}
                                          </TableCell>
                                          <TableCell className="text-sm text-muted-foreground">{line.notes || ''}</TableCell>
                                          <TableCell />
                                        </>
                                      ) : (
                                        <>
                                          <TableCell>
                                            <Combobox
                                              options={componentItems.map((item) => ({
                                                value: String(item.id),
                                                label: item.itemCode,
                                                searchText: item.itemCode,
                                              }))}
                                              value={line.itemId}
                                              onValueChange={(v) => updateLineMulti(originalIndex, { itemId: v, scrapPercent: '', cutDetails: null })}
                                              placeholder="Part #..."
                                              searchPlaceholder="Search part #..."
                                              triggerClassName="h-9"
                                            />
                                          </TableCell>
                                          <TableCell>
                                            <Combobox
                                              options={componentItems.map((item) => ({
                                                value: String(item.id),
                                                label: item.description,
                                                searchText: item.description,
                                              }))}
                                              value={line.itemId}
                                              onValueChange={(v) => updateLineMulti(originalIndex, { itemId: v, scrapPercent: '', cutDetails: null })}
                                              placeholder="Description..."
                                              searchPlaceholder="Search description..."
                                              triggerClassName="h-9"
                                            />
                                          </TableCell>
                                          <TableCell>
                                            {isCutMaterial ? (
                                              <button
                                                type="button"
                                                className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 w-full"
                                                onClick={() => toggleCutExpand(originalIndex)}
                                              >
                                                {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                                                {line.cutDetails ? (
                                                  <span className="truncate" title={`${line.quantityPer} (${(() => {
                                                    const cd = line.cutDetails as { pieces?: { lengthInches: number; quantity: number }[] } | null;
                                                    return cd?.pieces?.map(p => `${p.quantity}×${p.lengthInches}in`).join(', ') ?? '';
                                                  })()}, ${line.scrapPercent || 0}% scrap)`}>
                                                    {line.quantityPer || '—'}
                                                  </span>
                                                ) : (
                                                  <span>Cut...</span>
                                                )}
                                              </button>
                                            ) : (
                                              <div>
                                                <Input
                                                  type="number"
                                                  step="any"
                                                  min="0.01"
                                                  placeholder="1"
                                                  className="h-9"
                                                  value={line.quantityPer}
                                                  onChange={(e) => updateLine(originalIndex, 'quantityPer', e.target.value)}
                                                  onBlur={(e) => {
                                                    const val = parseFloat(e.target.value);
                                                    if (!isNaN(val)) {
                                                      updateLine(originalIndex, 'quantityPer', String(parseFloat(val.toFixed(4))));
                                                    }
                                                  }}
                                                />
                                                {selectedItem?.purchaseUom && selectedItem.conversionFactor && line.quantityPer && (
                                                  <div className="text-xs text-muted-foreground mt-0.5">= {(parseFloat(line.quantityPer) / selectedItem.conversionFactor).toFixed(2)} {selectedItem.purchaseUom}</div>
                                                )}
                                              </div>
                                            )}
                                          </TableCell>
                                          <TableCell className="text-sm text-muted-foreground">
                                            {selectedItem?.unitOfMeasure ?? '—'}
                                            {selectedItem?.purchaseUom && (
                                              <div className="text-xs text-blue-500">bought in {selectedItem.purchaseUom}</div>
                                            )}
                                          </TableCell>
                                          <TableCell>
                                            <Input
                                              placeholder="Add note..."
                                              className="h-9 text-xs"
                                              value={line.notes}
                                              onChange={(e) => updateLine(originalIndex, 'notes', e.target.value)}
                                            />
                                          </TableCell>
                                          <TableCell>
                                            <Button
                                              type="button"
                                              variant="ghost"
                                              size="icon"
                                              className="h-8 w-8"
                                              onClick={() => removeLine(originalIndex)}
                                            >
                                              <X className="h-4 w-4 text-gray-400" />
                                            </Button>
                                          </TableCell>
                                        </>
                                      )}
                                    </TableRow>
                                    {/* Cut piece editor — full-width expanded row */}
                                    {isExpanded && !viewOnly && (
                                      <TableRow className="bg-blue-50/30 hover:bg-blue-50/40">
                                        <TableCell colSpan={7} className="py-2 px-3">
                                          <div className="rounded border border-blue-100 bg-blue-50/50 p-3">
                                            <CutPieceEditor
                                              stockLength={selectedItem!.stockLength!}
                                              value={{
                                                cutDetails: line.cutDetails as { pieces: { lengthInches: number; quantity: number }[]; stockLengthInches: number } | null,
                                                scrapPercent: line.scrapPercent ? parseFloat(line.scrapPercent) : null,
                                                quantityPer: line.quantityPer ? parseFloat(line.quantityPer) : null,
                                              }}
                                              onChange={({ cutDetails, scrapPercent, quantityPer }) =>
                                                updateLineMulti(originalIndex, {
                                                  quantityPer: quantityPer != null ? String(quantityPer) : '',
                                                  scrapPercent: scrapPercent != null ? String(scrapPercent) : '',
                                                  cutDetails,
                                                })
                                              }
                                            />
                                          </div>
                                        </TableCell>
                                      </TableRow>
                                    )}
                                    {/* Warning: item allows decimal qty but has no stock length */}
                                    {!isCutMaterial && selectedItem?.allowDecimalQty && !selectedItem?.stockLength && !viewOnly && (
                                      <TableRow className="bg-amber-50/50">
                                        <TableCell colSpan={7} className="py-1 px-3">
                                          <span className="text-xs text-amber-600">
                                            This item allows decimal qty but has no stock length — set it in Item Master to enable cut pieces.
                                          </span>
                                        </TableCell>
                                      </TableRow>
                                    )}
                                    {/* Cut piece read-only summary for view mode */}
                                    {isCutMaterial && viewOnly && !!line.cutDetails && (
                                      <TableRow className="bg-gray-50/50">
                                        <TableCell colSpan={6} className="py-1.5 px-3">
                                          <div className="text-xs text-muted-foreground flex flex-wrap gap-x-4">
                                            <span>Qty: {line.quantityPer}</span>
                                            <span>Scrap: {line.scrapPercent || 0}%</span>
                                            {(() => {
                                              const cd = line.cutDetails as { pieces?: { lengthInches: number; quantity: number }[]; stockLengthInches?: number } | null;
                                              if (!cd?.pieces) return null;
                                              return (
                                                <>
                                                  <span>Stock: {cd.stockLengthInches}in</span>
                                                  <span>Cuts: {cd.pieces.map(p => `${p.quantity}×${p.lengthInches}in`).join(' + ')}</span>
                                                </>
                                              );
                                            })()}
                                          </div>
                                        </TableCell>
                                      </TableRow>
                                    )}
                                  </Fragment>
                                );
                              })}
                            </TableBody>
                          </Table>
                        )}
                      </div>
                    );
                  })}
                </div>
                </>}
              </div>

              {/* Divider between sections */}
              {editingId && <hr className="border-t-2 border-gray-200 my-2" />}

              {/* Option Groups (only shown on existing BOMs) */}
              {editingId && (
                <OptionGroupsSection
                  bomId={editingId}
                  bomStatus={boms.find((b) => b.id === editingId)?.status ?? 'DRAFT'}
                  allBoms={boms.map((b) => ({ id: b.id, bomCode: b.bomCode, name: b.name }))}
                  items={items}
                />
              )}

              {/* Cost Estimate Panel (view mode only) */}
              {viewOnly && costEstimate && (
                <div className="border rounded-md p-3 bg-gray-50/50 space-y-2">
                  <h4 className="text-sm font-semibold text-gray-700">Cost Estimate (Base BOM)</h4>
                  {costEstimate.warnings.length > 0 && (
                    <div className="space-y-0.5">
                      {costEstimate.warnings.map((w, i) => (
                        <div key={i} className="flex items-center gap-1 text-xs text-amber-600">
                          <AlertTriangle className="h-3 w-3 flex-shrink-0" />
                          {w}
                        </div>
                      ))}
                    </div>
                  )}
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">Part #</TableHead>
                        <TableHead className="text-xs text-right">Eff. Qty</TableHead>
                        <TableHead className="text-xs text-right">Unit Cost</TableHead>
                        <TableHead className="text-xs text-right">Ext. Cost</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {costEstimate.components.map((c) => (
                        <TableRow key={c.itemId} className={c.costSource === 'none' ? 'bg-amber-50/50' : ''}>
                          <TableCell className="text-xs font-mono">{c.itemCode}</TableCell>
                          <TableCell className="text-xs text-right">{c.effectiveQty}</TableCell>
                          <TableCell className="text-xs text-right">
                            {formatCurrency(c.unitCost)}
                            {c.costSource === 'standard' && <span className="text-muted-foreground ml-1">(std)</span>}
                            {c.costSource === 'none' && <span className="text-amber-600 ml-1">(no data)</span>}
                          </TableCell>
                          <TableCell className="text-xs text-right font-medium">{formatCurrency(c.lineCost)}</TableCell>
                        </TableRow>
                      ))}
                      <TableRow className="border-t-2">
                        <TableCell colSpan={3} className="text-sm font-semibold text-right">Total BOM Cost</TableCell>
                        <TableCell className="text-sm font-bold text-right">{formatCurrency(costEstimate.totalCost)}</TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
              )}

              {formError && <p className="text-sm text-red-500">{formError}</p>}
              <div className="sticky bottom-0 bg-white border-t pt-3 pb-2 -mx-6 -mb-6 px-6 flex justify-end gap-2 z-20 shadow-[0_-8px_16px_-4px_rgba(0,0,0,0.15)]">
                {viewOnly ? (
                  <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                    Close
                  </Button>
                ) : (
                  <>
                    <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                      Cancel
                    </Button>
                    <Button type="submit" disabled={isSaving}>
                      {isSaving ? 'Saving...' : editingId ? 'Update BOM' : 'Create BOM'}
                    </Button>
                  </>
                )}
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Search + Status Filter */}
      <div className="flex gap-4 items-center">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search by code, name, or finished good..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="All Statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All Statuses</SelectItem>
            <SelectItem value="DRAFT">Draft</SelectItem>
            <SelectItem value="ACTIVE">Active</SelectItem>
            <SelectItem value="RETIRED">Retired</SelectItem>
          </SelectContent>
        </Select>
        {(search || statusFilter !== 'ALL') && (
          <Button
            variant="ghost"
            size="sm"
            className="text-gray-500 hover:text-gray-700"
            onClick={() => { setSearch(''); setStatusFilter('ALL'); }}
          >
            <X className="h-3 w-3 mr-1" />
            Clear Filters
          </Button>
        )}
      </div>

      {/* Fixed-position toast notifications */}
      {(actionSuccess || actionError) && (
        <div className="fixed bottom-4 right-4 z-50 max-w-sm animate-in slide-in-from-bottom-2">
          {actionSuccess && (
            <Alert className="border-green-200 bg-green-50 shadow-lg">
              <AlertDescription className="text-green-800">{actionSuccess}</AlertDescription>
            </Alert>
          )}
          {actionError && (
            <Alert variant="destructive" className="shadow-lg">
              <AlertDescription className="flex items-center justify-between">
                {actionError}
                <Button variant="ghost" size="sm" onClick={() => setActionError('')}>Dismiss</Button>
              </AlertDescription>
            </Alert>
          )}
        </div>
      )}

      {isLoading ? (
        <p className="text-sm text-gray-500">Loading BOMs...</p>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-gray-500">
          {search ? 'No BOMs match your search.' : 'No BOMs found. Create one to get started.'}
        </p>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader className="sticky top-0 bg-white z-10">
              <TableRow>
                <TableHead>BOM Code</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Finished Good</TableHead>
                <TableHead className="text-center">Components</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((bom) => (
                <TableRow
                  key={bom.id}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => void openBomDialog(bom, !isAdmin || bom.status !== 'DRAFT')}
                >
                  <TableCell className="font-mono text-sm">{bom.bomCode}</TableCell>
                  <TableCell className="text-sm">{bom.name}</TableCell>
                  <TableCell>
                    <div className="font-mono text-xs text-gray-500">{bom.finishedGood.itemCode}</div>
                    <div className="text-sm">{bom.finishedGood.description}</div>
                  </TableCell>
                  <TableCell className="text-center text-sm">{bom.lineCount}</TableCell>
                  <TableCell>
                    <Badge variant={STATUS_BADGE[bom.status] ?? 'outline'}>
                      {bom.status}
                    </Badge>
                  </TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    {isAdmin ? (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {bom.status !== 'DRAFT' && (
                            <DropdownMenuItem onClick={() => void openBomDialog(bom, true)}>
                              View
                            </DropdownMenuItem>
                          )}
                          {bom.status === 'DRAFT' && (
                            <DropdownMenuItem onClick={() => void openBomDialog(bom, false)}>
                              Edit
                            </DropdownMenuItem>
                          )}
                          {bom.status === 'DRAFT' && (
                            <DropdownMenuItem onClick={() => setConfirmStatus({ id: bom.id, newStatus: 'ACTIVE', name: bom.name })}>
                              Activate
                            </DropdownMenuItem>
                          )}
                          {bom.status === 'ACTIVE' && (
                            <DropdownMenuItem onClick={() => setConfirmStatus({ id: bom.id, newStatus: 'RETIRED', name: bom.name })}>
                              Retire
                            </DropdownMenuItem>
                          )}
                          {bom.status === 'RETIRED' && (
                            <DropdownMenuItem onClick={() => setConfirmStatus({ id: bom.id, newStatus: 'ACTIVE', name: bom.name })}>
                              Re-activate
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem onClick={() => void handleDuplicate(bom.id)}>
                            Duplicate
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {!isLoading && (
        <p className="text-xs text-gray-400">
          {filtered.length} BOM{filtered.length !== 1 ? 's' : ''}
          {statusFilter !== 'ALL' && ` (${statusFilter})`}
          {search && ` matching "${search}"`}
        </p>
      )}

      <ConfirmDialog
        open={confirmStatus !== null}
        onOpenChange={(open) => { if (!open) setConfirmStatus(null); }}
        title={confirmStatus?.newStatus === 'ACTIVE' ? 'Activate BOM?' : confirmStatus?.newStatus === 'RETIRED' ? 'Retire BOM?' : 'Change BOM Status?'}
        description={
          confirmStatus && (
            <span>
              {confirmStatus.newStatus === 'ACTIVE' && (
                <>
                  Activate <strong>{confirmStatus.name}</strong>?
                  {(() => {
                    const thisBom = boms.find(b => b.id === confirmStatus.id);
                    const currentActive = thisBom && boms.find(b =>
                      b.id !== confirmStatus.id &&
                      b.status === 'ACTIVE' &&
                      b.finishedGood.id === thisBom.finishedGood.id
                    );
                    if (currentActive) {
                      return <> The currently active BOM <strong>{currentActive.bomCode}</strong> will be automatically retired.</>;
                    }
                    return null;
                  })()}
                </>
              )}
              {confirmStatus.newStatus === 'RETIRED' && (
                <>Retire <strong>{confirmStatus.name}</strong>? Retired BOMs cannot be used for new production orders.</>
              )}
              {confirmStatus.newStatus !== 'ACTIVE' && confirmStatus.newStatus !== 'RETIRED' && (
                <>Change <strong>{confirmStatus.name}</strong> to <strong>{confirmStatus.newStatus}</strong>?</>
              )}
            </span>
          )
        }
        confirmLabel={confirmStatus?.newStatus === 'ACTIVE' ? 'Activate' : confirmStatus?.newStatus === 'RETIRED' ? 'Retire' : `Set to ${confirmStatus?.newStatus ?? ''}`}
        confirmVariant={confirmStatus?.newStatus === 'RETIRED' ? 'destructive' : 'default'}
        onConfirm={() => {
          if (confirmStatus) {
            void handleStatusChange(confirmStatus.id, confirmStatus.newStatus);
            setConfirmStatus(null);
          }
        }}
      />
    </div>
  );
}
