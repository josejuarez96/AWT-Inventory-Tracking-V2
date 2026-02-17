import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
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
import { ChevronLeft, ChevronRight } from 'lucide-react';

type Transaction = {
  id: number;
  transactionType: string;
  location: string;
  quantity: number;
  unitCost: number | null;
  invoiceNumber: string | null;
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
  ADJUSTMENT: 'Adjustment',
  TRANSFER: 'Transfer',
  OPENING_BALANCE: 'Opening Balance',
  CONSUMPTION: 'Consumption',
  PRODUCTION: 'Production',
};

const TYPE_VARIANTS: Record<string, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  RECEIPT: 'default',
  ADJUSTMENT: 'destructive',
  TRANSFER: 'secondary',
  OPENING_BALANCE: 'outline',
  CONSUMPTION: 'destructive',
  PRODUCTION: 'default',
};

export function TransactionHistoryPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
  }, [filterFrom, filterTo, filterType, filterLocation, page]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setPage(1);
  }, [filterFrom, filterTo, filterType, filterLocation]);

  const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  const formatCurrency = (val: number | null) =>
    val !== null ? `$${val.toFixed(2)}` : '—';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Transaction History</h1>
        <p className="mt-1 text-sm text-gray-500">
          Full audit trail of all inventory movements.
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-4 items-end">
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
              <SelectItem value="ADEL">ADEL</SelectItem>
              <SelectItem value="CALHOUN">CALHOUN</SelectItem>
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
                <TableHead>Date</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Item</TableHead>
                <TableHead>Vendor</TableHead>
                <TableHead>Location</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead className="text-right">Total Cost</TableHead>
                <TableHead>Invoice #</TableHead>
                <TableHead>Details</TableHead>
                <TableHead>Created By</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {transactions.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="text-sm">{formatDate(t.transactionDate)}</TableCell>
                  <TableCell>
                    <Badge variant={TYPE_VARIANTS[t.transactionType] ?? 'outline'}>
                      {TYPE_LABELS[t.transactionType] ?? t.transactionType}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="font-mono text-xs text-gray-500">{t.item.itemCode}</div>
                    <div className="text-sm">{t.item.description}</div>
                  </TableCell>
                  <TableCell className="text-sm text-gray-600">
                    {t.vendor?.vendorName ?? '—'}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{t.location}</Badge>
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    <span className={t.quantity >= 0 ? 'text-green-600' : 'text-red-600'}>
                      {t.quantity >= 0 ? '+' : ''}{t.quantity}
                    </span>
                  </TableCell>
                  <TableCell className="text-right text-sm">
                    {t.unitCost !== null ? (
                      <div>
                        <div className="font-medium">{formatCurrency(Math.abs(t.quantity) * t.unitCost)}</div>
                        <div className="text-xs text-gray-400">@ {formatCurrency(t.unitCost)}/ea</div>
                      </div>
                    ) : '—'}
                  </TableCell>
                  <TableCell className="text-sm text-gray-500">{t.invoiceNumber ?? '—'}</TableCell>
                  <TableCell className="text-sm text-gray-600 max-w-[220px]">
                    {t.transactionType === 'ADJUSTMENT' && t.notes ? (
                      <div className="space-y-1">
                        <Badge variant="outline" className="text-xs">
                          {t.notes.match(/^\[(.+?)\]/)?.[1] ?? 'Adjustment'}
                        </Badge>
                        {t.notes.replace(/^\[.+?\]\s*/, '') ? (
                          <p className="text-xs text-gray-500 leading-snug">
                            {t.notes.replace(/^\[.+?\]\s*/, '')}
                          </p>
                        ) : null}
                      </div>
                    ) : t.notes ? (
                      <p className="text-xs text-gray-500 truncate" title={t.notes}>{t.notes}</p>
                    ) : (
                      '—'
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-gray-600">{t.user.fullName}</TableCell>
                </TableRow>
              ))}
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
