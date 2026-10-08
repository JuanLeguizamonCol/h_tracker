import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { ClipboardCheck, Search, Loader2, Download, Trash2, ChevronRight, Briefcase } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import {
  usePerformanceReviews, useDeletePerformanceReview, downloadReviewXlsx, REVIEW_STATUS_BADGE,
  useReviewProjects, useToggleProjectReviews,
} from '@/hooks/usePerformanceReviews';
import { PerformanceReview, PerformanceReviewStatus, ReviewProject } from '@/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

function formatDate(iso: string): string {
  return format(new Date(`${iso}T00:00:00`), 'MMM d, yyyy');
}

function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div className="relative w-full lg:max-w-sm">
      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input placeholder={placeholder} value={value} onChange={e => onChange(e.target.value)} className="pl-10" />
    </div>
  );
}

// ---------- Projects panel (Reviews edit access) ----------

function ProjectsPanel() {
  const navigate = useNavigate();
  const [includeInactive, setIncludeInactive] = useState(false);
  const { data: projects = [], isLoading } = useReviewProjects(includeInactive);
  const toggle = useToggleProjectReviews();
  const [filter, setFilter] = useState<'all' | 'enabled' | 'disabled'>('all');
  const [search, setSearch] = useState('');
  const [pendingId, setPendingId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return projects.filter(p =>
      (filter === 'all' || (filter === 'enabled') === p.performance_review_enabled) &&
      (!term || [p.name, p.client_name, p.project_code, p.manager_name].some(v => v?.toLowerCase().includes(term))),
    );
  }, [projects, filter, search]);
  const enabledCount = projects.filter(p => p.performance_review_enabled).length;

  async function handleToggle(project: ReviewProject, enabled: boolean) {
    if (!enabled && project.reviews_total > 0 &&
      !confirm(`Turn off reviews for ${project.name}? Its ${project.reviews_total} existing review(s) are kept, but no new self-assessments can be assigned.`)) return;
    setPendingId(project.id);
    try {
      await toggle.mutateAsync({ projectId: project.id, enabled });
      toast.success(enabled ? `Performance reviews enabled for ${project.name}.` : `Performance reviews turned off for ${project.name}.`);
    } catch {
      toast.error('Failed to update the project.');
    } finally {
      setPendingId(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-4">
          <Tabs value={filter} onValueChange={v => setFilter(v as typeof filter)}>
            <TabsList>
              <TabsTrigger value="all">All ({projects.length})</TabsTrigger>
              <TabsTrigger value="enabled">With reviews ({enabledCount})</TabsTrigger>
              <TabsTrigger value="disabled">Without reviews ({projects.length - enabledCount})</TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="flex items-center gap-2">
            <Switch id="inactive" checked={includeInactive} onCheckedChange={setIncludeInactive} />
            <Label htmlFor="inactive" className="text-sm font-normal text-muted-foreground">Show inactive projects</Label>
          </div>
        </div>
        <SearchBox value={search} onChange={setSearch} placeholder="Search project, client, manager..." />
      </div>

      <Card className="card-elevated">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-12 text-muted-foreground">
              <Briefcase className="h-8 w-8" />
              <p className="text-sm">No projects match these filters.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-28">Reviews</TableHead>
                    <TableHead>Project</TableHead>
                    <TableHead>Manager</TableHead>
                    <TableHead className="text-center">Team</TableHead>
                    <TableHead>Progress</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map(p => (
                    <TableRow key={p.id} className="cursor-pointer" onClick={() => navigate(`/reviews/projects/${p.id}`)}>
                      <TableCell onClick={e => e.stopPropagation()}>
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={p.performance_review_enabled}
                            disabled={pendingId === p.id}
                            onCheckedChange={v => handleToggle(p, v)}
                            aria-label={`Performance reviews for ${p.name}`}
                          />
                          <span className="text-xs text-muted-foreground">{p.performance_review_enabled ? 'Yes' : 'No'}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="font-medium">{p.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {[p.client_name, p.project_code].filter(Boolean).join(' · ')}
                          {!p.is_active && <Badge variant="outline" className="ml-2 text-[10px] py-0">Inactive</Badge>}
                        </div>
                      </TableCell>
                      <TableCell>{p.manager_name ?? <span className="text-muted-foreground">—</span>}</TableCell>
                      <TableCell className="text-center tabular-nums">{p.team_size}</TableCell>
                      <TableCell>
                        {p.reviews_total === 0 ? (
                          <span className="text-sm text-muted-foreground">{p.performance_review_enabled ? 'Not assigned yet' : '—'}</span>
                        ) : (
                          <div className="flex flex-wrap gap-1.5">
                            {(['self_assessment', 'in_review', 'completed'] as const).map(st => {
                              const n = p[`reviews_${st}`];
                              return n > 0 ? (
                                <Badge key={st} variant="outline" className={`border-0 ${REVIEW_STATUS_BADGE[st].className}`}>
                                  {n} {REVIEW_STATUS_BADGE[st].label.toLowerCase()}
                                </Badge>
                              ) : null;
                            })}
                          </div>
                        )}
                      </TableCell>
                      <TableCell><ChevronRight className="h-4 w-4 text-muted-foreground" /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ---------- Reviews list ----------

function ReviewsList({ canManage }: { canManage: boolean }) {
  const navigate = useNavigate();
  const { employee } = useAuth();
  const { data: reviews = [], isLoading } = usePerformanceReviews();
  const deleteReview = useDeletePerformanceReview();
  const [statusFilter, setStatusFilter] = useState<'all' | PerformanceReviewStatus>('all');
  const [search, setSearch] = useState('');

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
    if (r.employee_id === employee?.id) return r.status === 'self_assessment' ? 'Your self-assessment is pending' : 'You (reviewee)';
    if (r.reviewer_id === employee?.id) return r.status === 'in_review' ? 'Waiting on your review' : 'You (reviewer)';
    return null;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <Tabs value={statusFilter} onValueChange={v => setStatusFilter(v as typeof statusFilter)}>
          <TabsList className="flex-wrap h-auto">
            <TabsTrigger value="all">All ({counts.all})</TabsTrigger>
            <TabsTrigger value="self_assessment">Self-assessment ({counts.self_assessment})</TabsTrigger>
            <TabsTrigger value="in_review">In review ({counts.in_review})</TabsTrigger>
            <TabsTrigger value="completed">Completed ({counts.completed})</TabsTrigger>
          </TabsList>
        </Tabs>
        <SearchBox value={search} onChange={setSearch} placeholder="Search employee, project, client, reviewer..." />
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
                            {r.reviewer_section_visible && (
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
    </div>
  );
}

const TAB_KEY = 'reviews:tab';

export default function PerformanceReviews() {
  const { hasEdit } = useAuth();
  const canManage = hasEdit('reviews');
  const [tab, setTab] = useState<string>(() => {
    try { return localStorage.getItem(TAB_KEY) || 'projects'; } catch { return 'projects'; }
  });
  const changeTab = (v: string) => {
    setTab(v);
    try { localStorage.setItem(TAB_KEY, v); } catch { /* ignore */ }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Performance Reviews</h1>
        <p className="text-muted-foreground">
          {canManage
            ? 'Choose which projects run performance reviews, then open a project to assign self-assessments to its team'
            : 'Your project self-assessments and the reviews assigned to you'}
        </p>
      </div>

      {canManage ? (
        <Tabs value={tab} onValueChange={changeTab}>
          <TabsList>
            <TabsTrigger value="projects">Projects</TabsTrigger>
            <TabsTrigger value="reviews">All reviews</TabsTrigger>
          </TabsList>
          <TabsContent value="projects" className="mt-4"><ProjectsPanel /></TabsContent>
          <TabsContent value="reviews" className="mt-4"><ReviewsList canManage /></TabsContent>
        </Tabs>
      ) : (
        <ReviewsList canManage={false} />
      )}
    </div>
  );
}
