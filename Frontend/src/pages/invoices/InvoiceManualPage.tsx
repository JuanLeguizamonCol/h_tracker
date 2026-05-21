import { useState, useMemo, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Plus, Trash2, Loader2 } from 'lucide-react';
import type { CompanyCode } from '@/lib/invoice/signatories';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { useProjects } from '@/hooks/useProjects';
import { useClients } from '@/hooks/useClients';
import { useCreateInvoice, useCreateInvoiceLines, useUpdateInvoice } from '@/hooks/useInvoices';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from '@/components/ui/breadcrumb';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

interface LocalLine {
  _id: string;
  description: string;
  qty: string;
  rate: string;
  amount: string;
  manualAmount: boolean; // true = user set amount directly
}

function generateId() {
  return Math.random().toString(36).slice(2);
}

function todayStr() {
  return format(new Date(), 'yyyy-MM-dd');
}

function computeAmount(line: LocalLine): number {
  if (line.manualAmount) return parseFloat(line.amount) || 0;
  return (parseFloat(line.qty) || 0) * (parseFloat(line.rate) || 0);
}

export default function InvoiceManualPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const prefilledProjectId = searchParams.get('project_id') || '';

  const { data: projects = [] } = useProjects();
  const { data: clients = [] } = useClients();
  const createInvoice = useCreateInvoice();
  const createLines = useCreateInvoiceLines();
  const updateInvoice = useUpdateInvoice();

  // Header fields
  const [projectId, setProjectId] = useState(prefilledProjectId);
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [invoiceNumberLoading, setInvoiceNumberLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const [issueDate, setIssueDate] = useState(todayStr);
  const [dueDate, setDueDate] = useState('');
  const [status, setStatus] = useState('draft');
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');

  // Financials
  const [discountPct, setDiscountPct] = useState('');

  // Notes
  const [clientNotes, setClientNotes] = useState('');
  const [internalNotes, setInternalNotes] = useState('');

  // Lines
  const [lines, setLines] = useState<LocalLine[]>([
    { _id: generateId(), description: '', qty: '', rate: '', amount: '', manualAmount: false },
  ]);

  const [isSaving, setIsSaving] = useState(false);
  const [ownerCompany, setOwnerCompany] = useState<CompanyCode>('IPC');

  const activeProjects = useMemo(
    () => projects.filter(p => p.is_active && !p.is_internal),
    [projects]
  );

  const selectedProject = useMemo(
    () => activeProjects.find(p => p.id === projectId),
    [activeProjects, projectId]
  );

  const selectedClient = useMemo(
    () => clients.find(c => c.id === selectedProject?.client_id),
    [clients, selectedProject]
  );

  // Fetch preview number — uses AbortController to cancel stale requests
  function fetchPreviewNumber(company: CompanyCode) {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setInvoiceNumberLoading(true);
    fetch(`/api/invoices/preview-number?company=${company}`, { signal: ctrl.signal })
      .then(r => r.json())
      .then((data: { invoice_number: string }) => {
        setInvoiceNumber(data.invoice_number);
        setInvoiceNumberLoading(false);
      })
      .catch(err => {
        if (err.name !== 'AbortError') setInvoiceNumberLoading(false);
      });
  }

  // Initial fetch on mount
  useEffect(() => {
    fetchPreviewNumber('IPC');
    return () => abortRef.current?.abort();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-set owner company from project and re-fetch number
  useEffect(() => {
    if (selectedProject?.owner_company) {
      const co = (selectedProject.owner_company as CompanyCode) || 'IPC';
      setOwnerCompany(co);
      fetchPreviewNumber(co);
    }
  }, [selectedProject?.owner_company]); // eslint-disable-line react-hooks/exhaustive-deps

  // Manual company toggle: always re-fetch
  function onCompanyChange(co: CompanyCode) {
    setOwnerCompany(co);
    fetchPreviewNumber(co);
  }

  const subtotal = useMemo(
    () => lines.reduce((sum, l) => sum + computeAmount(l), 0),
    [lines]
  );

  const discountAmt = useMemo(() => {
    const pct = parseFloat(discountPct) || 0;
    return subtotal * pct / 100;
  }, [subtotal, discountPct]);

  const total = subtotal - discountAmt;

  // Line helpers
  const addLine = () => {
    setLines(prev => [
      ...prev,
      { _id: generateId(), description: '', qty: '', rate: '', amount: '', manualAmount: false },
    ]);
  };

  const removeLine = (id: string) => {
    setLines(prev => prev.filter(l => l._id !== id));
  };

  const updateLine = (id: string, field: keyof LocalLine, value: string | boolean) => {
    setLines(prev => prev.map(l => {
      if (l._id !== id) return l;
      const updated = { ...l, [field]: value };
      // If qty or rate changes, clear manual override
      if (field === 'qty' || field === 'rate') {
        updated.manualAmount = false;
        updated.amount = String((parseFloat(updated.qty) || 0) * (parseFloat(updated.rate) || 0));
      }
      // If amount changes directly, flag as manually overridden
      if (field === 'amount') {
        updated.manualAmount = true;
      }
      return updated;
    }));
  };

  const handleSave = async () => {
    if (!projectId) {
      toast.error('Please select a project.');
      return;
    }
    if (lines.length === 0) {
      toast.error('Add at least one line item.');
      return;
    }
    const hasEmptyLine = lines.every(l => !l.description && !l.qty && !l.rate);
    if (hasEmptyLine && lines.length === 1) {
      toast.error('Add at least one line item with a description or amount.');
      return;
    }

    setIsSaving(true);
    try {
      // Step 1: Create invoice — server assigns invoice_number atomically
      const invoice = await createInvoice.mutateAsync({
        project_id: projectId,
        notes: clientNotes || undefined,
        owner_company: ownerCompany,
      });

      // Step 2: Create lines
      const lineData = lines
        .filter(l => l.description || computeAmount(l) > 0)
        .map(l => ({
          invoice_id: invoice.id,
          user_id: null,
          employee_name: l.description || 'Manual Entry',
          role_name: null,
          hours: parseFloat(l.qty) || 0,
          rate_snapshot: parseFloat(l.rate) || 0,
          amount: computeAmount(l),
        }));

      if (lineData.length > 0) {
        await createLines.mutateAsync(lineData);
      }

      // Step 3: Update invoice with all header fields + totals
      const periodNote = periodStart && periodEnd
        ? `Period: ${periodStart} to ${periodEnd}${clientNotes ? '\n' : ''}`
        : '';
      const notesStr = periodNote + (clientNotes || '');

      await updateInvoice.mutateAsync({
        id: invoice.id,
        updates: {
          issue_date: issueDate || undefined,
          due_date: dueDate || undefined,
          status,
          subtotal,
          discount: discountAmt,
          total,
          notes: notesStr || undefined,
          owner_company: ownerCompany,
        },
      });

      // Step 4: Store internal notes via API call if provided
      if (internalNotes) {
        try {
          await api.patch(`/invoices/${invoice.id}`, { notes: `${notesStr}\n\n[Internal] ${internalNotes}`.trim() });
        } catch { /* non-fatal */ }
      }

      toast.success('Invoice created as Draft.');
      navigate(`/invoices/${invoice.id}/edit`);
    } catch (err) {
      console.error('[Manual Invoice Error]', err);
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('422') || msg.includes('Unprocessable')) {
        toast.error('Invalid data — check all required fields and try again.');
      } else if (msg.includes('401') || msg.includes('403')) {
        toast.error('Session expired — please sign in again.');
      } else {
        toast.error(`Could not save invoice: ${msg}`);
      }
      setIsSaving(false);
    }
  };

  const fmtAmt = (n: number) =>
    n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

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
          <BreadcrumbItem>
            <BreadcrumbLink onClick={() => navigate('/invoices/new')} className="cursor-pointer">
              New Invoice
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Blank Invoice</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      {/* Page header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('/invoices/new')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Blank Invoice</h1>
            <p className="text-sm text-muted-foreground">Fill in all details manually — saved as Draft</p>
          </div>
        </div>
        <Button onClick={handleSave} disabled={isSaving || !projectId} className="gap-2">
          {isSaving && <Loader2 className="h-4 w-4 animate-spin" />}
          Save as Draft
        </Button>
      </div>

      {/* Header info */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Invoice Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* Project */}
          <div className="space-y-1.5">
            <Label>Project *</Label>
            <Select value={projectId} onValueChange={setProjectId}>
              <SelectTrigger>
                <SelectValue placeholder="Select a project" />
              </SelectTrigger>
              <SelectContent>
                {activeProjects.map(p => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Client (auto-fill) */}
          <div className="space-y-1.5">
            <Label>Client</Label>
            <Input
              value={selectedClient?.name ?? ''}
              readOnly
              placeholder="Auto-filled from project"
              className="bg-muted/40 cursor-default"
            />
          </div>

          {/* Invoice Number — read-only, assigned by server on save */}
          <div className="space-y-1.5">
            <Label>Invoice Number</Label>
            <div className="flex items-center gap-2 rounded-md border border-input bg-muted/40 px-3 py-2 text-sm min-h-9 cursor-default select-none">
              {invoiceNumberLoading ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground flex-shrink-0" />
                  <span className="text-muted-foreground">Generating…</span>
                </>
              ) : (
                <>
                  <span className="font-mono font-semibold">{invoiceNumber || '—'}</span>
                  <span className="ml-auto text-xs text-muted-foreground whitespace-nowrap">Auto-generated</span>
                </>
              )}
            </div>
          </div>
          </div>

          {/* Owner Company toggle */}
          <div className="space-y-1.5">
            <Label>Owner Company *</Label>
            <div className="flex gap-2">
              {(['IPC', 'PI'] as CompanyCode[]).map(co => (
                <button
                  key={co}
                  type="button"
                  onClick={() => onCompanyChange(co)}
                  className={`flex-1 rounded-md border px-4 py-2 text-sm font-semibold transition-colors ${
                    ownerCompany === co
                      ? co === 'IPC'
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-purple-600 text-white border-purple-600'
                      : 'border-input bg-background text-muted-foreground hover:bg-muted'
                  }`}
                >
                  {co === 'IPC' ? '🔵 IPC — Impact Point Co.' : '🟣 PI — Pegasus Insights'}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">

          {/* Issue Date */}
          <div className="space-y-1.5">
            <Label>Invoice Date</Label>
            <Input
              type="date"
              value={issueDate}
              onChange={e => setIssueDate(e.target.value)}
            />
          </div>

          {/* Due Date */}
          <div className="space-y-1.5">
            <Label>Due Date</Label>
            <Input
              type="date"
              value={dueDate}
              onChange={e => setDueDate(e.target.value)}
            />
          </div>

          {/* Status */}
          <div className="space-y-1.5">
            <Label>Status</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="sent">Sent</SelectItem>
                <SelectItem value="paid">Paid</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Period Start */}
          <div className="space-y-1.5">
            <Label>Period Start <span className="text-muted-foreground">(optional)</span></Label>
            <Input
              type="date"
              value={periodStart}
              onChange={e => setPeriodStart(e.target.value)}
            />
          </div>

          {/* Period End */}
          <div className="space-y-1.5">
            <Label>Period End <span className="text-muted-foreground">(optional)</span></Label>
            <Input
              type="date"
              value={periodEnd}
              onChange={e => setPeriodEnd(e.target.value)}
            />
          </div>
          </div>
        </CardContent>
      </Card>

      {/* Line Items */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-base">Line Items</CardTitle>
          <Button variant="outline" size="sm" onClick={addLine} className="gap-1.5">
            <Plus className="h-4 w-4" />
            Add Line
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-6 w-[35%]">Description</TableHead>
                <TableHead className="text-right w-24">Qty / Hrs</TableHead>
                <TableHead className="text-right w-32">Unit Rate (USD)</TableHead>
                <TableHead className="text-right w-32">Amount (USD)</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {lines.map((line, index) => {
                const lineAmt = computeAmount(line);
                return (
                  <TableRow key={line._id}>
                    <TableCell className="pl-6">
                      <Input
                        value={line.description}
                        onChange={e => updateLine(line._id, 'description', e.target.value)}
                        placeholder={`Item ${index + 1}`}
                        className="h-8"
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        min="0"
                        step="0.5"
                        value={line.qty}
                        onChange={e => updateLine(line._id, 'qty', e.target.value)}
                        placeholder="0"
                        className="h-8 text-right"
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={line.rate}
                        onChange={e => updateLine(line._id, 'rate', e.target.value)}
                        placeholder="0.00"
                        className="h-8 text-right"
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={line.manualAmount ? line.amount : (lineAmt > 0 ? String(lineAmt.toFixed(2)) : '')}
                        onChange={e => updateLine(line._id, 'amount', e.target.value)}
                        placeholder="0.00"
                        className={`h-8 text-right ${line.manualAmount ? 'border-amber-400 focus:border-amber-500' : ''}`}
                        title={line.manualAmount ? 'Amount manually overridden' : 'Auto-calculated'}
                      />
                    </TableCell>
                    <TableCell className="pr-4">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeLine(line._id)}
                        disabled={lines.length === 1}
                        className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>

          {/* Totals */}
          <div className="flex justify-end px-6 py-4 border-t">
            <div className="space-y-2 min-w-[220px]">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Subtotal</span>
                <span>${fmtAmt(subtotal)}</span>
              </div>
              <div className="flex items-center justify-between gap-4 text-sm">
                <span className="text-muted-foreground whitespace-nowrap">Discount (%)</span>
                <Input
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  value={discountPct}
                  onChange={e => setDiscountPct(e.target.value)}
                  placeholder="0"
                  className="h-7 w-20 text-right text-sm"
                />
              </div>
              {discountAmt > 0 && (
                <div className="flex justify-between text-sm text-destructive">
                  <span>Discount</span>
                  <span>-${fmtAmt(discountAmt)}</span>
                </div>
              )}
              <Separator />
              <div className="flex justify-between font-semibold">
                <span>Total</span>
                <span className="text-primary text-lg">${fmtAmt(total)}</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Notes */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Notes for Client</CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea
              value={clientNotes}
              onChange={e => setClientNotes(e.target.value)}
              placeholder="Payment instructions, terms, thank-you message…"
              rows={4}
            />
            <p className="text-xs text-muted-foreground mt-1.5">Included in the invoice.</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Internal Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea
              value={internalNotes}
              onChange={e => setInternalNotes(e.target.value)}
              placeholder="Admin-only context, special conditions…"
              rows={4}
            />
            <p className="text-xs text-muted-foreground mt-1.5">Not shown to the client.</p>
          </CardContent>
        </Card>
      </div>

      {/* Bottom save bar */}
      <div className="flex justify-end gap-3 pb-6">
        <Button variant="outline" onClick={() => navigate('/invoices/new')}>
          Cancel
        </Button>
        <Button onClick={handleSave} disabled={isSaving || !projectId} className="gap-2">
          {isSaving && <Loader2 className="h-4 w-4 animate-spin" />}
          Save as Draft
        </Button>
      </div>
    </div>
  );
}
