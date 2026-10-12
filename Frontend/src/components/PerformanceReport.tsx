import { Fragment, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { format, startOfMonth, subMonths, startOfYear } from 'date-fns';
import {
  ArrowDown, ArrowUp, ChevronDown, ChevronRight, ClipboardCheck, Clock, Gauge, Loader2, Search, Star, UserX,
} from 'lucide-react';
import { useEmployeePerformance } from '@/hooks/useEmployeePerformance';
import { EmployeePerformanceRow } from '@/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';

// Reports › Performance. Deliberately independent of the page-level filters
// (those are about time entries in an arbitrary date range): this view always
// works on whole months, last 12 by default, and blends hours with the
// performance reviews completed in the same window. All numbers come from
// GET /reports/employee-performance (Backend/services/employee_performance.py):
//   - review score  = mean of JOINT overall averages (the official score)
//   - avg monthly   = hours over complete employed months (running month excluded)
//   - utilization   = billable hours / (max weekly hours prorated by weekdays)

type Preset = 'last12' | 'ytd' | 'lastYear' | 'custom';
type SortKey = 'name' | 'review_score' | 'reviews_count' | 'avg_monthly_hours' | 'billable_pct' | 'utilization_pct' | 'projects_count' | 'pto_hours' | 'self_manager_gap';

const monthIso = (d: Date) => format(d, 'yyyy-MM');

function presetRange(preset: Exclude<Preset, 'custom'>): { start: string; end: string } {
  const now = new Date();
  if (preset === 'ytd') return { start: monthIso(startOfYear(now)), end: monthIso(now) };
  if (preset === 'lastYear') {
    const y = now.getFullYear() - 1;
    return { start: `${y}-01`, end: `${y}-12` };
  }
  return { start: monthIso(subMonths(startOfMonth(now), 11)), end: monthIso(now) };
}

const fmt = (v: number | null | undefined, digits = 2) => (v == null ? '—' : v.toFixed(digits));
const fmtHours = (v: number | null | undefined) => (v == null ? '—' : v.toLocaleString(undefined, { maximumFractionDigits: 1 }));

function scoreClass(v: number | null | undefined): string {
  if (v == null) return 'text-muted-foreground';
  if (v >= 4) return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300';
  if (v >= 3) return 'bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300';
  return 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300';
}

function utilizationClass(v: number | null | undefined): string {
  if (v == null) return 'text-muted-foreground';
  if (v > 105) return 'text-red-600 dark:text-red-400 font-semibold';
  if (v >= 70) return 'text-emerald-700 dark:text-emerald-400 font-semibold';
  return 'text-amber-700 dark:text-amber-400 font-semibold';
}

function ScorePill({ value }: { value: number | null | undefined }) {
  if (value == null) return <span className="text-muted-foreground">—</span>;
  return <span className={cn('inline-block min-w-[3rem] rounded-md px-2 py-0.5 text-center text-sm font-semibold tabular-nums', scoreClass(value))}>{value.toFixed(2)}</span>;
}

function Kpi({ label, value, hint, icon: Icon, color }: { label: string; value: string; hint?: string; icon: typeof Clock; color: string }) {
  return (
    <Card className="card-elevated">
      <CardContent className="flex items-center gap-3 p-4">
        <div className={cn('rounded-lg p-2.5', color)}><Icon className="h-5 w-5" /></div>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-xl font-bold tabular-nums">{value}</p>
          {hint && <p className="text-[11px] text-muted-foreground leading-tight">{hint}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

const avg = (values: (number | null | undefined)[]) => {
  const v = values.filter((x): x is number => x != null);
  return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null;
};

export function PerformanceReport() {
  const navigate = useNavigate();
  const [preset, setPreset] = useState<Preset>('last12');
  const [custom, setCustom] = useState(presetRange('last12'));
  const range = preset === 'custom' ? custom : presetRange(preset);
  // Send first-of-month dates; the backend snaps `end` to the end of its month.
  const { data, isLoading, isFetching } = useEmployeePerformance({ start: `${range.start}-01`, end: `${range.end}-01` });

  const [search, setSearch] = useState('');
  const [activeOnly, setActiveOnly] = useState(true);
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'name', dir: 'asc' });
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const months = useMemo(() => data?.months ?? [], [data]);

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    const list = (data?.employees ?? []).filter(r =>
      (!activeOnly || r.is_active) &&
      (!term || [r.name, r.title, r.location].some(v => v?.toLowerCase().includes(term))
        || r.reviews.some(rv => rv.project_name.toLowerCase().includes(term))),
    );
    const dir = sort.dir === 'asc' ? 1 : -1;
    return [...list].sort((a, b) => {
      if (sort.key === 'name') return a.name.localeCompare(b.name) * dir;
      const av = a[sort.key] as number | null;
      const bv = b[sort.key] as number | null;
      if (av == null && bv == null) return a.name.localeCompare(b.name);
      if (av == null) return 1;   // empty values always last
      if (bv == null) return -1;
      return (av - bv) * dir;
    });
  }, [data, search, activeOnly, sort]);

  const kpis = useMemo(() => {
    const withHours = rows.filter(r => r.total_hours > 0);
    return {
      score: avg(rows.map(r => r.review_score)),
      monthly: avg(rows.map(r => r.avg_monthly_hours)),
      utilization: avg(withHours.map(r => r.utilization_pct)),
      reviews: rows.reduce((s, r) => s + r.reviews_count, 0),
      unreviewed: withHours.filter(r => r.reviews_count === 0).length,
      withHours: withHours.length,
    };
  }, [rows]);

  const maxMonthCell = useMemo(
    () => Math.max(1, ...rows.flatMap(r => Object.values(r.monthly).map(m => m.total))),
    [rows],
  );
  const heat = (hours: number): React.CSSProperties => {
    if (hours <= 0) return {};
    const alpha = 0.10 + Math.min(hours / maxMonthCell, 1) * 0.75;
    return { backgroundColor: `rgba(37, 99, 235, ${alpha.toFixed(2)})`, color: alpha > 0.5 ? '#fff' : undefined };
  };

  const toggleSort = (key: SortKey) =>
    setSort(s => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: key === 'name' ? 'asc' : 'desc' }));
  const toggleRow = (id: string) => setExpanded(prev => {
    const n = new Set(prev);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });

  const SortHead = ({ k, label, className }: { k: SortKey; label: string; className?: string }) => (
    <TableHead className={cn('table-header whitespace-nowrap', className)}>
      <button type="button" onClick={() => toggleSort(k)} className="inline-flex items-center gap-1 hover:text-foreground">
        {label}
        {sort.key === k && (sort.dir === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
      </button>
    </TableHead>
  );

  const stickyCell = 'sticky left-0 z-10 shadow-[1px_0_0_0_hsl(var(--border))]';
  const rangeLabel = months.length ? `${months[0].label} – ${months[months.length - 1].label}` : '';

  return (
    <div className="space-y-6">
      {/* Controls */}
      <Card className="card-elevated">
        <CardContent className="flex flex-col gap-4 p-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Period</Label>
              <div className="flex rounded-md border overflow-hidden text-xs">
                {([['last12', 'Last 12 months'], ['ytd', 'Year to date'], ['lastYear', 'Last year'], ['custom', 'Custom']] as const).map(([p, label]) => (
                  <button
                    key={p}
                    onClick={() => { if (p === 'custom') setCustom(range); setPreset(p); }}
                    className={cn('px-3 py-1.5 transition-colors', preset === p ? 'bg-primary text-primary-foreground' : 'hover:bg-muted')}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            {preset === 'custom' && (
              <>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">From</Label>
                  <Input type="month" className="w-40" value={custom.start} max={custom.end}
                    onChange={e => e.target.value && setCustom(c => ({ ...c, start: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">To</Label>
                  <Input type="month" className="w-40" value={custom.end} min={custom.start}
                    onChange={e => e.target.value && setCustom(c => ({ ...c, end: e.target.value }))} />
                </div>
              </>
            )}
            <div className="flex items-center gap-2 pb-1.5">
              <Switch id="perf-active" checked={activeOnly} onCheckedChange={setActiveOnly} />
              <Label htmlFor="perf-active" className="text-sm font-normal text-muted-foreground">Active employees only</Label>
            </div>
            {isFetching && !isLoading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground mb-2" />}
          </div>
          <div className="relative w-full lg:max-w-xs">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Employee, title, location, project..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10" />
          </div>
        </CardContent>
      </Card>

      {isLoading || !data ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : (
        <>
          <div className="grid gap-3 grid-cols-2 lg:grid-cols-5">
            <Kpi label="Avg review score" value={fmt(kpis.score)} hint="Joint evaluations completed in the period"
              icon={Star} color="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" />
            <Kpi label="Avg monthly hours" value={fmtHours(kpis.monthly)} hint="Per employee, complete months"
              icon={Clock} color="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" />
            <Kpi label="Avg utilization" value={kpis.utilization == null ? '—' : `${kpis.utilization.toFixed(0)}%`} hint="Billable hours vs. capacity"
              icon={Gauge} color="bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400" />
            <Kpi label="Reviews completed" value={String(kpis.reviews)} hint={rangeLabel}
              icon={ClipboardCheck} color="bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400" />
            <Kpi label="Not reviewed" value={`${kpis.unreviewed} / ${kpis.withHours}`} hint="Employees with hours but no completed review"
              icon={UserX} color="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" />
          </div>

          {/* Scorecard */}
          <Card className="card-elevated">
            <CardHeader>
              <CardTitle className="text-base">Employee Scorecard</CardTitle>
              <p className="text-xs text-muted-foreground">
                {rangeLabel} · Review score = mean of the joint evaluations completed in the period (official score) ·
                Avg monthly hours excludes the running month · Utilization = billable hours ÷ capacity (max weekly hours, prorated) ·
                Gap = self − manager · Click a row to see each project's scores
              </p>
            </CardHeader>
            <CardContent>
              {rows.length === 0 ? (
                <p className="text-center text-muted-foreground py-6 text-sm">No employees match these filters.</p>
              ) : (
                <div className="max-h-[560px] overflow-auto">
                  <Table containerClassName="overflow-visible">
                    <TableHeader className="sticky top-0 z-20 bg-background">
                      <TableRow>
                        <SortHead k="name" label="Employee" className={cn('bg-background min-w-[220px]', stickyCell)} />
                        <SortHead k="review_score" label="Review score" className="text-center" />
                        <SortHead k="reviews_count" label="Reviews" className="text-center" />
                        <SortHead k="avg_monthly_hours" label="Avg hrs / month" className="text-right" />
                        <SortHead k="billable_pct" label="Billable %" className="text-right" />
                        <SortHead k="utilization_pct" label="Utilization" className="text-right" />
                        <SortHead k="projects_count" label="Projects" className="text-center" />
                        <SortHead k="pto_hours" label="Time off" className="text-right" />
                        <SortHead k="self_manager_gap" label="Self − mgr" className="text-center" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.map((r: EmployeePerformanceRow) => {
                        const isOpen = expanded.has(r.employee_id);
                        const canExpand = r.reviews.length > 0;
                        return (
                          <Fragment key={r.employee_id}>
                            <TableRow
                              className={cn(canExpand && 'cursor-pointer hover:bg-muted/40', !r.is_active && 'opacity-60')}
                              onClick={() => canExpand && toggleRow(r.employee_id)}
                            >
                              <TableCell className={cn('bg-background', stickyCell)}>
                                <div className="flex items-center gap-1.5">
                                  {canExpand
                                    ? (isOpen ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />)
                                    : <span className="w-3.5 shrink-0" />}
                                  <div className="min-w-0">
                                    <div className="font-medium text-sm truncate">{r.name}</div>
                                    <div className="text-xs text-muted-foreground truncate">
                                      {[r.title, r.location, !r.is_active && 'Inactive'].filter(Boolean).join(' · ')}
                                    </div>
                                  </div>
                                  {r.open_reviews > 0 && (
                                    <Badge variant="outline" className="ml-auto shrink-0 text-[10px] py-0" title="Reviews in progress (not counted yet)">
                                      {r.open_reviews} open
                                    </Badge>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell className="text-center"><ScorePill value={r.review_score} /></TableCell>
                              <TableCell className="text-center text-sm tabular-nums">{r.reviews_count || '—'}</TableCell>
                              <TableCell className="text-right text-sm tabular-nums">{fmtHours(r.avg_monthly_hours)}</TableCell>
                              <TableCell className="text-right text-sm tabular-nums">{r.billable_pct == null ? '—' : `${r.billable_pct.toFixed(0)}%`}</TableCell>
                              <TableCell className={cn('text-right text-sm tabular-nums', utilizationClass(r.utilization_pct))}>
                                {r.utilization_pct == null ? '—' : `${r.utilization_pct.toFixed(0)}%`}
                              </TableCell>
                              <TableCell className="text-center text-sm tabular-nums">{r.projects_count || '—'}</TableCell>
                              <TableCell className="text-right text-sm tabular-nums">{r.pto_hours ? `${fmtHours(r.pto_hours)}h` : '—'}</TableCell>
                              <TableCell className={cn('text-center text-sm tabular-nums', r.self_manager_gap != null && Math.abs(r.self_manager_gap) >= 1 && 'font-bold text-amber-700 dark:text-amber-400')}>
                                {r.self_manager_gap == null ? '—' : `${r.self_manager_gap > 0 ? '+' : ''}${r.self_manager_gap.toFixed(2)}`}
                              </TableCell>
                            </TableRow>
                            {isOpen && (
                              <TableRow className="bg-muted/20 hover:bg-muted/20">
                                <TableCell colSpan={9} className="p-0">
                                  <div className="px-4 py-3 pl-10">
                                    <table className="w-full text-xs">
                                      <thead className="text-muted-foreground">
                                        <tr className="border-b">
                                          <th className="text-left font-medium py-1.5">Project</th>
                                          <th className="text-left font-medium py-1.5">Review date</th>
                                          <th className="text-right font-medium py-1.5">Hours (period)</th>
                                          <th className="text-center font-medium py-1.5">Self</th>
                                          <th className="text-center font-medium py-1.5">Manager</th>
                                          <th className="text-center font-medium py-1.5">Joint (official)</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {r.reviews.map(rv => (
                                          <tr key={rv.id} className="border-b last:border-b-0 cursor-pointer hover:bg-muted/40" onClick={() => navigate(`/reviews/${rv.id}`)}>
                                            <td className="py-1.5">
                                              <span className="font-medium">{rv.project_name}</span>
                                              {rv.client_name && <span className="text-muted-foreground"> · {rv.client_name}</span>}
                                            </td>
                                            <td className="py-1.5">{format(new Date(`${rv.review_date}T00:00:00`), 'MMM d, yyyy')}</td>
                                            <td className="py-1.5 text-right tabular-nums">{fmtHours(rv.hours_in_window)}</td>
                                            <td className="py-1.5 text-center tabular-nums">{fmt(rv.self)}</td>
                                            <td className="py-1.5 text-center tabular-nums">{fmt(rv.manager)}</td>
                                            <td className="py-1.5 text-center"><ScorePill value={rv.joint} /></td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                </TableCell>
                              </TableRow>
                            )}
                          </Fragment>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Monthly hours */}
          <Card className="card-elevated">
            <CardHeader>
              <CardTitle className="text-base">Monthly Hours</CardTitle>
              <p className="text-xs text-muted-foreground">
                Hours logged per employee per month (all projects) · Darker cells mean more hours · MTD = month to date, not included in the average
              </p>
            </CardHeader>
            <CardContent>
              {rows.length === 0 ? (
                <p className="text-center text-muted-foreground py-6 text-sm">No employees match these filters.</p>
              ) : (
                <div className="max-h-[480px] overflow-auto">
                  <Table containerClassName="overflow-visible">
                    <TableHeader className="sticky top-0 z-20 bg-background">
                      <TableRow>
                        <TableHead className={cn('table-header bg-background min-w-[200px]', stickyCell)}>Employee</TableHead>
                        {months.map(m => (
                          <TableHead key={m.key} className="table-header text-center whitespace-nowrap min-w-[80px]">
                            {m.label.replace(/ \d{2}(\d{2})$/, ' ’$1')}
                            {!m.complete && <div className="text-[10px] font-normal normal-case">MTD</div>}
                          </TableHead>
                        ))}
                        <TableHead className="table-header text-center whitespace-nowrap min-w-[90px] border-l-2 border-border">Avg / month</TableHead>
                        <TableHead className="table-header text-center whitespace-nowrap min-w-[90px]">Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.map(r => (
                        <TableRow key={r.employee_id} className={!r.is_active ? 'opacity-60' : undefined}>
                          <TableCell className={cn('font-medium text-sm bg-background', stickyCell)}>{r.name}</TableCell>
                          {months.map(m => {
                            const cell = r.monthly[m.key];
                            const hours = cell?.total ?? 0;
                            return (
                              <TableCell key={m.key} className="text-center text-sm tabular-nums" style={heat(hours)}
                                title={cell ? `${fmtHours(cell.total)}h total · ${fmtHours(cell.billable)}h billable` : undefined}>
                                {hours > 0 ? fmtHours(hours) : ''}
                              </TableCell>
                            );
                          })}
                          <TableCell className="text-center text-sm font-bold tabular-nums text-primary border-l-2 border-border">{fmtHours(r.avg_monthly_hours)}</TableCell>
                          <TableCell className="text-center text-sm font-semibold tabular-nums">{r.total_hours ? fmtHours(r.total_hours) : ''}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Scores by project */}
          <Card className="card-elevated">
            <CardHeader>
              <CardTitle className="text-base">Review Scores by Project</CardTitle>
              <p className="text-xs text-muted-foreground">Reviews completed in the period, grouped by project · Sorted by joint score</p>
            </CardHeader>
            <CardContent>
              {data.projects.length === 0 ? (
                <p className="text-center text-muted-foreground py-6 text-sm">No reviews were completed in this period.</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="table-header">Project</TableHead>
                        <TableHead className="table-header text-center">Employees</TableHead>
                        <TableHead className="table-header text-right">Hours (period)</TableHead>
                        <TableHead className="table-header text-center">Self</TableHead>
                        <TableHead className="table-header text-center">Manager</TableHead>
                        <TableHead className="table-header text-center">Joint (official)</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.projects.map(p => (
                        <TableRow key={p.project_id} className="cursor-pointer hover:bg-muted/40" onClick={() => navigate(`/reviews/projects/${p.project_id}`)}>
                          <TableCell>
                            <div className="font-medium text-sm">{p.name}</div>
                            {p.client_name && <div className="text-xs text-muted-foreground">{p.client_name}</div>}
                          </TableCell>
                          <TableCell className="text-center text-sm tabular-nums">{p.employees_reviewed}</TableCell>
                          <TableCell className="text-right text-sm tabular-nums">{fmtHours(p.hours_in_window)}</TableCell>
                          <TableCell className="text-center text-sm tabular-nums">{fmt(p.self_avg)}</TableCell>
                          <TableCell className="text-center text-sm tabular-nums">{fmt(p.manager_avg)}</TableCell>
                          <TableCell className="text-center"><ScorePill value={p.joint_avg} /></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
