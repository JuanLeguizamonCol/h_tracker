import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { ArrowLeft, Download, Loader2, Lock, RotateCcw, Save, Send, CheckCircle2, RefreshCw, Check } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import {
  usePerformanceReview, useReviewTemplate, useUpdatePerformanceReview, useTransitionPerformanceReview,
  useReviewLoggedHours, downloadReviewXlsx, REVIEW_STATUS_BADGE, EVALUATION_META,
} from '@/hooks/usePerformanceReviews';
import { useEmployees } from '@/hooks/useEmployees';
import { EvaluationKey, PerformanceReview, PerformanceReviewStatus, ReviewScore, ReviewTemplate } from '@/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { SearchableCombobox } from '@/components/ui/SearchableCombobox';
import { cn } from '@/lib/utils';

// Same convention as the review workbook: employees complete the blue
// sections, reviewers the green ones.
const EMPLOYEE_ACCENT = 'border-l-4 border-l-sky-500';
const REVIEWER_ACCENT = 'border-l-4 border-l-emerald-600';

const EVALUATIONS: EvaluationKey[] = ['self', 'manager', 'joint'];
const SCORE_FIELD: Record<EvaluationKey, 'self_scores' | 'manager_scores' | 'joint_scores'> = {
  self: 'self_scores', manager: 'manager_scores', joint: 'joint_scores',
};

const STAGES: { status: PerformanceReviewStatus; label: string }[] = [
  { status: 'self_assessment', label: 'Self evaluation' },
  { status: 'in_review', label: 'Manager evaluation' },
  { status: 'joint_review', label: 'Joint evaluation' },
  { status: 'completed', label: 'Completed' },
];

type Scores = Record<string, ReviewScore>;
type Draft = {
  reviewer_id: string | null;
  review_date: string;
  period_start: string | null;
  period_end: string | null;
  duration_hours: number | null;
  project_description: string | null;
  employee_role: string | null;
  self_strengths: string | null;
  self_improvement: string | null;
  self_development: string | null;
  reviewer_strengths_notes: string | null;
  reviewer_improvement_notes: string | null;
  reviewer_development_notes: string | null;
  joint_notes: string | null;
  self_scores: Scores;
  manager_scores: Scores;
  joint_scores: Scores;
};
type TextField =
  | 'project_description' | 'employee_role' | 'self_strengths' | 'self_improvement' | 'self_development'
  | 'reviewer_strengths_notes' | 'reviewer_improvement_notes' | 'reviewer_development_notes' | 'joint_notes';

// Mirrors Backend/services/performance_reviews.py field groups.
const EMPLOYEE_FIELDS: (keyof Draft)[] = ['project_description', 'employee_role', 'self_strengths', 'self_improvement', 'self_development', 'self_scores'];
const MANAGER_FIELDS: (keyof Draft)[] = ['manager_scores', 'reviewer_strengths_notes', 'reviewer_improvement_notes', 'reviewer_development_notes'];
const JOINT_FIELDS: (keyof Draft)[] = ['joint_scores', 'joint_notes'];
const ADMIN_ONLY_FIELDS: (keyof Draft)[] = ['reviewer_id', 'review_date', 'period_start', 'period_end', 'duration_hours'];

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
    joint_notes: r.joint_notes,
    self_scores: r.evaluations.self.scores,
    manager_scores: r.evaluations.manager.scores,
    joint_scores: r.evaluations.joint.scores,
  };
}

function normScores(scores: Scores): string {
  const clean = Object.entries(scores)
    .map(([k, v]) => [k, v.score ?? null, (v.notes ?? '').trim() || null] as const)
    .filter(([, s, n]) => s !== null || n !== null)
    .sort(([a], [b]) => a.localeCompare(b));
  return JSON.stringify(clean);
}

function isSame(key: keyof Draft, a: unknown, b: unknown): boolean {
  if (key.endsWith('_scores')) return normScores(a as Scores) === normScores(b as Scores);
  const norm = (v: unknown) => (v === '' || v === undefined ? null : v);
  return norm(a) === norm(b);
}

const mean = (values: number[]) => (values.length ? Math.round((values.reduce((s, v) => s + v, 0) / values.length) * 100) / 100 : null);

// Mirrors Backend/services/performance_reviews.py::compute_averages.
function computeAverages(template: ReviewTemplate, scores: Scores) {
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

function ScorePicker({ value, onChange, min, max, disabled, activeClass }: {
  value: number | null; onChange: (v: number | null) => void; min: number; max: number; disabled: boolean; activeClass: string;
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
            value === n ? `${activeClass} text-white` : 'bg-background hover:bg-muted',
            disabled && 'cursor-not-allowed hover:bg-background',
            disabled && value !== n && 'opacity-50',
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
          disabled && 'opacity-50 cursor-not-allowed',
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

function LockedNote({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-muted-foreground pt-2 flex items-center gap-1.5"><Lock className="h-3.5 w-3.5 shrink-0" /> {children}</p>;
}

function StageStepper({ status }: { status: PerformanceReviewStatus }) {
  const current = STAGES.findIndex(s => s.status === status);
  return (
    <ol className="flex flex-wrap items-center gap-x-2 gap-y-2 text-xs">
      {STAGES.map((stage, i) => {
        const done = i < current || status === 'completed';
        const active = i === current && status !== 'completed';
        return (
          <li key={stage.status} className="flex items-center gap-2">
            <span className={cn(
              'flex h-6 w-6 items-center justify-center rounded-full border text-[11px] font-semibold',
              done && 'bg-emerald-600 border-emerald-600 text-white',
              active && 'border-primary text-primary ring-2 ring-primary/20',
              !done && !active && 'text-muted-foreground',
            )}>
              {done ? <Check className="h-3.5 w-3.5" /> : i + 1}
            </span>
            <span className={cn(active ? 'font-semibold text-foreground' : 'text-muted-foreground')}>{stage.label}</span>
            {i < STAGES.length - 1 && <span className="mx-1 h-px w-6 bg-border" />}
          </li>
        );
      })}
    </ol>
  );
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
  const [tab, setTab] = useState<EvaluationKey | null>(null);
  useEffect(() => { if (review) setDraft(toDraft(review)); }, [review]);

  const manage = hasEdit('reviews');
  const isReviewee = !!review && review.employee_id === employee?.id;
  const isReviewer = !!review && review.reviewer_id === employee?.id;
  const status = review?.status;
  const canEdit: Record<EvaluationKey, boolean> = {
    self: !!review && (manage || (isReviewee && status === 'self_assessment')),
    manager: !!review && (manage || (isReviewer && (status === 'self_assessment' || status === 'in_review'))),
    joint: !!review && (manage || (isReviewer && status === 'joint_review')),
  };

  // Default tab: whichever evaluation the caller is expected to work on now.
  useEffect(() => {
    if (!review || tab) return;
    if (review.status === 'joint_review' || review.status === 'completed') setTab('joint');
    else if (isReviewer || (manage && review.status === 'in_review')) setTab('manager');
    else setTab('self');
  }, [review, tab, isReviewer, manage]);

  const { data: logged, refetch: refetchHours, isFetching: hoursFetching } = useReviewLoggedHours({
    projectId: review?.project_id, employeeId: review?.employee_id,
    periodStart: draft?.period_start ?? undefined, periodEnd: draft?.period_end ?? undefined,
    enabled: false,
  });

  const allowed = useMemo(() => {
    const s = new Set<keyof Draft>();
    if (canEdit.self) EMPLOYEE_FIELDS.forEach(f => s.add(f));
    if (canEdit.manager) MANAGER_FIELDS.forEach(f => s.add(f));
    if (canEdit.joint) JOINT_FIELDS.forEach(f => s.add(f));
    if (manage) ADMIN_ONLY_FIELDS.forEach(f => s.add(f));
    return s;
  }, [canEdit.self, canEdit.manager, canEdit.joint, manage]);

  const patch = useMemo(() => {
    if (!review || !draft) return {};
    const base = toDraft(review);
    const out: Record<string, unknown> = {};
    (Object.keys(draft) as (keyof Draft)[]).forEach(k => {
      if (allowed.has(k) && !isSame(k, draft[k], base[k])) {
        const v = draft[k];
        out[k] = typeof v === 'string' && v.trim() === '' ? null : v;
      }
    });
    return out;
  }, [review, draft, allowed]);
  const isDirty = Object.keys(patch).length > 0;

  const averages = useMemo(() => {
    if (!template || !draft) return null;
    return {
      self: computeAverages(template, draft.self_scores),
      manager: computeAverages(template, draft.manager_scores),
      joint: computeAverages(template, draft.joint_scores),
    };
  }, [template, draft]);

  const reviewerOptions = useMemo(
    () => employees.filter(e => e.is_active && e.id !== review?.employee_id)
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(e => ({ id: e.id, label: e.name, sublabel: e.title ?? undefined })),
    [employees, review?.employee_id],
  );

  if (isLoading || (review && (!draft || !template || !tab))) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }
  if (error || !review || !draft || !template || !averages || !tab) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" className="gap-2" onClick={() => navigate('/reviews')}><ArrowLeft className="h-4 w-4" /> Back to reviews</Button>
        <p className="text-muted-foreground">This review doesn't exist or you don't have access to it.</p>
      </div>
    );
  }

  const visible = (k: EvaluationKey) => review.evaluations[k].visible;
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft(d => (d ? { ...d, [key]: value } : d));
  const setScore = (evaluation: EvaluationKey, subKey: string, change: Partial<ReviewScore>) =>
    setDraft(d => {
      if (!d) return d;
      const field = SCORE_FIELD[evaluation];
      const current = d[field][subKey] ?? { score: null, notes: null };
      return { ...d, [field]: { ...d[field], [subKey]: { ...current, ...change } } };
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

  async function runTransition(action: 'submit_self' | 'submit_manager' | 'complete' | 'reopen', confirmText: string, successText: string) {
    if (!confirm(confirmText)) return;
    if (!(await save(true))) return;
    try {
      await transition.mutateAsync({ id: review!.id, action });
      toast.success(successText);
      if (action === 'submit_manager' || action === 'complete') setTab('joint');
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
  const canSubmitSelf = review.status === 'self_assessment' && (isReviewee || manage);
  const canSubmitManager = review.status === 'in_review' && (isReviewer || manage);
  const canComplete = review.status === 'joint_review' && (isReviewer || manage);
  const canReopen = manage && review.status !== 'self_assessment';
  const canExport = manage || review.status === 'completed';
  const canEditEmployeeText = canEdit.self;

  const textArea = (field: TextField, editable: boolean, placeholder: string, rows = 3) =>
    editable ? (
      <Textarea value={draft[field] ?? ''} onChange={e => set(field, e.target.value)} placeholder={placeholder} rows={rows} className="resize-y" />
    ) : (
      <ReadOnlyText value={draft[field]} />
    );

  const lockedReason = (k: EvaluationKey) =>
    k === 'joint'
      ? 'The joint evaluation opens once the self and manager evaluations are submitted.'
      : k === 'self'
      ? 'The self evaluation is visible to the reviewer at the joint stage — evaluations are blind until then.'
      : 'The manager evaluation is visible to the employee at the joint stage — evaluations are blind until then.';

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
              onClick={() => runTransition('reopen', 'Move this review back one stage?', 'Review moved back one stage.')}>
              <RotateCcw className="h-4 w-4" /> Reopen
            </Button>
          )}
          {canExport && (
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
              onClick={() => runTransition('submit_self', "Submit your self evaluation to your manager? You won't be able to edit it afterwards.", 'Self evaluation submitted.')}>
              <Send className="h-4 w-4" /> Submit Self Evaluation
            </Button>
          )}
          {canSubmitManager && (
            <Button className="gap-2" disabled={busy}
              onClick={() => runTransition('submit_manager', 'Submit the manager evaluation and open the joint review? The joint scores start from yours, and both evaluations become visible to each other.', 'Manager evaluation submitted — ready for the joint review.')}>
              <Send className="h-4 w-4" /> Submit Manager Evaluation
            </Button>
          )}
          {canComplete && (
            <Button className="gap-2 bg-emerald-600 hover:bg-emerald-700" disabled={busy}
              onClick={() => runTransition('complete', 'Complete this review? The joint evaluation becomes the official score for the annual measurement.', 'Review completed.')}>
              <CheckCircle2 className="h-4 w-4" /> Complete Review
            </Button>
          )}
        </div>
      </div>

      <Card className="card-elevated">
        <CardContent className="p-4"><StageStepper status={review.status} /></CardContent>
      </Card>

      {/* Project details + average score */}
      <div className="grid gap-6 xl:grid-cols-[1fr_400px]">
        <Card className={cn('card-elevated', EMPLOYEE_ACCENT)}>
          <CardHeader className="pb-2"><CardTitle className="text-base">Project Details</CardTitle></CardHeader>
          <CardContent>
            <FieldRow label="Review for"><p className="text-sm pt-2">{review.employee_name}</p></FieldRow>
            <FieldRow label="Project Name"><p className="text-sm pt-2">{review.project_name}{review.client_name ? ` (${review.client_name})` : ''}</p></FieldRow>
            <FieldRow label="Reviewer">
              {manage ? (
                <SearchableCombobox options={reviewerOptions} value={draft.reviewer_id} onChange={id => set('reviewer_id', id)} placeholder="Select reviewer..." clearable />
              ) : <ReadOnlyText value={review.reviewer_name} />}
            </FieldRow>
            <FieldRow label="Project Description">{textArea('project_description', canEditEmployeeText, 'Brief description of the project')}</FieldRow>
            <FieldRow label="Employee's Role / Key Activities">{textArea('employee_role', canEditEmployeeText, 'Your role and the key activities you performed', 4)}</FieldRow>
            <FieldRow label="Duration">
              {manage ? (
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
            {manage && (
              <FieldRow label="Period (for hours)">
                <div className="flex flex-wrap items-center gap-2">
                  <Input type="date" className="w-40" value={draft.period_start ?? ''} onChange={e => set('period_start', e.target.value || null)} />
                  <span className="text-sm text-muted-foreground">to</span>
                  <Input type="date" className="w-40" value={draft.period_end ?? ''} onChange={e => set('period_end', e.target.value || null)} />
                </div>
              </FieldRow>
            )}
            <FieldRow label="Date of Review">
              {manage ? (
                <Input type="date" className="w-40" value={draft.review_date ?? ''} onChange={e => e.target.value && set('review_date', e.target.value)} />
              ) : <ReadOnlyText value={format(new Date(`${review.review_date}T00:00:00`), 'MM/dd/yyyy')} />}
            </FieldRow>
          </CardContent>
        </Card>

        <Card className="card-elevated h-fit">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Average Score</CardTitle>
            <p className="text-xs text-muted-foreground">Only the joint evaluation counts toward the annual measurement.</p>
          </CardHeader>
          <CardContent className="p-0 pb-2">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-xs text-muted-foreground">
                  <th className="text-left font-medium px-4 py-2">Criteria</th>
                  {EVALUATIONS.map(k => (
                    <th key={k} className={cn('font-medium px-2 py-2 text-center', k === 'joint' && 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300')}>
                      {EVALUATION_META[k].short}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {template.criteria.map((c, i) => (
                  <tr key={c.key} className="border-b last:border-b-0">
                    <td className="px-4 py-2">{c.short_label}</td>
                    {EVALUATIONS.map(k => (
                      <td key={k} className={cn('px-2 py-2 text-center tabular-nums', k === 'joint' && 'bg-emerald-50 dark:bg-emerald-950/40 font-semibold')}>
                        {visible(k) ? fmtAvg(averages[k].criteria[i].average) : <Lock className="h-3.5 w-3.5 mx-auto text-muted-foreground" />}
                      </td>
                    ))}
                  </tr>
                ))}
                <tr className="border-t-2">
                  <td className="px-4 py-2.5 font-semibold">Average Total</td>
                  {EVALUATIONS.map(k => (
                    <td key={k} className={cn('px-2 py-2.5 text-center tabular-nums font-semibold', k === 'joint' && 'bg-emerald-50 dark:bg-emerald-950/40 text-lg text-emerald-700 dark:text-emerald-400 font-bold')}>
                      {visible(k) ? fmtAvg(averages[k].overall) : <Lock className="h-3.5 w-3.5 mx-auto text-muted-foreground" />}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
            <p className="px-4 pt-3 text-xs text-muted-foreground">
              Scale {template.score_min}–{template.score_max}. Each criterion averages its rated items; the total averages the criteria.
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Self assessment (text) */}
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
                {isReviewee || manage || review.status !== 'self_assessment'
                  ? textArea(selfKey, canEditEmployeeText, `Your ${label.toLowerCase()}`)
                  : <LockedNote>Visible once the employee submits</LockedNote>}
              </div>
              <div className="space-y-1">
                <div className="text-xs font-medium text-emerald-700 dark:text-emerald-400">Reviewer notes</div>
                {visible('manager')
                  ? textArea(reviewerKey, canEdit.manager, 'Reviewer comments')
                  : <LockedNote>Visible at the joint review</LockedNote>}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* The three evaluations */}
      <Card className={cn('card-elevated', REVIEWER_ACCENT)}>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Evaluations</CardTitle>
          <p className="text-xs text-muted-foreground">
            Rate each item from {template.score_min} to {template.score_max}; leave N/A when it doesn't apply to this project.
          </p>
        </CardHeader>
        <CardContent>
          <Tabs value={tab} onValueChange={v => setTab(v as EvaluationKey)}>
            <TabsList className="h-auto flex-wrap">
              {EVALUATIONS.map(k => (
                <TabsTrigger key={k} value={k} className="gap-2">
                  <span className={cn('h-2.5 w-2.5 rounded-full', EVALUATION_META[k].dot)} />
                  {EVALUATION_META[k].label}
                  {!visible(k) && <Lock className="h-3 w-3" />}
                  {visible(k) && averages[k].overall != null && <span className="tabular-nums text-muted-foreground">· {fmtAvg(averages[k].overall)}</span>}
                </TabsTrigger>
              ))}
            </TabsList>

            {EVALUATIONS.map(k => {
              const field = SCORE_FIELD[k];
              const editable = canEdit[k];
              const meta = EVALUATION_META[k];
              return (
                <TabsContent key={k} value={k} className="mt-4 space-y-5">
                  <p className="text-sm text-muted-foreground">
                    <span className={cn('font-medium', meta.text)}>{meta.label}</span> — {meta.who}.
                    {!editable && visible(k) && ' Read-only at this stage.'}
                  </p>
                  {!visible(k) ? (
                    <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground">
                      <Lock className="h-5 w-5" /> {lockedReason(k)}
                    </div>
                  ) : (
                    <>
                      {k === 'joint' && (
                        <div className="space-y-1.5">
                          <div className="text-sm font-semibold">Joint review notes</div>
                          {textArea('joint_notes', editable, 'What was agreed in the joint session', 2)}
                        </div>
                      )}
                      {template.criteria.map((criterion, ci) => (
                        <div key={criterion.key} className="rounded-lg border overflow-hidden">
                          <div className="flex items-center justify-between bg-emerald-50 dark:bg-emerald-950/40 px-4 py-2.5">
                            <span className="font-semibold text-sm">{criterion.label}</span>
                            <span className="text-sm">Average: <span className="font-bold tabular-nums">{fmtAvg(averages[k].criteria[ci].average)}</span></span>
                          </div>
                          <div className="divide-y">
                            {criterion.sub_criteria.map(sub => {
                              const entry = draft[field][sub.key] ?? { score: null, notes: null };
                              const selfScore = draft.self_scores[sub.key]?.score;
                              const managerScore = draft.manager_scores[sub.key]?.score;
                              return (
                                <div key={sub.key} className="grid gap-3 px-4 py-3 lg:grid-cols-[1fr_250px_1fr]">
                                  <div className="space-y-1.5">
                                    <p className="text-sm whitespace-pre-line">{sub.label}</p>
                                    {k === 'joint' && (
                                      <div className="flex gap-3 text-xs text-muted-foreground">
                                        <span>Self: <span className="font-semibold tabular-nums text-sky-700 dark:text-sky-400">{selfScore ?? '—'}</span></span>
                                        <span>Manager: <span className="font-semibold tabular-nums text-amber-700 dark:text-amber-400">{managerScore ?? '—'}</span></span>
                                      </div>
                                    )}
                                  </div>
                                  <ScorePicker value={entry.score} onChange={v => setScore(k, sub.key, { score: v })}
                                    min={template.score_min} max={template.score_max} disabled={!editable} activeClass={meta.ring} />
                                  {editable ? (
                                    <Textarea value={entry.notes ?? ''} onChange={e => setScore(k, sub.key, { notes: e.target.value })}
                                      placeholder="Notes (optional)" rows={2} className="resize-y" />
                                  ) : <ReadOnlyText value={entry.notes} placeholder="" />}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </>
                  )}
                </TabsContent>
              );
            })}
          </Tabs>
        </CardContent>
      </Card>

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
