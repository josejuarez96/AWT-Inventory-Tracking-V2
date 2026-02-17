import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PackageOpen, ArrowLeftRight, Truck, Users } from 'lucide-react';

const STAT_PLACEHOLDERS = [
  { title: 'Total Items', icon: PackageOpen, value: '—', sub: 'Coming in Phase 2' },
  { title: 'Transactions (MTD)', icon: ArrowLeftRight, value: '—', sub: 'Coming in Phase 2' },
  { title: 'Active Vendors', icon: Truck, value: '—', sub: 'Coming in Phase 2' },
  { title: 'Team Members', icon: Users, value: '—', sub: 'Coming in Phase 2' },
];

export function DashboardPage() {
  const { user } = useAuth();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">
          Welcome back, {user?.fullName.split(' ')[0]}
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          {user?.role === 'admin' ? 'Administrator' : 'Standard User'} · AWT Inventory Tracker
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {STAT_PLACEHOLDERS.map((stat) => {
          const Icon = stat.icon;
          return (
            <Card key={stat.title} className="shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-gray-600">
                  {stat.title}
                </CardTitle>
                <Icon className="h-4 w-4 text-gray-400" />
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold text-gray-400">{stat.value}</p>
                <p className="mt-1 text-xs text-gray-400">{stat.sub}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
