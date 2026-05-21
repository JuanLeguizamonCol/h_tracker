import { useState, useMemo, useRef, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Edit, Plus, Trash2, Loader2, Tag, Users, LayoutDashboard, X, RefreshCw, Filter } from 'lucide-react';
import { toast } from 'sonner';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  useProject, useProjectAssignments,
} from '@/hooks/useProjects';
import { useProjectRoles, useCreateProjectRole, useUpdateProjectRole, useDeleteProjectRole } from '@/hooks/useProjectRoles';
import { useSkillCatalog } from '@/hooks/useSkills';
import { api } from '@/lib/api';
import { ProjectRole, AssignableEmployee, ProjectRequiredSkill, SkillCoverage } from '@/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from '@/components/ui/breadcrumb';

const STATUS_COLORS: Record<string, string> = {
  active: 'default',
  on_hold: 'secondary',
  completed: 'outline',
};

const SKILL_CATEGORIES = ['Frontend', 'Backend', 'Cloud', 'DevOps', 'Design', 'Data', 'Management', 'Soft Skills', 'Other'];
const MIN_LEVEL_OPTIONS = [
  { value: 'beginner', label: 'Beginner+' },
  { value: 'intermediate', label: 'Intermediate+' },
  { value: 'advanced', label: 'Advanced+' },
  { value: 'expert', label: 'Expert only' },
];
const LEVEL_LABELS: Record<number, string> = { 1: 'Beginner', 2: 'Intermediate', 3: 'Advanced', 4: 'Expert' };

function ProficiencyStars({ level }: { level: number }) {
  return (
    <span className="inline-flex gap-0.5">
      {[1, 2, 3, 4].map(i => (
        <span key={i} className={i <= level ? 'text-amber-400' : 'text-muted-foreground/30'}>★</span>
      ))}
    </span>
  );
}

export default function ProjectDetailPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const { data: project, isLoading } = useProject(projectId);

  if (isLoading || !project) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-12">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink onClick={() => navigate('/projects')} className="cursor-pointer">Projects</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem><BreadcrumbPage>{project.name}</BreadcrumbPage></BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate('/projects')} className="gap-2 shrink-0">
            <ArrowLeft className="h-4 w-4" /> Back
          </Button>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold text-foreground truncate">{project.name}</h1>
              {project.project_code && (
                <Badge variant="outline" className="font-mono text-xs">{project.project_code}</Badge>
              )}
              <Badge variant={(STATUS_COLORS[project.status] as any) || 'secondary'} className="capitalize">
                {project.status?.replace('_', ' ')}
              </Badge>
            </div>
            <div className="flex flex-wrap items-center gap-2 mt-1 text-sm text-muted-foreground">
              {project.manager_name && (
                <span><span className="font-medium text-foreground">Manager:</span> {project.manager_name}</span>
              )}
              {project.area_category && <span className="bg-muted rounded px-1.5 py-0.5 text-xs">{project.area_category}</span>}
              {project.business_unit && <span className="bg-muted rounded px-1.5 py-0.5 text-xs">{project.business_unit}</span>}
              {project.start_date && <span>From {project.start_date}{project.end_date ? ` → ${project.end_date}` : ''}</span>}
            </div>
          </div>
        </div>
        <Button size="sm" variant="outline" className="gap-2 shrink-0" onClick={() => navigate(`/projects/${project.id}/edit`)}>
          <Edit className="h-4 w-4" /> Edit Project
        </Button>
      </div>

      <Tabs defaultValue="overview" className="w-full">
        <TabsList>
          <TabsTrigger value="overview" className="gap-1.5"><LayoutDashboard className="h-4 w-4" /> Overview</TabsTrigger>
          <TabsTrigger value="roles" className="gap-1.5"><Tag className="h-4 w-4" /> Roles & Rates</TabsTrigger>
          <TabsTrigger value="assignments" className="gap-1.5"><Users className="h-4 w-4" /> Assignments</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Card>
              <CardHeader><CardTitle className="text-sm">Project Info</CardTitle></CardHeader>
              <CardContent className="space-y-3 text-sm">
                <InfoRow label="Client" value={project.client_id} />
                <InfoRow label="Status" value={
                  <Badge variant={(STATUS_COLORS[project.status] as any) || 'secondary'} className="capitalize">
                    {project.status?.replace('_', ' ')}
                  </Badge>
                } />
                <InfoRow label="Manager" value={project.manager_name ?? '— Unassigned'} />
                {project.project_code && <InfoRow label="Project Code" value={<code className="text-xs bg-muted px-1.5 py-0.5 rounded">{project.project_code}</code>} />}
                {project.area_category && <InfoRow label="Area Category" value={project.area_category} />}
                {project.business_unit && <InfoRow label="Business Unit" value={project.business_unit} />}
                {project.start_date && <InfoRow label="Start Date" value={project.start_date} />}
                {project.end_date && <InfoRow label="End Date" value={project.end_date} />}
                <InfoRow label="Internal" value={project.is_internal ? 'Yes' : 'No'} />
              </CardContent>
            </Card>
            {project.referral_id && (
              <Card>
                <CardHeader><CardTitle className="text-sm">Referral</CardTitle></CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <InfoRow label="Type" value={project.referral_type ?? '—'} />
                  <InfoRow label="Value" value={
                    project.referral_value != null
                      ? project.referral_type === 'percentage' ? `${project.referral_value}%` : `$${Number(project.referral_value).toFixed(2)}`
                      : '—'
                  } />
                </CardContent>
              </Card>
            )}
            {project.description && (
              <Card className="sm:col-span-2">
                <CardHeader><CardTitle className="text-sm">Notes</CardTitle></CardHeader>
                <CardContent><p className="text-sm text-muted-foreground whitespace-pre-wrap">{project.description}</p></CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        <TabsContent value="roles" className="mt-4">
          <Card><CardContent className="pt-6"><ProjectRolesPanel projectId={project.id} /></CardContent></Card>
        </TabsContent>

        <TabsContent value="assignments" className="mt-4">
          <Card><CardContent className="pt-6"><ProjectAssignmentsPanel projectId={project.id} /></CardContent></Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className="font-medium text-right">{value}</span>
    </div>
  );
}

// ── Roles & Rates Panel ──────────────────────────────────────────────────────
function ProjectRolesPanel({ projectId }: { projectId: string }) {
  const { data: roles = [], isLoading } = useProjectRoles(projectId);
  const createRole = useCreateProjectRole();
  const updateRole = useUpdateProjectRole();
  const deleteRole = useDeleteProjectRole();

  const [isAddOpen, setIsAddOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<ProjectRole | null>(null);
  const [form, setForm] = useState({ name: '', hourly_rate_usd: 0 });

  const handleAdd = async () => {
    if (!form.name) { toast.error('Please enter a role name.'); return; }
    try {
      await createRole.mutateAsync({ project_id: projectId, name: form.name, hourly_rate_usd: form.hourly_rate_usd });
      toast.success('Role added.');
      setForm({ name: '', hourly_rate_usd: 0 });
      setIsAddOpen(false);
    } catch { toast.error('Something went wrong.'); }
  };

  const handleUpdate = async () => {
    if (!editingRole || !form.name) return;
    try {
      await updateRole.mutateAsync({ id: editingRole.id, updates: { name: form.name, hourly_rate_usd: form.hourly_rate_usd } });
      toast.success('Role saved.');
      setEditingRole(null);
    } catch { toast.error('Something went wrong.'); }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteRole.mutateAsync(id);
      toast.success('Role removed.');
    } catch { toast.error('Cannot remove this role — it may be in use.'); }
  };

  if (isLoading) return <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Define roles and hourly rates (USD) for this project.</p>
        <Button size="sm" className="gap-1.5" onClick={() => { setForm({ name: '', hourly_rate_usd: 0 }); setIsAddOpen(true); }}>
          <Plus className="h-4 w-4" /> Add Role
        </Button>
      </div>
      {roles.length === 0 ? (
        <p className="text-sm text-muted-foreground py-6 text-center">No roles defined.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Role Name</TableHead>
              <TableHead className="text-right">Rate (USD/h)</TableHead>
              <TableHead className="text-right w-24">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {roles.map(role => (
              <TableRow key={role.id}>
                <TableCell className="font-medium">{role.name}</TableCell>
                <TableCell className="text-right font-semibold text-primary">${Number(role.hourly_rate_usd)}/h</TableCell>
                <TableCell className="text-right">
                  <div className="flex gap-1 justify-end">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setForm({ name: role.name, hourly_rate_usd: Number(role.hourly_rate_usd) }); setEditingRole(role); }}>
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleDelete(role.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      <Dialog open={isAddOpen || !!editingRole} onOpenChange={v => { if (!v) { setIsAddOpen(false); setEditingRole(null); } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editingRole ? 'Edit Role' : 'Add Role'}</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-1">
              <Label>Role name</Label>
              <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. Senior Developer" />
            </div>
            <div className="space-y-1">
              <Label>Hourly rate (USD)</Label>
              <Input type="number" min="0" step="0.5" value={form.hourly_rate_usd || ''} onChange={e => setForm({ ...form, hourly_rate_usd: parseFloat(e.target.value) || 0 })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setIsAddOpen(false); setEditingRole(null); }}>Cancel</Button>
            <Button onClick={editingRole ? handleUpdate : handleAdd}>{editingRole ? 'Save' : 'Add Role'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Skill Gap Section ─────────────────────────────────────────────────────────
function SkillGapSection({ projectId, onManageSkills }: { projectId: string; onManageSkills: () => void }) {
  const { data: coverage = [] } = useQuery<SkillCoverage[]>({
    queryKey: ['skill-coverage', projectId],
    queryFn: () => api.get<SkillCoverage[]>(`/projects/${projectId}/skill-coverage`),
  });

  if (coverage.length === 0) return null;

  const statusIcon = (s: string) => s === 'covered' ? '✅' : s === 'partial' ? '⚠️' : '❌';
  const statusText = (s: string) => s === 'covered' ? 'text-emerald-700 dark:text-emerald-400' : s === 'partial' ? 'text-amber-700 dark:text-amber-400' : 'text-destructive';

  return (
    <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">Required Skills for this project</p>
        <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={onManageSkills}>
          <Plus className="h-3 w-3" /> Manage
        </Button>
      </div>
      <div className="flex flex-wrap gap-2">
        {coverage.map(item => (
          <div key={item.skill_id} className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs border bg-background ${statusText(item.coverage_status)}`}
            title={item.covered_by_names.length > 0 ? `Covered by: ${item.covered_by_names.join(', ')}` : `Missing — need ${item.min_level_label}+`}>
            {statusIcon(item.coverage_status)} {item.skill_name}
            <span className="text-muted-foreground">({item.min_level_label}+)</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Manage Required Skills Dialog ─────────────────────────────────────────────
function ManageRequiredSkillsDialog({
  projectId, open, onClose,
}: { projectId: string; open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const { data: required = [] } = useQuery<ProjectRequiredSkill[]>({
    queryKey: ['required-skills', projectId],
    queryFn: () => api.get<ProjectRequiredSkill[]>(`/projects/${projectId}/required-skills`),
    enabled: open,
  });

  const [skillSearch, setSkillSearch] = useState('');
  const { data: catalog = [] } = useSkillCatalog(skillSearch || undefined);
  const [selectedCatalogSkill, setSelectedCatalogSkill] = useState<{ id: string; name: string } | null>(null);
  const [minLevel, setMinLevel] = useState(2);
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const requiredIds = new Set(required.map(r => r.skill_id));
  const filteredCatalog = catalog.filter(s => !requiredIds.has(s.id));

  const handleAdd = async () => {
    if (!selectedCatalogSkill) return;
    setSaving(true);
    try {
      await api.post(`/projects/${projectId}/required-skills`, { skill_id: selectedCatalogSkill.id, min_level: minLevel });
      queryClient.invalidateQueries({ queryKey: ['required-skills', projectId] });
      queryClient.invalidateQueries({ queryKey: ['skill-coverage', projectId] });
      setSelectedCatalogSkill(null);
      setSkillSearch('');
      toast.success(`Added ${selectedCatalogSkill.name} as required skill.`);
    } catch { toast.error('Something went wrong.'); }
    finally { setSaving(false); }
  };

  const handleRemove = async (skillId: string, name: string) => {
    try {
      await api.delete(`/projects/${projectId}/required-skills/${skillId}`);
      queryClient.invalidateQueries({ queryKey: ['required-skills', projectId] });
      queryClient.invalidateQueries({ queryKey: ['skill-coverage', projectId] });
      toast.success(`Removed ${name}.`);
    } catch { toast.error('Something went wrong.'); }
  };

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Required Skills</DialogTitle></DialogHeader>
        <div className="space-y-4 py-2">
          {/* Add skill */}
          <div className="space-y-2">
            <Label className="text-xs">Add required skill</Label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Input
                  value={selectedCatalogSkill ? selectedCatalogSkill.name : skillSearch}
                  onChange={e => { setSkillSearch(e.target.value); setSelectedCatalogSkill(null); setCatalogOpen(true); }}
                  onFocus={() => setCatalogOpen(true)}
                  placeholder="Search skill catalog..."
                  className="h-8 text-sm"
                />
                {catalogOpen && !selectedCatalogSkill && filteredCatalog.length > 0 && (
                  <div className="absolute z-50 mt-1 w-full rounded border bg-popover shadow-md max-h-40 overflow-y-auto">
                    {filteredCatalog.slice(0, 8).map(s => (
                      <button key={s.id} type="button"
                        className="flex w-full items-center justify-between px-3 py-1.5 text-sm hover:bg-accent text-left"
                        onClick={() => { setSelectedCatalogSkill({ id: s.id, name: s.name }); setSkillSearch(''); setCatalogOpen(false); }}>
                        <span>{s.name}</span>
                        <span className="text-xs text-muted-foreground">{s.category}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <Select value={String(minLevel)} onValueChange={v => setMinLevel(Number(v))}>
                <SelectTrigger className="w-36 h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">Beginner+</SelectItem>
                  <SelectItem value="2">Intermediate+</SelectItem>
                  <SelectItem value="3">Advanced+</SelectItem>
                  <SelectItem value="4">Expert only</SelectItem>
                </SelectContent>
              </Select>
              <Button size="sm" className="h-8" onClick={handleAdd} disabled={!selectedCatalogSkill || saving}>
                {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
              </Button>
            </div>
          </div>

          {/* Current list */}
          {required.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No required skills defined yet.</p>
          ) : (
            <div className="space-y-1.5 max-h-48 overflow-y-auto">
              {required.map(r => (
                <div key={r.id} className="flex items-center justify-between rounded border px-3 py-2 bg-muted/30">
                  <div>
                    <span className="text-sm font-medium">{r.skill_name}</span>
                    <span className="ml-2 text-xs text-muted-foreground">{r.skill_category}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">{r.min_level_label}+</Badge>
                    <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => handleRemove(r.skill_id, r.skill_name)}>
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Assignments Panel ─────────────────────────────────────────────────────────
function ProjectAssignmentsPanel({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();
  const { data: assignments = [], isLoading } = useProjectAssignments(projectId);
  const { data: roles = [] } = useProjectRoles(projectId);

  // ── Skill filter state ──
  type SkillChip = { id: string; name: string };
  const [selectedSkills, setSelectedSkills] = useState<SkillChip[]>([]);
  const [skillSearchInput, setSkillSearchInput] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [minLevel, setMinLevel] = useState('');
  const [matchMode, setMatchMode] = useState<'all' | 'any'>('all');
  const [skillDropdownOpen, setSkillDropdownOpen] = useState(false);
  const skillDropdownRef = useRef<HTMLDivElement>(null);

  // ── Employee name search ──
  const [employeeSearch, setEmployeeSearch] = useState('');
  const [empDropdownOpen, setEmpDropdownOpen] = useState(false);
  const empDropdownRef = useRef<HTMLDivElement>(null);

  // ── Manage skills dialog ──
  const [manageOpen, setManageOpen] = useState(false);

  // Skill catalog for filter dropdown
  const { data: skillCatalog = [] } = useSkillCatalog(skillSearchInput || undefined);
  const filteredCatalog = useMemo(() =>
    skillCatalog
      .filter(s => !categoryFilter || s.category === categoryFilter)
      .filter(s => !selectedSkills.find(sel => sel.id === s.id))
  , [skillCatalog, categoryFilter, selectedSkills]);

  const hasActiveFilters = selectedSkills.length > 0 || !!employeeSearch || !!categoryFilter || !!minLevel;

  const assignableParams = useMemo(() => {
    const p = new URLSearchParams();
    if (employeeSearch) p.set('name', employeeSearch);
    selectedSkills.forEach(s => p.append('skills', s.id));
    if (selectedSkills.length > 0) p.set('skill_match', matchMode);
    if (minLevel) p.set('min_level', minLevel);
    if (categoryFilter) p.set('category', categoryFilter);
    return p.toString();
  }, [employeeSearch, selectedSkills, matchMode, minLevel, categoryFilter]);

  const { data: assignableEmployees = [], isFetching: fetchingAssignable } = useQuery<AssignableEmployee[]>({
    queryKey: ['assignable-employees', projectId, assignableParams],
    queryFn: () => api.get<AssignableEmployee[]>(`/projects/${projectId}/assignable-employees?${assignableParams}`),
    enabled: hasActiveFilters,
  });

  // Check required skills
  const { data: requiredSkills = [] } = useQuery<ProjectRequiredSkill[]>({
    queryKey: ['required-skills', projectId],
    queryFn: () => api.get<ProjectRequiredSkill[]>(`/projects/${projectId}/required-skills`),
  });

  // Close dropdowns on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (skillDropdownRef.current && !skillDropdownRef.current.contains(e.target as Node)) setSkillDropdownOpen(false);
      if (empDropdownRef.current && !empDropdownRef.current.contains(e.target as Node)) setEmpDropdownOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const assignedIds = new Set(assignments.map(a => a.user_id));

  const handleAssign = async (emp: AssignableEmployee) => {
    if (emp.already_assigned) return;
    try {
      // Auto-suggest role: find a project role whose name partially matches the suggestion
      let roleId: string | undefined;
      if (emp.suggested_role && roles.length > 0) {
        const suggestion = emp.suggested_role.toLowerCase();
        const match = roles.find(r =>
          r.name.toLowerCase().includes(suggestion.split(' ')[0]) ||
          suggestion.includes(r.name.toLowerCase().split(' ')[0])
        );
        roleId = match?.id;
      }
      await api.post('/employee-projects', {
        user_id: emp.id,
        project_id: projectId,
        ...(roleId ? { role_id: roleId } : {}),
      });
      queryClient.invalidateQueries({ queryKey: ['project-assignments', projectId] });
      queryClient.invalidateQueries({ queryKey: ['assigned-projects'] });
      queryClient.invalidateQueries({ queryKey: ['skill-coverage', projectId] });
      const msg = roleId
        ? `${emp.name} assigned${roles.find(r => r.id === roleId) ? ` as ${roles.find(r => r.id === roleId)!.name}` : ''}.`
        : `${emp.name} assigned.`;
      toast.success(msg);
      setEmployeeSearch('');
      setEmpDropdownOpen(false);
    } catch { toast.error('Something went wrong.'); }
  };

  const handleUnassign = async (assignmentId: string) => {
    try {
      await api.delete(`/employee-projects/${assignmentId}`);
      queryClient.invalidateQueries({ queryKey: ['project-assignments', projectId] });
      queryClient.invalidateQueries({ queryKey: ['assigned-projects'] });
      queryClient.invalidateQueries({ queryKey: ['skill-coverage', projectId] });
      toast.success('Employee removed from project.');
    } catch { toast.error('Something went wrong.'); }
  };

  const handleChangeRole = async (assignmentId: string, roleId: string) => {
    try {
      await api.put(`/employee-projects/${assignmentId}`, { role_id: roleId === '__none__' ? null : roleId });
      queryClient.invalidateQueries({ queryKey: ['project-assignments', projectId] });
      toast.success('Role updated.');
    } catch { toast.error('Something went wrong.'); }
  };

  const clearFilters = () => {
    setSelectedSkills([]);
    setSkillSearchInput('');
    setCategoryFilter('');
    setMinLevel('');
    setMatchMode('all');
  };

  const matchColor = (score: number) =>
    score >= 80 ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200'
    : score >= 50 ? 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200'
    : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';

  // Employees shown in the search dropdown
  const dropdownEmployees: AssignableEmployee[] = hasActiveFilters
    ? assignableEmployees
    : [];

  if (isLoading) return <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-4">
      {/* Skill Gap Section */}
      {requiredSkills.length > 0 && (
        <SkillGapSection projectId={projectId} onManageSkills={() => setManageOpen(true)} />
      )}

      {/* ── Add Employee ── */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>Add employee</Label>
          {requiredSkills.length === 0 && (
            <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 text-muted-foreground" onClick={() => setManageOpen(true)}>
              <Plus className="h-3 w-3" /> Define required skills
            </Button>
          )}
        </div>

        {/* Name search */}
        <div className="relative max-w-sm" ref={empDropdownRef}>
          <Input
            value={employeeSearch}
            onChange={e => { setEmployeeSearch(e.target.value); setEmpDropdownOpen(true); }}
            onFocus={() => setEmpDropdownOpen(true)}
            placeholder="🔍 Search by name..."
            className="h-9"
          />
          {empDropdownOpen && (hasActiveFilters || employeeSearch) && (
            <div className="absolute z-50 mt-1 w-full min-w-[320px] rounded-md border bg-popover shadow-md max-h-64 overflow-y-auto">
              {fetchingAssignable && (
                <div className="flex items-center justify-center py-3 gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Searching...
                </div>
              )}
              {!fetchingAssignable && dropdownEmployees.length === 0 && hasActiveFilters && (
                <p className="px-3 py-4 text-sm text-muted-foreground text-center">
                  No employees found with these skills. Try relaxing the filters.
                </p>
              )}
              {!fetchingAssignable && dropdownEmployees.length === 0 && !hasActiveFilters && (
                <p className="px-3 py-4 text-sm text-muted-foreground text-center">
                  Type a name or apply skill filters to search.
                </p>
              )}
              {dropdownEmployees.map(emp => (
                <button
                  key={emp.id}
                  type="button"
                  disabled={emp.already_assigned}
                  className={`flex w-full flex-col px-3 py-2.5 text-sm text-left gap-1 border-b last:border-0 transition-colors
                    ${emp.already_assigned
                      ? 'opacity-50 cursor-not-allowed bg-muted/30'
                      : 'hover:bg-accent cursor-pointer'}`}
                  onClick={() => handleAssign(emp)}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{emp.name}</span>
                      {emp.title && <span className="text-xs text-muted-foreground">{emp.title}</span>}
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {emp.already_assigned && (
                        <Badge variant="secondary" className="text-xs">Already assigned</Badge>
                      )}
                      {selectedSkills.length > 0 && !emp.already_assigned && (
                        <span className={`text-xs font-semibold rounded-full px-2 py-0.5 ${matchColor(emp.match_score)}`}>
                          {emp.match_score}% match
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Skill chips */}
                  {selectedSkills.length > 0 && emp.matched_skills.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-0.5">
                      {emp.matched_skills.map(s => {
                        const sk = emp.skills.find(sk => sk.name === s);
                        return (
                          <span key={s} className="inline-flex items-center gap-1 text-xs bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 rounded px-1.5 py-0.5">
                            {s} {sk && <ProficiencyStars level={sk.level} />}
                          </span>
                        );
                      })}
                      {emp.missing_skills.map(s => (
                        <span key={s} className="text-xs bg-red-50 dark:bg-red-950 text-red-600 dark:text-red-400 rounded px-1.5 py-0.5">
                          {s} missing
                        </span>
                      ))}
                    </div>
                  )}

                  {/* No skills note */}
                  {emp.skills.length === 0 && (
                    <span className="text-xs text-muted-foreground">No skills on profile</span>
                  )}

                  {/* Role suggestion */}
                  {emp.suggested_role && !emp.already_assigned && (
                    <span className="text-xs text-primary">Suggested role: {emp.suggested_role}</span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Skill filter row */}
        <div className="flex flex-wrap items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground shrink-0" />

          {/* Skill multi-select */}
          <div className="relative" ref={skillDropdownRef}>
            <button
              type="button"
              className="flex items-center gap-1.5 h-8 px-3 rounded-md border text-sm bg-background hover:bg-accent transition-colors"
              onClick={() => setSkillDropdownOpen(v => !v)}
            >
              🛠 Filter by skill
              <span className="text-muted-foreground">▾</span>
            </button>
            {skillDropdownOpen && (
              <div className="absolute z-50 mt-1 w-64 rounded-md border bg-popover shadow-md">
                <div className="p-2 border-b">
                  <Input
                    autoFocus
                    value={skillSearchInput}
                    onChange={e => setSkillSearchInput(e.target.value)}
                    placeholder="Search skills..."
                    className="h-7 text-sm"
                  />
                </div>
                <div className="max-h-48 overflow-y-auto">
                  {filteredCatalog.length === 0 ? (
                    <p className="px-3 py-3 text-sm text-muted-foreground text-center">No skills found</p>
                  ) : (
                    filteredCatalog.slice(0, 12).map(s => (
                      <button
                        key={s.id}
                        type="button"
                        className="flex w-full items-center justify-between px-3 py-1.5 text-sm hover:bg-accent text-left"
                        onClick={() => {
                          setSelectedSkills(prev => [...prev, { id: s.id, name: s.name }]);
                          setSkillDropdownOpen(false);
                          setSkillSearchInput('');
                        }}
                      >
                        <span>{s.name}</span>
                        <span className="text-xs text-muted-foreground">{s.category}</span>
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Category filter */}
          <Select value={categoryFilter || '_all'} onValueChange={v => setCategoryFilter(v === '_all' ? '' : v)}>
            <SelectTrigger className="h-8 w-36 text-sm">
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="_all">All categories</SelectItem>
              {SKILL_CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>

          {/* Min level filter */}
          <Select value={minLevel || '_any'} onValueChange={v => setMinLevel(v === '_any' ? '' : v)}>
            <SelectTrigger className="h-8 w-36 text-sm">
              <SelectValue placeholder="Min. Level" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="_any">Any level</SelectItem>
              {MIN_LEVEL_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>

          {/* AND/OR toggle — only when 2+ skills selected */}
          {selectedSkills.length > 1 && (
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs gap-1"
              onClick={() => setMatchMode(v => v === 'all' ? 'any' : 'all')}
            >
              Match: <strong>{matchMode === 'all' ? 'All skills' : 'Any skill'}</strong>
            </Button>
          )}

          {/* Clear filters */}
          {hasActiveFilters && (
            <Button variant="ghost" size="sm" className="h-8 text-xs gap-1" onClick={clearFilters}>
              <X className="h-3 w-3" /> Clear filters
            </Button>
          )}
        </div>

        {/* Selected skill chips */}
        {selectedSkills.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {selectedSkills.map(s => (
              <Badge key={s.id} variant="secondary" className="gap-1 pl-2 pr-1">
                {s.name}
                <button
                  type="button"
                  className="ml-0.5 rounded hover:bg-muted"
                  onClick={() => setSelectedSkills(prev => prev.filter(x => x.id !== s.id))}
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
        )}
      </div>

      {/* ── Assignments table ── */}
      {assignments.length === 0 ? (
        <p className="text-sm text-muted-foreground py-6 text-center">No employees assigned yet.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Employee</TableHead>
              <TableHead>Role</TableHead>
              <TableHead className="text-right w-16">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {assignments.map(a => (
              <TableRow key={a.id}>
                <TableCell className="font-medium">{a.employee_name}</TableCell>
                <TableCell>
                  <Select value={a.role_id || '__none__'} onValueChange={v => handleChangeRole(a.id, v)}>
                    <SelectTrigger className="w-52 h-8">
                      <SelectValue placeholder="Select role" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">No role</SelectItem>
                      {roles.map(role => (
                        <SelectItem key={role.id} value={role.id}>
                          {role.name} — ${Number(role.hourly_rate_usd)}/h
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleUnassign(a.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {/* Manage required skills dialog */}
      <ManageRequiredSkillsDialog projectId={projectId} open={manageOpen} onClose={() => setManageOpen(false)} />
    </div>
  );
}
