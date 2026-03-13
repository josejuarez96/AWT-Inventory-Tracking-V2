import { useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
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
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { AdminAuthDialog } from '@/components/shared/AdminAuthDialog';
import { CATEGORIES } from '@/lib/categories';
import { ALL_UOMS, allowsDecimals } from '@/lib/uom';

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
  additionalVendors?: { id: number; vendor: Vendor }[];
  itemType?: string;
  allowDecimalQty?: boolean;
  stockLength?: number | null;
  purchaseUom?: string | null;
  conversionFactor?: number | null;
  isActive?: boolean;
  notes?: string | null;
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
  additionalVendorIds: string[];
  notes: string;
  itemType: string;
  allowDecimalQty: boolean;
  stockLength: string;
  purchaseUom: string;
  conversionFactor: string;
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
  additionalVendorIds: [],
  notes: '',
  itemType: 'RAW',
  allowDecimalQty: false,
  stockLength: '',
  purchaseUom: '',
  conversionFactor: '',
};

type Props = {
  open: boolean;
  onClose: () => void;
  onSaved: (message: string) => void;
  editingItem: Item | null;
  vendors: Vendor[];
};

export function ItemFormDialog({ open, onClose, onSaved, editingItem, vendors }: Props) {
  const [form, setForm] = useState<ItemForm>(EMPTY_FORM);
  const [formError, setFormError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [codeUnlocked, setCodeUnlocked] = useState(false);
  const [codeAuthOpen, setCodeAuthOpen] = useState(false);
  const [codeAuthError, setCodeAuthError] = useState<string | null>(null);
  const [codeAuthSubmitting, setCodeAuthSubmitting] = useState(false);
  const [codeUniqueError, setCodeUniqueError] = useState('');

  // Initialize form when dialog opens
  useEffect(() => {
    if (!open) return;

    setFormError('');
    setCodeUnlocked(false);
    setCodeUniqueError('');

    if (editingItem) {
      // Edit mode — populate form and fetch additional vendors
      setForm({
        itemCode: editingItem.itemCode,
        description: editingItem.description,
        category: editingItem.category ?? '',
        unitOfMeasure: editingItem.unitOfMeasure,
        minQuantity: editingItem.minQuantity != null ? String(editingItem.minQuantity) : '',
        maxQuantity: editingItem.maxQuantity != null ? String(editingItem.maxQuantity) : '',
        standardCost: editingItem.standardCost != null
          ? (editingItem.purchaseUom && editingItem.conversionFactor
              ? String(editingItem.standardCost * editingItem.conversionFactor)
              : String(editingItem.standardCost))
          : '',
        defaultVendorId: editingItem.defaultVendorId != null ? String(editingItem.defaultVendorId) : '',
        additionalVendorIds: [],
        notes: editingItem.notes ?? '',
        itemType: editingItem.itemType ?? 'RAW',
        allowDecimalQty: editingItem.allowDecimalQty ?? false,
        stockLength: editingItem.stockLength != null ? String(editingItem.stockLength) : '',
        purchaseUom: editingItem.purchaseUom ?? '',
        conversionFactor: editingItem.conversionFactor != null ? String(editingItem.conversionFactor) : '',
      });
      // Fetch additional vendors
      api.get<{ item: Item }>(`/api/items/${editingItem.id}`)
        .then((detail) => {
          const ids = (detail.item.additionalVendors ?? []).map((av) => String(av.vendor.id));
          setForm((f) => ({ ...f, additionalVendorIds: ids }));
        })
        .catch(() => {});
    } else {
      // Create mode — reset form and auto-suggest code
      setForm(EMPTY_FORM);
      api.get<{ nextCode: string }>('/api/items/next-code?prefix=AWT-')
        .then((data) => setForm((f) => ({ ...f, itemCode: data.nextCode })))
        .catch(() => {});
    }
  }, [open, editingItem]);

  async function handleCodeAuthAuthorize(credentials: { username: string; password: string }) {
    setCodeAuthSubmitting(true);
    setCodeAuthError(null);
    try {
      await api.post('/api/auth/login', credentials);
      setCodeUnlocked(true);
      setCodeAuthOpen(false);
    } catch (err) {
      setCodeAuthError(err instanceof ApiError ? err.message : 'Authorization failed');
    } finally {
      setCodeAuthSubmitting(false);
    }
  }

  async function checkCodeUniqueness(code: string) {
    if (!code.trim()) {
      setCodeUniqueError('');
      return;
    }
    try {
      const data = await api.get<{ exists: boolean; id: number | null }>(
        `/api/items/check-code?code=${encodeURIComponent(code.trim())}`
      );
      if (data.exists && data.id !== editingItem?.id) {
        setCodeUniqueError(`Item code "${code.trim()}" already exists.`);
      } else {
        setCodeUniqueError('');
      }
    } catch {
      setCodeUniqueError('');
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError('');
    if (codeUniqueError) {
      setFormError('Please resolve the item code conflict before saving.');
      return;
    }
    setIsSaving(true);

    const payload = {
      itemCode: form.itemCode.trim(),
      description: form.description.trim(),
      category: form.category.trim() || null,
      unitOfMeasure: form.unitOfMeasure.trim() || 'EA',
      minQuantity: form.minQuantity ? parseFloat(form.minQuantity) : null,
      maxQuantity: form.maxQuantity ? parseFloat(form.maxQuantity) : null,
      standardCost: form.standardCost
        ? (form.purchaseUom && form.conversionFactor
            ? parseFloat((parseFloat(form.standardCost) / parseFloat(form.conversionFactor)).toFixed(4))
            : parseFloat(form.standardCost))
        : null,
      defaultVendorId: form.defaultVendorId ? parseInt(form.defaultVendorId) : null,
      additionalVendorIds: form.additionalVendorIds.filter((id) => id).map((id) => parseInt(id)),
      notes: form.notes.trim() || null,
      itemType: form.itemType,
      allowDecimalQty: form.allowDecimalQty,
      stockLength: form.stockLength ? parseFloat(form.stockLength) : null,
      purchaseUom: form.purchaseUom || null,
      conversionFactor: form.conversionFactor ? parseFloat(form.conversionFactor) : null,
    };

    try {
      if (editingItem) {
        await api.put(`/api/items/${editingItem.id}`, payload);
        onSaved(`Item "${payload.itemCode}" updated successfully.`);
      } else {
        await api.post('/api/items', payload);
        onSaved(`Item "${payload.itemCode}" created successfully.`);
      }
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Failed to save item');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto" onInteractOutside={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>{editingItem ? 'Edit Item' : 'Create New Item'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4 pt-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="itemCode">Item Code <span className="text-red-500">*</span></Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="itemCode"
                    value={form.itemCode}
                    onChange={(e) => {
                      setForm((f) => ({ ...f, itemCode: e.target.value.toUpperCase() }));
                      setCodeUniqueError('');
                    }}
                    onBlur={() => checkCodeUniqueness(form.itemCode)}
                    maxLength={50}
                    required
                    disabled={!!editingItem && !codeUnlocked}
                    className={editingItem && !codeUnlocked ? 'bg-gray-100' : ''}
                  />
                  {editingItem && !codeUnlocked && (
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="h-9 w-9 shrink-0"
                      title="Unlock item code (requires admin)"
                      onClick={() => {
                        setCodeAuthError(null);
                        setCodeAuthOpen(true);
                      }}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                  )}
                </div>
                {codeUniqueError && (
                  <p className="text-xs text-red-600">{codeUniqueError}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="unitOfMeasure">Unit of Measure</Label>
                <Select
                  value={form.unitOfMeasure}
                  onValueChange={(v) => setForm((f) => ({
                    ...f,
                    unitOfMeasure: v,
                    ...(f.purchaseUom === v && { purchaseUom: '', conversionFactor: '' }),
                  }))}
                >
                  <SelectTrigger id="unitOfMeasure">
                    <SelectValue placeholder="EA" />
                  </SelectTrigger>
                  <SelectContent>
                    {ALL_UOMS.map((uom) => (
                      <SelectItem key={uom} value={uom}>{uom}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {!allowsDecimals(form.unitOfMeasure) && (
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="allowDecimalQty"
                    checked={form.allowDecimalQty}
                    onChange={(e) => setForm((f) => ({ ...f, allowDecimalQty: e.target.checked, ...(!e.target.checked && { stockLength: '' }) }))}
                    className="h-4 w-4 rounded border-gray-300"
                  />
                  <Label htmlFor="allowDecimalQty" className="text-sm font-normal">Allow Decimal Qty</Label>
                </div>
                {form.allowDecimalQty && (
                  <div className="flex items-center gap-2">
                    <Label htmlFor="stockLength" className="text-sm whitespace-nowrap">Stock Length (IN)</Label>
                    <Input
                      id="stockLength"
                      type="number"
                      step="any"
                      min="0"
                      placeholder="e.g., 288 for 24ft bar"
                      className="w-48 h-8"
                      value={form.stockLength}
                      onChange={(e) => setForm((f) => ({ ...f, stockLength: e.target.value }))}
                    />
                  </div>
                )}
              </div>
            )}
            {/* Purchase UOM + Conversion Factor */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="purchaseUom">Purchase UOM</Label>
                <Select
                  value={form.purchaseUom || '__same__'}
                  onValueChange={(v) => {
                    const val = v === '__same__' ? '' : v;
                    setForm((f) => ({
                      ...f,
                      purchaseUom: val,
                      conversionFactor: val ? f.conversionFactor : '',
                    }));
                  }}
                >
                  <SelectTrigger id="purchaseUom">
                    <SelectValue placeholder="Same as consumption" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__same__">Same as UOM</SelectItem>
                    {ALL_UOMS.filter((u) => u !== form.unitOfMeasure).map((uom) => (
                      <SelectItem key={uom} value={uom}>{uom}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {form.purchaseUom && form.purchaseUom !== form.unitOfMeasure && (
                <div className="space-y-2">
                  <Label htmlFor="conversionFactor">
                    1 {form.purchaseUom} = ___ {form.unitOfMeasure}
                  </Label>
                  <Input
                    id="conversionFactor"
                    type="number"
                    step="any"
                    min="0.0001"
                    placeholder="e.g., 2500"
                    value={form.conversionFactor}
                    onChange={(e) => setForm((f) => ({ ...f, conversionFactor: e.target.value }))}
                    required
                  />
                </div>
              )}
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
                <Select
                  value={form.category || ''}
                  onValueChange={(val) => setForm((f) => ({ ...f, category: val === '__none__' ? '' : val }))}
                >
                  <SelectTrigger id="category">
                    <SelectValue placeholder="Select category..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— None —</SelectItem>
                    {CATEGORIES.map((cat) => (
                      <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
                <Label htmlFor="standardCost">
                  {form.purchaseUom && form.conversionFactor
                    ? `Standard Cost ($/${form.purchaseUom})`
                    : 'Standard Cost ($)'}
                </Label>
                <Input
                  id="standardCost"
                  type="number"
                  min="0"
                  step="0.0001"
                  value={form.standardCost}
                  onChange={(e) => setForm((f) => ({ ...f, standardCost: e.target.value }))}
                  onBlur={(e) => {
                    const val = parseFloat(e.target.value);
                    if (!isNaN(val)) {
                      setForm((f) => ({ ...f, standardCost: val.toFixed(4) }));
                    }
                  }}
                  placeholder="0.0000"
                />
                {form.purchaseUom && form.conversionFactor && form.standardCost && (
                  <p className="text-xs text-muted-foreground">
                    = ${(parseFloat(form.standardCost) / parseFloat(form.conversionFactor)).toFixed(4)}/{form.unitOfMeasure || 'EA'}
                  </p>
                )}
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
            {/* Additional Vendors */}
            <div className="space-y-2">
              <Label className="block">Additional Vendors</Label>
              {form.additionalVendorIds.map((vid, idx) => {
                const usedIds = new Set([
                  form.defaultVendorId,
                  ...form.additionalVendorIds.filter((_, i) => i !== idx),
                ]);
                const available = vendors.filter((v) => !usedIds.has(String(v.id)));
                return (
                  <div key={idx} className="flex items-center gap-2">
                    <Select
                      value={vid}
                      onValueChange={(val) => {
                        setForm((f) => {
                          const updated = [...f.additionalVendorIds];
                          updated[idx] = val;
                          return { ...f, additionalVendorIds: updated };
                        });
                      }}
                    >
                      <SelectTrigger className="flex-1">
                        <SelectValue placeholder="Select vendor..." />
                      </SelectTrigger>
                      <SelectContent>
                        {vid && !available.find((v) => String(v.id) === vid) && (() => {
                          const current = vendors.find((v) => String(v.id) === vid);
                          return current ? (
                            <SelectItem key={current.id} value={String(current.id)}>
                              {current.vendorCode} — {current.vendorName}
                            </SelectItem>
                          ) : null;
                        })()}
                        {available.map((v) => (
                          <SelectItem key={v.id} value={String(v.id)}>
                            {v.vendorCode} — {v.vendorName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9 text-gray-400 hover:text-red-600"
                      onClick={() => {
                        setForm((f) => ({
                          ...f,
                          additionalVendorIds: f.additionalVendorIds.filter((_, i) => i !== idx),
                        }));
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                );
              })}
              {(() => {
                const usedIds = new Set([form.defaultVendorId, ...form.additionalVendorIds]);
                const availableCount = vendors.filter((v) => !usedIds.has(String(v.id))).length;
                return availableCount > 0 ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setForm((f) => ({ ...f, additionalVendorIds: [...f.additionalVendorIds, ''] }))}
                  >
                    <Plus className="mr-1 h-3 w-3" />
                    Add Vendor
                  </Button>
                ) : null;
              })()}
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
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSaving}>
                {isSaving ? 'Saving...' : editingItem ? 'Update Item' : 'Create Item'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <AdminAuthDialog
        open={codeAuthOpen}
        onOpenChange={setCodeAuthOpen}
        title="Admin Authorization Required"
        description="Changing an item code can affect transaction history references. Enter admin credentials to unlock."
        onAuthorize={handleCodeAuthAuthorize}
        isSubmitting={codeAuthSubmitting}
        error={codeAuthError}
      />
    </>
  );
}
