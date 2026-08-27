import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { CalendarRange, Loader2, Plus, Pencil, Trash2, Search, Users2, AlertTriangle } from 'lucide-react';
import { useEmployees } from '@/hooks/useEmployees';
import { useActiveProjects } from '@/hooks/useProjects';
import { useProjectRoles } from '@/hooks/useProjectRoles';
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

type AssignForm = {
  employeeId: string;
  projectId: string;
  roleId: string;
  allocation: string;
  startDate: string;
  endDate: string;
};

const EMPTY_FORM: AssignForm = { employeeId: '', projectId: '', roleId: '', allocation: '', startDate: '', endDate: '' };

export default function StaffingPage() {
  const { data: employees = [], isLoading: employeesLoading } = useEmployees();
  const { data: allActiveProjects = [], isLoading: projectsLoading } = useActiveProjects();
  const { data: staffing = [], isLoading: staffingLoading } = useStaffing();

  // This panel is for client staffing only — internal projects don't apply.
  const projects = useMemo(() => allActiveProjects.filter(p => !p.is_internal), [allActiveProjects]);

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

  const projectById = useMemo(() => new Map(projects.map(p => [p.id, p])), [projects]);

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
    setForm({
      employeeId: row.user_id,
      projectId: row.project_id,
      roleId: row.role_id || '',
      allocation: row.allocation_percentage != null ? String(row.allocation_percentage) : '',
      startDate: row.project_start_date || '',
      endDate: row.project_end_date || '',
    });
    setIsDialogOpen(true);
  }

  // Auto-fill the time window from the selected project's own dates —
  // editable, but this is where "already exists → auto-assign the window"
  // happens. Only fills blanks so it never clobbers something the user typed.
  function handleProjectChange(projectId: string) {
    const project = projectById.get(projectId);
    setForm(f => ({
      ...f,
      projectId,
      roleId: '',
      startDate: f.startDate || project?.start_date || '',
      endDate: f.endDate || project?.end_date || '',
    }));
  }

  async function handleSave() {
    if (!form.employeeId) { toast.error('Select a person.'); return; }
    if (!form.projectId) { toast.error('Select a project.'); return; }
    const allocationNum = form.allocation ? parseFloat(form.allocation) : null;
    if (allocationNum != null && (allocationNum < 0 || allocationNum > 100)) {
      toast.error('Allocation must be between 0 and 100.');
      return;
    }
    setIsSaving(true);
    try {
      const payload = {
        role_id: form.roleId || null,
        allocation_percentage: allocationNum,
        project_start_date: form.startDate || null,
        project_end_date: form.endDate || null,
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
            Assign people to projects, set how much of their time each takes, and the project's time window.
            Assigning someone here lets them start logging hours against that project in Weekly Log.
          </p>
        </div>
        <Button className="gap-2" onClick={openAdd}>
          <Plus className="h-4 w-4" /> New Assignment
        </Button>
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
                  <Button size="sm" variant="outline" className="gap-1.5" onClick={() => openAddFor(group.userId)}>
                    <Plus className="h-3.5 w-3.5" /> Add Project
                  </Button>
                </CardHeader>
                <CardContent>
                  <Table className="table-fixed">
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[22%]">Project</TableHead>
                        <TableHead className="w-[22%]">Client</TableHead>
                        <TableHead className="w-[16%]">Role</TableHead>
                        <TableHead className="w-[10%] text-right">Allocation</TableHead>
                        <TableHead className="w-[20%]">Window</TableHead>
                        <TableHead className="w-24 text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {group.rows.map(row => (
                        <TableRow key={row.id}>
                          <TableCell className="font-medium break-words">
                            {row.project_name}
                            {!row.project_is_active && <Badge variant="outline" className="ml-2 text-xs">Inactive</Badge>}
                          </TableCell>
                          <TableCell className="text-muted-foreground break-words">{row.client_name}</TableCell>
                          <TableCell className="break-words">{row.role_name || <span className="text-muted-foreground">—</span>}</TableCell>
                          <TableCell className="text-right">
                            {row.allocation_percentage != null ? `${row.allocation_percentage}%` : <span className="text-muted-foreground">—</span>}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            <span className="inline-flex items-center gap-1">
                              <CalendarRange className="h-3.5 w-3.5 shrink-0" />
                              {row.project_start_date || '—'} → {row.project_end_date || '—'}
                            </span>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex gap-1 justify-end">
                              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(row)}>
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleDelete(row)}>
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
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
                  {projects.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
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
              <Label>Allocation (% of their time)</Label>
              <Input
                type="number" min="0" max="100" step="5"
                value={form.allocation}
                onChange={e => setForm(f => ({ ...f, allocation: e.target.value }))}
                placeholder="e.g. 50"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Start date</Label>
                <Input type="date" value={form.startDate} onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>End date</Label>
                <Input type="date" value={form.endDate} onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))} />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Prefilled from the project when it already has dates. Changing it here updates the project's dates everywhere — invoicing, reports, everything stays in sync.
            </p>
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
