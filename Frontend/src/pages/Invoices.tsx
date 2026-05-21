import { useMemo, useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, FileText, DollarSign, ChevronRight, Loader2, CheckCircle, Calendar, RefreshCw, Download } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { useInvoices } from '@/hooks/useInvoices';
import { useProjects } from '@/hooks/useProjects';
import { useClients } from '@/hooks/useClients';
import { api } from '@/lib/api';
import { Invoice, InvoiceStatus } from '@/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const STATUS_CONFIG: Record<InvoiceStatus, { label: string; color: string }> = {
  draft: { label: 'Draft', color: 'bg-muted text-muted-foreground' },
  sent: { label: 'Sent', color: 'bg-primary/10 text-primary' },
  paid: { label: 'Paid', color: 'bg-success/10 text-success' },
  cancelled: { label: 'Cancelled', color: 'bg-destructive/10 text-destructive' },
  voided: { label: 'Voided', color: 'bg-muted text-muted-foreground' },
};

export default function Invoices() {
  const navigate = useNavigate();
  const { data: invoices = [], isLoading, refetch, isRefetching } = useInvoices();
  const { data: projects = [] } = useProjects();
  const { data: clients = [] } = useClients();

  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [companyFilter, setCompanyFilter] = useState<string>('all');

  type SchedulerStatus = {
    last_run: string | null;
    last_period: string | null;
    invoices_generated: number;
    next_run: string | null;
    status?: string;
  };
  const [schedulerStatus, setSchedulerStatus] = useState<SchedulerStatus | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const handleExportReport = async () => {
    setIsExporting(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== 'all') params.set('status', statusFilter);
      if (companyFilter !== 'all') params.set('company', companyFilter);
      const url = `/api/invoices/export/report${params.toString() ? `?${params}` : ''}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error('Export failed');
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `Invoices_Report_${new Date().toISOString().slice(0, 10)}.xlsx`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch {
      toast.error('Failed to export report.');
    } finally {
      setIsExporting(false);
    }
  };

  useEffect(() => {
    api.get<SchedulerStatus>('/invoices/scheduler-status')
      .then(data => setSchedulerStatus(data))
      .catch(() => {/* ignore — table may not exist yet */});
  }, []);

  const today = new Date();
  const dayOfMonth = today.getDate();
  const showPreBanner = dayOfMonth >= 1 && dayOfMonth <= 3;
  const prevMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const prevMonthName = prevMonth.toLocaleString('default', { month: 'long', year: 'numeric' });

  const handleGenerateNow = async () => {
    setIsGenerating(true);
    try {
      const periodEnd = new Date(today.getFullYear(), today.getMonth(), 0);
      const periodStart = new Date(periodEnd.getFullYear(), periodEnd.getMonth(), 1);
      const fmt = (d: Date) => d.toISOString().split('T')[0];
      await api.post('/invoices/generate-monthly', {
        period_start: fmt(periodStart),
        period_end: fmt(periodEnd),
      });
      toast.success('Invoice generation triggered successfully.');
      const status = await api.get<SchedulerStatus>('/invoices/scheduler-status');
      setSchedulerStatus(status);
    } catch {
      toast.error('Failed to trigger invoice generation.');
    } finally {
      setIsGenerating(false);
    }
  };

  const projectMap = useMemo(() => new Map(projects.map(p => [p.id, p])), [projects]);
  const clientMap = useMemo(() => new Map(clients.map(c => [c.id, c])), [clients]);

  const filteredInvoices = useMemo(() => {
    return invoices.filter(inv => {
      if (statusFilter !== 'all' && inv.status !== statusFilter) return false;
      if (companyFilter !== 'all') {
        const company = inv.owner_company || 'IPC';
        if (company !== companyFilter) return false;
      }
      return true;
    });
  }, [invoices, statusFilter, companyFilter, projectMap]);

  const getProjectName = useCallback(
    (projectId: string) => projectMap.get(projectId)?.name || 'Unknown',
    [projectMap]
  );
  const getClientName = useCallback((projectId: string) => {
    const project = projectMap.get(projectId);
    return project ? clientMap.get(project.client_id)?.name || 'No client' : 'No client';
  }, [projectMap, clientMap]);

  const stats = useMemo(() => {
    const base = companyFilter === 'all' ? invoices : invoices.filter(inv =>
      (inv.owner_company || 'IPC') === companyFilter
    );
    const draft = base.filter(i => i.status === 'draft').length;
    const unpaid = base.filter(i => i.status === 'sent').reduce((sum, i) => sum + Number(i.total), 0);
    const paid = base.filter(i => i.status === 'paid').reduce((sum, i) => sum + Number(i.total), 0);
    return { draft, unpaid, paid };
  }, [invoices, companyFilter, projectMap]);

  if (isLoading) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Invoices</h1>
          <p className="text-muted-foreground">Create and manage project invoices</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="icon" onClick={() => refetch()} disabled={isRefetching} title="Refresh invoices">
            <RefreshCw className={`h-4 w-4 ${isRefetching ? 'animate-spin' : ''}`} />
          </Button>
          <Button
            variant="outline"
            className="gap-2 border-green-600 text-green-700 hover:bg-green-50 dark:border-green-500 dark:text-green-400 dark:hover:bg-green-950"
            onClick={handleExportReport}
            disabled={isExporting}
          >
            {isExporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            Excel Report
          </Button>
          <Button className="gap-2" onClick={() => navigate('/invoices/new')}>
            <Plus className="h-4 w-4" />New Invoice
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="stat-card">
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-muted">
                <FileText className="h-6 w-6 text-muted-foreground" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Drafts</p>
                <p className="text-2xl font-bold text-foreground">{stats.draft}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="stat-card">
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-warning/10">
                <DollarSign className="h-6 w-6 text-warning" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Unpaid</p>
                <p className="text-2xl font-bold text-foreground">${stats.unpaid.toLocaleString()}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="stat-card">
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-success/10">
                <CheckCircle className="h-6 w-6 text-success" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Collected</p>
                <p className="text-2xl font-bold text-foreground">${stats.paid.toLocaleString()}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Auto-generation banners */}
      {showPreBanner && !schedulerStatus?.last_run && (
        <div className="flex items-center justify-between rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm dark:border-blue-800 dark:bg-blue-950">
          <div className="flex items-center gap-2 text-blue-700 dark:text-blue-300">
            <Calendar className="h-4 w-4" />
            <span>Invoices for <strong>{prevMonthName}</strong> will be auto-generated on the 3rd.</span>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="border-blue-300 text-blue-700 hover:bg-blue-100 dark:border-blue-700 dark:text-blue-300"
            onClick={handleGenerateNow}
            disabled={isGenerating}
          >
            {isGenerating && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
            Generate Now
          </Button>
        </div>
      )}
      {schedulerStatus?.last_run && schedulerStatus.invoices_generated > 0 && (
        <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700 dark:border-green-800 dark:bg-green-950 dark:text-green-300">
          <CheckCircle className="h-4 w-4" />
          <span>
            <strong>{schedulerStatus.invoices_generated}</strong> invoice{schedulerStatus.invoices_generated !== 1 ? 's' : ''} were auto-generated for{' '}
            <strong>{schedulerStatus.last_period?.split(' / ')[0]?.substring(0, 7)}</strong>.
          </span>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <Label className="text-sm text-muted-foreground">Status:</Label>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="sent">Sent</SelectItem>
              <SelectItem value="paid">Paid</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
              <SelectItem value="voided">Voided</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <Label className="text-sm text-muted-foreground">Company:</Label>
          <Select value={companyFilter} onValueChange={setCompanyFilter}>
            <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="IPC">IPC</SelectItem>
              <SelectItem value="PI">PI</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Invoice Table */}
      <Card className="card-elevated">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="table-header">Invoice</TableHead>
                <TableHead className="table-header">Project</TableHead>
                <TableHead className="table-header">Client</TableHead>
                <TableHead className="table-header">Co.</TableHead>
                <TableHead className="table-header">Status</TableHead>
                <TableHead className="table-header text-right">Total</TableHead>
                <TableHead className="table-header text-right">Date</TableHead>
                <TableHead className="table-header text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredInvoices.map(invoice => {
                const company = invoice.owner_company || 'IPC';
                return (
                <TableRow
                  key={invoice.id}
                  className="cursor-pointer hover:bg-muted/30 transition-colors duration-150"
                  onClick={() => navigate(`/invoices/${invoice.id}`)}
                >
                  <TableCell className="font-medium">
                    {invoice.invoice_number ? `#${invoice.invoice_number}` : `#${invoice.id.slice(0, 8)}`}
                  </TableCell>
                  <TableCell>{getProjectName(invoice.project_id)}</TableCell>
                  <TableCell className="text-muted-foreground">{getClientName(invoice.project_id)}</TableCell>
                  <TableCell>
                    {company === 'IPC' ? (
                      <span className="inline-flex items-center rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300 px-2 py-0.5 text-xs font-semibold">
                        IPC
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-full bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300 px-2 py-0.5 text-xs font-semibold">
                        PI
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge className={STATUS_CONFIG[invoice.status as InvoiceStatus]?.color}>
                      {STATUS_CONFIG[invoice.status as InvoiceStatus]?.label}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right font-semibold text-primary">
                    ${Number(invoice.total).toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {format(new Date(invoice.created_at), 'MMM d, yyyy')}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={(e) => { e.stopPropagation(); navigate(`/invoices/${invoice.id}`); }}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
                );
              })}
            </TableBody>
          </Table>
          {filteredInvoices.length === 0 && (
            <div className="text-center py-12">
              <FileText className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
              <p className="text-muted-foreground">No invoices yet. Create one to get started!</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
