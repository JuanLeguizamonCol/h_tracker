import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { ArrowLeft, Edit, FileDown, FileSpreadsheet, CheckCircle, Send, Ban, RotateCcw, Loader2, ChevronDown, ChevronUp } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { useInvoiceEditData, usePatchInvoice } from '@/hooks/useInvoices';
import { InvoiceFee, InvoiceManualLine, InvoiceStatus, InvoiceHoursOnHold } from '@/types';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from '@/components/ui/breadcrumb';

const STATUS_CONFIG: Record<InvoiceStatus, { label: string; color: string }> = {
  draft: { label: 'Draft', color: 'bg-muted text-muted-foreground' },
  sent: { label: 'Sent', color: 'bg-primary/10 text-primary' },
  paid: { label: 'Paid', color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
  cancelled: { label: 'Cancelled', color: 'bg-destructive/10 text-destructive' },
  voided: { label: 'Voided', color: 'bg-muted text-muted-foreground' },
};

const STATUS_TRANSITIONS: Record<InvoiceStatus, { label: string; nextStatus: InvoiceStatus; icon: React.ReactNode }[]> = {
  draft: [
    { label: 'Mark as Sent', nextStatus: 'sent', icon: <Send className="h-4 w-4" /> },
    { label: 'Cancel', nextStatus: 'cancelled', icon: <Ban className="h-4 w-4" /> },
  ],
  sent: [
    { label: 'Mark as Paid', nextStatus: 'paid', icon: <CheckCircle className="h-4 w-4" /> },
    { label: 'Revert to Draft', nextStatus: 'draft', icon: <RotateCcw className="h-4 w-4" /> },
    { label: 'Void', nextStatus: 'voided', icon: <Ban className="h-4 w-4" /> },
  ],
  paid: [],
  cancelled: [
    { label: 'Revert to Draft', nextStatus: 'draft', icon: <RotateCcw className="h-4 w-4" /> },
  ],
  voided: [],
};

function fmt(v: number) {
  return v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function InvoiceDetailPage() {
  const { invoiceId } = useParams<{ invoiceId: string }>();
  const navigate = useNavigate();
  const patchInvoice = usePatchInvoice();

  const [pdfLoading, setPdfLoading] = useState(false);
  const [xlsxLoading, setXlsxLoading] = useState(false);
  const [onHoldOpen, setOnHoldOpen] = useState(false);

  const { data, isLoading } = useInvoiceEditData(invoiceId);

  const { data: fees = [] } = useQuery({
    queryKey: ['invoice-fees', invoiceId],
    enabled: !!invoiceId,
    queryFn: () => api.get<InvoiceFee[]>(`/invoice-fees?invoice_id=${invoiceId}`),
  });

  const { data: manualLines = [] } = useQuery({
    queryKey: ['invoice-manual-lines', invoiceId],
    enabled: !!invoiceId,
    queryFn: () => api.get<InvoiceManualLine[]>(`/invoice-lines?invoice_id=${invoiceId}&manual=true`).catch(() => [] as InvoiceManualLine[]),
  });

  const { data: onHoldEntries = [] } = useQuery({
    queryKey: ['invoice-on-hold', invoiceId],
    enabled: !!invoiceId,
    queryFn: () => api.get<InvoiceHoursOnHold[]>(`/invoice-hours-on-hold?invoice_id=${invoiceId}`),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="text-center py-16 text-muted-foreground">Invoice not found.</div>
    );
  }

  const { invoice, client, project, lines, expenses } = data;
  const status = invoice.status as InvoiceStatus;
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.draft;
  const transitions = STATUS_TRANSITIONS[status] ?? [];

  const handleStatusChange = async (nextStatus: InvoiceStatus) => {
    try {
      await patchInvoice.mutateAsync({ id: invoice.id, patch: { status: nextStatus } });
      toast.success(`Invoice marked as ${STATUS_CONFIG[nextStatus].label}.`);
    } catch {
      toast.error('Failed to update invoice status.');
    }
  };

  const handleExportPdf = async () => {
    setPdfLoading(true);
    try {
      const label = invoice.invoice_number || invoice.id.slice(0, 8);
      await api.download(`/invoices/${invoice.id}/export/pdf`, `INV-${label}.pdf`);
    } catch {
      toast.error('Could not generate PDF.');
    } finally {
      setPdfLoading(false);
    }
  };

  const handleExportXlsx = async () => {
    setXlsxLoading(true);
    try {
      const label = invoice.invoice_number || invoice.id.slice(0, 8);
      await api.download(`/invoices/${invoice.id}/export/xlsx`, `INV-${label}.xlsx`);
    } catch {
      toast.error('Could not generate Excel file.');
    } finally {
      setXlsxLoading(false);
    }
  };

  const expensesTotal = expenses.reduce((s, e) => s + e.amount_usd, 0);
  const feesTotal = fees.reduce((s, f) => s + f.fee_total, 0);

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Breadcrumb */}
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink onClick={() => navigate('/invoices')} className="cursor-pointer">
              Invoices
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbPage>{invoice.invoice_number || invoice.id.slice(0, 8)}</BreadcrumbPage>
        </BreadcrumbList>
      </Breadcrumb>

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('/invoices')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold">{invoice.invoice_number || `INV-${invoice.id.slice(0, 8)}`}</h1>
              <Badge className={`${cfg.color} border-0`}>{cfg.label}</Badge>
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              {project && (
                <p className="text-sm text-muted-foreground">
                  {project.name}{client ? ` · ${client.name}` : ''}
                </p>
              )}
              {((invoice as any).owner_company || 'IPC') === 'IPC' ? (
                <span className="inline-flex items-center rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300 px-2 py-0.5 text-xs font-semibold">
                  IPC — Impact Point Co.
                </span>
              ) : (
                <span className="inline-flex items-center rounded-full bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300 px-2 py-0.5 text-xs font-semibold">
                  PI — Pegasus Insights
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {transitions.map(t => (
            <Button
              key={t.nextStatus}
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => handleStatusChange(t.nextStatus)}
              disabled={patchInvoice.isPending}
            >
              {t.icon}
              {t.label}
            </Button>
          ))}
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={handleExportPdf}
            disabled={pdfLoading}
          >
            {pdfLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
            {pdfLoading ? 'Generating…' : 'PDF'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={handleExportXlsx}
            disabled={xlsxLoading}
          >
            {xlsxLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}
            {xlsxLoading ? 'Generating…' : 'Excel'}
          </Button>
          {status === 'draft' && (
            <Button size="sm" className="gap-1.5" onClick={() => navigate(`/invoices/${invoice.id}/edit`)}>
              <Edit className="h-4 w-4" />
              Edit
            </Button>
          )}
        </div>
      </div>

      {/* Meta info */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Issue Date', value: invoice.issue_date ? format(new Date(invoice.issue_date), 'MMM d, yyyy') : '—' },
          { label: 'Due Date', value: invoice.due_date ? format(new Date(invoice.due_date), 'MMM d, yyyy') : '—' },
          { label: 'Client', value: client?.name ?? '—' },
          { label: 'Project', value: project?.name ?? '—' },
        ].map(({ label, value }) => (
          <Card key={label} className="p-4">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="text-sm font-medium mt-0.5 truncate">{value}</p>
          </Card>
        ))}
      </div>

      {/* Billable Lines */}
      {lines.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Billable Hours</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead className="text-right">Hours</TableHead>
                  <TableHead className="text-right">Rate</TableHead>
                  <TableHead className="text-right">Discount</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lines.map(line => {
                  const subtotal = line.hours * line.hourly_rate;
                  const discountAmt = line.discount_type === 'percent'
                    ? (subtotal * line.discount_value) / 100
                    : line.discount_value;
                  return (
                    <TableRow key={line.id}>
                      <TableCell>
                        <div className="font-medium text-sm">{line.employee_name}</div>
                        {line.title && <div className="text-xs text-muted-foreground">{line.title}</div>}
                      </TableCell>
                      <TableCell className="text-right">{line.hours.toFixed(2)}</TableCell>
                      <TableCell className="text-right">${fmt(line.hourly_rate)}</TableCell>
                      <TableCell className="text-right">
                        {line.discount_value > 0
                          ? line.discount_type === 'percent'
                            ? `${line.discount_value}%`
                            : `$${fmt(line.discount_value)}`
                          : '—'}
                      </TableCell>
                      <TableCell className="text-right font-medium">${fmt(line.amount)}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Hours on Hold */}
      {onHoldEntries.length > 0 && (
        <Card className="border-amber-200 dark:border-amber-800">
          <CardHeader
            className="pb-3 cursor-pointer select-none flex flex-row items-center justify-between"
            onClick={() => setOnHoldOpen(o => !o)}
          >
            <div className="flex items-center gap-2">
              <span className="text-amber-600 dark:text-amber-400">🟡</span>
              <CardTitle className="text-base text-amber-700 dark:text-amber-400">
                Hours on Hold
              </CardTitle>
              <span className="text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 px-2 py-0.5 rounded-full border border-amber-200 dark:border-amber-800">
                {onHoldEntries.reduce((s, e) => s + e.on_hold_hours, 0).toFixed(2)}h / $
                {onHoldEntries.reduce((s, e) => s + e.on_hold_amount, 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </span>
            </div>
            {onHoldOpen ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
          </CardHeader>
          {onHoldOpen && (
            <CardContent className="p-0">
              <p className="text-xs text-amber-700 dark:text-amber-400 px-6 pb-3">
                These hours were recorded but not billed in this invoice.
              </p>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee</TableHead>
                    <TableHead className="text-right">Original Hours</TableHead>
                    <TableHead className="text-right">Billed Hours</TableHead>
                    <TableHead className="text-right">On Hold</TableHead>
                    <TableHead className="text-right">Amount on Hold</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {onHoldEntries.map(entry => (
                    <TableRow key={entry.id} className="bg-amber-50/40 dark:bg-amber-950/20">
                      <TableCell className="font-medium text-sm text-amber-800 dark:text-amber-300">
                        {entry.employee_name}
                      </TableCell>
                      <TableCell className="text-right text-sm">{entry.original_hours.toFixed(2)}</TableCell>
                      <TableCell className="text-right text-sm">{entry.billed_hours.toFixed(2)}</TableCell>
                      <TableCell className="text-right text-sm font-semibold text-amber-600 dark:text-amber-400">
                        {entry.on_hold_hours.toFixed(2)}h
                      </TableCell>
                      <TableCell className="text-right text-sm font-semibold text-amber-600 dark:text-amber-400">
                        ${fmt(entry.on_hold_amount)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          )}
        </Card>
      )}

      {/* Fees */}
      {fees.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Fees</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Label</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead className="text-right">Unit Price</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {fees.map(fee => (
                  <TableRow key={fee.id}>
                    <TableCell className="font-medium text-sm">{fee.label}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{fee.description ?? '—'}</TableCell>
                    <TableCell className="text-right">{fee.quantity}</TableCell>
                    <TableCell className="text-right">${fmt(fee.unit_price_usd)}</TableCell>
                    <TableCell className="text-right font-medium">${fmt(fee.fee_total)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Expenses */}
      {expenses.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Expenses</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Vendor</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {expenses.map(exp => (
                  <TableRow key={exp.id}>
                    <TableCell className="text-sm whitespace-nowrap">
                      {exp.date ? format(new Date(exp.date), 'MMM d, yyyy') : '—'}
                    </TableCell>
                    <TableCell className="text-sm">{exp.description ?? '—'}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{exp.category}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{exp.vendor ?? '—'}</TableCell>
                    <TableCell className="text-right font-medium">${fmt(exp.amount_usd)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Totals */}
      <Card>
        <CardContent className="pt-6">
          <div className="max-w-xs ml-auto space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Subtotal (hours)</span>
              <span>${fmt(invoice.subtotal)}</span>
            </div>
            {invoice.discount > 0 && (
              <div className="flex justify-between text-destructive">
                <span>Discount</span>
                <span>-${fmt(invoice.discount)}</span>
              </div>
            )}
            {feesTotal > 0 && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Fees</span>
                <span>${fmt(feesTotal)}</span>
              </div>
            )}
            {expensesTotal > 0 && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Expenses</span>
                <span>${fmt(expensesTotal)}</span>
              </div>
            )}
            {invoice.cap_amount != null && (
              <div className="flex justify-between text-muted-foreground">
                <span>Cap</span>
                <span>${fmt(invoice.cap_amount)}</span>
              </div>
            )}
            <Separator />
            <div className="flex justify-between font-semibold text-base">
              <span>Total</span>
              <span>${fmt(invoice.total + feesTotal + expensesTotal)}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Notes */}
      {invoice.notes && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">{invoice.notes}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
