import { useMemo, useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, FileText, DollarSign, ChevronRight, Loader2, CheckCircle, Calendar, RefreshCw, Download, Zap, X, MoreHorizontal, Trash2 } from 'lucide-react';
import { format, startOfMonth, endOfMonth, subMonths } from 'date-fns';
import { toast } from 'sonner';
import { useInvoices, useGenerateMonthlyInvoices, useDeleteInvoice } from '@/hooks/useInvoices';
import { useProjects } from '@/hooks/useProjects';
import { useClients } from '@/hooks/useClients';
import { useAuth } from '@/contexts/AuthContext';
import { api } from '@/lib/api';
import { Invoice, InvoiceStatus } from '@/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';

const STATUS_CONFIG: Record<InvoiceStatus, { label: string; color: string }> = {
  draft: { label: 'Draft', color: 'bg-muted text-muted-foreground' },
  sent: { label: 'Sent', color: 'bg-primary/10 text-primary' },
  paid: { label: 'Paid', color: 'bg-success/10 text-success' },
  cancelled: { label: 'Cancelled', color: 'bg-destructive/10 text-destructive' },
  voided: { label: 'Voided', color: 'bg-muted text-muted-foreground' },
};

const fmtDate = (d: Date) => format(d, 'yyyy-MM-dd');

export default function Invoices() {
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const { data: invoices = [], isLoading, refetch, isRefetching } = useInvoices();
  const { data: projects = [] } = useProjects();
  const { data: clients = [] } = useClients();
  const generateInvoices = useGenerateMonthlyInvoices();
  const deleteInvoice = useDeleteInvoice();
  const [deleteTarget, setDeleteTarget] = useState<Invoice | null>(null);

  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [companyFilter, setCompanyFilter] = useState<string>('all');
  const [clientFilter, setClientFilter] = useState<string>('all');
  const [projectFilter, setProjectFilter] = useState<string>('all');
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');

  type SchedulerStatus = {
    last_run: string | null;
    last_period: string | null;
    invoices_generated: number;
    next_run: string | null;
    status?: string;
  };
  const [schedulerStatus, setSchedulerStatus] = useState<SchedulerStatus | null>(null);
  const [isExporting, setIsExporting] = useState(false);

  // ── Generate-invoices dialog ────────────────────────────────────────────────
  const [genOpen, setGenOpen] = useState(false);
  const [genStart, setGenStart] = useState('');
  const [genEnd, setGenEnd] = useState('');

  const openGenerate = (mode: 'this-month' | 'last-month') => {
    const today = new Date();
    if (mode === 'last-month') {
      const prev = subMonths(today, 1);
      setGenStart(fmtDate(startOfMonth(prev)));
      setGenEnd(fmtDate(endOfMonth(prev)));
    } else {
      setGenStart(fmtDate(startOfMonth(today)));
      setGenEnd(fmtDate(today));
    }
    setGenOpen(true);
  };

  const handleGenerate = async () => {
    if (!genStart || !genEnd) { toast.error('Please choose a start and end date.'); return; }
    if (genStart > genEnd) { toast.error('Start date must be before end date.'); return; }
    try {
      const result = await generateInvoices.mutateAsync({ period_start: genStart, period_end: genEnd });
      const parts = [`${result.generated} generated`, `${result.skipped} skipped`];
      if (result.errors?.length) parts.push(`${result.errors.length} errors`);
      toast.success(`Invoices: ${parts.join(', ')}.`);
      if (result.errors?.length) result.errors.forEach(e => console.warn('[generate]', e));
      setGenOpen(false);
      api.get<SchedulerStatus>('/invoices/scheduler-status').then(setSchedulerStatus).catch(() => {});
    } catch {
      toast.error('Failed to generate invoices.');
    }
  };

  const invoiceLabel = (inv: Invoice) =>
    inv.invoice_number ? `#${inv.invoice_number}` : `#${inv.id.slice(0, 8)}`;

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteInvoice.mutateAsync(deleteTarget.id);
      toast.success(`Invoice ${invoiceLabel(deleteTarget)} deleted.`);
      setDeleteTarget(null);
    } catch (err) {
      const conflict = err instanceof Error && err.message.includes('409');
      toast.error(
        conflict
          ? 'Cannot delete this invoice because it has linked records.'
          : 'Failed to delete invoice. Please try again.',
      );
    }
  };

  const handleExportReport = async () => {
    setIsExporting(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== 'all') params.set('status', statusFilter);
      if (companyFilter !== 'all') params.set('company', companyFilter);
      const path = `/invoices/export/report${params.toString() ? `?${params}` : ''}`;
      await api.download(path, `Invoices_Report_${new Date().toISOString().slice(0, 10)}.xlsx`);
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

  const projectMap = useMemo(() => new Map(projects.map(p => [p.id, p])), [projects]);
  const clientMap = useMemo(() => new Map(clients.map(c => [c.id, c])), [clients]);

  // Projects available in the filter — narrowed to the selected client, if any.
  const projectOptions = useMemo(() => {
    const list = clientFilter === 'all' ? projects : projects.filter(p => p.client_id === clientFilter);
    return [...list].sort((a, b) => a.name.localeCompare(b.name));
  }, [projects, clientFilter]);

  const activeFilterCount = [
    statusFilter !== 'all', companyFilter !== 'all', clientFilter !== 'all',
    projectFilter !== 'all', !!dateFrom, !!dateTo,
  ].filter(Boolean).length;

  const clearFilters = () => {
    setStatusFilter('all'); setCompanyFilter('all'); setClientFilter('all');
    setProjectFilter('all'); setDateFrom(''); setDateTo('');
  };

  const filteredInvoices = useMemo(() => {
    return invoices.filter(inv => {
      if (statusFilter !== 'all' && inv.status !== statusFilter) return false;
      if (companyFilter !== 'all' && (inv.owner_company || 'IPC') !== companyFilter) return false;
      if (projectFilter !== 'all' && inv.project_id !== projectFilter) return false;
      if (clientFilter !== 'all') {
        const project = projectMap.get(inv.project_id);
        if (!project || project.client_id !== clientFilter) return false;
      }
      if (dateFrom || dateTo) {
        const d = inv.created_at.slice(0, 10);
        if (dateFrom && d < dateFrom) return false;
        if (dateTo && d > dateTo) return false;
      }
      return true;
    });
  }, [invoices, statusFilter, companyFilter, clientFilter, projectFilter, dateFrom, dateTo, projectMap]);

  const getProjectName = useCallback(
    (projectId: string) => projectMap.get(projectId)?.name || 'Unknown',
    [projectMap]
  );
  const getClientName = useCallback((projectId: string) => {
    const project = projectMap.get(projectId);
    return project ? clientMap.get(project.client_id)?.name || 'No client' : 'No client';
  }, [projectMap, clientMap]);

  // Stats reflect the current filtered view so grouped selections show their totals.
  const stats = useMemo(() => {
    const draft = filteredInvoices.filter(i => i.status === 'draft').length;
    const unpaid = filteredInvoices.filter(i => i.status === 'sent').reduce((sum, i) => sum + Number(i.total), 0);
    const paid = filteredInvoices.filter(i => i.status === 'paid').reduce((sum, i) => sum + Number(i.total), 0);
    return { draft, unpaid, paid };
  }, [filteredInvoices]);

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
        <div className="flex flex-wrap gap-2">
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
          {isAdmin && (
            <Button variant="outline" className="gap-2" onClick={() => openGenerate('this-month')}>
              <Zap className="h-4 w-4" />Generate Invoices
            </Button>
          )}
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
          {isAdmin && (
            <Button
              size="sm"
              variant="outline"
              className="border-blue-300 text-blue-700 hover:bg-blue-100 dark:border-blue-700 dark:text-blue-300"
              onClick={() => openGenerate('last-month')}
            >
              Generate Now
            </Button>
          )}
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

      {/* Search / filter panel */}
      <Card>
        <CardContent className="p-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Client</Label>
              <Select value={clientFilter} onValueChange={(v) => { setClientFilter(v); setProjectFilter('all'); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All clients</SelectItem>
                  {[...clients].sort((a, b) => a.name.localeCompare(b.name)).map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Project</Label>
              <Select value={projectFilter} onValueChange={setProjectFilter}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All projects</SelectItem>
                  {projectOptions.map(p => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">From (invoice date)</Label>
              <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">To (invoice date)</Label>
              <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Status</Label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger><SelectValue /></SelectTrigger>
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
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Company</Label>
              <Select value={companyFilter} onValueChange={setCompanyFilter}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="IPC">IPC</SelectItem>
                  <SelectItem value="PI">PI</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          {activeFilterCount > 0 && (
            <div className="mt-3 flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                Showing <strong>{filteredInvoices.length}</strong> of {invoices.length} invoices
                {' '}· {activeFilterCount} filter{activeFilterCount !== 1 ? 's' : ''} active
              </p>
              <Button variant="ghost" size="sm" className="h-7 gap-1 text-muted-foreground" onClick={clearFilters}>
                <X className="h-3.5 w-3.5" />Clear filters
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

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
                  <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => navigate(`/invoices/${invoice.id}`)}
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                      {isAdmin && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={() => setDeleteTarget(invoice)}
                              className="text-destructive focus:text-destructive"
                            >
                              <Trash2 className="h-4 w-4 mr-2" />Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
                );
              })}
            </TableBody>
          </Table>
          {filteredInvoices.length === 0 && (
            <div className="text-center py-12">
              <FileText className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
              <p className="text-muted-foreground">
                {invoices.length === 0 ? 'No invoices yet. Create one to get started!' : 'No invoices match the current filters.'}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Generate invoices dialog */}
      <Dialog open={genOpen} onOpenChange={setGenOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Generate invoices</DialogTitle>
            <DialogDescription>
              Auto-generate draft invoices for all active (non-internal) projects with unbilled
              hours in the selected period. Runs on demand — no need to wait for the billing day.
              Already-generated periods are skipped, so it's safe to run again.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="gen-start">Period start</Label>
              <Input id="gen-start" type="date" value={genStart} onChange={e => setGenStart(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="gen-end">Period end</Label>
              <Input id="gen-end" type="date" value={genEnd} onChange={e => setGenEnd(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGenOpen(false)} disabled={generateInvoices.isPending}>
              Cancel
            </Button>
            <Button onClick={handleGenerate} disabled={generateInvoices.isPending} className="gap-2">
              {generateInvoices.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
              Generate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete invoice confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={open => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete invoice?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete invoice <strong>{deleteTarget ? invoiceLabel(deleteTarget) : ''}</strong>.
              Its lines, fees and expenses are removed and any linked hours become billable again. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              disabled={deleteInvoice.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteInvoice.isPending ? 'Deleting…' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
