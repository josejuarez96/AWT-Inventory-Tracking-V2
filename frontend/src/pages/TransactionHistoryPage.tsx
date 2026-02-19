import { useEffect, useState } from 'react';
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
import { ChevronLeft, ChevronRight, Search } from 'lucide-react';

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
  item: { itemCode: string; description: string };
  vendor: { vendorName: string } | null;
  user: { fullName: string };
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

  const [search, setSearch] = useState('');
  const [filterFrom, setFilterFrom] = useState('');
  const [filterTo, setFilterTo] = useState('');
  const [filterType, setFilterType] = useState('ALL');
  const [filterLocation, setFilterLocation] = useState('ALL');

  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 50;

  useEffect(() => {
    async function load() {
      setIsLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        if (search.trim()) params.set('search', search.trim());
        if (filterFrom) params.set('from', filterFrom);
        if (filterTo) params.set('to', filterTo);
        if (filterType !== 'ALL') params.set('type', filterType);
        if (filterLocation !== 'ALL') params.set('location', filterLocation);
        params.set('page', String(page));
        params.set('limit', String(limit));

        const data = await api.get<PaginatedResponse>(
          `/api/transactions?${params.toString()}`
        );
        setTransactions(data.transactions);
        setTotal(data.total);
        setTotalPages(data.totalPages);
      } catch {
        setError('Failed to load transactions.');
      } finally {
        setIsLoading(false);
      }
    }
    load();
  }, [search, filterFrom, filterTo, filterType, filterLocation, page]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setPage(1);
  }, [search, filterFrom, filterTo, filterType, filterLocation]);



  // Extract adjustment reason from notes "[Reason] optional text"
  function parseNotes(t: Transaction): { reason: string | null; text: string | null } {
    if (t.transactionType === 'ADJUSTMENT' && t.notes) {
      const match = t.notes.match(/^\[(.+?)\]\s*(.*)?$/);
      if (match) return { reason: match[1], text: match[2] || null };
    }
    return { reason: null, text: t.notes };
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
              placeholder="Item, vendor, invoice #..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 w-56"
            />
          </div>
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-gray-500">From</Label>
          <Input
            type="date"
            value={filterFrom}
            onChange={(e) => setFilterFrom(e.target.value)}
            className="w-40"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-gray-500">To</Label>
          <Input
            type="date"
            value={filterTo}
            onChange={(e) => setFilterTo(e.target.value)}
            className="w-40"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-gray-500">Type</Label>
          <Select value={filterType} onValueChange={setFilterType}>
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
          <Select value={filterLocation} onValueChange={setFilterLocation}>
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
      </div>

      {isLoading ? (
        <p className="text-sm text-gray-500">Loading...</p>
      ) : error ? (
        <p className="text-sm text-red-600">{error}</p>
      ) : transactions.length === 0 ? (
        <p className="text-sm text-gray-500">No transactions found for the selected filters.</p>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
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

                    {/* Qty — colored +/- */}
                    <TableCell className="text-right font-mono text-sm font-medium">
                      <span className={t.quantity >= 0 ? 'text-green-600' : 'text-red-600'}>
                        {t.quantity >= 0 ? '+' : ''}{t.quantity}
                      </span>
                    </TableCell>

                    {/* Value — total + unit cost hint */}
                    <TableCell className="text-right text-sm">
                      {totalCost !== null ? (
                        <>
                          <span className="font-medium">{formatCurrency(totalCost)}</span>
                          <span className="text-xs text-gray-400 ml-1">@ {formatCurrency(t.unitCost!)}</span>
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
                          <span className="text-gray-700">{t.vendor.vendorName}</span>
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
                        {t.transactionType !== 'TRANSFER' && !t.vendor?.vendorName && !t.invoiceNumber && !reason && !text && (
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
