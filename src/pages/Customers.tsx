import { useState, useEffect } from 'react';
import { Plus, Search, Edit, Trash2, Phone, Mail, MapPin, User, History, DollarSign, Users as UsersIcon, TrendingUp, Award, PhoneCall, Send, Navigation, ArrowUpDown, Star, Sparkles, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/hooks/useAuth';
import { toast } from '@/hooks/use-toast';
import { SearchBar } from '@/components/SearchBar';
import { SkeletonCard } from '@/components/LoadingSpinner';
import { useErrorHandler } from '@/hooks/useErrorHandler';
import { format } from 'date-fns';
import { api } from '@/integrations/api/client';
import { useCustomersSocket } from '@/hooks/useSocket';
import { useNavigate } from 'react-router-dom';

interface Customer {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  address?: string;
  notes?: string;
  created_at: string;
  total_jobs?: number;
  total_revenue?: number;
  last_job_date?: string;
  next_follow_up_at?: string | null;
}

export default function Customers() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [filteredCustomers, setFilteredCustomers] = useState<Customer[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<'recent' | 'revenue' | 'jobs' | 'name'>('recent');
  const [filterBy, setFilterBy] = useState<'all' | 'vip' | 'active' | 'new' | 'inactive'>('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [historyDialogOpen, setHistoryDialogOpen] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [customerJobs, setCustomerJobs] = useState<any[]>([]);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const { isLoading, executeAsync } = useErrorHandler();
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    email: '',
    address: '',
    notes: ''
  });

  // Helper function for status colors
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300';
      case 'in_progress': return 'bg-primary/10 text-primary dark:bg-primary/20';
      default: return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300';
    }
  };

  useEffect(() => {
    loadCustomers();

    const handleOpenAdd = () => {
      resetForm();
      setDialogOpen(true);
    };

    window.addEventListener('openAddCustomer', handleOpenAdd);
    return () => window.removeEventListener('openAddCustomer', handleOpenAdd);
  }, []);

  useEffect(() => {
    const handleAppRefresh = () => {
      loadCustomers();
    };

    window.addEventListener('app:refresh', handleAppRefresh);
    return () => window.removeEventListener('app:refresh', handleAppRefresh);
  }, []);

  // Real-time updates via Socket.IO
  useCustomersSocket(() => {
    loadCustomers();
  });

  const loadCustomers = async () => {
    await executeAsync(async () => {
      const data = await api.getCustomers();

      const customersWithStats = (data || []).map((customer: any) => {
        const jobs = customer.jobs || [];
        const totalJobs = jobs.length;
        const completedJobs = jobs.filter((j: any) => j.status === 'completed');
        const totalRevenue = completedJobs.reduce(
          (sum: number, j: any) => sum + (Number(j.price) || 0),
          0
        );

        const sortedJobs = [...jobs].sort(
          (a: any, b: any) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
        const lastJobDate = sortedJobs.length > 0 ? sortedJobs[0].createdAt : null;

        return {
          id: customer.id,
          name: customer.name,
          phone: customer.phone,
          email: customer.email,
          address: customer.address,
          notes: customer.notes,
          next_follow_up_at: customer.nextFollowUpAt ?? null,
          created_at: customer.createdAt,
          total_jobs: totalJobs,
          total_revenue: totalRevenue,
          last_job_date: lastJobDate,
        } as Customer;
      });

      setCustomers(customersWithStats);
      setFilteredCustomers(customersWithStats);
      return true;
    }, {
      errorMessage: "Failed to load customers"
    });
  };

  // Enhanced search, sort, and filter functionality
  useEffect(() => {
    applyFiltersAndSort();
  }, [customers, searchTerm, sortBy, filterBy]);

  const applyFiltersAndSort = () => {
    let result = [...customers];

    // Apply search
    if (searchTerm.trim()) {
      result = result.filter(customer =>
        customer.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        customer.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        customer.phone?.includes(searchTerm) ||
        customer.address?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // Apply filters
    switch (filterBy) {
      case 'vip':
        result = result.filter(c => (c.total_revenue || 0) > 500);
        break;
      case 'active':
        const threeMonthsAgo = new Date();
        threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
        result = result.filter(c => c.last_job_date && new Date(c.last_job_date) > threeMonthsAgo);
        break;
      case 'new':
        const oneMonthAgo = new Date();
        oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
        result = result.filter(c => new Date(c.created_at) > oneMonthAgo);
        break;
      case 'inactive':
        const sixMonthsAgo = new Date();
        sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
        result = result.filter(c => !c.last_job_date || new Date(c.last_job_date) < sixMonthsAgo);
        break;
    }

    // Apply sorting
    switch (sortBy) {
      case 'revenue':
        result.sort((a, b) => (b.total_revenue || 0) - (a.total_revenue || 0));
        break;
      case 'jobs':
        result.sort((a, b) => (b.total_jobs || 0) - (a.total_jobs || 0));
        break;
      case 'name':
        result.sort((a, b) => a.name.localeCompare(b.name));
        break;
      case 'recent':
      default:
        result.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        break;
    }

    setFilteredCustomers(result);
  };

  const handleSearch = (query: string) => {
    setSearchTerm(query);
  };

  const viewCustomerHistory = async (customer: Customer) => {
    setSelectedCustomer(customer);
    await executeAsync(async () => {
      const allJobs = await api.getJobs();
      const customerJobs = (allJobs || [])
        .filter((job: any) => job.customerId === customer.id)
        .map((job: any) => ({
          id: job.id,
          job_type: job.jobType,
          job_date: job.jobDate,
          status: job.status,
          price: job.price,
          notes: job.notes,
          created_at: job.createdAt,
        }))
        .sort(
          (a: any, b: any) =>
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );

      setCustomerJobs(customerJobs);
      setHistoryDialogOpen(true);
      return true;
    }, {
      errorMessage: "Failed to load customer job history"
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!user) {
      toast({
        title: "Error",
        description: "You must be logged in to manage customers",
        variant: "destructive",
      });
      return;
    }
    
    try {
      if (editingCustomer) {
        await api.updateCustomer(editingCustomer.id, formData);
        
        toast({ title: "Success", description: "Customer updated successfully" });
      } else {
        const newCustomer = await api.createCustomer(formData);

        toast({ title: "Success", description: "Customer created successfully" });

        setDialogOpen(false);
        resetForm();
        navigate(`/jobs?new=true&customerId=${newCustomer.id}`);
        return;
      }
      
      loadCustomers();
      setDialogOpen(false);
      resetForm();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to save customer';
      const status = typeof (error as any)?.status === 'number' ? (error as any).status : null;

      console.error('Error saving customer:', { error, status, message });
      toast({
        title: "Error",
        description: status ? `${message} (HTTP ${status})` : message,
        variant: "destructive",
      });
    }
  };

  const handleEdit = (customer: Customer) => {
    setEditingCustomer(customer);
    setFormData({
      name: customer.name,
      phone: customer.phone || '',
      email: customer.email || '',
      address: customer.address || '',
      notes: customer.notes || ''
    });
    setDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    // Find customer name before deletion
    const customer = customers.find(c => c.id === id);
    if (!customer) return;
    
    if (!confirm('Are you sure you want to delete this customer?')) return;
    
    try {
      await api.deleteCustomer(id);
      
      toast({ title: "Success", description: "Customer deleted successfully" });
      loadCustomers();
    } catch (error) {
      console.error('Error deleting customer:', error);
      toast({
        title: "Error",
        description: "Failed to delete customer",
        variant: "destructive",
      });
    }
  };

  const resetForm = () => {
    setFormData({ name: '', phone: '', email: '', address: '', notes: '' });
    setEditingCustomer(null);
  };

  const normalizePhone = (phone: string) => phone.replace(/[^\d+]/g, '');
  const openSMS = (phone: string, body: string) => {
    const normalized = normalizePhone(phone);
    const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent);
    const link = document.createElement('a');
    link.href = `sms:${normalized}${isIOS ? '&' : '?'}body=${encodeURIComponent(body)}`;
    link.click();
  };

  const handleRequestReview = (customer: Customer) => {
    if (!customer.phone) return;
    const reviewUrl = (import.meta.env.VITE_GOOGLE_REVIEW_URL || '').trim();
    const msgBody = 'Hi ' + customer.name + "! We'd really appreciate an honest review from you — it means the world to a small business like ours!";
    const message = reviewUrl ? msgBody + ' ' + reviewUrl : msgBody;
    openSMS(customer.phone, message);
  };

  const setFollowUp = async (customer: Customer, daysFromNow: number) => {
    const next = new Date();
    next.setDate(next.getDate() + daysFromNow);
    try {
      await api.updateCustomer(customer.id, {
        nextFollowUpAt: next.toISOString(),
      });
      toast({
        title: 'Follow-up scheduled',
        description: `${customer.name} on ${format(next, 'MMM dd, yyyy')}`,
      });
      loadCustomers();
    } catch (error) {
      console.error('Error updating follow-up date:', error);
      toast({
        title: 'Error',
        description: 'Failed to schedule follow-up',
        variant: 'destructive',
      });
    }
  };

  const clearFollowUp = async (customer: Customer) => {
    try {
      await api.updateCustomer(customer.id, {
        nextFollowUpAt: null,
      });
      toast({
        title: 'Follow-up cleared',
        description: customer.name,
      });
      loadCustomers();
    } catch (error) {
      console.error('Error clearing follow-up date:', error);
      toast({
        title: 'Error',
        description: 'Failed to clear follow-up',
        variant: 'destructive',
      });
    }
  };

  // Remove duplicate filteredCustomers as it's handled by handleSearch

  if (!user) {
    return (
      <div className="flex items-center justify-center h-64">
        <Card>
          <CardContent className="p-6 text-center">
            <p className="text-muted-foreground">Please log in to manage customers.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold">Customers</h1>
        <div className="animate-pulse space-y-4">
          {[...Array(3)].map((_, i) => (
            <Card key={i}>
              <CardContent className="p-6">
                <div className="h-4 bg-muted rounded w-1/3 mb-2"></div>
                <div className="h-3 bg-muted rounded w-1/2"></div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  // Calculate stats
  const totalCustomers = customers.length;
  const totalRevenue = customers.reduce((sum, c) => sum + (c.total_revenue || 0), 0);
  const avgCustomerValue = totalCustomers > 0 ? totalRevenue / totalCustomers : 0;
  const vipCustomers = customers.filter(c => (c.total_revenue || 0) > 500).length;
  const topCustomer = customers.reduce((max, c) => 
    (c.total_revenue || 0) > (max.total_revenue || 0) ? c : max
  , customers[0]);

  return (
    <div className="space-y-6">
      {/* Customer Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Customers</CardTitle>
            <UsersIcon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalCustomers}</div>
            <p className="text-xs text-muted-foreground">Active customer base</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
            <DollarSign className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${totalRevenue.toFixed(0)}</div>
            <p className="text-xs text-muted-foreground">From all customers</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Customer Value</CardTitle>
            <TrendingUp className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${avgCustomerValue.toFixed(0)}</div>
            <p className="text-xs text-muted-foreground">Per customer</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">VIP Customers</CardTitle>
            <Award className="h-4 w-4 text-accent" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{vipCustomers}</div>
            <p className="text-xs text-muted-foreground">Over $500 revenue</p>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          <h1 className="text-3xl font-bold text-primary">Customers</h1>
          
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <div className="flex-1 sm:w-64">
              <SearchBar
                placeholder="Search customers..."
                value={searchTerm}
                onChange={handleSearch}
              />
            </div>
            
            <Select value={sortBy} onValueChange={(value: any) => setSortBy(value)}>
              <SelectTrigger className="w-[130px] sm:w-[160px]">
                <ArrowUpDown className="h-4 w-4 mr-2" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="recent">Most Recent</SelectItem>
                <SelectItem value="revenue">Revenue ↓</SelectItem>
                <SelectItem value="jobs">Jobs ↓</SelectItem>
                <SelectItem value="name">Name A-Z</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Filter Chips */}
        <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
          <Badge
            variant={filterBy === 'all' ? 'default' : 'outline'}
            className="cursor-pointer hover:bg-primary/90 transition-colors px-3 py-1 shrink-0 whitespace-nowrap"
            onClick={() => setFilterBy('all')}
          >
            All Customers
          </Badge>
          <Badge
            variant={filterBy === 'vip' ? 'default' : 'outline'}
            className="cursor-pointer hover:bg-yellow-500 hover:text-white transition-colors px-3 py-1 border-yellow-400 text-yellow-600 dark:border-yellow-500 dark:text-yellow-400 shrink-0 whitespace-nowrap"
            onClick={() => setFilterBy('vip')}
          >
            ⭐ VIP ({customers.filter(c => (c.total_revenue || 0) > 500).length})
          </Badge>
          <Badge
            variant={filterBy === 'active' ? 'default' : 'outline'}
            className="cursor-pointer hover:bg-green-500 hover:text-white transition-colors px-3 py-1 border-green-500 text-green-600 shrink-0 whitespace-nowrap"
            onClick={() => setFilterBy('active')}
          >
            ✓ Active ({customers.filter(c => {
              const threeMonthsAgo = new Date();
              threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
              return c.last_job_date && new Date(c.last_job_date) > threeMonthsAgo;
            }).length})
          </Badge>
          <Badge
            variant={filterBy === 'new' ? 'default' : 'outline'}
            className="cursor-pointer hover:bg-primary hover:text-primary-foreground transition-colors px-3 py-1 border-primary text-primary shrink-0 whitespace-nowrap"
            onClick={() => setFilterBy('new')}
          >
            ✨ New ({customers.filter(c => {
              const oneMonthAgo = new Date();
              oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
              return new Date(c.created_at) > oneMonthAgo;
            }).length})
          </Badge>
          <Badge
            variant={filterBy === 'inactive' ? 'default' : 'outline'}
            className="cursor-pointer hover:bg-amber-500 hover:text-white transition-colors px-3 py-1 border-amber-500 text-amber-600 shrink-0 whitespace-nowrap"
            onClick={() => setFilterBy('inactive')}
          >
            ⏰ Inactive ({customers.filter(c => {
              const sixMonthsAgo = new Date();
              sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
              return !c.last_job_date || new Date(c.last_job_date) < sixMonthsAgo;
            }).length})
          </Badge>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        
        <Dialog open={dialogOpen} onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) resetForm();
        }}>
          <DialogTrigger asChild>
            <Button className="gap-2 w-full sm:w-auto">
              <Plus className="h-4 w-4" />
              Add Customer
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>
                {editingCustomer ? 'Edit Customer' : 'Add New Customer'}
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label htmlFor="name">Name *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                />
              </div>
              <div>
                <Label htmlFor="phone">Phone</Label>
                <Input
                  id="phone"
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="address">Address</Label>
                <Textarea
                  id="address"
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  rows={2}
                />
              </div>
              <div>
                <Label htmlFor="notes">Notes</Label>
                <Textarea
                  id="notes"
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  rows={2}
                />
              </div>
              <div className="flex gap-2">
                <Button type="submit" className="flex-1">
                  {editingCustomer ? 'Update' : 'Create'}
                </Button>
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                  Cancel
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Enhanced Search is now in the header */}

      {/* Customers List */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {filteredCustomers.length === 0 ? (
          <Card className="col-span-full">
            <CardContent className="p-6 text-center">
              <p className="text-muted-foreground">
                {searchTerm ? 'No customers found matching your search.' : 'No customers added yet.'}
              </p>
            </CardContent>
          </Card>
        ) : (
          filteredCustomers.map((customer, index) => {
            const followUpDate = customer.next_follow_up_at ? new Date(customer.next_follow_up_at) : null;
            const now = new Date();
            const isDue = !!followUpDate && followUpDate.getTime() <= now.getTime();
            const soonThreshold = new Date(now);
            soonThreshold.setDate(soonThreshold.getDate() + 7);
            const isSoon = !!followUpDate && !isDue && followUpDate.getTime() <= soonThreshold.getTime();
            const followUpBadgeClass = isDue
              ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300'
              : isSoon
                ? 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-300'
                : 'bg-primary/10 text-primary dark:bg-primary/20';

            return (
            <Card key={customer.id} className={`hover-lift glass-card fade-in`} style={{animationDelay: `${index * 100}ms`}}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <User className="h-5 w-5 text-primary" />
                    {customer.name}
                  </CardTitle>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => viewCustomerHistory(customer)}
                      title="View History"
                    >
                      <History className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleEdit(customer)}
                      title="Edit Customer"
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(customer.id)}
                      className="text-destructive hover:text-destructive"
                      title="Delete Customer"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                {/* Quick Actions */}
                <div className="flex flex-wrap gap-2 mb-4">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => navigate(`/jobs?new=true&customerId=${customer.id}`)}
                    className="flex-1 min-w-[120px] gap-1"
                  >
                    <Plus className="h-3 w-3" />
                    <span className="text-xs">New Job</span>
                  </Button>
                  {customer.phone && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => window.location.href = `tel:${customer.phone}`}
                      className="gap-1"
                      title="Call Customer"
                    >
                      <PhoneCall className="h-3 w-3" />
                    </Button>
                  )}
                  {customer.phone && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleRequestReview(customer)}
                      className="gap-1 border-yellow-400 text-yellow-600 hover:bg-yellow-50 hover:border-yellow-500 dark:border-yellow-600 dark:text-yellow-400 dark:hover:bg-yellow-900/30"
                      title="Send Google Review Request"
                    >
                      <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                      <span className="text-xs">Review</span>
                    </Button>
                  )}
                  {customer.email && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => window.location.href = `mailto:${customer.email}`}
                      className="gap-1"
                      title="Email Customer"
                    >
                      <Send className="h-3 w-3" />
                    </Button>
                  )}
                  {customer.address && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => window.open(`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(customer.address || '')}`, '_blank')}
                      className="gap-1"
                      title="Get Directions"
                    >
                      <Navigation className="h-3 w-3" />
                    </Button>
                  )}
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 mb-4 rounded-lg border bg-muted/10 p-2">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Clock className="h-4 w-4" />
                    <span>Follow-up</span>
                    {followUpDate ? (
                      <Badge variant="secondary" className={followUpBadgeClass}>
                        {isDue ? 'Due' : 'Next'}: {format(followUpDate, 'MMM dd')}
                      </Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">Not set</span>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <Button size="sm" variant="outline" onClick={() => setFollowUp(customer, 30)} className="px-2">
                      +30d
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setFollowUp(customer, 90)} className="px-2">
                      +90d
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setFollowUp(customer, 180)} className="px-2">
                      +180d
                    </Button>
                    {followUpDate && (
                      <Button size="sm" variant="outline" onClick={() => clearFollowUp(customer)} className="px-2">
                        Clear
                      </Button>
                    )}
                  </div>
                </div>

                {/* Business Intelligence Stats */}
                <div className="grid grid-cols-3 gap-2 mb-4 p-3 bg-muted/30 rounded-lg">
                  <div className="text-center">
                    <div className="text-sm font-semibold text-primary">{customer.total_jobs || 0}</div>
                    <div className="text-xs text-muted-foreground">Jobs</div>
                  </div>
                  <div className="text-center">
                    <div className="text-sm font-semibold text-green-600">${(customer.total_revenue || 0).toFixed(0)}</div>
                    <div className="text-xs text-muted-foreground">Revenue</div>
                  </div>
                  <div className="text-center">
                    <div className="text-sm font-semibold">
                      {customer.last_job_date ? format(new Date(customer.last_job_date), 'MMM dd') : 'Never'}
                    </div>
                    <div className="text-xs text-muted-foreground">Last Job</div>
                  </div>
                </div>

                <div className="space-y-2 text-sm">
                  {customer.phone && (
                    <div className="flex items-center gap-2 text-muted-foreground hover:text-primary transition-colors">
                      <Phone className="h-4 w-4" />
                      <a href={`tel:${customer.phone}`} className="hover:underline">
                        {customer.phone}
                      </a>
                    </div>
                  )}
                  {customer.email && (
                    <div className="flex items-center gap-2 text-muted-foreground hover:text-primary transition-colors">
                      <Mail className="h-4 w-4" />
                      <a href={`mailto:${customer.email}`} className="hover:underline">
                        {customer.email}
                      </a>
                    </div>
                  )}
                  {customer.address && (
                    <div className="flex items-start gap-2 text-muted-foreground hover:text-primary transition-colors">
                      <MapPin className="h-4 w-4 mt-0.5" />
                      <a 
                        href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(customer.address)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs hover:underline cursor-pointer"
                      >
                        {customer.address}
                      </a>
                    </div>
                  )}
                  
                  {/* Customer Segment Badges */}
                  <div className="pt-2 flex flex-wrap gap-2">
                    {(customer.total_revenue || 0) > 1000 && (
                      <Badge variant="secondary" className="bg-yellow-100 text-yellow-800 border border-yellow-300 dark:bg-yellow-900/40 dark:text-yellow-300 dark:border-yellow-600">
                        <Star className="h-3 w-3 mr-1 fill-yellow-500 text-yellow-500" />
                        VIP
                      </Badge>
                    )}
                    {(customer.total_revenue || 0) > 500 && (customer.total_revenue || 0) <= 1000 && (
                      <Badge variant="secondary" className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300">
                        <DollarSign className="h-3 w-3 mr-1" />
                        High Value
                      </Badge>
                    )}
                    {(() => {
                      const oneMonthAgo = new Date();
                      oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
                      return new Date(customer.created_at) > oneMonthAgo;
                    })() && (
                      <Badge variant="secondary" className="bg-primary/10 text-primary dark:bg-primary/20">
                        <Sparkles className="h-3 w-3 mr-1" />
                        New
                      </Badge>
                    )}
                    {(() => {
                      const sixMonthsAgo = new Date();
                      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
                      return !customer.last_job_date || new Date(customer.last_job_date) < sixMonthsAgo;
                    })() && (
                      <Badge variant="secondary" className="bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-300">
                        <Clock className="h-3 w-3 mr-1" />
                        Inactive
                      </Badge>
                    )}
                  </div>
                  
                  {customer.notes && (
                    <div className="pt-2 border-t">
                      <p className="text-xs text-muted-foreground">{customer.notes}</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          );
          })
        )}
      </div>

      {/* Customer History Dialog */}
      <Dialog open={historyDialogOpen} onOpenChange={setHistoryDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="h-5 w-5" />
              Job History - {selectedCustomer?.name}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {customerJobs.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">No jobs found for this customer.</p>
            ) : (
              customerJobs.map((job, index) => (
                <Card key={job.id} className={`slide-up`} style={{animationDelay: `${index * 50}ms`}}>
                  <CardContent className="p-4">
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <p className="font-medium">{job.job_type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</p>
                        <p className="text-sm text-muted-foreground">
                          {format(new Date(job.job_date), 'MMM dd, yyyy')}
                        </p>
                      </div>
                      <div className="text-right">
                        <Badge className={getStatusColor(job.status)}>
                          {job.status.replace(/_/g, ' ')}
                        </Badge>
                        {job.price && (
                          <p className="text-sm font-medium mt-1">${Number(job.price).toFixed(2)}</p>
                        )}
                      </div>
                    </div>
                    {job.notes && (
                      <p className="text-sm text-muted-foreground mt-2">{job.notes}</p>
                    )}
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}