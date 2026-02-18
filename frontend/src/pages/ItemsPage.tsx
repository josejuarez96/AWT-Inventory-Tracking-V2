import { useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { useAuthContext } from '@/context/AuthContext';
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
import { MoreHorizontal, Plus, Search } from 'lucide-react';

type Vendor = { id: number; vendorCode: string; vendorName: string };

type Item = {
  id: number;
  itemCode: string;
  description: string;
  category: string | null;
  unitOfMeasure: string;
  minQuantity: number | null;
  maxQuantity: number | null;
  standardCost: number | null;
  lastPurchaseCost: number | null;
  defaultVendorId: number | null;
  defaultVendor: Vendor | null;
  itemType?: string;
  isActive?: boolean;
  notes?: string | null;
  createdAt?: string;
};

type ItemForm = {
  itemCode: string;
  description: string;
  category: string;
  unitOfMeasure: string;
  minQuantity: string;
  maxQuantity: string;
  standardCost: string;
  defaultVendorId: string;
  notes: string;
  itemType: string;
};

const EMPTY_FORM: ItemForm = {
  itemCode: '',
  description: '',
  category: '',
  unitOfMeasure: 'EA',
  minQuantity: '',
  maxQuantity: '',
  standardCost: '',
  defaultVendorId: '',
  notes: '',
  itemType: 'RAW',
};

const ITEM_TYPE_BADGE: Record<string, { label: string; className: string }> = {
  RAW: { label: 'RAW', className: 'bg-gray-100 text-gray-700 border-gray-200' },
  FINISHED: { label: 'FINISHED', className: 'bg-blue-100 text-blue-700 border-blue-200' },
  OTHER: { label: 'OTHER', className: 'bg-yellow-100 text-yellow-700 border-yellow-200' },
};

export function ItemsPage() {
  const { user } = useAuthContext();
  const isAdmin = user?.role === 'admin';

  const [items, setItems] = useState<Item[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');

  const [vendors, setVendors] = useState<Vendor[]>([]);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<ItemForm>(EMPTY_FORM);
  const [formError, setFormError] = useState('');
  const [toggleError, setToggleError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [confirmToggle, setConfirmToggle] = useState<{ id: number; currentStatus: boolean; itemCode: string } | null>(null);

  async function fetchItems() {
    setIsLoading(true);
    try {
      const data = await api.get<{ items: Item[] }>('/api/items?all=true');
      setItems(data.items);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void fetchItems();
    api.get<{ vendors: Vendor[] }>('/api/vendors').then((d) => setVendors(d.vendors)).catch(() => {});
  }, []);

  function openCreate() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setFormError('');
    setDialogOpen(true);
  }

  function openEdit(item: Item) {
    setEditingId(item.id);
    setForm({
      itemCode: item.itemCode,
      description: item.description,
      category: item.category ?? '',
      unitOfMeasure: item.unitOfMeasure,
      minQuantity: item.minQuantity != null ? String(item.minQuantity) : '',
      maxQuantity: item.maxQuantity != null ? String(item.maxQuantity) : '',
      standardCost: item.standardCost != null ? String(item.standardCost) : '',
      defaultVendorId: item.defaultVendorId != null ? String(item.defaultVendorId) : '',
      notes: item.notes ?? '',
      itemType: item.itemType ?? 'RAW',
    });
    setFormError('');
    setDialogOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError('');
    setIsSaving(true);

    const payload = {
      itemCode: form.itemCode.trim(),
      description: form.description.trim(),
      category: form.category.trim() || null,
      unitOfMeasure: form.unitOfMeasure.trim() || 'EA',
      minQuantity: form.minQuantity ? parseFloat(form.minQuantity) : null,
      maxQuantity: form.maxQuantity ? parseFloat(form.maxQuantity) : null,
      standardCost: form.standardCost ? parseFloat(form.standardCost) : null,
      defaultVendorId: form.defaultVendorId ? parseInt(form.defaultVendorId) : null,
      notes: form.notes.trim() || null,
      itemType: form.itemType,
    };

    try {
      if (editingId) {
        await api.put(`/api/items/${editingId}`, payload);
      } else {
        await api.post('/api/items', payload);
      }
      setDialogOpen(false);
      void fetchItems();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Failed to save item');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleToggleStatus(id: number, currentStatus: boolean) {
    setToggleError('');
    try {
      await api.patch(`/api/items/${id}/status`, { isActive: !currentStatus });
      void fetchItems();
    } catch (err) {
      setToggleError(err instanceof ApiError ? err.message : 'Failed to update item status');
    }
  }

  const filtered = items.filter((item) => {
    const q = search.toLowerCase();
    return (
      item.itemCode.toLowerCase().includes(q) ||
      item.description.toLowerCase().includes(q) ||
      (item.category ?? '').toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Items</h1>
          <p className="mt-1 text-sm text-gray-500">Manage inventory item master data</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          {isAdmin && (
            <DialogTrigger asChild>
              <Button size="sm" onClick={openCreate}>
                <Plus className="mr-2 h-4 w-4" />
                New Item
              </Button>
            </DialogTrigger>
          )}
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>{editingId ? 'Edit Item' : 'Create New Item'}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4 pt-2">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="itemCode">Item Code <span className="text-red-500">*</span></Label>
                  <Input
                    id="itemCode"
                    value={form.itemCode}
                    onChange={(e) => setForm((f) => ({ ...f, itemCode: e.target.value }))}
                    maxLength={50}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="unitOfMeasure">Unit of Measure</Label>
                  <Input
                    id="unitOfMeasure"
                    value={form.unitOfMeasure}
                    onChange={(e) => setForm((f) => ({ ...f, unitOfMeasure: e.target.value }))}
                    placeholder="EA"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Description <span className="text-red-500">*</span></Label>
                <Input
                  id="description"
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="category">Category</Label>
                  <Input
                    id="category"
                    value={form.category}
                    onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="itemType">Item Type</Label>
                  <Select
                    value={form.itemType}
                    onValueChange={(val) => setForm((f) => ({ ...f, itemType: val }))}
                  >
                    <SelectTrigger id="itemType">
                      <SelectValue placeholder="Select type..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="RAW">RAW</SelectItem>
                      <SelectItem value="FINISHED">FINISHED</SelectItem>
                      <SelectItem value="OTHER">OTHER</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="minQuantity">Min Quantity</Label>
                  <Input
                    id="minQuantity"
                    type="number"
                    min="0"
                    step="any"
                    value={form.minQuantity}
                    onChange={(e) => setForm((f) => ({ ...f, minQuantity: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="maxQuantity">Max Quantity</Label>
                  <Input
                    id="maxQuantity"
                    type="number"
                    min="0"
                    step="any"
                    value={form.maxQuantity}
                    onChange={(e) => setForm((f) => ({ ...f, maxQuantity: e.target.value }))}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="standardCost">Standard Cost ($)</Label>
                  <Input
                    id="standardCost"
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.standardCost}
                    onChange={(e) => setForm((f) => ({ ...f, standardCost: e.target.value }))}
                    placeholder="0.00"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="defaultVendorId">Default Vendor</Label>
                  <Select
                    value={form.defaultVendorId}
                    onValueChange={(val) => setForm((f) => ({ ...f, defaultVendorId: val === '__none__' ? '' : val }))}
                  >
                    <SelectTrigger id="defaultVendorId">
                      <SelectValue placeholder="Select vendor..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">None</SelectItem>
                      {vendors.map((v) => (
                        <SelectItem key={v.id} value={String(v.id)}>
                          {v.vendorCode} — {v.vendorName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="notes">Notes</Label>
                <Textarea
                  id="notes"
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                  rows={2}
                />
              </div>
              {formError && <p className="text-sm text-red-500">{formError}</p>}
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={isSaving}>
                  {isSaving ? 'Saving...' : editingId ? 'Update Item' : 'Create Item'}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <Input
          placeholder="Search by code, description, or category..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {toggleError && (
        <Alert variant="destructive">
          <AlertDescription className="flex items-center justify-between">
            {toggleError}
            <Button variant="ghost" size="sm" onClick={() => setToggleError('')}>Dismiss</Button>
          </AlertDescription>
        </Alert>
      )}

      {isLoading ? (
        <p className="text-sm text-gray-500">Loading items...</p>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-gray-500">
          {search ? 'No items match your search.' : 'No items found. Add one to get started.'}
        </p>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Item Code</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>UOM</TableHead>
                <TableHead className="text-right">Min Qty</TableHead>
                <TableHead className="text-right">Max Qty</TableHead>
                <TableHead className="text-right">Std Cost</TableHead>
                <TableHead className="text-right">Last Cost</TableHead>
                <TableHead>Default Vendor</TableHead>
                <TableHead>Status</TableHead>
                {isAdmin && <TableHead className="w-10" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((item) => (
                <TableRow key={item.id} className={item.isActive === false ? 'opacity-50' : ''}>
                  <TableCell className="font-mono text-sm">{item.itemCode}</TableCell>
                  <TableCell className="text-sm">{item.description}</TableCell>
                  <TableCell className="text-sm text-gray-500">{item.category ?? '—'}</TableCell>
                  <TableCell>
                    {(() => {
                      const badge = ITEM_TYPE_BADGE[item.itemType ?? 'RAW'] ?? ITEM_TYPE_BADGE.RAW;
                      return <Badge variant="outline" className={badge.className}>{badge.label}</Badge>;
                    })()}
                  </TableCell>
                  <TableCell className="text-sm text-gray-500">{item.unitOfMeasure}</TableCell>
                  <TableCell className="text-right text-sm">{item.minQuantity ?? '—'}</TableCell>
                  <TableCell className="text-right text-sm">{item.maxQuantity ?? '—'}</TableCell>
                  <TableCell className="text-right text-sm">
                    {item.standardCost != null ? `$${item.standardCost.toFixed(2)}` : '—'}
                  </TableCell>
                  <TableCell className="text-right text-sm">
                    {item.lastPurchaseCost != null ? `$${item.lastPurchaseCost.toFixed(2)}` : '—'}
                  </TableCell>
                  <TableCell className="text-sm text-gray-500">
                    {item.defaultVendor ? item.defaultVendor.vendorCode : '—'}
                  </TableCell>
                  <TableCell>
                    <Badge variant={item.isActive !== false ? 'outline' : 'destructive'}>
                      {item.isActive !== false ? 'Active' : 'Inactive'}
                    </Badge>
                  </TableCell>
                  {isAdmin && (
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => openEdit(item)}>
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => setConfirmToggle({ id: item.id, currentStatus: item.isActive !== false, itemCode: item.itemCode })}
                          >
                            {item.isActive !== false ? 'Deactivate' : 'Activate'}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {!isLoading && (
        <p className="text-xs text-gray-400">
          {filtered.length} item{filtered.length !== 1 ? 's' : ''}
          {search && ` matching "${search}"`}
        </p>
      )}

      <ConfirmDialog
        open={confirmToggle !== null}
        onOpenChange={(open) => { if (!open) setConfirmToggle(null); }}
        title={confirmToggle?.currentStatus ? 'Deactivate Item?' : 'Activate Item?'}
        description={
          confirmToggle?.currentStatus
            ? `${confirmToggle.itemCode} will no longer appear in transactions.`
            : `${confirmToggle?.itemCode} will become available for transactions again.`
        }
        confirmLabel={confirmToggle?.currentStatus ? 'Deactivate' : 'Activate'}
        confirmVariant={confirmToggle?.currentStatus ? 'destructive' : 'default'}
        onConfirm={() => {
          if (confirmToggle) {
            void handleToggleStatus(confirmToggle.id, confirmToggle.currentStatus);
            setConfirmToggle(null);
          }
        }}
      />
    </div>
  );
}
