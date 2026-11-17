import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { ArrowLeft, ChevronDown, Download, Loader2, Lock, RotateCcw, Save, Send, CheckCircle2, RefreshCw, Check, X } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import {
  usePerformanceReview, useReviewTemplate, useUpdatePerformanceReview, useTransitionPerformanceReview,
  useReviewLoggedHours, downloadReviewXlsx, REVIEW_STATUS_BADGE, EVALUATION_META, ReviewTransitionAction,
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
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

// Same convention as the review workbook: employees complete the blue
// sections, reviewers the green ones.
const EMPLOYEE_ACCENT = 'border-l-4 border-l-sky-500';
const REVIEWER_ACCENT = 'border-l-4 border-l-emerald-600';

const EVALUATIONS: EvaluationKey[] = ['self', 'manager'];

const STAGES: { status: PerformanceReviewStatus; label: string }[] = [
  { status: 'self_assessment', label: 'Self evaluation' },
  { status: 'in_review', label: 'Manager Review' },
  { status: 'completed', label: 'Completed' },
];

type Scores = Record<string, ReviewScore>;
type Draft = {
  reviewer_ids: string[];
  review_date: string;
  self_due_date: string | null;
  period_start: string | null;
  period_end: string | null;
  duration_hours: number | null;
  project_description: string | null;
  employee_role: string | null;
  self_strengths: string | null;
  self_improvement: string | null;
  self_development: string | null;
  self_section_comments: Record<string, string>;
  // The shared Manager Review.
  manager_scores: Scores;
  manager_notes: string | null;
  manager_strengths_notes: string | null;
  manager_improvement_notes: string | null;
  manager_development_notes: string | null;
};
type TextField =
  | 'project_description' | 'employee_role' | 'self_strengths' | 'self_improvement' | 'self_development'
  | 'manager_notes' | 'manager_strengths_notes' | 'manager_improvement_notes' | 'manager_development_notes';

// Mirrors Backend/services/performance_reviews.py field groups.
const EMPLOYEE_FIELDS: (keyof Draft)[] = ['project_description', 'employee_role', 'self_strengths', 'self_improvement', 'self_development', 'self_section_comments'];
const MANAGER_FIELDS: (keyof Draft)[] = ['manager_scores', 'manager_notes', 'manager_strengths_notes', 'manager_improvement_notes', 'manager_development_notes'];
const ADMIN_ONLY_FIELDS: (keyof Draft)[] = ['reviewer_ids', 'review_date', 'self_due_date', 'period_start', 'period_end', 'duration_hours'];

function toDraft(r: PerformanceReview): Draft {
  const m = r.evaluations.manager;
  return {
    reviewer_ids: r.reviewers.map(rr => rr.reviewer_id),
    review_date: r.review_date,
    self_due_date: r.self_due_date,
    period_start: r.period_start,
    period_end: r.period_end,
    duration_hours: r.duration_hours,
    project_description: r.project_description,
    employee_role: r.employee_role,
    self_strengths: r.self_strengths,
    self_improvement: r.self_improvement,
    self_development: r.self_development,
    self_section_comments: r.evaluations.self.section_comments ?? {},
    manager_scores: m.scores,
    manager_notes: m.notes,
    manager_strengths_notes: m.strengths_notes,
    manager_improvement_notes: m.improvement_notes,
    manager_development_notes: m.development_notes,
  };
}

function normEntry(v: ReviewScore | undefined): string {
  // A {score: null, notes: null} entry is an explicit N/A (see
  // ScorePicker/naSelected) — distinct from an absent (untouched) item.
  return v === undefined ? 'absent' : JSON.stringify([v.score ?? null, (v.notes ?? '').trim() || null]);
}

/** Only the items that differ from the saved version — the backend merges
 * them into the stored Manager Review, so several reviewers saving different
 * items don't overwrite each other. */
function changedScores(draft: Scores, base: Scores): Scores {
  const out: Scores = {};
  Object.entries(draft).forEach(([k, v]) => {
    if (normEntry(v) !== normEntry(base[k])) out[k] = v;
  });
  return out;
}

function normText(v: unknown): unknown {
  return v === '' || v === undefined ? null : v;
}

function normComments(comments: Record<string, string>): string {
  const clean = Object.entries(comments)
    .map(([k, v]) => [k, (v ?? '').trim()] as const)
    .filter(([, v]) => v !== '')
    .sort(([a], [b]) => a.localeCompare(b));
  return JSON.stringify(clean);
}

function sameIdSet(a: string[], b: string[]): boolean {
  return JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
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

function ScorePicker({ value, onChange, min, max, disabled, activeClass, naSelected }: {
  value: number | null; onChange: (v: number | null) => void; min: number; max: number; disabled: boolean; activeClass: string;
  // Whether N/A was *explicitly* chosen for this item, as opposed to it
  // simply never having been rated — both look like `value == null`, so
  // without this the N/A button appears "already selected" on every
  // untouched item and clicking it shows no visible change.
  naSelected: boolean;
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
          aria-label={`Score ${n}${n === min ? ' (best)' : n === max ? ' (worst)' : ''}`}
          title={n === min ? 'Best' : n === max ? 'Worst' : undefined}
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
          naSelected ? `${activeClass} text-white` : 'bg-background text-muted-foreground hover:bg-muted',
          disabled && 'opacity-50 cursor-not-allowed',
        )}
        aria-pressed={naSelected}
        title="Not applicable — excluded from the average"
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
  const { data: template } = useReviewTemplate(review?.evaluation_format, !!review);
  const { data: employees = [] } = useEmployees();
  const updateReview = useUpdatePerformanceReview();
  const transition = useTransitionPerformanceReview();

  const [draft, setDraft] = useState<Draft | null>(null);
  const [tab, setTab] = useState<EvaluationKey | null>(null);
  useEffect(() => { if (review) setDraft(toDraft(review)); }, [review]);

  const manage = hasEdit('reviews');
  const isReviewee = !!review && review.employee_id === employee?.id;
  const isReviewer = !!review && review.reviewers.some(r => r.reviewer_id === employee?.id);
  const status = review?.status;
  const canEdit: Record<EvaluationKey, boolean> = {
    self: !!review && (manage || (isReviewee && status === 'self_assessment' && !review.self_locked)),
    // Every assigned reviewer edits the same Manager Review, from the moment
    // the self-assessment is submitted until the review is completed.
    manager: isReviewer && status === 'in_review',
  };

  // Default tab: whichever evaluation the caller is expected to work on now.
  useEffect(() => {
    if (!review || tab) return;
    if (review.status === 'completed' || (isReviewer && review.status === 'in_review')) setTab('manager');
    else setTab('self');
  }, [review, tab, isReviewer]);

  const { data: logged, refetch: refetchHours, isFetching: hoursFetching } = useReviewLoggedHours({
    projectId: review?.project_id, employeeId: review?.employee_id,
    periodStart: draft?.period_start ?? undefined, periodEnd: draft?.period_end ?? undefined,
    enabled: false,
  });

  const allowed = useMemo(() => {
    const s = new Set<string>();
    if (canEdit.self) EMPLOYEE_FIELDS.forEach(f => s.add(f));
    if (canEdit.manager) MANAGER_FIELDS.forEach(f => s.add(f));
    if (manage) ADMIN_ONLY_FIELDS.forEach(f => s.add(f));
    return s;
  }, [canEdit.self, canEdit.manager, manage]);

  const patch = useMemo(() => {
    if (!review || !draft) return {};
    const base = toDraft(review);
    const out: Record<string, unknown> = {};
    (Object.keys(draft) as (keyof Draft)[]).forEach(k => {
      if (!allowed.has(k)) return;
      if (k === 'reviewer_ids') {
        if (!sameIdSet(draft.reviewer_ids, base.reviewer_ids)) out.reviewer_ids = draft.reviewer_ids;
        return;
      }
      if (k === 'manager_scores') {
        const changed = changedScores(draft.manager_scores, base.manager_scores);
        if (Object.keys(changed).length > 0) out.manager_scores = changed;
        return;
      }
      if (k === 'self_section_comments') {
        if (normComments(draft.self_section_comments) !== normComments(base.self_section_comments)) out[k] = draft[k];
        return;
      }
      if (normText(draft[k]) !== normText(base[k])) {
        const v = draft[k];
        out[k] = typeof v === 'string' && v.trim() === '' ? null : v;
      }
    });
    return out;
  }, [review, draft, allowed]);
  const isDirty = Object.keys(patch).length > 0;

  const averages = useMemo(() => {
    if (!template || !draft || !review) return null;
    return {
      // Self no longer scores anything new, but an older review scored under
      // the previous format may still carry some — shown read-only.
      self: computeAverages(template, review.evaluations.self.scores),
      manager: computeAverages(template, draft.manager_scores),
    };
  }, [template, draft, review]);

  const reviewerOptions = useMemo(
    () => employees.filter(e => e.is_active && e.id !== review?.employee_id && !draft?.reviewer_ids.includes(e.id))
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(e => ({ id: e.id, label: e.name, sublabel: e.title ?? undefined })),
    [employees, review?.employee_id, draft?.reviewer_ids],
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
  const setScore = (subKey: string, change: Partial<ReviewScore>) =>
    setDraft(d => {
      if (!d) return d;
      const current = d.manager_scores[subKey] ?? { score: null, notes: null };
      return { ...d, manager_scores: { ...d.manager_scores, [subKey]: { ...current, ...change } } };
    });
  const setSelfComment = (criterionKey: string, value: string) =>
    setDraft(d => (d ? { ...d, self_section_comments: { ...d.self_section_comments, [criterionKey]: value } } : d));

  function discard() {
    setDraft(toDraft(review!));
  }

  async function save(silent = false): Promise<boolean> {
    if (!isDirty) return true;
    try {
      await updateReview.mutateAsync({ id: review!.id, data: patch as any });
      if (!silent) toast.success('Review saved.');
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message.replace(/^API error \d+: /, '') : 'Failed to save review.');
      return false;
    }
  }

  async function runTransition(action: ReviewTransitionAction, confirmText: string, successText: string) {
    if (!confirm(confirmText)) return;
    if (!(await save(true))) return;
    try {
      await transition.mutateAsync({ id: review!.id, action });
      toast.success(successText);
      setTab(action === 'reopen_self' ? 'self' : 'manager');
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
  // Each submit/complete action also requires being ON that evaluation's own
  // tab — these buttons live in the page header, outside the tabbed area, so
  // a reviewer reading the Self tab can't complete the review by accident.
  const canSubmitSelf = tab === 'self' && review.status === 'self_assessment' && (isReviewee || manage);
  const canComplete = tab === 'manager' && review.status === 'in_review' && (isReviewer || manage);
  const canReopenSelf = manage && review.status !== 'self_assessment';
  const canReopenManager = manage && review.status === 'completed';
  const canExport = manage || review.status === 'completed';
  const canEditEmployeeText = canEdit.self;
  const reviewers = review.reviewers;

  const textArea = (field: TextField, editable: boolean, placeholder: string, rows = 3) =>
    editable ? (
      <Textarea value={draft[field] ?? ''} onChange={e => set(field, e.target.value)} placeholder={placeholder} rows={rows} className="resize-y" />
    ) : (
      <ReadOnlyText value={draft[field]} />
    );

  const lockedReason = (k: EvaluationKey) =>
    k === 'self'
      ? 'The self evaluation becomes visible to the assigned reviewer(s) and Admin/Manager once the employee submits it.'
      : 'The Manager Review is written by the assigned reviewer(s) and becomes visible once the review is completed.';

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
            <Badge variant="outline">{template.format_label}</Badge>
          </div>
          <p className="text-muted-foreground">
            {review.project_name}{review.client_name ? ` · ${review.client_name}` : ''} · reviewed by{' '}
            {reviewers.length > 0 ? reviewers.map(r => r.reviewer_name).join(', ') : 'unassigned'}
          </p>
          {review.status === 'self_assessment' && review.self_due_date && (
            <p className={cn('text-xs flex items-center gap-1.5', review.self_locked ? 'text-destructive font-medium' : 'text-muted-foreground')}>
              <Lock className="h-3 w-3" />
              {review.self_locked
                ? `Self evaluation deadline (${format(new Date(`${review.self_due_date}T00:00:00`), 'MMM d, yyyy')}) has passed.`
                : `Self evaluation due ${format(new Date(`${review.self_due_date}T00:00:00`), 'MMM d, yyyy')}.`}
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {(canReopenSelf || canReopenManager) && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="gap-2" disabled={busy}>
                  <RotateCcw className="h-4 w-4" /> Reopen <ChevronDown className="h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {canReopenSelf && (
                  <DropdownMenuItem onClick={() => runTransition(
                    'reopen_self',
                    'Reopen the self evaluation? The employee will be able to edit and resubmit it — the Manager Review is left exactly as it is.',
                    'Self evaluation reopened.',
                  )}>
                    Reopen Self Evaluation
                  </DropdownMenuItem>
                )}
                {canReopenManager && (
                  <DropdownMenuItem onClick={() => runTransition(
                    'reopen_manager',
                    'Reopen the Manager Review? Reviewers will be able to edit it again, and this review won\'t count toward the annual measurement until it\'s completed again.',
                    'Manager Review reopened.',
                  )}>
                    Reopen Manager Review
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
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
          {canComplete && (
            <Button className="gap-2 bg-emerald-600 hover:bg-emerald-700" disabled={busy || averages.manager.overall == null}
              title={averages.manager.overall == null ? 'Rate at least one item before completing.' : undefined}
              onClick={() => runTransition('complete', 'Complete this review? The Manager Review becomes final and counts toward the annual measurement. No reviewer can edit it afterwards.', 'Review completed.')}>
              <CheckCircle2 className="h-4 w-4" /> Complete Review
            </Button>
          )}
        </div>
      </div>

      {/* Self / Manager Review — the primary navigation for this whole page:
          everything below follows whichever one is selected here. */}
      <Tabs value={tab} onValueChange={v => setTab(v as EvaluationKey)}>
        <TabsList className="w-full h-auto justify-start gap-6 rounded-none border-b bg-transparent p-0">
          {EVALUATIONS.map(k => (
            <TabsTrigger
              key={k}
              value={k}
              className={cn(
                'gap-2 rounded-none border-b-2 border-transparent bg-transparent px-1 pb-3 pt-1 text-base font-semibold text-muted-foreground shadow-none transition-colors',
                'data-[state=active]:bg-transparent data-[state=active]:shadow-none',
                EVALUATION_META[k].activeTab,
              )}
            >
              <span className={cn('h-2.5 w-2.5 rounded-full', EVALUATION_META[k].dot)} />
              {EVALUATION_META[k].label}
              {!visible(k) && <Lock className="h-3.5 w-3.5" />}
              {visible(k) && averages[k].overall != null && (
                <span className="tabular-nums text-muted-foreground font-normal">· {fmtAvg(averages[k].overall)}</span>
              )}
            </TabsTrigger>
          ))}
        </TabsList>

      {/* Prominent "whose evaluation is this" banner. */}
      <div className={cn(
        'flex flex-wrap items-center gap-3 rounded-lg border-2 px-4 py-3',
        tab === 'self' && 'border-sky-300 bg-sky-50 dark:border-sky-800 dark:bg-sky-950/40',
        tab === 'manager' && 'border-emerald-300 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/40',
      )}>
        <span className={cn('h-3 w-3 shrink-0 rounded-full', EVALUATION_META[tab].dot)} />
        <div className="min-w-0">
          <p className={cn('text-base font-bold', EVALUATION_META[tab].text)}>{EVALUATION_META[tab].label}</p>
          <p className="text-xs text-muted-foreground">
            {tab === 'manager' && reviewers.length > 0
              ? `Shared by ${reviewers.map(r => r.reviewer_name).filter(Boolean).join(', ')} — official`
              : EVALUATION_META[tab].who}
          </p>
        </div>
        {!visible(tab) && (
          <span className="ml-auto flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <Lock className="h-3.5 w-3.5" /> {lockedReason(tab)}
          </span>
        )}
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
            <FieldRow label={reviewers.length === 1 ? 'Reviewer' : 'Reviewers'}>
              {manage ? (
                <div className="space-y-2">
                  {draft.reviewer_ids.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {draft.reviewer_ids.map(id => {
                        const emp = employees.find(e => e.id === id);
                        return (
                          <Badge key={id} variant="secondary" className="gap-1.5 pr-1 font-normal">
                            {emp?.name ?? id}
                            <button type="button" className="hover:text-destructive" title="Remove reviewer"
                              onClick={() => set('reviewer_ids', draft.reviewer_ids.filter(x => x !== id))}>
                              <X className="h-3 w-3" />
                            </button>
                          </Badge>
                        );
                      })}
                    </div>
                  )}
                  <SearchableCombobox options={reviewerOptions} value={null}
                    onChange={id => { if (id) set('reviewer_ids', [...draft.reviewer_ids, id]); }}
                    placeholder="Add a reviewer..." />
                </div>
              ) : <ReadOnlyText value={reviewers.map(r => r.reviewer_name).filter(Boolean).join(', ') || null} />}
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
            <FieldRow label="Self-Assessment Due">
              {manage ? (
                <div className="flex flex-wrap items-center gap-2">
                  <Input type="date" className="w-40" value={draft.self_due_date ?? ''} onChange={e => set('self_due_date', e.target.value || null)} />
                  <span className="text-xs text-muted-foreground">Past this date the employee can no longer edit/submit it themselves.</span>
                </div>
              ) : <ReadOnlyText value={review.self_due_date ? format(new Date(`${review.self_due_date}T00:00:00`), 'MM/dd/yyyy') : null} placeholder="No deadline" />}
            </FieldRow>
          </CardContent>
        </Card>

        <Card className="card-elevated h-fit">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Average Score</CardTitle>
            <p className="text-xs text-muted-foreground">The Manager Review is the official score for the annual measurement.</p>
          </CardHeader>
          <CardContent className="p-0 pb-2">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-xs text-muted-foreground">
                  <th className="text-left font-medium px-4 py-2">Criteria</th>
                  <th className="font-medium px-2 py-2 text-center bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300">Manager Review</th>
                </tr>
              </thead>
              <tbody>
                {template.criteria.map((c, i) => (
                  <tr key={c.key} className="border-b last:border-b-0">
                    <td className="px-4 py-2">{c.short_label}</td>
                    <td className="px-2 py-2 text-center tabular-nums bg-emerald-50 dark:bg-emerald-950/40 font-semibold">
                      {visible('manager') ? fmtAvg(averages.manager.criteria[i].average) : <Lock className="h-3.5 w-3.5 mx-auto text-muted-foreground" />}
                    </td>
                  </tr>
                ))}
                <tr className="border-t-2">
                  <td className="px-4 py-2.5 font-semibold">Average Total</td>
                  <td className="px-2 py-2.5 text-center tabular-nums bg-emerald-50 dark:bg-emerald-950/40 text-lg text-emerald-700 dark:text-emerald-400 font-bold">
                    {visible('manager') ? fmtAvg(averages.manager.overall) : <Lock className="h-3.5 w-3.5 mx-auto text-muted-foreground" />}
                  </td>
                </tr>
              </tbody>
            </table>
            <p className="px-4 pt-3 text-xs text-muted-foreground">
              Scale {template.score_min} (best) – {template.score_max} (worst). Each criterion averages its rated items; the total averages the criteria — lower is better.
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Self assessment (text) + the Manager Review's notes on it */}
      <Card className={cn('card-elevated', EMPLOYEE_ACCENT)}>
        <CardHeader className="pb-2"><CardTitle className="text-base">Self Assessment</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {([
            ['Strengths', 'self_strengths', 'manager_strengths_notes'],
            ['Areas for Improvement', 'self_improvement', 'manager_improvement_notes'],
            ['Personal Development Needs', 'self_development', 'manager_development_notes'],
          ] as const).map(([label, selfKey, managerKey]) => (
            <div key={selfKey} className="grid gap-3 lg:grid-cols-[200px_1fr_1fr] border-b pb-4 last:border-b-0 last:pb-0">
              <div className="text-sm font-semibold pt-2">{label}</div>
              <div className="space-y-1">
                <div className="text-xs font-medium text-sky-700 dark:text-sky-400">Self-assessment notes</div>
                {visible('self')
                  ? textArea(selfKey, canEditEmployeeText, `Your ${label.toLowerCase()}`)
                  : <LockedNote>Visible once the employee submits their self evaluation</LockedNote>}
              </div>
              <div className="space-y-1">
                <div className="text-xs font-medium text-emerald-700 dark:text-emerald-400">Reviewer notes</div>
                {visible('manager')
                  ? textArea(managerKey, canEdit.manager, 'Reviewer comments')
                  : <LockedNote>Visible once the review is completed</LockedNote>}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* The evaluations */}
      <Card className={cn('card-elevated', REVIEWER_ACCENT)}>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Evaluations</CardTitle>
          <p className="text-xs text-muted-foreground">
            {tab === 'self'
              ? "Write a comment for each section below based on the items listed — you're not asked to assign yourself a score."
              : `Rate each item from ${template.score_min} (best) to ${template.score_max} (worst); leave N/A when it doesn't apply to this project. Every assigned reviewer edits this same evaluation.`}
          </p>
        </CardHeader>
        <CardContent>
            {EVALUATIONS.map(k => {
              const editable = canEdit[k];
              const meta = EVALUATION_META[k];
              return (
                <TabsContent key={k} value={k} className="mt-4 space-y-5">
                  {!editable && visible(k) && (
                    <p className="text-sm text-muted-foreground">
                      {k === 'manager' && review.status === 'self_assessment'
                        ? 'Read-only until the employee submits their self evaluation.'
                        : 'Read-only at this stage.'}
                    </p>
                  )}
                  {k === 'manager' && canComplete && (
                    <p className="text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 rounded-md px-3 py-2">
                      Save keeps your scores, but this review only counts toward Analytics once someone clicks
                      <span className="font-semibold"> Complete Review</span> above.
                    </p>
                  )}
                  {k === 'manager' && reviewers.length === 0 ? (
                    <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground">
                      No reviewer assigned yet.
                    </div>
                  ) : !visible(k) ? (
                    <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground">
                      <Lock className="h-5 w-5" /> {lockedReason(k)}
                    </div>
                  ) : k === 'self' ? (
                    // No scoring for self — the sub-criteria are a read-only
                    // reading guide, and the employee leaves one free-text
                    // comment at the end of each section.
                    <>
                      {template.criteria.map(criterion => (
                        <div key={criterion.key} className="rounded-lg border overflow-hidden">
                          <div className="bg-sky-50 dark:bg-sky-950/40 px-4 py-2.5">
                            <span className="font-semibold text-sm">{criterion.label}</span>
                          </div>
                          <ul className="divide-y">
                            {criterion.sub_criteria.map(sub => (
                              <li key={sub.key} className="px-4 py-2.5 text-sm text-muted-foreground whitespace-pre-line">{sub.label}</li>
                            ))}
                          </ul>
                          <div className="px-4 py-3 border-t bg-muted/30 space-y-1.5">
                            <div className="text-xs font-medium text-sky-700 dark:text-sky-400">Your comment on {criterion.label.toLowerCase()}</div>
                            {editable ? (
                              <Textarea
                                value={draft.self_section_comments[criterion.key] ?? ''}
                                onChange={e => setSelfComment(criterion.key, e.target.value)}
                                placeholder="What stands out for this section?" rows={3} className="resize-y bg-background"
                              />
                            ) : <ReadOnlyText value={draft.self_section_comments[criterion.key]} />}
                          </div>
                        </div>
                      ))}
                    </>
                  ) : (
                    <>
                      <div className="space-y-1.5">
                        <div className="text-sm font-semibold">Manager Review notes</div>
                        {textArea('manager_notes', editable, 'Overall comments on this review', 2)}
                      </div>
                      {template.criteria.map((criterion, ci) => (
                        <div key={criterion.key} className="rounded-lg border overflow-hidden">
                          <div className="flex items-center justify-between bg-emerald-50 dark:bg-emerald-950/40 px-4 py-2.5">
                            <span className="font-semibold text-sm">{criterion.label}</span>
                            <span className="text-sm">Average: <span className="font-bold tabular-nums">{fmtAvg(averages.manager.criteria[ci].average)}</span></span>
                          </div>
                          <div className="divide-y">
                            {criterion.sub_criteria.map(sub => {
                              const entry = draft.manager_scores[sub.key] ?? { score: null, notes: null };
                              // Present in the map at all (loaded from the server, or
                              // touched this session) means someone has actually looked
                              // at it — vs. simply never having been rated yet.
                              const touched = sub.key in draft.manager_scores;
                              return (
                                <div key={sub.key} className="grid gap-3 px-4 py-3 lg:grid-cols-[1fr_250px_1fr]">
                                  <p className="text-sm whitespace-pre-line">{sub.label}</p>
                                  <ScorePicker value={entry.score} onChange={v => setScore(sub.key, { score: v })}
                                    min={template.score_min} max={template.score_max} disabled={!editable} activeClass={meta.ring}
                                    naSelected={touched && entry.score == null} />
                                  {editable ? (
                                    <Textarea value={entry.notes ?? ''} onChange={e => setScore(sub.key, { notes: e.target.value })}
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
        </CardContent>
      </Card>
      </Tabs>

      {isDirty && (
        <div className="fixed bottom-4 right-4 z-40 flex items-center gap-3 rounded-lg border bg-background px-4 py-3 shadow-lg">
          <span className="text-sm text-muted-foreground">Unsaved changes</span>
          <Button size="sm" variant="ghost" onClick={discard} disabled={busy}>Discard</Button>
          <Button size="sm" className="gap-1.5" onClick={() => save()} disabled={busy}>
            {updateReview.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Save
          </Button>
        </div>
      )}
    </div>
  );
}
