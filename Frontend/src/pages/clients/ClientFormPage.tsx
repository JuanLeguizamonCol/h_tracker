import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { format } from 'date-fns';
import { ArrowLeft, Loader2, Save, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { useClient, useCreateClient, useUpdateClient } from '@/hooks/useClients';
import { useSyncFreshSalesAccount } from '@/hooks/useFreshSales';
import { Client } from '@/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from '@/components/ui/breadcrumb';

const INDUSTRIES = ['Tech', 'Finance', 'Healthcare', 'Retail', 'Education', 'Manufacturing', 'Legal', 'Real Estate', 'Consulting', 'Other'];
const REFERRAL_SOURCES = ['Direct', 'Referral', 'LinkedIn', 'Website', 'Event', 'Cold Outreach', 'Partner', 'Other'];
const PAYMENT_TERMS_OPTIONS = ['Net 15', 'Net 30', 'Net 45', 'Net 60', 'Due on Receipt', 'Custom'];
const CURRENCIES = ['USD', 'EUR', 'COP', 'GBP', 'CAD', 'MXN'];

type FormData = {
  name: string;
  is_active: boolean;
  industry: string;
  website: string;
  tax_id: string;
  notes: string;
  email: string;
  phone: string;
  street_address_1: string;
  street_address_2: string;
  city: string;
  state: string;
  zip: string;
  country: string;
  manager_name: string;
  manager_email: string;
  manager_phone: string;
  job_title: string;
  referral_source: string;
  referred_by: string;
  acquisition_date: string;
  contract_start_date: string;
  contract_end_date: string;
  billing_rate: string;
  billing_currency: string;
  billing_email: string;
  payment_terms: string;
};

const EMPTY: FormData = {
  name: '', is_active: true, industry: '', website: '', tax_id: '', notes: '',
  email: '', phone: '', street_address_1: '', street_address_2: '', city: '', state: '', zip: '', country: '',
  manager_name: '', manager_email: '', manager_phone: '', job_title: '',
  referral_source: '', referred_by: '', acquisition_date: '', contract_start_date: '', contract_end_date: '',
  billing_rate: '', billing_currency: 'USD', billing_email: '', payment_terms: '',
};

function clientToForm(c: Client): FormData {
  return {
    name: c.name,
    is_active: c.is_active,
    industry: c.industry || '',
    website: c.website || '',
    tax_id: c.tax_id || '',
    notes: c.notes || '',
    email: c.email || '',
    phone: c.phone || '',
    street_address_1: c.street_address_1 || '',
    street_address_2: c.street_address_2 || '',
    city: c.city || '',
    state: c.state || '',
    zip: c.zip || '',
    country: c.country || '',
    manager_name: c.manager_name || '',
    manager_email: c.manager_email || '',
    manager_phone: c.manager_phone || '',
    job_title: c.job_title || '',
    referral_source: c.referral_source || '',
    referred_by: c.referred_by || '',
    acquisition_date: c.acquisition_date || '',
    contract_start_date: c.contract_start_date || '',
    contract_end_date: c.contract_end_date || '',
    billing_rate: c.billing_rate != null ? String(c.billing_rate) : '',
    billing_currency: c.billing_currency || 'USD',
    billing_email: c.billing_email || '',
    payment_terms: c.payment_terms || '',
  };
}

function toPayload(f: FormData): Partial<Client> & { name: string } {
  return {
    name: f.name,
    is_active: f.is_active,
    industry: f.industry || null,
    website: f.website || null,
    tax_id: f.tax_id || null,
    notes: f.notes || null,
    email: f.email || null,
    phone: f.phone || null,
    street_address_1: f.street_address_1 || null,
    street_address_2: f.street_address_2 || null,
    city: f.city || null,
    state: f.state || null,
    zip: f.zip || null,
    country: f.country || null,
    manager_name: f.manager_name || null,
    manager_email: f.manager_email || null,
    manager_phone: f.manager_phone || null,
    job_title: f.job_title || null,
    referral_source: f.referral_source || null,
    referred_by: f.referred_by || null,
    acquisition_date: f.acquisition_date || null,
    contract_start_date: f.contract_start_date || null,
    contract_end_date: f.contract_end_date || null,
    billing_rate: f.billing_rate ? parseFloat(f.billing_rate) : null,
    billing_currency: f.billing_currency || null,
    billing_email: f.billing_email || null,
    payment_terms: f.payment_terms || null,
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

interface FieldProps {
  label: string;
  required?: boolean;
  children: React.ReactNode;
  full?: boolean;
}
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

export default function ClientFormPage() {
  const navigate = useNavigate();
  const { clientId } = useParams<{ clientId: string }>();
  const isEdit = !!clientId;

  const { data: existing, isLoading: loadingClient } = useClient(clientId);
  const createClient = useCreateClient();
  const updateClient = useUpdateClient();
  const syncCrm = useSyncFreshSalesAccount();

  const [form, setForm] = useState<FormData>(EMPTY);
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const handleSyncCrm = async () => {
    if (!existing?.freshsales_id) return;
    try {
      await syncCrm.mutateAsync(existing.freshsales_id);
      toast.success('Synced from FreshSales.');
    } catch {
      toast.error('Sync failed. Please try again.');
    }
  };

  useEffect(() => {
    if (existing) {
      setForm(clientToForm(existing));
      setIsDirty(false);
    }
  }, [existing]);

  const set = (field: keyof FormData, value: string | boolean) => {
    setForm(prev => ({ ...prev, [field]: value }));
    setIsDirty(true);
  };

  const handleCancel = () => {
    if (isDirty) {
      if (!confirm('You have unsaved changes. Leave anyway?')) return;
    }
    navigate('/clients');
  };

  const handleSubmit = async () => {
    if (!form.name.trim()) {
      toast.error('Client name is required.');
      return;
    }
    setIsSaving(true);
    try {
      if (isEdit && clientId) {
        await updateClient.mutateAsync({ id: clientId, updates: toPayload(form) });
        toast.success('Client updated.');
        navigate('/clients');
      } else {
        const created = await createClient.mutateAsync(toPayload(form));
        toast.success('Client created.');
        navigate('/clients');
        void created;
      }
    } catch {
      toast.error('Something went wrong. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  if (isEdit && loadingClient) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink onClick={() => navigate('/clients')} className="cursor-pointer">Clients</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{isEdit ? 'Edit Client' : 'New Client'}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      {/* Sticky header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={handleCancel} className="gap-2">
            <ArrowLeft className="h-4 w-4" /> Back
          </Button>
          <h1 className="text-2xl font-bold text-foreground">
            {isEdit ? (existing?.name || 'Edit Client') : 'New Client'}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          {isEdit && existing?.freshsales_id && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleSyncCrm}
              disabled={syncCrm.isPending}
              className="gap-2 text-blue-600 border-blue-300 hover:bg-blue-50 dark:text-blue-400 dark:border-blue-800 dark:hover:bg-blue-950/20"
            >
              {syncCrm.isPending
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : <RefreshCw className="h-4 w-4" />}
              {syncCrm.isPending ? 'Syncing...' : 'Sync from FreshSales'}
              {existing.crm_synced_at && (
                <span className="text-xs text-muted-foreground font-normal ml-1">
                  · {format(new Date(existing.crm_synced_at), 'MMM d, yyyy')}
                </span>
              )}
            </Button>
          )}
          <Button variant="outline" onClick={handleCancel}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={isSaving} className="gap-2">
            {isSaving
              ? <Loader2 className="h-4 w-4 animate-spin" />
              : <Save className="h-4 w-4" />}
            {isEdit ? 'Save Changes' : 'Create Client'}
          </Button>
        </div>
      </div>

      {/* Basic Information */}
      <Section title="Basic Information">
        <Field label="Name" required full>
          <Input value={form.name} onChange={e => set('name', e.target.value)} placeholder="e.g. TechCorp Inc." />
        </Field>
        <Field label="Industry">
          <Select value={form.industry || '_none'} onValueChange={v => set('industry', v === '_none' ? '' : v)}>
            <SelectTrigger><SelectValue placeholder="Select industry" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="_none">None</SelectItem>
              {INDUSTRIES.map(i => <SelectItem key={i} value={i}>{i}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Status">
          <div className="flex items-center gap-3 h-10">
            <Switch checked={form.is_active} onCheckedChange={v => set('is_active', v)} />
            <span className={`text-sm ${form.is_active ? 'text-foreground' : 'text-muted-foreground'}`}>
              {form.is_active ? 'Active' : 'Inactive'}
            </span>
          </div>
        </Field>
        <Field label="Website">
          <Input value={form.website} onChange={e => set('website', e.target.value)} placeholder="https://example.com" type="url" />
        </Field>
        <Field label="Tax ID / NIT / RFC">
          <Input value={form.tax_id} onChange={e => set('tax_id', e.target.value)} placeholder="e.g. 900-123456-7" />
        </Field>
        <Field label="Notes" full>
          <Textarea value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Internal notes about this client..." rows={3} />
        </Field>
      </Section>

      {/* Contact Information */}
      <Section title="Contact Information">
        <Field label="Email">
          <Input value={form.email} onChange={e => set('email', e.target.value)} placeholder="contact@company.com" type="email" />
        </Field>
        <Field label="Phone">
          <Input value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="+1 (555) 123-4567" />
        </Field>
        <Field label="Street Address" full>
          <Input value={form.street_address_1} onChange={e => set('street_address_1', e.target.value)} placeholder="123 Main St" />
        </Field>
        <Field label="Address Line 2" full>
          <Input value={form.street_address_2} onChange={e => set('street_address_2', e.target.value)} placeholder="Suite 400" />
        </Field>
        <Field label="City">
          <Input value={form.city} onChange={e => set('city', e.target.value)} placeholder="New York" />
        </Field>
        <Field label="State / Province">
          <Input value={form.state} onChange={e => set('state', e.target.value)} placeholder="NY" />
        </Field>
        <Field label="Zip / Postal Code">
          <Input value={form.zip} onChange={e => set('zip', e.target.value)} placeholder="10001" />
        </Field>
        <Field label="Country">
          <Input value={form.country} onChange={e => set('country', e.target.value)} placeholder="United States" />
        </Field>
      </Section>

      {/* Manager / Responsible Contact */}
      <Section title="Manager / Responsible Contact">
        <Field label="Manager Name">
          <Input value={form.manager_name} onChange={e => set('manager_name', e.target.value)} placeholder="John Smith" />
        </Field>
        <Field label="Job Title">
          <Input value={form.job_title} onChange={e => set('job_title', e.target.value)} placeholder="VP of Engineering" />
        </Field>
        <Field label="Manager Email">
          <Input value={form.manager_email} onChange={e => set('manager_email', e.target.value)} placeholder="john@company.com" type="email" />
        </Field>
        <Field label="Manager Phone">
          <Input value={form.manager_phone} onChange={e => set('manager_phone', e.target.value)} placeholder="+1 (555) 987-6543" />
        </Field>
      </Section>

      {/* Referral & Business Origin */}
      <Section title="Referral & Business Origin">
        <Field label="Referral Source">
          <Select value={form.referral_source || '_none'} onValueChange={v => set('referral_source', v === '_none' ? '' : v)}>
            <SelectTrigger><SelectValue placeholder="Select source" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="_none">None</SelectItem>
              {REFERRAL_SOURCES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Referred By">
          <Input value={form.referred_by} onChange={e => set('referred_by', e.target.value)} placeholder="Person or company name" />
        </Field>
        <Field label="Acquisition Date">
          <Input value={form.acquisition_date} onChange={e => set('acquisition_date', e.target.value)} type="date" />
        </Field>
        <Field label="Contract Start Date">
          <Input value={form.contract_start_date} onChange={e => set('contract_start_date', e.target.value)} type="date" />
        </Field>
        <Field label="Contract End Date">
          <Input value={form.contract_end_date} onChange={e => set('contract_end_date', e.target.value)} type="date" />
        </Field>
      </Section>

      {/* Billing & Commercial */}
      <Section title="Billing & Commercial">
        <Field label="Billing Rate">
          <div className="flex gap-2">
            <Input
              value={form.billing_rate}
              onChange={e => set('billing_rate', e.target.value)}
              type="number" min="0" step="0.01"
              placeholder="0.00"
              className="flex-1"
            />
            <Select value={form.billing_currency} onValueChange={v => set('billing_currency', v)}>
              <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
              <SelectContent>
                {CURRENCIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </Field>
        <Field label="Payment Terms">
          <Select value={form.payment_terms || '_none'} onValueChange={v => set('payment_terms', v === '_none' ? '' : v)}>
            <SelectTrigger><SelectValue placeholder="Select terms" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="_none">None</SelectItem>
              {PAYMENT_TERMS_OPTIONS.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Billing Email" full>
          <Input value={form.billing_email} onChange={e => set('billing_email', e.target.value)} placeholder="billing@company.com" type="email" />
        </Field>
      </Section>
    </div>
  );
}
