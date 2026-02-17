import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

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
};

export function StockPositionPage() {
  const [positions, setPositions] = useState<StockPosition[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    async function load() {
      try {
        const data = await api.get<{ positions: StockPosition[] }>('/api/transactions/stock-position');
        setPositions(data.positions);
      } catch {
        setError('Failed to load stock positions.');
      } finally {
        setIsLoading(false);
      }
    }
    load();
  }, []);

  const filtered = positions.filter((p) => {
    const q = search.toLowerCase();
    return (
      p.item.itemCode.toLowerCase().includes(q) ||
      p.item.description.toLowerCase().includes(q) ||
      (p.item.category ?? '').toLowerCase().includes(q)
    );
  });

  const isLowStock = (p: StockPosition) =>
    p.item.minQuantity !== null && p.totalQty <= p.item.minQuantity;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Stock Position</h1>
        <p className="mt-1 text-sm text-gray-500">
          Current on-hand quantities by location, calculated from all transactions.
        </p>
      </div>

      <Input
        placeholder="Search by item code, description, or category…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="max-w-sm"
      />

      {isLoading ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : error ? (
        <p className="text-sm text-red-600">{error}</p>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-gray-500">No items match your search.</p>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Item Code</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Category</TableHead>
                <TableHead className="text-right">UOM</TableHead>
                <TableHead className="text-right">ADEL</TableHead>
                <TableHead className="text-right">CALHOUN</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((p) => (
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
                  <TableCell className="text-gray-500">{p.item.category ?? '—'}</TableCell>
                  <TableCell className="text-right text-gray-500">{p.item.unitOfMeasure}</TableCell>
                  <TableCell className="text-right font-medium">{p.adelQty}</TableCell>
                  <TableCell className="text-right font-medium">{p.calhounQty}</TableCell>
                  <TableCell className="text-right font-bold">{p.totalQty}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {!isLoading && !error && (
        <p className="text-xs text-gray-400">
          Showing {filtered.length} of {positions.length} items
        </p>
      )}
    </div>
  );
}
