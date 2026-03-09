import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { api } from '@/lib/api';
import { formatCurrency } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, TrendingDown, DollarSign } from 'lucide-react';

type LowStockItem = {
  id: number;
  itemCode: string;
  description: string;
  currentStock: number;
  minQuantity: number;
  burnRate: number | null;
  daysRemaining: number | null;
};

type DeadStockItem = {
  id: number;
  itemCode: string;
  description: string;
  currentStock: number;
};

type Valuation = {
  adel: number;
  calhoun: number;
  total: number;
};

export function DashboardPage() {
  const { user } = useAuth();

  const [lowStock, setLowStock] = useState<LowStockItem[]>([]);
  const [deadStock, setDeadStock] = useState<DeadStockItem[]>([]);
  const [valuation, setValuation] = useState<Valuation | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadDashboard() {
      try {
        const [lowData, deadData, valData] = await Promise.all([
          api.get<{ items: LowStockItem[] }>('/api/dashboard/low-stock'),
          api.get<{ items: DeadStockItem[] }>('/api/dashboard/dead-stock'),
          api.get<Valuation>('/api/dashboard/valuation'),
        ]);
        setLowStock(lowData.items);
        setDeadStock(deadData.items);
        setValuation(valData);
      } catch {
        setError('Failed to load dashboard data.');
      } finally {
        setIsLoading(false);
      }
    }
    loadDashboard();
  }, []);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">
            Welcome back, {user?.fullName.split(' ')[0]}
          </h1>
          <p className="mt-1 text-sm text-gray-500">Loading dashboard…</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">
            Welcome back, {user?.fullName.split(' ')[0]}
          </h1>
          <p className="mt-1 text-sm text-red-600">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">
          Welcome back, {user?.fullName.split(' ')[0]}
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          {user?.role === 'admin' ? 'Administrator' : 'Standard User'} · AWT Inventory Tracker
        </p>
      </div>

      {/* Widgets grid */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 max-w-5xl">
        {/* Running Low Alerts */}
        <Card className="shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              Running Low
            </CardTitle>
          </CardHeader>
          <CardContent>
            {lowStock.length === 0 ? (
              <p className="text-sm text-gray-400">No low-stock items detected.</p>
            ) : (
              <ul className="space-y-2">
                {lowStock.map((item) => (
                  <li key={item.id} className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{item.description}</p>
                      <p className="text-xs text-gray-400 font-mono">{item.itemCode}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-semibold text-red-600">
                        {item.currentStock} left
                      </p>
                      <p className="text-xs text-gray-400">
                        {item.daysRemaining !== null
                          ? `~${item.daysRemaining} days`
                          : 'No usage data'}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Inventory Valuation */}
        <Card className="shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <DollarSign className="h-4 w-4 text-green-600" />
              Inventory Valuation
            </CardTitle>
          </CardHeader>
          <CardContent>
            {valuation === null ? (
              <p className="text-sm text-gray-400">No valuation data available.</p>
            ) : (
              <div className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">ADEL</span>
                  <span className="font-medium">{formatCurrency(valuation.adel)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">CALHOUN</span>
                  <span className="font-medium">{formatCurrency(valuation.calhoun)}</span>
                </div>
                <div className="border-t pt-3 flex justify-between">
                  <span className="text-sm font-semibold">Total On-Hand</span>
                  <span className="text-lg font-bold text-gray-900">
                    {formatCurrency(valuation.total)}
                  </span>
                </div>
                <p className="text-xs text-gray-400">
                  Based on weighted average cost per item.
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Dead Stock */}
        <Card className="shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <TrendingDown className="h-4 w-4 text-gray-400" />
              Dead Stock
              <span className="text-xs font-normal text-gray-400">(no activity in 90+ days)</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {deadStock.length === 0 ? (
              <p className="text-sm text-gray-400">No dead stock detected — all items have recent activity.</p>
            ) : (
              <ul className="space-y-2">
                {deadStock.map((item) => (
                  <li key={item.id} className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{item.description}</p>
                      <p className="text-xs text-gray-400 font-mono">{item.itemCode}</p>
                    </div>
                    <Badge variant="secondary" className="shrink-0">
                      {item.currentStock} on hand
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
