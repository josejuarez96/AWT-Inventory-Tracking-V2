import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { api } from '@/lib/api';
import { LOCATIONS } from '@/lib/locations';
import { formatCurrency, formatDate } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { Badge } from '@/components/ui/badge';
import { ChevronLeft, ChevronRight, Search, X } from 'lucide-react';
import { Link } from 'react-router-dom';

type Transaction = {
  id: number;
  transactionType: string;
  location: string;
  quantity: number;
  unitCost: number | null;
  invoiceNumber: string | null;
  batchId: string | null;
  notes: string | null;
  transactionDate: string;
  createdAt: string;
  item: { itemCode: string; description: string; unitOfMeasure?: string; purchaseUom?: string | null; conversionFactor?: number | null };
  vendor: { vendorName: string } | null;
  user: { fullName: string };
  productionOrder: { id: number; orderNumber: string } | null;
};

type PaginatedResponse = {
  transactions: Transaction[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

const TYPE_LABELS: Record<string, string> = {
  RECEIPT: 'Receipt',
  ADJUSTMENT: 'Adjust',
  TRANSFER: 'Transfer',
  OPENING_BALANCE: 'Opening',
  CONSUMPTION: 'Consumed',
  PRODUCTION: 'Produced',
};

const TYPE_COLORS: Record<string, string> = {
  RECEIPT: 'bg-blue-50 text-blue-700 border-blue-200',
  ADJUSTMENT: 'bg-amber-50 text-amber-700 border-amber-200',
  TRANSFER: 'bg-purple-50 text-purple-700 border-purple-200',
  OPENING_BALANCE: 'bg-gray-100 text-gray-600 border-gray-200',
  CONSUMPTION: 'bg-red-50 text-red-700 border-red-200',
  PRODUCTION: 'bg-green-50 text-green-700 border-green-200',
};

export function TransactionHistoryPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Map batchId → lowest transaction ID in the batch for display
  const batchFirstIdMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const t of transactions) {
      if (t.batchId) {
        const existing = map.get(t.batchId);
        if (existing === undefined || t.id < existing) {
          map.set(t.batchId, t.id);
        }
      }
    }
    return map;
  }, [transactions]);

  const [search, setSearch] = useState('');
  const [filterFrom, setFilterFrom] = useState('');
  const [filterTo, setFilterTo] = useState('');
  const [filterType, setFilterType] = useState('ALL');
  const [filterLocation, setFilterLocation] = useState('ALL');

  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 50;

  // Use ref to track latest request and avoid stale responses
  const requestIdRef = useRef(0);

  const fetchTransactions = useCallback(async (searchVal: string, fromVal: string, toVal: string, typeVal: string, locationVal: string, pageVal: number) => {
    const thisRequest = ++requestIdRef.current;
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (searchVal.trim()) params.set('search', searchVal.trim());
      if (fromVal) params.set('from', fromVal);
      if (toVal) params.set('to', toVal);
      if (typeVal !== 'ALL') params.set('type', typeVal);
      if (locationVal !== 'ALL') params.set('location', locationVal);
      params.set('page', String(pageVal));
      params.set('limit', String(limit));

      const data = await api.get<PaginatedResponse>(
        `/api/transactions?${params.toString()}`
      );
      // Only update state if this is still the latest request
      if (thisRequest === requestIdRef.current) {
        setTransactions(data.transactions);
        setTotal(data.total);
        setTotalPages(data.totalPages);
        setIsLoading(false);
      }
    } catch {
      if (thisRequest === requestIdRef.current) {
        setError('Failed to load transactions.');
        setIsLoading(false);
      }
    }
  }, []);

  // Initial load
  useEffect(() => {
    fetchTransactions(search, filterFrom, filterTo, filterType, filterLocation, page);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Debounced search — fetch 300ms after user stops typing
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  function handleSearchChange(val: string) {
    setSearch(val);
    setPage(1);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      fetchTransactions(val, filterFrom, filterTo, filterType, filterLocation, 1);
    }, 300);
  }

  // Immediate fetch when dropdown/date filters change
  function handleFilterChange(setter: (v: string) => void, val: string) {
    setter(val);
    setPage(1);
    // Use setTimeout(0) to ensure state is updated before fetch reads refs
    setTimeout(() => {
      const searchVal = search;
      const fromVal = setter === setFilterFrom ? val : filterFrom;
      const toVal = setter === setFilterTo ? val : filterTo;
      const typeVal = setter === setFilterType ? val : filterType;
      const locVal = setter === setFilterLocation ? val : filterLocation;
      fetchTransactions(searchVal, fromVal, toVal, typeVal, locVal, 1);
    }, 0);
  }

  function handlePageChange(newPage: number) {
    setPage(newPage);
    fetchTransactions(search, filterFrom, filterTo, filterType, filterLocation, newPage);
  }

  const hasActiveFilters = !!(search || filterFrom || filterTo || filterType !== 'ALL' || filterLocation !== 'ALL');

  function clearAllFilters() {
    setSearch('');
    setFilterFrom('');
    setFilterTo('');
    setFilterType('ALL');
    setFilterLocation('ALL');
    setPage(1);
    fetchTransactions('', '', '', 'ALL', 'ALL', 1);
  }

  // Extract adjustment reason from notes "[Reason] optional text"
  // Also strips "[Purchase: ...]" audit notes from display (shown structurally elsewhere)
  function parseNotes(t: Transaction): { reason: string | null; text: string | null } {
    let notes = t.notes;
    // Strip purchase audit note — displayed structurally in Qty/Value columns
    if (notes) notes = notes.replace(/\s*\[Purchase:[^\]]*\]/g, '').trim() || null;
    if (t.transactionType === 'ADJUSTMENT' && notes) {
      const match = notes.match(/^\[(.+?)\]\s*(.*)?$/);
      if (match) return { reason: match[1], text: match[2] || null };
    }
    return { reason: null, text: notes };
  }

  // Extract purchase info from notes "[Purchase: 2 ROLL @ $172.50/ROLL, factor: 2500]"
  function parsePurchaseNote(notes: string | null): { purchaseQty: number; purchaseUom: string; purchaseCostPer: number } | null {
    if (!notes) return null;
    const match = notes.match(/\[Purchase:\s*([\d.]+)\s+(\S+)\s+@\s+\$([\d.]+)/);
    if (!match) return null;
    return { purchaseQty: parseFloat(match[1]), purchaseUom: match[2], purchaseCostPer: parseFloat(match[3]) };
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Transaction History</h1>
        <p className="mt-1 text-sm text-gray-500">
          Full audit trail of all inventory movements.
        </p>
      </div>

      {/* Search + Filters */}
      <div className="flex flex-wrap gap-4 items-end">
        <div className="space-y-1">
          <Label className="text-xs text-gray-500">Search</Label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="ID, item, vendor, invoice #..."
              value={search}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="pl-9 w-56"
            />
          </div>
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-gray-500">From</Label>
          <Input
            type="date"
            value={filterFrom}
            onChange={(e) => handleFilterChange(setFilterFrom, e.target.value)}
            className="w-40"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-gray-500">To</Label>
          <Input
            type="date"
            value={filterTo}
            onChange={(e) => handleFilterChange(setFilterTo, e.target.value)}
            className="w-40"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-gray-500">Type</Label>
          <Select value={filterType} onValueChange={(v) => handleFilterChange(setFilterType, v)}>
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Types</SelectItem>
              <SelectItem value="RECEIPT">Receipt</SelectItem>
              <SelectItem value="ADJUSTMENT">Adjustment</SelectItem>
              <SelectItem value="TRANSFER">Transfer</SelectItem>
              <SelectItem value="OPENING_BALANCE">Opening Balance</SelectItem>
              <SelectItem value="CONSUMPTION">Consumption</SelectItem>
              <SelectItem value="PRODUCTION">Production</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-gray-500">Location</Label>
          <Select value={filterLocation} onValueChange={(v) => handleFilterChange(setFilterLocation, v)}>
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Locations</SelectItem>
              {LOCATIONS.map((loc) => (
                <SelectItem key={loc} value={loc}>{loc}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {hasActiveFilters && (
          <div className="space-y-1">
            <Label className="text-xs text-gray-500">&nbsp;</Label>
            <Button
              variant="ghost"
              size="sm"
              className="text-gray-500 hover:text-gray-700"
              onClick={clearAllFilters}
            >
              <X className="h-3 w-3 mr-1" />
              Clear Filters
            </Button>
          </div>
        )}
      </div>

      {isLoading ? (
        <p className="text-sm text-gray-500">Loading...</p>
      ) : error ? (
        <p className="text-sm text-red-600">{error}</p>
      ) : transactions.length === 0 ? (
        <div className="text-sm text-gray-500 space-y-1">
          <p>No transactions found for the selected filters.</p>
          {hasActiveFilters && (
            <p className="text-xs text-gray-400">
              Active filters: {[
                search && `search "${search}"`,
                filterType !== 'ALL' && `type: ${TYPE_LABELS[filterType] ?? filterType}`,
                filterLocation !== 'ALL' && `location: ${filterLocation}`,
                filterFrom && `from: ${filterFrom}`,
                filterTo && `to: ${filterTo}`,
              ].filter(Boolean).join(', ')}.{' '}
              <button className="text-blue-600 hover:underline" onClick={clearAllFilters}>
                Clear all filters
              </button>
            </p>
          )}
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-16">ID</TableHead>
                <TableHead className="w-28">Date</TableHead>
                <TableHead className="w-24">Type</TableHead>
                <TableHead>Item Code</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="w-20">Loc</TableHead>
                <TableHead className="w-20 text-right">Qty</TableHead>
                <TableHead className="w-28 text-right">Value</TableHead>
                <TableHead className="w-64">Details</TableHead>
                <TableHead className="w-28">By</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {transactions.map((t, idx) => {
                const { reason, text } = parseNotes(t);
                const totalCost = t.unitCost !== null ? Math.abs(t.quantity) * t.unitCost : null;
                // Batch grouping: count items in the same batch, mark first occurrence
                const batchCount = t.batchId
                  ? transactions.filter((x) => x.batchId === t.batchId).length
                  : 0;
                const isFirstInBatch = t.batchId
                  ? transactions.findIndex((x) => x.batchId === t.batchId) === idx
                  : false;
                return (
                  <TableRow key={t.id} className={t.batchId ? 'border-l-2 border-l-blue-300' : ''}>
                    {/* Transaction ID — show batch ref (lowest ID in batch) for grouped transactions */}
                    <TableCell className="font-mono text-xs text-gray-400">
                      {t.batchId ? (batchFirstIdMap.get(t.batchId) ?? t.id) : t.id}
                    </TableCell>

                    {/* Date */}
                    <TableCell className="text-sm text-gray-600 whitespace-nowrap">
                      {formatDate(t.transactionDate)}
                    </TableCell>

                    {/* Type badge */}
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium ${TYPE_COLORS[t.transactionType] ?? 'bg-gray-50 text-gray-600 border-gray-200'}`}>
                          {TYPE_LABELS[t.transactionType] ?? t.transactionType}
                        </span>
                        {isFirstInBatch && batchCount > 1 && (
                          <span className="inline-flex items-center rounded-full bg-blue-100 text-blue-700 border border-blue-200 px-1.5 py-0 text-[10px] font-medium">
                            {batchCount}
                          </span>
                        )}
                      </div>
                    </TableCell>

                    {/* Item Code */}
                    <TableCell className="font-mono text-sm">{t.item.itemCode}</TableCell>

                    {/* Description */}
                    <TableCell className="text-sm">{t.item.description}</TableCell>

                    {/* Location */}
                    <TableCell className="text-sm text-gray-600">{t.location}</TableCell>

                    {/* Qty — colored +/- with purchase context */}
                    <TableCell className="text-right font-mono text-sm font-medium">
                      <span className={t.quantity >= 0 ? 'text-green-600' : 'text-red-600'}>
                        {t.quantity >= 0 ? '+' : ''}{t.quantity}
                      </span>
                      {t.transactionType === 'RECEIPT' && (() => {
                        const pn = parsePurchaseNote(t.notes);
                        if (pn) return (
                          <div className="text-[10px] text-gray-400 font-normal">
                            ({pn.purchaseQty} {pn.purchaseUom})
                          </div>
                        );
                        return null;
                      })()}
                    </TableCell>

                    {/* Value — total + unit cost hint, with purchase context */}
                    <TableCell className="text-right text-sm">
                      {totalCost !== null ? (
                        <>
                          <span className="font-medium">{formatCurrency(totalCost)}</span>
                          <span className="text-xs text-gray-400 ml-1">@ {formatCurrency(t.unitCost!)}/{t.item.unitOfMeasure ?? 'EA'}</span>
                          {t.transactionType === 'RECEIPT' && (() => {
                            const pn = parsePurchaseNote(t.notes);
                            if (pn) return (
                              <div className="text-[10px] text-gray-400">
                                {formatCurrency(pn.purchaseCostPer)}/{pn.purchaseUom}
                              </div>
                            );
                            return null;
                          })()}
                        </>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </TableCell>

                    {/* Details — consolidated vendor, invoice, reason, transfer info, notes */}
                    <TableCell className="text-sm text-gray-600">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                        {t.transactionType === 'TRANSFER' && (
                          <span className="text-xs font-medium text-purple-600">
                            {t.quantity < 0
                              ? `To ${LOCATIONS.find((l) => l !== t.location) ?? '?'}`
                              : `From ${LOCATIONS.find((l) => l !== t.location) ?? '?'}`}
                          </span>
                        )}
                        {t.vendor?.vendorName && (
                          <span className="text-gray-700">{t.vendor.vendorName.trim()}</span>
                        )}
                        {t.invoiceNumber && (
                          <span className="text-xs text-gray-400">#{t.invoiceNumber}</span>
                        )}
                        {reason && (
                          <Badge variant="outline" className="text-xs py-0 h-5">{reason}</Badge>
                        )}
                        {text && (
                          <span className="text-xs text-gray-400 truncate max-w-[200px]" title={text}>
                            {text}
                          </span>
                        )}
                        {t.productionOrder && (
                          <Link
                            to={`/in-production/${t.productionOrder.id}`}
                            className="text-xs font-medium text-blue-600 hover:underline"
                          >
                            {t.productionOrder.orderNumber}
                          </Link>
                        )}
                        {t.transactionType !== 'TRANSFER' && !t.vendor?.vendorName && !t.invoiceNumber && !reason && !text && !t.productionOrder && (
                          <span className="text-gray-300">—</span>
                        )}
                      </div>
                    </TableCell>

                    {/* Created By */}
                    <TableCell className="text-sm text-gray-500 whitespace-nowrap">
                      {t.user.fullName}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Pagination controls */}
      {!isLoading && !error && total > 0 && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-gray-400">
            Showing {(page - 1) * limit + 1}–{Math.min(page * limit, total)} of {total} transaction{total !== 1 ? 's' : ''}
          </p>
          {totalPages > 1 && (
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => handlePageChange(page - 1)}
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
                onClick={() => handlePageChange(page + 1)}
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
