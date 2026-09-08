import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { CalendarRange, Loader2, Plus, Pencil, Trash2, Search, Users2, AlertTriangle } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useEmployees } from '@/hooks/useEmployees';
import { useActiveProjects } from '@/hooks/useProjects';
import { useProjectRoles, useAllProjectRoles } from '@/hooks/useProjectRoles';
import { useStaffing, useCreateAssignment, useUpdateAssignment, useDeleteAssignment } from '@/hooks/useAssignedProjects';
import { StaffingAssignment } from '@/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';

const DEFAULT_MAX_WEEKLY_HOURS = 40;

type AssignForm = {
  employeeId: string;
  projectId: string;
  roleId: string;
  // Hours per week on THIS project — the allocation % sent to the backend is
  // derived from this against the employee's own max_weekly_hours (set on
  // their profile), so nobody has to compute the percentage by hand.
  hoursPerWeek: string;
  // This assignment's own window — never affects the project.
  startDate: string;
  endDate: string;
  // Separate, explicit opt-in to change the project's own date range.
  editProjectDates: boolean;
  projectStartDate: string;
  projectEndDate: string;
};

const EMPTY_FORM: AssignForm = {
  employeeId: '', projectId: '', roleId: '', hoursPerWeek: '',
  startDate: '', endDate: '',
  editProjectDates: false, projectStartDate: '', projectEndDate: '',
};

export default function StaffingPage() {
  // Staffing is visible to everyone (read-only for Employees). Inline edits
  // to Role/Hours/Window are Admin + Manager; creating/deleting an
  // assignment (and the full dialog, incl. changing the project's own
  // dates) stays Admin-only, matching the backend's POST/DELETE guards.
  const { isAdmin, canManage } = useAuth();
  const { data: employees = [], isLoading: employeesLoading } = useEmployees();
  const { data: allActiveProjects = [], isLoading: projectsLoading } = useActiveProjects();
  const { data: staffing = [], isLoading: staffingLoading } = useStaffing();
  const { data: allProjectRoles = [] } = useAllProjectRoles();

  // Internal projects ARE selectable — staffing someone on one directly (with
  // an allocation %) is how internal/non-billable workload counts toward
  // their utilization in Reports. It's opt-in per assignment, not automatic.
  const projects = allActiveProjects;

  const createAssignment = useCreateAssignment();
  const updateAssignment = useUpdateAssignment();
  const deleteAssignment = useDeleteAssignment();

  const [search, setSearch] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<AssignForm>(EMPTY_FORM);
  const [isSaving, setIsSaving] = useState(false);

  const { data: projectRoles = [] } = useProjectRoles(form.projectId || undefined);

  const activeEmployees = useMemo(() => employees.filter(e => e.is_active), [employees]);
  const employeeById = useMemo(() => new Map(employees.map(e => [e.id, e])), [employees]);

  const rolesByProject = useMemo(() => {
    const map = new Map<string, typeof allProjectRoles>();
    allProjectRoles.forEach(r => {
      if (!map.has(r.project_id)) map.set(r.project_id, []);
      map.get(r.project_id)!.push(r);
    });
    return map;
  }, [allProjectRoles]);

  const projectById = useMemo(() => new Map(projects.map(p => [p.id, p])), [projects]);
  const selectedProject = form.projectId ? projectById.get(form.projectId) : undefined;

  // ── Inline editing (Role / Hours / Window) ──────────────────────────────
  // Local drafts only exist while a field is actively being typed in — once
  // committed (or left unchanged), the row falls back to reading straight
  // from server data again, so a refetch after another edit can't clobber
  // an in-progress edit on a different row.
  const [hoursDrafts, setHoursDrafts] = useState<Record<string, string>>({});
  const [dateDrafts, setDateDrafts] = useState<Record<string, { start: string; end: string }>>({});

  function maxHoursFor(row: StaffingAssignment): number {
    return Number(employeeById.get(row.user_id)?.max_weekly_hours ?? DEFAULT_MAX_WEEKLY_HOURS);
  }

  function hoursValueFor(row: StaffingAssignment): string {
    if (hoursDrafts[row.id] !== undefined) return hoursDrafts[row.id];
    const maxHours = maxHoursFor(row);
    return row.allocation_percentage != null
      ? ((row.allocation_percentage / 100) * maxHours).toFixed(1).replace(/\.0$/, '')
      : '';
  }

  function dateValuesFor(row: StaffingAssignment): { start: string; end: string } {
    return dateDrafts[row.id] ?? { start: row.start_date || '', end: row.end_date || '' };
  }

  async function commitRole(row: StaffingAssignment, roleId: string) {
    const newRoleId = roleId === '_none' ? null : roleId;
    if (newRoleId === (row.role_id || null)) return;
    try {
      await updateAssignment.mutateAsync({ id: row.id, role_id: newRoleId });
      toast.success('Role updated.');
    } catch {
      toast.error('Failed to update role.');
    }
  }

  async function commitHours(row: StaffingAssignment) {
    if (hoursDrafts[row.id] === undefined) return;
    const raw = hoursDrafts[row.id];
    const maxHours = maxHoursFor(row);
    const hoursNum = raw === '' ? null : parseFloat(raw);
    if (hoursNum != null && (isNaN(hoursNum) || hoursNum < 0 || hoursNum > maxHours)) {
      toast.error(`Hours must be between 0 and ${maxHours} (this person's max weekly hours).`);
      setHoursDrafts(d => { const n = { ...d }; delete n[row.id]; return n; });
      return;
    }
    const allocationNum = hoursNum != null ? Math.round((hoursNum / maxHours) * 1000) / 10 : null;
    if (allocationNum === (row.allocation_percentage ?? null)) {
      setHoursDrafts(d => { const n = { ...d }; delete n[row.id]; return n; });
      return;
    }
    try {
      await updateAssignment.mutateAsync({ id: row.id, allocation_percentage: allocationNum });
      toast.success('Hours updated.');
    } catch {
      toast.error('Failed to update hours.');
    } finally {
      setHoursDrafts(d => { const n = { ...d }; delete n[row.id]; return n; });
    }
  }

  async function commitWindow(row: StaffingAssignment) {
    const draft = dateDrafts[row.id];
    if (!draft) return;
    const newStart = draft.start || null;
    const newEnd = draft.end || null;
    if (newStart === (row.start_date || null) && newEnd === (row.end_date || null)) {
      setDateDrafts(d => { const n = { ...d }; delete n[row.id]; return n; });
      return;
    }
    try {
      await updateAssignment.mutateAsync({ id: row.id, start_date: newStart, end_date: newEnd });
      toast.success('Window updated.');
    } catch {
      toast.error('Failed to update window.');
    } finally {
      setDateDrafts(d => { const n = { ...d }; delete n[row.id]; return n; });
    }
  }

  // Capacity baseline for whoever is selected in the dialog — the hours
  // input is converted against THIS number, not a fixed 40, since it comes
  // from the employee's own profile.
  const selectedMaxWeeklyHours = form.employeeId
    ? Number(employeeById.get(form.employeeId)?.max_weekly_hours ?? DEFAULT_MAX_WEEKLY_HOURS)
    : DEFAULT_MAX_WEEKLY_HOURS;
  const hoursPreviewPct = form.hoursPerWeek && selectedMaxWeeklyHours > 0
    ? (parseFloat(form.hoursPerWeek) / selectedMaxWeeklyHours) * 100
    : null;

  const grouped = useMemo(() => {
    const map = new Map<string, { employeeName: string; rows: StaffingAssignment[] }>();
    staffing.forEach(row => {
      if (!map.get(row.user_id)) {
        map.set(row.user_id, { employeeName: row.employee_name, rows: [] });
      }
      map.get(row.user_id)!.rows.push(row);
    });
    let entries = Array.from(map.entries()).map(([userId, v]) => ({ userId, ...v }));
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      entries = entries.filter(e => e.employeeName.toLowerCase().includes(q));
    }
    return entries.sort((a, b) => a.employeeName.localeCompare(b.employeeName));
  }, [staffing, search]);

  function openAdd() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setIsDialogOpen(true);
  }

  function openAddFor(userId: string) {
    setEditingId(null);
    setForm({ ...EMPTY_FORM, employeeId: userId });
    setIsDialogOpen(true);
  }

  function openEdit(row: StaffingAssignment) {
    setEditingId(row.id);
    // Convert the stored allocation % back to hours against THIS person's
    // own capacity, so the dialog shows what was actually entered rather
    // than a raw percentage.
    const maxHours = Number(employeeById.get(row.user_id)?.max_weekly_hours ?? DEFAULT_MAX_WEEKLY_HOURS);
    const hours = row.allocation_percentage != null
      ? ((row.allocation_percentage / 100) * maxHours).toFixed(1).replace(/\.0$/, '')
      : '';
    setForm({
      employeeId: row.user_id,
      projectId: row.project_id,
      roleId: row.role_id || '',
      hoursPerWeek: hours,
      startDate: row.start_date || '',
      endDate: row.end_date || '',
      editProjectDates: false,
      projectStartDate: row.project_start_date || '',
      projectEndDate: row.project_end_date || '',
    });
    setIsDialogOpen(true);
  }

  // Prefills the "project dates" section (used only if the user opts into
  // editing the project's own range) from the selected project's current
  // dates — the assignment's own window is separate and starts blank.
  function handleProjectChange(projectId: string) {
    const project = projectById.get(projectId);
    setForm(f => ({
      ...f,
      projectId,
      roleId: '',
      projectStartDate: project?.start_date || '',
      projectEndDate: project?.end_date || '',
    }));
  }

  async function handleSave() {
    if (!form.employeeId) { toast.error('Select a person.'); return; }
    if (!form.projectId) { toast.error('Select a project.'); return; }
    const hoursNum = form.hoursPerWeek ? parseFloat(form.hoursPerWeek) : null;
    if (hoursNum != null && (hoursNum < 0 || hoursNum > selectedMaxWeeklyHours)) {
      toast.error(`Hours must be between 0 and ${selectedMaxWeeklyHours} (this person's max weekly hours).`);
      return;
    }
    // Derived from hours against the employee's own capacity — never entered
    // directly — so it always reflects what's set on their profile.
    const allocationNum = hoursNum != null
      ? Math.round((hoursNum / selectedMaxWeeklyHours) * 1000) / 10
      : null;
    setIsSaving(true);
    try {
      const payload = {
        role_id: form.roleId || null,
        allocation_percentage: allocationNum,
        start_date: form.startDate || null,
        end_date: form.endDate || null,
        ...(form.editProjectDates ? {
          project_start_date: form.projectStartDate || null,
          project_end_date: form.projectEndDate || null,
        } : {}),
      };
      if (editingId) {
        await updateAssignment.mutateAsync({ id: editingId, ...payload });
        toast.success('Assignment updated.');
      } else {
        await createAssignment.mutateAsync({
          user_id: form.employeeId,
          project_id: form.projectId,
          ...payload,
        });
        toast.success('Assigned — they can now log time against this project.');
      }
      setIsDialogOpen(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      toast.error(msg.includes('409') || msg.toLowerCase().includes('already')
        ? 'This person is already assigned to that project.'
        : 'Something went wrong.');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete(row: StaffingAssignment) {
    if (!confirm(`Remove ${row.employee_name} from ${row.project_name}? They'll no longer be able to log time against it.`)) return;
    try {
      await deleteAssignment.mutateAsync(row.id);
      toast.success('Unassigned.');
    } catch {
      toast.error('Something went wrong.');
    }
  }

  const isLoading = employeesLoading || projectsLoading || staffingLoading;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Users2 className="h-6 w-6 text-primary" /> Staffing
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            {canManage
              ? 'Assign people to projects and set how much of their time each takes. Edit Role, Hours, and Window directly in the table — click a project to add a new assignment or change its own dates.'
              : "Who's staffed on which project, and how much of their time it takes. Ask an Admin or Manager to make changes here."}
          </p>
        </div>
        {isAdmin && (
          <Button className="gap-2" onClick={openAdd}>
            <Plus className="h-4 w-4" /> New Assignment
          </Button>
        )}
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Search by person…" value={search} onChange={e => setSearch(e.target.value)} className="pl-10" />
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : grouped.length === 0 ? (
        <Card className="card-elevated">
          <CardContent className="py-16 text-center text-muted-foreground">
            <Users2 className="h-10 w-10 mx-auto mb-3 opacity-40" />
            {search ? 'No matching person.' : 'No project assignments yet.'}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {grouped.map(group => {
            const totalAllocation = group.rows.reduce((sum, r) => sum + (r.allocation_percentage ?? 0), 0);
            const hasAnyAllocation = group.rows.some(r => r.allocation_percentage != null);
            const overAllocated = hasAnyAllocation && totalAllocation > 100;
            return (
              <Card key={group.userId} className="card-elevated">
                <CardHeader className="flex flex-row items-center justify-between pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    {group.employeeName}
                    {hasAnyAllocation && (
                      <Badge variant={overAllocated ? 'destructive' : 'secondary'} className="text-xs font-normal gap-1">
                        {overAllocated && <AlertTriangle className="h-3 w-3" />}
                        {totalAllocation}% allocated
                      </Badge>
                    )}
                  </CardTitle>
                  {isAdmin && (
                    <Button size="sm" variant="outline" className="gap-1.5" onClick={() => openAddFor(group.userId)}>
                      <Plus className="h-3.5 w-3.5" /> Add Project
                    </Button>
                  )}
                </CardHeader>
                <CardContent>
                  <Table className="table-fixed">
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[22%]">Project</TableHead>
                        <TableHead className="w-[22%]">Client</TableHead>
                        <TableHead className="w-[16%]">Role</TableHead>
                        <TableHead className="w-[12%] text-right">Hours/wk</TableHead>
                        <TableHead className="w-[20%]">Window</TableHead>
                        <TableHead className="w-24 text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {group.rows.map(row => (
                        <TableRow key={row.id}>
                          <TableCell className="font-medium break-words">
                            {row.project_name}
                            {row.project_is_internal && <Badge variant="secondary" className="ml-2 text-xs">Internal</Badge>}
                            {!row.project_is_active && <Badge variant="outline" className="ml-2 text-xs">Inactive</Badge>}
                          </TableCell>
                          <TableCell className="text-muted-foreground break-words">{row.client_name}</TableCell>

                          {/* Role — inline Select for Admin/Manager, plain text otherwise */}
                          <TableCell className="break-words">
                            {canManage ? (
                              <Select
                                value={row.role_id || '_none'}
                                onValueChange={v => commitRole(row, v)}
                              >
                                <SelectTrigger className="h-8 text-sm">
                                  <SelectValue placeholder="No role" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="_none">No role</SelectItem>
                                  {(rolesByProject.get(row.project_id) ?? []).map(r => (
                                    <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            ) : (
                              row.role_name || <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>

                          {/* Hours/wk — inline Input for Admin/Manager, plain text otherwise */}
                          <TableCell className="text-right">
                            {canManage ? (
                              <Input
                                type="number" min="0" max={maxHoursFor(row)} step="1"
                                className="h-8 text-sm text-right"
                                value={hoursValueFor(row)}
                                onFocus={e => e.target.select()}
                                onChange={e => setHoursDrafts(d => ({ ...d, [row.id]: e.target.value }))}
                                onBlur={() => commitHours(row)}
                              />
                            ) : row.allocation_percentage != null ? (
                              <span>
                                {((row.allocation_percentage / 100) * maxHoursFor(row)).toFixed(1)}h
                                <span className="text-muted-foreground text-xs ml-1">({row.allocation_percentage}%)</span>
                              </span>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>

                          {/* Window — inline date pair for Admin/Manager, plain text otherwise */}
                          <TableCell className="text-sm text-muted-foreground">
                            {canManage ? (
                              <div className="flex items-center gap-1">
                                <Input
                                  type="date"
                                  className="h-8 text-xs px-1.5"
                                  value={dateValuesFor(row).start}
                                  onChange={e => setDateDrafts(d => ({ ...d, [row.id]: { ...dateValuesFor(row), start: e.target.value } }))}
                                  onBlur={() => commitWindow(row)}
                                />
                                <span>→</span>
                                <Input
                                  type="date"
                                  className="h-8 text-xs px-1.5"
                                  value={dateValuesFor(row).end}
                                  onChange={e => setDateDrafts(d => ({ ...d, [row.id]: { ...dateValuesFor(row), end: e.target.value } }))}
                                  onBlur={() => commitWindow(row)}
                                />
                              </div>
                            ) : row.start_date || row.end_date ? (
                              <span className="inline-flex items-center gap-1">
                                <CalendarRange className="h-3.5 w-3.5 shrink-0" />
                                {row.start_date || '—'} → {row.end_date || '—'}
                              </span>
                            ) : (
                              <span className="text-muted-foreground/70">Full project</span>
                            )}
                          </TableCell>

                          <TableCell className="text-right">
                            {isAdmin && (
                              <div className="flex gap-1 justify-end">
                                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(row)} title="Full edit (incl. project dates)">
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleDelete(row)}>
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Edit Assignment' : 'New Assignment'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Person</Label>
              <Select value={form.employeeId} onValueChange={v => setForm(f => ({ ...f, employeeId: v }))} disabled={!!editingId}>
                <SelectTrigger><SelectValue placeholder="Select a person" /></SelectTrigger>
                <SelectContent>
                  {activeEmployees.map(e => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Project</Label>
              <Select value={form.projectId} onValueChange={handleProjectChange} disabled={!!editingId}>
                <SelectTrigger><SelectValue placeholder="Select a project" /></SelectTrigger>
                <SelectContent>
                  {projects.map(p => <SelectItem key={p.id} value={p.id}>{p.name}{p.is_internal ? ' (Internal)' : ''}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Role</Label>
              <Select value={form.roleId || '_none'} onValueChange={v => setForm(f => ({ ...f, roleId: v === '_none' ? '' : v }))} disabled={!form.projectId}>
                <SelectTrigger><SelectValue placeholder="No role" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">No role</SelectItem>
                  {projectRoles.map(r => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Hours per week on this project</Label>
              <Input
                type="number" min="0" max={selectedMaxWeeklyHours} step="1"
                value={form.hoursPerWeek}
                onChange={e => setForm(f => ({ ...f, hoursPerWeek: e.target.value }))}
                placeholder="e.g. 20"
              />
              <p className="text-xs text-muted-foreground">
                {form.employeeId
                  ? `Based on their ${selectedMaxWeeklyHours}h/week capacity (set on their profile).`
                  : `Based on a ${selectedMaxWeeklyHours}h/week default — select a person to use their own capacity.`}
                {hoursPreviewPct != null && (
                  <span className="ml-1 font-medium text-foreground">≈ {hoursPreviewPct.toFixed(1)}% allocated.</span>
                )}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Staffed from</Label>
                <Input type="date" value={form.startDate} onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Staffed until</Label>
                <Input type="date" value={form.endDate} onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))} />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Optional — limits when this person is staffed on the project, without touching the project's own dates.
              {selectedProject?.start_date || selectedProject?.end_date
                ? ` Project runs ${selectedProject?.start_date || '—'} → ${selectedProject?.end_date || '—'}.`
                : ''}
            </p>

            <div className="rounded-md border p-3 space-y-3">
              <label className={`flex items-center gap-2 text-sm ${form.projectId ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'}`}>
                <Checkbox
                  checked={form.editProjectDates}
                  onCheckedChange={v => setForm(f => ({ ...f, editProjectDates: !!v }))}
                  disabled={!form.projectId}
                />
                Also change the project's own date range
              </label>
              {form.editProjectDates && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">Project start</Label>
                      <Input type="date" value={form.projectStartDate} onChange={e => setForm(f => ({ ...f, projectStartDate: e.target.value }))} />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">Project end</Label>
                      <Input type="date" value={form.projectEndDate} onChange={e => setForm(f => ({ ...f, projectEndDate: e.target.value }))} />
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Updates the project itself — invoicing, reports, everything stays in sync.
                  </p>
                </>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
              {editingId ? 'Save' : 'Assign'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
