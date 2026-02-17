import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Plus, Download, ClipboardCheck } from 'lucide-react';

// --- Types ---

type CycleCountSummary = {
  id: number;
  countNumber: string;
  location: string;
  status: string;
  blindCount: boolean;
  createdAt: string;
  creator: { fullName: string };
  assignee: { fullName: string } | null;
  poster: { fullName: string } | null;
  postedAt: string | null;
  totalLines: number;
  countedLines: number;
  totalVarianceValue: number;
};

type User = { id: number; fullName: string; role: string; isActive: boolean };
type Item = { id: number; itemCode: string; description: string; category: string | null };

type VarianceLine = {
  id: number;
  countNumber: string;
  postedAt: string;
  location: string;
  itemCode: string;
  description: string;
  category: string | null;
  systemQty: number;
  countedQty: number | null;
  variance: number;
  unitCost: number | null;
  varianceValue: number;
};

// --- Helpers ---

const STATUS_COLORS: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-700',
  IN_PROGRESS: 'bg-blue-100 text-blue-700',
  COMPLETED: 'bg-yellow-100 text-yellow-700',
  POSTED: 'bg-green-100 text-green-700',
  VOID: 'bg-red-100 text-red-700',
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatCurrency(val: number) {
  return val.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

// --- Component ---

export function CycleCountsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const isAdmin = user?.role === 'admin';

  // List state
  const [cycleCounts, setCycleCounts] = useState<CycleCountSummary[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [locationFilter, setLocationFilter] = useState<string>('');

  // Create dialog state
  const [createOpen, setCreateOpen] = useState(false);
  const [createLocation, setCreateLocation] = useState<string>('ADEL');
  const [itemSelection, setItemSelection] = useState<string>('all');
  const [category, setCategory] = useState('');
  const [selectedItemIds, setSelectedItemIds] = useState<number[]>([]);
  const [blindCount, setBlindCount] = useState(false);
  const [assignedTo, setAssignedTo] = useState<string>('');
  const [createNotes, setCreateNotes] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Reference data for create dialog
  const [users, setUsers] = useState<User[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [categories, setCategories] = useState<string[]>([]);

  // Variance history state
  const [varianceLines, setVarianceLines] = useState<VarianceLine[]>([]);
  const [varianceTotals, setVarianceTotals] = useState({
    totalPositiveVariance: 0,
    totalNegativeVariance: 0,
    netVarianceValue: 0,
  });
  const [varianceLoading, setVarianceLoading] = useState(false);
  const [varLocationFilter, setVarLocationFilter] = useState<string>('');
  const [varFrom, setVarFrom] = useState('');
  const [varTo, setVarTo] = useState('');

  const loadCycleCounts = useCallback(async () => {
    setListLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set('status', statusFilter);
      if (locationFilter) params.set('location', locationFilter);
      params.set('limit', '100');
      const data = await api.get<{
        cycleCounts: CycleCountSummary[];
        total: number;
      }>(`/api/cycle-counts?${params}`);
      setCycleCounts(data.cycleCounts);
    } catch {
      /* ignore */
    } finally {
      setListLoading(false);
    }
  }, [statusFilter, locationFilter]);

  const loadVarianceHistory = useCallback(async () => {
    setVarianceLoading(true);
    try {
      const params = new URLSearchParams();
      if (varLocationFilter) params.set('location', varLocationFilter);
      if (varFrom) params.set('from', varFrom);
      if (varTo) params.set('to', varTo);
      params.set('limit', '200');
      const data = await api.get<{
        lines: VarianceLine[];
        totals: typeof varianceTotals;
      }>(`/api/cycle-counts/variance-history?${params}`);
      setVarianceLines(data.lines);
      setVarianceTotals(data.totals);
    } catch {
      /* ignore */
    } finally {
      setVarianceLoading(false);
    }
  }, [varLocationFilter, varFrom, varTo]);

  useEffect(() => {
    loadCycleCounts();
  }, [loadCycleCounts]);

  // Load reference data for create dialog
  useEffect(() => {
    if (!isAdmin) return;
    Promise.all([
      api.get<{ users: User[] }>('/api/users'),
      api.get<{ items: Item[] }>('/api/items'),
    ]).then(([uData, iData]) => {
      setUsers(uData.users.filter((u) => u.isActive));
      setItems(iData.items);
      const cats = [...new Set(iData.items.map((i) => i.category).filter(Boolean))] as string[];
      setCategories(cats.sort());
    }).catch(() => {});
  }, [isAdmin]);

  async function handleCreate() {
    setCreateError(null);
    setCreating(true);
    try {
      const body: Record<string, unknown> = {
        location: createLocation,
        itemSelection,
        blindCount,
      };
      if (itemSelection === 'category') body.category = category;
      if (itemSelection === 'manual') body.itemIds = selectedItemIds;
      if (assignedTo) body.assignedTo = parseInt(assignedTo);
      if (createNotes.trim()) body.notes = createNotes.trim();

      const data = await api.post<{ cycleCount: { id: number; countNumber: string }; lineCount: number }>(
        '/api/cycle-counts',
        body
      );
      setCreateOpen(false);
      resetCreateForm();
      navigate(`/cycle-counts/${data.cycleCount.id}`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to create cycle count';
      setCreateError(message);
    } finally {
      setCreating(false);
    }
  }

  function resetCreateForm() {
    setCreateLocation('ADEL');
    setItemSelection('all');
    setCategory('');
    setSelectedItemIds([]);
    setBlindCount(false);
    setAssignedTo('');
    setCreateNotes('');
    setCreateError(null);
  }

  async function handleExportCsv() {
    const token = localStorage.getItem('awt_token');
    const params = new URLSearchParams();
    if (varLocationFilter) params.set('location', varLocationFilter);
    if (varFrom) params.set('from', varFrom);
    if (varTo) params.set('to', varTo);
    const url = `http://localhost:3000/api/cycle-counts/variance-history/export?${params}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    const blob = await res.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'variance-history.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function toggleItemSelection(id: number) {
    setSelectedItemIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Cycle Counts</h1>
          <p className="mt-1 text-sm text-gray-500">
            Physical inventory counts, variance tracking, and adjustments.
          </p>
        </div>
        {isAdmin && (
          <Button onClick={() => { resetCreateForm(); setCreateOpen(true); }}>
            <Plus className="mr-2 h-4 w-4" />
            New Cycle Count
          </Button>
        )}
      </div>

      <Tabs defaultValue="counts" onValueChange={(v) => { if (v === 'variance') loadVarianceHistory(); }}>
        <TabsList>
          <TabsTrigger value="counts">Cycle Counts</TabsTrigger>
          {isAdmin && <TabsTrigger value="variance">Variance History</TabsTrigger>}
        </TabsList>

        {/* --- Tab 1: Cycle Counts List --- */}
        <TabsContent value="counts" className="space-y-4">
          <div className="flex gap-3">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-44">
                <SelectValue placeholder="All statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All statuses</SelectItem>
                <SelectItem value="DRAFT">Draft</SelectItem>
                <SelectItem value="IN_PROGRESS">In Progress</SelectItem>
                <SelectItem value="COMPLETED">Completed</SelectItem>
                <SelectItem value="POSTED">Posted</SelectItem>
                <SelectItem value="VOID">Void</SelectItem>
              </SelectContent>
            </Select>
            <Select value={locationFilter} onValueChange={setLocationFilter}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="All locations" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All locations</SelectItem>
                <SelectItem value="ADEL">ADEL</SelectItem>
                <SelectItem value="CALHOUN">CALHOUN</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {listLoading ? (
            <p className="text-sm text-gray-500 py-8 text-center">Loading...</p>
          ) : cycleCounts.length === 0 ? (
            <div className="py-12 text-center">
              <ClipboardCheck className="mx-auto h-10 w-10 text-gray-300" />
              <p className="mt-2 text-sm text-gray-500">No cycle counts found.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Count #</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Progress</TableHead>
                  <TableHead className="text-right">Variance $</TableHead>
                  <TableHead>Created By</TableHead>
                  <TableHead>Assigned To</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cycleCounts.map((cc) => (
                  <TableRow
                    key={cc.id}
                    className="cursor-pointer hover:bg-gray-50"
                    onClick={() => navigate(`/cycle-counts/${cc.id}`)}
                  >
                    <TableCell className="font-medium">{cc.countNumber}</TableCell>
                    <TableCell>{cc.location}</TableCell>
                    <TableCell>
                      <Badge className={STATUS_COLORS[cc.status] ?? ''}>{cc.status.replace('_', ' ')}</Badge>
                    </TableCell>
                    <TableCell className={cc.status === 'VOID' ? 'text-gray-400' : ''}>
                      {cc.status === 'VOID' ? '—' : `${cc.countedLines}/${cc.totalLines}`}
                    </TableCell>
                    <TableCell className="text-right">
                      {cc.status === 'VOID' ? (
                        <span className="text-gray-400">—</span>
                      ) : cc.totalVarianceValue !== 0 ? (
                        <span className={cc.totalVarianceValue < 0 ? 'text-red-600' : 'text-green-600'}>
                          {formatCurrency(cc.totalVarianceValue)}
                        </span>
                      ) : (
                        '—'
                      )}
                    </TableCell>
                    <TableCell>{cc.creator.fullName}</TableCell>
                    <TableCell>{cc.assignee?.fullName ?? '—'}</TableCell>
                    <TableCell>{formatDate(cc.createdAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </TabsContent>

        {/* --- Tab 2: Variance History (admin) --- */}
        {isAdmin && (
          <TabsContent value="variance" className="space-y-4">
            <div className="flex gap-3 items-end">
              <div className="space-y-1">
                <Label className="text-xs text-gray-500">Location</Label>
                <Select value={varLocationFilter} onValueChange={(v) => { setVarLocationFilter(v); }}>
                  <SelectTrigger className="w-40">
                    <SelectValue placeholder="All locations" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">All locations</SelectItem>
                    <SelectItem value="ADEL">ADEL</SelectItem>
                    <SelectItem value="CALHOUN">CALHOUN</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-gray-500">From</Label>
                <Input type="date" className="w-40" value={varFrom} onChange={(e) => setVarFrom(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-gray-500">To</Label>
                <Input type="date" className="w-40" value={varTo} onChange={(e) => setVarTo(e.target.value)} />
              </div>
              <Button variant="outline" size="sm" onClick={loadVarianceHistory}>
                Apply
              </Button>
              <Button variant="outline" size="sm" onClick={handleExportCsv}>
                <Download className="mr-2 h-4 w-4" />
                Export CSV
              </Button>
            </div>

            {/* Totals */}
            <div className="flex gap-6 text-sm">
              <div>
                <span className="text-gray-500">Positive: </span>
                <span className="text-green-600 font-medium">{formatCurrency(varianceTotals.totalPositiveVariance)}</span>
              </div>
              <div>
                <span className="text-gray-500">Negative: </span>
                <span className="text-red-600 font-medium">{formatCurrency(varianceTotals.totalNegativeVariance)}</span>
              </div>
              <div>
                <span className="text-gray-500">Net: </span>
                <span className="font-medium">{formatCurrency(varianceTotals.netVarianceValue)}</span>
              </div>
            </div>

            {varianceLoading ? (
              <p className="text-sm text-gray-500 py-8 text-center">Loading...</p>
            ) : varianceLines.length === 0 ? (
              <p className="text-sm text-gray-500 py-8 text-center">No variance records found.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Count #</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead>Item Code</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead className="text-right">System Qty</TableHead>
                    <TableHead className="text-right">Counted Qty</TableHead>
                    <TableHead className="text-right">Variance</TableHead>
                    <TableHead className="text-right">Unit Cost</TableHead>
                    <TableHead className="text-right">Variance $</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {varianceLines.map((l) => (
                    <TableRow key={l.id}>
                      <TableCell className="font-medium">{l.countNumber}</TableCell>
                      <TableCell>{l.postedAt ? formatDate(l.postedAt) : '—'}</TableCell>
                      <TableCell>{l.location}</TableCell>
                      <TableCell>{l.itemCode}</TableCell>
                      <TableCell className="max-w-[200px] truncate">{l.description}</TableCell>
                      <TableCell className="text-right">{l.systemQty}</TableCell>
                      <TableCell className="text-right">{l.countedQty ?? '—'}</TableCell>
                      <TableCell className="text-right">
                        <span className={l.variance < 0 ? 'text-red-600' : l.variance > 0 ? 'text-green-600' : ''}>
                          {l.variance}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">{l.unitCost !== null ? formatCurrency(l.unitCost) : '—'}</TableCell>
                      <TableCell className="text-right">
                        <span className={l.varianceValue < 0 ? 'text-red-600' : l.varianceValue > 0 ? 'text-green-600' : ''}>
                          {formatCurrency(l.varianceValue)}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </TabsContent>
        )}
      </Tabs>

      {/* --- Create Dialog --- */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>New Cycle Count</DialogTitle>
            <DialogDescription>Create a new physical inventory count.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Location */}
            <div className="space-y-1">
              <Label>Location <span className="text-red-500">*</span></Label>
              <Select value={createLocation} onValueChange={setCreateLocation}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ADEL">ADEL</SelectItem>
                  <SelectItem value="CALHOUN">CALHOUN</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Item Selection */}
            <div className="space-y-1">
              <Label>Item Scope <span className="text-red-500">*</span></Label>
              <Select value={itemSelection} onValueChange={setItemSelection}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All items with activity at location</SelectItem>
                  <SelectItem value="category">By category</SelectItem>
                  <SelectItem value="manual">Manual selection</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Category picker */}
            {itemSelection === 'category' && (
              <div className="space-y-1">
                <Label>Category <span className="text-red-500">*</span></Label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select category..." />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Manual item picker */}
            {itemSelection === 'manual' && (
              <div className="space-y-1">
                <Label>Select Items <span className="text-red-500">*</span></Label>
                <div className="max-h-48 overflow-y-auto border rounded-md p-2 space-y-1">
                  {items.map((item) => (
                    <label key={item.id} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-gray-50 px-1 py-0.5 rounded">
                      <input
                        type="checkbox"
                        checked={selectedItemIds.includes(item.id)}
                        onChange={() => toggleItemSelection(item.id)}
                        className="rounded"
                      />
                      <span className="font-mono text-xs">{item.itemCode}</span>
                      <span className="text-gray-600 truncate">{item.description}</span>
                    </label>
                  ))}
                </div>
                <p className="text-xs text-gray-500">{selectedItemIds.length} item(s) selected</p>
              </div>
            )}

            {/* Blind count */}
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={blindCount}
                onChange={(e) => setBlindCount(e.target.checked)}
                className="rounded"
              />
              Blind count (hide system quantities from counter)
            </label>

            {/* Assign to */}
            <div className="space-y-1">
              <Label>Assign To <span className="text-gray-400">(optional)</span></Label>
              <Select value={assignedTo} onValueChange={setAssignedTo}>
                <SelectTrigger>
                  <SelectValue placeholder="Unassigned" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="NONE">Unassigned</SelectItem>
                  {users.map((u) => (
                    <SelectItem key={u.id} value={String(u.id)}>{u.fullName}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Notes */}
            <div className="space-y-1">
              <Label>Notes <span className="text-gray-400">(optional)</span></Label>
              <Textarea
                value={createNotes}
                onChange={(e) => setCreateNotes(e.target.value)}
                rows={2}
                placeholder="Optional notes about this count..."
              />
            </div>

            {createError && (
              <Alert variant="destructive">
                <AlertDescription>{createError}</AlertDescription>
              </Alert>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={creating}>
              {creating ? 'Creating...' : 'Create Cycle Count'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
