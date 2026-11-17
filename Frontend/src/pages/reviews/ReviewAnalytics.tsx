import { Fragment, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { ChevronDown, ChevronRight, Download, Loader2, Search, ClipboardCheck, Users, Star, Scale, X } from 'lucide-react';
import { useReviewAnalytics, useAllReviewTemplates, EVALUATION_META, downloadReviewsXlsxBulk } from '@/hooks/usePerformanceReviews';
import { AnalyticsReview, EvaluationKey, ReviewTemplate } from '@/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';

// Official numbers here are always the Manager Review (the shared evaluation
// every assigned reviewer edits): a review's score is its overall average, and
// an employee's annual measurement is the plain mean of their completed
// reviews' Manager Review overall averages in the year
// (Backend/services/performance_reviews.py::analytics). Self only appears in
// the Items view, to compare against the Manager Review.

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
    criteria: template.criteria.map(c => mean(rs.map(r => r.manager.criteria[c.key]))),
    total: mean(rs.map(r => r.manager.overall)),
    children: rs.map(r => ({
      id: r.id,
      reviewId: r.id,
      ...childOf(r),
      criteria: template.criteria.map(c => r.manager.criteria[c.key] ?? null),
      total: r.manager.overall,
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
  // Every format shares the same five criterion keys, so the criterion
  // matrices use the standard template's columns; only the per-item view
  // needs each format's own sub-criteria.
  const { data: templates } = useAllReviewTemplates();
  const template = templates?.standard ?? (templates ? Object.values(templates)[0] : undefined);
  const [year, setYear] = useState<number | null>(null);
  const [yearInitialized, setYearInitialized] = useState(false);
  const { data, isLoading } = useReviewAnalytics(year);
  const [view, setView] = useState<View>('employees');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  // Selected review ids, for the bulk Excel download — shared across the
  // Employees/Projects views (same underlying reviews, just grouped
  // differently); there's nothing to select in the Items view (cross-review
  // aggregates), so it's simply not shown there.
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [isDownloading, setIsDownloading] = useState(false);

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

  // Blue heatmap like Reports, scaled to the score range. Scale is 1 (best)
  // to 5 (worst) — darker = better, so t runs from 1 at scoreMin down to 0
  // at scoreMax instead of the other way around.
  const heat = (v: number | null): React.CSSProperties => {
    if (v == null) return {};
    const t = Math.max(0, Math.min(1, (scoreMax - v) / (scoreMax - scoreMin)));
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
    // The standard format's items always show; another format's items only
    // when this selection actually has reviews in that format.
    const formatsInUse = new Set(rs.map(r => r.evaluation_format || 'standard'));
    const otherTemplates = Object.values(templates ?? {}).filter(t => t.format !== template.format && formatsInUse.has(t.format));
    return template.criteria.map(c => ({
      key: c.key,
      label: c.label,
      values: { self: avgCriterion('self', c.key), manager: avgCriterion('manager', c.key) },
      items: [
        ...c.sub_criteria.map(s => ({ ...s, formatLabel: otherTemplates.length ? template.format_label : null })),
        ...otherTemplates.flatMap(t => (t.criteria.find(tc => tc.key === c.key)?.sub_criteria ?? [])
          .map(s => ({ ...s, formatLabel: t.format_label as string | null }))),
      ].map(s => ({
        key: s.key,
        label: s.label,
        formatLabel: s.formatLabel,
        values: { self: avg('self', s.key), manager: avg('manager', s.key) },
        rated: rs.filter(r => r.manager.items[s.key] != null).length,
      })),
    }));
  }, [reviews, template, templates, term]);

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

  const toggleReview = (id: string) => setSelected(prev => {
    const n = new Set(prev);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });
  const toggleGroup = (row: MatrixRow) => setSelected(prev => {
    const n = new Set(prev);
    const ids = row.children.map(c => c.reviewId);
    const allSelected = ids.every(id => n.has(id));
    ids.forEach(id => (allSelected ? n.delete(id) : n.add(id)));
    return n;
  });
  const visibleReviewIds = matrixRows.flatMap(r => r.children.map(c => c.reviewId));
  const allVisibleSelected = visibleReviewIds.length > 0 && visibleReviewIds.every(id => selected.has(id));
  const someVisibleSelected = visibleReviewIds.some(id => selected.has(id));
  const toggleAllVisible = () => setSelected(prev => {
    const n = new Set(prev);
    if (allVisibleSelected) visibleReviewIds.forEach(id => n.delete(id));
    else visibleReviewIds.forEach(id => n.add(id));
    return n;
  });

  async function handleBulkDownload() {
    if (selected.size === 0) return;
    setIsDownloading(true);
    try {
      await downloadReviewsXlsxBulk([...selected]);
    } catch {
      toast.error('Failed to download the selected reviews.');
    } finally {
      setIsDownloading(false);
    }
  }

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

      {selected.size > 0 && (
        <div className="flex items-center gap-3 rounded-lg border bg-muted/40 px-4 py-2.5">
          <span className="text-sm font-medium">{selected.size} review{selected.size === 1 ? '' : 's'} selected</span>
          <Button size="sm" variant="ghost" className="gap-1.5 text-muted-foreground" onClick={() => setSelected(new Set())}>
            <X className="h-3.5 w-3.5" /> Clear
          </Button>
          <Button size="sm" className="gap-1.5 ml-auto" disabled={isDownloading} onClick={handleBulkDownload}>
            {isDownloading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
            Download Excel
          </Button>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Completed reviews" value={String(kpis.reviews)} icon={ClipboardCheck} />
        <KpiCard label="Employees evaluated" value={String(kpis.employees)} icon={Users} />
        <KpiCard label="Average annual score" value={kpis.avg != null ? kpis.avg.toFixed(2) : '—'} hint="Mean of employees' Manager Review averages (1 best – 5 worst)" icon={Star} />
        <KpiCard
          label="Self vs manager gap"
          value={kpis.gap != null ? `${kpis.gap > 0 ? '+' : ''}${kpis.gap.toFixed(2)}` : '—'}
          hint={kpis.gap == null ? "Self no longer scores — always empty" : kpis.gap > 0 ? 'Employees rate themselves higher' : kpis.gap < 0 ? 'Managers rate higher' : 'Aligned'}
          icon={Scale}
        />
      </div>

      {reviews.length === 0 ? (
        <Card className="card-elevated">
          <CardContent className="flex flex-col items-center gap-2 py-12 text-muted-foreground">
            <ClipboardCheck className="h-8 w-8" />
            <p className="text-sm">No completed reviews{year ? ` in ${year}` : ''} yet — only completed reviews count here.</p>
          </CardContent>
        </Card>
      ) : view === 'items' ? (
        <Card className="card-elevated">
          <CardHeader>
            <CardTitle className="text-base">Average by Item</CardTitle>
            <p className="text-xs text-muted-foreground">
              Average score of each item across the completed reviews{term ? ' matching the filter' : ''}, per evaluation · Gap = self − manager · Darker cells mean a better score (scale 1 best – 5 worst)
            </p>
          </CardHeader>
          <CardContent>
            <div className="max-h-[640px] overflow-auto">
              <Table containerClassName="overflow-visible">
                <TableHeader className="sticky top-0 z-20 bg-background">
                  <TableRow>
                    <TableHead className={cn('table-header bg-background min-w-[320px]', stickyCell)}>Item</TableHead>
                    {(['self', 'manager'] as const).map(k => (
                      <TableHead key={k} className={cn('table-header text-center min-w-[90px]', k === 'manager' && 'border-l-2 border-border')}>
                        {EVALUATION_META[k].short}{k === 'manager' && ' (official)'}
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
                          {(['self', 'manager'] as const).map(k => (
                            <TableCell key={k} className={cn('text-center text-sm font-semibold tabular-nums', k === 'manager' && 'border-l-2 border-border')}>{fmt(c.values[k])}</TableCell>
                          ))}
                          <TableCell className="text-center text-sm font-semibold tabular-nums border-l border-border">{gap == null ? '' : `${gap > 0 ? '+' : ''}${gap.toFixed(2)}`}</TableCell>
                          <TableCell />
                        </TableRow>
                        {c.items.map(item => {
                          const itemGap = item.values.self != null && item.values.manager != null ? item.values.self - item.values.manager : null;
                          return (
                            <TableRow key={item.key}>
                              <TableCell className={cn('text-xs bg-background pl-6 whitespace-pre-line', stickyCell)}>
                                {item.label}
                                {item.formatLabel && <span className="block mt-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">{item.formatLabel}</span>}
                              </TableCell>
                              {(['self', 'manager'] as const).map(k => (
                                <TableCell key={k} className={cn('text-center text-sm font-medium tabular-nums', k === 'manager' && 'border-l-2 border-border')} style={heat(item.values[k])}>
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
                ? 'Manager Review averages per criterion · Annual score = mean of the employee\'s completed reviews in the year · Click an employee to see each project review'
                : 'Manager Review averages per criterion across the project\'s reviewed employees · Click a project to see each employee'}
              {' · '}Darker cells mean a better score (scale 1 best – 5 worst)
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
                      <TableHead className="table-header w-10 bg-background">
                        <Checkbox
                          checked={allVisibleSelected ? true : someVisibleSelected ? 'indeterminate' : false}
                          onCheckedChange={toggleAllVisible}
                          aria-label="Select all visible reviews"
                        />
                      </TableHead>
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
                      const groupIds = row.children.map(c => c.reviewId);
                      const groupAllSelected = groupIds.length > 0 && groupIds.every(id => selected.has(id));
                      const groupSomeSelected = groupIds.some(id => selected.has(id));
                      return (
                        <Fragment key={row.id}>
                          <TableRow className="cursor-pointer hover:bg-muted/40" onClick={() => toggle(row.id)}>
                            <TableCell onClick={e => e.stopPropagation()}>
                              <Checkbox
                                checked={groupAllSelected ? true : groupSomeSelected ? 'indeterminate' : false}
                                onCheckedChange={() => toggleGroup(row)}
                                aria-label={`Select all of ${row.name}'s reviews`}
                              />
                            </TableCell>
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
                              <TableCell onClick={e => e.stopPropagation()}>
                                <Checkbox
                                  checked={selected.has(child.reviewId)}
                                  onCheckedChange={() => toggleReview(child.reviewId)}
                                  aria-label={`Select ${child.name}'s review`}
                                />
                              </TableCell>
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
