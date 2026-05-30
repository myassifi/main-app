import { Link, useLocation } from 'react-router-dom';
import { Sidebar, useSidebar } from '@/components/ui/sidebar';
import { Home, Package, Users, Briefcase, Flame } from 'lucide-react';
import { cn } from '@/lib/utils';

const navItems = [
  { to: '/', icon: Home, label: 'Dashboard' },
  { to: '/inventory', icon: Package, label: 'Inventory' },
  { to: '/customers', icon: Users, label: 'Customers' },
  { to: '/jobs', icon: Briefcase, label: 'Jobs' },
];

export function AppSidebar() {
  const location = useLocation();
  const { setOpenMobile, isMobile } = useSidebar();

  return (
    <Sidebar>
      <div className="flex h-full flex-col">
        <div className="flex h-14 items-center border-b border-sidebar-border px-6 text-sidebar-foreground">
          <Link to="/" className="flex items-center gap-2 font-semibold text-foreground" onClick={() => isMobile && setOpenMobile(false)}>
            <Flame className="h-6 w-6 text-primary fill-primary" />
            <span className="text-lg">Heat Wave</span>
          </Link>
        </div>
        <nav className="flex-1 space-y-1 p-4">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.to;
            return (
              <Link
                key={item.to}
                to={item.to}
                onClick={() => isMobile && setOpenMobile(false)}
                className={cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors border-l-4',
                  isActive
                    ? 'border-primary bg-sidebar-accent text-primary'
                    : 'border-transparent text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
                )}
              >
                <Icon className="h-5 w-5" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </Sidebar>
  );
}
