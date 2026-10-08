import { Fragment, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronDown, ChevronRight, Loader2, Search, ClipboardCheck, Users, Star, Scale } from 'lucide-react';
import { useReviewAnalytics, useReviewTemplate, EVALUATION_META } from '@/hooks/usePerformanceReviews';
import { AnalyticsReview, EvaluationKey, ReviewTemplate } from '@/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';

// Official numbers here are always the JOINT evaluation: a review's score is
// its joint overall average, and an employee's annual measurement is the plain
// mean of their completed reviews' joint overall averages in the year
// (Backend/services/performance_reviews.py::analytics). Self/manager only
// appear in the Items view, to compare how each side rated.

type View = 'employees' | 'projects' | 'items';

const mean = (values: (number | null | undefined)[]): number | null => {
  const v = values.filter((x): x is number => x != null);
  return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null;
};
const fmt = (v: number | null) => (v == null ? '' : v.toFixed(2));

interface MatrixRow {
  id: string;
  name: string;
  sublabel?: string | null;
  count: number;
  criteria: (number | null)[];
  total: number | null;
  children: { id: string; name: string; sublabel?: string | null; criteria: (number | null)[]; total: number | null; reviewId: string }[];
}

function groupRows(
  reviews: AnalyticsReview[],
  template: ReviewTemplate,
  keyOf: (r: AnalyticsReview) => string,
  labelOf: (r: AnalyticsReview) => { name: string; sublabel?: string | null },
  childOf: (r: AnalyticsReview) => { name: string; sublabel?: string | null },
): MatrixRow[] {
  const groups = new Map<string, AnalyticsReview[]>();
  reviews.forEach(r => {
    const k = keyOf(r);
    groups.set(k, [...(groups.get(k) ?? []), r]);
  });
  return Array.from(groups.entries()).map(([id, rs]) => ({
    id,
    ...labelOf(rs[0]),
    count: rs.length,
    criteria: template.criteria.map(c => mean(rs.map(r => r.joint.criteria[c.key]))),
    total: mean(rs.map(r => r.joint.overall)),
    children: rs.map(r => ({
      id: r.id,
      reviewId: r.id,
      ...childOf(r),
      criteria: template.criteria.map(c => r.joint.criteria[c.key] ?? null),
      total: r.joint.overall,
    })),
  })).sort((a, b) => a.name.localeCompare(b.name));
}

function KpiCard({ label, value, hint, icon: Icon }: { label: string; value: string; hint?: string; icon: typeof Users }) {
  return (
    <Card className="card-elevated">
      <CardContent className="flex items-center gap-4 p-4">
        <div className="rounded-lg bg-primary/10 p-2.5 text-primary"><Icon className="h-5 w-5" /></div>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-2xl font-bold tabular-nums">{value}</p>
          {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

export default function ReviewAnalytics() {
  const navigate = useNavigate();
  const { data: template } = useReviewTemplate();
  const [year, setYear] = useState<number | null>(null);
  const [yearInitialized, setYearInitialized] = useState(false);
  const { data, isLoading } = useReviewAnalytics(year);
  const [view, setView] = useState<View>('employees');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // Start on the most recent year that has completed reviews.
  useEffect(() => {
    if (!yearInitialized && data) {
      setYearInitialized(true);
      if (data.years.length) setYear(data.years[0]);
    }
  }, [data, yearInitialized]);

  const reviews = useMemo(() => data?.reviews ?? [], [data]);
  const scoreMin = template?.score_min ?? 1;
  const scoreMax = template?.score_max ?? 5;

  // Blue heatmap like Reports, scaled to the score range (darker = higher).
  const heat = (v: number | null): React.CSSProperties => {
    if (v == null) return {};
    const t = Math.max(0, Math.min(1, (v - scoreMin) / (scoreMax - scoreMin)));
    const alpha = 0.08 + t * 0.72;
    return { backgroundColor: `rgba(37, 99, 235, ${alpha.toFixed(2)})`, color: alpha > 0.5 ? '#fff' : undefined };
  };

  const term = search.trim().toLowerCase();
  const employeeRows = useMemo(() => template ? groupRows(
    reviews, template, r => r.employee_id,
    r => ({ name: r.employee_name }),
    r => ({ name: r.project_name, sublabel: r.client_name }),
  ) : [], [reviews, template]);
  const projectRows = useMemo(() => template ? groupRows(
    reviews, template, r => r.project_id,
    r => ({ name: r.project_name, sublabel: r.client_name }),
    r => ({ name: r.employee_name }),
  ) : [], [reviews, template]);

  const itemRows = useMemo(() => {
    if (!template) return [];
    const rs = term ? reviews.filter(r => [r.employee_name, r.project_name, r.client_name].some(v => v?.toLowerCase().includes(term))) : reviews;
    const avg = (k: EvaluationKey, item: string) => mean(rs.map(r => r[k].items[item]));
    const avgCriterion = (k: EvaluationKey, c: string) => mean(rs.map(r => r[k].criteria[c]));
    return template.criteria.map(c => ({
      key: c.key,
      label: c.label,
      values: { self: avgCriterion('self', c.key), manager: avgCriterion('manager', c.key), joint: avgCriterion('joint', c.key) },
      items: c.sub_criteria.map(s => ({
        key: s.key,
        label: s.label,
        values: { self: avg('self', s.key), manager: avg('manager', s.key), joint: avg('joint', s.key) },
        rated: rs.filter(r => r.joint.items[s.key] != null).length,
      })),
    }));
  }, [reviews, template, term]);

  const kpis = useMemo(() => {
    const annual = employeeRows.map(r => r.total);
    const gaps = reviews.map(r => (r.self.overall != null && r.manager.overall != null ? r.self.overall - r.manager.overall : null));
    return { reviews: reviews.length, employees: employeeRows.length, avg: mean(annual), gap: mean(gaps) };
  }, [reviews, employeeRows]);

  if (isLoading || !template) {
    return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  }

  const toggle = (id: string) => setExpanded(prev => {
    const n = new Set(prev);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });

  const matrixRows = (view === 'employees' ? employeeRows : projectRows).filter(r =>
    !term || r.name.toLowerCase().includes(term) || (r.sublabel ?? '').toLowerCase().includes(term)
    || r.children.some(c => c.name.toLowerCase().includes(term)),
  );

  const stickyCell = 'sticky left-0 z-10 shadow-[1px_0_0_0_hsl(var(--border))]';

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-3">
          <Select value={year ? String(year) : 'all'} onValueChange={v => setYear(v === 'all' ? null : Number(v))}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              {(data?.years ?? []).map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
              <SelectItem value="all">All years</SelectItem>
            </SelectContent>
          </Select>
          <div className="flex rounded-md border overflow-hidden text-xs">
            {([['employees', 'By employee'], ['projects', 'By project'], ['items', 'By item']] as const).map(([v, label]) => (
              <button
                key={v}
                onClick={() => { setView(v); setExpanded(new Set()); }}
                className={cn('px-3 py-1.5 transition-colors', view === v ? 'bg-primary text-primary-foreground' : 'hover:bg-muted')}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="relative w-full lg:max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Filter by employee, project, client..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10" />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Completed reviews" value={String(kpis.reviews)} icon={ClipboardCheck} />
        <KpiCard label="Employees evaluated" value={String(kpis.employees)} icon={Users} />
        <KpiCard label="Average annual score" value={kpis.avg != null ? kpis.avg.toFixed(2) : '—'} hint="Mean of employees' joint averages" icon={Star} />
        <KpiCard
          label="Self vs manager gap"
          value={kpis.gap != null ? `${kpis.gap > 0 ? '+' : ''}${kpis.gap.toFixed(2)}` : '—'}
          hint={kpis.gap == null ? undefined : kpis.gap > 0 ? 'Employees rate themselves higher' : kpis.gap < 0 ? 'Managers rate higher' : 'Aligned'}
          icon={Scale}
        />
      </div>

      {reviews.length === 0 ? (
        <Card className="card-elevated">
          <CardContent className="flex flex-col items-center gap-2 py-12 text-muted-foreground">
            <ClipboardCheck className="h-8 w-8" />
            <p className="text-sm">No completed reviews{year ? ` in ${year}` : ''} yet — only completed reviews (joint evaluation agreed) count here.</p>
          </CardContent>
        </Card>
      ) : view === 'items' ? (
        <Card className="card-elevated">
          <CardHeader>
            <CardTitle className="text-base">Average by Item</CardTitle>
            <p className="text-xs text-muted-foreground">
              Average score of each item across the completed reviews{term ? ' matching the filter' : ''}, per evaluation · Gap = self − manager · Darker cells mean higher scores
            </p>
          </CardHeader>
          <CardContent>
            <div className="max-h-[640px] overflow-auto">
              <Table containerClassName="overflow-visible">
                <TableHeader className="sticky top-0 z-20 bg-background">
                  <TableRow>
                    <TableHead className={cn('table-header bg-background min-w-[320px]', stickyCell)}>Item</TableHead>
                    {(['self', 'manager', 'joint'] as const).map(k => (
                      <TableHead key={k} className={cn('table-header text-center min-w-[90px]', k === 'joint' && 'border-l-2 border-border')}>
                        {EVALUATION_META[k].short}{k === 'joint' && ' (official)'}
                      </TableHead>
                    ))}
                    <TableHead className="table-header text-center min-w-[80px] border-l border-border">Gap</TableHead>
                    <TableHead className="table-header text-center min-w-[80px]">Rated</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {itemRows.map(c => {
                    const gap = c.values.self != null && c.values.manager != null ? c.values.self - c.values.manager : null;
                    return (
                      <Fragment key={c.key}>
                        <TableRow className="bg-muted/40 hover:bg-muted/40">
                          <TableCell className={cn('font-semibold text-sm bg-muted', stickyCell)}>{c.label}</TableCell>
                          {(['self', 'manager', 'joint'] as const).map(k => (
                            <TableCell key={k} className={cn('text-center text-sm font-semibold tabular-nums', k === 'joint' && 'border-l-2 border-border')}>{fmt(c.values[k])}</TableCell>
                          ))}
                          <TableCell className="text-center text-sm font-semibold tabular-nums border-l border-border">{gap == null ? '' : `${gap > 0 ? '+' : ''}${gap.toFixed(2)}`}</TableCell>
                          <TableCell />
                        </TableRow>
                        {c.items.map(item => {
                          const itemGap = item.values.self != null && item.values.manager != null ? item.values.self - item.values.manager : null;
                          return (
                            <TableRow key={item.key}>
                              <TableCell className={cn('text-xs bg-background pl-6 whitespace-pre-line', stickyCell)}>{item.label}</TableCell>
                              {(['self', 'manager', 'joint'] as const).map(k => (
                                <TableCell key={k} className={cn('text-center text-sm font-medium tabular-nums', k === 'joint' && 'border-l-2 border-border')} style={heat(item.values[k])}>
                                  {fmt(item.values[k])}
                                </TableCell>
                              ))}
                              <TableCell className={cn(
                                'text-center text-xs tabular-nums border-l border-border',
                                itemGap != null && Math.abs(itemGap) >= 1 && 'font-bold text-amber-700 dark:text-amber-400',
                              )}>
                                {itemGap == null ? '' : `${itemGap > 0 ? '+' : ''}${itemGap.toFixed(2)}`}
                              </TableCell>
                              <TableCell className="text-center text-xs tabular-nums text-muted-foreground">{item.rated}</TableCell>
                            </TableRow>
                          );
                        })}
                      </Fragment>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card className="card-elevated">
          <CardHeader>
            <CardTitle className="text-base">{view === 'employees' ? 'Annual Score by Employee' : 'Average by Project'}</CardTitle>
            <p className="text-xs text-muted-foreground">
              {view === 'employees'
                ? 'Joint evaluation averages per criterion · Annual score = mean of the employee\'s completed reviews in the year · Click an employee to see each project review'
                : 'Joint evaluation averages per criterion across the project\'s reviewed employees · Click a project to see each employee'}
              {' · '}Darker cells mean higher scores
            </p>
          </CardHeader>
          <CardContent>
            {matrixRows.length === 0 ? (
              <p className="text-center text-muted-foreground py-6 text-sm">No data for this filter.</p>
            ) : (
              <div className="max-h-[640px] overflow-auto">
                <Table containerClassName="overflow-visible">
                  <TableHeader className="sticky top-0 z-20 bg-background">
                    <TableRow>
                      <TableHead className={cn('table-header bg-background min-w-[220px]', stickyCell)}>{view === 'employees' ? 'Employee' : 'Project'}</TableHead>
                      <TableHead className="table-header text-center min-w-[110px] border-r-2 border-border">
                        {view === 'employees' ? 'Annual score' : 'Project average'}
                      </TableHead>
                      <TableHead className="table-header text-center min-w-[80px]">{view === 'employees' ? 'Reviews' : 'Employees'}</TableHead>
                      {template.criteria.map(c => (
                        <TableHead key={c.key} className="table-header text-center min-w-[110px] whitespace-normal leading-tight">{c.short_label}</TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {matrixRows.map(row => {
                      const isOpen = expanded.has(row.id);
                      return (
                        <Fragment key={row.id}>
                          <TableRow className="cursor-pointer hover:bg-muted/40" onClick={() => toggle(row.id)}>
                            <TableCell className={cn('font-medium text-sm bg-background', stickyCell)}>
                              <div className="flex items-center gap-1.5">
                                {isOpen ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
                                <div className="min-w-0">
                                  <div className="truncate">{row.name}</div>
                                  {row.sublabel && <div className="text-xs text-muted-foreground font-normal truncate">{row.sublabel}</div>}
                                </div>
                              </div>
                            </TableCell>
                            <TableCell className="text-center text-base font-bold tabular-nums text-primary border-r-2 border-border">{fmt(row.total)}</TableCell>
                            <TableCell className="text-center text-sm tabular-nums">{row.count}</TableCell>
                            {row.criteria.map((v, i) => (
                              <TableCell key={i} className="text-center text-sm font-medium tabular-nums" style={heat(v)}>{fmt(v)}</TableCell>
                            ))}
                          </TableRow>
                          {isOpen && row.children.map(child => (
                            <TableRow key={child.id} className="bg-muted/20 cursor-pointer hover:bg-muted/40" onClick={() => navigate(`/reviews/${child.reviewId}`)}>
                              <TableCell className={cn('text-xs text-muted-foreground bg-muted/20 pl-9', stickyCell)}>
                                <div className="truncate">{child.name}</div>
                                {child.sublabel && <div className="truncate opacity-75">{child.sublabel}</div>}
                              </TableCell>
                              <TableCell className="text-center text-xs font-bold tabular-nums text-primary border-r-2 border-border">{fmt(child.total)}</TableCell>
                              <TableCell />
                              {child.criteria.map((v, i) => (
                                <TableCell key={i} className="text-center text-xs tabular-nums" style={heat(v)}>{fmt(v)}</TableCell>
                              ))}
                            </TableRow>
                          ))}
                        </Fragment>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
