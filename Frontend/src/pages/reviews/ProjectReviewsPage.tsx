import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { ArrowLeft, Loader2, Send, Users, Info } from 'lucide-react';
import {
  useReviewProjects, useToggleProjectReviews, useProjectReviewTeam, useAssignSelfAssessments, REVIEW_STATUS_BADGE,
} from '@/hooks/usePerformanceReviews';
import { useEmployees } from '@/hooks/useEmployees';
import { ReviewTeamMember } from '@/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { SearchableCombobox } from '@/components/ui/SearchableCombobox';

const todayIso = () => format(new Date(), 'yyyy-MM-dd');
const formatDate = (iso: string) => format(new Date(`${iso}T00:00:00`), 'MMM d, yyyy');

/** An open review (not completed) blocks assigning another one on the same project. */
const openReviewOf = (m: ReviewTeamMember) => m.reviews.find(r => r.status !== 'completed');

function AssignDialog({ open, onOpenChange, projectId, managerName, members, onAssigned }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  managerName: string | null;
  members: ReviewTeamMember[];
  onAssigned: () => void;
}) {
  const { data: employees = [] } = useEmployees();
  const assign = useAssignSelfAssessments();
  const [reviewDate, setReviewDate] = useState(todayIso());
  const [reviewerId, setReviewerId] = useState<string | null>(null);
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');

  const reviewerOptions = useMemo(
    () => employees.filter(e => e.is_active).sort((a, b) => a.name.localeCompare(b.name))
      .map(e => ({ id: e.id, label: e.name, sublabel: e.title ?? undefined })),
    [employees],
  );

  async function handleAssign() {
    if (!reviewDate) { toast.error('Pick a review date.'); return; }
    if (periodStart && periodEnd && periodEnd < periodStart) { toast.error('Period end must be on or after the start.'); return; }
    try {
      const result = await assign.mutateAsync({
        project_id: projectId,
        employee_ids: members.map(m => m.employee_id),
        review_date: reviewDate,
        reviewer_id: reviewerId,
        period_start: periodStart || null,
        period_end: periodEnd || null,
      });
      const n = result.created.length;
      toast.success(n === 1 ? 'Self-assessment assigned — the employee was notified by email.' : `${n} self-assessments assigned — each employee was notified by email.`);
      if (result.skipped_employee_ids.length) {
        toast.info(`${result.skipped_employee_ids.length} skipped — they already have an open review on this project.`);
      }
      onAssigned();
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message.replace(/^API error \d+: /, '') : 'Failed to assign self-assessments.');
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Assign Self-Assessment{members.length > 1 ? 's' : ''}</DialogTitle>
          <DialogDescription>
            Each employee completes their project details and self-assessment, then the reviewer scores it.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex flex-wrap gap-1.5">
            {members.map(m => <Badge key={m.employee_id} variant="secondary">{m.name}</Badge>)}
          </div>
          <div className="space-y-1.5">
            <Label>Reviewer</Label>
            <SearchableCombobox
              options={reviewerOptions}
              value={reviewerId}
              onChange={setReviewerId}
              placeholder={managerName ? `Project manager (${managerName})` : 'Project manager / owner'}
              clearable
            />
            <p className="text-xs text-muted-foreground">Leave empty to use the project manager. Nobody is assigned as their own reviewer.</p>
          </div>
          <div className="space-y-1.5">
            <Label>Date of review</Label>
            <Input type="date" className="w-44" value={reviewDate} onChange={e => setReviewDate(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Period start <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <Input type="date" value={periodStart} onChange={e => setPeriodStart(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Period end <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <Input type="date" value={periodEnd} onChange={e => setPeriodEnd(e.target.value)} />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            "Duration" on each review is filled with the hours that employee logged on the project{periodStart || periodEnd ? ' within the period' : ''}.
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleAssign} disabled={assign.isPending} className="gap-2">
            {assign.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Assign{members.length > 1 ? ` (${members.length})` : ''}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function ProjectReviewsPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const { data: projects = [], isLoading: projectsLoading } = useReviewProjects(true);
  const { data: team = [], isLoading: teamLoading } = useProjectReviewTeam(projectId);
  const toggle = useToggleProjectReviews();
  const project = projects.find(p => p.id === projectId);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [assigning, setAssigning] = useState<ReviewTeamMember[] | null>(null);

  const enabled = !!project?.performance_review_enabled;
  const assignable = useMemo(() => team.filter(m => m.is_active && !openReviewOf(m)), [team]);
  const allSelected = assignable.length > 0 && assignable.every(m => selected.has(m.employee_id));

  if (projectsLoading || teamLoading) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }
  if (!project) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" className="gap-2" onClick={() => navigate('/reviews')}><ArrowLeft className="h-4 w-4" /> Back to reviews</Button>
        <p className="text-muted-foreground">Project not found.</p>
      </div>
    );
  }

  const toggleOne = (id: string, on: boolean) =>
    setSelected(s => { const n = new Set(s); if (on) n.add(id); else n.delete(id); return n; });

  async function handleToggle(on: boolean) {
    if (!on && project!.reviews_total > 0 &&
      !confirm(`Turn off reviews for ${project!.name}? Existing reviews are kept, but no new self-assessments can be assigned.`)) return;
    try {
      await toggle.mutateAsync({ projectId: project!.id, enabled: on });
      toast.success(on ? 'Performance reviews enabled for this project.' : 'Performance reviews turned off for this project.');
      if (!on) setSelected(new Set());
    } catch {
      toast.error('Failed to update the project.');
    }
  }

  const selectedMembers = team.filter(m => selected.has(m.employee_id));

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-1">
          <Button variant="ghost" size="sm" className="gap-2 -ml-2 text-muted-foreground" onClick={() => navigate('/reviews')}>
            <ArrowLeft className="h-4 w-4" /> Performance Reviews
          </Button>
          <h1 className="text-2xl font-bold text-foreground">{project.name}</h1>
          <p className="text-muted-foreground">
            {[project.client_name, project.project_code, project.manager_name && `Manager: ${project.manager_name}`].filter(Boolean).join(' · ')}
          </p>
        </div>
        <Card className="card-elevated">
          <CardContent className="flex items-center gap-3 p-4">
            <Switch id="enabled" checked={enabled} disabled={toggle.isPending} onCheckedChange={handleToggle} />
            <Label htmlFor="enabled" className="cursor-pointer">
              <div className="font-medium">This project has performance reviews</div>
              <div className="text-xs text-muted-foreground font-normal">{enabled ? 'Self-assessments can be assigned' : 'Turned off'}</div>
            </Label>
          </CardContent>
        </Card>
      </div>

      {!enabled && (
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>Turn on performance reviews for this project to assign self-assessments to its team.</AlertDescription>
        </Alert>
      )}

      <Card className="card-elevated">
        <CardHeader className="flex flex-row items-center justify-between gap-4 pb-3">
          <CardTitle className="text-base flex items-center gap-2"><Users className="h-4 w-4 text-primary" /> Team</CardTitle>
          {enabled && (
            <Button className="gap-2" disabled={selectedMembers.length === 0} onClick={() => setAssigning(selectedMembers)}>
              <Send className="h-4 w-4" /> Assign self-assessment{selectedMembers.length ? ` (${selectedMembers.length})` : ''}
            </Button>
          )}
        </CardHeader>
        <CardContent className="p-0">
          {team.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-10">
              Nobody is staffed on this project or has logged time on it yet.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    {enabled && (
                      <TableHead className="w-10">
                        <Checkbox
                          checked={allSelected}
                          disabled={assignable.length === 0}
                          onCheckedChange={v => setSelected(v ? new Set(assignable.map(m => m.employee_id)) : new Set())}
                          aria-label="Select everyone without an open review"
                        />
                      </TableHead>
                    )}
                    <TableHead>Employee</TableHead>
                    <TableHead className="text-right">Logged hours</TableHead>
                    <TableHead>Self-assessment / review</TableHead>
                    <TableHead>Reviewer</TableHead>
                    <TableHead className="text-center">Avg. score</TableHead>
                    <TableHead className="w-32" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {team.map(m => {
                    const latest = m.reviews[0];
                    const openReview = openReviewOf(m);
                    const canAssign = enabled && m.is_active && !openReview;
                    return (
                      <TableRow key={m.employee_id} className={!m.is_active ? 'opacity-60' : undefined}>
                        {enabled && (
                          <TableCell>
                            <Checkbox
                              checked={selected.has(m.employee_id)}
                              disabled={!canAssign}
                              onCheckedChange={v => toggleOne(m.employee_id, !!v)}
                              aria-label={`Select ${m.name}`}
                            />
                          </TableCell>
                        )}
                        <TableCell>
                          <div className="font-medium">{m.name}</div>
                          <div className="text-xs text-muted-foreground">
                            {[m.role_name ?? m.title, !m.is_assigned && 'Logged time only — not staffed', !m.is_active && 'Inactive'].filter(Boolean).join(' · ')}
                          </div>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{m.logged_hours.toLocaleString()}</TableCell>
                        <TableCell>
                          {latest ? (
                            <div className="flex flex-wrap items-center gap-2">
                              <Badge variant="outline" className={`border-0 ${REVIEW_STATUS_BADGE[latest.status].className}`}>
                                {REVIEW_STATUS_BADGE[latest.status].label}
                              </Badge>
                              <span className="text-xs text-muted-foreground">{formatDate(latest.review_date)}</span>
                              {m.reviews.length > 1 && <span className="text-xs text-muted-foreground">+{m.reviews.length - 1} earlier</span>}
                            </div>
                          ) : <span className="text-sm text-muted-foreground">Not assigned</span>}
                        </TableCell>
                        <TableCell>{latest?.reviewer_name ?? <span className="text-muted-foreground">—</span>}</TableCell>
                        <TableCell className="text-center tabular-nums font-semibold">
                          {latest?.overall_average != null ? latest.overall_average.toFixed(2) : '—'}
                        </TableCell>
                        <TableCell>
                          <div className="flex justify-end gap-1">
                            {latest && (
                              <Button variant="ghost" size="sm" onClick={() => navigate(`/reviews/${latest.id}`)}>Open</Button>
                            )}
                            {canAssign && (
                              <Button variant="outline" size="sm" onClick={() => setAssigning([m])}>Assign</Button>
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

      {assigning && (
        <AssignDialog
          open={!!assigning}
          onOpenChange={o => { if (!o) setAssigning(null); }}
          projectId={project.id}
          managerName={project.manager_name}
          members={assigning}
          onAssigned={() => setSelected(new Set())}
        />
      )}
    </div>
  );
}
