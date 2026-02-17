import { useEffect, useMemo, useState, useCallback } from 'react';
import { api } from '@/lib/api';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
import { ArrowUp, ArrowDown, ArrowUpDown, ChevronLeft, ChevronRight } from 'lucide-react';

type StockItem = {
  id: number;
  itemCode: string;
  description: string;
  category: string | null;
  unitOfMeasure: string;
  minQuantity: number | null;
};

type StockPosition = {
  item: StockItem;
  adelQty: number;
  calhounQty: number;
  totalQty: number;
  avgCost: number | null;
  totalValue: number | null;
};

type PaginatedResponse = {
  positions: StockPosition[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

type SortKey = 'itemCode' | 'description' | 'category' | 'adelQty' | 'calhounQty' | 'totalQty' | 'avgCost' | 'totalValue';
type SortDir = 'asc' | 'desc';

export function StockPositionPage() {
  const [positions, setPositions] = useState<StockPosition[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [sortKey, setSortKey] = useState<SortKey>('itemCode');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 50;

  // Debounce search input (300ms)
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Reset to page 1 when search changes
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch]);

  // Fetch data from server
  useEffect(() => {
    async function load() {
      setIsLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        if (debouncedSearch) params.set('search', debouncedSearch);
        params.set('page', String(page));
        params.set('limit', String(limit));

        const data = await api.get<PaginatedResponse>(
          `/api/transactions/stock-position?${params.toString()}`
        );
        setPositions(data.positions);
        setTotal(data.total);
        setTotalPages(data.totalPages);
      } catch {
        setError('Failed to load stock positions.');
      } finally {
        setIsLoading(false);
      }
    }
    load();
  }, [debouncedSearch, page]);

  // Extract unique categories for filter dropdown (client-side filter on current page)
  const categories = useMemo(() => {
    const cats = new Set<string>();
    positions.forEach((p) => {
      if (p.item.category) cats.add(p.item.category);
    });
    return Array.from(cats).sort();
  }, [positions]);

  // Client-side category filter on paginated results
  const filtered = useMemo(() => {
    if (categoryFilter === 'ALL') return positions;
    return positions.filter((p) => p.item.category === categoryFilter);
  }, [positions, categoryFilter]);

  // Client-side sort
  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      let valA: string | number | null;
      let valB: string | number | null;

      switch (sortKey) {
        case 'itemCode':
          valA = a.item.itemCode;
          valB = b.item.itemCode;
          break;
        case 'description':
          valA = a.item.description;
          valB = b.item.description;
          break;
        case 'category':
          valA = a.item.category ?? '';
          valB = b.item.category ?? '';
          break;
        case 'adelQty':
          valA = a.adelQty;
          valB = b.adelQty;
          break;
        case 'calhounQty':
          valA = a.calhounQty;
          valB = b.calhounQty;
          break;
        case 'totalQty':
          valA = a.totalQty;
          valB = b.totalQty;
          break;
        case 'avgCost':
          valA = a.avgCost ?? -1;
          valB = b.avgCost ?? -1;
          break;
        case 'totalValue':
          valA = a.totalValue ?? -1;
          valB = b.totalValue ?? -1;
          break;
        default:
          return 0;
      }

      if (typeof valA === 'string' && typeof valB === 'string') {
        return sortDir === 'asc'
          ? valA.localeCompare(valB)
          : valB.localeCompare(valA);
      }
      return sortDir === 'asc'
        ? (valA as number) - (valB as number)
        : (valB as number) - (valA as number);
    });
    return arr;
  }, [filtered, sortKey, sortDir]);

  const toggleSort = useCallback((key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  }, [sortKey]);

  const SortIcon = ({ column }: { column: SortKey }) => {
    if (sortKey !== column) return <ArrowUpDown className="ml-1 inline h-3 w-3 text-gray-400" />;
    return sortDir === 'asc'
      ? <ArrowUp className="ml-1 inline h-3 w-3" />
      : <ArrowDown className="ml-1 inline h-3 w-3" />;
  };

  const isLowStock = (p: StockPosition) =>
    p.item.minQuantity !== null && p.totalQty <= p.item.minQuantity;

  const formatCurrency = (val: number | null) =>
    val !== null ? `$${val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '--';

  // Totals for current page
  const grandTotal = useMemo(() => {
    let value = 0;
    sorted.forEach((p) => {
      if (p.totalValue !== null) value += p.totalValue;
    });
    return Math.round(value * 100) / 100;
  }, [sorted]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Stock Position</h1>
        <p className="mt-1 text-sm text-gray-500">
          Current on-hand quantities and valuation by location, calculated from all transactions.
        </p>
      </div>

      <div className="flex flex-wrap gap-4 items-end">
        <Input
          placeholder="Search by item code, description, or category..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="All Categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All Categories</SelectItem>
            {categories.map((cat) => (
              <SelectItem key={cat} value={cat}>{cat}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <p className="text-sm text-gray-500">Loading...</p>
      ) : error ? (
        <p className="text-sm text-red-600">{error}</p>
      ) : sorted.length === 0 ? (
        <p className="text-sm text-gray-500">No items match your search.</p>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="cursor-pointer select-none" onClick={() => toggleSort('itemCode')}>
                  Item Code <SortIcon column="itemCode" />
                </TableHead>
                <TableHead className="cursor-pointer select-none" onClick={() => toggleSort('description')}>
                  Description <SortIcon column="description" />
                </TableHead>
                <TableHead className="cursor-pointer select-none" onClick={() => toggleSort('category')}>
                  Category <SortIcon column="category" />
                </TableHead>
                <TableHead className="text-right">UOM</TableHead>
                <TableHead className="text-right cursor-pointer select-none" onClick={() => toggleSort('adelQty')}>
                  ADEL <SortIcon column="adelQty" />
                </TableHead>
                <TableHead className="text-right cursor-pointer select-none" onClick={() => toggleSort('calhounQty')}>
                  CALHOUN <SortIcon column="calhounQty" />
                </TableHead>
                <TableHead className="text-right cursor-pointer select-none" onClick={() => toggleSort('totalQty')}>
                  Total <SortIcon column="totalQty" />
                </TableHead>
                <TableHead className="text-right cursor-pointer select-none" onClick={() => toggleSort('avgCost')}>
                  Avg Cost <SortIcon column="avgCost" />
                </TableHead>
                <TableHead className="text-right cursor-pointer select-none" onClick={() => toggleSort('totalValue')}>
                  Value <SortIcon column="totalValue" />
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.map((p) => (
                <TableRow key={p.item.id} className={isLowStock(p) ? 'bg-red-50' : undefined}>
                  <TableCell className="font-mono font-medium">
                    <div className="flex items-center gap-2">
                      {p.item.itemCode}
                      {isLowStock(p) && (
                        <Badge variant="destructive" className="text-xs">Low Stock</Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>{p.item.description}</TableCell>
                  <TableCell className="text-gray-500">{p.item.category ?? '--'}</TableCell>
                  <TableCell className="text-right text-gray-500">{p.item.unitOfMeasure}</TableCell>
                  <TableCell className="text-right font-medium">{p.adelQty}</TableCell>
                  <TableCell className="text-right font-medium">{p.calhounQty}</TableCell>
                  <TableCell className="text-right font-bold">{p.totalQty}</TableCell>
                  <TableCell className="text-right text-sm">{formatCurrency(p.avgCost)}</TableCell>
                  <TableCell className="text-right text-sm font-medium">{formatCurrency(p.totalValue)}</TableCell>
                </TableRow>
              ))}
              {/* Totals row */}
              <TableRow className="bg-gray-50 font-semibold">
                <TableCell colSpan={8} className="text-right">Page Inventory Value</TableCell>
                <TableCell className="text-right">{formatCurrency(grandTotal)}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      )}

      {/* Pagination controls */}
      {!isLoading && !error && total > 0 && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-gray-400">
            Showing {(page - 1) * limit + 1}–{Math.min(page * limit, total)} of {total} item{total !== 1 ? 's' : ''}
          </p>
          {totalPages > 1 && (
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                <ChevronLeft className="h-4 w-4" />
                Prev
              </Button>
              <span className="text-sm text-gray-600">
                Page {page} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
