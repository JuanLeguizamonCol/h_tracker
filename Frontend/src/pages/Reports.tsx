import { useState, useMemo } from 'react';
import { format, startOfMonth, endOfMonth, startOfWeek, addWeeks } from 'date-fns';
import {
  CalendarIcon, Search, Loader2, Filter, X,
  Clock, TrendingUp, Activity, BarChart2, Table as TableIcon,
  LayoutDashboard,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, Cell,
  PieChart, Pie, Label as PieLabel,
  AreaChart, Area,
} from 'recharts';
import { useAuth } from '@/contexts/AuthContext';
import { useProjects } from '@/hooks/useProjects';
import { useClients } from '@/hooks/useClients';
import { useEmployees } from '@/hooks/useEmployees';
import { useAllTimeEntriesByDateRange, useTimeEntriesByDateRange } from '@/hooks/useTimeEntries';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

// ─── Constants ────────────────────────────────────────────────────────────────

const BILLABLE_COLOR = '#3B82F6';
const NON_BILLABLE_COLOR = '#CBD5E1';
const PROJECT_COLORS = [
  '#3B82F6', '#8B5CF6', '#10B981', '#F59E0B',
  '#EF4444', '#06B6D4', '#EC4899', '#84CC16',
  '#F97316', '#6366F1',
];

// ─── Filter state ─────────────────────────────────────────────────────────────

type Filters = {
  startDate: Date;
  endDate: Date;
  employeeId: string;
  projectId: string;
  clientId: string;
  status: string;
  billing: string;
  search: string;
};

const INIT: Filters = {
  startDate: startOfMonth(new Date()),
  endDate: endOfMonth(new Date()),
  employeeId: 'all',
  projectId: 'all',
  clientId: 'all',
  status: 'all',
  billing: 'all',
  search: '',
};

// ─── FilterSelect helper ──────────────────────────────────────────────────────

interface FsProps {
  label: string; value: string; allLabel: string;
  options: { value: string; label: string }[];
  isFiltered: boolean;
  onChange: (v: string) => void;
  onClear: () => void;
}
function FilterSelect({ label, value, allLabel, options, isFiltered, onChange, onClear }: FsProps) {
  const isActive = value !== 'all';
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between min-h-[16px]">
        <Label className="text-xs text-muted-foreground flex items-center gap-1">
          {label}
          {isFiltered && !isActive && <span className="h-1.5 w-1.5 rounded-full bg-primary" />}
        </Label>
        {isActive && (
          <button onClick={onClear} className="text-muted-foreground hover:text-foreground transition-colors">
            <X className="h-3 w-3" />
          </button>
        )}
      </div>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className={`text-sm ${isActive ? 'border-primary/60 bg-primary/5' : ''}`}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{allLabel}</SelectItem>
          {options.length === 0
            ? <div className="px-2 py-2 text-xs text-muted-foreground italic">No options available</div>
            : options.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)
          }
        </SelectContent>
      </Select>
    </div>
  );
}

// ─── KPI card ─────────────────────────────────────────────────────────────────

function KpiCard({ label, value, sub, icon: Icon, color }: {
  label: string; value: string; sub?: string;
  icon: React.ElementType; color: string;
}) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="text-2xl font-bold mt-0.5">{value}</p>
            {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
          </div>
          <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${color}`}>
            <Icon className="h-4 w-4" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Empty chart state ────────────────────────────────────────────────────────

function ChartEmpty() {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-2 text-muted-foreground">
      <BarChart2 className="h-8 w-8 opacity-30" />
      <p className="text-sm">No data for the selected filters</p>
    </div>
  );
}

// ─── Custom tooltip ───────────────────────────────────────────────────────────

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border bg-background shadow-md p-3 text-xs space-y-1 min-w-[140px]">
      {label && <p className="font-semibold text-foreground mb-1">{label}</p>}
      {payload.map(p => (
        <div key={p.name} className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full flex-shrink-0" style={{ background: p.color }} />
            {p.name}
          </span>
          <span className="font-medium tabular-nums">{Number(p.value).toFixed(1)}h</span>
        </div>
      ))}
    </div>
  );
}

// ─── Donut center label ───────────────────────────────────────────────────────

function DonutCenter({ viewBox, total }: { viewBox?: { cx: number; cy: number }; total: number }) {
  const { cx = 0, cy = 0 } = viewBox ?? {};
  return (
    <>
      <text x={cx} y={cy - 8} textAnchor="middle" className="fill-foreground text-xl font-bold" style={{ fontSize: 20, fontWeight: 700 }}>
        {total.toFixed(0)}h
      </text>
      <text x={cx} y={cy + 12} textAnchor="middle" style={{ fontSize: 11, fill: '#94a3b8' }}>
        Total Hours
      </text>
    </>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

type ViewMode = 'charts' | 'tables' | 'both';
type TimeGroup = 'daily' | 'weekly';

export default function Reports() {
  const { employee, isAdmin } = useAuth();
  const [f, setF] = useState<Filters>(INIT);
  const set = <K extends keyof Filters>(key: K, val: Filters[K]) =>
    setF(prev => ({ ...prev, [key]: val }));

  const [viewMode, setViewMode] = useState<ViewMode>('both');
  const [timeGroup, setTimeGroup] = useState<TimeGroup>('daily');

  const { data: projects = [] } = useProjects();
  const { data: clients = [] } = useClients();
  const { data: employees = [] } = useEmployees();

  const { data: allEntries = [], isLoading: allLoading } = useAllTimeEntriesByDateRange(f.startDate, f.endDate);
  const { data: myEntries = [], isLoading: myLoading } = useTimeEntriesByDateRange(f.startDate, f.endDate, employee?.id);

  const rawEntries = isAdmin ? allEntries : myEntries;
  const isLoading = isAdmin ? allLoading : myLoading;

  // ── Lookup maps ──────────────────────────────────────────────────────────────
  const projectMap  = useMemo(() => new Map(projects.map(p => [p.id, p])), [projects]);
  const clientMap   = useMemo(() => new Map(clients.map(c => [c.id, c])), [clients]);
  const employeeMap = useMemo(() => new Map(employees.map(e => [e.id, e])), [employees]);

  // ── Cascade: available options ────────────────────────────────────────────────
  const availableProjects = useMemo(() => {
    const ids = new Set(rawEntries
      .filter(e =>
        (f.clientId === 'all' || projectMap.get(e.project_id)?.client_id === f.clientId) &&
        (f.employeeId === 'all' || e.user_id === f.employeeId)
      ).map(e => e.project_id));
    return projects.filter(p => ids.has(p.id));
  }, [rawEntries, projects, f.clientId, f.employeeId, projectMap]);

  const availableClients = useMemo(() => {
    const ids = new Set(rawEntries
      .filter(e =>
        (f.projectId === 'all' || e.project_id === f.projectId) &&
        (f.employeeId === 'all' || e.user_id === f.employeeId)
      ).map(e => projectMap.get(e.project_id)?.client_id).filter((id): id is string => !!id));
    return clients.filter(c => ids.has(c.id));
  }, [rawEntries, clients, f.projectId, f.employeeId, projectMap]);

  const availableEmployees = useMemo(() => {
    const ids = new Set(rawEntries
      .filter(e =>
        (f.projectId === 'all' || e.project_id === f.projectId) &&
        (f.clientId === 'all' || projectMap.get(e.project_id)?.client_id === f.clientId)
      ).map(e => e.user_id));
    return employees.filter(e => ids.has(e.id));
  }, [rawEntries, employees, f.projectId, f.clientId, projectMap]);

  // ── Project auto-fill client ─────────────────────────────────────────────────
  const handleProjectChange = (val: string) => {
    setF(prev => {
      const next = { ...prev, projectId: val };
      if (val !== 'all') {
        const proj = projectMap.get(val);
        if (proj?.client_id) next.clientId = proj.client_id;
      }
      return next;
    });
  };

  const clearAll = () => setF(prev => ({ ...prev, employeeId: 'all', projectId: 'all', clientId: 'all', status: 'all', billing: 'all', search: '' }));
  const hasActiveFilters = f.employeeId !== 'all' || f.projectId !== 'all' || f.clientId !== 'all' || f.status !== 'all' || f.billing !== 'all' || !!f.search;

  // ── Filtered entries (single source of truth) ─────────────────────────────────
  const filteredEntries = useMemo(() => rawEntries.filter(e => {
    if (f.employeeId !== 'all' && e.user_id !== f.employeeId) return false;
    if (f.projectId !== 'all' && e.project_id !== f.projectId) return false;
    if (f.clientId !== 'all' && projectMap.get(e.project_id)?.client_id !== f.clientId) return false;
    if (f.status === 'normal' && e.status !== 'normal') return false;
    if (f.status === 'on_hold' && e.status !== 'on_hold') return false;
    if (f.billing === 'billable' && !e.billable) return false;
    if (f.billing === 'non_billable' && e.billable) return false;
    if (f.search) {
      const term = f.search.toLowerCase();
      const proj = projectMap.get(e.project_id);
      const emp  = employeeMap.get(e.user_id);
      if (!`${proj?.name ?? ''} ${emp?.name ?? ''} ${e.notes ?? ''}`.toLowerCase().includes(term)) return false;
    }
    return true;
  }), [rawEntries, f, projectMap, employeeMap]);

  // ── KPI data ──────────────────────────────────────────────────────────────────
  const kpis = useMemo(() => {
    const total = filteredEntries.reduce((s, e) => s + Number(e.hours), 0);
    const billable = filteredEntries.filter(e => e.billable).reduce((s, e) => s + Number(e.hours), 0);
    const days = Math.max(1, Math.round((f.endDate.getTime() - f.startDate.getTime()) / 86400000) + 1);
    return {
      total,
      billable,
      nonBillable: total - billable,
      entries: filteredEntries.length,
      avgPerDay: total / days,
      billabilityPct: total > 0 ? (billable / total) * 100 : 0,
    };
  }, [filteredEntries, f.startDate, f.endDate]);

  // ── Chart: hours by employee ──────────────────────────────────────────────────
  const employeeChartData = useMemo(() => {
    const map: Record<string, { userId: string; name: string; Billable: number; 'Non-billable': number }> = {};
    filteredEntries.forEach(e => {
      if (!map[e.user_id]) map[e.user_id] = { userId: e.user_id, name: employeeMap.get(e.user_id)?.name ?? 'Deleted Employee', Billable: 0, 'Non-billable': 0 };
      if (e.billable) map[e.user_id].Billable += Number(e.hours);
      else map[e.user_id]['Non-billable'] += Number(e.hours);
    });
    return Object.values(map)
      .map(d => ({ ...d, total: d.Billable + d['Non-billable'] }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 12);
  }, [filteredEntries, employeeMap]);

  // ── Chart: hours by project (donut) ──────────────────────────────────────────
  const projectPieData = useMemo(() => {
    const map: Record<string, { id: string; name: string; client: string; value: number }> = {};
    filteredEntries.forEach(e => {
      const proj = projectMap.get(e.project_id);
      const cli  = proj ? clientMap.get(proj.client_id) : null;
      if (!map[e.project_id]) map[e.project_id] = { id: e.project_id, name: proj?.name ?? 'Unknown', client: cli?.name ?? '', value: 0 };
      map[e.project_id].value += Number(e.hours);
    });
    return Object.values(map).sort((a, b) => b.value - a.value).slice(0, 10);
  }, [filteredEntries, projectMap, clientMap]);

  // ── Chart: billable hours by project (bar) ────────────────────────────────────
  const projectBarData = useMemo(() =>
    projectPieData
      .map(d => {
        const billable = filteredEntries.filter(e => e.project_id === d.id && e.billable).reduce((s, e) => s + Number(e.hours), 0);
        return { id: d.id, name: d.name.length > 18 ? d.name.slice(0, 16) + '…' : d.name, fullName: d.name, Billable: billable, 'Non-billable': d.value - billable };
      })
      .sort((a, b) => (b.Billable + b['Non-billable']) - (a.Billable + a['Non-billable'])),
    [projectPieData, filteredEntries]
  );

  // ── Chart: hours over time ────────────────────────────────────────────────────
  const timeChartData = useMemo(() => {
    const map: Record<string, { date: string; Billable: number; 'Non-billable': number }> = {};
    filteredEntries.forEach(e => {
      const key = timeGroup === 'weekly'
        ? format(startOfWeek(new Date(e.date), { weekStartsOn: 1 }), 'yyyy-MM-dd')
        : e.date;
      if (!map[key]) map[key] = { date: key, Billable: 0, 'Non-billable': 0 };
      if (e.billable) map[key].Billable += Number(e.hours);
      else map[key]['Non-billable'] += Number(e.hours);
    });
    return Object.values(map)
      .sort((a, b) => a.date.localeCompare(b.date))
      .map(d => ({ ...d, date: format(new Date(d.date), timeGroup === 'weekly' ? 'MMM d' : 'MMM d') }));
  }, [filteredEntries, timeGroup]);

  // ── Tables ────────────────────────────────────────────────────────────────────
  const projectTotals = useMemo(() => {
    const map: Record<string, { name: string; clientName: string; hours: number; billableHours: number; entries: number }> = {};
    filteredEntries.forEach(e => {
      if (!map[e.project_id]) {
        const proj = projectMap.get(e.project_id);
        const cli = proj ? clientMap.get(proj.client_id) : null;
        map[e.project_id] = { name: proj?.name ?? 'Unknown', clientName: cli?.name ?? '', hours: 0, billableHours: 0, entries: 0 };
      }
      map[e.project_id].hours += Number(e.hours);
      if (e.billable) map[e.project_id].billableHours += Number(e.hours);
      map[e.project_id].entries++;
    });
    return Object.entries(map).sort((a, b) => b[1].hours - a[1].hours);
  }, [filteredEntries, projectMap, clientMap]);

  const sortedEntries = useMemo(() =>
    [...filteredEntries].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
    [filteredEntries]
  );

  // ── Weekly Hours Matrix data ──────────────────────────────────────────────────
  const weeklyMatrixData = useMemo(() => {
    // Generate all week start dates (Monday-aligned) covering the selected range
    const weeks: { key: string; label: string }[] = [];
    let current = startOfWeek(f.startDate, { weekStartsOn: 1 });
    while (current <= f.endDate) {
      const weekN = Math.ceil(current.getDate() / 7);
      weeks.push({
        key: format(current, 'yyyy-MM-dd'),
        label: `${format(current, 'MMM')}-Week${weekN}`,
      });
      current = addWeeks(current, 1);
    }

    // Build userId → weekKey → hours map
    const hoursMap: Record<string, Record<string, number>> = {};
    filteredEntries.forEach(e => {
      // Parse date string as a local date to avoid UTC midnight shifting the day
      // across a week boundary in negative-offset timezones (e.g. UTC-5 in Colombia).
      // new Date("2026-04-06") → UTC midnight → Apr 5 local → wrong week bucket.
      const [ey, em, ed] = e.date.split('-').map(Number);
      const weekStart = startOfWeek(new Date(ey, em - 1, ed), { weekStartsOn: 1 });
      const weekKey = format(weekStart, 'yyyy-MM-dd');
      if (!hoursMap[e.user_id]) hoursMap[e.user_id] = {};
      hoursMap[e.user_id][weekKey] = (hoursMap[e.user_id][weekKey] ?? 0) + Number(e.hours);
    });

    // Rows sorted by employee name
    const employeeIds = [...new Set(filteredEntries.map(e => e.user_id))];
    const rows = employeeIds
      .map(uid => ({
        employeeId: uid,
        name: employeeMap.get(uid)?.name ?? 'Deleted Employee',
        weekHours: weeks.map(w => hoursMap[uid]?.[w.key] ?? 0),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    // Totals per week column
    const totals = weeks.map((_, i) => rows.reduce((sum, r) => sum + r.weekHours[i], 0));

    return { weeks, rows, totals };
  }, [filteredEntries, f.startDate, f.endDate, employeeMap]);

  // ── Filter chips ──────────────────────────────────────────────────────────────
  const chips = useMemo(() => {
    const c: { key: string; label: string; onClear: () => void }[] = [];
    if (f.employeeId !== 'all') c.push({ key: 'emp',  label: `Employee: ${employeeMap.get(f.employeeId)?.name ?? f.employeeId}`, onClear: () => set('employeeId', 'all') });
    if (f.projectId !== 'all')  c.push({ key: 'proj', label: `Project: ${projectMap.get(f.projectId)?.name ?? f.projectId}`,    onClear: () => set('projectId', 'all') });
    if (f.clientId !== 'all')   c.push({ key: 'cli',  label: `Client: ${clientMap.get(f.clientId)?.name ?? f.clientId}`,        onClear: () => set('clientId', 'all') });
    if (f.status !== 'all')     c.push({ key: 'st',   label: `Status: ${f.status === 'on_hold' ? 'On Hold' : 'Normal'}`,        onClear: () => set('status', 'all') });
    if (f.billing !== 'all')    c.push({ key: 'bi',   label: f.billing === 'billable' ? 'Billable only' : 'Non-billable only',   onClear: () => set('billing', 'all') });
    if (f.search)               c.push({ key: 'q',    label: `"${f.search}"`,                                                   onClear: () => set('search', '') });
    return c;
  }, [f, employeeMap, projectMap, clientMap]);

  if (isLoading) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  const showCharts = viewMode === 'charts' || viewMode === 'both';
  const showTables = viewMode === 'tables' || viewMode === 'both';
  const barHeight = Math.max(260, employeeChartData.length * 38);

  return (
    <div className="space-y-6">
      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Employee Report</h1>
          <p className="text-muted-foreground text-sm">Cascading filters · Interactive charts</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {hasActiveFilters && (
            <Button variant="outline" size="sm" onClick={clearAll} className="gap-1.5">
              <X className="h-3.5 w-3.5" />Clear All
            </Button>
          )}
          {/* View toggle */}
          <div className="flex rounded-md border overflow-hidden text-sm">
            {([['charts', LayoutDashboard], ['both', BarChart2], ['tables', TableIcon]] as [ViewMode, React.ElementType][]).map(([mode, Icon]) => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                className={`flex items-center gap-1.5 px-3 py-1.5 capitalize transition-colors ${viewMode === mode ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}
              >
                <Icon className="h-3.5 w-3.5" />
                {mode}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Filters ───────────────────────────────────────────────────────── */}
      <Card className="card-elevated">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Filter className="h-4 w-4" />Filters
            {hasActiveFilters && <Badge variant="secondary" className="ml-1 text-xs font-normal">{chips.length} active</Badge>}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Start Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-start gap-2 text-sm">
                    <CalendarIcon className="h-4 w-4" />{format(f.startDate, 'MMM d, yyyy')}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={f.startDate} onSelect={d => d && set('startDate', d)} initialFocus className="pointer-events-auto" />
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">End Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-start gap-2 text-sm">
                    <CalendarIcon className="h-4 w-4" />{format(f.endDate, 'MMM d, yyyy')}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={f.endDate} onSelect={d => d && set('endDate', d)} initialFocus className="pointer-events-auto" />
                </PopoverContent>
              </Popover>
            </div>
            <FilterSelect label="Client" value={f.clientId} allLabel="All Clients"
              options={availableClients.map(c => ({ value: c.id, label: c.name }))}
              isFiltered={availableClients.length < clients.length}
              onChange={v => set('clientId', v)} onClear={() => set('clientId', 'all')} />
            <FilterSelect label="Project" value={f.projectId} allLabel="All Projects"
              options={availableProjects.map(p => ({ value: p.id, label: p.name }))}
              isFiltered={availableProjects.length < projects.length}
              onChange={handleProjectChange} onClear={() => set('projectId', 'all')} />
            {isAdmin && (
              <FilterSelect label="Employee" value={f.employeeId} allLabel="All Employees"
                options={availableEmployees.map(e => ({ value: e.id, label: e.name }))}
                isFiltered={availableEmployees.length < employees.length}
                onChange={v => set('employeeId', v)} onClear={() => set('employeeId', 'all')} />
            )}
            <FilterSelect label="Status" value={f.status} allLabel="All Statuses"
              options={[{ value: 'normal', label: 'Normal' }, { value: 'on_hold', label: 'On Hold' }]}
              isFiltered={false} onChange={v => set('status', v)} onClear={() => set('status', 'all')} />
            <FilterSelect label="Billing" value={f.billing} allLabel="All"
              options={[{ value: 'billable', label: 'Billable' }, { value: 'non_billable', label: 'Non-billable' }]}
              isFiltered={false} onChange={v => set('billing', v)} onClear={() => set('billing', 'all')} />
            <div className="space-y-1.5">
              <div className="flex items-center justify-between min-h-[16px]">
                <Label className="text-xs text-muted-foreground">Search</Label>
                {f.search && <button onClick={() => set('search', '')} className="text-muted-foreground hover:text-foreground"><X className="h-3 w-3" /></button>}
              </div>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input placeholder="Notes, project, employee…" value={f.search} onChange={e => set('search', e.target.value)}
                  className={`pl-10 text-sm ${f.search ? 'border-primary/60 bg-primary/5' : ''}`} />
              </div>
            </div>
          </div>
          {chips.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-1 border-t">
              {chips.map(chip => (
                <span key={chip.key} className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
                  {chip.label}
                  <button onClick={chip.onClear} className="ml-0.5 rounded-full hover:bg-primary/20 transition-colors"><X className="h-3 w-3" /></button>
                </span>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── KPI cards ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <KpiCard label="Total Hours" value={`${kpis.total.toFixed(1)}h`} icon={Clock} color="bg-primary/10 text-primary" />
        <KpiCard label="Billable Hours" value={`${kpis.billable.toFixed(1)}h`} sub={`${kpis.billabilityPct.toFixed(0)}% of total`} icon={TrendingUp} color="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" />
        <KpiCard label="Non-billable" value={`${kpis.nonBillable.toFixed(1)}h`} sub={`${(100 - kpis.billabilityPct).toFixed(0)}% of total`} icon={Activity} color="bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400" />
        <KpiCard label="Entries" value={String(kpis.entries)} icon={BarChart2} color="bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400" />
        <KpiCard label="Avg Hours / Day" value={`${kpis.avgPerDay.toFixed(1)}h`} icon={Clock} color="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" />
        <KpiCard label="Billability Rate" value={`${kpis.billabilityPct.toFixed(0)}%`} icon={TrendingUp} color="bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400" />
      </div>

      {/* ── Weekly Hours Matrix ─────────────────────────────────────────── */}
      <Card className="card-elevated">
        <CardHeader>
          <CardTitle className="text-base">Weekly Hours Matrix</CardTitle>
          <p className="text-xs text-muted-foreground">
            Hours per employee per week · Cells highlighted in blue exceed 40h
          </p>
        </CardHeader>
        <CardContent>
          {weeklyMatrixData.rows.length === 0 ? (
            <p className="text-center text-muted-foreground py-6 text-sm">No data for the selected filters.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="table-header sticky left-0 bg-background z-10 min-w-[160px] shadow-[1px_0_0_0_hsl(var(--border))]">
                      Employee
                    </TableHead>
                    {weeklyMatrixData.weeks.map(w => (
                      <TableHead key={w.key} className="table-header text-center whitespace-nowrap min-w-[100px]">
                        {w.label}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {weeklyMatrixData.rows.map(row => (
                    <TableRow key={row.employeeId}>
                      <TableCell className="font-medium text-sm sticky left-0 bg-background z-10 shadow-[1px_0_0_0_hsl(var(--border))]">
                        {row.name}
                      </TableCell>
                      {row.weekHours.map((hours, i) => (
                        <TableCell
                          key={i}
                          className={`text-center text-sm font-medium tabular-nums transition-colors ${
                            hours > 40
                              ? 'bg-primary text-primary-foreground'
                              : ''
                          }`}
                        >
                          {hours > 0 ? `${hours.toFixed(1)}h` : ''}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                  {/* Totals row */}
                  <TableRow className="border-t-2 border-border">
                    <TableCell className="font-bold text-sm sticky left-0 bg-background z-10 shadow-[1px_0_0_0_hsl(var(--border))]">
                      Total
                    </TableCell>
                    {weeklyMatrixData.totals.map((total, i) => (
                      <TableCell
                        key={i}
                        className="text-center text-sm font-bold tabular-nums text-primary"
                      >
                        {total > 0 ? `${total.toFixed(1)}h` : ''}
                      </TableCell>
                    ))}
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {showCharts && (
        <>
          {/* ── Hours over time ─────────────────────────────────────────── */}
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <CardTitle className="text-base">Hours Over Time</CardTitle>
                <div className="flex rounded-md border overflow-hidden text-xs">
                  {(['daily', 'weekly'] as TimeGroup[]).map(g => (
                    <button key={g} onClick={() => setTimeGroup(g)}
                      className={`px-3 py-1.5 capitalize transition-colors ${timeGroup === g ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}>
                      {g}
                    </button>
                  ))}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {timeChartData.length === 0 ? <div className="h-[200px] flex items-center justify-center"><ChartEmpty /></div> : (
                <ResponsiveContainer width="100%" height={220}>
                  <AreaChart data={timeChartData} margin={{ top: 4, right: 16, left: -16, bottom: 0 }}>
                    <defs>
                      <linearGradient id="gradBillable" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={BILLABLE_COLOR} stopOpacity={0.25} />
                        <stop offset="95%" stopColor={BILLABLE_COLOR} stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="gradNonBillable" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={NON_BILLABLE_COLOR} stopOpacity={0.3} />
                        <stop offset="95%" stopColor={NON_BILLABLE_COLOR} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                    <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} unit="h" />
                    <Tooltip content={<ChartTooltip />} />
                    <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
                    <Area type="monotone" dataKey="Billable" stackId="1" stroke={BILLABLE_COLOR} fill="url(#gradBillable)" strokeWidth={2} />
                    <Area type="monotone" dataKey="Non-billable" stackId="1" stroke={NON_BILLABLE_COLOR} fill="url(#gradNonBillable)" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          {/* ── Employee + Project side by side ─────────────────────────── */}
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Hours by Employee */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Hours by Employee</CardTitle>
                <p className="text-xs text-muted-foreground">Click a bar to filter by that employee</p>
              </CardHeader>
              <CardContent>
                {employeeChartData.length === 0 ? <div className="h-[240px] flex items-center justify-center"><ChartEmpty /></div> : (
                  <ResponsiveContainer width="100%" height={barHeight}>
                    <BarChart
                      data={employeeChartData}
                      layout="vertical"
                      margin={{ top: 0, right: 16, left: 0, bottom: 0 }}
                      onClick={data => {
                        const uid = data?.activePayload?.[0]?.payload?.userId;
                        if (uid) set('employeeId', uid);
                      }}
                      style={{ cursor: 'pointer' }}
                    >
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
                      <XAxis type="number" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} unit="h" />
                      <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                      <Tooltip content={<ChartTooltip />} cursor={{ fill: 'hsl(var(--muted)/0.5)' }} />
                      <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
                      <Bar dataKey="Billable" stackId="a" fill={BILLABLE_COLOR} radius={[0, 0, 0, 0]} />
                      <Bar dataKey="Non-billable" stackId="a" fill={NON_BILLABLE_COLOR} radius={[0, 3, 3, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            {/* Hours by Project — donut */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Hours by Project</CardTitle>
                <p className="text-xs text-muted-foreground">Click a slice to filter by that project</p>
              </CardHeader>
              <CardContent>
                {projectPieData.length === 0 ? <div className="h-[240px] flex items-center justify-center"><ChartEmpty /></div> : (
                  <div className="flex flex-col items-center gap-2">
                    <ResponsiveContainer width="100%" height={220}>
                      <PieChart>
                        <Pie
                          data={projectPieData}
                          dataKey="value"
                          nameKey="name"
                          innerRadius="52%"
                          outerRadius="72%"
                          paddingAngle={2}
                          onClick={data => { if (data?.id) set('projectId', data.id); }}
                          style={{ cursor: 'pointer' }}
                        >
                          {projectPieData.map((_, i) => (
                            <Cell key={i} fill={PROJECT_COLORS[i % PROJECT_COLORS.length]} stroke="transparent" />
                          ))}
                          <PieLabel content={({ viewBox }) => <DonutCenter viewBox={viewBox as { cx: number; cy: number }} total={kpis.total} />} position="center" />
                        </Pie>
                        <Tooltip formatter={(v: number) => [`${v.toFixed(1)}h`, 'Hours']} />
                        <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} formatter={(val) => val.length > 20 ? val.slice(0, 18) + '…' : val} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* ── Billable hours by project — full-width stacked bar ───────── */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Billable vs Non-billable by Project</CardTitle>
              <p className="text-xs text-muted-foreground">Click a bar to filter by that project</p>
            </CardHeader>
            <CardContent>
              {projectBarData.length === 0 ? <div className="h-[200px] flex items-center justify-center"><ChartEmpty /></div> : (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart
                    data={projectBarData}
                    margin={{ top: 8, right: 16, left: -16, bottom: 40 }}
                    onClick={data => {
                      const id = data?.activePayload?.[0]?.payload?.id;
                      if (id) set('projectId', id);
                    }}
                    style={{ cursor: 'pointer' }}
                  >
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                    <XAxis dataKey="name" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} angle={-30} textAnchor="end" interval={0} />
                    <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} unit="h" />
                    <Tooltip content={<ChartTooltip />} cursor={{ fill: 'hsl(var(--muted)/0.5)' }} />
                    <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="Billable" stackId="a" fill={BILLABLE_COLOR} radius={[0, 0, 0, 0]} />
                    <Bar dataKey="Non-billable" stackId="a" fill={NON_BILLABLE_COLOR} radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {/* ── Tables ────────────────────────────────────────────────────────── */}
      {showTables && (
        <>
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Totals by project */}
            <Card className="card-elevated">
              <CardHeader><CardTitle className="text-base">Totals by Project</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {projectTotals.map(([projectId, { name, clientName, hours, billableHours, entries }]) => (
                    <div key={projectId} className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                      <div>
                        <p className="font-medium text-sm">{name}</p>
                        <p className="text-xs text-muted-foreground">{clientName} · {entries} {entries === 1 ? 'entry' : 'entries'} · {billableHours.toFixed(1)}h billable</p>
                      </div>
                      <span className="font-bold text-primary">{hours.toFixed(1)}h</span>
                    </div>
                  ))}
                  {projectTotals.length === 0 && <p className="text-center text-muted-foreground py-6 text-sm">No data for the selected filters.</p>}
                </div>
              </CardContent>
            </Card>

            {/* Detailed entries */}
            <Card className="card-elevated">
              <CardHeader><CardTitle className="text-base">Detailed Entries</CardTitle></CardHeader>
              <CardContent>
                <div className="max-h-[500px] overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="table-header">Date</TableHead>
                        {isAdmin && <TableHead className="table-header">Employee</TableHead>}
                        <TableHead className="table-header">Project</TableHead>
                        <TableHead className="table-header text-right">Hours</TableHead>
                        <TableHead className="table-header">Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sortedEntries.slice(0, 100).map(entry => (
                        <TableRow key={entry.id}>
                          <TableCell className="text-sm">{format(new Date(entry.date), 'MMM d')}</TableCell>
                          {isAdmin && (
                            <TableCell className="text-sm">
                              {employeeMap.get(entry.user_id)?.name ?? 'Deleted Employee'}
                            </TableCell>
                          )}
                          <TableCell className="text-sm">{projectMap.get(entry.project_id)?.name ?? 'Unknown'}</TableCell>
                          <TableCell className="text-right font-medium">{Number(entry.hours)}h</TableCell>
                          <TableCell>
                            <div className="flex gap-1 flex-wrap">
                              <Badge variant={entry.billable ? 'default' : 'secondary'} className="text-xs">
                                {entry.billable ? 'Billable' : 'Non-billable'}
                              </Badge>
                              {entry.status === 'on_hold' && (
                                <Badge variant="outline" className="text-xs text-warning border-warning">On Hold</Badge>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                      {sortedEntries.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={isAdmin ? 5 : 4} className="text-center text-muted-foreground py-8">
                            No entries match the selected filters.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                  {sortedEntries.length > 100 && (
                    <p className="text-xs text-muted-foreground text-center py-2">
                      Showing first 100 of {sortedEntries.length} entries
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

        </>
      )}
    </div>
  );
}
