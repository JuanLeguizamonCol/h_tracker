import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { ArrowLeft, Download, Loader2, Lock, RotateCcw, Save, Send, CheckCircle2, RefreshCw } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import {
  usePerformanceReview, useReviewTemplate, useUpdatePerformanceReview, useTransitionPerformanceReview,
  useReviewLoggedHours, downloadReviewXlsx, REVIEW_STATUS_BADGE,
} from '@/hooks/usePerformanceReviews';
import { useEmployees } from '@/hooks/useEmployees';
import { PerformanceReview, PerformanceReviewPatch, ReviewScore, ReviewTemplate } from '@/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { SearchableCombobox } from '@/components/ui/SearchableCombobox';
import { cn } from '@/lib/utils';

// Same convention as the review workbook: employees complete the blue
// sections, reviewers the green ones.
const EMPLOYEE_ACCENT = 'border-l-4 border-l-sky-500';
const REVIEWER_ACCENT = 'border-l-4 border-l-emerald-600';

type Draft = Required<PerformanceReviewPatch>;

const TEXT_FIELDS = [
  'project_description', 'employee_role', 'self_strengths', 'self_improvement', 'self_development',
  'reviewer_strengths_notes', 'reviewer_improvement_notes', 'reviewer_development_notes',
] as const;
const EMPLOYEE_FIELDS = new Set<keyof Draft>(['project_description', 'employee_role', 'self_strengths', 'self_improvement', 'self_development']);
const REVIEWER_FIELDS = new Set<keyof Draft>(['scores', 'reviewer_strengths_notes', 'reviewer_improvement_notes', 'reviewer_development_notes']);

function toDraft(r: PerformanceReview): Draft {
  return {
    reviewer_id: r.reviewer_id,
    review_date: r.review_date,
    period_start: r.period_start,
    period_end: r.period_end,
    duration_hours: r.duration_hours,
    project_description: r.project_description,
    employee_role: r.employee_role,
    self_strengths: r.self_strengths,
    self_improvement: r.self_improvement,
    self_development: r.self_development,
    reviewer_strengths_notes: r.reviewer_strengths_notes,
    reviewer_improvement_notes: r.reviewer_improvement_notes,
    reviewer_development_notes: r.reviewer_development_notes,
    scores: r.scores,
  };
}

function normScores(scores: Record<string, ReviewScore>): string {
  const clean = Object.entries(scores)
    .map(([k, v]) => [k, v.score ?? null, (v.notes ?? '').trim() || null] as const)
    .filter(([, s, n]) => s !== null || n !== null)
    .sort(([a], [b]) => a.localeCompare(b));
  return JSON.stringify(clean);
}

function isSame(key: keyof Draft, a: unknown, b: unknown): boolean {
  if (key === 'scores') return normScores(a as Record<string, ReviewScore>) === normScores(b as Record<string, ReviewScore>);
  const norm = (v: unknown) => (v === '' || v === undefined ? null : v);
  return norm(a) === norm(b);
}

const mean = (values: number[]) => (values.length ? Math.round((values.reduce((s, v) => s + v, 0) / values.length) * 100) / 100 : null);

// Mirrors Backend/services/performance_reviews.py::compute_averages.
function computeAverages(template: ReviewTemplate, scores: Record<string, ReviewScore>) {
  const criteria = template.criteria.map(c => ({
    key: c.key,
    label: c.short_label,
    average: mean(c.sub_criteria.map(s => scores[s.key]?.score).filter((v): v is number => v != null)),
  }));
  return { criteria, overall: mean(criteria.map(c => c.average).filter((v): v is number => v != null)) };
}

function fmtAvg(v: number | null | undefined) {
  return v == null ? '—' : Number.isInteger(v) ? v.toFixed(1) : String(v);
}

function ScorePicker({ value, onChange, min, max, disabled }: {
  value: number | null; onChange: (v: number | null) => void; min: number; max: number; disabled: boolean;
}) {
  const options = Array.from({ length: max - min + 1 }, (_, i) => min + i);
  return (
    <div className="flex flex-wrap gap-1">
      {options.map(n => (
        <button
          key={n}
          type="button"
          disabled={disabled}
          onClick={() => onChange(value === n ? null : n)}
          className={cn(
            'h-8 w-8 rounded-md border text-sm font-medium tabular-nums transition-colors',
            value === n ? 'bg-emerald-600 border-emerald-600 text-white' : 'bg-background hover:bg-muted',
            disabled && 'opacity-60 cursor-not-allowed hover:bg-background',
          )}
          aria-pressed={value === n}
          aria-label={`Score ${n}`}
        >
          {n}
        </button>
      ))}
      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange(null)}
        className={cn(
          'h-8 px-2 rounded-md border text-xs transition-colors',
          value == null ? 'bg-muted text-foreground' : 'bg-background text-muted-foreground hover:bg-muted',
          disabled && 'opacity-60 cursor-not-allowed',
        )}
        title="Not rated — excluded from the average"
      >
        N/A
      </button>
    </div>
  );
}

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1.5 sm:grid-cols-[220px_1fr] sm:gap-4 py-2.5 border-b last:border-b-0">
      <div className="text-sm font-semibold text-foreground pt-2">{label}</div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function ReadOnlyText({ value, placeholder = '—' }: { value: string | null | undefined; placeholder?: string }) {
  return value
    ? <p className="text-sm whitespace-pre-wrap pt-2">{value}</p>
    : <p className="text-sm text-muted-foreground pt-2">{placeholder}</p>;
}

export default function PerformanceReviewPage() {
  const { reviewId } = useParams<{ reviewId: string }>();
  const navigate = useNavigate();
  const { employee, hasEdit } = useAuth();
  const { data: review, isLoading, error } = usePerformanceReview(reviewId);
  const { data: template } = useReviewTemplate();
  const { data: employees = [] } = useEmployees();
  const updateReview = useUpdatePerformanceReview();
  const transition = useTransitionPerformanceReview();

  const [draft, setDraft] = useState<Draft | null>(null);
  useEffect(() => { if (review) setDraft(toDraft(review)); }, [review]);

  const manage = hasEdit('reviews');
  const isReviewee = !!review && review.employee_id === employee?.id;
  const isReviewer = !!review && review.reviewer_id === employee?.id;
  const canEditEmployee = !!review && (manage || (isReviewee && review.status === 'self_assessment'));
  const canEditReviewer = !!review && (manage || (isReviewer && review.status !== 'completed'));
  const canEditAdmin = manage;

  const { data: logged, refetch: refetchHours, isFetching: hoursFetching } = useReviewLoggedHours({
    projectId: review?.project_id, employeeId: review?.employee_id,
    periodStart: draft?.period_start ?? undefined, periodEnd: draft?.period_end ?? undefined,
    enabled: false,
  });

  const allowed = useMemo(() => {
    const s = new Set<keyof Draft>();
    if (canEditEmployee) EMPLOYEE_FIELDS.forEach(f => s.add(f));
    if (canEditReviewer) REVIEWER_FIELDS.forEach(f => s.add(f));
    if (canEditAdmin) (['reviewer_id', 'review_date', 'period_start', 'period_end', 'duration_hours'] as const).forEach(f => s.add(f));
    return s;
  }, [canEditEmployee, canEditReviewer, canEditAdmin]);

  const patch = useMemo<PerformanceReviewPatch>(() => {
    if (!review || !draft) return {};
    const base = toDraft(review);
    const out: Record<string, unknown> = {};
    (Object.keys(draft) as (keyof Draft)[]).forEach(k => {
      if (allowed.has(k) && !isSame(k, draft[k], base[k])) {
        const v = draft[k];
        out[k] = typeof v === 'string' && v.trim() === '' ? null : v;
      }
    });
    return out as PerformanceReviewPatch;
  }, [review, draft, allowed]);
  const isDirty = Object.keys(patch).length > 0;

  const averages = useMemo(
    () => (template && draft ? computeAverages(template, draft.scores) : null),
    [template, draft],
  );

  const reviewerOptions = useMemo(
    () => employees.filter(e => e.is_active && e.id !== review?.employee_id)
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(e => ({ id: e.id, label: e.name, sublabel: e.title ?? undefined })),
    [employees, review?.employee_id],
  );

  if (isLoading || (review && (!draft || !template))) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }
  if (error || !review || !draft || !template) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" className="gap-2" onClick={() => navigate('/reviews')}><ArrowLeft className="h-4 w-4" /> Back to reviews</Button>
        <p className="text-muted-foreground">This review doesn't exist or you don't have access to it.</p>
      </div>
    );
  }

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft(d => (d ? { ...d, [key]: value } : d));
  const setScore = (subKey: string, change: Partial<ReviewScore>) =>
    setDraft(d => {
      if (!d) return d;
      const current = d.scores[subKey] ?? { score: null, notes: null };
      return { ...d, scores: { ...d.scores, [subKey]: { ...current, ...change } } };
    });

  async function save(silent = false): Promise<boolean> {
    if (!isDirty) return true;
    try {
      await updateReview.mutateAsync({ id: review!.id, data: patch });
      if (!silent) toast.success('Review saved.');
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message.replace(/^API error \d+: /, '') : 'Failed to save review.');
      return false;
    }
  }

  async function runTransition(action: 'submit_self' | 'complete' | 'reopen', confirmText: string, successText: string) {
    if (!confirm(confirmText)) return;
    if (!(await save(true))) return;
    try {
      await transition.mutateAsync({ id: review!.id, action });
      toast.success(successText);
    } catch (e) {
      toast.error(e instanceof Error ? e.message.replace(/^API error \d+: /, '') : 'Action failed.');
    }
  }

  async function handleExport() {
    if (isDirty && !(await save(true))) return;
    try {
      await downloadReviewXlsx(review!);
    } catch {
      toast.error('Failed to export review.');
    }
  }

  async function recalcHours() {
    const { data } = await refetchHours();
    if (data) set('duration_hours', data.hours);
  }

  const badge = REVIEW_STATUS_BADGE[review.status];
  const busy = updateReview.isPending || transition.isPending;
  const showReviewer = review.reviewer_section_visible;
  const canSubmitSelf = review.status === 'self_assessment' && (isReviewee || manage);
  const canComplete = review.status !== 'completed' && (manage || (isReviewer && review.status === 'in_review'));
  const canReopen = manage && review.status !== 'self_assessment';

  const textArea = (field: typeof TEXT_FIELDS[number], editable: boolean, placeholder: string, rows = 3) =>
    editable ? (
      <Textarea value={draft[field] ?? ''} onChange={e => set(field, e.target.value)} placeholder={placeholder} rows={rows} className="resize-y" />
    ) : (
      <ReadOnlyText value={draft[field]} />
    );

  return (
    <div className="space-y-6 pb-24">
      {/* Header */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-1">
          <Button variant="ghost" size="sm" className="gap-2 -ml-2 text-muted-foreground"
            onClick={() => navigate(manage ? `/reviews/projects/${review.project_id}` : '/reviews')}>
            <ArrowLeft className="h-4 w-4" /> {manage ? review.project_name : 'Performance Reviews'}
          </Button>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold text-foreground">{review.employee_name}</h1>
            <Badge variant="outline" className={`border-0 ${badge.className}`}>{badge.label}</Badge>
          </div>
          <p className="text-muted-foreground">
            {review.project_name}{review.client_name ? ` · ${review.client_name}` : ''} · reviewed by {review.reviewer_name ?? 'unassigned'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canReopen && (
            <Button variant="outline" className="gap-2" disabled={busy}
              onClick={() => runTransition('reopen',
                review.status === 'completed' ? 'Reopen this review so the reviewer can edit it again?' : 'Send this review back to the employee for their self-assessment?',
                'Review reopened.')}>
              <RotateCcw className="h-4 w-4" /> Reopen
            </Button>
          )}
          {showReviewer && (
            <Button variant="outline" className="gap-2" onClick={handleExport} disabled={busy}>
              <Download className="h-4 w-4" /> Export Excel
            </Button>
          )}
          {allowed.size > 0 && (
            <Button variant="outline" className="gap-2" onClick={() => save()} disabled={!isDirty || busy}>
              {updateReview.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save
            </Button>
          )}
          {canSubmitSelf && (
            <Button className="gap-2" disabled={busy}
              onClick={() => runTransition('submit_self', 'Submit your self-assessment to the reviewer? You won\'t be able to edit it afterwards.', 'Self-assessment submitted to the reviewer.')}>
              <Send className="h-4 w-4" /> Submit Self-Assessment
            </Button>
          )}
          {canComplete && (
            <Button className="gap-2 bg-emerald-600 hover:bg-emerald-700" disabled={busy}
              onClick={() => runTransition('complete', 'Complete this review? The employee will be notified and will see the scores.', 'Review completed.')}>
              <CheckCircle2 className="h-4 w-4" /> Complete Review
            </Button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm bg-sky-500" /> Completed by the employee</span>
        <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm bg-emerald-600" /> Completed by the reviewer</span>
      </div>

      {/* Project details + average score */}
      <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
        <Card className={cn('card-elevated', EMPLOYEE_ACCENT)}>
          <CardHeader className="pb-2"><CardTitle className="text-base">Project Details</CardTitle></CardHeader>
          <CardContent>
            <FieldRow label="Review for"><p className="text-sm pt-2">{review.employee_name}</p></FieldRow>
            <FieldRow label="Project Name"><p className="text-sm pt-2">{review.project_name}{review.client_name ? ` (${review.client_name})` : ''}</p></FieldRow>
            <FieldRow label="Reviewer">
              {canEditAdmin ? (
                <SearchableCombobox options={reviewerOptions} value={draft.reviewer_id} onChange={id => set('reviewer_id', id)} placeholder="Select reviewer..." clearable />
              ) : <ReadOnlyText value={review.reviewer_name} />}
            </FieldRow>
            <FieldRow label="Project Description">{textArea('project_description', canEditEmployee, 'Brief description of the project')}</FieldRow>
            <FieldRow label="Employee's Role / Key Activities">{textArea('employee_role', canEditEmployee, 'Your role and the key activities you performed', 4)}</FieldRow>
            <FieldRow label="Duration">
              {canEditAdmin ? (
                <div className="flex flex-wrap items-center gap-2">
                  <Input type="number" min="0" step="0.5" className="w-32" value={draft.duration_hours ?? ''}
                    onChange={e => set('duration_hours', e.target.value === '' ? null : parseFloat(e.target.value))} />
                  <span className="text-sm text-muted-foreground">hours</span>
                  <Button variant="ghost" size="sm" className="gap-1.5" onClick={recalcHours} disabled={hoursFetching}>
                    <RefreshCw className={cn('h-3.5 w-3.5', hoursFetching && 'animate-spin')} /> Use logged hours{logged ? ` (${logged.hours})` : ''}
                  </Button>
                </div>
              ) : <ReadOnlyText value={review.duration_hours != null ? `${review.duration_hours.toLocaleString()} hours` : null} />}
            </FieldRow>
            {canEditAdmin && (
              <FieldRow label="Period (for hours)">
                <div className="flex flex-wrap items-center gap-2">
                  <Input type="date" className="w-40" value={draft.period_start ?? ''} onChange={e => set('period_start', e.target.value || null)} />
                  <span className="text-sm text-muted-foreground">to</span>
                  <Input type="date" className="w-40" value={draft.period_end ?? ''} onChange={e => set('period_end', e.target.value || null)} />
                </div>
              </FieldRow>
            )}
            <FieldRow label="Date of Review">
              {canEditAdmin ? (
                <Input type="date" className="w-40" value={draft.review_date ?? ''} onChange={e => e.target.value && set('review_date', e.target.value)} />
              ) : <ReadOnlyText value={format(new Date(`${review.review_date}T00:00:00`), 'MM/dd/yyyy')} />}
            </FieldRow>
          </CardContent>
        </Card>

        <Card className="card-elevated h-fit">
          <CardHeader className="pb-2"><CardTitle className="text-base">Average Score</CardTitle></CardHeader>
          <CardContent>
            {showReviewer && averages ? (
              <div className="divide-y">
                {averages.criteria.map(c => (
                  <div key={c.key} className="flex items-center justify-between py-2 text-sm">
                    <span>{c.label}</span>
                    <span className="font-semibold tabular-nums">{fmtAvg(c.average)}</span>
                  </div>
                ))}
                <div className="flex items-center justify-between pt-3 text-sm">
                  <span className="font-semibold">Average Total</span>
                  <span className="text-lg font-bold tabular-nums text-primary">{fmtAvg(averages.overall)}</span>
                </div>
                <p className="pt-3 text-xs text-muted-foreground">
                  Scale {template.score_min}–{template.score_max}. Each criterion averages its rated sub-criteria; the total averages the criteria.
                </p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2 py-6 text-center text-sm text-muted-foreground">
                <Lock className="h-5 w-5" /> Scores will be visible once the review is completed.
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Self assessment */}
      <Card className={cn('card-elevated', EMPLOYEE_ACCENT)}>
        <CardHeader className="pb-2"><CardTitle className="text-base">Self Assessment</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {([
            ['Strengths', 'self_strengths', 'reviewer_strengths_notes'],
            ['Areas for Improvement', 'self_improvement', 'reviewer_improvement_notes'],
            ['Personal Development Needs', 'self_development', 'reviewer_development_notes'],
          ] as const).map(([label, selfKey, reviewerKey]) => (
            <div key={selfKey} className="grid gap-3 lg:grid-cols-[200px_1fr_1fr] border-b pb-4 last:border-b-0 last:pb-0">
              <div className="text-sm font-semibold pt-2">{label}</div>
              <div className="space-y-1">
                <div className="text-xs font-medium text-sky-700 dark:text-sky-400">Self-assessment notes</div>
                {textArea(selfKey, canEditEmployee, `Your ${label.toLowerCase()}`)}
              </div>
              <div className="space-y-1">
                <div className="text-xs font-medium text-emerald-700 dark:text-emerald-400">Reviewer notes</div>
                {showReviewer
                  ? textArea(reviewerKey, canEditReviewer, 'Reviewer comments')
                  : <p className="text-sm text-muted-foreground pt-2 flex items-center gap-1.5"><Lock className="h-3.5 w-3.5" /> Visible once completed</p>}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Reviewer assessment */}
      {showReviewer && (
        <Card className={cn('card-elevated', REVIEWER_ACCENT)}>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Reviewer Assessment</CardTitle>
            <p className="text-xs text-muted-foreground">
              Rate each sub-criterion from {template.score_min} to {template.score_max}; leave N/A when it doesn't apply to this project.
            </p>
          </CardHeader>
          <CardContent className="space-y-6">
            {template.criteria.map(criterion => {
              const avg = averages?.criteria.find(c => c.key === criterion.key)?.average;
              return (
                <div key={criterion.key} className="rounded-lg border overflow-hidden">
                  <div className="flex items-center justify-between bg-emerald-50 dark:bg-emerald-950/40 px-4 py-2.5">
                    <span className="font-semibold text-sm">{criterion.label}</span>
                    <span className="text-sm">Average: <span className="font-bold tabular-nums">{fmtAvg(avg)}</span></span>
                  </div>
                  <div className="divide-y">
                    {criterion.sub_criteria.map(sub => {
                      const entry = draft.scores[sub.key] ?? { score: null, notes: null };
                      return (
                        <div key={sub.key} className="grid gap-3 px-4 py-3 lg:grid-cols-[1fr_240px_1fr]">
                          <p className="text-sm whitespace-pre-line">{sub.label}</p>
                          <ScorePicker value={entry.score} onChange={v => setScore(sub.key, { score: v })}
                            min={template.score_min} max={template.score_max} disabled={!canEditReviewer} />
                          {canEditReviewer ? (
                            <Textarea value={entry.notes ?? ''} onChange={e => setScore(sub.key, { notes: e.target.value })}
                              placeholder="Notes (optional)" rows={2} className="resize-y" />
                          ) : <ReadOnlyText value={entry.notes} placeholder="" />}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {isDirty && (
        <div className="fixed bottom-4 right-4 z-40 flex items-center gap-3 rounded-lg border bg-background px-4 py-3 shadow-lg">
          <span className="text-sm text-muted-foreground">Unsaved changes</span>
          <Button size="sm" variant="ghost" onClick={() => setDraft(toDraft(review))} disabled={busy}>Discard</Button>
          <Button size="sm" className="gap-1.5" onClick={() => save()} disabled={busy}>
            {updateReview.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Save
          </Button>
        </div>
      )}
    </div>
  );
}
