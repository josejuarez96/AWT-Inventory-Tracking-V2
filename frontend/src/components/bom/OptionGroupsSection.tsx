import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { api, ApiError } from '@/lib/api';
import { formatCutPieceChips } from '@/lib/cutDisplay';
import { CATEGORY_PRESETS, sortCategories } from '@/lib/categoryPresets';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { ChevronDown, ChevronRight, MoreHorizontal, Plus, X } from 'lucide-react';
import { PackageEditorDialog } from '@/components/bom/PackageEditorDialog';

// ---------- types ----------

type ItemSummary = {
  id: number;
  itemCode: string;
  description: string;
  unitOfMeasure: string;
  allowDecimalQty?: boolean;
  stockLength?: number | null;
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
  item: ItemSummary;
};

type OptionPackage = {
  id: number;
  optionGroupId: number;
  name: string;
  isDefault: boolean;
  status: string;
  allowQuantity: boolean;
  minQuantity: number;
  maxQuantity: number | null;
  sortOrder: number;
  notes: string | null;
  lines: OptionLine[];
  creator?: { fullName: string };
};

type OptionGroup = {
  id: number;
  bomId: number;
  name: string;
  category: string | null;
  selectionType: string;
  required: boolean;
  sortOrder: number;
  packages: OptionPackage[];
  creator?: { fullName: string };
};

type ItemForEditor = {
  id: number;
  itemCode: string;
  description: string;
  unitOfMeasure: string;
  allowDecimalQty?: boolean;
  stockLength?: number | null;
};

type Props = {
  bomId: number;
  bomStatus: string;
  allBoms?: Array<{ id: number; bomCode: string; name: string }>;
  items?: ItemForEditor[];
};

const PKG_STATUS_BADGE: Record<string, 'outline' | 'default' | 'secondary'> = {
  DRAFT: 'outline',
  ACTIVE: 'default',
  RETIRED: 'secondary',
};


export function OptionGroupsSection({ bomId, bomStatus, allBoms, items = [] }: Props) {
  const [groups, setGroups] = useState<OptionGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Ref to the section root for scroll position preservation
  const sectionRef = useRef<HTMLDivElement>(null);

  // Group creation form
  const [showGroupForm, setShowGroupForm] = useState(false);
  const [groupForm, setGroupForm] = useState({ name: '', category: '', selectionType: 'PICK_ONE', required: false });

  // Editing group
  const [editingGroup, setEditingGroup] = useState<number | null>(null);
  const [editGroupForm, setEditGroupForm] = useState({ name: '', category: '', selectionType: 'PICK_ONE', required: false });

  // Package creation
  const [addingPackageToGroup, setAddingPackageToGroup] = useState<number | null>(null);
  const [pkgForm, setPkgForm] = useState({ name: '', isDefault: false, allowQuantity: false, minQuantity: '1', maxQuantity: '', notes: '' });

  // Collapsed groups and categories (all categories start collapsed)
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set());
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set(CATEGORY_PRESETS));

  // Confirm dialogs
  const [confirmDelete, setConfirmDelete] = useState<{ type: 'group' | 'package'; id: number; name: string } | null>(null);
  const [confirmStatus, setConfirmStatus] = useState<{ id: number; newStatus: string; name: string } | null>(null);
  const [confirmImport, setConfirmImport] = useState(false);

  // Import
  const [showImport, setShowImport] = useState(false);
  const [importBomId, setImportBomId] = useState('');

  // Inline package editor (for opening PackageEditorDialog)
  const [editingPackage, setEditingPackage] = useState<OptionPackage | null>(null);

  useEffect(() => {
    if (success) {
      const t = setTimeout(() => setSuccess(''), 5000);
      return () => clearTimeout(t);
    }
  }, [success]);

  const fetchGroups = useCallback(async () => {
    // Preserve scroll position of the nearest scrollable ancestor
    const scrollParent = sectionRef.current?.closest('[class*="overflow"]') as HTMLElement | null;
    const scrollTop = scrollParent?.scrollTop ?? 0;

    setLoading(true);
    try {
      const data = await api.get<{ groups: OptionGroup[] }>(`/api/boms/${bomId}/options`);
      // Stable sort: packages within each group sorted by sortOrder then id
      for (const g of data.groups) {
        g.packages.sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);
      }
      setGroups(data.groups);

      // Restore scroll position after React re-renders
      if (scrollParent) {
        requestAnimationFrame(() => { scrollParent.scrollTop = scrollTop; });
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load option groups');
    } finally {
      setLoading(false);
    }
  }, [bomId]);

  useEffect(() => {
    void fetchGroups();
  }, [fetchGroups]);

  function toggleCollapse(groupId: number) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  }

  function toggleCategoryCollapse(category: string) {
    setCollapsedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  }

  // Always show all preset categories, plus any custom ones from existing groups
  const categories = useMemo(() => {
    const catMap = new Map<string, OptionGroup[]>();
    // Seed every preset so they always appear
    for (const preset of CATEGORY_PRESETS) catMap.set(preset, []);
    // Slot existing groups into their category
    for (const g of groups) {
      const cat = g.category || 'Miscellaneous';
      if (!catMap.has(cat)) catMap.set(cat, []);
      catMap.get(cat)!.push(g);
    }
    const entries = [...catMap.entries()].map(([name, grps]) => ({ name, groups: grps }));
    return sortCategories(entries);
  }, [groups]);

  // ---- Group CRUD ----

  async function handleCreateGroup() {
    setError('');
    const trimmedName = groupForm.name.trim();
    if (groups.some(g => g.name.toLowerCase() === trimmedName.toLowerCase())) {
      setError(`A group named "${trimmedName}" already exists on this BOM.`);
      return;
    }
    try {
      const created = await api.post<{ group: { id: number } }>(`/api/boms/${bomId}/options/groups`, {
        name: groupForm.name.trim(),
        category: groupForm.category.trim() || null,
        selectionType: groupForm.selectionType,
        required: groupForm.required,
        sortOrder: groups.length,
      });
      setShowGroupForm(false);
      setGroupForm({ name: '', category: '', selectionType: 'PICK_ONE', required: false });
      await fetchGroups();

      // Auto-expand the new group and open the "add package" form
      const newGroupId = created.group?.id;
      if (newGroupId) {
        setCollapsed((prev) => { const next = new Set(prev); next.delete(newGroupId); return next; });
        // Expand the category too
        const cat = groupForm.category.trim() || 'Miscellaneous';
        setCollapsedCategories((prev) => { const next = new Set(prev); next.delete(cat); return next; });
        setAddingPackageToGroup(newGroupId);
        setPkgForm({ name: '', isDefault: false, allowQuantity: false, minQuantity: '1', maxQuantity: '', notes: '' });
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to create group');
    }
  }

  async function handleUpdateGroup(groupId: number) {
    setError('');
    try {
      await api.put(`/api/boms/${bomId}/options/groups/${groupId}`, {
        name: editGroupForm.name.trim(),
        category: editGroupForm.category.trim() || null,
        selectionType: editGroupForm.selectionType,
        required: editGroupForm.required,
      });
      setEditingGroup(null);
      void fetchGroups();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to update group');
    }
  }

  async function handleDeleteGroup(groupId: number) {
    setError('');
    try {
      await api.delete(`/api/boms/${bomId}/options/groups/${groupId}`);
      void fetchGroups();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to delete group');
    }
  }

  // ---- Package CRUD ----

  async function handleCreatePackage(groupId: number) {
    setError('');
    try {
      const created = await api.post<{ package: OptionPackage }>(`/api/boms/${bomId}/options/packages`, {
        optionGroupId: groupId,
        name: pkgForm.name.trim(),
        isDefault: pkgForm.isDefault,
        allowQuantity: pkgForm.allowQuantity,
        minQuantity: parseInt(pkgForm.minQuantity) || 1,
        maxQuantity: pkgForm.maxQuantity ? parseInt(pkgForm.maxQuantity) : null,
        notes: pkgForm.notes.trim() || null,
      });
      setAddingPackageToGroup(null);
      setPkgForm({ name: '', isDefault: false, allowQuantity: false, minQuantity: '1', maxQuantity: '', notes: '' });
      await fetchGroups();

      // Auto-open the package editor so user can add lines immediately
      if (created.package) {
        // Fetch the full package with lines from the refreshed groups
        const refreshedGroup = groups.find(g => g.id === groupId) ??
          (await api.get<{ groups: OptionGroup[] }>(`/api/boms/${bomId}/options`)).groups.find(g => g.id === groupId);
        const freshPkg = refreshedGroup?.packages.find(p => p.id === created.package.id);
        if (freshPkg) {
          setEditingPackage(freshPkg);
        }
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to create package');
    }
  }

  async function handleDeletePackage(packageId: number) {
    setError('');
    try {
      await api.delete(`/api/boms/${bomId}/options/packages/${packageId}`);
      void fetchGroups();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to delete package');
    }
  }

  async function handlePackageStatus(packageId: number, newStatus: string) {
    setError('');
    try {
      const result = await api.patch<{ status: string; package: { name: string }; warning?: string }>(`/api/boms/${bomId}/options/packages/${packageId}/status`, { status: newStatus });
      const action = newStatus === 'ACTIVE' ? 'activated' : newStatus === 'RETIRED' ? 'retired' : 'updated';
      let msg = `Package "${result.package.name}" ${action} successfully.`;
      if (result.warning) msg += ` ${result.warning}`;
      setSuccess(msg);
      void fetchGroups();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to change package status');
    }
  }

  // ---- Import ----

  async function handleImport() {
    setError('');
    try {
      const data = await api.post<{ groupsCopied: number; packagesCopied: number; linesCopied: number; flaggedCount: number }>(
        `/api/boms/${bomId}/options/import`,
        { sourceBomId: parseInt(importBomId) }
      );
      setShowImport(false);
      setImportBomId('');
      setSuccess(
        `Imported ${data.groupsCopied} groups with ${data.packagesCopied} packages and ${data.linesCopied} lines.` +
        (data.flaggedCount > 0 ? ` ${data.flaggedCount} packages contain REMOVE lines or cut materials — review these first.` : '') +
        ' All packages are in DRAFT status.'
      );
      void fetchGroups();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to import options');
    }
  }

  // ---- Permissions based on BOM status ----
  const canAddGroups = bomStatus === 'DRAFT' || bomStatus === 'ACTIVE';
  const canEditGroups = bomStatus === 'DRAFT';
  const canAddPackages = bomStatus === 'DRAFT' || bomStatus === 'ACTIVE';
  const isRetired = bomStatus === 'RETIRED';

  if (loading) return <p className="text-sm text-gray-400 py-2">Loading options...</p>;

  return (
    <div ref={sectionRef} className="space-y-3 border-t pt-4 mt-4">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-medium">Option Groups</Label>
        <div className="flex gap-2">
          {canAddGroups && groups.length === 0 && allBoms && allBoms.length > 0 && (
            <Button type="button" variant="outline" size="sm" onClick={() => setShowImport(true)}>
              Import from BOM
            </Button>
          )}
          {canAddGroups && (
            <Button type="button" variant="outline" size="sm" onClick={() => setShowGroupForm(true)}>
              <Plus className="h-4 w-4 mr-1" />
              Add Group
            </Button>
          )}
        </div>
      </div>

      {/* Fixed-position toast notifications */}
      {(error || success) && (
        <div className="fixed bottom-4 right-4 z-50 max-w-sm animate-in slide-in-from-bottom-2">
          {error && (
            <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 shadow-lg flex items-center justify-between gap-2">
              <span>{error}</span>
              <button type="button" onClick={() => setError('')} className="text-red-400 hover:text-red-600 flex-shrink-0">
                <X className="h-4 w-4" />
              </button>
            </div>
          )}
          {success && (
            <div className="rounded-md border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800 shadow-lg">
              {success}
            </div>
          )}
        </div>
      )}

      {/* Import dialog */}
      {showImport && (
        <div className="border rounded-md p-3 bg-gray-50 space-y-2">
          <Label className="text-sm">Import Options from Existing BOM</Label>
          <Select value={importBomId} onValueChange={setImportBomId}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select source BOM..." />
            </SelectTrigger>
            <SelectContent>
              {(allBoms ?? []).filter((b) => b.id !== bomId).map((b) => (
                <SelectItem key={b.id} value={String(b.id)}>
                  {b.bomCode} — {b.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex gap-2 justify-end">
            <Button type="button" variant="outline" size="sm" onClick={() => { setShowImport(false); setImportBomId(''); }}>
              Cancel
            </Button>
            <Button type="button" size="sm" disabled={!importBomId} onClick={() => setConfirmImport(true)}>
              Import
            </Button>
          </div>
        </div>
      )}

      {/* Group creation form */}
      {showGroupForm && (
        <div className="border rounded-md p-3 bg-gray-50 space-y-3" onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); } }}>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Group Name *</Label>
              <Input
                value={groupForm.name}
                onChange={(e) => setGroupForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g., Trim Package"
                className="h-8"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Category</Label>
              <Select value={groupForm.category} onValueChange={(v) => setGroupForm((f) => ({ ...f, category: v }))}>
                <SelectTrigger className="h-8">
                  <SelectValue placeholder="Select or leave blank..." />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORY_PRESETS.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Selection Type</Label>
              <Select value={groupForm.selectionType} onValueChange={(v) => setGroupForm((f) => ({ ...f, selectionType: v }))}>
                <SelectTrigger className="h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="PICK_ONE">Pick One</SelectItem>
                  <SelectItem value="PICK_MANY">Pick Many</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2 pt-4">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={groupForm.required}
                  onChange={(e) => setGroupForm((f) => ({ ...f, required: e.target.checked }))}
                  className="h-4 w-4 rounded border-gray-300"
                />
                Required
              </label>
              <span className="relative group/tip inline-flex items-center justify-center h-4 w-4 rounded-full border border-gray-300 text-[10px] font-semibold text-gray-400 cursor-help leading-none">
                i
                <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 hidden group-hover/tip:block w-52 px-2 py-1 rounded bg-gray-800 text-white text-[11px] font-normal leading-snug text-center z-50 pointer-events-none">
                  Operator must pick an option from this group when building a production order
                </span>
              </span>
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <Button type="button" variant="outline" size="sm" onClick={() => setShowGroupForm(false)}>
              Cancel
            </Button>
            <Button type="button" size="sm" disabled={!groupForm.name.trim()} onClick={handleCreateGroup}>
              Create Group
            </Button>
          </div>
        </div>
      )}

      {/* Groups list — organized by category */}
      {categories.map((cat) => (
        <div key={cat.name} className="space-y-1">
          {/* Category header */}
          <div
            className="flex items-center gap-2 px-3 py-2 bg-gray-100 rounded-md border border-gray-200 cursor-pointer select-none hover:bg-gray-150"
            onClick={() => toggleCategoryCollapse(cat.name)}
          >
            {collapsedCategories.has(cat.name) ? (
              <ChevronRight className="h-4 w-4 text-gray-500 flex-shrink-0" />
            ) : (
              <ChevronDown className="h-4 w-4 text-gray-500 flex-shrink-0" />
            )}
            <span className="font-semibold text-sm text-gray-700">{cat.name}</span>
            {cat.groups.length > 0 && (
              <span className="text-xs text-gray-400">{cat.groups.length} group{cat.groups.length !== 1 ? 's' : ''}</span>
            )}
          </div>

          {/* Groups within category */}
          {!collapsedCategories.has(cat.name) && (
            <div className="ml-4 space-y-2 mt-1">
              {cat.groups.length === 0 && (
                <p className="text-xs text-gray-400 py-1 px-2">
                  No option groups in this category.
                  {canAddGroups && (
                    <button
                      type="button"
                      className="ml-1 text-blue-600 hover:underline"
                      onClick={() => {
                        setShowGroupForm(true);
                        setGroupForm({ name: '', category: cat.name, selectionType: 'PICK_ONE', required: false });
                      }}
                    >
                      Add one
                    </button>
                  )}
                </p>
              )}

              {cat.groups.map((group) => (
                <div key={group.id} className="border border-gray-200 rounded-md bg-white shadow-sm">
                  {/* Group header */}
                  <div
                    className="flex items-center gap-2 px-3 py-2.5 bg-gray-50/80 border-b border-gray-100 rounded-t-md cursor-pointer select-none hover:bg-gray-50"
                    onClick={() => toggleCollapse(group.id)}
                  >
                    {collapsed.has(group.id) ? (
                      <ChevronRight className="h-4 w-4 text-gray-400 flex-shrink-0" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-gray-400 flex-shrink-0" />
                    )}

                    {editingGroup === group.id ? (
                      <div
                        className="flex-1 flex gap-2 items-center"
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            e.stopPropagation();
                            void handleUpdateGroup(group.id);
                          }
                        }}
                      >
                        <Input
                          value={editGroupForm.name}
                          onChange={(e) => setEditGroupForm((f) => ({ ...f, name: e.target.value }))}
                          className="h-7 text-sm w-48 min-w-0"
                        />
                        <Select value={editGroupForm.category} onValueChange={(v) => setEditGroupForm((f) => ({ ...f, category: v }))}>
                          <SelectTrigger className="h-7 w-28 text-xs">
                            <SelectValue placeholder="Category" />
                          </SelectTrigger>
                          <SelectContent>
                            {CATEGORY_PRESETS.map((c) => (
                              <SelectItem key={c} value={c}>{c}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Select value={editGroupForm.selectionType} onValueChange={(v) => setEditGroupForm((f) => ({ ...f, selectionType: v }))}>
                          <SelectTrigger className="h-7 w-24 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="PICK_ONE">Pick One</SelectItem>
                            <SelectItem value="PICK_MANY">Pick Many</SelectItem>
                          </SelectContent>
                        </Select>
                        <label className="flex items-center gap-1 text-xs">
                          <input
                            type="checkbox"
                            checked={editGroupForm.required}
                            onChange={(e) => setEditGroupForm((f) => ({ ...f, required: e.target.checked }))}
                            className="h-3 w-3"
                          />
                          Required
                        </label>
                        <span className="relative group/tip2 inline-flex items-center justify-center h-4 w-4 rounded-full border border-gray-300 text-[10px] font-semibold text-gray-400 cursor-help leading-none flex-shrink-0">
                          i
                          <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 hidden group-hover/tip2:block w-52 px-2 py-1 rounded bg-gray-800 text-white text-[11px] font-normal leading-snug text-center z-50 pointer-events-none">
                            Operator must pick an option from this group when building a production order
                          </span>
                        </span>
                        <Button type="button" size="sm" className="h-7 text-xs" onClick={() => handleUpdateGroup(group.id)}>
                          Save
                        </Button>
                        <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={() => setEditingGroup(null)}>
                          Cancel
                        </Button>
                      </div>
                    ) : (
                      <>
                        <span className="font-medium text-sm flex-1">{group.name}</span>
                        <Badge variant="outline" className="text-xs">
                          {group.selectionType === 'PICK_ONE' ? 'Pick One' : 'Pick Many'}
                        </Badge>
                        {group.required && (
                          <Badge variant="default" className="text-xs">Required</Badge>
                        )}
                        <span className="text-xs text-gray-400">{group.packages.length} pkg{group.packages.length !== 1 ? 's' : ''}</span>

                        {!isRetired && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                              <Button variant="ghost" size="icon" className="h-6 w-6">
                                <MoreHorizontal className="h-3 w-3" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              {canEditGroups && (
                                <DropdownMenuItem onClick={(e) => {
                                  e.stopPropagation();
                                  setEditingGroup(group.id);
                                  setEditGroupForm({
                                    name: group.name,
                                    category: group.category ?? '',
                                    selectionType: group.selectionType,
                                    required: group.required,
                                  });
                                }}>
                                  Edit Group
                                </DropdownMenuItem>
                              )}
                              {canEditGroups && (
                                <DropdownMenuItem
                                  className="text-red-600"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setConfirmDelete({ type: 'group', id: group.id, name: group.name });
                                  }}
                                >
                                  Delete Group
                                </DropdownMenuItem>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </>
                    )}
                  </div>

                  {/* Packages list (collapsible) */}
                  {!collapsed.has(group.id) && (
                    <div className="px-3 py-2 space-y-2">
                      {group.packages.length === 0 && (
                        <p className="text-xs text-gray-400">
                          No packages yet.
                          {canAddPackages && (
                            <button
                              type="button"
                              className="ml-1 text-blue-600 hover:underline"
                              onClick={() => {
                                setAddingPackageToGroup(group.id);
                                setPkgForm({ name: '', isDefault: false, allowQuantity: false, minQuantity: '1', maxQuantity: '', notes: '' });
                              }}
                            >
                              Add one
                            </button>
                          )}
                        </p>
                      )}

                      {group.packages.map((pkg) => (
                        <div key={pkg.id} className="border border-gray-150 rounded-md p-2.5 space-y-1.5 bg-white ml-2">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium flex-1">{pkg.name}</span>
                            {pkg.isDefault && <Badge className="text-xs bg-blue-100 text-blue-700 border-blue-200">Default</Badge>}
                            <Badge variant={PKG_STATUS_BADGE[pkg.status] ?? 'outline'} className="text-xs">
                              {pkg.status}
                            </Badge>
                            {pkg.allowQuantity && (
                              <span className="text-xs text-gray-400">
                                Qty: {pkg.minQuantity}–{pkg.maxQuantity ?? '∞'}
                              </span>
                            )}

                            {!isRetired && (
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="icon" className="h-6 w-6">
                                    <MoreHorizontal className="h-3 w-3" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  {pkg.status === 'DRAFT' && (
                                    <DropdownMenuItem onClick={() => setEditingPackage(pkg)}>
                                      Edit Package
                                    </DropdownMenuItem>
                                  )}
                                  {pkg.status === 'DRAFT' && (
                                    <DropdownMenuItem onClick={() => setConfirmStatus({ id: pkg.id, newStatus: 'ACTIVE', name: pkg.name })}>
                                      Activate
                                    </DropdownMenuItem>
                                  )}
                                  {pkg.status === 'ACTIVE' && (
                                    <DropdownMenuItem onClick={() => setConfirmStatus({ id: pkg.id, newStatus: 'RETIRED', name: pkg.name })}>
                                      Retire
                                    </DropdownMenuItem>
                                  )}
                                  {pkg.status === 'RETIRED' && (
                                    <DropdownMenuItem onClick={() => setConfirmStatus({ id: pkg.id, newStatus: 'ACTIVE', name: pkg.name })}>
                                      Re-activate
                                    </DropdownMenuItem>
                                  )}
                                  {pkg.status === 'DRAFT' && (
                                    <DropdownMenuItem
                                      className="text-red-600"
                                      onClick={() => setConfirmDelete({ type: 'package', id: pkg.id, name: pkg.name })}
                                    >
                                      Delete
                                    </DropdownMenuItem>
                                  )}
                                </DropdownMenuContent>
                              </DropdownMenu>
                            )}
                          </div>

                          {/* Line summaries — vertical adds/removes layout */}
                          {pkg.lines.length > 0 && (() => {
                            const adds = pkg.lines.filter(l => l.action === 'ADD');
                            const removes = pkg.lines.filter(l => l.action === 'REMOVE');
                            // When parent group is collapsed, show compact count
                            if (collapsed.has(group.id)) {
                              return (
                                <span className="text-xs text-gray-500">
                                  {adds.length > 0 && <span className="text-green-700">Adds {adds.length}</span>}
                                  {adds.length > 0 && removes.length > 0 && ', '}
                                  {removes.length > 0 && <span className="text-red-700">Removes {removes.length}</span>}
                                </span>
                              );
                            }
                            return (
                              <div className="space-y-1">
                                {adds.length > 0 && (
                                  <div className="border-l-2 border-green-300 pl-2 space-y-0.5">
                                    {adds.map((line) => {
                                      const cutChips = formatCutPieceChips(line.cutDetails);
                                      return (
                                        <div key={line.id} className="text-xs text-green-700" title={line.item.itemCode}>
                                          + {line.item.description}
                                          {cutChips ? ` (${cutChips.join(' + ')})` : ` ×${line.quantityPer}`}
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}
                                {removes.length > 0 && (
                                  <div className="border-l-2 border-red-300 pl-2 space-y-0.5">
                                    {removes.map((line) => (
                                      <div key={line.id} className="text-xs text-red-700" title={line.item.itemCode}>
                                        − {line.item.description} ×{line.quantityPer}
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            );
                          })()}

                          {pkg.lines.length === 0 && (
                            <p className="text-xs text-gray-400">No component lines — {pkg.status === 'DRAFT' ? 'edit to add items' : 'empty package'}</p>
                          )}

                          {pkg.notes && <p className="text-xs text-gray-400 italic">{pkg.notes}</p>}
                        </div>
                      ))}

                      {/* Add package button */}
                      {canAddPackages && addingPackageToGroup !== group.id && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="text-xs h-7 ml-2"
                          onClick={() => {
                            setAddingPackageToGroup(group.id);
                            setPkgForm({ name: '', isDefault: false, allowQuantity: false, minQuantity: '1', maxQuantity: '', notes: '' });
                          }}
                        >
                          <Plus className="h-3 w-3 mr-1" />
                          Add Package to {group.name}
                        </Button>
                      )}

                      {/* Package creation form */}
                      {addingPackageToGroup === group.id && (
                        <div className="border rounded p-2 bg-gray-50 space-y-2" onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); } }}>
                          <div className="grid grid-cols-2 gap-2">
                            <div className="space-y-1">
                              <Label className="text-xs">Package Name *</Label>
                              <Input
                                value={pkgForm.name}
                                onChange={(e) => setPkgForm((f) => ({ ...f, name: e.target.value }))}
                                placeholder="e.g., Blackout Trim"
                                className="h-7 text-sm"
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">Notes</Label>
                              <Input
                                value={pkgForm.notes}
                                onChange={(e) => setPkgForm((f) => ({ ...f, notes: e.target.value }))}
                                placeholder="Optional notes..."
                                className="h-7 text-sm"
                              />
                            </div>
                          </div>
                          <div className="flex items-center gap-4">
                            <label className="flex items-center gap-1.5 text-xs">
                              <input
                                type="checkbox"
                                checked={pkgForm.isDefault}
                                onChange={(e) => setPkgForm((f) => ({ ...f, isDefault: e.target.checked }))}
                                className="h-3.5 w-3.5 rounded border-gray-300"
                              />
                              Default
                            </label>
                            <label className="flex items-center gap-1.5 text-xs">
                              <input
                                type="checkbox"
                                checked={pkgForm.allowQuantity}
                                onChange={(e) => setPkgForm((f) => ({ ...f, allowQuantity: e.target.checked }))}
                                className="h-3.5 w-3.5 rounded border-gray-300"
                              />
                              Allow Quantity
                            </label>
                            {pkgForm.allowQuantity && (
                              <>
                                <div className="flex items-center gap-1">
                                  <Label className="text-xs">Min</Label>
                                  <Input
                                    type="number"
                                    min="1"
                                    value={pkgForm.minQuantity}
                                    onChange={(e) => setPkgForm((f) => ({ ...f, minQuantity: e.target.value }))}
                                    className="h-7 w-16 text-xs"
                                  />
                                </div>
                                <div className="flex items-center gap-1">
                                  <Label className="text-xs">Max</Label>
                                  <Input
                                    type="number"
                                    min="1"
                                    value={pkgForm.maxQuantity}
                                    onChange={(e) => setPkgForm((f) => ({ ...f, maxQuantity: e.target.value }))}
                                    placeholder="∞"
                                    className="h-7 w-16 text-xs"
                                  />
                                </div>
                              </>
                            )}
                          </div>
                          <div className="flex gap-2 justify-end">
                            <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={() => setAddingPackageToGroup(null)}>
                              Cancel
                            </Button>
                            <Button type="button" size="sm" className="h-7 text-xs" disabled={!pkgForm.name.trim()} onClick={() => handleCreatePackage(group.id)}>
                              Create Package
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}

              {/* Add group to this category */}
              {canAddGroups && cat.groups.length > 0 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-xs h-7"
                  onClick={() => {
                    setShowGroupForm(true);
                    setGroupForm({ name: '', category: cat.name, selectionType: 'PICK_ONE', required: false });
                  }}
                >
                  <Plus className="h-3 w-3 mr-1" />
                  Add Group to {cat.name}
                </Button>
              )}
            </div>
          )}
        </div>
      ))}

      {/* Confirm delete dialog */}
      <ConfirmDialog
        open={confirmDelete !== null}
        onOpenChange={(open) => { if (!open) setConfirmDelete(null); }}
        title={`Delete ${confirmDelete?.type === 'group' ? 'Option Group' : 'Option Package'}?`}
        description={
          confirmDelete && (
            <span>
              Permanently delete <strong>{confirmDelete.name}</strong>?
              {confirmDelete.type === 'group' && ' This will also delete all packages and lines within this group.'}
              {' '}This cannot be undone.
            </span>
          )
        }
        confirmLabel="Delete"
        confirmVariant="destructive"
        onConfirm={() => {
          if (confirmDelete) {
            if (confirmDelete.type === 'group') {
              void handleDeleteGroup(confirmDelete.id);
            } else {
              void handleDeletePackage(confirmDelete.id);
            }
            setConfirmDelete(null);
          }
        }}
      />

      {/* Confirm status change dialog */}
      <ConfirmDialog
        open={confirmStatus !== null}
        onOpenChange={(open) => { if (!open) setConfirmStatus(null); }}
        title="Change Package Status?"
        description={
          confirmStatus && (
            <span>
              Change <strong>{confirmStatus.name}</strong> to <strong>{confirmStatus.newStatus}</strong>?
            </span>
          )
        }
        confirmLabel={`Set to ${confirmStatus?.newStatus ?? ''}`}
        confirmVariant={confirmStatus?.newStatus === 'RETIRED' ? 'destructive' : 'default'}
        onConfirm={() => {
          if (confirmStatus) {
            void handlePackageStatus(confirmStatus.id, confirmStatus.newStatus);
            setConfirmStatus(null);
          }
        }}
      />

      <ConfirmDialog
        open={confirmImport}
        onOpenChange={setConfirmImport}
        title="Import Option Groups?"
        description={
          <span>
            Import all option groups, packages, and lines from <strong>{(allBoms ?? []).find(b => String(b.id) === importBomId)?.bomCode ?? 'selected BOM'}</strong>? This will copy everything into this BOM as DRAFT.
          </span>
        }
        confirmLabel="Import"
        onConfirm={() => {
          setConfirmImport(false);
          void handleImport();
        }}
      />

      {/* Package editor dialog */}
      {editingPackage && (
        <PackageEditorDialog
          bomId={bomId}
          pkg={editingPackage}
          items={items}
          onClose={() => setEditingPackage(null)}
          onSaved={() => { setEditingPackage(null); void fetchGroups(); }}
        />
      )}
    </div>
  );
}
