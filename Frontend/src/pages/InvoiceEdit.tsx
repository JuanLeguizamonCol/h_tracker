import { useState, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  ArrowLeft, Loader2, Edit, Trash2, Plus, Send, CheckCircle,
  XCircle, Ban, ChevronRight, Save,
} from 'lucide-react';
import { format } from 'date-fns';
import { useInvoiceEditData, usePatchInvoice } from '@/hooks/useInvoices';
import { InvoiceEditLine, InvoiceStatus, InvoiceExpense } from '@/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';

const STATUS_CONFIG: Record<InvoiceStatus, { label: string; color: string }> = {
  draft: { label: 'Draft', color: 'bg-muted text-muted-foreground' },
  sent: { label: 'Sent', color: 'bg-primary/10 text-primary' },
  paid: { label: 'Paid', color: 'bg-success/10 text-success' },
  cancelled: { label: 'Cancelled', color: 'bg-destructive/10 text-destructive' },
  voided: { label: 'Voided', color: 'bg-muted text-muted-foreground' },
};

const EXPENSE_CATEGORIES = ['Airfare', 'Hotel', 'Parking / Transportation', 'Meals', 'Other'];

function discountDollars(line: InvoiceEditLine): number {
  if (!line.discount_type || line.discount_value === 0) return 0;
  if (line.discount_type === 'percent') {
    return (line.amount * line.discount_value) / 100;
  }
  return line.discount_value;
}

function discountHours(line: InvoiceEditLine): number {
  const rate = line.hourly_rate;
  if (rate === 0) return 0;
  return discountDollars(line) / rate;
}

// ── Cap amount inline editor ──
function CapAmountInput({ current, onSave }: { current: number; onSave: (v: number) => void }) {
  const [val, setVal] = useState(current);
  return (
    <div className="flex items-center gap-2">
      <Input
        type="number" min="0" step="0.01"
        value={val}
        onChange={e => setVal(parseFloat(e.target.value) || 0)}
        className="w-28 h-8 text-right"
      />
      <Button size="sm" variant="outline" onClick={() => onSave(val)}>Save</Button>
    </div>
  );
}

export default function InvoiceEdit() {
  const { invoiceId } = useParams<{ invoiceId: string }>();
  const navigate = useNavigate();

  const { data, isLoading } = useInvoiceEditData(invoiceId);
  const patchInvoice = usePatchInvoice();

  // ── Local editable state ──
  const [lines, setLines] = useState<InvoiceEditLine[] | null>(null);
  const [expenses, setExpenses] = useState<InvoiceExpense[] | null>(null);
  const [editingMeta, setEditingMeta] = useState(false);
  const [metaForm, setMetaForm] = useState({ invoice_number: '', issue_date: '', due_date: '', notes: '' });
  const [editingLineId, setEditingLineId] = useState<string | null>(null);
  const [lineForm, setLineForm] = useState({
    hours: 0, rate: 0, discount_value: 0,
    discount_type: '' as '' | 'amount' | 'percent',
  });
  const [showExpenseForm, setShowExpenseForm] = useState(false);
  const [expenseForm, setExpenseForm] = useState<Partial<InvoiceExpense>>({
    category: 'Other', amount_usd: 0, receipt_attached: false,
  });

  const activeLines = lines ?? data?.lines ?? [];
  const activeExpenses = expenses ?? data?.expenses ?? [];
  const invoice = data?.invoice;
  const isEditable = invoice?.status === 'draft' || invoice?.status === 'sent';

  // ── Computed totals ──
  const { billedGross, totalDiscounts, netBilled, expensesTotal, grandTotal } = useMemo(() => {
    const billedGross = activeLines.reduce((s, l) => s + l.amount, 0);
    const totalDiscounts = activeLines.reduce((s, l) => s + discountDollars(l), 0);
    const netBilled = billedGross - totalDiscounts;
    const expensesTotal = activeExpenses.reduce((s, e) => s + e.amount_usd, 0);
    const cap = invoice?.cap_amount ?? 0;
    const grandTotal = netBilled + expensesTotal - cap;
    return { billedGross, totalDiscounts, netBilled, expensesTotal, grandTotal };
  }, [activeLines, activeExpenses, invoice?.cap_amount]);

  // ── Handlers ──
  const startEditLine = (line: InvoiceEditLine) => {
    setEditingLineId(line.id);
    setLineForm({
      hours: line.hours,
      rate: line.hourly_rate,
      discount_value: line.discount_value,
      discount_type: (line.discount_type as '' | 'amount' | 'percent') || '',
    });
  };

  const applyLineEdit = (lineId: string) => {
    const updated = activeLines.map(l =>
      l.id === lineId
        ? {
            ...l,
            hours: lineForm.hours,
            hourly_rate: lineForm.rate,
            amount: lineForm.hours * lineForm.rate,
            discount_value: lineForm.discount_value,
            discount_type: lineForm.discount_type || null,
          }
        : l
    );
    setLines(updated);
    setEditingLineId(null);
  };

  const handleSaveLines = async () => {
    if (!invoiceId) return;
    try {
      await patchInvoice.mutateAsync({
        id: invoiceId,
        patch: {
          lines: activeLines.map(l => ({
            id: l.id,
            hours: l.hours,
            rate_snapshot: l.hourly_rate,
            discount_type: l.discount_type as 'amount' | 'percent' | null | undefined,
            discount_value: l.discount_value,
          })),
        },
      });
      setLines(null);
      toast.success('Lines saved.');
    } catch { toast.error('Something went wrong.'); }
  };

  const handleSaveMeta = async () => {
    if (!invoiceId) return;
    try {
      await patchInvoice.mutateAsync({
        id: invoiceId,
        patch: {
          invoice_number: metaForm.invoice_number || undefined,
          issue_date: metaForm.issue_date || undefined,
          due_date: metaForm.due_date || undefined,
          notes: metaForm.notes || undefined,
        },
      });
      setEditingMeta(false);
      toast.success('Details saved.');
    } catch { toast.error('Something went wrong.'); }
  };

  const handleSaveCapAmount = async (val: number) => {
    if (!invoiceId) return;
    try {
      await patchInvoice.mutateAsync({ id: invoiceId, patch: { cap_amount: val } });
      toast.success('Cap amount saved.');
    } catch { toast.error('Something went wrong.'); }
  };

  const handleStatusChange = async (newStatus: InvoiceStatus) => {
    if (!invoiceId) return;
    try {
      await patchInvoice.mutateAsync({ id: invoiceId, patch: { status: newStatus } });
      toast.success(`Marked as ${STATUS_CONFIG[newStatus].label}.`);
    } catch { toast.error('Something went wrong.'); }
  };

  const handleAddExpense = async () => {
    if (!invoiceId || !expenseForm.date || !expenseForm.category) {
      toast.error('Date and category are required.');
      return;
    }
    try {
      await patchInvoice.mutateAsync({
        id: invoiceId,
        patch: {
          expenses: [{
            id: null,
            date: expenseForm.date,
            professional: expenseForm.professional ?? null,
            vendor: expenseForm.vendor ?? null,
            description: expenseForm.description ?? null,
            category: expenseForm.category!,
            amount_usd: expenseForm.amount_usd ?? 0,
            payment_source: expenseForm.payment_source ?? null,
            receipt_attached: expenseForm.receipt_attached ?? false,
            notes: expenseForm.notes ?? null,
          }],
        },
      });
      setExpenseForm({ category: 'Other', amount_usd: 0, receipt_attached: false });
      setShowExpenseForm(false);
      setExpenses(null);
      toast.success('Expense added.');
    } catch { toast.error('Something went wrong.'); }
  };

  const handleDeleteExpense = (expId: string) => {
    setExpenses(activeExpenses.filter(e => e.id !== expId));
    toast.success('Expense removed.');
  };

  // ── Loading ──
  if (isLoading) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  if (!invoice) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={() => navigate('/invoices')} className="gap-2">
          <ArrowLeft className="h-4 w-4" />Back to Invoices
        </Button>
        <p className="text-muted-foreground">Invoice not found.</p>
      </div>
    );
  }

  const invoiceLabel = invoice.invoice_number ? `#${invoice.invoice_number}` : `#${invoice.id.slice(0, 8)}`;

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link to="/invoices" className="hover:text-foreground transition-colors">Invoices</Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="text-foreground font-medium">Edit Invoice {invoiceLabel}</span>
      </div>

      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <Button variant="outline" size="sm" onClick={() => navigate('/invoices')} className="gap-2 mt-0.5 shrink-0">
            <ArrowLeft className="h-4 w-4" />Back
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Invoice {invoiceLabel}</h1>
            <p className="text-muted-foreground">
              {data?.project?.name}{data?.client ? ` · ${data.client.name}` : ''}
            </p>
          </div>
        </div>
        <Badge className={`${STATUS_CONFIG[invoice.status as InvoiceStatus]?.color} text-sm px-3 py-1 shrink-0`}>
          {STATUS_CONFIG[invoice.status as InvoiceStatus]?.label}
        </Badge>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="lines" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="lines">Professionals</TabsTrigger>
          <TabsTrigger value="expenses">Expenses</TabsTrigger>
          <TabsTrigger value="details">Details</TabsTrigger>
          <TabsTrigger value="summary">Summary</TabsTrigger>
        </TabsList>

        {/* ── Professionals Tab ── */}
        <TabsContent value="lines" className="space-y-4 mt-6">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Professionals / Billed Time</h2>
            {isEditable && lines !== null && (
              <Button size="sm" className="gap-1.5" onClick={handleSaveLines} disabled={patchInvoice.isPending}>
                {patchInvoice.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                Save All Lines
              </Button>
            )}
          </div>

          {activeLines.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">No billed time entries on this invoice.</p>
          ) : (
            <div className="space-y-3">
              {activeLines.map(line => {
                const isEditing = editingLineId === line.id;
                const dDiscount = discountDollars(line);
                const dHours = discountHours(line);
                const net = line.amount - dDiscount;

                return (
                  <Card key={line.id} className={isEditing ? 'border-primary/50 ring-1 ring-primary/20' : ''}>
                    <CardContent className="p-4">
                      {isEditing ? (
                        <div className="space-y-4">
                          <div className="flex items-baseline gap-2">
                            <span className="font-semibold">{line.employee_name}</span>
                            {line.title && <span className="text-xs text-muted-foreground">{line.title}</span>}
                            {line.role && <Badge variant="outline" className="text-xs">{line.role}</Badge>}
                          </div>
                          <div className="grid gap-3 sm:grid-cols-3">
                            <div>
                              <Label className="text-xs text-muted-foreground">Hours</Label>
                              <Input type="number" min="0" step="0.5" value={lineForm.hours || ''} onChange={e => setLineForm({ ...lineForm, hours: parseFloat(e.target.value) || 0 })} className="h-8 mt-1" />
                            </div>
                            <div>
                              <Label className="text-xs text-muted-foreground">Rate (USD/h)</Label>
                              <Input type="number" min="0" step="0.5" value={lineForm.rate || ''} onChange={e => setLineForm({ ...lineForm, rate: parseFloat(e.target.value) || 0 })} className="h-8 mt-1" />
                            </div>
                            <div>
                              <Label className="text-xs text-muted-foreground">Subtotal</Label>
                              <p className="text-sm font-medium mt-2">${(lineForm.hours * lineForm.rate).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                            </div>
                          </div>
                          <div className="grid gap-3 sm:grid-cols-3">
                            <div className="sm:col-span-2">
                              <Label className="text-xs text-muted-foreground">Discount</Label>
                              <div className="flex gap-2 mt-1">
                                <Select value={lineForm.discount_type || 'none'} onValueChange={v => setLineForm({ ...lineForm, discount_type: v === 'none' ? '' : v as 'amount' | 'percent' })}>
                                  <SelectTrigger className="w-32 h-8 text-xs"><SelectValue /></SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="none">No discount</SelectItem>
                                    <SelectItem value="amount">$ Fixed</SelectItem>
                                    <SelectItem value="percent">% Rate</SelectItem>
                                  </SelectContent>
                                </Select>
                                {lineForm.discount_type && (
                                  <Input type="number" min="0" step="0.01" value={lineForm.discount_value || ''} onChange={e => setLineForm({ ...lineForm, discount_value: parseFloat(e.target.value) || 0 })} placeholder={lineForm.discount_type === 'percent' ? '10' : '500'} className="h-8" />
                                )}
                              </div>
                              {lineForm.discount_type && lineForm.discount_value > 0 && (
                                <p className="text-xs text-muted-foreground mt-1">
                                  {lineForm.discount_type === 'percent'
                                    ? `= $${((lineForm.hours * lineForm.rate * lineForm.discount_value) / 100).toFixed(2)} / ${((lineForm.hours * lineForm.rate * lineForm.discount_value) / 100 / (lineForm.rate || 1)).toFixed(2)} hrs`
                                    : `= ${(lineForm.discount_value / (lineForm.rate || 1)).toFixed(2)} hrs`}
                                </p>
                              )}
                            </div>
                            <div>
                              <Label className="text-xs text-muted-foreground">Net Total</Label>
                              <p className="text-sm font-bold text-primary mt-2">
                                ${(lineForm.hours * lineForm.rate - (
                                  lineForm.discount_type === 'percent'
                                    ? (lineForm.hours * lineForm.rate * lineForm.discount_value) / 100
                                    : (lineForm.discount_type === 'amount' ? lineForm.discount_value : 0)
                                )).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </p>
                            </div>
                          </div>
                          <div className="flex gap-2 justify-end">
                            <Button size="sm" variant="outline" onClick={() => setEditingLineId(null)}>Cancel</Button>
                            <Button size="sm" onClick={() => applyLineEdit(line.id)}>Apply</Button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-baseline gap-3 flex-wrap">
                              <span className="font-semibold">{line.employee_name}</span>
                              {line.title && <span className="text-xs text-muted-foreground">{line.title}</span>}
                              {line.role && <Badge variant="outline" className="text-xs">{line.role}</Badge>}
                            </div>
                            <div className="flex items-center gap-4 mt-1 text-sm text-muted-foreground flex-wrap">
                              <span>{line.hours}h × ${line.hourly_rate}/h</span>
                              <span className="text-foreground font-medium">Subtotal: ${line.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                            </div>
                            {dDiscount > 0 && (
                              <p className="text-xs text-warning mt-1">
                                Discount: {dHours.toFixed(2)} hrs / ${dDiscount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                {line.discount_type === 'percent' && ` (${line.discount_value}%)`}
                              </p>
                            )}
                          </div>
                          <div className="flex items-center gap-3 shrink-0">
                            <div className="text-right">
                              <p className="text-xs text-muted-foreground">Net</p>
                              <p className="font-bold text-primary">${net.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                            </div>
                            {isEditable && (
                              <Button variant="ghost" size="sm" onClick={() => startEditLine(line)}>
                                <Edit className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}

          {lines !== null && (
            <div className="flex justify-end pt-2">
              <Button size="sm" className="gap-1.5" onClick={handleSaveLines} disabled={patchInvoice.isPending}>
                {patchInvoice.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                Save All Lines
              </Button>
            </div>
          )}

          <div className="flex justify-end gap-6 text-sm pt-2 border-t">
            <span className="text-muted-foreground">Gross: <span className="font-semibold text-foreground">${billedGross.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></span>
            {totalDiscounts > 0 && <span className="text-muted-foreground">Discounts: <span className="font-semibold text-warning">-${totalDiscounts.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></span>}
            <span className="text-muted-foreground">Net: <span className="font-semibold text-foreground">${netBilled.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></span>
          </div>
        </TabsContent>

        {/* ── Expenses Tab ── */}
        <TabsContent value="expenses" className="space-y-4 mt-6">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Expense Lines</h2>
            {isEditable && (
              <Button size="sm" className="gap-1.5" onClick={() => setShowExpenseForm(true)}>
                <Plus className="h-4 w-4" />Add Expense
              </Button>
            )}
          </div>

          {activeExpenses.length === 0 && !showExpenseForm ? (
            <p className="text-sm text-muted-foreground py-8 text-center">No expenses on this invoice.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="table-header">Date</TableHead>
                  <TableHead className="table-header">Professional</TableHead>
                  <TableHead className="table-header">Vendor</TableHead>
                  <TableHead className="table-header">Description</TableHead>
                  <TableHead className="table-header">Category</TableHead>
                  <TableHead className="table-header text-right">Amount</TableHead>
                  <TableHead className="table-header">Receipt</TableHead>
                  {isEditable && <TableHead className="table-header" />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {activeExpenses.map(exp => (
                  <TableRow key={exp.id}>
                    <TableCell className="text-sm">{exp.date}</TableCell>
                    <TableCell className="text-sm">{exp.professional || '—'}</TableCell>
                    <TableCell className="text-sm">{exp.vendor || '—'}</TableCell>
                    <TableCell className="text-sm">{exp.description || '—'}</TableCell>
                    <TableCell><Badge variant="outline" className="text-xs">{exp.category}</Badge></TableCell>
                    <TableCell className="text-right font-semibold text-primary">${exp.amount_usd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
                    <TableCell><Checkbox checked={exp.receipt_attached} disabled /></TableCell>
                    {isEditable && (
                      <TableCell>
                        <Button variant="ghost" size="sm" className="text-destructive" onClick={() => handleDeleteExpense(exp.id)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          {showExpenseForm && (
            <Card className="p-4 space-y-3">
              <h3 className="text-sm font-medium">Add Expense</h3>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <div>
                  <Label className="text-xs">Date *</Label>
                  <Input type="date" value={expenseForm.date ?? ''} onChange={e => setExpenseForm({ ...expenseForm, date: e.target.value })} className="h-8 mt-1" />
                </div>
                <div>
                  <Label className="text-xs">Category *</Label>
                  <Select value={expenseForm.category} onValueChange={v => setExpenseForm({ ...expenseForm, category: v })}>
                    <SelectTrigger className="h-8 mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>{EXPENSE_CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Amount (USD) *</Label>
                  <Input type="number" min="0" step="0.01" value={expenseForm.amount_usd || ''} onChange={e => setExpenseForm({ ...expenseForm, amount_usd: parseFloat(e.target.value) || 0 })} className="h-8 mt-1" />
                </div>
                <div>
                  <Label className="text-xs">Professional</Label>
                  <Input value={expenseForm.professional ?? ''} onChange={e => setExpenseForm({ ...expenseForm, professional: e.target.value })} className="h-8 mt-1" />
                </div>
                <div>
                  <Label className="text-xs">Vendor</Label>
                  <Input value={expenseForm.vendor ?? ''} onChange={e => setExpenseForm({ ...expenseForm, vendor: e.target.value })} className="h-8 mt-1" />
                </div>
                <div>
                  <Label className="text-xs">Payment Source</Label>
                  <Input value={expenseForm.payment_source ?? ''} onChange={e => setExpenseForm({ ...expenseForm, payment_source: e.target.value })} className="h-8 mt-1" />
                </div>
                <div className="sm:col-span-2">
                  <Label className="text-xs">Description</Label>
                  <Input value={expenseForm.description ?? ''} onChange={e => setExpenseForm({ ...expenseForm, description: e.target.value })} className="h-8 mt-1" />
                </div>
                <div className="flex items-center gap-2 mt-4">
                  <Checkbox checked={expenseForm.receipt_attached ?? false} onCheckedChange={v => setExpenseForm({ ...expenseForm, receipt_attached: !!v })} />
                  <Label className="text-xs">Receipt attached</Label>
                </div>
              </div>
              <div className="flex gap-2 justify-end">
                <Button size="sm" variant="outline" onClick={() => setShowExpenseForm(false)}>Cancel</Button>
                <Button size="sm" onClick={handleAddExpense}>Add Expense (${(expenseForm.amount_usd ?? 0).toFixed(2)})</Button>
              </div>
            </Card>
          )}

          <p className="text-sm text-right text-muted-foreground border-t pt-2">
            Expenses Total: <span className="font-semibold text-foreground">${expensesTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          </p>
        </TabsContent>

        {/* ── Details Tab ── */}
        <TabsContent value="details" className="space-y-4 mt-6">
          <Card>
            <CardContent className="p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold">Invoice Details</h2>
                {isEditable && !editingMeta && (
                  <Button size="sm" variant="outline" className="gap-1.5" onClick={() => {
                    setMetaForm({
                      invoice_number: invoice.invoice_number ?? '',
                      issue_date: invoice.issue_date ?? '',
                      due_date: invoice.due_date ?? '',
                      notes: invoice.notes ?? '',
                    });
                    setEditingMeta(true);
                  }}>
                    <Edit className="h-3.5 w-3.5" />Edit
                  </Button>
                )}
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                <div>
                  <Label className="text-xs text-muted-foreground">Invoice Number</Label>
                  {editingMeta
                    ? <Input value={metaForm.invoice_number} onChange={e => setMetaForm({ ...metaForm, invoice_number: e.target.value })} placeholder="INV-001" className="h-8 mt-1" />
                    : <p className="text-sm font-medium mt-1">{invoice.invoice_number || '—'}</p>}
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Issue Date</Label>
                  {editingMeta
                    ? <Input type="date" value={metaForm.issue_date} onChange={e => setMetaForm({ ...metaForm, issue_date: e.target.value })} className="h-8 mt-1" />
                    : <p className="text-sm font-medium mt-1">{invoice.issue_date ? format(new Date(invoice.issue_date), 'MMM d, yyyy') : '—'}</p>}
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Due Date</Label>
                  {editingMeta
                    ? <Input type="date" value={metaForm.due_date} onChange={e => setMetaForm({ ...metaForm, due_date: e.target.value })} className="h-8 mt-1" />
                    : <p className="text-sm font-medium mt-1">{invoice.due_date ? format(new Date(invoice.due_date), 'MMM d, yyyy') : '—'}</p>}
                </div>
              </div>
              {editingMeta && (
                <>
                  <div>
                    <Label className="text-xs text-muted-foreground">Notes</Label>
                    <Textarea value={metaForm.notes} onChange={e => setMetaForm({ ...metaForm, notes: e.target.value })} placeholder="Notes..." rows={3} className="mt-1" />
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={handleSaveMeta} disabled={patchInvoice.isPending}>Save</Button>
                    <Button size="sm" variant="outline" onClick={() => setEditingMeta(false)}>Cancel</Button>
                  </div>
                </>
              )}
              {!editingMeta && invoice.notes && (
                <div>
                  <Label className="text-xs text-muted-foreground">Notes</Label>
                  <p className="text-sm mt-1">{invoice.notes}</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Summary Tab ── */}
        <TabsContent value="summary" className="mt-6">
          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardContent className="p-6 space-y-3">
                <h2 className="font-semibold">Invoice Totals</h2>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Gross Billed</span>
                    <span className="font-medium">${billedGross.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </div>
                  {totalDiscounts > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Discounts</span>
                      <span className="font-medium text-warning">-${totalDiscounts.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Net Fees</span>
                    <span className="font-medium">${netBilled.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Expenses</span>
                    <span className="font-medium">${expensesTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </div>
                  {isEditable && (
                    <div className="flex justify-between items-center border-t pt-2">
                      <span className="text-muted-foreground">Cap Amount</span>
                      <CapAmountInput current={invoice.cap_amount ?? 0} onSave={handleSaveCapAmount} />
                    </div>
                  )}
                  {!isEditable && (invoice.cap_amount ?? 0) > 0 && (
                    <div className="flex justify-between border-t pt-2">
                      <span className="text-muted-foreground">Cap Amount</span>
                      <span className="font-medium">-${invoice.cap_amount!.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    </div>
                  )}
                  <div className="flex justify-between border-t pt-2 text-base">
                    <span className="font-bold">Total Due</span>
                    <span className="font-bold text-primary">${grandTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {isEditable && (
              <Card>
                <CardContent className="p-6 space-y-3">
                  <h2 className="font-semibold">Status Actions</h2>
                  <div className="flex flex-col gap-2">
                    {invoice.status === 'draft' && (
                      <>
                        <Button variant="outline" className="gap-2 justify-start" onClick={() => handleStatusChange('sent')}>
                          <Send className="h-4 w-4" />Mark as Sent
                        </Button>
                        <Button variant="outline" className="gap-2 justify-start text-destructive hover:text-destructive" onClick={() => handleStatusChange('cancelled')}>
                          <Ban className="h-4 w-4" />Cancel Invoice
                        </Button>
                      </>
                    )}
                    {invoice.status === 'sent' && (
                      <>
                        <Button className="gap-2 justify-start" onClick={() => handleStatusChange('paid')}>
                          <CheckCircle className="h-4 w-4" />Mark as Paid
                        </Button>
                        <Button variant="outline" className="gap-2 justify-start" onClick={() => handleStatusChange('voided')}>
                          <XCircle className="h-4 w-4" />Void Invoice
                        </Button>
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
