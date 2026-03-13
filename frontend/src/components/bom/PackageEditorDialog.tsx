import { Fragment, useState, useCallback, useRef, useMemo } from 'react';
import { api, ApiError } from '@/lib/api';
import { allowsDecimals } from '@/lib/uom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Combobox } from '@/components/ui/combobox';
import CutPieceEditor from '@/components/bom/CutPieceEditor';
import { ChevronDown, ChevronRight, Plus, X } from 'lucide-react';
import { CATEGORY_PRESETS } from '@/lib/categoryPresets';

type Item = {
  id: number;
  itemCode: string;
  description: string;
  unitOfMeasure: string;
  category?: string | null;
  allowDecimalQty?: boolean;
  stockLength?: number | null;
};

type LineForm = {
  id?: number;
  itemId: string;
  action: string;
  quantityPer: string;
  scrapPercent: string;
  cutDetails: unknown;
  notes: string;
};

type OptionLine = {
  id: number;
  itemId: number;
  action: string;
  quantityPer: number;
  scrapPercent: number | null;
  cutDetails: unknown;
  sortOrder: number;
  notes: string | null;
  item: Item;
};

type OptionPackage = {
  id: number;
  name: string;
  isDefault: boolean;
  status: string;
  allowQuantity: boolean;
  minQuantity: number;
  maxQuantity: number | null;
  notes: string | null;
  lines: OptionLine[];
};

type Props = {
  bomId: number;
  pkg: OptionPackage;
  items: Item[];
  onClose: () => void;
  onSaved: () => void;
};

const EMPTY_LINE: LineForm = { itemId: '', action: 'ADD', quantityPer: '', scrapPercent: '', cutDetails: null, notes: '' };

export function PackageEditorDialog({ bomId, pkg, items, onClose, onSaved }: Props) {
  const [headerForm, setHeaderForm] = useState({
    name: pkg.name,
    isDefault: pkg.isDefault,
    allowQuantity: pkg.allowQuantity,
    minQuantity: String(pkg.minQuantity),
    maxQuantity: pkg.maxQuantity ? String(pkg.maxQuantity) : '',
    notes: pkg.notes ?? '',
  });

  const [lines, setLines] = useState<LineForm[]>(
    pkg.lines.length > 0
      ? pkg.lines.map((l) => ({
          id: l.id,
          itemId: String(l.itemId),
          action: l.action,
          quantityPer: String(l.quantityPer),
          scrapPercent: l.scrapPercent != null ? String(l.scrapPercent) : '',
          cutDetails: l.cutDetails ?? null,
          notes: l.notes ?? '',
        }))
      : [{ ...EMPTY_LINE }]
  );

  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [expandedCutLines, setExpandedCutLines] = useState<Set<number>>(() => {
    const s = new Set<number>();
    pkg.lines.forEach((l, i) => { if (l.cutDetails) s.add(i); });
    return s;
  });

  // Track initial state for dirty checking
  const initialHeaderRef = useRef(JSON.stringify({
    name: pkg.name,
    isDefault: pkg.isDefault,
    allowQuantity: pkg.allowQuantity,
    minQuantity: String(pkg.minQuantity),
    maxQuantity: pkg.maxQuantity ? String(pkg.maxQuantity) : '',
    notes: pkg.notes ?? '',
  }));
  const initialLinesRef = useRef(JSON.stringify(
    pkg.lines.length > 0
      ? pkg.lines.map((l) => ({
          id: l.id,
          itemId: String(l.itemId),
          action: l.action,
          quantityPer: String(l.quantityPer),
          scrapPercent: l.scrapPercent != null ? String(l.scrapPercent) : '',
          cutDetails: l.cutDetails ?? null,
          notes: l.notes ?? '',
        }))
      : [{ ...EMPTY_LINE }]
  ));

  const [stagingLine, setStagingLine] = useState<LineForm>({ ...EMPTY_LINE });
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());

  const groupedLines = useMemo(() => {
    const catOrder = new Map<string, number>(CATEGORY_PRESETS.map((c, i) => [c, i]));
    const catMap = new Map<string, { line: LineForm; originalIndex: number }[]>();

    lines.forEach((line, index) => {
      if (!line.itemId) return;
      const item = items.find((i) => String(i.id) === line.itemId);
      const cat = item?.category || 'Uncategorized';
      if (!catMap.has(cat)) catMap.set(cat, []);
      catMap.get(cat)!.push({ line, originalIndex: index });
    });

    return [...catMap.entries()].sort(([a], [b]) => {
      const ai = catOrder.get(a) ?? Infinity;
      const bi = catOrder.get(b) ?? Infinity;
      if (ai !== bi) return ai - bi;
      return a.localeCompare(b);
    }).map(([category, entries]) => ({ category, entries }));
  }, [lines, items]);

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
    const item = items.find((i) => String(i.id) === stagingLine.itemId);
    const cat = item?.category || 'Uncategorized';
    setCollapsedCategories((prev) => { const next = new Set(prev); next.delete(cat); return next; });
    setLines((prev) => {
      const newIndex = prev.length;
      if (item?.allowDecimalQty && item.stockLength && stagingLine.action === 'ADD') {
        setExpandedCutLines((s) => new Set(s).add(newIndex));
      }
      return [...prev, { ...stagingLine }];
    });
    setStagingLine({ ...EMPTY_LINE });
  }

  const isDirty = useCallback(() => {
    return JSON.stringify(headerForm) !== initialHeaderRef.current
      || JSON.stringify(lines) !== initialLinesRef.current;
  }, [headerForm, lines]);

  const handleClose = useCallback(() => {
    if (isDirty()) {
      if (!window.confirm('You have unsaved changes. Discard them?')) return;
    }
    onClose();
  }, [isDirty, onClose]);

  function updateLine(index: number, field: keyof LineForm, value: string) {
    setLines((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  }

  function updateLineMulti(index: number, updates: Partial<LineForm>) {
    setLines((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], ...updates };
      return next;
    });
    if (updates.itemId !== undefined) {
      const selectedItem = items.find((i) => String(i.id) === updates.itemId);
      if (selectedItem?.allowDecimalQty && selectedItem.stockLength) {
        setExpandedCutLines((prev) => new Set(prev).add(index));
      } else {
        setExpandedCutLines((prev) => { const next = new Set(prev); next.delete(index); return next; });
      }
    }
  }

  function removeLine(index: number) {
    setLines((prev) => prev.filter((_, i) => i !== index));
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

  async function handleSave() {
    setError('');
    setSaving(true);

    try {
      // 1. Update package header
      await api.put(`/api/boms/${bomId}/options/packages/${pkg.id}`, {
        name: headerForm.name.trim(),
        isDefault: headerForm.isDefault,
        allowQuantity: headerForm.allowQuantity,
        minQuantity: parseInt(headerForm.minQuantity) || 1,
        maxQuantity: headerForm.maxQuantity ? parseInt(headerForm.maxQuantity) : null,
        notes: headerForm.notes.trim() || null,
      });

      // 2. Sync lines: delete removed, update existing, create new
      const existingLineIds = new Set(pkg.lines.map((l) => l.id));
      const currentLineIds = new Set(lines.filter((l) => l.id).map((l) => l.id!));

      // Delete lines that were removed
      for (const oldId of existingLineIds) {
        if (!currentLineIds.has(oldId)) {
          await api.delete(`/api/boms/${bomId}/options/packages/${pkg.id}/lines/${oldId}`);
        }
      }

      // Validate lines client-side before sending
      const validLines = lines.filter((l) => l.itemId && l.quantityPer);
      for (const line of validLines) {
        const item = items.find((i) => String(i.id) === line.itemId);
        if (item && !allowsDecimals(item.unitOfMeasure) && !item.allowDecimalQty) {
          const qty = parseFloat(line.quantityPer);
          if (!Number.isInteger(qty)) {
            setError(`${item.itemCode} is measured in ${item.unitOfMeasure} — Qty must be a whole number.`);
            setSaving(false);
            return;
          }
        }
      }

      // Update existing / create new
      for (let i = 0; i < validLines.length; i++) {
        const line = validLines[i];
        const payload = {
          itemId: parseInt(line.itemId),
          action: line.action,
          quantityPer: parseFloat(line.quantityPer),
          scrapPercent: line.scrapPercent ? parseFloat(line.scrapPercent) : null,
          cutDetails: line.cutDetails ?? null,
          sortOrder: i,
          notes: line.notes.trim() || null,
        };

        if (line.id && existingLineIds.has(line.id)) {
          await api.put(`/api/boms/${bomId}/options/packages/${pkg.id}/lines/${line.id}`, payload);
        } else {
          await api.post(`/api/boms/${bomId}/options/packages/${pkg.id}/lines`, payload);
        }
      }

      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save package');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) handleClose(); }}>
      <DialogContent
        className="sm:max-w-4xl max-h-[85vh] overflow-y-auto"
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => { e.preventDefault(); handleClose(); }}
      >
        <DialogHeader>
          <DialogTitle>Edit Package: {pkg.name}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Header fields */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Package Name *</Label>
              <Input
                value={headerForm.name}
                onChange={(e) => setHeaderForm((f) => ({ ...f, name: e.target.value }))}
                className="h-8"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Notes</Label>
              <Input
                value={headerForm.notes}
                onChange={(e) => setHeaderForm((f) => ({ ...f, notes: e.target.value }))}
                className="h-8"
              />
            </div>
          </div>

          <div className="flex items-center gap-4">
            <label className="flex items-center gap-1.5 text-sm">
              <input
                type="checkbox"
                checked={headerForm.isDefault}
                onChange={(e) => setHeaderForm((f) => ({ ...f, isDefault: e.target.checked }))}
                className="h-4 w-4 rounded border-gray-300"
              />
              Default
            </label>
            <label className="flex items-center gap-1.5 text-sm">
              <input
                type="checkbox"
                checked={headerForm.allowQuantity}
                onChange={(e) => setHeaderForm((f) => ({ ...f, allowQuantity: e.target.checked }))}
                className="h-4 w-4 rounded border-gray-300"
              />
              Allow Quantity
            </label>
            {headerForm.allowQuantity && (
              <>
                <div className="flex items-center gap-1">
                  <Label className="text-xs">Min</Label>
                  <Input
                    type="number"
                    min="1"
                    value={headerForm.minQuantity}
                    onChange={(e) => setHeaderForm((f) => ({ ...f, minQuantity: e.target.value }))}
                    className="h-8 w-20"
                  />
                </div>
                <div className="flex items-center gap-1">
                  <Label className="text-xs">Max</Label>
                  <Input
                    type="number"
                    min="1"
                    value={headerForm.maxQuantity}
                    onChange={(e) => setHeaderForm((f) => ({ ...f, maxQuantity: e.target.value }))}
                    placeholder="∞"
                    className="h-8 w-20"
                  />
                </div>
              </>
            )}
          </div>

          {/* Component lines — grouped by category */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">Component Lines</Label>
              <span className="text-xs text-muted-foreground">
                {lines.filter((l) => l.itemId).length} item{lines.filter((l) => l.itemId).length !== 1 ? 's' : ''}
              </span>
            </div>

            {/* Staging row */}
            <div className="rounded-md border bg-gray-50/50 p-2">
              <div className="flex items-end gap-2">
                <div className="w-20">
                  <Label className="text-xs text-muted-foreground mb-1 block">Action</Label>
                  <Select value={stagingLine.action} onValueChange={(v) => setStagingLine((s) => ({ ...s, action: v }))}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ADD">ADD</SelectItem>
                      <SelectItem value="REMOVE">REMOVE</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex-1 min-w-0">
                  <Label className="text-xs text-muted-foreground mb-1 block">Part #</Label>
                  <Combobox
                    options={items.map((item) => ({
                      value: String(item.id),
                      label: item.itemCode,
                      searchText: item.itemCode,
                    }))}
                    value={stagingLine.itemId}
                    onValueChange={(v) => setStagingLine((s) => ({ ...s, itemId: v }))}
                    placeholder="Part #..."
                    searchPlaceholder="Search..."
                    triggerClassName="h-8"
                  />
                </div>
                <div className="flex-[2] min-w-0">
                  <Label className="text-xs text-muted-foreground mb-1 block">Description</Label>
                  <Combobox
                    options={items.map((item) => ({
                      value: String(item.id),
                      label: item.description,
                      searchText: item.description,
                    }))}
                    value={stagingLine.itemId}
                    onValueChange={(v) => setStagingLine((s) => ({ ...s, itemId: v }))}
                    placeholder="Description..."
                    searchPlaceholder="Search..."
                    triggerClassName="h-8"
                  />
                </div>
                <div className="w-16">
                  <Label className="text-xs text-muted-foreground mb-1 block">Qty</Label>
                  <Input
                    type="number"
                    step="any"
                    min="0.01"
                    placeholder="1"
                    className="h-8"
                    value={stagingLine.quantityPer}
                    onChange={(e) => setStagingLine((s) => ({ ...s, quantityPer: e.target.value }))}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addStagingLine(); } }}
                  />
                </div>
                <Button
                  type="button"
                  size="sm"
                  className="h-8"
                  onClick={addStagingLine}
                  disabled={!stagingLine.itemId}
                >
                  <Plus className="h-3 w-3 mr-1" />
                  Add
                </Button>
              </div>
            </div>

            {/* Grouped category sections */}
            {groupedLines.length === 0 && (
              <div className="text-center py-6 text-muted-foreground text-xs border rounded-md">
                Add components above — they will be automatically grouped by category.
              </div>
            )}
            <div className="space-y-2">
              {groupedLines.map(({ category, entries }) => {
                const isCatCollapsed = collapsedCategories.has(category);
                return (
                  <div key={category} className="rounded-md border border-l-[3px] border-l-slate-400 overflow-hidden">
                    <button
                      type="button"
                      className="w-full flex items-center gap-2 px-3 py-1.5 bg-gray-100 hover:bg-gray-150 transition-colors text-left"
                      onClick={() => toggleCategory(category)}
                    >
                      {isCatCollapsed
                        ? <ChevronRight className="h-3.5 w-3.5 text-gray-500" />
                        : <ChevronDown className="h-3.5 w-3.5 text-gray-500" />
                      }
                      <span className="text-xs font-medium text-gray-700">{category}</span>
                      <span className="text-xs text-gray-400">({entries.length})</span>
                    </button>

                    {!isCatCollapsed && (
                      <Table className="table-fixed w-full">
                        <TableHeader>
                          <TableRow className="bg-gray-50/50">
                            <TableHead className="w-10">#</TableHead>
                            <TableHead className="w-20">Action</TableHead>
                            <TableHead className="w-48">Part #</TableHead>
                            <TableHead className="w-[45%]">Description</TableHead>
                            <TableHead className="w-20">Qty</TableHead>
                            <TableHead className="w-28">Notes</TableHead>
                            <TableHead className="w-8" />
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {entries.map(({ line, originalIndex }) => {
                            const selectedItem = items.find((i) => String(i.id) === line.itemId);
                            const isCutMaterial = !!(selectedItem?.allowDecimalQty && selectedItem.stockLength && line.action === 'ADD');
                            const isExpanded = isCutMaterial && expandedCutLines.has(originalIndex);

                            return (
                              <Fragment key={originalIndex}>
                                <TableRow>
                                  <TableCell className="text-gray-400 text-xs">{lineNumberMap.get(originalIndex) ?? ''}</TableCell>
                                  <TableCell>
                                    <Select value={line.action} onValueChange={(v) => updateLine(originalIndex, 'action', v)}>
                                      <SelectTrigger className="h-8 text-xs">
                                        <SelectValue />
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="ADD">ADD</SelectItem>
                                        <SelectItem value="REMOVE">REMOVE</SelectItem>
                                      </SelectContent>
                                    </Select>
                                  </TableCell>
                                  <TableCell>
                                    <Combobox
                                      options={items.map((item) => ({
                                        value: String(item.id),
                                        label: item.itemCode,
                                        searchText: item.itemCode,
                                      }))}
                                      value={line.itemId}
                                      onValueChange={(v) => updateLineMulti(originalIndex, { itemId: v, scrapPercent: '', cutDetails: null })}
                                      placeholder="Part #..."
                                      searchPlaceholder="Search..."
                                      triggerClassName="h-8"
                                    />
                                  </TableCell>
                                  <TableCell>
                                    <Combobox
                                      options={items.map((item) => ({
                                        value: String(item.id),
                                        label: item.description,
                                        searchText: item.description,
                                      }))}
                                      value={line.itemId}
                                      onValueChange={(v) => updateLineMulti(originalIndex, { itemId: v, scrapPercent: '', cutDetails: null })}
                                      placeholder="Description..."
                                      searchPlaceholder="Search..."
                                      triggerClassName="h-8"
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
                                          <span className="truncate">{line.quantityPer || '—'}</span>
                                        ) : (
                                          <span>Cut...</span>
                                        )}
                                      </button>
                                    ) : (
                                      <Input
                                        type="number"
                                        step="any"
                                        min="0.01"
                                        placeholder="1"
                                        className="h-8"
                                        value={line.quantityPer}
                                        onChange={(e) => updateLine(originalIndex, 'quantityPer', e.target.value)}
                                      />
                                    )}
                                  </TableCell>
                                  <TableCell>
                                    <Input
                                      placeholder="Add note..."
                                      className="h-8 text-xs"
                                      value={line.notes}
                                      onChange={(e) => updateLine(originalIndex, 'notes', e.target.value)}
                                    />
                                  </TableCell>
                                  <TableCell>
                                    <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeLine(originalIndex)}>
                                      <X className="h-3 w-3 text-gray-400" />
                                    </Button>
                                  </TableCell>
                                </TableRow>
                                {isExpanded && (
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
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}
        </div>

        <div className="flex gap-2 justify-end pt-2">
          <Button type="button" variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button type="button" disabled={saving || !headerForm.name.trim()} onClick={handleSave}>
            {saving ? 'Saving...' : 'Save Package'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
