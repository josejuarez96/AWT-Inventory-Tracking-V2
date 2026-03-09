import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, X } from 'lucide-react';
import { api } from '@/lib/api';
import { LOCATIONS } from '@/lib/locations';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

type ProductionOrder = {
  id: number;
  orderNumber: string;
  status: string;
  orderType: string;
  location: string;
  totalQuantity: number;
  quantityProduced: number;
  totalCost: number;
  notes: string | null;
  vinReference: string | null;
  configurationKey: string | null;
  finishedGood: { id: number; itemCode: string; description: string };
  bom: { id: number; bomCode: string; name: string } | null;
  creator: { fullName: string };
  createdAt: string;
  lineCounts: { staged: number; posted: number; voided: number; reversed: number };
};

const STATUS_BADGE: Record<string, 'default' | 'secondary' | 'outline'> = {
  OPEN: 'default',
  PARTIAL: 'outline',
  COMPLETED: 'secondary',
};

const STATUS_COLORS: Record<string, string> = {
  OPEN: 'bg-blue-50 text-blue-700 border-blue-200',
  PARTIAL: 'bg-amber-50 text-amber-700 border-amber-200',
  COMPLETED: 'bg-gray-100 text-gray-600 border-gray-200',
};

export function InProductionPage() {
  const navigate = useNavigate();
  const [orders, setOrders] = useState<ProductionOrder[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);

  // Filters
  const [statusFilter, setStatusFilter] = useState('');
  const [locationFilter, setLocationFilter] = useState('');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  // Debounce search input (300ms)
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const limit = 20;

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('limit', String(limit));
      if (statusFilter) params.set('status', statusFilter);
      if (locationFilter) params.set('location', locationFilter);
      if (debouncedSearch) params.set('search', debouncedSearch);

      const res = await api.get<{
        orders: ProductionOrder[];
        total: number;
        totalPages: number;
      }>(`/api/production/orders?${params.toString()}`);

      setOrders(res.orders);
      setTotal(res.total);
      setTotalPages(res.totalPages);
    } catch {
      // Silently fail
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter, locationFilter, debouncedSearch]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setPage(1);
  }, [statusFilter, locationFilter, debouncedSearch]);

  function clearFilters() {
    setStatusFilter('');
    setLocationFilter('');
    setSearch('');
    setPage(1);
  }

  const hasFilters = statusFilter || locationFilter || search;

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">In Production</h1>
          <p className="text-sm text-gray-500">
            {total} production order{total !== 1 ? 's' : ''}
          </p>
        </div>
        <Button onClick={() => navigate('/production/create')}>Create Production Order</Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search orders..."
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="OPEN">Open</SelectItem>
            <SelectItem value="PARTIAL">Partial</SelectItem>
            <SelectItem value="COMPLETED">Completed</SelectItem>
          </SelectContent>
        </Select>

        <Select value={locationFilter} onValueChange={setLocationFilter}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Location" />
          </SelectTrigger>
          <SelectContent>
            {LOCATIONS.map((loc) => (
              <SelectItem key={loc} value={loc}>
                {loc}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            <X className="mr-1 h-3 w-3" /> Clear
          </Button>
        )}
      </div>

      {/* Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Order #</TableHead>
              <TableHead>Finished Good</TableHead>
              <TableHead>VIN</TableHead>
              <TableHead>Location</TableHead>
              <TableHead className="text-center">Total</TableHead>
              <TableHead className="text-center">Staged</TableHead>
              <TableHead className="text-center">Posted</TableHead>
              <TableHead className="text-center">Status</TableHead>
              <TableHead>Created</TableHead>
              <TableHead>By</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={10} className="text-center py-8 text-gray-400">
                  Loading...
                </TableCell>
              </TableRow>
            ) : orders.length === 0 ? (
              <TableRow>
                <TableCell colSpan={10} className="text-center py-8 text-gray-400">
                  No production orders found
                </TableCell>
              </TableRow>
            ) : (
              orders.map((order) => (
                <TableRow
                  key={order.id}
                  className="cursor-pointer hover:bg-gray-50"
                  onClick={() => navigate(`/in-production/${order.id}`)}
                >
                  <TableCell className="font-medium">{order.orderNumber}</TableCell>
                  <TableCell>
                    <div className="text-sm">{order.finishedGood.itemCode}</div>
                    <div className="text-xs text-gray-500">{order.finishedGood.description}</div>
                  </TableCell>
                  <TableCell className="text-sm text-gray-500">
                    {order.vinReference || '—'}
                  </TableCell>
                  <TableCell>{order.location}</TableCell>
                  <TableCell className="text-center">{order.totalQuantity}</TableCell>
                  <TableCell className="text-center">
                    {order.lineCounts.staged > 0 ? (
                      <span className="text-blue-600">{order.lineCounts.staged}</span>
                    ) : (
                      <span className="text-gray-300">0</span>
                    )}
                  </TableCell>
                  <TableCell className="text-center">
                    {order.lineCounts.posted > 0 ? (
                      <span className="text-green-600">{order.lineCounts.posted}</span>
                    ) : (
                      <span className="text-gray-300">0</span>
                    )}
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge
                      variant={STATUS_BADGE[order.status] || 'secondary'}
                      className={STATUS_COLORS[order.status] || ''}
                    >
                      {order.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-gray-500">
                    {new Date(order.createdAt).toLocaleDateString()}
                  </TableCell>
                  <TableCell className="text-sm text-gray-500">{order.creator.fullName}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500">
            Page {page} of {totalPages}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
