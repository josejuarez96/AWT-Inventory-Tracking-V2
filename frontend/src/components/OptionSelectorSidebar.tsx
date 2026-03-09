import { useMemo } from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Loader2 } from 'lucide-react';
import { sortCategories } from '@/lib/categoryPresets';

// ── Types ────────────────────────────────────────────────────────────

export type OptionPackage = {
  id: number;
  name: string;
  isDefault: boolean;
  status: string;
  allowQuantity: boolean;
  minQuantity: number;
  maxQuantity: number | null;
  notes: string | null;
};

export type OptionGroup = {
  id: number;
  name: string;
  category: string | null;
  selectionType: 'PICK_ONE' | 'PICK_MANY';
  required: boolean;
  packages: OptionPackage[];
};

// One entry per selected package. Matches backend expectations.
// PICK_ONE groups have exactly one entry (or null packageId for "None").
// PICK_MANY groups have 0..N entries.
export type Selection = {
  groupId: number;
  packageId: number | null;
  quantity: number;
};

type Props = {
  groups: OptionGroup[];
  selections: Selection[];
  onSelectionsChange: (selections: Selection[]) => void;
  vinReference: string;
  onVinReferenceChange: (vin: string) => void;
  unitCount?: number;
  isResolving?: boolean;
};

// ── Component ────────────────────────────────────────────────────────

export function OptionSelectorSidebar({
  groups,
  selections,
  onSelectionsChange,
  vinReference,
  onVinReferenceChange,
  unitCount = 1,
  isResolving = false,
}: Props) {
  // Group by category for display
  const categories = useMemo(() => {
    const catMap = new Map<string, OptionGroup[]>();
    for (const g of groups) {
      const cat = g.category || 'Miscellaneous';
      if (!catMap.has(cat)) catMap.set(cat, []);
      catMap.get(cat)!.push(g);
    }
    const entries = [...catMap.entries()].map(([name, grps]) => ({ name, groups: grps }));
    return sortCategories(entries);
  }, [groups]);

  // Get all selections for a specific group
  function getGroupSelections(groupId: number): Selection[] {
    return selections.filter(s => s.groupId === groupId);
  }

  // PICK_ONE: replace the single selection for this group
  function setPickOneSelection(groupId: number, packageId: number | null) {
    const otherSelections = selections.filter(s => s.groupId !== groupId);
    const newSel: Selection = { groupId, packageId, quantity: 1 };
    onSelectionsChange([...otherSelections, newSel]);
  }

  // PICK_MANY: toggle a package on/off for this group
  function togglePickManyPackage(groupId: number, pkg: OptionPackage) {
    const existing = selections.find(s => s.groupId === groupId && s.packageId === pkg.id);
    if (existing) {
      // Remove this package
      onSelectionsChange(selections.filter(s => !(s.groupId === groupId && s.packageId === pkg.id)));
    } else {
      // Add this package
      const newSel: Selection = {
        groupId,
        packageId: pkg.id,
        quantity: pkg.allowQuantity ? pkg.minQuantity : 1,
      };
      onSelectionsChange([...selections, newSel]);
    }
  }

  // PICK_MANY: update quantity for a selected package
  function updatePickManyQuantity(groupId: number, packageId: number, quantity: number) {
    onSelectionsChange(
      selections.map(s =>
        s.groupId === groupId && s.packageId === packageId
          ? { ...s, quantity }
          : s
      )
    );
  }

  return (
    <div className="w-[300px] shrink-0 border-l bg-gray-50/50 p-4 space-y-5 overflow-y-auto max-h-[calc(100vh-200px)]">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-sm">Configuration</h3>
        {isResolving && (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" />
            Calculating...
          </span>
        )}
      </div>

      <div className={isResolving ? 'opacity-60 pointer-events-none' : ''}>
        {categories.map(({ name: catName, groups: catGroups }) => (
          <div key={catName} className="mb-4">
            {categories.length > 1 && (
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                {catName}
              </p>
            )}

            {catGroups.map(group => {
              const activePackages = group.packages.filter(p => p.status === 'ACTIVE');
              if (activePackages.length === 0) return null;

              const groupSels = getGroupSelections(group.id);

              return (
                <div key={group.id} className="mb-3">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <Label className="text-xs font-medium">{group.name}</Label>
                    {group.required && (
                      <Badge variant="outline" className="text-[10px] px-1 py-0 h-4 border-red-300 text-red-600">
                        Required
                      </Badge>
                    )}
                    <Badge variant="secondary" className="text-[10px] px-1 py-0 h-4">
                      {group.selectionType === 'PICK_ONE' ? 'Pick one' : 'Pick many'}
                    </Badge>
                  </div>

                  {group.selectionType === 'PICK_ONE' ? (
                    <PickOneSelector
                      group={group}
                      packages={activePackages}
                      selectedPkgId={groupSels[0]?.packageId ?? null}
                      onSelect={pkgId => setPickOneSelection(group.id, pkgId)}
                    />
                  ) : (
                    <PickManySelector
                      groupId={group.id}
                      packages={activePackages}
                      selectedPackageIds={new Set(groupSels.map(s => s.packageId).filter((id): id is number => id !== null))}
                      quantityMap={new Map(groupSels.filter(s => s.packageId !== null).map(s => [s.packageId!, s.quantity]))}
                      onToggle={pkg => togglePickManyPackage(group.id, pkg)}
                      onQuantityChange={(pkgId, qty) => updatePickManyQuantity(group.id, pkgId, qty)}
                    />
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {/* VIN Reference */}
      <div className="pt-3 border-t space-y-1.5">
        <Label className="text-xs">
          VIN Reference{unitCount > 1 ? 's' : ''}
        </Label>
        {unitCount <= 1 ? (
          <Input
            value={vinReference}
            onChange={e => onVinReferenceChange(e.target.value)}
            placeholder="Optional"
            maxLength={50}
            className="h-8 text-sm"
          />
        ) : (
          <div className="space-y-1">
            {Array.from({ length: unitCount }, (_, i) => {
              const vins = vinReference ? vinReference.split(',') : [];
              return (
                <div key={i} className="flex items-center gap-1.5">
                  <span className="text-[10px] text-muted-foreground w-8 shrink-0">#{i + 1}</span>
                  <Input
                    value={vins[i]?.trim() ?? ''}
                    onChange={e => {
                      const updated = [...vins];
                      while (updated.length <= i) updated.push('');
                      updated[i] = e.target.value;
                      onVinReferenceChange(updated.join(','));
                    }}
                    placeholder="Optional"
                    maxLength={50}
                    className="h-7 text-xs"
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ── PICK_ONE: Radio buttons ──────────────────────────────────────────

function PickOneSelector({
  group,
  packages,
  selectedPkgId,
  onSelect,
}: {
  group: OptionGroup;
  packages: OptionPackage[];
  selectedPkgId: number | null;
  onSelect: (packageId: number | null) => void;
}) {
  const radioName = `group-${group.id}`;

  return (
    <div className="space-y-1 pl-1">
      {!group.required && (
        <label className="flex items-center gap-2 cursor-pointer text-xs py-0.5">
          <input
            type="radio"
            name={radioName}
            checked={selectedPkgId === null}
            onChange={() => onSelect(null)}
            className="h-3 w-3 text-primary"
          />
          <span className="text-muted-foreground italic">None (use base)</span>
        </label>
      )}
      {packages.map(pkg => (
        <label key={pkg.id} className="flex items-center gap-2 cursor-pointer text-xs py-0.5">
          <input
            type="radio"
            name={radioName}
            checked={selectedPkgId === pkg.id}
            onChange={() => onSelect(pkg.id)}
            className="h-3 w-3 text-primary"
          />
          <span>{pkg.name}</span>
          {pkg.isDefault && (
            <span className="text-[10px] text-muted-foreground">(default)</span>
          )}
        </label>
      ))}
    </div>
  );
}

// ── PICK_MANY: Checkboxes ────────────────────────────────────────────

function PickManySelector({
  packages,
  selectedPackageIds,
  quantityMap,
  onToggle,
  onQuantityChange,
}: {
  groupId: number;
  packages: OptionPackage[];
  selectedPackageIds: Set<number>;
  quantityMap: Map<number, number>;
  onToggle: (pkg: OptionPackage) => void;
  onQuantityChange: (packageId: number, quantity: number) => void;
}) {
  return (
    <div className="space-y-1 pl-1">
      {packages.map(pkg => {
        const isChecked = selectedPackageIds.has(pkg.id);
        return (
          <div key={pkg.id} className="flex items-center gap-2">
            <label className="flex items-center gap-2 cursor-pointer text-xs py-0.5">
              <input
                type="checkbox"
                checked={isChecked}
                onChange={() => onToggle(pkg)}
                className="h-3 w-3"
              />
              <span>{pkg.name}</span>
            </label>
            {pkg.allowQuantity && isChecked && (
              <div className="flex items-center gap-1">
                <span className="text-[10px] text-muted-foreground">Qty:</span>
                <Input
                  type="number"
                  min={1}
                  value={quantityMap.get(pkg.id) ?? pkg.minQuantity}
                  onChange={e => {
                    const raw = e.target.value;
                    // Allow free typing — parse as int, default to empty string behavior
                    const val = raw === '' ? 0 : parseInt(raw);
                    if (!isNaN(val)) onQuantityChange(pkg.id, val);
                  }}
                  onBlur={e => {
                    // Enforce min/max on blur
                    const val = parseInt(e.target.value) || pkg.minQuantity;
                    const clamped = Math.max(
                      pkg.minQuantity,
                      pkg.maxQuantity ? Math.min(val, pkg.maxQuantity) : val
                    );
                    onQuantityChange(pkg.id, clamped);
                  }}
                  className="h-6 w-16 text-xs px-1"
                />
                <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                  ({pkg.minQuantity}–{pkg.maxQuantity ?? '∞'})
                </span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
