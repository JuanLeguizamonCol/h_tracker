import { useState, useMemo, useEffect } from 'react';
import { format, startOfMonth, endOfMonth, startOfWeek, addWeeks, addDays } from 'date-fns';
import {
  CalendarIcon, Search, Loader2, Filter, X,
  Clock, TrendingUp, Activity, BarChart2, Table as TableIcon,
  LayoutDashboard, Download, Gauge, AlertTriangle, TrendingDown, CheckCircle2,
} from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import {
  ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, Cell, ReferenceLine,
  AreaChart, Area,
} from 'recharts';
import { useAuth } from '@/contexts/AuthContext';
import { useProjects } from '@/hooks/useProjects';
import { useClients } from '@/hooks/useClients';
import { useEmployees } from '@/hooks/useEmployees';
import { useAllTimeEntriesByDateRange, useTimeEntriesByDateRange } from '@/hooks/useTimeEntries';
import { useStaffing } from '@/hooks/useAssignedProjects';
import { useSkillSearch, useSkillCatalog } from '@/hooks/useSkills';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

// ─── Constants ────────────────────────────────────────────────────────────────

const BILLABLE_COLOR = '#3B82F6';
const NON_BILLABLE_COLOR = '#CBD5E1';

// Utilization report: capacity is 40h/week. Overloaded = averaging more than
// that; underloaded = meaningfully below it (under 80%, i.e. <32h/week) so
// everyone isn't flagged just for logging 38h one week.
const WEEKLY_CAPACITY_HOURS = 40;
const UNDERLOADED_RATIO = 0.8;
const STATUS_COLORS: Record<string, string> = {
  overloaded: '#EF4444',
  balanced: '#10B981',
  underloaded: '#F59E0B',
};
const STATUS_LABELS: Record<string, string> = {
  overloaded: 'Overloaded',
  balanced: 'Balanced',
  underloaded: 'Underloaded',
};

// Sentinel value used when an employee has no `location` set, so it can still
// be selected in the Location filter and appear as its own group.
const NO_LOCATION = '__none__';
const NO_LOCATION_LABEL = 'No location';

// Parse a 'yyyy-MM-dd' string as a LOCAL date. `new Date("2026-08-01")` parses the
// string as UTC midnight, which in negative-offset timezones (e.g. UTC-5 Colombia)
// renders as the PREVIOUS day — pushing Friday/weekend entries onto the wrong day
// (or week) in charts and tables. Building from parts keeps the calendar day intact.
function parseLocalDate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

// Occupancy cell background for the projected-utilization matrix — red over
// capacity, amber meaningfully under (< 80%), green in the healthy band.
function occupancyCellClass(pct: number): string {
  if (pct <= 0) return '';
  if (pct > 100) return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400';
  if (pct < UNDERLOADED_RATIO * 100) return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400';
  return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400';
}

// ─── Filter state ─────────────────────────────────────────────────────────────

type Filters = {
  startDate: Date;
  endDate: Date;
  employeeId: string;
  projectId: string;
  clientId: string;
  location: string;
  ownerId: string;
  managerId: string;
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
  location: 'all',
  ownerId: 'all',
  managerId: 'all',
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

const PROFICIENCY_LABELS: Record<number, string> = { 1: 'Beginner', 2: 'Intermediate', 3: 'Advanced', 4: 'Expert' };

function SkillsSearchPanel() {
  const [skillQuery, setSkillQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [category, setCategory] = useState('all');
  const [minProficiency, setMinProficiency] = useState('all');

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(skillQuery.trim()), 300);
    return () => clearTimeout(t);
  }, [skillQuery]);

  const { data: catalog = [] } = useSkillCatalog();
  const categories = useMemo(
    () => Array.from(new Set(catalog.map(c => c.category))).sort(),
    [catalog]
  );

  const hasQuery = !!debouncedQuery || category !== 'all' || minProficiency !== 'all';
  const { data: results = [], isLoading } = useSkillSearch(
    {
      q: debouncedQuery || undefined,
      category: category !== 'all' ? category : undefined,
      min_proficiency: minProficiency !== 'all' ? parseInt(minProficiency) : undefined,
    },
    { enabled: hasQuery }
  );

  const grouped = useMemo(() => {
    const map = new Map<string, { employee_name: string; title: string | null; department: string | null; location: string | null; skills: typeof results }>();
    results.forEach(r => {
      if (!map.has(r.employee_id)) {
        map.set(r.employee_id, { employee_name: r.employee_name, title: r.title, department: r.department, location: r.location, skills: [] });
      }
      map.get(r.employee_id)!.skills.push(r);
    });
    return Array.from(map.values()).sort((a, b) => a.employee_name.localeCompare(b.employee_name));
  }, [results]);

  return (
    <Card className="card-elevated">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Search className="h-4 w-4" />Skills Search
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Find who has a skill loaded on their profile — for staffing new projects.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 md:grid-cols-3">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Skill</Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="e.g. Power BI, SQL, Tableau…"
                value={skillQuery}
                onChange={e => setSkillQuery(e.target.value)}
                className="pl-10 text-sm"
              />
            </div>
          </div>
          <FilterSelect label="Category" value={category} allLabel="All Categories"
            options={categories.map(c => ({ value: c, label: c }))}
            isFiltered={category !== 'all'} onChange={setCategory} onClear={() => setCategory('all')} />
          <FilterSelect label="Min Proficiency" value={minProficiency} allLabel="Any Level"
            options={[
              { value: '1', label: 'Beginner+' },
              { value: '2', label: 'Intermediate+' },
              { value: '3', label: 'Advanced+' },
              { value: '4', label: 'Expert' },
            ]}
            isFiltered={minProficiency !== 'all'} onChange={setMinProficiency} onClear={() => setMinProficiency('all')} />
        </div>

        {!hasQuery ? (
          <p className="text-sm text-muted-foreground text-center py-6">
            Search by skill, category, or minimum proficiency to see who has it.
          </p>
        ) : isLoading ? (
          <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
        ) : grouped.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">No employees found with that skill.</p>
        ) : (
          <div className="space-y-3">
            {grouped.map(g => (
              <div key={g.employee_name} className="rounded-lg border p-3">
                <div>
                  <p className="font-medium text-foreground">{g.employee_name}</p>
                  <p className="text-xs text-muted-foreground">
                    {[g.title, g.department, g.location].filter(Boolean).join(' · ') || '—'}
                  </p>
                </div>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {g.skills.map(s => (
                    <Badge key={s.skill_id} variant="secondary" className="text-xs font-normal">
                      {s.skill_name} · {PROFICIENCY_LABELS[s.proficiency_level] || s.proficiency_level}
                      {s.years_experience != null && ` · ${s.years_experience}y`}
                      {s.certified && ' · ✓ cert'}
                    </Badge>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
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

// ─── Main component ───────────────────────────────────────────────────────────

type ViewMode = 'charts' | 'tables' | 'both';
type TimeGroup = 'daily' | 'weekly';

export default function Reports() {
  const { employee, canManage } = useAuth();
  const [f, setF] = useState<Filters>(INIT);
  const set = <K extends keyof Filters>(key: K, val: Filters[K]) =>
    setF(prev => ({ ...prev, [key]: val }));

  const [viewMode, setViewMode] = useState<ViewMode>('both');
  const [timeGroup, setTimeGroup] = useState<TimeGroup>('daily');
  const [isExporting, setIsExporting] = useState(false);

  const { data: projects = [] } = useProjects();
  const { data: clients = [] } = useClients();
  const { data: employees = [] } = useEmployees();

  // Only fetch the dataset the current role actually uses: admins see the whole
  // org, everyone else sees just their own entries. Without these guards a
  // non-admin also downloaded the org-wide dataset just to discard it.
  const { data: allEntries = [], isLoading: allLoading } =
    useAllTimeEntriesByDateRange(f.startDate, f.endDate, { enabled: canManage });
  const { data: myEntries = [], isLoading: myLoading } =
    useTimeEntriesByDateRange(f.startDate, f.endDate, employee?.id, undefined, { enabled: !canManage });
  // Staffing plan (allocation % + project window per assignment) — feeds the
  // forward-looking projection and the projected-vs-actual comparison in the
  // Utilization report. Manager-only, like the rest of the org-wide data here.
  const { data: staffing = [] } = useStaffing({ enabled: canManage });

  const rawEntries = canManage ? allEntries : myEntries;
  const isLoading = canManage ? allLoading : myLoading;

  // ── Lookup maps ──────────────────────────────────────────────────────────────
  const projectMap  = useMemo(() => new Map(projects.map(p => [p.id, p])), [projects]);
  const clientMap   = useMemo(() => new Map(clients.map(c => [c.id, c])), [clients]);
  const employeeMap = useMemo(() => new Map(employees.map(e => [e.id, e])), [employees]);

  // Location grouping key for an entry's employee (falls back to a sentinel so
  // employees without a location still form their own selectable group).
  const locationKeyOf = useMemo(
    () => (userId: string) => employeeMap.get(userId)?.location?.trim() || NO_LOCATION,
    [employeeMap]
  );

  // ── Cascade: available options ────────────────────────────────────────────────
  const availableProjects = useMemo(() => {
    const ids = new Set(rawEntries
      .filter(e =>
        (f.clientId === 'all' || projectMap.get(e.project_id)?.client_id === f.clientId) &&
        (f.employeeId === 'all' || e.user_id === f.employeeId) &&
        (f.location === 'all' || locationKeyOf(e.user_id) === f.location)
      ).map(e => e.project_id));
    return projects.filter(p => ids.has(p.id));
  }, [rawEntries, projects, f.clientId, f.employeeId, f.location, projectMap, locationKeyOf]);

  const availableClients = useMemo(() => {
    const ids = new Set(rawEntries
      .filter(e =>
        (f.projectId === 'all' || e.project_id === f.projectId) &&
        (f.employeeId === 'all' || e.user_id === f.employeeId) &&
        (f.location === 'all' || locationKeyOf(e.user_id) === f.location)
      ).map(e => projectMap.get(e.project_id)?.client_id).filter((id): id is string => !!id));
    return clients.filter(c => ids.has(c.id));
  }, [rawEntries, clients, f.projectId, f.employeeId, f.location, projectMap, locationKeyOf]);

  const availableEmployees = useMemo(() => {
    const ids = new Set(rawEntries
      .filter(e =>
        (f.projectId === 'all' || e.project_id === f.projectId) &&
        (f.clientId === 'all' || projectMap.get(e.project_id)?.client_id === f.clientId) &&
        (f.location === 'all' || locationKeyOf(e.user_id) === f.location)
      ).map(e => e.user_id));
    return employees.filter(e => ids.has(e.id));
  }, [rawEntries, employees, f.projectId, f.clientId, f.location, projectMap, locationKeyOf]);

  // Distinct locations present in the currently-cascaded entries.
  const availableLocations = useMemo(() => {
    const keys = new Set<string>();
    rawEntries
      .filter(e =>
        (f.projectId === 'all' || e.project_id === f.projectId) &&
        (f.clientId === 'all' || projectMap.get(e.project_id)?.client_id === f.clientId) &&
        (f.employeeId === 'all' || e.user_id === f.employeeId)
      )
      .forEach(e => keys.add(locationKeyOf(e.user_id)));
    return [...keys]
      .sort((a, b) => (a === NO_LOCATION ? 1 : b === NO_LOCATION ? -1 : a.localeCompare(b)))
      .map(k => ({ value: k, label: k === NO_LOCATION ? NO_LOCATION_LABEL : k }));
  }, [rawEntries, f.projectId, f.clientId, f.employeeId, projectMap, locationKeyOf]);

  // Distinct project owners / managers present in the current entries.
  const availableOwners = useMemo(() => {
    const byId = new Map<string, string>();
    rawEntries.forEach(e => {
      const p = projectMap.get(e.project_id);
      if (p?.owner_id) byId.set(p.owner_id, p.owner_name ?? p.owner_id);
    });
    return [...byId].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label));
  }, [rawEntries, projectMap]);

  const availableManagers = useMemo(() => {
    const byId = new Map<string, string>();
    rawEntries.forEach(e => {
      const p = projectMap.get(e.project_id);
      if (p?.manager_id) byId.set(p.manager_id, p.manager_name ?? p.manager_id);
    });
    return [...byId].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label));
  }, [rawEntries, projectMap]);

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

  const clearAll = () => setF(prev => ({ ...prev, employeeId: 'all', projectId: 'all', clientId: 'all', location: 'all', ownerId: 'all', managerId: 'all', status: 'all', billing: 'all', search: '' }));

  // ── Excel export (server-generated, honours the current filters) ───────────────
  const handleExportExcel = async () => {
    setIsExporting(true);
    try {
      const params = new URLSearchParams();
      params.set('date_gte', format(f.startDate, 'yyyy-MM-dd'));
      params.set('date_lte', format(f.endDate, 'yyyy-MM-dd'));
      if (f.employeeId !== 'all') params.set('user_id', f.employeeId);
      if (f.projectId !== 'all') params.set('project_id', f.projectId);
      if (f.clientId !== 'all') params.set('client_id', f.clientId);
      if (f.location !== 'all') params.set('location', f.location);
      if (f.ownerId !== 'all') params.set('owner_id', f.ownerId);
      if (f.managerId !== 'all') params.set('manager_id', f.managerId);
      if (f.status !== 'all') params.set('status', f.status);
      if (f.billing !== 'all') params.set('billing', f.billing);
      if (f.search) params.set('search', f.search);
      const filename = `worked-hours_${format(f.startDate, 'yyyy-MM-dd')}_${format(f.endDate, 'yyyy-MM-dd')}.xlsx`;
      await api.download(`/reports/time-entries/export/xlsx?${params.toString()}`, filename);
    } catch {
      toast.error('No se pudo generar el Excel. Intenta de nuevo.');
    } finally {
      setIsExporting(false);
    }
  };
  const hasActiveFilters = f.employeeId !== 'all' || f.projectId !== 'all' || f.clientId !== 'all' || f.location !== 'all' || f.ownerId !== 'all' || f.managerId !== 'all' || f.status !== 'all' || f.billing !== 'all' || !!f.search;

  // ── Filtered entries (single source of truth) ─────────────────────────────────
  const filteredEntries = useMemo(() => rawEntries.filter(e => {
    if (f.employeeId !== 'all' && e.user_id !== f.employeeId) return false;
    if (f.projectId !== 'all' && e.project_id !== f.projectId) return false;
    if (f.clientId !== 'all' && projectMap.get(e.project_id)?.client_id !== f.clientId) return false;
    if (f.location !== 'all' && locationKeyOf(e.user_id) !== f.location) return false;
    if (f.ownerId !== 'all' && projectMap.get(e.project_id)?.owner_id !== f.ownerId) return false;
    if (f.managerId !== 'all' && projectMap.get(e.project_id)?.manager_id !== f.managerId) return false;
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

  // ── Chart: hours by location ──────────────────────────────────────────────────
  const locationChartData = useMemo(() => {
    const map: Record<string, { key: string; name: string; Billable: number; 'Non-billable': number; employees: Set<string> }> = {};
    filteredEntries.forEach(e => {
      const key = locationKeyOf(e.user_id);
      if (!map[key]) map[key] = { key, name: key === NO_LOCATION ? NO_LOCATION_LABEL : key, Billable: 0, 'Non-billable': 0, employees: new Set() };
      map[key].employees.add(e.user_id);
      if (e.billable) map[key].Billable += Number(e.hours);
      else map[key]['Non-billable'] += Number(e.hours);
    });
    return Object.values(map)
      .map(d => ({ key: d.key, name: d.name, Billable: d.Billable, 'Non-billable': d['Non-billable'], total: d.Billable + d['Non-billable'], employeeCount: d.employees.size }))
      .sort((a, b) => b.total - a.total);
  }, [filteredEntries, locationKeyOf]);

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
        ? format(startOfWeek(parseLocalDate(e.date), { weekStartsOn: 1 }), 'yyyy-MM-dd')
        : e.date;
      if (!map[key]) map[key] = { date: key, Billable: 0, 'Non-billable': 0 };
      if (e.billable) map[key].Billable += Number(e.hours);
      else map[key]['Non-billable'] += Number(e.hours);
    });
    return Object.values(map)
      .sort((a, b) => a.date.localeCompare(b.date))
      .map(d => ({ ...d, date: format(parseLocalDate(d.date), 'MMM d') }));
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
    [...filteredEntries].sort((a, b) => parseLocalDate(b.date).getTime() - parseLocalDate(a.date).getTime()),
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
      // Local parse so a Sun/Mon boundary entry isn't shifted into the wrong week.
      const weekStart = startOfWeek(parseLocalDate(e.date), { weekStartsOn: 1 });
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

  // ── Utilization report: cargability against a 40h/week benchmark ───────────────
  // Reuses the same per-employee-per-week hours as the matrix above, so a week
  // with no logged hours correctly counts as 0% that week (real bench time),
  // not as a week that's simply excluded from the average.
  //
  // Registered internal-project hours (vacation, holidays, meetings, etc.) are
  // NOT a separate opt-in here — unlike the Staffing-based projection, actual
  // occupancy counts every hour someone logged, client or internal, because
  // that's real time and matters for performance/metrics review. They're
  // broken out as their own column below so it's visible how much of the
  // total is internal overhead vs. client work, not just folded in silently.
  const internalHoursByEmployee = useMemo(() => {
    const map = new Map<string, number>();
    filteredEntries.forEach(e => {
      if (projectMap.get(e.project_id)?.is_internal) {
        map.set(e.user_id, (map.get(e.user_id) ?? 0) + Number(e.hours));
      }
    });
    return map;
  }, [filteredEntries, projectMap]);

  const utilizationData = useMemo(() => {
    return weeklyMatrixData.rows
      .map(row => {
        const weeksCounted = row.weekHours.length;
        const totalHours = row.weekHours.reduce((sum, h) => sum + h, 0);
        const avgWeeklyHours = weeksCounted > 0 ? totalHours / weeksCounted : 0;
        const utilizationPct = (avgWeeklyHours / WEEKLY_CAPACITY_HOURS) * 100;
        const status: 'overloaded' | 'balanced' | 'underloaded' =
          avgWeeklyHours > WEEKLY_CAPACITY_HOURS
            ? 'overloaded'
            : avgWeeklyHours < WEEKLY_CAPACITY_HOURS * UNDERLOADED_RATIO
            ? 'underloaded'
            : 'balanced';
        const internalHours = internalHoursByEmployee.get(row.employeeId) ?? 0;
        return {
          employeeId: row.employeeId,
          name: row.name,
          totalHours,
          clientHours: totalHours - internalHours,
          internalHours,
          weeksCounted,
          avgWeeklyHours,
          utilizationPct,
          status,
          overloadedWeeks: row.weekHours.filter(h => h > WEEKLY_CAPACITY_HOURS).length,
        };
      })
      .sort((a, b) => b.avgWeeklyHours - a.avgWeeklyHours);
  }, [weeklyMatrixData, internalHoursByEmployee]);

  const utilizationSummary = useMemo(() => {
    const overloaded = utilizationData.filter(d => d.status === 'overloaded').length;
    const underloaded = utilizationData.filter(d => d.status === 'underloaded').length;
    const balanced = utilizationData.length - overloaded - underloaded;
    const avgUtilizationPct = utilizationData.length
      ? utilizationData.reduce((sum, d) => sum + d.utilizationPct, 0) / utilizationData.length
      : 0;
    return { overloaded, underloaded, balanced, avgUtilizationPct, total: utilizationData.length };
  }, [utilizationData]);

  // ── Utilization report: forward projection from Staffing ───────────────────────
  // Turns each assignment's allocation % (set in the Staffing panel) into implied
  // occupancy for the weeks ahead where the assignment is still active (within
  // the project's own start/end window). Only counts assignments that actually
  // have an allocation % set — an assignment with none doesn't contribute a
  // committed load. Rendered as a week-by-week matrix, same shape as the actual
  // Weekly Hours Matrix above.
  const PROJECTION_WEEKS = 10;

  const projectedWeeks = useMemo(() => {
    const weeks: { key: string; label: string; start: Date; end: Date }[] = [];
    let current = addWeeks(startOfWeek(new Date(), { weekStartsOn: 1 }), 1);
    for (let i = 0; i < PROJECTION_WEEKS; i++) {
      weeks.push({ key: format(current, 'yyyy-MM-dd'), label: format(current, 'MMM d'), start: current, end: addDays(current, 6) });
      current = addWeeks(current, 1);
    }
    return weeks;
  }, []);

  const projectedMatrixData = useMemo(() => {
    if (!canManage || staffing.length === 0) return { weeks: projectedWeeks, rows: [] as { employeeId: string; name: string; weekPct: number[] }[] };
    const byPerson = new Map<string, { userId: string; name: string; weekHours: number[] }>();

    projectedWeeks.forEach((week, weekIdx) => {
      staffing.forEach(a => {
        if (a.allocation_percentage == null || a.allocation_percentage <= 0) return;
        const start = a.project_start_date ? parseLocalDate(a.project_start_date) : null;
        const end = a.project_end_date ? parseLocalDate(a.project_end_date) : null;
        const activeThisWeek = (!start || start <= week.end) && (!end || end >= week.start);
        if (!activeThisWeek) return;

        if (!byPerson.has(a.user_id)) {
          byPerson.set(a.user_id, { userId: a.user_id, name: a.employee_name, weekHours: new Array(projectedWeeks.length).fill(0) });
        }
        byPerson.get(a.user_id)!.weekHours[weekIdx] += (a.allocation_percentage / 100) * WEEKLY_CAPACITY_HOURS;
      });
    });

    const rows = Array.from(byPerson.values())
      .map(p => ({
        employeeId: p.userId,
        name: p.name,
        weekPct: p.weekHours.map(h => (h / WEEKLY_CAPACITY_HOURS) * 100),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    return { weeks: projectedWeeks, rows };
  }, [staffing, projectedWeeks, canManage]);

  // ── Utilization report: projected (Staffing) vs actual (registered), per person ──
  // "Projected" = what Staffing currently plans for that person on that project
  // (their allocation % → implied hrs/week), regardless of the date filter.
  // "Actual" = hours THEY logged on THAT project within the selected filter
  // range, averaged per week. Grouped by person (their projects underneath),
  // not by project — that grouping was confusing since it mixed everyone's
  // hours into one project total.
  const personProjectComparison = useMemo(() => {
    if (!canManage) return [];

    const weeksInRange = Math.max(1, weeklyMatrixData.weeks.length);
    const actualByPersonProject = new Map<string, number>();
    filteredEntries.forEach(e => {
      const key = `${e.user_id}|${e.project_id}`;
      actualByPersonProject.set(key, (actualByPersonProject.get(key) ?? 0) + Number(e.hours));
    });

    type Row = {
      projectId: string; projectName: string; clientName: string;
      allocationPct: number; projectedHoursPerWeek: number; actualHoursPerWeek: number; planPct: number | null;
    };
    const byPerson = new Map<string, { userId: string; name: string; rows: Row[] }>();

    staffing.forEach(a => {
      if (a.allocation_percentage == null || a.allocation_percentage <= 0) return;
      const key = `${a.user_id}|${a.project_id}`;
      const actualHoursPerWeek = (actualByPersonProject.get(key) ?? 0) / weeksInRange;
      const projectedHoursPerWeek = (a.allocation_percentage / 100) * WEEKLY_CAPACITY_HOURS;
      const planPct = projectedHoursPerWeek > 0 ? (actualHoursPerWeek / projectedHoursPerWeek) * 100 : null;

      if (!byPerson.has(a.user_id)) {
        byPerson.set(a.user_id, { userId: a.user_id, name: a.employee_name, rows: [] });
      }
      byPerson.get(a.user_id)!.rows.push({
        projectId: a.project_id,
        projectName: a.project_name,
        clientName: a.client_name,
        allocationPct: a.allocation_percentage,
        projectedHoursPerWeek,
        actualHoursPerWeek,
        planPct,
      });
    });

    return Array.from(byPerson.values())
      .map(p => {
        const totalProjected = p.rows.reduce((sum, r) => sum + r.projectedHoursPerWeek, 0);
        const totalActual = p.rows.reduce((sum, r) => sum + r.actualHoursPerWeek, 0);
        const overallPlanPct = totalProjected > 0 ? (totalActual / totalProjected) * 100 : null;
        return {
          ...p,
          overallPlanPct,
          rows: p.rows.sort((a, b) => b.projectedHoursPerWeek - a.projectedHoursPerWeek),
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [staffing, filteredEntries, weeklyMatrixData.weeks.length, canManage]);

  // ── Filter chips ──────────────────────────────────────────────────────────────
  const chips = useMemo(() => {
    const c: { key: string; label: string; onClear: () => void }[] = [];
    if (f.employeeId !== 'all') c.push({ key: 'emp',  label: `Employee: ${employeeMap.get(f.employeeId)?.name ?? f.employeeId}`, onClear: () => set('employeeId', 'all') });
    if (f.projectId !== 'all')  c.push({ key: 'proj', label: `Project: ${projectMap.get(f.projectId)?.name ?? f.projectId}`,    onClear: () => set('projectId', 'all') });
    if (f.clientId !== 'all')   c.push({ key: 'cli',  label: `Client: ${clientMap.get(f.clientId)?.name ?? f.clientId}`,        onClear: () => set('clientId', 'all') });
    if (f.location !== 'all')   c.push({ key: 'loc',  label: `Location: ${f.location === NO_LOCATION ? NO_LOCATION_LABEL : f.location}`, onClear: () => set('location', 'all') });
    if (f.ownerId !== 'all')    c.push({ key: 'own',  label: `Owner: ${availableOwners.find(o => o.value === f.ownerId)?.label ?? f.ownerId}`, onClear: () => set('ownerId', 'all') });
    if (f.managerId !== 'all')  c.push({ key: 'mgr',  label: `Manager: ${availableManagers.find(m => m.value === f.managerId)?.label ?? f.managerId}`, onClear: () => set('managerId', 'all') });
    if (f.status !== 'all')     c.push({ key: 'st',   label: `Status: ${f.status === 'on_hold' ? 'On Hold' : 'Normal'}`,        onClear: () => set('status', 'all') });
    if (f.billing !== 'all')    c.push({ key: 'bi',   label: f.billing === 'billable' ? 'Billable only' : 'Non-billable only',   onClear: () => set('billing', 'all') });
    if (f.search)               c.push({ key: 'q',    label: `"${f.search}"`,                                                   onClear: () => set('search', '') });
    return c;
  }, [f, employeeMap, projectMap, clientMap, availableOwners, availableManagers]);

  if (isLoading) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  const showCharts = viewMode === 'charts' || viewMode === 'both';
  const showTables = viewMode === 'tables' || viewMode === 'both';
  const barHeight = Math.max(260, employeeChartData.length * 38);
  const utilizationBarHeight = Math.max(260, utilizationData.length * 38);

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
          <Button variant="outline" size="sm" onClick={handleExportExcel} disabled={isExporting} className="gap-1.5">
            {isExporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
            Export Excel
          </Button>
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
            {canManage && (
              <FilterSelect label="Employee" value={f.employeeId} allLabel="All Employees"
                options={availableEmployees.map(e => ({ value: e.id, label: e.name }))}
                isFiltered={availableEmployees.length < employees.length}
                onChange={v => set('employeeId', v)} onClear={() => set('employeeId', 'all')} />
            )}
            {canManage && (
              <FilterSelect label="Location" value={f.location} allLabel="All Locations"
                options={availableLocations}
                isFiltered={f.location !== 'all'}
                onChange={v => set('location', v)} onClear={() => set('location', 'all')} />
            )}
            {canManage && (
              <FilterSelect label="Owner" value={f.ownerId} allLabel="All Owners"
                options={availableOwners}
                isFiltered={f.ownerId !== 'all'}
                onChange={v => set('ownerId', v)} onClear={() => set('ownerId', 'all')} />
            )}
            {canManage && (
              <FilterSelect label="Project Manager" value={f.managerId} allLabel="All Managers"
                options={availableManagers}
                isFiltered={f.managerId !== 'all'}
                onChange={v => set('managerId', v)} onClear={() => set('managerId', 'all')} />
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

      {/* ── Skills Search (resource staffing) ────────────────────────────── */}
      {canManage && <SkillsSearchPanel />}

      <Tabs defaultValue="hours">
        <TabsList>
          <TabsTrigger value="hours" className="gap-1.5"><Clock className="h-4 w-4" />Hours Report</TabsTrigger>
          <TabsTrigger value="utilization" className="gap-1.5"><Gauge className="h-4 w-4" />Utilization Report</TabsTrigger>
        </TabsList>

        <TabsContent value="hours" className="space-y-6 mt-4">

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

      {/* ── Hours by Location ─────────────────────────────────────────────── */}
      {canManage && (
        <Card className="card-elevated">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Hours by Location</CardTitle>
            <p className="text-xs text-muted-foreground">
              Employees grouped by their location · Click a bar to filter
            </p>
          </CardHeader>
          <CardContent>
            {locationChartData.length === 0 ? (
              <div className="h-[200px] flex items-center justify-center"><ChartEmpty /></div>
            ) : (
              <div className="space-y-4">
                <ResponsiveContainer width="100%" height={Math.max(180, locationChartData.length * 46)}>
                  <BarChart
                    data={locationChartData}
                    layout="vertical"
                    margin={{ top: 0, right: 16, left: 0, bottom: 0 }}
                    onClick={data => {
                      const key = data?.activePayload?.[0]?.payload?.key;
                      if (key) set('location', key);
                    }}
                    style={{ cursor: 'pointer' }}
                  >
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
                    <XAxis type="number" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} unit="h" />
                    <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                    <Tooltip content={<ChartTooltip />} cursor={{ fill: 'hsl(var(--muted)/0.5)' }} />
                    <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="Billable" stackId="a" fill={BILLABLE_COLOR} radius={[0, 0, 0, 0]} />
                    <Bar dataKey="Non-billable" stackId="a" fill={NON_BILLABLE_COLOR} radius={[0, 3, 3, 0]} />
                  </BarChart>
                </ResponsiveContainer>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 pt-1 border-t">
                  {locationChartData.map(loc => (
                    <button
                      key={loc.key}
                      onClick={() => set('location', loc.key)}
                      className={`flex items-center justify-between p-2.5 rounded-lg text-left transition-colors ${
                        f.location === loc.key ? 'bg-primary/10 border border-primary/40' : 'bg-muted/30 hover:bg-muted/60'
                      }`}
                    >
                      <div className="min-w-0">
                        <p className="font-medium text-sm truncate">{loc.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {loc.employeeCount} {loc.employeeCount === 1 ? 'employee' : 'employees'}
                        </p>
                      </div>
                      <span className="font-bold text-primary text-sm whitespace-nowrap ml-2">{loc.total.toFixed(1)}h</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

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

          {/* ── Hours by Employee ────────────────────────────────────────── */}
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
                        {canManage && <TableHead className="table-header">Employee</TableHead>}
                        <TableHead className="table-header">Project</TableHead>
                        <TableHead className="table-header text-right">Hours</TableHead>
                        <TableHead className="table-header">Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sortedEntries.slice(0, 100).map(entry => (
                        <TableRow key={entry.id}>
                          <TableCell className="text-sm">{format(parseLocalDate(entry.date), 'MMM d')}</TableCell>
                          {canManage && (
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
                          <TableCell colSpan={canManage ? 5 : 4} className="text-center text-muted-foreground py-8">
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

        </TabsContent>

        <TabsContent value="utilization" className="space-y-6 mt-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KpiCard
              label="Team Avg Utilization" value={`${utilizationSummary.avgUtilizationPct.toFixed(0)}%`}
              sub={`vs. ${WEEKLY_CAPACITY_HOURS}h/week`} icon={Gauge} color="bg-primary/10 text-primary"
            />
            <KpiCard
              label="Overloaded" value={String(utilizationSummary.overloaded)}
              sub={`> ${WEEKLY_CAPACITY_HOURS}h/week avg`} icon={AlertTriangle}
              color="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
            />
            <KpiCard
              label="Balanced" value={String(utilizationSummary.balanced)}
              sub={`${(WEEKLY_CAPACITY_HOURS * UNDERLOADED_RATIO).toFixed(0)}–${WEEKLY_CAPACITY_HOURS}h/week`} icon={CheckCircle2}
              color="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
            />
            <KpiCard
              label="Underloaded" value={String(utilizationSummary.underloaded)}
              sub={`< ${(WEEKLY_CAPACITY_HOURS * UNDERLOADED_RATIO).toFixed(0)}h/week avg`} icon={TrendingDown}
              color="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
            />
          </div>

          <Card className="card-elevated">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Average Weekly Hours by Person</CardTitle>
              <p className="text-xs text-muted-foreground">
                Benchmark: {WEEKLY_CAPACITY_HOURS}h/week (dashed line) · Red = overloaded · Amber = underloaded · Green = balanced
              </p>
            </CardHeader>
            <CardContent>
              {utilizationData.length === 0 ? <div className="h-[240px] flex items-center justify-center"><ChartEmpty /></div> : (
                <ResponsiveContainer width="100%" height={utilizationBarHeight}>
                  <BarChart
                    data={utilizationData}
                    layout="vertical"
                    margin={{ top: 0, right: 24, left: 0, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
                    <XAxis type="number" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} unit="h" />
                    <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                    <Tooltip cursor={{ fill: 'hsl(var(--muted)/0.5)' }} formatter={(value: number) => [`${value.toFixed(1)}h/week avg`, 'Hours']} />
                    <ReferenceLine x={WEEKLY_CAPACITY_HOURS} stroke="#64748b" strokeDasharray="4 4" />
                    <Bar dataKey="avgWeeklyHours" radius={[0, 3, 3, 0]}>
                      {utilizationData.map(d => (
                        <Cell key={d.employeeId} fill={STATUS_COLORS[d.status]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          <Card className="card-elevated">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Utilization Detail</CardTitle>
              <p className="text-xs text-muted-foreground">
                Sorted by average weekly hours · Total = Client + Internal (vacation, holidays, meetings, etc. — counted in full, broken out for visibility)
                {utilizationData.length > 0 && ` · ${utilizationData[0].weeksCounted} week${utilizationData[0].weeksCounted !== 1 ? 's' : ''} in range`}
              </p>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="table-header">Person</TableHead>
                      <TableHead className="table-header text-right">Avg Hours/Week</TableHead>
                      <TableHead className="table-header text-right">Utilization</TableHead>
                      <TableHead className="table-header">Status</TableHead>
                      <TableHead className="table-header text-right">Client Hrs</TableHead>
                      <TableHead className="table-header text-right">Internal Hrs</TableHead>
                      <TableHead className="table-header text-right">Total Hours</TableHead>
                      <TableHead className="table-header text-right">Weeks Over {WEEKLY_CAPACITY_HOURS}h</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {utilizationData.map(d => (
                      <TableRow key={d.employeeId}>
                        <TableCell className="font-medium text-sm">{d.name}</TableCell>
                        <TableCell className="text-right text-sm tabular-nums">{d.avgWeeklyHours.toFixed(1)}h</TableCell>
                        <TableCell className="text-right text-sm tabular-nums">{d.utilizationPct.toFixed(0)}%</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs" style={{ color: STATUS_COLORS[d.status], borderColor: STATUS_COLORS[d.status] }}>
                            {STATUS_LABELS[d.status]}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right text-sm tabular-nums">{d.clientHours.toFixed(1)}h</TableCell>
                        <TableCell className="text-right text-sm tabular-nums">
                          {d.internalHours > 0 ? `${d.internalHours.toFixed(1)}h` : <span className="text-muted-foreground">—</span>}
                        </TableCell>
                        <TableCell className="text-right text-sm tabular-nums font-medium">{d.totalHours.toFixed(1)}h</TableCell>
                        <TableCell className="text-right text-sm tabular-nums">
                          {d.overloadedWeeks > 0 ? d.overloadedWeeks : <span className="text-muted-foreground">—</span>}
                        </TableCell>
                      </TableRow>
                    ))}
                    {utilizationData.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                          No data for the selected filters.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          {/* ── Forward projection from Staffing — weekly occupancy matrix ── */}
          {canManage && (
            <Card className="card-elevated">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <TrendingUp className="h-4 w-4" />Projected Occupancy — Next {PROJECTION_WEEKS} Weeks
                </CardTitle>
                <p className="text-xs text-muted-foreground">
                  From Staffing: each assignment's allocation % for the weeks it's active (per its project window) · Red &gt;100% · Amber &lt;{(UNDERLOADED_RATIO * 100).toFixed(0)}% · Green in between ·
                  Assignments without an allocation % set aren't counted.
                </p>
              </CardHeader>
              <CardContent>
                {projectedMatrixData.rows.length === 0 ? (
                  <p className="text-center text-muted-foreground py-6 text-sm">No staffing plan with an allocation % set.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="table-header sticky left-0 bg-background z-10 min-w-[160px] shadow-[1px_0_0_0_hsl(var(--border))]">
                            Person
                          </TableHead>
                          {projectedMatrixData.weeks.map(w => (
                            <TableHead key={w.key} className="table-header text-center whitespace-nowrap min-w-[90px]">
                              {w.label}
                            </TableHead>
                          ))}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {projectedMatrixData.rows.map(row => (
                          <TableRow key={row.employeeId}>
                            <TableCell className="font-medium text-sm sticky left-0 bg-background z-10 shadow-[1px_0_0_0_hsl(var(--border))]">
                              {row.name}
                            </TableCell>
                            {row.weekPct.map((pct, i) => (
                              <TableCell key={i} className={`text-center text-sm font-medium tabular-nums transition-colors ${occupancyCellClass(pct)}`}>
                                {pct > 0 ? `${pct.toFixed(0)}%` : ''}
                              </TableCell>
                            ))}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* ── Projected (Staffing) vs Actual (registered), by person ──────── */}
          {canManage && (
            <div className="space-y-4">
              <div>
                <h3 className="text-base font-semibold text-foreground">Projected vs Actual — by Person</h3>
                <p className="text-xs text-muted-foreground">
                  Projected: each person's Staffing allocation on that project, as hours/week. Actual: hours they registered on it in the selected filter range, averaged per week.
                </p>
              </div>
              {personProjectComparison.length === 0 ? (
                <Card className="card-elevated">
                  <CardContent className="py-10 text-center text-muted-foreground text-sm">
                    No one has an allocation % set in Staffing yet.
                  </CardContent>
                </Card>
              ) : (
                personProjectComparison.map(person => (
                  <Card key={person.userId} className="card-elevated">
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                      <CardTitle className="text-sm">{person.name}</CardTitle>
                      {person.overallPlanPct != null && (
                        <span
                          className="text-xs font-semibold px-2 py-0.5 rounded-full"
                          style={{
                            color: person.overallPlanPct > 120 || person.overallPlanPct < 80 ? STATUS_COLORS.overloaded : STATUS_COLORS.balanced,
                            backgroundColor: person.overallPlanPct > 120 || person.overallPlanPct < 80 ? '#FEE2E2' : '#D1FAE5',
                          }}
                        >
                          {person.overallPlanPct.toFixed(0)}% of plan overall
                        </span>
                      )}
                    </CardHeader>
                    <CardContent>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="table-header">Project</TableHead>
                            <TableHead className="table-header">Client</TableHead>
                            <TableHead className="table-header text-right">Allocation</TableHead>
                            <TableHead className="table-header text-right">Projected Hrs/Week</TableHead>
                            <TableHead className="table-header text-right">Actual Hrs/Week</TableHead>
                            <TableHead className="table-header text-right">% of Plan</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {person.rows.map(row => (
                            <TableRow key={row.projectId}>
                              <TableCell className="font-medium text-sm">{row.projectName}</TableCell>
                              <TableCell className="text-sm text-muted-foreground">{row.clientName}</TableCell>
                              <TableCell className="text-right text-sm tabular-nums">{row.allocationPct}%</TableCell>
                              <TableCell className="text-right text-sm tabular-nums">{row.projectedHoursPerWeek.toFixed(1)}h</TableCell>
                              <TableCell className="text-right text-sm tabular-nums">{row.actualHoursPerWeek.toFixed(1)}h</TableCell>
                              <TableCell className="text-right text-sm tabular-nums">
                                {row.planPct == null ? (
                                  <span className="text-muted-foreground">—</span>
                                ) : (
                                  <span
                                    className="font-medium"
                                    style={{ color: row.planPct > 120 || row.planPct < 80 ? STATUS_COLORS.overloaded : STATUS_COLORS.balanced }}
                                  >
                                    {row.planPct.toFixed(0)}%
                                  </span>
                                )}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
