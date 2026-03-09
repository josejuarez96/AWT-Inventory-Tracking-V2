import { useState, useEffect, useRef } from 'react';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Search, ArrowLeft } from 'lucide-react';

type OrderResult = {
  id: number;
  orderNumber: string;
  vinReference: string | null;
  configurationKey: string | null;
  finishedGood: { id: number; itemCode: string; description: string };
  bom: { id: number; bomCode: string; name: string } | null;
  createdAt: string;
};

type ConfigResponse = {
  orderId: number;
  configurationKey: string | null;
  configurationSnapshot: {
    bomId: number;
    bomCode: string;
    selections: Array<{
      groupId: number;
      groupName: string;
      selectionType: string;
      packageId: number | null;
      packageName: string;
      quantity: number;
      allowQuantity: boolean;
    }>;
    deviations: unknown[];
  } | null;
  vinReference: string | null;
  finishedGood: { id: number; itemCode: string; description: string };
  bom: { id: number; bomCode: string; name: string } | null;
};

export type RepeatOrderConfig = {
  finishedGoodId: number;
  bomId: number;
  selections: Array<{ groupId: number; packageId: number | null; quantity: number }>;
};

type Props = {
  open: boolean;
  onClose: () => void;
  onSelect: (config: RepeatOrderConfig) => void;
};

export function RepeatOrderDialog({ open, onClose, onSelect }: Props) {
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<OrderResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  // Detail view
  const [selectedConfig, setSelectedConfig] = useState<ConfigResponse | null>(null);
  const [isLoadingConfig, setIsLoadingConfig] = useState(false);
  const [warnings, setWarnings] = useState<string[]>([]);

  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Live typeahead: auto-search as user types (debounced)
  useEffect(() => {
    if (!search.trim()) {
      setResults([]);
      setHasSearched(false);
      return;
    }
    debounceRef.current = setTimeout(() => {
      void doSearch(search.trim());
    }, 300);
    return () => clearTimeout(debounceRef.current);
  }, [search]); // eslint-disable-line react-hooks/exhaustive-deps

  async function doSearch(term: string) {
    setIsSearching(true);
    setHasSearched(true);
    setSelectedConfig(null);
    try {
      const data = await api.get<{ orders: OrderResult[] }>(
        `/api/production/orders?search=${encodeURIComponent(term)}&limit=10`
      );
      setResults(data.orders);
    } catch {
      setResults([]);
    } finally {
      setIsSearching(false);
    }
  }

  async function handleSearch() {
    if (!search.trim()) return;
    void doSearch(search.trim());
  }

  async function handleSelectOrder(order: OrderResult) {
    if (!order.bom) return;
    setIsLoadingConfig(true);
    setWarnings([]);
    try {
      const config = await api.get<ConfigResponse>(
        `/api/production/orders/${order.id}/configuration`
      );
      setSelectedConfig(config);

      // Check if BOM is still active
      if (config.bom) {
        try {
          const bomData = await api.get<{ bom: { status: string } }>(`/api/boms/${config.bom.id}`);
          if (bomData.bom.status === 'RETIRED') {
            setWarnings((w) => [...w, `BOM "${config.bom!.bomCode}" has been retired since this order was created.`]);
          }
        } catch {
          setWarnings((w) => [...w, `Could not verify BOM status — it may have been deleted.`]);
        }
      }
    } catch {
      setWarnings(['Failed to load order configuration.']);
    } finally {
      setIsLoadingConfig(false);
    }
  }

  function handleConfirm() {
    if (!selectedConfig?.configurationSnapshot || !selectedConfig.bom) return;
    const snap = selectedConfig.configurationSnapshot;
    onSelect({
      finishedGoodId: selectedConfig.finishedGood.id,
      bomId: selectedConfig.bom.id,
      selections: snap.selections.map((s) => ({
        groupId: s.groupId,
        packageId: s.packageId,
        quantity: s.quantity,
      })),
    });
    handleClose();
  }

  function handleClose() {
    setSearch('');
    setResults([]);
    setHasSearched(false);
    setSelectedConfig(null);
    setWarnings([]);
    onClose();
  }

  const activeSelections = selectedConfig?.configurationSnapshot?.selections.filter(
    (s) => s.packageId != null
  ) ?? [];

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Copy from Previous Order</DialogTitle>
        </DialogHeader>

        {!selectedConfig ? (
          /* ── Search View ── */
          <div className="space-y-3">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void handleSearch();
              }}
              className="flex gap-2"
            >
              <Input
                placeholder="Search by order #, VIN, or finished good..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="flex-1"
              />
              <Button type="submit" disabled={isSearching || !search.trim()}>
                <Search className="h-4 w-4 mr-1" />
                Search
              </Button>
            </form>

            {isSearching && <p className="text-sm text-muted-foreground">Searching...</p>}

            {hasSearched && !isSearching && results.length === 0 && (
              <p className="text-sm text-muted-foreground">No orders found.</p>
            )}

            {results.length > 0 && (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-16">Order #</TableHead>
                      <TableHead>Finished Good</TableHead>
                      <TableHead className="w-28">BOM</TableHead>
                      <TableHead className="w-24">VIN</TableHead>
                      <TableHead className="w-24">Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {results.map((order) => (
                      <TableRow
                        key={order.id}
                        className={order.bom ? 'cursor-pointer hover:bg-muted/50' : 'opacity-50'}
                        onClick={() => order.bom && handleSelectOrder(order)}
                      >
                        <TableCell className="font-mono text-xs">{order.orderNumber}</TableCell>
                        <TableCell className="text-sm">
                          {order.finishedGood.itemCode} — {order.finishedGood.description}
                        </TableCell>
                        <TableCell className="text-xs">
                          {order.bom?.bomCode ?? <span className="text-muted-foreground">No BOM</span>}
                        </TableCell>
                        <TableCell className="text-xs font-mono">
                          {order.vinReference ?? '—'}
                        </TableCell>
                        <TableCell className="text-xs">{formatDate(order.createdAt)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        ) : (
          /* ── Config Detail View ── */
          <div className="space-y-3">
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setSelectedConfig(null)}>
              <ArrowLeft className="h-3 w-3 mr-1" /> Back to results
            </Button>

            {isLoadingConfig ? (
              <p className="text-sm text-muted-foreground">Loading configuration...</p>
            ) : (
              <>
                <div className="rounded border p-3 space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Finished Good</span>
                    <span className="font-medium">
                      {selectedConfig.finishedGood.itemCode} — {selectedConfig.finishedGood.description}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">BOM</span>
                    <span className="font-medium">{selectedConfig.bom?.bomCode ?? '—'}</span>
                  </div>
                  {selectedConfig.vinReference && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Original VIN</span>
                      <span className="font-mono text-xs">{selectedConfig.vinReference} (will not be copied)</span>
                    </div>
                  )}
                </div>

                {activeSelections.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-sm font-medium">Selected Options</p>
                    <div className="flex flex-wrap gap-1.5">
                      {activeSelections.map((s, i) => (
                        <Badge key={i} variant="outline" className="text-xs">
                          {s.groupName}: {s.packageName}
                          {s.allowQuantity && s.quantity > 1 && ` ×${s.quantity}`}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {activeSelections.length === 0 && selectedConfig.configurationSnapshot && (
                  <p className="text-sm text-muted-foreground">Base configuration (no options selected)</p>
                )}

                {!selectedConfig.configurationSnapshot && (
                  <p className="text-sm text-muted-foreground">
                    This order was created without configurable options (legacy order).
                  </p>
                )}

                {warnings.length > 0 && (
                  <Alert variant="destructive">
                    <AlertDescription>
                      {warnings.map((w, i) => (
                        <p key={i}>{w}</p>
                      ))}
                    </AlertDescription>
                  </Alert>
                )}

                <div className="flex justify-end gap-2 pt-2">
                  <Button variant="outline" onClick={handleClose}>
                    Cancel
                  </Button>
                  <Button
                    onClick={handleConfirm}
                    disabled={!selectedConfig.bom || !selectedConfig.configurationSnapshot}
                  >
                    Load Configuration
                  </Button>
                </div>
              </>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
