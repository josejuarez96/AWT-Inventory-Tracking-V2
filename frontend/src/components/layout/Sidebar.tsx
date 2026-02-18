import { useState } from 'react';
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
  UserCog,
  PackagePlus,
  Upload,
  SlidersHorizontal,
  Repeat,
  ClipboardList,
  ClipboardCheck,
  Hammer,
  Layers,
  ChevronDown,
  ChevronRight,
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

type NavGroup = {
  label: string;
  icon: React.ElementType;
  items: NavItem[];
  adminOnly?: boolean;
};

const TOP_ITEMS: NavItem[] = [
  { icon: LayoutDashboard, label: 'Dashboard', path: '/dashboard', adminOnly: false, enabled: true },
  { icon: PackageOpen, label: 'Inventory', path: '/inventory', adminOnly: false, enabled: true },
  { icon: List, label: 'Items', path: '/items', adminOnly: false, enabled: true },
  { icon: ArrowLeftRight, label: 'Transactions', path: '/transactions', adminOnly: false, enabled: true },
];

const TRANSACTION_GROUP: NavGroup = {
  label: 'Record Entry',
  icon: ClipboardList,
  items: [
    { icon: PackagePlus, label: 'Receipts', path: '/receipts', adminOnly: false, enabled: true },
    { icon: SlidersHorizontal, label: 'Adjustments', path: '/adjustments', adminOnly: false, enabled: true },
    { icon: Repeat, label: 'Transfers', path: '/transfers', adminOnly: false, enabled: true },
    { icon: ClipboardList, label: 'Opening Balances', path: '/opening-balances', adminOnly: true, enabled: true },
    { icon: ClipboardCheck, label: 'Cycle Counts', path: '/cycle-counts', adminOnly: false, enabled: true },
    { icon: Hammer, label: 'Kitting', path: '/kitting', adminOnly: false, enabled: true },
  ],
};

const ADMIN_ITEMS: NavItem[] = [
  { icon: Layers, label: 'BOMs', path: '/boms', adminOnly: true, enabled: true },
  { icon: Truck, label: 'Vendors', path: '/vendors', adminOnly: true, enabled: true },
  { icon: Upload, label: 'Import', path: '/import', adminOnly: true, enabled: true },
  { icon: Users, label: 'Users', path: '/users', adminOnly: true, enabled: true },
  { icon: Settings, label: 'Settings', path: '/settings', adminOnly: true, enabled: false },
];

function NavLink({ item, isActive }: { item: NavItem; isActive: boolean }) {
  const Icon = item.icon;

  if (!item.enabled) {
    return (
      <span className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-gray-400 pointer-events-none opacity-50">
        <Icon className="h-4 w-4" />
        {item.label}
      </span>
    );
  }

  return (
    <Link
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
}

export function Sidebar() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [txGroupOpen, setTxGroupOpen] = useState(true);

  const isAdmin = user?.role === 'admin';

  // Check if any transaction group child is active
  const txChildActive = TRANSACTION_GROUP.items.some(
    (item) => location.pathname === item.path
  );

  const visibleTxItems = TRANSACTION_GROUP.items.filter(
    (item) => !item.adminOnly || isAdmin
  );

  const visibleAdminItems = ADMIN_ITEMS.filter(
    (item) => !item.adminOnly || isAdmin
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
        {/* Top-level items */}
        {TOP_ITEMS.map((item) => (
          <NavLink key={item.path} item={item} isActive={location.pathname === item.path} />
        ))}

        {/* Transaction group - collapsible */}
        <div className="pt-2">
          <button
            onClick={() => setTxGroupOpen((prev) => !prev)}
            className={cn(
              'flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
              txChildActive && !txGroupOpen
                ? 'bg-gray-200 font-medium text-gray-900'
                : 'text-gray-600 hover:bg-gray-200 hover:text-gray-900'
            )}
          >
            <ClipboardList className="h-4 w-4" />
            <span className="flex-1 text-left">{TRANSACTION_GROUP.label}</span>
            {txGroupOpen
              ? <ChevronDown className="h-3.5 w-3.5 text-gray-400" />
              : <ChevronRight className="h-3.5 w-3.5 text-gray-400" />
            }
          </button>
          {txGroupOpen && (
            <div className="ml-4 mt-0.5 space-y-0.5 border-l border-gray-200 pl-2">
              {visibleTxItems.map((item) => (
                <NavLink key={item.path} item={item} isActive={location.pathname === item.path} />
              ))}
            </div>
          )}
        </div>

        {/* Admin section */}
        {visibleAdminItems.length > 0 && (
          <>
            <Separator className="my-2" />
            {visibleAdminItems.map((item) => (
              <NavLink key={item.path} item={item} isActive={location.pathname === item.path} />
            ))}
          </>
        )}
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
        <Link
          to="/account"
          className={cn(
            'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs transition-colors',
            location.pathname === '/account'
              ? 'bg-gray-200 font-medium text-gray-900'
              : 'text-gray-500 hover:bg-gray-200 hover:text-gray-700'
          )}
        >
          <UserCog className="h-3 w-3" />
          Account Settings
        </Link>
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
