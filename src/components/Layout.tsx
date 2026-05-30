import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { AppSidebar } from '@/components/AppSidebar';
import { FloatingActionButton } from '@/components/FloatingActionButton';
import { BottomNav } from '@/components/mobile/BottomNav';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { LogOut, Flame, Menu, Sun, Moon, RefreshCw, Bell } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { api } from '@/integrations/api/client';

interface LayoutProps {
  children: React.ReactNode;
}

export function Layout({ children }: LayoutProps) {
  // Add dark mode class to html element
  if (typeof window !== 'undefined') {
    document.documentElement.classList.toggle('dark', document.documentElement.classList.contains('dark'));
  }
  const { signOut, user } = useAuth();
  const { theme, setTheme } = useTheme();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [refreshing, setRefreshing] = useState(false);

  const todayStr = new Date().toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });

  const { data: alertCount = 0 } = useQuery({
    queryKey: ['inventory-alerts'],
    queryFn: async () => {
      const items = await api.getInventory();
      return (items || []).filter(
        (i: any) => i.quantity === 0 || i.quantity <= (i.low_stock_threshold || 3) || i.quantity === 1
      ).length;
    },
    staleTime: 60_000,
  });

  const handleSignOut = async () => {
    try {
      await signOut();
      // Force a full page reload to clear all state
      window.location.replace('/login');
    } catch (error) {
      console.error('Sign out error:', error);
    }
  };

  const handleRefreshApp = async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('app:refresh'));
      }
      await queryClient.invalidateQueries();
    } catch (error) {
      console.error('Refresh app error:', error);
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full smooth-scroll bg-background text-foreground">
        <AppSidebar />
        
        <div className="flex-1 flex flex-col min-w-0">
          {/* Mobile sticky header with improved design */}
          <header className="mobile-sticky h-14 sm:h-16 border-b bg-card/95 backdrop-blur-md flex items-center justify-between px-3 sm:px-4 lg:px-6">
            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
              <SidebarTrigger className="touch-target p-2 hover:bg-muted/50 rounded-md transition-colors lg:hidden">
                <Menu className="h-5 w-5" />
              </SidebarTrigger>
              
              <div className="flex items-center gap-2 min-w-0 lg:hidden">
                <Flame className="h-5 w-5 sm:h-6 sm:w-6 text-primary fill-primary flex-shrink-0" />
                <div className="min-w-0">
                  <h1 className="text-lg sm:text-xl font-bold text-foreground truncate">
                    <span className="hidden sm:inline">Heat Wave Locksmith</span>
                    <span className="sm:hidden">Heat Wave</span>
                  </h1>
                  <p className="text-xs text-muted-foreground hidden lg:block">
                    Professional Management System
                  </p>
                </div>
              </div>
            </div>
            
            <div className="flex items-center gap-2 sm:gap-3">
              <span className="hidden lg:inline text-sm font-medium text-muted-foreground">
                {todayStr}
              </span>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => navigate('/inventory')}
                className="rounded-full relative"
                title={alertCount > 0 ? `${alertCount} item(s) need attention` : 'No inventory alerts'}
              >
                <Bell className="h-5 w-5" />
                {alertCount > 0 && (
                  <Badge className="absolute -top-1 -right-1 h-5 min-w-5 px-1 flex items-center justify-center rounded-full bg-primary text-primary-foreground text-[10px]">
                    {alertCount > 99 ? '99+' : alertCount}
                  </Badge>
                )}
                <span className="sr-only">Inventory alerts</span>
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleRefreshApp}
                disabled={refreshing}
                className="rounded-full"
              >
                <RefreshCw className={`h-5 w-5 ${refreshing ? 'animate-spin' : ''}`} />
                <span className="sr-only">Refresh</span>
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                className="rounded-full"
              >
                <Sun className="h-5 w-5 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
                <Moon className="absolute h-5 w-5 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
                <span className="sr-only">Toggle theme</span>
              </Button>
              <div className="hidden md:flex flex-col items-end">
                <span className="text-sm font-medium text-foreground">
                  {`Welcome${user?.businessName ? `, ${user.businessName}` : ''}`}
                </span>
              </div>
              
              <Button
                variant="ghost"
                size="sm"
                onClick={handleSignOut}
                className="gap-1 sm:gap-2 responsive-btn touch-target hover:bg-destructive/10 hover:text-destructive transition-colors"
              >
                <LogOut className="h-4 w-4" />
                <span className="hidden sm:inline">Sign Out</span>
              </Button>
            </div>
          </header>

          {/* Main content with improved mobile layout */}
          <main className="flex-1 mobile-container py-4 sm:py-6 pb-[calc(6rem+env(safe-area-inset-bottom))] md:pb-6 smooth-scroll overflow-y-auto overflow-x-hidden relative">
            <div className="max-w-7xl mx-auto">
              {children}
            </div>
          </main>
        </div>
        
        {/* Bottom Navigation for Mobile */}
        <BottomNav />
        
        {/* Floating Action Button for Mobile (hidden on desktop since sidebar handles nav) */}
        <div className="md:hidden">
          <FloatingActionButton />
        </div>
      </div>
    </SidebarProvider>
  );
}