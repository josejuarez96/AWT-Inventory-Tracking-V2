import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';

type Transaction = {
  id: number;
  transactionType: string;
  location: string;
  quantity: number;
  unitCost: number | null;
  invoiceNumber: string | null;
  transactionDate: string;
  createdAt: string;
  item: { itemCode: string; description: string };
  vendor: { vendorName: string } | null;
  user: { fullName: string };
};

const TYPE_LABELS: Record<string, string> = {
  RECEIPT: 'Receipt',
  ADJUSTMENT: 'Adjustment',
  TRANSFER: 'Transfer',
  OPENING_BALANCE: 'Opening Balance',
};

const TYPE_VARIANTS: Record<string, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  RECEIPT: 'default',
  ADJUSTMENT: 'destructive',
  TRANSFER: 'secondary',
  OPENING_BALANCE: 'outline',
};

export function TransactionHistoryPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [filterFrom, setFilterFrom] = useState('');
  const [filterTo, setFilterTo] = useState('');
  const [filterType, setFilterType] = useState('ALL');
  const [filterLocation, setFilterLocation] = useState('ALL');

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

        const qs = params.toString();
        const data = await api.get<{ transactions: Transaction[] }>(
          `/api/transactions${qs ? `?${qs}` : ''}`
        );
        setTransactions(data.transactions);
      } catch {
        setError('Failed to load transactions.');
      } finally {
        setIsLoading(false);
      }
    }
    load();
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
        <p className="text-sm text-gray-500">Loading…</p>
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
                <TableHead className="text-right">Unit Cost</TableHead>
                <TableHead>Invoice #</TableHead>
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
                  <TableCell className="text-right text-sm">{formatCurrency(t.unitCost)}</TableCell>
                  <TableCell className="text-sm text-gray-500">{t.invoiceNumber ?? '—'}</TableCell>
                  <TableCell className="text-sm text-gray-600">{t.user.fullName}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {!isLoading && !error && (
        <p className="text-xs text-gray-400">{transactions.length} transaction{transactions.length !== 1 ? 's' : ''}</p>
      )}
    </div>
  );
}
