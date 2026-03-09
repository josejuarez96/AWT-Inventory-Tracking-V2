import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { useAuthContext } from '@/context/AuthContext';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
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
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { MoreHorizontal, Plus, Search, CheckCircle, X } from 'lucide-react';
import { ItemFormDialog } from '@/components/ItemFormDialog';

type Vendor = { id: number; vendorCode: string; vendorName: string };

type ItemVendorEntry = { id: number; vendor: Vendor };

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
  additionalVendors?: ItemVendorEntry[];
  itemType?: string;
  allowDecimalQty?: boolean;
  stockLength?: number | null;
  isActive?: boolean;
  notes?: string | null;
  createdAt?: string;
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
  const [editingItem, setEditingItem] = useState<Item | null>(null);
  const [toggleError, setToggleError] = useState('');
  const [confirmToggle, setConfirmToggle] = useState<{ id: number; currentStatus: boolean; itemCode: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<{ id: number; itemCode: string } | null>(null);
  const [deleteError, setDeleteError] = useState('');
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [detailItem, setDetailItem] = useState<Item | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    if (successMessage) {
      const t = setTimeout(() => setSuccessMessage(null), 5000);
      return () => clearTimeout(t);
    }
  }, [successMessage]);

  const fetchItems = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await api.get<{ items: Item[] }>('/api/items?all=true');
      setItems(data.items);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchItems();
    api.get<{ vendors: Vendor[] }>('/api/vendors').then((d) => setVendors(d.vendors)).catch(() => {});
  }, [fetchItems]);

  function openCreate() {
    setEditingItem(null);
    setDialogOpen(true);
  }

  function openEdit(item: Item) {
    setEditingItem(item);
    setDialogOpen(true);
  }

  async function openDetail(item: Item) {
    setDetailLoading(true);
    setDetailItem(item);
    setDetailOpen(true);
    try {
      const detail = await api.get<{ item: Item }>(`/api/items/${item.id}`);
      setDetailItem(detail.item);
    } catch {
      // Show what we have from the list
    } finally {
      setDetailLoading(false);
    }
  }

  function handleSaved(message: string) {
    setSuccessMessage(message);
    setDialogOpen(false);
    void fetchItems();
  }

  async function handleToggleStatus(id: number, currentStatus: boolean, itemCode: string) {
    setToggleError('');
    try {
      await api.patch(`/api/items/${id}/status`, { isActive: !currentStatus });
      setSuccessMessage(`Item "${itemCode}" ${currentStatus ? 'deactivated' : 'activated'} successfully.`);
      void fetchItems();
    } catch (err) {
      setToggleError(err instanceof ApiError ? err.message : 'Failed to update item status');
    }
  }

  async function handleDelete(id: number, itemCode: string) {
    setDeleteError('');
    try {
      await api.delete(`/api/items/${id}`);
      setSuccessMessage(`Item "${itemCode}" permanently deleted.`);
      void fetchItems();
    } catch (err) {
      setDeleteError(err instanceof ApiError ? err.message : 'Failed to delete item');
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
        {isAdmin && (
          <Button size="sm" onClick={openCreate}>
            <Plus className="mr-2 h-4 w-4" />
            New Item
          </Button>
        )}
      </div>

      {/* Search */}
      <div className="flex items-center gap-2">
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search by code, description, or category..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        {search && (
          <Button
            variant="ghost"
            size="sm"
            className="text-gray-500 hover:text-gray-700"
            onClick={() => setSearch('')}
          >
            <X className="h-3 w-3 mr-1" />
            Clear
          </Button>
        )}
      </div>

      {successMessage && (
        <Alert className="border-green-200 bg-green-50">
          <CheckCircle className="h-4 w-4 text-green-600" />
          <AlertDescription className="text-green-800">{successMessage}</AlertDescription>
        </Alert>
      )}

      {toggleError && (
        <Alert variant="destructive">
          <AlertDescription className="flex items-center justify-between">
            {toggleError}
            <Button variant="ghost" size="sm" onClick={() => setToggleError('')}>Dismiss</Button>
          </AlertDescription>
        </Alert>
      )}

      {deleteError && (
        <Alert variant="destructive">
          <AlertDescription className="flex items-center justify-between">
            {deleteError}
            <Button variant="ghost" size="sm" onClick={() => setDeleteError('')}>Dismiss</Button>
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
                <TableRow
                  key={item.id}
                  className={`cursor-pointer hover:bg-gray-50 ${item.isActive === false ? 'opacity-50' : ''}`}
                  onClick={() => openDetail(item)}
                >
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
                    <TableCell onClick={(e) => e.stopPropagation()}>
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
                          <DropdownMenuItem
                            className="text-red-600 focus:text-red-600"
                            onClick={() => setConfirmDelete({ id: item.id, itemCode: item.itemCode })}
                          >
                            Delete
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

      {/* Item Detail View Dialog */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span className="font-mono">{detailItem?.itemCode}</span>
              {detailItem && (
                <Badge variant={detailItem.isActive !== false ? 'outline' : 'destructive'}>
                  {detailItem.isActive !== false ? 'Active' : 'Inactive'}
                </Badge>
              )}
            </DialogTitle>
          </DialogHeader>
          {detailItem && (
            <div className="space-y-4 pt-2">
              <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
                <div>
                  <p className="text-gray-500">Description</p>
                  <p className="font-medium">{detailItem.description}</p>
                </div>
                <div>
                  <p className="text-gray-500">Item Type</p>
                  <p className="font-medium">{detailItem.itemType ?? 'RAW'}</p>
                </div>
                <div>
                  <p className="text-gray-500">Category</p>
                  <p className="font-medium">{detailItem.category ?? '—'}</p>
                </div>
                <div>
                  <p className="text-gray-500">Unit of Measure</p>
                  <p className="font-medium">{detailItem.unitOfMeasure}</p>
                </div>
                <div>
                  <p className="text-gray-500">Min Quantity</p>
                  <p className="font-medium">{detailItem.minQuantity ?? '—'}</p>
                </div>
                <div>
                  <p className="text-gray-500">Max Quantity</p>
                  <p className="font-medium">{detailItem.maxQuantity ?? '—'}</p>
                </div>
                <div>
                  <p className="text-gray-500">Standard Cost</p>
                  <p className="font-medium">{detailItem.standardCost != null ? `$${detailItem.standardCost.toFixed(2)}` : '—'}</p>
                </div>
                <div>
                  <p className="text-gray-500">Last Purchase Cost</p>
                  <p className="font-medium">{detailItem.lastPurchaseCost != null ? `$${detailItem.lastPurchaseCost.toFixed(2)}` : '—'}</p>
                </div>
              </div>

              {/* Vendors Section */}
              <div className="border-t pt-3 space-y-2">
                <p className="text-sm font-medium text-gray-700">Vendors</p>
                <div className="text-sm">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-semibold">{detailItem.defaultVendor?.vendorCode ?? '—'}</span>
                    {detailItem.defaultVendor && (
                      <>
                        <span className="text-gray-500">{detailItem.defaultVendor.vendorName}</span>
                        <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700 border-blue-200">Default</Badge>
                      </>
                    )}
                    {!detailItem.defaultVendor && <span className="text-gray-400">No default vendor</span>}
                  </div>
                </div>
                {detailLoading ? (
                  <p className="text-xs text-gray-400">Loading additional vendors...</p>
                ) : (detailItem.additionalVendors ?? []).length > 0 ? (
                  <div className="space-y-1 text-sm">
                    {detailItem.additionalVendors!.map((av) => (
                      <div key={av.id} className="flex items-center gap-2">
                        <span className="font-mono font-semibold">{av.vendor.vendorCode}</span>
                        <span className="text-gray-500">{av.vendor.vendorName}</span>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>

              {detailItem.notes && (
                <div className="border-t pt-3">
                  <p className="text-sm text-gray-500">Notes</p>
                  <p className="text-sm">{detailItem.notes}</p>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                {isAdmin && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setDetailOpen(false);
                      openEdit(detailItem);
                    }}
                  >
                    Edit Item
                  </Button>
                )}
                <Button size="sm" variant="ghost" onClick={() => setDetailOpen(false)}>
                  Close
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <ItemFormDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onSaved={handleSaved}
        editingItem={editingItem}
        vendors={vendors}
      />

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
            void handleToggleStatus(confirmToggle.id, confirmToggle.currentStatus, confirmToggle.itemCode);
            setConfirmToggle(null);
          }
        }}
      />

      <ConfirmDialog
        open={confirmDelete !== null}
        onOpenChange={(open) => { if (!open) setConfirmDelete(null); }}
        title="Permanently Delete Item?"
        description={`This will permanently remove "${confirmDelete?.itemCode}" from the system. This cannot be undone. Items with transaction history cannot be deleted.`}
        confirmLabel="Delete Permanently"
        confirmVariant="destructive"
        onConfirm={() => {
          if (confirmDelete) {
            void handleDelete(confirmDelete.id, confirmDelete.itemCode);
            setConfirmDelete(null);
          }
        }}
      />
    </div>
  );
}
