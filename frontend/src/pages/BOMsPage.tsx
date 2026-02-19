import { useEffect, useState, useCallback } from 'react';
import { api, ApiError } from '@/lib/api';
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
import { MoreHorizontal, Plus, Search, X } from 'lucide-react';

type Item = { id: number; itemCode: string; description: string; unitOfMeasure: string; category?: string | null; itemType?: string };

type BomLine = {
  itemId: string;
  quantityPer: string;
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
    item: { id: number; itemCode: string; description: string; unitOfMeasure: string };
  }>;
};

type BomForm = {
  bomCode: string;
  name: string;
  finishedGoodId: string;
  notes: string;
  lines: BomLine[];
};

const EMPTY_LINE: BomLine = { itemId: '', quantityPer: '', notes: '' };

const EMPTY_FORM: BomForm = {
  bomCode: '',
  name: '',
  finishedGoodId: '',
  notes: '',
  lines: [{ ...EMPTY_LINE }],
};

const STATUS_BADGE: Record<string, 'outline' | 'default' | 'secondary' | 'destructive'> = {
  DRAFT: 'outline',
  ACTIVE: 'default',
  RETIRED: 'secondary',
};

export function BOMsPage() {
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
  const [confirmStatus, setConfirmStatus] = useState<{ id: number; newStatus: string; name: string } | null>(null);

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
    setDialogOpen(true);
  }

  async function openBomDialog(bom: BomListItem, readOnly: boolean) {
    setFormError('');
    try {
      const data = await api.get<{ bom: BomDetail }>(`/api/boms/${bom.id}`);
      const detail = data.bom;
      setEditingId(detail.id);
      setViewOnly(readOnly);
      setForm({
        bomCode: detail.bomCode,
        name: detail.name,
        finishedGoodId: String(detail.finishedGood.id),
        notes: detail.notes ?? '',
        lines: detail.lines.length > 0
          ? detail.lines.map((l) => ({
              itemId: String(l.itemId),
              quantityPer: String(l.quantityPer),
              notes: l.notes ?? '',
            }))
          : [{ ...EMPTY_LINE }],
      });
      setDialogOpen(true);
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

  function removeLine(index: number) {
    setForm((f) => ({ ...f, lines: f.lines.filter((_, i) => i !== index) }));
  }

  function addLine() {
    setForm((f) => ({ ...f, lines: [...f.lines, { ...EMPTY_LINE }] }));
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
      if (item && item.unitOfMeasure.toUpperCase() === 'EA' && !Number.isInteger(line.quantityPer)) {
        setFormError(`${item.itemCode} is measured in EA — Qty Per must be a whole number.`);
        setIsSaving(false);
        return;
      }
    }

    try {
      if (editingId) {
        await api.put(`/api/boms/${editingId}`, payload);
      } else {
        await api.post('/api/boms', payload);
      }
      setDialogOpen(false);
      void fetchBoms();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Failed to save BOM');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleStatusChange(id: number, status: string) {
    setActionError('');
    try {
      await api.patch(`/api/boms/${id}/status`, { status });
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
          <DialogTrigger asChild>
            <Button size="sm" onClick={openCreate}>
              <Plus className="mr-2 h-4 w-4" />
              New BOM
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto" onInteractOutside={(e) => e.preventDefault()}>
            <DialogHeader>
              <DialogTitle>{viewOnly ? 'View BOM' : editingId ? 'Edit BOM' : 'Create New BOM'}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4 pt-2">
              {/* Header fields */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="bomCode">BOM Code <span className="text-red-500">*</span></Label>
                  <Input
                    id="bomCode"
                    value={form.bomCode}
                    onChange={(e) => setForm((f) => ({ ...f, bomCode: e.target.value }))}
                    placeholder="Auto-generated from finished good"
                    maxLength={50}
                    required
                    disabled={viewOnly}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="finishedGoodId">Finished Good <span className="text-red-500">*</span></Label>
                  <Select
                    value={form.finishedGoodId}
                    onValueChange={handleFinishedGoodChange}
                    disabled={viewOnly}
                  >
                    <SelectTrigger id="finishedGoodId">
                      <SelectValue placeholder="Select finished good..." />
                    </SelectTrigger>
                    <SelectContent>
                      {finishedGoodItems.length > 0 && (
                        <>
                          {finishedGoodItems.map((item) => (
                            <SelectItem key={item.id} value={String(item.id)}>
                              {item.itemCode} — {item.description}
                            </SelectItem>
                          ))}
                          {otherItems.length > 0 && (
                            <div className="px-2 py-1.5 text-xs text-gray-400 border-t mt-1 pt-1">Other Items</div>
                          )}
                        </>
                      )}
                      {otherItems.map((item) => (
                        <SelectItem key={item.id} value={String(item.id)}>
                          {item.itemCode} — {item.description}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
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
                  disabled={viewOnly}
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
                  disabled={viewOnly}
                />
              </div>

              {/* Component lines */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium">Components</Label>
                  {!viewOnly && (
                    <Button type="button" variant="outline" size="sm" onClick={addLine}>
                      <Plus className="h-4 w-4 mr-1" />
                      Add Component
                    </Button>
                  )}
                </div>
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-10">#</TableHead>
                        <TableHead>Component Item</TableHead>
                        <TableHead className="w-28">Qty Per Unit</TableHead>
                        <TableHead className="w-36">Notes</TableHead>
                        <TableHead className="w-10" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {form.lines.map((line, index) => (
                        <TableRow key={index}>
                          <TableCell className="text-gray-400 text-sm">{index + 1}</TableCell>
                          <TableCell>
                            <Select
                              value={line.itemId}
                              onValueChange={(v) => updateLine(index, 'itemId', v)}
                              disabled={viewOnly}
                            >
                              <SelectTrigger className="h-9">
                                <SelectValue placeholder="Select component..." />
                              </SelectTrigger>
                              <SelectContent>
                                {componentItems.map((item) => (
                                  <SelectItem key={item.id} value={String(item.id)}>
                                    {item.itemCode} — {item.description}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              step="0.0001"
                              min="0.0001"
                              placeholder="1"
                              className="h-9"
                              value={line.quantityPer}
                              onChange={(e) => updateLine(index, 'quantityPer', e.target.value)}
                              disabled={viewOnly}
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              placeholder="optional"
                              className="h-9"
                              value={line.notes}
                              onChange={(e) => updateLine(index, 'notes', e.target.value)}
                              disabled={viewOnly}
                            />
                          </TableCell>
                          <TableCell>
                            {form.lines.length > 1 && !viewOnly && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => removeLine(index)}
                              >
                                <X className="h-4 w-4 text-gray-400" />
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>

              {formError && <p className="text-sm text-red-500">{formError}</p>}
              <div className="flex justify-end gap-2">
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
      </div>

      {actionError && (
        <Alert variant="destructive">
          <AlertDescription className="flex items-center justify-between">
            {actionError}
            <Button variant="ghost" size="sm" onClick={() => setActionError('')}>Dismiss</Button>
          </AlertDescription>
        </Alert>
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
            <TableHeader>
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
                <TableRow key={bom.id}>
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
                  <TableCell>
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
        title="Change BOM Status?"
        description={
          confirmStatus && (
            <span>
              Change <strong>{confirmStatus.name}</strong> to <strong>{confirmStatus.newStatus}</strong>?
              {confirmStatus.newStatus === 'RETIRED' && ' Retired BOMs cannot be used for kitting.'}
            </span>
          )
        }
        confirmLabel={`Set to ${confirmStatus?.newStatus ?? ''}`}
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
