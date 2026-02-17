import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { api } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { PackageOpen, ArrowLeftRight, Truck, Users, AlertTriangle, TrendingDown, DollarSign, Activity } from 'lucide-react';

type DashboardStats = {
  totalItems: number;
  transactionsMTD: number;
  activeVendors: number;
  teamMembers: number;
};

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

type ActivityItem = {
  id: number;
  description: string;
  transactionDate: string;
  createdAt: string;
  transactionType: string;
  location: string;
};

const currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

function formatActivityDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function DashboardPage() {
  const { user } = useAuth();

  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [lowStock, setLowStock] = useState<LowStockItem[]>([]);
  const [deadStock, setDeadStock] = useState<DeadStockItem[]>([]);
  const [valuation, setValuation] = useState<Valuation | null>(null);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadDashboard() {
      try {
        const [statsData, lowData, deadData, valData, actData] = await Promise.all([
          api.get<DashboardStats>('/api/dashboard/stats'),
          api.get<{ items: LowStockItem[] }>('/api/dashboard/low-stock'),
          api.get<{ items: DeadStockItem[] }>('/api/dashboard/dead-stock'),
          api.get<Valuation>('/api/dashboard/valuation'),
          api.get<{ activity: ActivityItem[] }>('/api/dashboard/activity'),
        ]);
        setStats(statsData);
        setLowStock(lowData.items);
        setDeadStock(deadData.items);
        setValuation(valData);
        setActivity(actData.activity);
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

  const STAT_CARDS = [
    { title: 'Total Items', icon: PackageOpen, value: stats?.totalItems ?? 0, sub: 'Active catalog items' },
    { title: 'Transactions (MTD)', icon: ArrowLeftRight, value: stats?.transactionsMTD ?? 0, sub: 'This month' },
    { title: 'Active Vendors', icon: Truck, value: stats?.activeVendors ?? 0, sub: 'Suppliers on file' },
    { title: 'Team Members', icon: Users, value: stats?.teamMembers ?? 0, sub: 'Active users' },
  ];

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

      {/* Stat cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {STAT_CARDS.map((stat) => {
          const Icon = stat.icon;
          return (
            <Card key={stat.title} className="shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-gray-600">{stat.title}</CardTitle>
                <Icon className="h-4 w-4 text-gray-400" />
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold text-gray-900">{stat.value}</p>
                <p className="mt-1 text-xs text-gray-400">{stat.sub}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Widgets grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
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
                  <span className="font-medium">{currency.format(valuation.adel)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">CALHOUN</span>
                  <span className="font-medium">{currency.format(valuation.calhoun)}</span>
                </div>
                <div className="border-t pt-3 flex justify-between">
                  <span className="text-sm font-semibold">Total On-Hand</span>
                  <span className="text-lg font-bold text-gray-900">
                    {currency.format(valuation.total)}
                  </span>
                </div>
                <p className="text-xs text-gray-400">
                  Based on last known unit cost per item. Compare to QuickBooks on-hand value.
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
              <p className="text-sm text-gray-400">No dead stock detected.</p>
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

        {/* Recent Activity Feed */}
        <Card className="shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Activity className="h-4 w-4 text-blue-500" />
              Recent Activity
            </CardTitle>
          </CardHeader>
          <CardContent>
            {activity.length === 0 ? (
              <p className="text-sm text-gray-400">No recent activity.</p>
            ) : (
              <ul className="space-y-2 max-h-64 overflow-y-auto pr-1">
                {activity.map((item) => (
                  <li key={item.id} className="flex items-start justify-between gap-2">
                    <p className="text-sm text-gray-700 leading-snug">{item.description}</p>
                    <span className="text-xs text-gray-400 shrink-0">
                      {formatActivityDate(item.transactionDate)}
                    </span>
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
