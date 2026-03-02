import { useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
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
import { MoreHorizontal, Pencil, Plus, Search, CheckCircle, X } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { AdminAuthDialog } from '@/components/AdminAuthDialog';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';

type Vendor = {
  id: number;
  vendorCode: string;
  vendorName: string;
  contactPerson: string | null;
  phone: string | null;
  email: string | null;
  paymentTerms: string | null;
  isActive?: boolean;
  notes?: string | null;
  createdAt?: string;
};

type VendorForm = {
  vendorCode: string;
  vendorName: string;
  contactPerson: string;
  phone: string;
  email: string;
  paymentTerms: string;
  notes: string;
};

const PAYMENT_TERMS_OPTIONS = [
  'COD',
  'Net 15',
  'Net 30',
  'Net 45',
  'Net 60',
  'Net 90',
  '2/10 Net 30',
  'Due on Receipt',
] as const;

const EMPTY_FORM: VendorForm = {
  vendorCode: '',
  vendorName: '',
  contactPerson: '',
  phone: '',
  email: '',
  paymentTerms: '',
  notes: '',
};

export function VendorsPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<VendorForm>(EMPTY_FORM);
  const [formError, setFormError] = useState('');
  const [toggleError, setToggleError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [codeUnlocked, setCodeUnlocked] = useState(false);
  const [codeAuthOpen, setCodeAuthOpen] = useState(false);
  const [codeAuthError, setCodeAuthError] = useState<string | null>(null);
  const [codeAuthSubmitting, setCodeAuthSubmitting] = useState(false);
  const [codeUniqueError, setCodeUniqueError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<{ id: number; vendorCode: string } | null>(null);
  const [deleteError, setDeleteError] = useState('');

  useEffect(() => {
    if (successMessage) {
      const t = setTimeout(() => setSuccessMessage(null), 5000);
      return () => clearTimeout(t);
    }
  }, [successMessage]);

  async function fetchVendors() {
    setIsLoading(true);
    try {
      const data = await api.get<{ vendors: Vendor[] }>(`/api/vendors${isAdmin ? '?all=true' : ''}`);
      setVendors(data.vendors);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void fetchVendors();
  }, []);

  async function openCreate() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setFormError('');
    setCodeUnlocked(false);
    setCodeUniqueError('');
    setDialogOpen(true);

    try {
      const data = await api.get<{ nextCode: string }>('/api/vendors/next-code?prefix=V-');
      setForm((f) => ({ ...f, vendorCode: data.nextCode }));
    } catch {
      // Leave blank if endpoint fails; user can type manually
    }
  }

  function openEdit(vendor: Vendor) {
    setEditingId(vendor.id);
    setCodeUnlocked(false);
    setCodeUniqueError('');
    setForm({
      vendorCode: vendor.vendorCode,
      vendorName: vendor.vendorName,
      contactPerson: vendor.contactPerson ?? '',
      phone: vendor.phone ?? '',
      email: vendor.email ?? '',
      paymentTerms: vendor.paymentTerms ?? '',
      notes: vendor.notes ?? '',
    });
    setFormError('');
    setDialogOpen(true);
  }

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
        `/api/vendors/check-code?code=${encodeURIComponent(code.trim())}`
      );
      if (data.exists && data.id !== editingId) {
        setCodeUniqueError(`Vendor code "${code.trim()}" already exists.`);
      } else {
        setCodeUniqueError('');
      }
    } catch {
      setCodeUniqueError('');
    }
  }

  async function handleDelete(id: number, vendorCode: string) {
    setDeleteError('');
    try {
      await api.delete(`/api/vendors/${id}`);
      setSuccessMessage(`Vendor "${vendorCode}" permanently deleted.`);
      void fetchVendors();
    } catch (err) {
      setDeleteError(err instanceof ApiError ? err.message : 'Failed to delete vendor');
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError('');
    if (codeUniqueError) {
      setFormError('Please resolve the vendor code conflict before saving.');
      return;
    }
    setIsSaving(true);

    // Validate phone if provided
    const phoneTrimmed = form.phone.trim();
    if (phoneTrimmed) {
      const digits = phoneTrimmed.replace(/\D/g, '');
      if (digits.length < 7 || digits.length > 15) {
        setFormError('Phone number must have 7–15 digits.');
        setIsSaving(false);
        return;
      }
    }

    const payload = {
      vendorCode: form.vendorCode.trim(),
      vendorName: form.vendorName.trim(),
      contactPerson: form.contactPerson.trim() || null,
      phone: phoneTrimmed || null,
      email: form.email.trim() || null,
      paymentTerms: form.paymentTerms.trim() || null,
      notes: form.notes.trim() || null,
    };

    try {
      if (editingId) {
        await api.put(`/api/vendors/${editingId}`, payload);
        setSuccessMessage(`Vendor "${payload.vendorName}" updated successfully.`);
      } else {
        await api.post('/api/vendors', payload);
        setSuccessMessage(`Vendor "${payload.vendorName}" created successfully.`);
      }
      setDialogOpen(false);
      void fetchVendors();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Failed to save vendor');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleToggleStatus(v: Vendor) {
    const currentStatus = v.isActive !== false;
    setToggleError('');
    try {
      await api.patch(`/api/vendors/${v.id}/status`, { isActive: !currentStatus });
      setSuccessMessage(`Vendor "${v.vendorName}" ${currentStatus ? 'deactivated' : 'activated'} successfully.`);
      void fetchVendors();
    } catch (err) {
      setToggleError(err instanceof ApiError ? err.message : 'Failed to update vendor status');
    }
  }

  const filtered = vendors.filter((v) => {
    const q = search.toLowerCase();
    return (
      v.vendorCode.toLowerCase().includes(q) ||
      v.vendorName.toLowerCase().includes(q) ||
      (v.contactPerson ?? '').toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Vendors</h1>
          <p className="mt-1 text-sm text-gray-500">{isAdmin ? 'Manage supplier master data' : 'View supplier master data'}</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          {isAdmin && (
            <DialogTrigger asChild>
              <Button size="sm" onClick={openCreate}>
                <Plus className="mr-2 h-4 w-4" />
                New Vendor
              </Button>
            </DialogTrigger>
          )}
          <DialogContent className="sm:max-w-lg" onInteractOutside={(e) => e.preventDefault()}>
            <DialogHeader>
              <DialogTitle>{editingId ? 'Edit Vendor' : 'Create New Vendor'}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4 pt-2">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="vendorCode">Vendor Code <span className="text-red-500">*</span></Label>
                  <div className="flex items-center gap-2">
                    <Input
                      id="vendorCode"
                      value={form.vendorCode}
                      onChange={(e) => {
                        setForm((f) => ({ ...f, vendorCode: e.target.value.toUpperCase() }));
                        setCodeUniqueError('');
                      }}
                      onBlur={() => checkCodeUniqueness(form.vendorCode)}
                      maxLength={50}
                      required
                      disabled={!!editingId && !codeUnlocked}
                      className={editingId && !codeUnlocked ? 'bg-gray-100' : ''}
                    />
                    {editingId && !codeUnlocked && (
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="h-9 w-9 shrink-0"
                        title="Unlock vendor code (requires admin)"
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
                  <Label htmlFor="paymentTerms">Payment Terms</Label>
                  <Select
                    value={form.paymentTerms || '__none__'}
                    onValueChange={(val) => setForm((f) => ({ ...f, paymentTerms: val === '__none__' ? '' : val }))}
                  >
                    <SelectTrigger id="paymentTerms">
                      <SelectValue placeholder="Select terms..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">None</SelectItem>
                      {PAYMENT_TERMS_OPTIONS.map((term) => (
                        <SelectItem key={term} value={term}>{term}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="vendorName">Vendor Name <span className="text-red-500">*</span></Label>
                <Input
                  id="vendorName"
                  value={form.vendorName}
                  onChange={(e) => setForm((f) => ({ ...f, vendorName: e.target.value }))}
                  maxLength={200}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="contactPerson">Contact Person</Label>
                <Input
                  id="contactPerson"
                  value={form.contactPerson}
                  onChange={(e) => setForm((f) => ({ ...f, contactPerson: e.target.value }))}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="phone">Phone</Label>
                  <Input
                    id="phone"
                    type="tel"
                    value={form.phone}
                    onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                    placeholder="(555) 123-4567"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  />
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
                  {isSaving ? 'Saving...' : editingId ? 'Update Vendor' : 'Create Vendor'}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Search */}
      <div className="flex items-center gap-2">
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search by code, name, or contact..."
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
        <p className="text-sm text-gray-500">Loading vendors...</p>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-gray-500">
          {search ? 'No vendors match your search.' : 'No vendors found. Add one to get started.'}
        </p>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Vendor Code</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Payment Terms</TableHead>
                {isAdmin && <TableHead>Status</TableHead>}
                {isAdmin && <TableHead className="w-10" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((v) => (
                <TableRow key={v.id} className={v.isActive === false ? 'opacity-50' : ''}>
                  <TableCell className="font-mono text-sm">{v.vendorCode}</TableCell>
                  <TableCell className="text-sm font-medium">{v.vendorName}</TableCell>
                  <TableCell className="text-sm text-gray-500">{v.contactPerson ?? '—'}</TableCell>
                  <TableCell className="text-sm text-gray-500">{v.phone ?? '—'}</TableCell>
                  <TableCell className="text-sm text-gray-500">{v.email ?? '—'}</TableCell>
                  <TableCell className="text-sm text-gray-500">{v.paymentTerms ?? '—'}</TableCell>
                  {isAdmin && (
                    <TableCell>
                      <Badge variant={v.isActive !== false ? 'outline' : 'destructive'}>
                        {v.isActive !== false ? 'Active' : 'Inactive'}
                      </Badge>
                    </TableCell>
                  )}
                  {isAdmin && (
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => openEdit(v)}>
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => void handleToggleStatus(v)}
                          >
                            {v.isActive !== false ? 'Deactivate' : 'Activate'}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-red-600 focus:text-red-600"
                            onClick={() => setConfirmDelete({ id: v.id, vendorCode: v.vendorCode })}
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
          {filtered.length} vendor{filtered.length !== 1 ? 's' : ''}
          {search && ` matching "${search}"`}
        </p>
      )}

      <ConfirmDialog
        open={confirmDelete !== null}
        onOpenChange={(open) => { if (!open) setConfirmDelete(null); }}
        title="Permanently Delete Vendor?"
        description={`This will permanently remove "${confirmDelete?.vendorCode}" from the system. This cannot be undone. Vendors referenced by items or transactions cannot be deleted.`}
        confirmLabel="Delete Permanently"
        confirmVariant="destructive"
        onConfirm={() => {
          if (confirmDelete) {
            void handleDelete(confirmDelete.id, confirmDelete.vendorCode);
            setConfirmDelete(null);
          }
        }}
      />

      <AdminAuthDialog
        open={codeAuthOpen}
        onOpenChange={setCodeAuthOpen}
        title="Admin Authorization Required"
        description="Changing a vendor code can affect references across items and transactions. Enter admin credentials to unlock."
        onAuthorize={handleCodeAuthAuthorize}
        isSubmitting={codeAuthSubmitting}
        error={codeAuthError}
      />
    </div>
  );
}
