import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { ClipboardCheck, Plus, Search, Loader2, Download, Trash2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import {
  usePerformanceReviews, useCreatePerformanceReview, useDeletePerformanceReview,
  useReviewLoggedHours, downloadReviewXlsx, REVIEW_STATUS_BADGE,
} from '@/hooks/usePerformanceReviews';
import { useActiveProjects, useProjectAssignments } from '@/hooks/useProjects';
import { useEmployees } from '@/hooks/useEmployees';
import { PerformanceReview, PerformanceReviewStatus } from '@/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { SearchableCombobox } from '@/components/ui/SearchableCombobox';

function formatDate(iso: string): string {
  return format(new Date(`${iso}T00:00:00`), 'MMM d, yyyy');
}

type NewReviewForm = {
  projectId: string | null;
  employeeId: string | null;
  reviewerId: string | null;
  reviewDate: string;
  periodStart: string;
  periodEnd: string;
  durationHours: string;
};

const todayIso = () => format(new Date(), 'yyyy-MM-dd');

function NewReviewDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const navigate = useNavigate();
  const { data: projects = [] } = useActiveProjects();
  const { data: employees = [] } = useEmployees();
  const createReview = useCreatePerformanceReview();
  const [form, setForm] = useState<NewReviewForm>({
    projectId: null, employeeId: null, reviewerId: null, reviewDate: todayIso(), periodStart: '', periodEnd: '', durationHours: '',
  });
  const [hoursTouched, setHoursTouched] = useState(false);
  const { data: assignments = [] } = useProjectAssignments(form.projectId ?? undefined);
  const { data: logged } = useReviewLoggedHours({
    projectId: form.projectId ?? undefined,
    employeeId: form.employeeId ?? undefined,
    periodStart: form.periodStart || undefined,
    periodEnd: form.periodEnd || undefined,
    enabled: open,
  });

  useEffect(() => {
    if (open) {
      setForm({ projectId: null, employeeId: null, reviewerId: null, reviewDate: todayIso(), periodStart: '', periodEnd: '', durationHours: '' });
      setHoursTouched(false);
    }
  }, [open]);

  // Duration defaults to the hours actually logged, until the user overrides it.
  useEffect(() => {
    if (!hoursTouched && logged) setForm(f => ({ ...f, durationHours: String(logged.hours) }));
  }, [logged, hoursTouched]);

  const projectOptions = useMemo(
    () => projects.filter(p => !p.is_internal).map(p => ({ id: p.id, label: p.name, sublabel: p.project_code ?? undefined }))
      .sort((a, b) => a.label.localeCompare(b.label)),
    [projects],
  );
  const activeEmployees = useMemo(() => employees.filter(e => e.is_active).sort((a, b) => a.name.localeCompare(b.name)), [employees]);
  // People staffed on the project first; anyone else is still selectable.
  const employeeOptions = useMemo(() => {
    const assigned = new Set(assignments.map(a => a.user_id));
    return [...activeEmployees]
      .sort((a, b) => Number(assigned.has(b.id)) - Number(assigned.has(a.id)))
      .map(e => ({ id: e.id, label: e.name, sublabel: assigned.has(e.id) ? 'Assigned to project' : e.title ?? undefined }));
  }, [activeEmployees, assignments]);
  const reviewerOptions = useMemo(
    () => activeEmployees.filter(e => e.id !== form.employeeId).map(e => ({ id: e.id, label: e.name, sublabel: e.title ?? undefined })),
    [activeEmployees, form.employeeId],
  );

  function selectProject(projectId: string | null) {
    const project = projects.find(p => p.id === projectId);
    setForm(f => ({ ...f, projectId, employeeId: null, reviewerId: project?.manager_id ?? project?.owner_id ?? null }));
    setHoursTouched(false);
  }

  async function handleCreate() {
    if (!form.projectId || !form.employeeId) { toast.error('Pick a project and an employee.'); return; }
    if (form.periodStart && form.periodEnd && form.periodEnd < form.periodStart) { toast.error('Period end must be on or after the start.'); return; }
    const hours = form.durationHours === '' ? null : parseFloat(form.durationHours);
    if (hours !== null && (isNaN(hours) || hours < 0)) { toast.error('Enter a valid number of hours.'); return; }
    try {
      const review = await createReview.mutateAsync({
        project_id: form.projectId,
        employee_id: form.employeeId,
        reviewer_id: form.reviewerId,
        review_date: form.reviewDate,
        period_start: form.periodStart || null,
        period_end: form.periodEnd || null,
        duration_hours: hours,
      });
      toast.success('Review created — the employee was asked to complete their self-assessment.');
      onOpenChange(false);
      navigate(`/reviews/${review.id}`);
    } catch (e) {
      toast.error(e instanceof Error && e.message.includes('400') ? e.message.replace(/^API error \d+: /, '') : 'Failed to create review.');
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New Performance Review</DialogTitle>
          <DialogDescription>The employee completes the project details and self-assessment; the reviewer scores each criterion.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Project</Label>
            <SearchableCombobox options={projectOptions} value={form.projectId} onChange={selectProject} placeholder="Select a project..." />
          </div>
          <div className="space-y-1.5">
            <Label>Employee (review for)</Label>
            <SearchableCombobox
              options={employeeOptions}
              value={form.employeeId}
              onChange={id => { setForm(f => ({ ...f, employeeId: id, reviewerId: f.reviewerId === id ? null : f.reviewerId })); setHoursTouched(false); }}
              placeholder="Select an employee..."
              disabled={!form.projectId}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Reviewer</Label>
            <SearchableCombobox options={reviewerOptions} value={form.reviewerId} onChange={id => setForm(f => ({ ...f, reviewerId: id }))} placeholder="Defaults to the project manager" clearable />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Date of review</Label>
              <Input type="date" value={form.reviewDate} onChange={e => setForm(f => ({ ...f, reviewDate: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Duration (hours)</Label>
              <Input
                type="number" min="0" step="0.5" value={form.durationHours}
                onChange={e => { setHoursTouched(true); setForm(f => ({ ...f, durationHours: e.target.value })); }}
                placeholder="Logged hours"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Period start <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <Input type="date" value={form.periodStart} onChange={e => setForm(f => ({ ...f, periodStart: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Period end <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <Input type="date" value={form.periodEnd} onChange={e => setForm(f => ({ ...f, periodEnd: e.target.value }))} />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Duration is prefilled with the hours the employee logged on the project{form.periodStart || form.periodEnd ? ' within the period' : ''}.
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleCreate} disabled={createReview.isPending}>
            {createReview.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Create Review
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function PerformanceReviews() {
  const navigate = useNavigate();
  const { employee, hasEdit } = useAuth();
  const canManage = hasEdit('reviews');
  const { data: reviews = [], isLoading } = usePerformanceReviews();
  const deleteReview = useDeletePerformanceReview();
  const [statusFilter, setStatusFilter] = useState<'all' | PerformanceReviewStatus>('all');
  const [search, setSearch] = useState('');
  const [newOpen, setNewOpen] = useState(false);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return reviews.filter(r =>
      (statusFilter === 'all' || r.status === statusFilter) &&
      (!term || [r.employee_name, r.project_name, r.client_name, r.reviewer_name].some(v => v?.toLowerCase().includes(term))),
    );
  }, [reviews, statusFilter, search]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: reviews.length, self_assessment: 0, in_review: 0, completed: 0 };
    reviews.forEach(r => { c[r.status] += 1; });
    return c;
  }, [reviews]);

  async function handleDelete(review: PerformanceReview) {
    if (!confirm(`Delete the review for ${review.employee_name} on ${review.project_name}? This can't be undone.`)) return;
    try {
      await deleteReview.mutateAsync(review.id);
      toast.success('Review deleted.');
    } catch {
      toast.error('Failed to delete review.');
    }
  }

  async function handleExport(review: PerformanceReview) {
    try {
      await downloadReviewXlsx(review);
    } catch {
      toast.error('Failed to export review.');
    }
  }

  function roleOf(r: PerformanceReview): string | null {
    if (r.employee_id === employee?.id) return 'You (reviewee)';
    if (r.reviewer_id === employee?.id) return 'You (reviewer)';
    return null;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Performance Reviews</h1>
          <p className="text-muted-foreground">Project evaluations — self-assessment by the employee, scored by the reviewer</p>
        </div>
        {canManage && (
          <Button className="gap-2" onClick={() => setNewOpen(true)}>
            <Plus className="h-4 w-4" /> New Review
          </Button>
        )}
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <Tabs value={statusFilter} onValueChange={v => setStatusFilter(v as typeof statusFilter)}>
          <TabsList className="flex-wrap h-auto">
            <TabsTrigger value="all">All ({counts.all})</TabsTrigger>
            <TabsTrigger value="self_assessment">Self-assessment ({counts.self_assessment})</TabsTrigger>
            <TabsTrigger value="in_review">In review ({counts.in_review})</TabsTrigger>
            <TabsTrigger value="completed">Completed ({counts.completed})</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="relative w-full lg:max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search employee, project, client, reviewer..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10" />
        </div>
      </div>

      <Card className="card-elevated">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-12 text-muted-foreground">
              <ClipboardCheck className="h-8 w-8" />
              <p className="text-sm">{reviews.length === 0 ? 'No performance reviews yet.' : 'No reviews match these filters.'}</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee</TableHead>
                    <TableHead>Project</TableHead>
                    <TableHead>Reviewer</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-right">Hours</TableHead>
                    <TableHead className="text-center">Avg. score</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-24" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map(r => {
                    const badge = REVIEW_STATUS_BADGE[r.status];
                    const mine = roleOf(r);
                    const canExport = r.reviewer_section_visible;
                    return (
                      <TableRow key={r.id} className="cursor-pointer" onClick={() => navigate(`/reviews/${r.id}`)}>
                        <TableCell>
                          <div className="font-medium">{r.employee_name}</div>
                          {mine && <div className="text-xs text-primary">{mine}</div>}
                        </TableCell>
                        <TableCell>
                          <div>{r.project_name}</div>
                          {r.client_name && <div className="text-xs text-muted-foreground">{r.client_name}</div>}
                        </TableCell>
                        <TableCell>{r.reviewer_name ?? <span className="text-muted-foreground">—</span>}</TableCell>
                        <TableCell className="whitespace-nowrap">{formatDate(r.review_date)}</TableCell>
                        <TableCell className="text-right tabular-nums">{r.duration_hours != null ? r.duration_hours.toLocaleString() : '—'}</TableCell>
                        <TableCell className="text-center tabular-nums font-semibold">{r.overall_average != null ? r.overall_average.toFixed(2) : '—'}</TableCell>
                        <TableCell><Badge variant="outline" className={`border-0 ${badge.className}`}>{badge.label}</Badge></TableCell>
                        <TableCell onClick={e => e.stopPropagation()}>
                          <div className="flex justify-end gap-1">
                            {canExport && (
                              <Button variant="ghost" size="icon" title="Export to Excel" onClick={() => handleExport(r)}>
                                <Download className="h-4 w-4" />
                              </Button>
                            )}
                            {canManage && (
                              <Button variant="ghost" size="icon" title="Delete" onClick={() => handleDelete(r)}>
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {canManage && <NewReviewDialog open={newOpen} onOpenChange={setNewOpen} />}
    </div>
  );
}
