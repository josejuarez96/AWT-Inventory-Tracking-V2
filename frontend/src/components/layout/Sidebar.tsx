import { Link, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  PackageOpen,
  ArrowLeftRight,
  Truck,
  List,
  Users,
  Settings,
  LogOut,
  PackagePlus,
  Upload,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';

type NavItem = {
  icon: React.ElementType;
  label: string;
  path: string;
  adminOnly: boolean;
  enabled: boolean;
};

const NAV_ITEMS: NavItem[] = [
  { icon: LayoutDashboard, label: 'Dashboard', path: '/dashboard', adminOnly: false, enabled: true },
  { icon: PackageOpen, label: 'Inventory', path: '/inventory', adminOnly: false, enabled: true },
  { icon: ArrowLeftRight, label: 'Transactions', path: '/transactions', adminOnly: false, enabled: true },
  { icon: PackagePlus, label: 'Receipts', path: '/receipts', adminOnly: false, enabled: true },
  { icon: Truck, label: 'Vendors', path: '/vendors', adminOnly: true, enabled: false },
  { icon: List, label: 'Items', path: '/items', adminOnly: true, enabled: false },
  { icon: Upload, label: 'Import', path: '/import', adminOnly: true, enabled: true },
  { icon: Users, label: 'Users', path: '/users', adminOnly: true, enabled: true },
  { icon: Settings, label: 'Settings', path: '/settings', adminOnly: true, enabled: false },
];

export function Sidebar() {
  const { user, logout } = useAuth();
  const location = useLocation();

  const visibleItems = NAV_ITEMS.filter(
    (item) => !item.adminOnly || user?.role === 'admin'
  );

  return (
    <aside className="flex h-screen w-56 flex-col border-r border-gray-200 bg-gray-100">
      {/* Logo */}
      <div className="flex h-16 items-center px-4">
        <div>
          <p className="text-sm font-semibold text-gray-800">AWT Inventory</p>
          <p className="text-xs text-gray-500">Inventory Tracker</p>
        </div>
      </div>

      <Separator />

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto space-y-0.5 px-2 py-3">
        {visibleItems.map((item) => {
          const Icon = item.icon;
          const isActive = location.pathname === item.path;

          if (!item.enabled) {
            return (
              <span
                key={item.path}
                className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-gray-400 pointer-events-none opacity-50"
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </span>
            );
          }

          return (
            <Link
              key={item.path}
              to={item.path}
              className={cn(
                'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
                isActive
                  ? 'bg-gray-200 font-medium text-gray-900'
                  : 'text-gray-600 hover:bg-gray-200 hover:text-gray-900'
              )}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <Separator />

      {/* User section */}
      <div className="p-3">
        <div className="mb-2 flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-300 text-xs font-medium text-gray-700">
            {user?.fullName.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-medium text-gray-800">{user?.fullName}</p>
            <Badge variant="secondary" className="h-4 px-1 py-0 text-xs">
              {user?.role}
            </Badge>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start text-gray-500 hover:text-gray-700"
          onClick={logout}
        >
          <LogOut className="mr-2 h-3 w-3" />
          Logout
        </Button>
      </div>
    </aside>
  );
}
