import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Briefcase, DollarSign, Plus, Clock, CheckCircle, TrendingUp, Calendar, AlertCircle, RefreshCw, FileText, Users, Package, Download, ArrowUp, ArrowDown, Minus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { api } from '@/integrations/api/client';
import { useAuth } from '@/hooks/useAuth';
import { formatCurrency, formatNumber } from '@/lib/format';
import { Skeleton } from '@/components/ui/skeleton';
import { format, subDays, isThisMonth, isToday, startOfWeek, endOfWeek, startOfMonth, endOfMonth, subMonths, isWithinInterval, parseISO, isValid, startOfDay, endOfDay, addDays, differenceInCalendarDays, eachDayOfInterval } from 'date-fns';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useJobsSocket } from '@/hooks/useSocket';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import type { DateRange as DayPickerDateRange } from 'react-day-picker';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

interface Job {
  id: string;
  customer_name: string;
  service_type: string;
  status: 'pending' | 'in_progress' | 'completed';
  price: number;
  created_at: string;
  updated_at?: string;
  job_date?: string; // optional scheduled date
}

interface DashboardData {
  // Income metrics
  income: {
    today: number;
    thisWeek: number;
    thisMonth: number;
    lastMonth: number;
    total: number;
    averageJobValue: number; // Average value per paid job
    monthlyGrowth: number; // Percentage change from last month
  };

  selection: {
    label: string;
    start: string | null;
    end: string | null;
    income: number;
    previousIncome: number;
    changePct: number;
    completedJobs: number;
    averageJobValue: number;
    materialCost: number;
    profit: number;
    profitMargin: number;
  };
  
  // Job metrics
  jobs: {
    total: number;
    pending: number;
    inProgress: number;
    completed: number;
    completionRate: number;
    recent: Job[];
  };
  
  // Simple chart data
  weeklyIncome: Array<{ date: string; amount: number }>;
  jobStatus: Array<{ status: string; count: number }>;
  
  // New analytics
  monthlyIncomeSeries: Array<{ month: string; amount: number }>;
  serviceDistribution: Array<{ type: string; count: number }>;
  
  // Financial analytics
  financial: {
    inventoryInvestment: number; // Total money invested in inventory
    monthlyAnalysis: Array<{
      month: string;
      materialCost: number;
      revenue: number;
      profit: number;
      profitMargin: number;
      jobCount: number;
    }>;
  };
  
  // Reminders widget data
  reminders: {
    upcomingJobs: Job[];
    lowStock: Array<{ id: string; key_type: string; sku: string; quantity: number; low_stock_threshold: number }>;
  };
}

type DateRange = 'today' | 'week' | 'month' | 'lastMonth' | 'all' | 'custom';

// Job type mappings (same as in Jobs.tsx)
const jobTypes = [
  { value: 'spare_key', label: 'Spare Key' },
  { value: 'all_keys_lost', label: 'All Keys Lost' },
  { value: 'car_unlock', label: 'Car Unlock' },
  { value: 'smart_key_programming', label: 'Smart Key Programming' },
  { value: 'house_rekey', label: 'House Rekey' },
  { value: 'lock_repair', label: 'Lock Repair' },
  { value: 'lock_installation', label: 'Lock Installation' },
  { value: 'other', label: 'Other' }
];

const formatJobType = (type: string) => {
  return jobTypes.find(jt => jt.value === type)?.label || type;
};

const getDateRangeFilter = (range: DateRange) => {
  const now = new Date();
  
  switch (range) {
    case 'today':
      return {
        start: new Date(now.setHours(0, 0, 0, 0)),
        end: new Date(now.setHours(23, 59, 59, 999)),
      };
    case 'week':
      return {
        start: startOfWeek(now, { weekStartsOn: 0 }),
        end: endOfWeek(now, { weekStartsOn: 0 }),
      };
    case 'month':
      return {
        start: startOfMonth(now),
        end: endOfMonth(now),
      };
    case 'lastMonth':
      const lastMonth = subMonths(now, 1);
      return {
        start: startOfMonth(lastMonth),
        end: endOfMonth(lastMonth),
      };
    case 'all':
    default:
      return null;
  }
};

const fetchDashboardData = async (
  dateRange: DateRange = 'all',
  customRange?: DayPickerDateRange
): Promise<DashboardData> => {
    try {
      // Fetch all jobs with customer data from local backend
      const allJobsRaw = await api.getJobs();
      const allJobs = (allJobsRaw || []).map((job: any) => ({
        id: job.id,
        status: job.status as 'pending' | 'in_progress' | 'completed',
        price: Number(job.price) || 0,
        created_at: job.createdAt,
        updated_at: job.updatedAt || job.createdAt,
        job_date: job.jobDate || job.createdAt,
        job_type: job.jobType || 'other',
        material_cost: Number(job.materialCost) || 0,
        customer_name: job.customer?.name || 'Unknown Customer',
        customer_phone: job.customer?.phone || null,
        customer_email: job.customer?.email || null,
      }));

      // Fetch inventory for financial analytics and low-stock alerts
      const inventoryRaw = await api.getInventory();
      const inventoryData = (inventoryRaw || []).map((item: any) => ({
        quantity: Number(item.quantity) || 0,
        cost: Number(item.cost) || 0,
        id: item.id,
        key_type: item.keyType || '',
        sku: item.sku || '',
        low_stock_threshold: Number(item.lowStockThreshold ?? 5),
      }));

      // Calculate job metrics
      const now = new Date();
      const lastMonth = new Date();
      lastMonth.setMonth(now.getMonth() - 1);

      const getJobDate = (job: { job_date?: string; created_at: string }) => {
        const raw = job.job_date || job.created_at;
        const parsed = parseISO(raw);
        return isValid(parsed) ? parsed : new Date(raw);
      };

      const getIncomeDate = (job: { updated_at?: string; job_date?: string; created_at: string }) => {
        const raw = job.updated_at || job.job_date || job.created_at;
        const parsed = parseISO(raw);
        return isValid(parsed) ? parsed : new Date(raw);
      };

      const getBasisDate = (job: { updated_at?: string; job_date?: string; created_at: string }) => {
        const raw = job.updated_at || job.created_at;
        const parsed = parseISO(raw);
        return isValid(parsed) ? parsed : new Date(raw);
      };

      const resolveSelectionInterval = () => {
        if (dateRange === 'custom') {
          const from = customRange?.from;
          const to = customRange?.to ?? customRange?.from;
          if (!from) {
            return {
              label: 'Custom',
              start: null as Date | null,
              end: null as Date | null,
            };
          }

          const start = startOfDay(from);
          const end = endOfDay(to || from);

          const label = to && differenceInCalendarDays(to, from) !== 0
            ? `${format(from, 'MMM d, yyyy')} – ${format(to, 'MMM d, yyyy')}`
            : format(from, 'MMM d, yyyy');

          return { label, start, end };
        }

        const preset = getDateRangeFilter(dateRange);
        if (!preset) {
          return { label: 'All Time', start: null as Date | null, end: null as Date | null };
        }

        const label = {
          today: 'Today',
          week: 'This Week',
          month: 'This Month',
          lastMonth: 'Last Month',
        }[dateRange] || 'All Time';

        return { label, start: preset.start, end: preset.end };
      };
      
      const pendingJobs = allJobs.filter(job => job.status === 'pending').length || 0;
      const inProgressJobs = allJobs.filter(job => job.status === 'in_progress').length || 0;
      const completedJobs = allJobs.filter(job => job.status === 'completed').length || 0;
      const totalJobs = allJobs.length || 0;
      
      // Completion rate
      const completionRate = totalJobs > 0 ? Math.round((completedJobs / totalJobs) * 100) : 0;

      // Calculate income metrics
      // Count income from completed jobs (customer pays on completion)
      const today = allJobs
        .filter(job => job.status === 'completed' && isToday(getBasisDate(job)))
        .reduce((sum, job) => {
          const amount = Number(job.price) || 0;
          return sum + amount;
        }, 0) || 0;

      const thisWeekIncome = allJobs
        .filter(job => job.status === 'completed')
        .filter(job => {
          const jobDate = getBasisDate(job);
          return isWithinInterval(jobDate, { start: startOfWeek(now), end: endOfWeek(now) });
        })
        .reduce((sum, job) => {
          const amount = Number(job.price) || 0;
          return sum + amount;
        }, 0) || 0;

      const thisMonthIncome = allJobs
        .filter(job => job.status === 'completed' && isThisMonth(getBasisDate(job)))
        .reduce((sum, job) => {
          const amount = Number(job.price) || 0;
          return sum + amount;
        }, 0) || 0;

      const lastMonthIncome = allJobs
        .filter(job => {
          const jobDate = getBasisDate(job);
          return job.status === 'completed' && 
                 jobDate.getMonth() === lastMonth.getMonth() && 
                 jobDate.getFullYear() === lastMonth.getFullYear();
        })
        .reduce((sum, job) => {
          const amount = Number(job.price) || 0;
          return sum + amount;
        }, 0) || 0;

      const totalIncome = allJobs
        .filter(job => job.status === 'completed')
        .reduce((sum, job) => {
          const amount = Number(job.price) || 0;
          return sum + amount;
        }, 0) || 0;
      
      // Calculate average job value (from completed jobs)
      const averageJobValue = completedJobs > 0 ? totalIncome / completedJobs : 0;
      
      // Calculate monthly growth percentage
      const monthlyGrowth = lastMonthIncome > 0 
        ? Math.round(((thisMonthIncome - lastMonthIncome) / lastMonthIncome) * 100)
        : thisMonthIncome > 0 ? 100 : 0;

      const selectionInterval = resolveSelectionInterval();
      const selectionStart = selectionInterval.start;
      const selectionEnd = selectionInterval.end;

      const selectionJobs = allJobs
        .filter(j => j.status === 'completed')
        .filter(j => {
          if (!selectionStart || !selectionEnd) return true;
          const dt = getBasisDate(j);
          return dt >= selectionStart && dt <= selectionEnd;
        });

      const selectionIncome = selectionJobs.reduce((sum: number, j: any) => sum + (Number(j.price) || 0), 0);
      const selectionMaterialCost = selectionJobs.reduce((sum: number, j: any) => sum + (Number(j.material_cost) || 0), 0);
      const selectionProfit = selectionIncome - selectionMaterialCost;
      const selectionProfitMargin = selectionIncome > 0 ? (selectionProfit / selectionIncome) * 100 : 0;
      const selectionCompletedJobs = selectionJobs.length;
      const selectionAverageJobValue = selectionCompletedJobs > 0 ? selectionIncome / selectionCompletedJobs : 0;

      let previousIncome = 0;
      let changePct = 0;
      if (selectionStart && selectionEnd) {
        const days = differenceInCalendarDays(selectionEnd, selectionStart) + 1;
        const prevStart = addDays(selectionStart, -days);
        const prevEnd = addDays(selectionEnd, -days);

        previousIncome = allJobs
          .filter(j => j.status === 'completed')
          .filter(j => {
            const dt = getBasisDate(j);
            return dt >= prevStart && dt <= prevEnd;
          })
          .reduce((sum: number, j: any) => sum + (Number(j.price) || 0), 0);

        changePct = previousIncome > 0
          ? Math.round(((selectionIncome - previousIncome) / previousIncome) * 100)
          : selectionIncome > 0 ? 100 : 0;
      }

      // Income trend series
      const weeklyIncome = (() => {
        if (selectionStart && selectionEnd) {
          const days = differenceInCalendarDays(selectionEnd, selectionStart) + 1;
          if (days >= 1 && days <= 31) {
            return eachDayOfInterval({ start: selectionStart, end: selectionEnd }).map((d) => {
              const dayJobs = allJobs
                .filter(j => j.status === 'completed')
                .filter(j => {
                  const dt = getBasisDate(j);
                  return dt.toDateString() === d.toDateString();
                });

              const label = days <= 7 ? format(d, 'EEE') : format(d, 'MMM d');

              return {
                date: label,
                amount: dayJobs.reduce((sum, j) => sum + (Number(j.price) || 0), 0),
              };
            });
          }
        }

        return Array.from({ length: 7 }, (_, i) => {
          const date = subDays(now, 6 - i);
          const dayJobs = allJobs.filter(job => {
            const jobDate = getBasisDate(job);
            return job.status === 'completed' && jobDate.toDateString() === date.toDateString();
          }) || [];

          return {
            date: format(date, 'EEE'),
            amount: dayJobs.reduce((sum, job) => {
              const amount = Number(job.price) || 0;
              return sum + amount;
            }, 0)
          };
        });
      })();

      // Job status distribution - only include statuses with jobs
      const jobStatus = [
        { status: 'Completed', count: completedJobs },
        { status: 'In Progress', count: inProgressJobs },
        { status: 'Pending', count: pendingJobs },
      ].filter(item => item.count > 0);

      // Monthly income series for last 6 months
      const monthsBack = 6;
      const monthlyIncomeSeries = Array.from({ length: monthsBack }, (_, idx) => {
        const monthDate = subMonths(new Date(), monthsBack - 1 - idx);
        const start = startOfMonth(monthDate);
        const end = endOfMonth(monthDate);
        const amt = allJobs
          .filter(j => j.status === 'completed')
          .filter(j => {
            const dt = getBasisDate(j);
            return dt >= start && dt <= end;
          })
          .reduce((sum, j) => sum + (Number(j.price) || 0), 0);
        return { month: format(start, 'MMM'), amount: amt };
      });

      // Service distribution by job_type
      const serviceMap = new Map<string, number>();
      allJobs.forEach((j: any) => {
        const type = j.job_type || 'other';
        const displayType = formatJobType(type);
        serviceMap.set(displayType, (serviceMap.get(displayType) || 0) + 1);
      });
      const serviceDistribution = Array.from(serviceMap.entries())
        .map(([type, count]) => ({ type, count }))
        .sort((a, b) => b.count - a.count);
      
      console.log('Service distribution:', serviceDistribution);

      // Reminders: upcoming jobs (next 7 days) and low stock inventory
      const nowDt = new Date();
      const sevenDaysOut = new Date();
      sevenDaysOut.setDate(nowDt.getDate() + 7);

      const upcomingJobs: Job[] = allJobs
        .filter(j => (j.status !== 'completed'))
        .filter(j => {
          const when = getJobDate(j);
          return when >= new Date(nowDt.setHours(0,0,0,0)) && when <= sevenDaysOut;
        })
        .sort((a, b) => new Date(a.job_date || a.created_at).getTime() - new Date(b.job_date || b.created_at).getTime())
        .slice(0, 5)
        .map(j => ({
          id: j.id,
          customer_name: j.customer_name,
          service_type: formatJobType(j.job_type || 'other'),
          status: j.status,
          price: j.price,
          created_at: j.created_at,
          job_date: j.job_date,
        }));

      // Calculate Financial Analytics
      // 1. Total Inventory Investment
      const inventoryInvestment = inventoryData.reduce((sum: number, item: any) => {
        return sum + (item.quantity * item.cost);
      }, 0);

      // 2. Monthly Profit Analysis (last 6 months)
      const monthlyAnalysis = [];
      for (let i = 5; i >= 0; i--) {
        const monthStart = startOfMonth(subMonths(new Date(), i));
        const monthEnd = endOfMonth(monthStart);
        
        const monthJobs = allJobs.filter((j: any) => {
          const jobDate = getBasisDate(j);
          return j.status === 'completed' && jobDate >= monthStart && jobDate <= monthEnd;
        });

        const materialCost = monthJobs.reduce((sum: number, j: any) => sum + (Number(j.material_cost) || 0), 0);
        const revenue = monthJobs.reduce((sum: number, j: any) => sum + (Number(j.price) || 0), 0);
        const profit = revenue - materialCost;
        const profitMargin = revenue > 0 ? (profit / revenue) * 100 : 0;

        monthlyAnalysis.push({
          month: format(monthStart, 'MMM yyyy'),
          materialCost,
          revenue,
          profit,
          profitMargin,
          jobCount: monthJobs.length
        });
      }

      // Fetch minimal inventory for low-stock alerts
      const lowStock = inventoryData
        .filter((i: any) =>
          typeof i.low_stock_threshold === 'number' &&
          typeof i.quantity === 'number' &&
          i.quantity <= i.low_stock_threshold
        )
        .slice(0, 5);

      // Set dashboard data
      const dashboardData: DashboardData = {
        income: {
          today,
          thisWeek: thisWeekIncome,
          thisMonth: thisMonthIncome,
          lastMonth: lastMonthIncome,
          total: totalIncome,
          averageJobValue,
          monthlyGrowth,
        },
        selection: {
          label: selectionInterval.label,
          start: selectionStart ? format(selectionStart, 'yyyy-MM-dd') : null,
          end: selectionEnd ? format(selectionEnd, 'yyyy-MM-dd') : null,
          income: selectionIncome,
          previousIncome,
          changePct,
          completedJobs: selectionCompletedJobs,
          averageJobValue: selectionAverageJobValue,
          materialCost: selectionMaterialCost,
          profit: selectionProfit,
          profitMargin: selectionProfitMargin,
        },
        jobs: {
          total: totalJobs,
          pending: pendingJobs,
          inProgress: inProgressJobs,
          completed: completedJobs,
          completionRate,
          recent: allJobs.slice(0, 5).map((job: any) => {
            const customerName = job.customer_name || 'Unknown Customer';
            const serviceType = formatJobType(job.job_type || 'other');

            return {
              id: job.id,
              customer_name: customerName,
              service_type: serviceType,
              status: (job.status || 'pending') as 'pending' | 'in_progress' | 'completed',
              price: job.price || 0,
              created_at: job.created_at,
            };
          }),
        },
        weeklyIncome,
        jobStatus,
        monthlyIncomeSeries,
        serviceDistribution,
        financial: {
          inventoryInvestment,
          monthlyAnalysis,
        },
        reminders: {
          upcomingJobs,
          lowStock,
        },
      };

      return dashboardData;
    } catch (error) {
      console.error('Dashboard load error:', error);
      throw error;
    }
  };

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [dateRange, setDateRange] = useState<DateRange>('month');
  const [customRange, setCustomRange] = useState<DayPickerDateRange | undefined>(undefined);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
  const [lastRefreshAttemptAt, setLastRefreshAttemptAt] = useState<Date | null>(null);

  // Helper to navigate to Jobs with filters
  const navigateToJobs = (params: { status?: string; when?: string; from?: string; to?: string }) => {
    const search = new URLSearchParams({
      ...(params.status ? { status: params.status } : {}),
      ...(params.when ? { when: params.when } : {}),
      ...(params.from ? { from: params.from } : {}),
      ...(params.to ? { to: params.to } : {}),
    }).toString();
    navigate(`/jobs${search ? `?${search}` : ''}`);
  };
  
  // Use React Query for data fetching
  const {
    data: dashboardData,
    isLoading,
    isFetching,
    dataUpdatedAt,
    isError,
    error,
    refetch
  } = useQuery<DashboardData>({
    queryKey: [
      'dashboard-data',
      dateRange,
      customRange?.from ? format(customRange.from, 'yyyy-MM-dd') : null,
      customRange?.to ? format(customRange.to, 'yyyy-MM-dd') : null,
    ],
    queryFn: () => fetchDashboardData(dateRange, customRange),
    staleTime: 2 * 60 * 1000, // 2 minutes
    refetchOnMount: 'always',
    retry: 2,
  });
  
  // Real-time updates for jobs via Socket.IO
  useJobsSocket(() => {
    queryClient.invalidateQueries({ queryKey: ['dashboard-data'] });
    void refetch();
  });
  
  // Default data structure
  const defaultData: DashboardData = {
    income: { today: 0, thisWeek: 0, thisMonth: 0, lastMonth: 0, total: 0, averageJobValue: 0, monthlyGrowth: 0 },
    selection: {
      label: 'All Time',
      start: null,
      end: null,
      income: 0,
      previousIncome: 0,
      changePct: 0,
      completedJobs: 0,
      averageJobValue: 0,
      materialCost: 0,
      profit: 0,
      profitMargin: 0,
    },
    jobs: { total: 0, pending: 0, inProgress: 0, completed: 0, completionRate: 0, recent: [] },
    weeklyIncome: [],
    jobStatus: [],
    monthlyIncomeSeries: [],
    serviceDistribution: [],
    financial: {
      inventoryInvestment: 0,
      monthlyAnalysis: [],
    },
    reminders: {
      upcomingJobs: [],
      lowStock: [],
    },
  };
  
  const data = dashboardData || defaultData;
  
  
  // Export dashboard data as CSV
  const exportToCSV = () => {
    try {
      const dateRangeLabel = {
        today: 'Today',
        week: 'This Week',
        month: 'This Month',
        lastMonth: 'Last Month',
        all: 'All Time',
        custom: data.selection.label,
      }[dateRange];
      
      // Prepare CSV content
      const csvContent = [
        ['Heat Wave Locksmith - Dashboard Report'],
        [`Date Range: ${dateRangeLabel}`],
        [`Generated: ${format(new Date(), 'MMM d, yyyy h:mm a')}`],
        [],
        ['INCOME SUMMARY'],
        ['Metric', 'Amount'],
        ['Today\'s Income', `$${data.income.today.toFixed(2)}`],
        ['Weekly Income', `$${data.income.thisWeek.toFixed(2)}`],
        ['Monthly Income', `$${data.income.thisMonth.toFixed(2)}`],
        ['Last Month Income', `$${data.income.lastMonth.toFixed(2)}`],
        ['Total Income', `$${data.income.total.toFixed(2)}`],
        [],
        ['JOB STATISTICS'],
        ['Metric', 'Count'],
        ['Total Jobs', data.jobs.total],
        ['Pending Jobs', data.jobs.pending],
        ['In Progress Jobs', data.jobs.inProgress],
        ['Completed Jobs', data.jobs.completed],
        ['Completion Rate', `${data.jobs.completionRate}%`],
        [],
        ['WEEKLY INCOME'],
        ['Day', 'Amount'],
        ...data.weeklyIncome.map(day => [day.date, `$${day.amount.toFixed(2)}`]),
        [],
        ['RECENT JOBS'],
        ['Customer', 'Service', 'Status', 'Amount', 'Date'],
        ...data.jobs.recent.map(job => [
          job.customer_name,
          job.service_type,
          job.status,
          `$${job.price.toFixed(2)}`,
          format(new Date(job.created_at), 'MMM d, yyyy')
        ])
      ].map(row => row.join(',')).join('\n');
      
      // Create and download file
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', `dashboard-report-${format(new Date(), 'yyyy-MM-dd')}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      toast.success('Report exported successfully', {
        description: 'Your dashboard report has been downloaded',
      });
    } catch (error) {
      console.error('Export error:', error);
      toast.error('Failed to export report', {
        description: 'Please try again',
      });
    }
  };

  const handleRefresh = async () => {
    setLastRefreshAttemptAt(new Date());
    const toastId = toast.loading('Refreshing dashboard...');
    try {
      await queryClient.invalidateQueries({ queryKey: ['dashboard-data'] });
      await refetch({ throwOnError: true });

      setLastUpdatedAt(new Date());

      toast.success('Dashboard refreshed', {
        description: 'Latest data has been loaded'
      , id: toastId
      });
    } catch (error) {
      console.error('Dashboard refresh error:', error);
      toast.error('Failed to refresh data', {
        description: 'Please try again'
      , id: toastId
      });
    }
  };

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-36 rounded-xl" />
          ))}
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {[1, 2].map((i) => (
            <Skeleton key={i} className="h-64 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }
  
  if (isError) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle className="text-destructive">Error Loading Dashboard</CardTitle>
            <CardDescription>
              {error instanceof Error ? error.message : 'An unexpected error occurred'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button 
              onClick={handleRefresh}
              className="w-full gap-2"
              disabled={isFetching}
            >
              <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
              Try Again
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex-1 space-y-6 p-4 md:p-8 pt-6">
      
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground">Overview of your business performance</p>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <Input
            placeholder="Quick search jobs (press Enter)"
            className="w-[220px] hidden lg:block"
            onKeyDown={(e) => {
              const target = e.target as HTMLInputElement;
              if (e.key === 'Enter' && target.value.trim()) {
                navigate(`/jobs?q=${encodeURIComponent(target.value.trim())}`);
              }
            }}
          />
          <Select
            value={dateRange}
            onValueChange={(value: DateRange) => {
              setDateRange(value);
              if (value === 'custom') {
                setCustomRange((prev) => prev?.from ? prev : { from: new Date(), to: new Date() });
              }
            }}
          >
            <SelectTrigger className="w-[140px]">
              <Calendar className="h-4 w-4 mr-2" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="today">Today</SelectItem>
              <SelectItem value="week">This Week</SelectItem>
              <SelectItem value="month">This Month</SelectItem>
              <SelectItem value="lastMonth">Last Month</SelectItem>
              <SelectItem value="all">All Time</SelectItem>
              <SelectItem value="custom">Custom…</SelectItem>
            </SelectContent>
          </Select>

          {dateRange === 'custom' && (
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    'justify-start text-left font-normal h-11 sm:h-10',
                    !customRange?.from && 'text-muted-foreground'
                  )}
                >
                  <Calendar className="h-4 w-4 mr-2" />
                  {customRange?.from ? (
                    customRange.to && differenceInCalendarDays(customRange.to, customRange.from) !== 0
                      ? `${format(customRange.from, 'MMM d, yyyy')} – ${format(customRange.to, 'MMM d, yyyy')}`
                      : format(customRange.from, 'MMM d, yyyy')
                  ) : (
                    'Pick a date range'
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <CalendarComponent
                  mode="range"
                  selected={customRange}
                  onSelect={setCustomRange}
                  initialFocus
                  className="p-3 pointer-events-auto"
                />
              </PopoverContent>
            </Popover>
          )}
          <Button 
            variant="outline" 
            size="sm" 
            onClick={exportToCSV}
            disabled={data.jobs.total === 0}
            className="gap-1"
          >
            <Download className="h-4 w-4" />
            <span className="hidden sm:inline">Export</span>
          </Button>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={handleRefresh}
            className="px-3"
            title="Refresh"
          >
            <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
          </Button>
          {(() => {
            const ts = lastUpdatedAt ?? (dataUpdatedAt ? new Date(dataUpdatedAt) : null);
            if (isFetching) {
              return (
                <span className="text-xs text-muted-foreground hidden sm:inline">
                  Refreshing
                </span>
              );
            }
            if (ts) {
              return (
                <span className="text-xs text-muted-foreground hidden sm:inline">
                  Updated {format(ts, 'h:mm:ss a')}
                </span>
              );
            }
            if (lastRefreshAttemptAt) {
              return (
                <span className="text-xs text-muted-foreground hidden sm:inline">
                  Attempted {format(lastRefreshAttemptAt, 'h:mm:ss a')}
                </span>
              );
            }
            return null;
          })()}
        </div>
      </div>

      {/* Quick Actions */}
      <div>
        <h2 className="text-lg font-semibold mb-3 px-1">Quick Actions</h2>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => navigate('/jobs?new=true')} className="gap-2">
            <Plus className="h-4 w-4" />
            Create Job
          </Button>
          <Button variant="outline" onClick={() => navigate('/inventory')} className="gap-2">
            <Package className="h-4 w-4" />
            Add Inventory
          </Button>
          <Button variant="outline" onClick={() => navigate('/customers')} className="gap-2">
            <Users className="h-4 w-4" />
            View Customers
          </Button>
        </div>
      </div>

      {/* Income Overview */}
      <div>
        <h2 className="text-lg font-semibold mb-3 px-1">Income Overview</h2>
        <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-5">
          <Card
            role="button"
            onClick={() =>
              navigateToJobs({
                status: 'completed',
                from: data.selection.start || undefined,
                to: data.selection.end || undefined,
              })
            }
            className="cursor-pointer hover:shadow-sm transition-shadow"
          >
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Income</CardTitle>
              <div className="flex items-center gap-1">
                {data.selection.changePct !== 0 && (
                  data.selection.changePct > 0
                    ? <ArrowUp className="h-4 w-4 text-green-600" />
                    : <ArrowDown className="h-4 w-4 text-red-600" />
                )}
                <DollarSign className="h-4 w-4 text-muted-foreground" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCurrency(data.selection.income)}</div>
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <span className="font-medium">{data.selection.label}</span>
                {data.selection.start && data.selection.end && (
                  <>
                    <span>•</span>
                    <span className={data.selection.changePct > 0 ? 'text-green-600' : data.selection.changePct < 0 ? 'text-red-600' : 'text-muted-foreground'}>
                      {data.selection.changePct > 0 ? '+' : ''}{data.selection.changePct}%
                    </span>
                  </>
                )}
              </p>
            </CardContent>
          </Card>
          
          <Card
            role="button"
            onClick={() =>
              navigateToJobs({
                status: 'completed',
                from: data.selection.start || undefined,
                to: data.selection.end || undefined,
              })
            }
            className="cursor-pointer hover:shadow-sm transition-shadow"
          >
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Profit</CardTitle>
              <CheckCircle className="h-4 w-4 text-green-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCurrency(data.selection.profit)}</div>
              <p className="text-xs text-muted-foreground">
                Margin {data.selection.profitMargin.toFixed(1)}%
              </p>
            </CardContent>
          </Card>

          <Card
            role="button"
            onClick={() =>
              navigateToJobs({
                status: 'completed',
                from: data.selection.start || undefined,
                to: data.selection.end || undefined,
              })
            }
            className="cursor-pointer hover:shadow-sm transition-shadow"
          >
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Material Cost</CardTitle>
              <Package className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCurrency(data.selection.materialCost)}</div>
              <p className="text-xs text-muted-foreground">For completed jobs</p>
            </CardContent>
          </Card>
          
          <Card
            role="button"
            onClick={() =>
              navigateToJobs({
                status: 'completed',
                from: data.selection.start || undefined,
                to: data.selection.end || undefined,
              })
            }
            className="cursor-pointer hover:shadow-sm transition-shadow"
          >
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Completed Jobs</CardTitle>
              <Briefcase className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{data.selection.completedJobs}</div>
              <p className="text-xs text-muted-foreground">{data.selection.label}</p>
            </CardContent>
          </Card>
          
          <Card
            role="button"
            onClick={() =>
              navigateToJobs({
                status: 'completed',
                from: data.selection.start || undefined,
                to: data.selection.end || undefined,
              })
            }
            className="cursor-pointer hover:shadow-sm transition-shadow"
          >
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Average Job Value</CardTitle>
              <div className="flex items-center gap-1">
                {data.selection.completedJobs > 0 && (
                  <TrendingUp className="h-4 w-4 text-primary" />
                )}
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCurrency(data.selection.averageJobValue)}</div>
              <p className="text-xs text-muted-foreground">
                Per job • <span className="font-medium">{data.selection.completedJobs}</span> completed
              </p>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Charts */}
      <div className="grid gap-4 grid-cols-1 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Income Trend</CardTitle>
            <CardDescription>
              {data.selection.label}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {data.weeklyIncome.every(day => day.amount === 0) ? (
              <div className="h-[200px] sm:h-[250px] flex flex-col items-center justify-center text-center p-4 sm:p-6">
                <DollarSign className="h-12 w-12 text-muted-foreground/50 mb-3" />
                <h3 className="font-semibold text-lg mb-2">No Income Data</h3>
                <p className="text-sm text-muted-foreground">
                  Start adding jobs to see your weekly income trends
                </p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={data.weeklyIncome}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis 
                  dataKey="date" 
                  className="text-xs"
                  tick={{ fill: 'currentColor' }}
                />
                <YAxis 
                  className="text-xs"
                  tick={{ fill: 'currentColor' }}
                  tickFormatter={(value) => `$${value}`}
                />
                <Tooltip 
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      return (
                        <div className="bg-popover border rounded-lg shadow-lg p-3">
                          <p className="text-sm font-medium">{payload[0].payload.date}</p>
                          <p className="text-sm text-primary font-bold">
                            {formatCurrency(payload[0].value as number)}
                          </p>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Bar 
                  dataKey="amount" 
                  fill="hsl(var(--primary))" 
                  radius={[8, 8, 0, 0]}
                  className="hover:opacity-80 transition-opacity"
                />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Monthly Income (Last 6 Months) */}
        <Card>
          <CardHeader>
            <CardTitle>Monthly Income</CardTitle>
            <CardDescription>Last 6 months</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={data.monthlyIncomeSeries}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="month" className="text-xs" tick={{ fill: 'currentColor' }} />
                <YAxis className="text-xs" tick={{ fill: 'currentColor' }} tickFormatter={(v) => `$${v}`} />
                <Tooltip 
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      return (
                        <div className="bg-popover border rounded-lg shadow-lg p-3">
                          <p className="text-sm font-medium">{payload[0].payload.month}</p>
                          <p className="text-sm text-primary font-bold">{formatCurrency(payload[0].payload.amount)}</p>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Bar dataKey="amount" fill="hsl(var(--primary))" radius={[8,8,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Service Distribution */}
        <Card>
          <CardHeader>
            <CardTitle>Service Distribution</CardTitle>
            <CardDescription>Jobs by service type</CardDescription>
          </CardHeader>
          <CardContent>
            {data.serviceDistribution.length === 0 ? (
              <div className="h-[250px] flex flex-col items-center justify-center text-center p-6">
                <Briefcase className="h-12 w-12 text-muted-foreground/50 mb-3" />
                <h3 className="font-semibold text-lg mb-2">No Service Data</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Create jobs to see service type distribution
                </p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={data.serviceDistribution} layout="vertical" margin={{ left: 24 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis type="number" className="text-xs" tick={{ fill: 'currentColor' }} />
                  <YAxis type="category" dataKey="type" className="text-xs" tick={{ fill: 'currentColor' }} width={120} />
                  <Tooltip 
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        return (
                          <div className="bg-popover border rounded-lg shadow-lg p-3">
                            <p className="text-sm font-medium">{payload[0].payload.type}</p>
                            <p className="text-sm text-primary font-bold">{payload[0].payload.count} jobs</p>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Bar dataKey="count" fill="hsl(var(--accent))" radius={[8,8,8,8]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Financial Analytics Section */}
        <Card className="col-span-full">
          <CardHeader>
            <CardTitle>Financial Analytics</CardTitle>
            <CardDescription>Inventory investment and monthly profit analysis</CardDescription>
          </CardHeader>
          <CardContent>
            {/* Inventory Investment KPI */}
            <div className="mb-6 p-4 bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-950 dark:to-teal-950 rounded-lg border border-emerald-200 dark:border-emerald-800">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Total Inventory Investment</p>
                  <p className="text-3xl font-bold text-emerald-700 dark:text-emerald-400">
                    {formatCurrency(data.financial.inventoryInvestment)}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Sum of all unit costs × quantities in stock
                  </p>
                </div>
                <Package className="h-12 w-12 text-emerald-600 dark:text-emerald-400 opacity-50" />
              </div>
            </div>

            {/* Monthly Profit Analysis Table */}
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-3 px-4 font-semibold text-sm">Month</th>
                    <th className="text-right py-3 px-4 font-semibold text-sm">Jobs</th>
                    <th className="text-right py-3 px-4 font-semibold text-sm">Material Cost</th>
                    <th className="text-right py-3 px-4 font-semibold text-sm">Revenue</th>
                    <th className="text-right py-3 px-4 font-semibold text-sm">Profit</th>
                    <th className="text-right py-3 px-4 font-semibold text-sm">Margin %</th>
                  </tr>
                </thead>
                <tbody>
                  {data.financial.monthlyAnalysis.map((month, idx) => (
                    <tr key={idx} className="border-b hover:bg-muted/50 transition-colors">
                      <td className="py-3 px-4 font-medium">{month.month}</td>
                      <td className="text-right py-3 px-4 text-muted-foreground">{month.jobCount}</td>
                      <td className="text-right py-3 px-4 text-accent">
                        {formatCurrency(month.materialCost)}
                      </td>
                      <td className="text-right py-3 px-4 text-primary font-medium">
                        {formatCurrency(month.revenue)}
                      </td>
                      <td className="text-right py-3 px-4 font-semibold">
                        <span className={month.profit >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}>
                          {formatCurrency(month.profit)}
                        </span>
                      </td>
                      <td className="text-right py-3 px-4">
                        <span className={`font-medium ${
                          month.profitMargin >= 50 ? 'text-green-600 dark:text-green-400' :
                          month.profitMargin >= 25 ? 'text-yellow-600 dark:text-yellow-400' :
                          'text-red-600 dark:text-red-400'
                        }`}>
                          {month.profitMargin.toFixed(1)}%
                        </span>
                      </td>
                    </tr>
                  ))}
                  {/* Totals Row */}
                  <tr className="bg-muted/50 font-semibold">
                    <td className="py-3 px-4">Total</td>
                    <td className="text-right py-3 px-4">
                      {data.financial.monthlyAnalysis.reduce((sum, m) => sum + m.jobCount, 0)}
                    </td>
                    <td className="text-right py-3 px-4 text-orange-600 dark:text-orange-400">
                      {formatCurrency(data.financial.monthlyAnalysis.reduce((sum, m) => sum + m.materialCost, 0))}
                    </td>
                    <td className="text-right py-3 px-4 text-primary">
                      {formatCurrency(data.financial.monthlyAnalysis.reduce((sum, m) => sum + m.revenue, 0))}
                    </td>
                    <td className="text-right py-3 px-4 text-green-600 dark:text-green-400">
                      {formatCurrency(data.financial.monthlyAnalysis.reduce((sum, m) => sum + m.profit, 0))}
                    </td>
                    <td className="text-right py-3 px-4">
                      {(() => {
                        const totalRevenue = data.financial.monthlyAnalysis.reduce((sum, m) => sum + m.revenue, 0);
                        const totalProfit = data.financial.monthlyAnalysis.reduce((sum, m) => sum + m.profit, 0);
                        const avgMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;
                        return `${avgMargin.toFixed(1)}%`;
                      })()}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Summary Insights */}
            <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-4 bg-accent/10 dark:bg-accent/20 rounded-lg border border-accent/20 dark:border-accent/30">
                <p className="text-xs text-muted-foreground mb-1">Total Materials Used</p>
                <p className="text-xl font-bold text-accent">
                  {formatCurrency(data.financial.monthlyAnalysis.reduce((sum, m) => sum + m.materialCost, 0))}
                </p>
              </div>
              <div className="p-4 bg-primary/10 dark:bg-primary/20 rounded-lg border border-primary/20 dark:border-primary/30">
                <p className="text-xs text-muted-foreground mb-1">Total Revenue (6 months)</p>
                <p className="text-xl font-bold text-primary">
                  {formatCurrency(data.financial.monthlyAnalysis.reduce((sum, m) => sum + m.revenue, 0))}
                </p>
              </div>
              <div className="p-4 bg-green-50 dark:bg-green-950 rounded-lg border border-green-200 dark:border-green-800">
                <p className="text-xs text-muted-foreground mb-1">Total Profit (6 months)</p>
                <p className="text-xl font-bold text-green-700 dark:text-green-400">
                  {formatCurrency(data.financial.monthlyAnalysis.reduce((sum, m) => sum + m.profit, 0))}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Recent Activity */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Recent Activity</CardTitle>
                <CardDescription>Latest jobs and actions</CardDescription>
              </div>
              <Button variant="outline" size="sm" onClick={() => navigate('/jobs')}>
                View All
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {data.jobs.recent.length > 0 ? (
                data.jobs.recent.map((job) => (
                  <div 
                    key={job.id} 
                    className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 transition-colors"
                    onClick={() => navigate(`/jobs/${job.id}`)}
                  >
                    <div className="flex items-center space-x-4">
                      <div className={`p-2 rounded-full ${
                        job.status === 'completed' 
                          ? 'bg-green-100 text-green-600 dark:bg-green-900/50' 
                          : job.status === 'in_progress'
                          ? 'bg-primary/10 text-primary dark:bg-primary/20'
                          : 'bg-amber-100 text-amber-600 dark:bg-amber-900/50'
                      }`}>
                        {job.status === 'completed' ? (
                          <CheckCircle className="h-5 w-5" />
                        ) : job.status === 'in_progress' ? (
                          <Clock className="h-5 w-5" />
                        ) : (
                          <AlertCircle className="h-5 w-5" />
                        )}
                      </div>
                      <div>
                        <p className="font-medium">{job.service_type}</p>
                        <p className="text-sm text-muted-foreground">{job.customer_name}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-medium">{formatCurrency(job.price)}</p>
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(job.created_at), 'MMM d, yyyy')}
                      </p>
                    </div>
                  </div>
                ))
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <FileText className="h-16 w-16 text-muted-foreground/50 mb-4" />
                  <h3 className="font-semibold text-lg mb-2">No Recent Activity</h3>
                  <p className="text-sm text-muted-foreground mb-6 max-w-sm">
                    Get started by creating a job, adding inventory, or adding a customer.
                  </p>
                  <div className="flex gap-2">
                    <Button onClick={() => navigate('/jobs?new=true')} size="sm">
                      <Plus className="h-4 w-4 mr-2" />
                      Create Job
                    </Button>
                    <Button onClick={() => navigate('/customers')} variant="outline" size="sm">
                      <Users className="h-4 w-4 mr-2" />
                      Add Customer
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
