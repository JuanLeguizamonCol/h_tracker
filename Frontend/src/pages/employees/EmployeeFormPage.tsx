import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Loader2, Save, ChevronDown, ChevronUp, Lock } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { useEmployee, useCreateEmployee, useUpdateEmployee, useEmployees } from '@/hooks/useEmployees';
import { useEmployeeInternalCost, useEmployeeInternalCostHistory, useUpsertInternalCost } from '@/hooks/useEmployeeInternalCost';
import { Employee } from '@/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from '@/components/ui/breadcrumb';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

const DEPARTMENTS = ['Engineering', 'Design', 'Sales', 'Finance', 'HR', 'Operations', 'Legal', 'Other'];
const EMPLOYMENT_TYPES = ['Full-time', 'Part-time', 'Contractor', 'Freelance'];
const GENDERS = ['Male', 'Female', 'Non-binary', 'Prefer not to say'];
const WORK_MODES = ['Remote', 'On-site', 'Hybrid'];
const EMPLOYMENT_STATUSES = ['Active', 'Inactive', 'On Leave'];
const COST_TYPES = ['hourly', 'monthly', 'project'];
const COST_CURRENCIES = ['USD', 'EUR', 'COP', 'MXN', 'GBP', 'CAD'];

type CostForm = {
  cost_type: string;
  internal_hourly: string;
  monthly_salary: string;
  currency: string;
  reference_billing_rate: string;
  effective_from: string;
  effective_to: string;
  internal_notes: string;
};

const EMPTY_COST: CostForm = {
  cost_type: 'hourly',
  internal_hourly: '',
  monthly_salary: '',
  currency: 'USD',
  reference_billing_rate: '',
  effective_from: '',
  effective_to: '',
  internal_notes: '',
};

type FormData = {
  name: string;
  email: string;
  is_active: boolean;
  title: string;
  department: string;
  business_unit: string;
  supervisor_id: string;
  // Personal
  first_name: string;
  last_name: string;
  date_of_birth: string;
  gender: string;
  personal_email: string;
  personal_phone: string;
  id_number: string;
  emergency_contact_name: string;
  emergency_contact_phone: string;
  // Location
  country: string;
  state: string;
  city: string;
  timezone: string;
  street_address: string;
  zip_code: string;
  work_mode: string;
  // Corporate
  corporate_phone: string;
  employee_code: string;
  employment_type: string;
  start_date: string;
  end_date: string;
  employment_status: string;
  notes: string;
};

const EMPTY: FormData = {
  name: '', email: '', is_active: true,
  title: '', department: '', business_unit: '', supervisor_id: '',
  first_name: '', last_name: '', date_of_birth: '', gender: '',
  personal_email: '', personal_phone: '', id_number: '',
  emergency_contact_name: '', emergency_contact_phone: '',
  country: '', state: '', city: '', timezone: '', street_address: '', zip_code: '', work_mode: '',
  corporate_phone: '', employee_code: '', employment_type: '', start_date: '', end_date: '',
  employment_status: '', notes: '',
};

function employeeToForm(e: Employee): FormData {
  return {
    name: e.name,
    email: e.email,
    is_active: e.is_active,
    title: e.title || '',
    department: e.department || '',
    business_unit: e.business_unit || '',
    supervisor_id: e.supervisor_id || '',
    first_name: e.first_name || '',
    last_name: e.last_name || '',
    date_of_birth: e.date_of_birth || '',
    gender: e.gender || '',
    personal_email: e.personal_email || '',
    personal_phone: e.personal_phone || '',
    id_number: e.id_number || '',
    emergency_contact_name: e.emergency_contact_name || '',
    emergency_contact_phone: e.emergency_contact_phone || '',
    country: e.country || '',
    state: e.state || '',
    city: e.city || '',
    timezone: e.timezone || '',
    street_address: e.street_address || '',
    zip_code: e.zip_code || '',
    work_mode: e.work_mode || '',
    corporate_phone: e.corporate_phone || '',
    employee_code: e.employee_code || '',
    employment_type: e.employment_type || '',
    start_date: e.start_date || '',
    end_date: e.end_date || '',
    employment_status: e.employment_status || '',
    notes: e.notes || '',
  };
}

function toPayload(f: FormData): Partial<Employee> & { name: string; email: string } {
  return {
    name: f.name,
    email: f.email,
    is_active: f.is_active,
    title: f.title || null,
    department: f.department || null,
    business_unit: f.business_unit || null,
    supervisor_id: f.supervisor_id || null,
    first_name: f.first_name || null,
    last_name: f.last_name || null,
    date_of_birth: f.date_of_birth || null,
    gender: f.gender || null,
    personal_email: f.personal_email || null,
    personal_phone: f.personal_phone || null,
    id_number: f.id_number || null,
    emergency_contact_name: f.emergency_contact_name || null,
    emergency_contact_phone: f.emergency_contact_phone || null,
    country: f.country || null,
    state: f.state || null,
    city: f.city || null,
    timezone: f.timezone || null,
    street_address: f.street_address || null,
    zip_code: f.zip_code || null,
    work_mode: f.work_mode || null,
    corporate_phone: f.corporate_phone || null,
    employee_code: f.employee_code || null,
    employment_type: f.employment_type || null,
    start_date: f.start_date || null,
    end_date: f.end_date || null,
    employment_status: f.employment_status || null,
    notes: f.notes || null,
  };
}

interface SectionProps { title: string; children: React.ReactNode }
function Section({ title, children }: SectionProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 sm:grid-cols-2">{children}</div>
      </CardContent>
    </Card>
  );
}

interface FieldProps { label: string; required?: boolean; children: React.ReactNode; full?: boolean }
function Field({ label, required, children, full }: FieldProps) {
  return (
    <div className={`space-y-1.5 ${full ? 'sm:col-span-2' : ''}`}>
      <Label className="text-sm">
        {label}{required && <span className="text-destructive ml-0.5">*</span>}
      </Label>
      {children}
    </div>
  );
}

export default function EmployeeFormPage() {
  const navigate = useNavigate();
  const { employeeId } = useParams<{ employeeId: string }>();
  const isEdit = !!employeeId;

  const { data: existing, isLoading: loadingEmployee } = useEmployee(employeeId);
  const { data: allEmployees = [] } = useEmployees();
  const createEmployee = useCreateEmployee();
  const updateEmployee = useUpdateEmployee();

  // Internal cost state
  const { data: existingCost } = useEmployeeInternalCost(employeeId);
  const { data: costHistory = [] } = useEmployeeInternalCostHistory(employeeId);
  const upsertCost = useUpsertInternalCost(employeeId);
  const [costForm, setCostForm] = useState<CostForm>(EMPTY_COST);
  const [costDirty, setCostDirty] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  const [form, setForm] = useState<FormData>(EMPTY);
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (existing) {
      setForm(employeeToForm(existing));
      setIsDirty(false);
    }
  }, [existing]);

  useEffect(() => {
    if (existingCost) {
      setCostForm({
        cost_type: existingCost.cost_type || 'hourly',
        internal_hourly: existingCost.internal_hourly != null ? String(existingCost.internal_hourly) : '',
        monthly_salary: existingCost.monthly_salary != null ? String(existingCost.monthly_salary) : '',
        currency: existingCost.currency || 'USD',
        reference_billing_rate: existingCost.reference_billing_rate != null ? String(existingCost.reference_billing_rate) : '',
        effective_from: existingCost.effective_from || '',
        effective_to: existingCost.effective_to || '',
        internal_notes: existingCost.internal_notes || '',
      });
      setCostDirty(false);
    }
  }, [existingCost]);

  const set = (field: keyof FormData, value: string | boolean) => {
    setForm(prev => ({ ...prev, [field]: value }));
    setIsDirty(true);
  };

  const setCost = (field: keyof CostForm, value: string) => {
    setCostForm(prev => ({ ...prev, [field]: value }));
    setCostDirty(true);
  };

  // Live profit margin calculation
  const profitMargin = useMemo(() => {
    const internalCost = parseFloat(costForm.internal_hourly);
    const billingRate = parseFloat(costForm.reference_billing_rate);
    if (!costForm.internal_hourly || !costForm.reference_billing_rate) return null;
    if (isNaN(internalCost) || isNaN(billingRate) || billingRate <= 0) return null;
    return ((billingRate - internalCost) / billingRate) * 100;
  }, [costForm.internal_hourly, costForm.reference_billing_rate]);

  const currencyMismatch =
    costForm.currency &&
    costForm.currency !== 'USD' &&
    !!costForm.internal_hourly &&
    !!costForm.reference_billing_rate;

  const handleCancel = () => {
    if ((isDirty || costDirty) && !confirm('You have unsaved changes. Leave anyway?')) return;
    navigate(isEdit ? `/employees/${employeeId}` : '/employees');
  };

  const handleSubmit = async () => {
    if (!form.name.trim() || !form.email.trim()) {
      toast.error('Name and email are required.');
      return;
    }
    setIsSaving(true);
    try {
      let savedId = employeeId;
      if (isEdit && employeeId) {
        await updateEmployee.mutateAsync({ id: employeeId, updates: toPayload(form) });
      } else {
        const created = await createEmployee.mutateAsync(toPayload(form));
        savedId = created.id;
      }

      // Save internal cost if modified
      if (costDirty && savedId) {
        await upsertCost.mutateAsync({
          cost_type: costForm.cost_type,
          internal_hourly: costForm.internal_hourly ? parseFloat(costForm.internal_hourly) : null,
          monthly_salary: costForm.monthly_salary ? parseFloat(costForm.monthly_salary) : null,
          currency: costForm.currency,
          reference_billing_rate: costForm.reference_billing_rate ? parseFloat(costForm.reference_billing_rate) : null,
          effective_from: costForm.effective_from || null,
          effective_to: costForm.effective_to || null,
          internal_notes: costForm.internal_notes || null,
        });
      }

      toast.success(isEdit ? 'Employee updated.' : 'Employee created.');
      navigate(`/employees/${savedId}`);
    } catch {
      toast.error('Something went wrong. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  if (isEdit && loadingEmployee) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  const otherEmployees = allEmployees.filter(e => e.id !== employeeId);

  return (
    <div className="space-y-6">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink onClick={() => navigate('/employees')} className="cursor-pointer">Employees</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          {isEdit && existing && (
            <>
              <BreadcrumbItem>
                <BreadcrumbLink onClick={() => navigate(`/employees/${employeeId}`)} className="cursor-pointer">{existing.name}</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
            </>
          )}
          <BreadcrumbItem>
            <BreadcrumbPage>{isEdit ? 'Edit' : 'New Employee'}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={handleCancel} className="gap-2">
            <ArrowLeft className="h-4 w-4" /> Back
          </Button>
          <h1 className="text-2xl font-bold text-foreground">
            {isEdit ? (existing?.name || 'Edit Employee') : 'New Employee'}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={handleCancel}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={isSaving} className="gap-2">
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {isEdit ? 'Save Changes' : 'Create Employee'}
          </Button>
        </div>
      </div>

      {/* Personal Information */}
      <Section title="Personal Information">
        <Field label="First Name">
          <Input value={form.first_name} onChange={e => set('first_name', e.target.value)} placeholder="John" />
        </Field>
        <Field label="Last Name">
          <Input value={form.last_name} onChange={e => set('last_name', e.target.value)} placeholder="Smith" />
        </Field>
        <Field label="Full Name" required full>
          <Input value={form.name} onChange={e => set('name', e.target.value)} placeholder="John Smith" />
        </Field>
        <Field label="Date of Birth">
          <Input value={form.date_of_birth} onChange={e => set('date_of_birth', e.target.value)} type="date" />
        </Field>
        <Field label="Gender">
          <Select value={form.gender || '_none'} onValueChange={v => set('gender', v === '_none' ? '' : v)}>
            <SelectTrigger><SelectValue placeholder="Select gender" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="_none">Prefer not to say</SelectItem>
              {GENDERS.map(g => <SelectItem key={g} value={g}>{g}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Personal Email">
          <Input value={form.personal_email} onChange={e => set('personal_email', e.target.value)} type="email" placeholder="john@personal.com" />
        </Field>
        <Field label="Personal Phone">
          <Input value={form.personal_phone} onChange={e => set('personal_phone', e.target.value)} placeholder="+1 (555) 123-4567" />
        </Field>
        <Field label="ID / Passport Number">
          <Input value={form.id_number} onChange={e => set('id_number', e.target.value)} placeholder="A12345678" />
        </Field>
        <Field label="Emergency Contact Name">
          <Input value={form.emergency_contact_name} onChange={e => set('emergency_contact_name', e.target.value)} placeholder="Jane Smith" />
        </Field>
        <Field label="Emergency Contact Phone">
          <Input value={form.emergency_contact_phone} onChange={e => set('emergency_contact_phone', e.target.value)} placeholder="+1 (555) 987-6543" />
        </Field>
      </Section>

      {/* Location */}
      <Section title="Location">
        <Field label="Country">
          <Input value={form.country} onChange={e => set('country', e.target.value)} placeholder="United States" />
        </Field>
        <Field label="State / Province">
          <Input value={form.state} onChange={e => set('state', e.target.value)} placeholder="NY" />
        </Field>
        <Field label="City">
          <Input value={form.city} onChange={e => set('city', e.target.value)} placeholder="New York" />
        </Field>
        <Field label="Time Zone">
          <Input value={form.timezone} onChange={e => set('timezone', e.target.value)} placeholder="America/New_York" />
        </Field>
        <Field label="Street Address" full>
          <Input value={form.street_address} onChange={e => set('street_address', e.target.value)} placeholder="123 Main St" />
        </Field>
        <Field label="Zip / Postal Code">
          <Input value={form.zip_code} onChange={e => set('zip_code', e.target.value)} placeholder="10001" />
        </Field>
        <Field label="Work Mode">
          <Select value={form.work_mode || '_none'} onValueChange={v => set('work_mode', v === '_none' ? '' : v)}>
            <SelectTrigger><SelectValue placeholder="Select mode" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="_none">Not specified</SelectItem>
              {WORK_MODES.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
      </Section>

      {/* Corporate Information */}
      <Section title="Corporate Information">
        <Field label="Corporate Email" required>
          <Input value={form.email} onChange={e => set('email', e.target.value)} type="email" placeholder="john@company.com" />
        </Field>
        <Field label="Corporate Phone">
          <Input value={form.corporate_phone} onChange={e => set('corporate_phone', e.target.value)} placeholder="+1 (555) 000-0000" />
        </Field>
        <Field label="Employee ID / Code">
          <Input value={form.employee_code} onChange={e => set('employee_code', e.target.value)} placeholder="EMP-001" />
        </Field>
        <Field label="Job Title">
          <Input value={form.title} onChange={e => set('title', e.target.value)} placeholder="Senior Engineer" />
        </Field>
        <Field label="Department">
          <Select value={form.department || '_none'} onValueChange={v => set('department', v === '_none' ? '' : v)}>
            <SelectTrigger><SelectValue placeholder="Select department" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="_none">None</SelectItem>
              {DEPARTMENTS.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Business Unit">
          <Input value={form.business_unit} onChange={e => set('business_unit', e.target.value)} placeholder="Platform" />
        </Field>
        <Field label="Employment Type">
          <Select value={form.employment_type || '_none'} onValueChange={v => set('employment_type', v === '_none' ? '' : v)}>
            <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="_none">Not specified</SelectItem>
              {EMPLOYMENT_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Start Date">
          <Input value={form.start_date} onChange={e => set('start_date', e.target.value)} type="date" />
        </Field>
        <Field label="End Date">
          <Input value={form.end_date} onChange={e => set('end_date', e.target.value)} type="date" />
        </Field>
        <Field label="Status">
          <Select value={form.employment_status || '_none'} onValueChange={v => set('employment_status', v === '_none' ? '' : v)}>
            <SelectTrigger><SelectValue placeholder="Select status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="_none">Not specified</SelectItem>
              {EMPLOYMENT_STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Active">
          <div className="flex items-center gap-3 h-10">
            <Switch checked={form.is_active} onCheckedChange={v => set('is_active', v)} />
            <span className={`text-sm ${form.is_active ? 'text-foreground' : 'text-muted-foreground'}`}>
              {form.is_active ? 'Active' : 'Inactive'}
            </span>
          </div>
        </Field>
        <Field label="Reports To (Manager)">
          <Select value={form.supervisor_id || '_none'} onValueChange={v => set('supervisor_id', v === '_none' ? '' : v)}>
            <SelectTrigger><SelectValue placeholder="Select manager" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="_none">None</SelectItem>
              {otherEmployees.map(e => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Notes" full>
          <Textarea value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Internal notes..." rows={3} />
        </Field>
      </Section>

      {/* ── Internal Cost & Billing (Admin Only) ───────────────────────────── */}
      <Card className="border-amber-200 bg-amber-50/40 dark:border-amber-800 dark:bg-amber-950/20">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Lock className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            <CardTitle className="text-base font-semibold">🔒 Internal Cost &amp; Billing</CardTitle>
            <Badge className="bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-900 dark:text-amber-200 text-xs">
              Admin Only
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Cost Type">
              <Select value={costForm.cost_type} onValueChange={v => setCost('cost_type', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {COST_TYPES.map(t => (
                    <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field label="Currency">
              <Select value={costForm.currency} onValueChange={v => setCost('currency', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {COST_CURRENCIES.map(c => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field label="Internal Hourly Cost">
              <div className="flex items-center gap-1.5">
                <span className="text-sm text-muted-foreground">{costForm.currency}</span>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={costForm.internal_hourly}
                  onFocus={e => e.target.select()}
                  onChange={e => setCost('internal_hourly', e.target.value)}
                  placeholder="45.00"
                />
                <span className="text-xs text-muted-foreground whitespace-nowrap">/hr</span>
              </div>
            </Field>

            <Field label="Reference Billing Rate (for margin)">
              <div className="flex items-center gap-1.5">
                <span className="text-sm text-muted-foreground">USD</span>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={costForm.reference_billing_rate}
                  onFocus={e => e.target.select()}
                  onChange={e => setCost('reference_billing_rate', e.target.value)}
                  placeholder="80.00"
                />
                <span className="text-xs text-muted-foreground whitespace-nowrap">/hr</span>
              </div>
            </Field>

            <Field label="Monthly Salary (if salaried)">
              <div className="flex items-center gap-1.5">
                <span className="text-sm text-muted-foreground">{costForm.currency}</span>
                <Input
                  type="number"
                  min="0"
                  step="1"
                  value={costForm.monthly_salary}
                  onFocus={e => e.target.select()}
                  onChange={e => setCost('monthly_salary', e.target.value)}
                  placeholder="3500"
                />
              </div>
            </Field>

            {/* Profit Margin — read-only, live */}
            <Field label="Profit Margin">
              {profitMargin === null ? (
                <p className="text-sm text-muted-foreground mt-1.5">
                  Set internal cost &amp; billing rate to calculate margin
                </p>
              ) : (
                <div className={`mt-1.5 text-lg font-bold ${
                  profitMargin >= 40
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : profitMargin >= 20
                      ? 'text-amber-600 dark:text-amber-400'
                      : 'text-destructive'
                }`}>
                  {profitMargin.toFixed(1)}% margin
                </div>
              )}
            </Field>

            <Field label="Effective From">
              <Input
                type="date"
                value={costForm.effective_from}
                onChange={e => setCost('effective_from', e.target.value)}
              />
            </Field>

            <Field label="Effective To (optional)">
              <Input
                type="date"
                value={costForm.effective_to}
                onChange={e => setCost('effective_to', e.target.value)}
              />
            </Field>

            <Field label="Internal Notes" full>
              <Textarea
                value={costForm.internal_notes}
                onChange={e => setCost('internal_notes', e.target.value)}
                placeholder="Bonus structure, benefits, contractor terms..."
                rows={3}
              />
            </Field>
          </div>

          {currencyMismatch && (
            <p className="text-xs text-amber-700 dark:text-amber-300 mt-1">
              ⚠️ Currencies differ — margin calculation may be inaccurate
            </p>
          )}

          {/* Cost History */}
          {isEdit && costHistory.length > 0 && (
            <div className="pt-2 border-t border-amber-200 dark:border-amber-800">
              <button
                type="button"
                onClick={() => setHistoryOpen(v => !v)}
                className="flex items-center gap-1.5 text-sm text-amber-700 dark:text-amber-300 hover:underline"
              >
                {historyOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                {historyOpen ? 'Hide' : 'View'} cost history ({costHistory.length} record{costHistory.length !== 1 ? 's' : ''})
              </button>
              {historyOpen && (
                <div className="mt-3 overflow-x-auto rounded border border-amber-200 dark:border-amber-800">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">Effective From</TableHead>
                        <TableHead className="text-xs">Cost Type</TableHead>
                        <TableHead className="text-xs">Hourly Rate</TableHead>
                        <TableHead className="text-xs">Monthly</TableHead>
                        <TableHead className="text-xs">Currency</TableHead>
                        <TableHead className="text-xs">Billing Ref</TableHead>
                        <TableHead className="text-xs">Margin</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {costHistory.map(record => {
                        const margin =
                          record.internal_hourly != null &&
                          record.reference_billing_rate != null &&
                          record.reference_billing_rate > 0
                            ? ((record.reference_billing_rate - record.internal_hourly) /
                                record.reference_billing_rate) * 100
                            : null;
                        return (
                          <TableRow key={record.id}>
                            <TableCell className="text-xs">
                              {record.effective_from
                                ? format(new Date(record.effective_from), 'MMM d, yyyy')
                                : '—'}
                            </TableCell>
                            <TableCell className="text-xs capitalize">{record.cost_type}</TableCell>
                            <TableCell className="text-xs">
                              {record.internal_hourly != null
                                ? `${record.currency} ${Number(record.internal_hourly).toFixed(2)}/hr`
                                : '—'}
                            </TableCell>
                            <TableCell className="text-xs">
                              {record.monthly_salary != null
                                ? `${record.currency} ${Number(record.monthly_salary).toLocaleString()}`
                                : '—'}
                            </TableCell>
                            <TableCell className="text-xs">{record.currency}</TableCell>
                            <TableCell className="text-xs">
                              {record.reference_billing_rate != null
                                ? `$${Number(record.reference_billing_rate).toFixed(2)}/hr`
                                : '—'}
                            </TableCell>
                            <TableCell className={`text-xs font-medium ${
                              margin === null ? '' :
                              margin >= 40 ? 'text-emerald-600' :
                              margin >= 20 ? 'text-amber-600' : 'text-destructive'
                            }`}>
                              {margin !== null ? `${margin.toFixed(1)}%` : '—'}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
