import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Check, Plus, Trash2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useCreateProject, useProjectCategories, useAdminEmployees } from '@/hooks/useProjects';
import { useActiveClients } from '@/hooks/useClients';
import { useEmployees } from '@/hooks/useEmployees';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Employee, ProjectRole } from '@/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Separator } from '@/components/ui/separator';
import { SearchableCombobox } from '@/components/ui/SearchableCombobox';
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from '@/components/ui/breadcrumb';

const STEPS = ['Project Details', 'Roles & Rates', 'Assign Employees'];

// ── Step 1 form state
interface Step1Form {
  name: string;
  project_code: string;
  client_id: string;
  area_category: string;
  business_unit: string;
  manager_id: string;
  start_date: string;
  end_date: string;
  status: string;
  is_internal: boolean;
  referral_id: string;
  referral_type: string;
  referral_value: string;
  description: string;
  owner_company: string;
  billing_period: string;
  billing_day_of_period: string;
  custom_period_days: string;
  billing_anchor_date: string;
}

// ── Step 2 form state
interface RoleRow {
  _tempId: string;
  name: string;
  hourly_rate_usd: number;
}

// ── Step 3 form state
interface AssignmentRow {
  _tempId: string;
  user_id: string;
  employee_name: string;
  role_temp_id: string;
}

export default function ProjectNewPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const createProject = useCreateProject();

  const { data: clients = [] } = useActiveClients();
  const { data: areaCategories = [] } = useProjectCategories('area_category');
  const { data: businessUnits = [] } = useProjectCategories('business_unit');
  const { data: adminEmployees = [] } = useAdminEmployees();
  const { data: allEmployees = [] } = useEmployees();

  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  // ── Step 1 state
  const [form, setForm] = useState<Step1Form>({
    name: '',
    project_code: '',
    client_id: '',
    area_category: '',
    business_unit: '',
    manager_id: '',
    start_date: '',
    end_date: '',
    status: 'active',
    is_internal: false,
    referral_id: '',
    referral_type: 'percentage',
    referral_value: '',
    description: '',
    owner_company: 'IPC',
    billing_period: 'monthly',
    billing_day_of_period: '3',
    custom_period_days: '',
    billing_anchor_date: '',
  });

  const set = (field: keyof Step1Form, value: any) =>
    setForm(f => ({ ...f, [field]: value }));

  // ── Step 2 state
  const [roles, setRoles] = useState<RoleRow[]>([]);

  const addRole = () =>
    setRoles(r => [...r, { _tempId: crypto.randomUUID(), name: '', hourly_rate_usd: 0 }]);

  const updateRole = (id: string, field: keyof Omit<RoleRow, '_tempId'>, val: any) =>
    setRoles(r => r.map(row => row._tempId === id ? { ...row, [field]: val } : row));

  const removeRole = (id: string) =>
    setRoles(r => r.filter(row => row._tempId !== id));

  // ── Step 3 state
  const [assignments, setAssignments] = useState<AssignmentRow[]>([]);
  const [employeeSearch, setEmployeeSearch] = useState('');

  const assignedIds = new Set(assignments.map(a => a.user_id));

  const filteredEmployees = allEmployees.filter(
    e => !assignedIds.has(e.user_id) &&
      e.name.toLowerCase().includes(employeeSearch.toLowerCase())
  );

  const addAssignment = (emp: Employee) => {
    setAssignments(a => [...a, {
      _tempId: crypto.randomUUID(),
      user_id: emp.user_id,
      employee_name: emp.name,
      role_temp_id: '',
    }]);
    setEmployeeSearch('');
  };

  const updateAssignmentRole = (tempId: string, roleTempId: string) =>
    setAssignments(a => a.map(row => row._tempId === tempId ? { ...row, role_temp_id: roleTempId } : row));

  const removeAssignment = (tempId: string) =>
    setAssignments(a => a.filter(row => row._tempId !== tempId));

  // ── Validation
  const validateStep1 = () => {
    if (!form.name.trim()) { toast.error('Project name is required.'); return false; }
    if (!form.client_id) { toast.error('Client is required.'); return false; }
    if (!form.area_category) { toast.error('Area category is required.'); return false; }
    if (!form.business_unit) { toast.error('Business unit is required.'); return false; }
    if (!form.manager_id) { toast.error('Project manager is required.'); return false; }
    if (!form.start_date) { toast.error('Start date is required.'); return false; }
    if (!form.status) { toast.error('Status is required.'); return false; }
    return true;
  };

  const validateStep2 = () => {
    for (const r of roles) {
      if (!r.name.trim()) { toast.error('All roles must have a name.'); return false; }
    }
    return true;
  };

  // ── Submit
  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      // 1. Create project
      const project = await createProject.mutateAsync({
        name: form.name,
        client_id: form.client_id,
        project_code: form.project_code || undefined,
        area_category: form.area_category || undefined,
        business_unit: form.business_unit || undefined,
        manager_id: form.manager_id || undefined,
        start_date: form.start_date || undefined,
        end_date: form.end_date || undefined,
        status: form.status,
        is_internal: form.is_internal,
        referral_id: form.referral_id || undefined,
        referral_type: form.referral_id ? form.referral_type : undefined,
        referral_value: form.referral_id && form.referral_value ? parseFloat(form.referral_value) : undefined,
        description: form.description || undefined,
        owner_company: form.owner_company,
        billing_period: form.billing_period,
        billing_day_of_period: form.billing_day_of_period ? parseInt(form.billing_day_of_period) : undefined,
        custom_period_days: form.custom_period_days ? parseInt(form.custom_period_days) : undefined,
        billing_anchor_date: form.billing_anchor_date || undefined,
      } as any);

      // 2. Create roles (collect created role IDs by temp ID)
      const roleIdMap: Record<string, string> = {};
      for (const role of roles) {
        const created = await api.post<ProjectRole>('/project-roles', {
          project_id: project.id,
          name: role.name,
          hourly_rate_usd: role.hourly_rate_usd,
        });
        roleIdMap[role._tempId] = created.id;
      }

      // 3. Assign employees
      for (const a of assignments) {
        const roleId = a.role_temp_id ? roleIdMap[a.role_temp_id] : undefined;
        await api.post('/employee-projects', {
          user_id: a.user_id,
          project_id: project.id,
          ...(roleId ? { role_id: roleId } : {}),
        });
      }

      queryClient.invalidateQueries({ queryKey: ['assigned-projects'] });
      toast.success('Project created successfully.');
      navigate('/projects');
    } catch {
      toast.error('Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const clientOptions = clients.map(c => ({ id: c.id, label: c.name }));
  const areaOptions = areaCategories.map(c => ({ id: c.value, label: c.value }));
  const buOptions = businessUnits.map(c => ({ id: c.value, label: c.value }));
  const managerOptions = adminEmployees.map(e => ({ id: e.id, label: e.name, sublabel: e.email }));
  const referralOptions = allEmployees.map(e => ({ id: e.id, label: e.name }));

  return (
    <div className="space-y-6 pb-12 max-w-3xl mx-auto">
      {/* Breadcrumb */}
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink onClick={() => navigate('/projects')} className="cursor-pointer">Projects</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem><BreadcrumbPage>New Project</BreadcrumbPage></BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate('/projects')} className="gap-2">
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>
        <h1 className="text-2xl font-bold text-foreground">New Project</h1>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-2">
        {STEPS.map((label, i) => (
          <div key={i} className="flex items-center gap-2">
            <div className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold
              ${i < step ? 'bg-primary text-primary-foreground' :
                i === step ? 'bg-primary text-primary-foreground' :
                'bg-muted text-muted-foreground'}`}
            >
              {i < step ? <Check className="h-3 w-3" /> : i + 1}
            </div>
            <span className={`text-sm ${i === step ? 'font-semibold' : 'text-muted-foreground'}`}>
              {label}
            </span>
            {i < STEPS.length - 1 && <div className="h-px w-6 bg-border" />}
          </div>
        ))}
      </div>

      {/* ── STEP 1: Project Details ───────────────────────────────────────── */}
      {step === 0 && (
        <Card>
          <CardHeader><CardTitle>Project Details</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1">
                <Label>Project Name *</Label>
                <Input value={form.name} onChange={e => set('name', e.target.value)} placeholder="e.g. Corporate Web Portal" />
              </div>
              <div className="space-y-1">
                <Label>Project ID Code</Label>
                <Input value={form.project_code} onChange={e => set('project_code', e.target.value)} placeholder="e.g. IPC-2026-001" />
              </div>
              <div className="space-y-1">
                <Label>Client *</Label>
                <SearchableCombobox
                  options={clientOptions}
                  value={form.client_id || null}
                  onChange={v => set('client_id', v ?? '')}
                  placeholder="Select client..."
                />
              </div>
              <div className="space-y-1">
                <Label>Area Category *</Label>
                <SearchableCombobox
                  options={areaOptions}
                  value={form.area_category || null}
                  onChange={v => set('area_category', v ?? '')}
                  placeholder="Select category..."
                />
              </div>
              <div className="space-y-1">
                <Label>Business Unit *</Label>
                <SearchableCombobox
                  options={buOptions}
                  value={form.business_unit || null}
                  onChange={v => set('business_unit', v ?? '')}
                  placeholder="Select unit..."
                />
              </div>
              <div className="space-y-1">
                <Label>Project Manager *</Label>
                <SearchableCombobox
                  options={managerOptions}
                  value={form.manager_id || null}
                  onChange={v => set('manager_id', v ?? '')}
                  placeholder="Select manager (Admin only)..."
                />
              </div>
              <div className="space-y-1">
                <Label>Start Date *</Label>
                <Input type="date" value={form.start_date} onChange={e => set('start_date', e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>End Date</Label>
                <Input type="date" value={form.end_date} onChange={e => set('end_date', e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Status *</Label>
                <Select value={form.status} onValueChange={v => set('status', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="on_hold">On Hold</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Referral</Label>
                <SearchableCombobox
                  options={referralOptions}
                  value={form.referral_id || null}
                  onChange={v => set('referral_id', v ?? '')}
                  placeholder="Select referral..."
                  clearable
                />
              </div>
            </div>

            {/* Referral type + value — conditional */}
            {form.referral_id && (
              <div className="grid gap-4 sm:grid-cols-2 border rounded-md p-3 bg-muted/30">
                <div className="space-y-1">
                  <Label>Referral Type</Label>
                  <Select value={form.referral_type} onValueChange={v => set('referral_type', v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="percentage">Percentage (%)</SelectItem>
                      <SelectItem value="fixed">Fixed Amount ($)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Referral Value {form.referral_type === 'percentage' ? '(%)' : '($)'}</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.referral_value}
                    onChange={e => set('referral_value', e.target.value)}
                    placeholder={form.referral_type === 'percentage' ? 'e.g. 5' : 'e.g. 500'}
                  />
                </div>
              </div>
            )}

            <div className="flex items-center gap-3">
              <Switch
                checked={form.is_internal}
                onCheckedChange={v => set('is_internal', v)}
              />
              <div>
                <Label>Internal project</Label>
                <p className="text-xs text-muted-foreground">Locks all time entries to non-billable.</p>
              </div>
            </div>

            <div className="space-y-1">
              <Label>Notes</Label>
              <Textarea
                rows={2}
                value={form.description}
                onChange={e => set('description', e.target.value)}
                placeholder="Optional notes about this project..."
                className="resize-none text-sm"
              />
            </div>

            <Separator />

            {/* Owner Company */}
            <div className="space-y-2">
              <Label>Owner Company *</Label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => set('owner_company', 'IPC')}
                  className={`flex-1 rounded-md border px-4 py-2 text-sm font-semibold transition-colors ${
                    form.owner_company === 'IPC'
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'border-input bg-background text-muted-foreground hover:bg-muted'
                  }`}
                >
                  IPC — Impact Point Co.
                </button>
                <button
                  type="button"
                  onClick={() => set('owner_company', 'PI')}
                  className={`flex-1 rounded-md border px-4 py-2 text-sm font-semibold transition-colors ${
                    form.owner_company === 'PI'
                      ? 'bg-purple-600 text-white border-purple-600'
                      : 'border-input bg-background text-muted-foreground hover:bg-muted'
                  }`}
                >
                  PI — Pegasus Insights
                </button>
              </div>
            </div>

            {/* Billing Configuration */}
            <div className="space-y-3 border rounded-md p-3 bg-muted/20">
              <Label className="text-sm font-semibold">Billing Configuration</Label>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label>Billing Period</Label>
                  <Select value={form.billing_period} onValueChange={v => set('billing_period', v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="weekly">Weekly</SelectItem>
                      <SelectItem value="biweekly">Bi-weekly</SelectItem>
                      <SelectItem value="monthly">Monthly</SelectItem>
                      <SelectItem value="bimonthly">Bi-monthly</SelectItem>
                      <SelectItem value="quarterly">Quarterly</SelectItem>
                      <SelectItem value="custom">Custom</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {['monthly', 'bimonthly', 'quarterly'].includes(form.billing_period) && (
                  <div className="space-y-1">
                    <Label>Invoice Day of Period</Label>
                    <Input
                      type="number"
                      min="1"
                      max="31"
                      value={form.billing_day_of_period}
                      onChange={e => set('billing_day_of_period', e.target.value)}
                      placeholder="e.g. 3"
                    />
                  </div>
                )}
                {form.billing_period === 'custom' && (
                  <div className="space-y-1">
                    <Label>Period Length (days)</Label>
                    <Input
                      type="number"
                      min="1"
                      value={form.custom_period_days}
                      onChange={e => set('custom_period_days', e.target.value)}
                      placeholder="e.g. 30"
                    />
                  </div>
                )}
                {['weekly', 'biweekly', 'custom'].includes(form.billing_period) && (
                  <div className="space-y-1">
                    <Label>Anchor Date</Label>
                    <Input
                      type="date"
                      value={form.billing_anchor_date}
                      onChange={e => set('billing_anchor_date', e.target.value)}
                    />
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── STEP 2: Roles & Rates ────────────────────────────────────────── */}
      {step === 1 && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Roles & Rates</CardTitle>
            <Button size="sm" variant="outline" onClick={addRole} className="gap-1">
              <Plus className="h-3 w-3" /> Add Role
            </Button>
          </CardHeader>
          <CardContent>
            {roles.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                No roles yet. Click "Add Role" to define billing rates.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Role Name</TableHead>
                    <TableHead className="text-right w-36">Rate (USD/h)</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {roles.map(row => (
                    <TableRow key={row._tempId}>
                      <TableCell>
                        <Input
                          value={row.name}
                          onChange={e => updateRole(row._tempId, 'name', e.target.value)}
                          placeholder="e.g. Data Analyst"
                          className="h-8"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          min="0"
                          step="0.5"
                          value={row.hourly_rate_usd || ''}
                          onChange={e => updateRole(row._tempId, 'hourly_rate_usd', parseFloat(e.target.value) || 0)}
                          className="h-8 text-right"
                        />
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => removeRole(row._tempId)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── STEP 3: Assign Employees ─────────────────────────────────────── */}
      {step === 2 && (
        <Card>
          <CardHeader>
            <CardTitle>Assign Employees</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Employee search combobox */}
            <div className="space-y-1">
              <Label>Add employee</Label>
              <div className="relative">
                <Input
                  value={employeeSearch}
                  onChange={e => setEmployeeSearch(e.target.value)}
                  placeholder="Search by name..."
                  className="h-9"
                />
                {employeeSearch && filteredEmployees.length > 0 && (
                  <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-md max-h-48 overflow-y-auto">
                    {filteredEmployees.slice(0, 10).map(emp => (
                      <button
                        key={emp.id}
                        type="button"
                        className="flex w-full items-center px-3 py-2 text-sm hover:bg-accent text-left"
                        onClick={() => addAssignment(emp)}
                      >
                        <span className="font-medium">{emp.name}</span>
                        {emp.email && <span className="ml-2 text-xs text-muted-foreground">{emp.email}</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {assignments.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">No employees assigned yet.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {assignments.map(a => (
                    <TableRow key={a._tempId}>
                      <TableCell className="font-medium">{a.employee_name}</TableCell>
                      <TableCell>
                        <Select
                          value={a.role_temp_id || '__none__'}
                          onValueChange={v => updateAssignmentRole(a._tempId, v === '__none__' ? '' : v)}
                        >
                          <SelectTrigger className="w-52 h-8">
                            <SelectValue placeholder="Select role" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">No role</SelectItem>
                            {roles.map(r => (
                              <SelectItem key={r._tempId} value={r._tempId}>
                                {r.name}{r.hourly_rate_usd > 0 ? ` — $${r.hourly_rate_usd}/h` : ''}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => removeAssignment(a._tempId)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      {/* Navigation buttons */}
      <div className="flex items-center justify-between pt-2">
        <Button
          variant="outline"
          onClick={() => step === 0 ? navigate('/projects') : setStep(s => s - 1)}
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          {step === 0 ? 'Cancel' : 'Back'}
        </Button>

        {step < STEPS.length - 1 ? (
          <Button
            onClick={() => {
              if (step === 0 && !validateStep1()) return;
              if (step === 1 && !validateStep2()) return;
              setStep(s => s + 1);
            }}
          >
            Next: {STEPS[step + 1]}
            <ArrowRight className="h-4 w-4 ml-2" />
          </Button>
        ) : (
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Check className="h-4 w-4 mr-2" />}
            Create Project
          </Button>
        )}
      </div>
    </div>
  );
}
