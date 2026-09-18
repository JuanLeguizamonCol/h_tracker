import { useState, useMemo, useEffect, useRef, Fragment } from 'react';
import { format, startOfMonth, endOfMonth, startOfWeek, addWeeks, addMonths, addDays, differenceInCalendarDays } from 'date-fns';
import {
  CalendarIcon, Search, Loader2, Filter, X,
  Clock, TrendingUp, Activity, BarChart2,
  Download, Gauge, AlertTriangle, TrendingDown, CheckCircle2,
  ChevronRight, ChevronDown, ChevronLeft,
} from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import {
  ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  AreaChart, Area,
} from 'recharts';
import { useAuth } from '@/contexts/AuthContext';
import { useProjects } from '@/hooks/useProjects';
import { useClients } from '@/hooks/useClients';
import { useEmployees } from '@/hooks/useEmployees';
import { useAllTimeEntriesByDateRange, useTimeEntriesByDateRange } from '@/hooks/useTimeEntries';
import { useStaffing } from '@/hooks/useAssignedProjects';
import { useSkillSearch, useSkillCatalog } from '@/hooks/useSkills';
import { TimeEntry } from '@/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { MultiFilterSelect } from '@/components/MultiFilterSelect';
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

// Availability cell background for the "who can take a project" matrix —
// the lower the projected load, the more available (and the greener) that
// week is.
function availabilityCellClass(pct: number): string {
  if (pct <= 0) return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400';
  if (pct < 25) return 'bg-green-50 text-green-600 dark:bg-green-950/20 dark:text-green-400';
  return 'bg-amber-50 text-amber-700 dark:bg-amber-950/20 dark:text-amber-400';
}

// ─── Filter state ─────────────────────────────────────────────────────────────

type Filters = {
  startDate: Date;
  endDate: Date;
  employeeId: string[];
  projectId: string[];
  clientId: string[];
  location: string[];
  // Where the hours were actually worked (TimeEntry.location — e.g. a state
  // for a business trip), NOT the employee's home Employee.location above.
  workLocation: string[];
  ownerId: string[];
  managerId: string[];
  status: string;
  billing: string;
  search: string;
};

const INIT: Filters = {
  startDate: startOfMonth(new Date()),
  endDate: endOfMonth(new Date()),
  employeeId: [],
  projectId: [],
  clientId: [],
  location: [],
  workLocation: [],
  ownerId: [],
  managerId: [],
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

type TimeGroup = 'daily' | 'weekly';
type MatrixGranularity = 'month' | 'week' | 'day';

export default function Reports() {
  const { employee, canManage } = useAuth();
  const [f, setF] = useState<Filters>(INIT);
  const set = <K extends keyof Filters>(key: K, val: Filters[K]) =>
    setF(prev => ({ ...prev, [key]: val }));

  const [timeGroup, setTimeGroup] = useState<TimeGroup>('daily');
  const [matrixGranularity, setMatrixGranularity] = useState<MatrixGranularity>('week');
  const [projectMatrixGranularity, setProjectMatrixGranularity] = useState<MatrixGranularity>('week');
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

  // Where an entry's hours were actually worked (TimeEntry.location — set
  // when someone travels, e.g. a state for tax purposes). Falls back to the
  // employee's home location when the entry itself has no override.
  const workLocationOf = useMemo(
    () => (entry: TimeEntry) => entry.location?.trim() || locationKeyOf(entry.user_id),
    [locationKeyOf]
  );

  // ── Cascade: available options ────────────────────────────────────────────────
  const availableProjects = useMemo(() => {
    const ids = new Set(rawEntries
      .filter(e =>
        (f.clientId.length === 0 || f.clientId.includes(projectMap.get(e.project_id)?.client_id ?? '')) &&
        (f.employeeId.length === 0 || f.employeeId.includes(e.user_id)) &&
        (f.location.length === 0 || f.location.includes(locationKeyOf(e.user_id)))
      ).map(e => e.project_id));
    return projects.filter(p => ids.has(p.id));
  }, [rawEntries, projects, f.clientId, f.employeeId, f.location, projectMap, locationKeyOf]);

  const availableClients = useMemo(() => {
    const ids = new Set(rawEntries
      .filter(e =>
        (f.projectId.length === 0 || f.projectId.includes(e.project_id)) &&
        (f.employeeId.length === 0 || f.employeeId.includes(e.user_id)) &&
        (f.location.length === 0 || f.location.includes(locationKeyOf(e.user_id)))
      ).map(e => projectMap.get(e.project_id)?.client_id).filter((id): id is string => !!id));
    return clients.filter(c => ids.has(c.id));
  }, [rawEntries, clients, f.projectId, f.employeeId, f.location, projectMap, locationKeyOf]);

  const availableEmployees = useMemo(() => {
    const ids = new Set(rawEntries
      .filter(e =>
        (f.projectId.length === 0 || f.projectId.includes(e.project_id)) &&
        (f.clientId.length === 0 || f.clientId.includes(projectMap.get(e.project_id)?.client_id ?? '')) &&
        (f.location.length === 0 || f.location.includes(locationKeyOf(e.user_id)))
      ).map(e => e.user_id));
    return employees.filter(e => ids.has(e.id));
  }, [rawEntries, employees, f.projectId, f.clientId, f.location, projectMap, locationKeyOf]);

  // Distinct locations present in the currently-cascaded entries.
  const availableLocations = useMemo(() => {
    const keys = new Set<string>();
    rawEntries
      .filter(e =>
        (f.projectId.length === 0 || f.projectId.includes(e.project_id)) &&
        (f.clientId.length === 0 || f.clientId.includes(projectMap.get(e.project_id)?.client_id ?? '')) &&
        (f.employeeId.length === 0 || f.employeeId.includes(e.user_id))
      )
      .forEach(e => keys.add(locationKeyOf(e.user_id)));
    return [...keys]
      .sort((a, b) => (a === NO_LOCATION ? 1 : b === NO_LOCATION ? -1 : a.localeCompare(b)))
      .map(k => ({ value: k, label: k === NO_LOCATION ? NO_LOCATION_LABEL : k }));
  }, [rawEntries, f.projectId, f.clientId, f.employeeId, projectMap, locationKeyOf]);

  // Distinct work locations (TimeEntry.location, falling back to the
  // employee's home location) present in the current entries — separate
  // from the Location filter above, which is employee-based only.
  const availableWorkLocations = useMemo(() => {
    const keys = new Set<string>();
    rawEntries.forEach(e => keys.add(workLocationOf(e)));
    return [...keys]
      .sort((a, b) => (a === NO_LOCATION ? 1 : b === NO_LOCATION ? -1 : a.localeCompare(b)))
      .map(k => ({ value: k, label: k === NO_LOCATION ? NO_LOCATION_LABEL : k }));
  }, [rawEntries, workLocationOf]);

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


  const clearAll = () => setF(prev => ({ ...prev, employeeId: [], projectId: [], clientId: [], location: [], workLocation: [], ownerId: [], managerId: [], status: 'all', billing: 'all', search: '' }));

  // ── Excel export (server-generated, honours the current filters) ───────────────
  const handleExportExcel = async () => {
    setIsExporting(true);
    try {
      const params = new URLSearchParams();
      params.set('date_gte', format(f.startDate, 'yyyy-MM-dd'));
      params.set('date_lte', format(f.endDate, 'yyyy-MM-dd'));
      f.employeeId.forEach(v => params.append('user_id', v));
      f.projectId.forEach(v => params.append('project_id', v));
      f.clientId.forEach(v => params.append('client_id', v));
      f.location.forEach(v => params.append('location', v));
      f.workLocation.forEach(v => params.append('work_location', v));
      f.ownerId.forEach(v => params.append('owner_id', v));
      f.managerId.forEach(v => params.append('manager_id', v));
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
  const hasActiveFilters = f.employeeId.length > 0 || f.projectId.length > 0 || f.clientId.length > 0 || f.location.length > 0 || f.workLocation.length > 0 || f.ownerId.length > 0 || f.managerId.length > 0 || f.status !== 'all' || f.billing !== 'all' || !!f.search;

  // ── Filtered entries (single source of truth) ─────────────────────────────────
  const filteredEntries = useMemo(() => rawEntries.filter(e => {
    if (f.employeeId.length > 0 && !f.employeeId.includes(e.user_id)) return false;
    if (f.projectId.length > 0 && !f.projectId.includes(e.project_id)) return false;
    if (f.clientId.length > 0 && !f.clientId.includes(projectMap.get(e.project_id)?.client_id ?? '')) return false;
    if (f.location.length > 0 && !f.location.includes(locationKeyOf(e.user_id))) return false;
    if (f.workLocation.length > 0 && !f.workLocation.includes(workLocationOf(e))) return false;
    if (f.ownerId.length > 0 && !f.ownerId.includes(projectMap.get(e.project_id)?.owner_id ?? '')) return false;
    if (f.managerId.length > 0 && !f.managerId.includes(projectMap.get(e.project_id)?.manager_id ?? '')) return false;
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

  // ── Weekly Hours Matrix data ──────────────────────────────────────────────────
  // Each employee row also carries a project-level breakdown (same week
  // buckets) so the row can be expanded into a drill-down of which projects
  // made up those hours, without a second data pass on expand.
  const weeklyMatrixData = useMemo(() => {
    // Generate all week start dates (Monday-aligned) covering the selected range.
    // Labeling/month-grouping is keyed off each week's THURSDAY, not its Monday:
    // a week that spans a month boundary (e.g. Mon Aug 31 → Sun Sep 6) has most
    // of its days (6 of 7) in the following month, so filing it under the
    // Monday's month used to both mislabel it ("Aug-Week5") and fold nearly a
    // full week of the next month's hours into the wrong month's subtotal,
    // while that next month's own first week looked short by the same amount.
    // Thursday is always the week's 4th (median) day, so it's guaranteed to
    // fall in whichever month actually holds the majority of the week.
    const weeks: { key: string; label: string; start: Date }[] = [];
    let current = startOfWeek(f.startDate, { weekStartsOn: 1 });
    while (current <= f.endDate) {
      const anchor = addDays(current, 3);
      const weekN = Math.ceil(anchor.getDate() / 7);
      weeks.push({
        key: format(current, 'yyyy-MM-dd'),
        label: `${format(anchor, 'MMM')}-Week${weekN}`,
        start: current,
      });
      current = addWeeks(current, 1);
    }
    const weekIndex = new Map(weeks.map((w, i) => [w.key, i]));

    // Group weeks into their calendar month — by the same Thursday anchor as
    // the label above, so a boundary week's subtotal lands in the month that
    // actually holds most of its days. Each group becomes one "full month"
    // subtotal column after that month's weekly columns.
    const monthGroups: { key: string; label: string; weekIndices: number[] }[] = [];
    weeks.forEach((w, i) => {
      const anchor = addDays(w.start, 3);
      const monthKey = format(anchor, 'yyyy-MM');
      let group = monthGroups.find(g => g.key === monthKey);
      if (!group) {
        group = { key: monthKey, label: format(anchor, 'MMM yyyy'), weekIndices: [] };
        monthGroups.push(group);
      }
      group.weekIndices.push(i);
    });

    // Build userId → weekKey → hours map, and userId → projectId → weekKey → hours
    const hoursMap: Record<string, Record<string, number>> = {};
    const projectHoursMap: Record<string, Record<string, Record<string, number>>> = {};
    filteredEntries.forEach(e => {
      // Local parse so a Sun/Mon boundary entry isn't shifted into the wrong week.
      const weekStart = startOfWeek(parseLocalDate(e.date), { weekStartsOn: 1 });
      const weekKey = format(weekStart, 'yyyy-MM-dd');
      if (!hoursMap[e.user_id]) hoursMap[e.user_id] = {};
      hoursMap[e.user_id][weekKey] = (hoursMap[e.user_id][weekKey] ?? 0) + Number(e.hours);

      if (!projectHoursMap[e.user_id]) projectHoursMap[e.user_id] = {};
      if (!projectHoursMap[e.user_id][e.project_id]) projectHoursMap[e.user_id][e.project_id] = {};
      const perProject = projectHoursMap[e.user_id][e.project_id];
      perProject[weekKey] = (perProject[weekKey] ?? 0) + Number(e.hours);
    });

    // Sum a row's week-hours into one total per month group, in group order.
    const monthTotalsFor = (weekHours: number[]) =>
      monthGroups.map(g => g.weekIndices.reduce((sum, i) => sum + weekHours[i], 0));

    // Rows sorted by employee name
    const employeeIds = [...new Set(filteredEntries.map(e => e.user_id))];
    const rows = employeeIds
      .map(uid => {
        const projectEntries = Object.entries(projectHoursMap[uid] ?? {});
        const projects = projectEntries
          .map(([projectId, byWeek]) => {
            const weekHours = weeks.map(w => byWeek[w.key] ?? 0);
            return {
              projectId,
              name: projectMap.get(projectId)?.name ?? 'Deleted Project',
              weekHours,
              monthTotals: monthTotalsFor(weekHours),
              total: weekHours.reduce((s, h) => s + h, 0),
            };
          })
          .sort((a, b) => b.total - a.total);
        const weekHours = weeks.map(w => hoursMap[uid]?.[w.key] ?? 0);
        return {
          employeeId: uid,
          name: employeeMap.get(uid)?.name ?? 'Deleted Employee',
          weekHours,
          monthTotals: monthTotalsFor(weekHours),
          total: weekHours.reduce((s, h) => s + h, 0),
          projects,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));

    // Totals per week column, per month column, and the grand total.
    const totals = weeks.map((_, i) => rows.reduce((sum, r) => sum + r.weekHours[i], 0));
    const monthTotals = monthTotalsFor(totals);
    const grandTotal = totals.reduce((sum, t) => sum + t, 0);

    // Highest single cell across the whole matrix (employee rows) — used as
    // the reference for the heatmap gradient so shading is comparable across
    // every row and its drill-down. Month/grand totals aren't heat-shaded
    // (they're aggregates, not directly comparable to a single week), so
    // they don't factor into this.
    const maxCellHours = Math.max(1, ...rows.map(r => Math.max(0, ...r.weekHours)));

    return { weeks, weekIndex, monthGroups, rows, totals, monthTotals, grandTotal, maxCellHours };
  }, [filteredEntries, f.startDate, f.endDate, employeeMap, projectMap]);

  // ── Weekly Hours Matrix DISPLAY — Month/Week/Day toggle ─────────────────────────
  // Deliberately separate from weeklyMatrixData above, which the Utilization
  // Report depends on and must stay strictly week-granular ("avg weekly hours",
  // "weeks over 40h" are inherently per-week numbers — they can't shift meaning
  // just because this table's own view changed). Always built from individual
  // days first, so week/month totals can never drift from what was actually
  // logged on a given date regardless of which granularity is selected.
  const hoursMatrix = useMemo(() => {
    const dayHoursMap: Record<string, Record<string, number>> = {};
    const dayProjectHoursMap: Record<string, Record<string, Record<string, number>>> = {};
    filteredEntries.forEach(e => {
      if (!dayHoursMap[e.user_id]) dayHoursMap[e.user_id] = {};
      dayHoursMap[e.user_id][e.date] = (dayHoursMap[e.user_id][e.date] ?? 0) + Number(e.hours);
      if (!dayProjectHoursMap[e.user_id]) dayProjectHoursMap[e.user_id] = {};
      if (!dayProjectHoursMap[e.user_id][e.project_id]) dayProjectHoursMap[e.user_id][e.project_id] = {};
      const perProject = dayProjectHoursMap[e.user_id][e.project_id];
      perProject[e.date] = (perProject[e.date] ?? 0) + Number(e.hours);
    });

    // Calendar months spanning the selected range — same regardless of
    // granularity, so "Month Total" always means the same thing.
    const monthGroups: { key: string; label: string; weekIndices: number[] }[] = [];
    {
      let cursor = startOfMonth(f.startDate);
      const lastMonth = startOfMonth(f.endDate);
      while (cursor <= lastMonth) {
        monthGroups.push({ key: format(cursor, 'yyyy-MM'), label: format(cursor, 'MMM yyyy'), weekIndices: [] });
        cursor = addMonths(cursor, 1);
      }
    }
    const monthGroupByKey = new Map(monthGroups.map(g => [g.key, g]));

    // Leaf columns: one per week, one per day that actually has hours logged
    // (skips empty days so a wide range doesn't add ~90 blank columns), or
    // none at all when grouped by month — each month group then shows only
    // its total.
    const columns: { key: string; label: string; start: Date }[] = [];
    if (matrixGranularity === 'week') {
      let current = startOfWeek(f.startDate, { weekStartsOn: 1 });
      while (current <= f.endDate) {
        const anchor = addDays(current, 3);
        const weekN = Math.ceil(anchor.getDate() / 7);
        const idx = columns.length;
        columns.push({ key: format(current, 'yyyy-MM-dd'), label: `${format(anchor, 'MMM')}-Week${weekN}`, start: current });
        monthGroupByKey.get(format(anchor, 'yyyy-MM'))?.weekIndices.push(idx);
        current = addWeeks(current, 1);
      }
    } else if (matrixGranularity === 'day') {
      const datesWithHours = [...new Set(filteredEntries.map(e => e.date))].sort();
      datesWithHours.forEach(dateStr => {
        const d = parseLocalDate(dateStr);
        const idx = columns.length;
        columns.push({ key: dateStr, label: format(d, 'MMM d'), start: d });
        monthGroupByKey.get(format(d, 'yyyy-MM'))?.weekIndices.push(idx);
      });
    }

    // Sums a row's day-level hours into each leaf column's window — a single
    // day for day granularity, the Mon-Sun span for week granularity.
    function columnHoursFor(dayMap: Record<string, number> | undefined): number[] {
      if (!dayMap) return columns.map(() => 0);
      if (matrixGranularity === 'day') return columns.map(c => dayMap[c.key] ?? 0);
      return columns.map(c => {
        let sum = 0;
        for (let i = 0; i < 7; i++) sum += dayMap[format(addDays(c.start, i), 'yyyy-MM-dd')] ?? 0;
        return sum;
      });
    }

    // Sums a row's hours into one total per month group. In week/day mode this
    // MUST sum the same leaf columns shown under that month's header (not an
    // independent day-exact recomputation) — otherwise a month's "Month Total"
    // cell could disagree with what its own visible columns add up to (e.g. a
    // week filed under September per its majority of days would still leak an
    // August day's hours into August's total, even though that week's column
    // itself is shown entirely under September). Month view has no leaf
    // columns to sum, so it falls back to the exact per-day totals directly.
    function monthTotalsFor(columnHours: number[], dayMap: Record<string, number> | undefined): number[] {
      if (matrixGranularity === 'month') {
        if (!dayMap) return monthGroups.map(() => 0);
        const byMonth: Record<string, number> = {};
        Object.entries(dayMap).forEach(([dateStr, hours]) => {
          const mk = dateStr.slice(0, 7);
          byMonth[mk] = (byMonth[mk] ?? 0) + hours;
        });
        return monthGroups.map(g => byMonth[g.key] ?? 0);
      }
      return monthGroups.map(g => g.weekIndices.reduce((sum, i) => sum + columnHours[i], 0));
    }

    const employeeIds = [...new Set(filteredEntries.map(e => e.user_id))];
    const rows = employeeIds
      .map(uid => {
        const dayMap = dayHoursMap[uid];
        const projects = Object.entries(dayProjectHoursMap[uid] ?? {})
          .map(([projectId, byDay]) => {
            const weekHours = columnHoursFor(byDay);
            return {
              projectId,
              name: projectMap.get(projectId)?.name ?? 'Deleted Project',
              weekHours,
              monthTotals: monthTotalsFor(weekHours, byDay),
              total: Object.values(byDay).reduce((s, h) => s + h, 0),
            };
          })
          .sort((a, b) => b.total - a.total);
        const weekHours = columnHoursFor(dayMap);
        return {
          employeeId: uid,
          name: employeeMap.get(uid)?.name ?? 'Deleted Employee',
          weekHours,
          monthTotals: monthTotalsFor(weekHours, dayMap),
          total: Object.values(dayMap ?? {}).reduce((s, h) => s + h, 0),
          projects,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));

    const totals = columns.map((_, i) => rows.reduce((sum, r) => sum + r.weekHours[i], 0));
    const monthTotals = monthGroups.map((_, gi) => rows.reduce((sum, r) => sum + r.monthTotals[gi], 0));
    const grandTotal = rows.reduce((sum, r) => sum + r.total, 0);
    const maxCellHours = Math.max(1, ...rows.map(r => Math.max(0, ...r.weekHours)));

    return { columns, monthGroups, rows, totals, monthTotals, grandTotal, maxCellHours };
  }, [filteredEntries, f.startDate, f.endDate, employeeMap, projectMap, matrixGranularity]);

  // ── Project Hours Matrix data ───────────────────────────────────────────────
  // Same shape and month/week/day granularity as the employee matrix above,
  // just rooted at project instead of employee — rows are projects, and each
  // one expands into which employees logged those hours.
  const projectHoursMatrix = useMemo(() => {
    const dayHoursMap: Record<string, Record<string, number>> = {};
    const dayEmployeeHoursMap: Record<string, Record<string, Record<string, number>>> = {};
    filteredEntries.forEach(e => {
      if (!dayHoursMap[e.project_id]) dayHoursMap[e.project_id] = {};
      dayHoursMap[e.project_id][e.date] = (dayHoursMap[e.project_id][e.date] ?? 0) + Number(e.hours);
      if (!dayEmployeeHoursMap[e.project_id]) dayEmployeeHoursMap[e.project_id] = {};
      if (!dayEmployeeHoursMap[e.project_id][e.user_id]) dayEmployeeHoursMap[e.project_id][e.user_id] = {};
      const perEmployee = dayEmployeeHoursMap[e.project_id][e.user_id];
      perEmployee[e.date] = (perEmployee[e.date] ?? 0) + Number(e.hours);
    });

    const monthGroups: { key: string; label: string; weekIndices: number[] }[] = [];
    {
      let cursor = startOfMonth(f.startDate);
      const lastMonth = startOfMonth(f.endDate);
      while (cursor <= lastMonth) {
        monthGroups.push({ key: format(cursor, 'yyyy-MM'), label: format(cursor, 'MMM yyyy'), weekIndices: [] });
        cursor = addMonths(cursor, 1);
      }
    }
    const monthGroupByKey = new Map(monthGroups.map(g => [g.key, g]));

    const columns: { key: string; label: string; start: Date }[] = [];
    if (projectMatrixGranularity === 'week') {
      let current = startOfWeek(f.startDate, { weekStartsOn: 1 });
      while (current <= f.endDate) {
        const anchor = addDays(current, 3);
        const weekN = Math.ceil(anchor.getDate() / 7);
        const idx = columns.length;
        columns.push({ key: format(current, 'yyyy-MM-dd'), label: `${format(anchor, 'MMM')}-Week${weekN}`, start: current });
        monthGroupByKey.get(format(anchor, 'yyyy-MM'))?.weekIndices.push(idx);
        current = addWeeks(current, 1);
      }
    } else if (projectMatrixGranularity === 'day') {
      const datesWithHours = [...new Set(filteredEntries.map(e => e.date))].sort();
      datesWithHours.forEach(dateStr => {
        const d = parseLocalDate(dateStr);
        const idx = columns.length;
        columns.push({ key: dateStr, label: format(d, 'MMM d'), start: d });
        monthGroupByKey.get(format(d, 'yyyy-MM'))?.weekIndices.push(idx);
      });
    }

    function columnHoursFor(dayMap: Record<string, number> | undefined): number[] {
      if (!dayMap) return columns.map(() => 0);
      if (projectMatrixGranularity === 'day') return columns.map(c => dayMap[c.key] ?? 0);
      return columns.map(c => {
        let sum = 0;
        for (let i = 0; i < 7; i++) sum += dayMap[format(addDays(c.start, i), 'yyyy-MM-dd')] ?? 0;
        return sum;
      });
    }

    function monthTotalsFor(columnHours: number[], dayMap: Record<string, number> | undefined): number[] {
      if (projectMatrixGranularity === 'month') {
        if (!dayMap) return monthGroups.map(() => 0);
        const byMonth: Record<string, number> = {};
        Object.entries(dayMap).forEach(([dateStr, hours]) => {
          const mk = dateStr.slice(0, 7);
          byMonth[mk] = (byMonth[mk] ?? 0) + hours;
        });
        return monthGroups.map(g => byMonth[g.key] ?? 0);
      }
      return monthGroups.map(g => g.weekIndices.reduce((sum, i) => sum + columnHours[i], 0));
    }

    const projectIds = [...new Set(filteredEntries.map(e => e.project_id))];
    const rows = projectIds
      .map(pid => {
        const dayMap = dayHoursMap[pid];
        const proj = projectMap.get(pid);
        const cli = proj ? clientMap.get(proj.client_id) : null;
        const employeesBreakdown = Object.entries(dayEmployeeHoursMap[pid] ?? {})
          .map(([userId, byDay]) => {
            const weekHours = columnHoursFor(byDay);
            return {
              employeeId: userId,
              name: employeeMap.get(userId)?.name ?? 'Deleted Employee',
              weekHours,
              monthTotals: monthTotalsFor(weekHours, byDay),
              total: Object.values(byDay).reduce((s, h) => s + h, 0),
            };
          })
          .sort((a, b) => b.total - a.total);
        const weekHours = columnHoursFor(dayMap);
        return {
          projectId: pid,
          name: proj?.name ?? 'Deleted Project',
          clientName: cli?.name ?? '',
          weekHours,
          monthTotals: monthTotalsFor(weekHours, dayMap),
          total: Object.values(dayMap ?? {}).reduce((s, h) => s + h, 0),
          employees: employeesBreakdown,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));

    const totals = columns.map((_, i) => rows.reduce((sum, r) => sum + r.weekHours[i], 0));
    const monthTotals = monthGroups.map((_, gi) => rows.reduce((sum, r) => sum + r.monthTotals[gi], 0));
    const grandTotal = rows.reduce((sum, r) => sum + r.total, 0);
    const maxCellHours = Math.max(1, ...rows.map(r => Math.max(0, ...r.weekHours)));

    return { columns, monthGroups, rows, totals, monthTotals, grandTotal, maxCellHours };
  }, [filteredEntries, f.startDate, f.endDate, employeeMap, projectMap, clientMap, projectMatrixGranularity]);

  // Weekly Hours Matrix can end up with far more week columns than fit on
  // screen (a wide date range = many months of weekly columns) — the table
  // itself scrolls (overflow-x-auto below), but that's only discoverable via
  // a thin native scrollbar or a trackpad gesture. These buttons make that
  // horizontal navigation explicit, one "page" (80% of the visible width) at
  // a time, and disable themselves once there's nothing further to scroll to.
  const matrixScrollRef = useRef<HTMLDivElement>(null);
  const [matrixCanScroll, setMatrixCanScroll] = useState({ left: false, right: false });

  useEffect(() => {
    const el = matrixScrollRef.current;
    if (!el) return;
    const update = () => setMatrixCanScroll({
      left: el.scrollLeft > 4,
      right: el.scrollLeft < el.scrollWidth - el.clientWidth - 4,
    });
    update();
    el.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => {
      el.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, [hoursMatrix]);

  function scrollMatrix(direction: 'left' | 'right') {
    const el = matrixScrollRef.current;
    if (!el) return;
    const amount = Math.round(el.clientWidth * 0.8) * (direction === 'left' ? -1 : 1);
    el.scrollBy({ left: amount, behavior: 'smooth' });
  }

  const [expandedMatrixRows, setExpandedMatrixRows] = useState<Set<string>>(new Set());
  const toggleMatrixRow = (employeeId: string) => {
    setExpandedMatrixRows(prev => {
      const next = new Set(prev);
      if (next.has(employeeId)) next.delete(employeeId); else next.add(employeeId);
      return next;
    });
  };

  // Blue heatmap gradient — intensity relative to the matrix's own max cell,
  // so it reads correctly whether the busiest week was 20h or 60h. Text
  // flips to white once the fill gets dark enough to need it.
  const heatCellStyle = (hours: number, max: number): { backgroundColor?: string; color?: string } => {
    if (hours <= 0) return {};
    const intensity = Math.min(hours / max, 1);
    const alpha = 0.10 + intensity * 0.75;
    return {
      backgroundColor: `rgba(37, 99, 235, ${alpha.toFixed(2)})`,
      color: alpha > 0.5 ? '#fff' : undefined,
    };
  };

  const projectMatrixScrollRef = useRef<HTMLDivElement>(null);
  const [projectMatrixCanScroll, setProjectMatrixCanScroll] = useState({ left: false, right: false });

  useEffect(() => {
    const el = projectMatrixScrollRef.current;
    if (!el) return;
    const update = () => setProjectMatrixCanScroll({
      left: el.scrollLeft > 4,
      right: el.scrollLeft < el.scrollWidth - el.clientWidth - 4,
    });
    update();
    el.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => {
      el.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, [projectHoursMatrix]);

  function scrollProjectMatrix(direction: 'left' | 'right') {
    const el = projectMatrixScrollRef.current;
    if (!el) return;
    const amount = Math.round(el.clientWidth * 0.8) * (direction === 'left' ? -1 : 1);
    el.scrollBy({ left: amount, behavior: 'smooth' });
  }

  const [expandedProjectMatrixRows, setExpandedProjectMatrixRows] = useState<Set<string>>(new Set());
  const toggleProjectMatrixRow = (projectId: string) => {
    setExpandedProjectMatrixRows(prev => {
      const next = new Set(prev);
      if (next.has(projectId)) next.delete(projectId); else next.add(projectId);
      return next;
    });
  };

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

  // Averaging denominator: the EXACT selected date range (days ÷ 7), not the
  // count of Monday-aligned week buckets in weeklyMatrixData — those pad out
  // to full calendar weeks (e.g. a range starting mid-week still gets a whole
  // week bucket from that Monday), which inflates the week count and drags
  // the average down below what the person actually logged for the range
  // picked in the filters.
  const weeksInSelectedRange = useMemo(
    () => Math.max(differenceInCalendarDays(f.endDate, f.startDate) + 1, 1) / 7,
    [f.startDate, f.endDate]
  );

  const utilizationData = useMemo(() => {
    return weeklyMatrixData.rows
      .map(row => {
        const weeksCounted = weeksInSelectedRange;
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
  }, [weeklyMatrixData, internalHoursByEmployee, weeksInSelectedRange]);

  const utilizationSummary = useMemo(() => {
    const overloaded = utilizationData.filter(d => d.status === 'overloaded').length;
    const underloaded = utilizationData.filter(d => d.status === 'underloaded').length;
    const balanced = utilizationData.length - overloaded - underloaded;
    const avgUtilizationPct = utilizationData.length
      ? utilizationData.reduce((sum, d) => sum + d.utilizationPct, 0) / utilizationData.length
      : 0;
    return { overloaded, underloaded, balanced, avgUtilizationPct, total: utilizationData.length };
  }, [utilizationData]);

  // ── Staffing rows scoped to the Filters card ────────────────────────────────
  // The two Staffing-based sections below (projected occupancy, projected vs
  // actual) used to read `staffing` directly — the org-wide plan, completely
  // unfiltered — so picking a Project/Employee/Client/Owner/Manager/Location in
  // the Filters card never changed what showed up there, even though every
  // other section on this page (KPIs, charts, both matrices) reacted correctly.
  // Applying the same identity filters here (not status/billing/search, which
  // are about logged time entries and don't describe a staffing plan row) makes
  // the two tabs consistent with each other.
  const filteredStaffing = useMemo(() => staffing.filter(a => {
    if (f.employeeId.length > 0 && !f.employeeId.includes(a.user_id)) return false;
    if (f.projectId.length > 0 && !f.projectId.includes(a.project_id)) return false;
    if (f.clientId.length > 0 && !f.clientId.includes(a.client_id)) return false;
    if (f.location.length > 0 && !f.location.includes(locationKeyOf(a.user_id))) return false;
    if (f.ownerId.length > 0 && !f.ownerId.includes(projectMap.get(a.project_id)?.owner_id ?? '')) return false;
    if (f.managerId.length > 0 && !f.managerId.includes(projectMap.get(a.project_id)?.manager_id ?? '')) return false;
    return true;
  }), [staffing, f.employeeId, f.projectId, f.clientId, f.location, f.ownerId, f.managerId, projectMap, locationKeyOf]);

  // ── Utilization report: forward projection from Staffing ───────────────────────
  // Turns each assignment's allocation % (set in the Staffing panel) into implied
  // occupancy for the weeks ahead where the assignment is still active (within
  // the assignment's own window if one was set, else the project's start/end
  // window). Only counts assignments that actually have an allocation % set —
  // an assignment with none doesn't contribute a committed load. Rendered as a
  // week-by-week matrix, same shape as the actual Weekly Hours Matrix above.
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
    if (!canManage || filteredStaffing.length === 0) return { weeks: projectedWeeks, rows: [] as { employeeId: string; name: string; weekPct: number[] }[] };
    const byPerson = new Map<string, { userId: string; name: string; weekHours: number[] }>();

    projectedWeeks.forEach((week, weekIdx) => {
      filteredStaffing.forEach(a => {
        if (a.allocation_percentage == null || a.allocation_percentage <= 0) return;
        // The assignment's own window takes precedence when set (e.g. "staffed
        // on this project for Q1 only"); otherwise fall back to the project's
        // own dates.
        const startStr = a.start_date ?? a.project_start_date;
        const endStr = a.end_date ?? a.project_end_date;
        const start = startStr ? parseLocalDate(startStr) : null;
        const end = endStr ? parseLocalDate(endStr) : null;
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
  }, [filteredStaffing, projectedWeeks, canManage]);

  // ── Utilization report: who's available for new work ───────────────────────
  // Unlike the matrix above (which only lists people who HAVE an active
  // allocation), this scans every active employee — someone with no Staffing
  // row at all is 0% loaded and exactly the kind of "can take a project"
  // person this is meant to surface. Uses the full, unfiltered `staffing`
  // (not `filteredStaffing`) for the load computation itself — a person's
  // TRUE total commitment across all their projects, so picking a Project
  // filter in the Filters card can't make someone look free just because
  // their other project got filtered out of view. The Employee/Location
  // filters still narrow WHICH people are considered, since those describe
  // the person being looked for, not a project-side attribute.
  const LOW_LOAD_WEEKS = 5;
  const LOW_LOAD_THRESHOLD_PCT = 50;

  const availableCapacityForecast = useMemo(() => {
    const weeks = projectedWeeks.slice(0, LOW_LOAD_WEEKS);
    if (!canManage) return { weeks, rows: [] as { employeeId: string; name: string; weekPct: number[]; avgPct: number }[] };

    const assignmentsByEmployee = new Map<string, typeof staffing>();
    staffing.forEach(a => {
      if (a.allocation_percentage == null || a.allocation_percentage <= 0) return;
      if (!assignmentsByEmployee.has(a.user_id)) assignmentsByEmployee.set(a.user_id, []);
      assignmentsByEmployee.get(a.user_id)!.push(a);
    });

    const pool = employees.filter(e =>
      e.is_active &&
      (f.employeeId.length === 0 || f.employeeId.includes(e.id)) &&
      (f.location.length === 0 || f.location.includes(locationKeyOf(e.id)))
    );

    const rows = pool
      .map(emp => {
        const assignments = assignmentsByEmployee.get(emp.id) ?? [];
        const weekPct = weeks.map(week => {
          const hours = assignments.reduce((sum, a) => {
            const startStr = a.start_date ?? a.project_start_date;
            const endStr = a.end_date ?? a.project_end_date;
            const start = startStr ? parseLocalDate(startStr) : null;
            const end = endStr ? parseLocalDate(endStr) : null;
            const activeThisWeek = (!start || start <= week.end) && (!end || end >= week.start);
            return activeThisWeek ? sum + (a.allocation_percentage! / 100) * WEEKLY_CAPACITY_HOURS : sum;
          }, 0);
          return (hours / WEEKLY_CAPACITY_HOURS) * 100;
        });
        const avgPct = weekPct.reduce((s, p) => s + p, 0) / weekPct.length;
        return { employeeId: emp.id, name: emp.name, weekPct, avgPct };
      })
      .filter(r => r.avgPct < LOW_LOAD_THRESHOLD_PCT)
      .sort((a, b) => a.avgPct - b.avgPct);

    return { weeks, rows };
  }, [employees, staffing, projectedWeeks, canManage, f.employeeId, f.location, locationKeyOf]);

  // ── Utilization report: projected (Staffing) vs actual (registered), per person ──
  // "Projected" = what Staffing currently plans for that person on that project
  // (their allocation % → implied hrs/week), regardless of the date filter.
  // "Actual" = hours THEY logged on THAT project within the selected filter
  // range, averaged per week. Grouped by person (their projects underneath),
  // not by project — that grouping was confusing since it mixed everyone's
  // hours into one project total.
  const personProjectComparison = useMemo(() => {
    if (!canManage) return [];

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

    filteredStaffing.forEach(a => {
      if (a.allocation_percentage == null || a.allocation_percentage <= 0) return;
      const key = `${a.user_id}|${a.project_id}`;
      const actualHoursPerWeek = (actualByPersonProject.get(key) ?? 0) / weeksInSelectedRange;
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
  }, [filteredStaffing, filteredEntries, weeksInSelectedRange, canManage]);

  // ── Filter chips ──────────────────────────────────────────────────────────────
  const chips = useMemo(() => {
    const c: { key: string; label: string; onClear: () => void }[] = [];
    const namesFor = (ids: string[], labelOf: (id: string) => string) => ids.map(labelOf).join(', ');
    if (f.employeeId.length > 0) c.push({ key: 'emp',  label: `Employee: ${namesFor(f.employeeId, id => employeeMap.get(id)?.name ?? id)}`, onClear: () => set('employeeId', []) });
    if (f.projectId.length > 0)  c.push({ key: 'proj', label: `Project: ${namesFor(f.projectId, id => projectMap.get(id)?.name ?? id)}`,    onClear: () => set('projectId', []) });
    if (f.clientId.length > 0)   c.push({ key: 'cli',  label: `Client: ${namesFor(f.clientId, id => clientMap.get(id)?.name ?? id)}`,        onClear: () => set('clientId', []) });
    if (f.location.length > 0)   c.push({ key: 'loc',  label: `Location: ${namesFor(f.location, l => l === NO_LOCATION ? NO_LOCATION_LABEL : l)}`, onClear: () => set('location', []) });
    if (f.workLocation.length > 0) c.push({ key: 'wloc', label: `Work Location: ${namesFor(f.workLocation, l => l === NO_LOCATION ? NO_LOCATION_LABEL : l)}`, onClear: () => set('workLocation', []) });
    if (f.ownerId.length > 0)    c.push({ key: 'own',  label: `Owner: ${namesFor(f.ownerId, id => availableOwners.find(o => o.value === id)?.label ?? id)}`, onClear: () => set('ownerId', []) });
    if (f.managerId.length > 0)  c.push({ key: 'mgr',  label: `Manager: ${namesFor(f.managerId, id => availableManagers.find(m => m.value === id)?.label ?? id)}`, onClear: () => set('managerId', []) });
    if (f.status !== 'all')     c.push({ key: 'st',   label: `Status: ${f.status === 'on_hold' ? 'On Hold' : 'Normal'}`,        onClear: () => set('status', 'all') });
    if (f.billing !== 'all')    c.push({ key: 'bi',   label: f.billing === 'billable' ? 'Billable only' : 'Non-billable only',   onClear: () => set('billing', 'all') });
    if (f.search)               c.push({ key: 'q',    label: `"${f.search}"`,                                                   onClear: () => set('search', '') });
    return c;
  }, [f, employeeMap, projectMap, clientMap, availableOwners, availableManagers]);

  if (isLoading) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

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
            <MultiFilterSelect label="Client" selected={f.clientId} allLabel="All Clients"
              options={availableClients.map(c => ({ value: c.id, label: c.name }))}
              onChange={v => set('clientId', v)} onClear={() => set('clientId', [])} />
            <MultiFilterSelect label="Project" selected={f.projectId} allLabel="All Projects"
              options={availableProjects.map(p => ({ value: p.id, label: p.name }))}
              onChange={v => set('projectId', v)} onClear={() => set('projectId', [])} />
            {canManage && (
              <MultiFilterSelect label="Employee" selected={f.employeeId} allLabel="All Employees"
                options={availableEmployees.map(e => ({ value: e.id, label: e.name }))}
                onChange={v => set('employeeId', v)} onClear={() => set('employeeId', [])} />
            )}
            {canManage && (
              <MultiFilterSelect label="Location" selected={f.location} allLabel="All Locations"
                options={availableLocations}
                onChange={v => set('location', v)} onClear={() => set('location', [])} />
            )}
            <MultiFilterSelect label="Work Location" selected={f.workLocation} allLabel="All Work Locations"
              options={availableWorkLocations}
              onChange={v => set('workLocation', v)} onClear={() => set('workLocation', [])} />
            {canManage && (
              <MultiFilterSelect label="Owner" selected={f.ownerId} allLabel="All Owners"
                options={availableOwners}
                onChange={v => set('ownerId', v)} onClear={() => set('ownerId', [])} />
            )}
            {canManage && (
              <MultiFilterSelect label="Project Manager" selected={f.managerId} allLabel="All Managers"
                options={availableManagers}
                onChange={v => set('managerId', v)} onClear={() => set('managerId', [])} />
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
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <CardTitle className="text-base">Weekly Hours Matrix</CardTitle>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex rounded-md border overflow-hidden text-xs">
                {(['month', 'week', 'day'] as MatrixGranularity[]).map(g => (
                  <button
                    key={g}
                    onClick={() => setMatrixGranularity(g)}
                    className={`px-3 py-1.5 capitalize transition-colors ${matrixGranularity === g ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}
                  >
                    {g}
                  </button>
                ))}
              </div>
              {hoursMatrix.rows.length > 0 && (
                <div className="flex items-center gap-1 shrink-0">
                  <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => scrollMatrix('left')} disabled={!matrixCanScroll.left} title="Scroll left">
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => scrollMatrix('right')} disabled={!matrixCanScroll.right} title="Scroll right">
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            {matrixGranularity === 'month'
              ? 'Hours per employee per month, with a grand total per row · '
              : matrixGranularity === 'day'
              ? 'Hours per employee per day worked (empty days are skipped), with full-month subtotals and a grand total per row · '
              : 'Hours per employee per week, with full-month subtotals and a grand total per row · '}
            Darker cells mean more hours · Click an employee to drill down by project, with its own project total
          </p>
        </CardHeader>
        <CardContent>
          {hoursMatrix.rows.length === 0 ? (
            <p className="text-center text-muted-foreground py-6 text-sm">No data for the selected filters.</p>
          ) : (
            <div className="overflow-x-auto" ref={matrixScrollRef}>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead rowSpan={2} className="table-header sticky left-0 bg-background z-10 min-w-[200px] align-bottom shadow-[1px_0_0_0_hsl(var(--border))]">
                      Employee
                    </TableHead>
                    {hoursMatrix.monthGroups.map(g => (
                      <TableHead
                        key={g.key}
                        colSpan={g.weekIndices.length + 1}
                        className="table-header text-center whitespace-nowrap border-l border-border"
                      >
                        {g.label}
                      </TableHead>
                    ))}
                    <TableHead rowSpan={2} className="table-header text-center whitespace-nowrap min-w-[90px] align-bottom border-l-2 border-border">
                      Total
                    </TableHead>
                  </TableRow>
                  <TableRow>
                    {hoursMatrix.monthGroups.map(g => (
                      <Fragment key={g.key}>
                        {g.weekIndices.map(wi => (
                          <TableHead key={hoursMatrix.columns[wi].key} className="table-header text-center whitespace-nowrap min-w-[100px]">
                            {hoursMatrix.columns[wi].label}
                          </TableHead>
                        ))}
                        <TableHead className="table-header text-center whitespace-nowrap min-w-[90px] border-l border-border bg-muted/20">
                          Month Total
                        </TableHead>
                      </Fragment>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {hoursMatrix.rows.map(row => {
                    const isExpanded = expandedMatrixRows.has(row.employeeId);
                    const hasProjects = row.projects.length > 0;
                    return (
                      <Fragment key={row.employeeId}>
                        <TableRow
                          className={hasProjects ? 'cursor-pointer hover:bg-muted/40' : undefined}
                          onClick={() => hasProjects && toggleMatrixRow(row.employeeId)}
                        >
                          <TableCell className="font-medium text-sm sticky left-0 bg-background z-10 shadow-[1px_0_0_0_hsl(var(--border))]">
                            <div className="flex items-center gap-1.5">
                              {hasProjects ? (
                                isExpanded
                                  ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                  : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                              ) : (
                                <span className="w-3.5 shrink-0" />
                              )}
                              {row.name}
                            </div>
                          </TableCell>
                          {hoursMatrix.monthGroups.map((g, gi) => (
                            <Fragment key={g.key}>
                              {g.weekIndices.map(wi => (
                                <TableCell
                                  key={wi}
                                  className="text-center text-sm font-medium tabular-nums transition-colors"
                                  style={heatCellStyle(row.weekHours[wi], hoursMatrix.maxCellHours)}
                                >
                                  {row.weekHours[wi] > 0 ? `${row.weekHours[wi].toFixed(1)}h` : ''}
                                </TableCell>
                              ))}
                              <TableCell className="text-center text-sm font-semibold tabular-nums border-l border-border bg-muted/20">
                                {row.monthTotals[gi] > 0 ? `${row.monthTotals[gi].toFixed(1)}h` : ''}
                              </TableCell>
                            </Fragment>
                          ))}
                          <TableCell className="text-center text-sm font-bold tabular-nums text-primary border-l-2 border-border">
                            {row.total > 0 ? `${row.total.toFixed(1)}h` : ''}
                          </TableCell>
                        </TableRow>
                        {isExpanded && row.projects.map(proj => (
                          <TableRow key={`${row.employeeId}-${proj.projectId}`} className="bg-muted/20">
                            <TableCell className="text-xs text-muted-foreground sticky left-0 bg-muted/20 z-10 shadow-[1px_0_0_0_hsl(var(--border))] pl-9">
                              {proj.name}
                            </TableCell>
                            {hoursMatrix.monthGroups.map((g, gi) => (
                              <Fragment key={g.key}>
                                {g.weekIndices.map(wi => (
                                  <TableCell
                                    key={wi}
                                    className="text-center text-xs tabular-nums transition-colors"
                                    style={heatCellStyle(proj.weekHours[wi], hoursMatrix.maxCellHours)}
                                  >
                                    {proj.weekHours[wi] > 0 ? `${proj.weekHours[wi].toFixed(1)}h` : ''}
                                  </TableCell>
                                ))}
                                <TableCell className="text-center text-xs font-medium tabular-nums border-l border-border bg-muted/30">
                                  {proj.monthTotals[gi] > 0 ? `${proj.monthTotals[gi].toFixed(1)}h` : ''}
                                </TableCell>
                              </Fragment>
                            ))}
                            <TableCell className="text-center text-xs font-bold tabular-nums text-primary border-l-2 border-border">
                              {proj.total > 0 ? `${proj.total.toFixed(1)}h` : ''}
                            </TableCell>
                          </TableRow>
                        ))}
                      </Fragment>
                    );
                  })}
                  {/* Totals row */}
                  <TableRow className="border-t-2 border-border">
                    <TableCell className="font-bold text-sm sticky left-0 bg-background z-10 shadow-[1px_0_0_0_hsl(var(--border))]">
                      Total
                    </TableCell>
                    {hoursMatrix.monthGroups.map((g, gi) => (
                      <Fragment key={g.key}>
                        {g.weekIndices.map(wi => (
                          <TableCell key={wi} className="text-center text-sm font-bold tabular-nums text-primary">
                            {hoursMatrix.totals[wi] > 0 ? `${hoursMatrix.totals[wi].toFixed(1)}h` : ''}
                          </TableCell>
                        ))}
                        <TableCell className="text-center text-sm font-bold tabular-nums text-primary border-l border-border bg-muted/20">
                          {hoursMatrix.monthTotals[gi] > 0 ? `${hoursMatrix.monthTotals[gi].toFixed(1)}h` : ''}
                        </TableCell>
                      </Fragment>
                    ))}
                    <TableCell className="text-center text-sm font-bold tabular-nums text-primary border-l-2 border-border">
                      {hoursMatrix.grandTotal > 0 ? `${hoursMatrix.grandTotal.toFixed(1)}h` : ''}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Project Hours Matrix ────────────────────────────────────────── */}
      <Card className="card-elevated">
        <CardHeader>
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <CardTitle className="text-base">Project Hours Matrix</CardTitle>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex rounded-md border overflow-hidden text-xs">
                {(['month', 'week', 'day'] as MatrixGranularity[]).map(g => (
                  <button
                    key={g}
                    onClick={() => setProjectMatrixGranularity(g)}
                    className={`px-3 py-1.5 capitalize transition-colors ${projectMatrixGranularity === g ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}
                  >
                    {g}
                  </button>
                ))}
              </div>
              {projectHoursMatrix.rows.length > 0 && (
                <div className="flex items-center gap-1 shrink-0">
                  <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => scrollProjectMatrix('left')} disabled={!projectMatrixCanScroll.left} title="Scroll left">
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => scrollProjectMatrix('right')} disabled={!projectMatrixCanScroll.right} title="Scroll right">
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            {projectMatrixGranularity === 'month'
              ? 'Hours per project per month, with a grand total per row · '
              : projectMatrixGranularity === 'day'
              ? 'Hours per project per day worked (empty days are skipped), with full-month subtotals and a grand total per row · '
              : 'Hours per project per week, with full-month subtotals and a grand total per row · '}
            Darker cells mean more hours · Click a project to drill down by employee, with its own employee total
          </p>
        </CardHeader>
        <CardContent>
          {projectHoursMatrix.rows.length === 0 ? (
            <p className="text-center text-muted-foreground py-6 text-sm">No data for the selected filters.</p>
          ) : (
            <div className="overflow-x-auto" ref={projectMatrixScrollRef}>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead rowSpan={2} className="table-header sticky left-0 bg-background z-10 min-w-[200px] align-bottom shadow-[1px_0_0_0_hsl(var(--border))]">
                      Project
                    </TableHead>
                    {projectHoursMatrix.monthGroups.map(g => (
                      <TableHead
                        key={g.key}
                        colSpan={g.weekIndices.length + 1}
                        className="table-header text-center whitespace-nowrap border-l border-border"
                      >
                        {g.label}
                      </TableHead>
                    ))}
                    <TableHead rowSpan={2} className="table-header text-center whitespace-nowrap min-w-[90px] align-bottom border-l-2 border-border">
                      Total
                    </TableHead>
                  </TableRow>
                  <TableRow>
                    {projectHoursMatrix.monthGroups.map(g => (
                      <Fragment key={g.key}>
                        {g.weekIndices.map(wi => (
                          <TableHead key={projectHoursMatrix.columns[wi].key} className="table-header text-center whitespace-nowrap min-w-[100px]">
                            {projectHoursMatrix.columns[wi].label}
                          </TableHead>
                        ))}
                        <TableHead className="table-header text-center whitespace-nowrap min-w-[90px] border-l border-border bg-muted/20">
                          Month Total
                        </TableHead>
                      </Fragment>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {projectHoursMatrix.rows.map(row => {
                    const isExpanded = expandedProjectMatrixRows.has(row.projectId);
                    const hasEmployees = row.employees.length > 0;
                    return (
                      <Fragment key={row.projectId}>
                        <TableRow
                          className={hasEmployees ? 'cursor-pointer hover:bg-muted/40' : undefined}
                          onClick={() => hasEmployees && toggleProjectMatrixRow(row.projectId)}
                        >
                          <TableCell className="font-medium text-sm sticky left-0 bg-background z-10 shadow-[1px_0_0_0_hsl(var(--border))]">
                            <div className="flex items-center gap-1.5">
                              {hasEmployees ? (
                                isExpanded
                                  ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                  : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                              ) : (
                                <span className="w-3.5 shrink-0" />
                              )}
                              <div>
                                {row.name}
                                {row.clientName && <span className="block text-xs text-muted-foreground font-normal">{row.clientName}</span>}
                              </div>
                            </div>
                          </TableCell>
                          {projectHoursMatrix.monthGroups.map((g, gi) => (
                            <Fragment key={g.key}>
                              {g.weekIndices.map(wi => (
                                <TableCell
                                  key={wi}
                                  className="text-center text-sm font-medium tabular-nums transition-colors"
                                  style={heatCellStyle(row.weekHours[wi], projectHoursMatrix.maxCellHours)}
                                >
                                  {row.weekHours[wi] > 0 ? `${row.weekHours[wi].toFixed(1)}h` : ''}
                                </TableCell>
                              ))}
                              <TableCell className="text-center text-sm font-semibold tabular-nums border-l border-border bg-muted/20">
                                {row.monthTotals[gi] > 0 ? `${row.monthTotals[gi].toFixed(1)}h` : ''}
                              </TableCell>
                            </Fragment>
                          ))}
                          <TableCell className="text-center text-sm font-bold tabular-nums text-primary border-l-2 border-border">
                            {row.total > 0 ? `${row.total.toFixed(1)}h` : ''}
                          </TableCell>
                        </TableRow>
                        {isExpanded && row.employees.map(emp => (
                          <TableRow key={`${row.projectId}-${emp.employeeId}`} className="bg-muted/20">
                            <TableCell className="text-xs text-muted-foreground sticky left-0 bg-muted/20 z-10 shadow-[1px_0_0_0_hsl(var(--border))] pl-9">
                              {emp.name}
                            </TableCell>
                            {projectHoursMatrix.monthGroups.map((g, gi) => (
                              <Fragment key={g.key}>
                                {g.weekIndices.map(wi => (
                                  <TableCell
                                    key={wi}
                                    className="text-center text-xs tabular-nums transition-colors"
                                    style={heatCellStyle(emp.weekHours[wi], projectHoursMatrix.maxCellHours)}
                                  >
                                    {emp.weekHours[wi] > 0 ? `${emp.weekHours[wi].toFixed(1)}h` : ''}
                                  </TableCell>
                                ))}
                                <TableCell className="text-center text-xs font-medium tabular-nums border-l border-border bg-muted/30">
                                  {emp.monthTotals[gi] > 0 ? `${emp.monthTotals[gi].toFixed(1)}h` : ''}
                                </TableCell>
                              </Fragment>
                            ))}
                            <TableCell className="text-center text-xs font-bold tabular-nums text-primary border-l-2 border-border">
                              {emp.total > 0 ? `${emp.total.toFixed(1)}h` : ''}
                            </TableCell>
                          </TableRow>
                        ))}
                      </Fragment>
                    );
                  })}
                  {/* Totals row */}
                  <TableRow className="border-t-2 border-border">
                    <TableCell className="font-bold text-sm sticky left-0 bg-background z-10 shadow-[1px_0_0_0_hsl(var(--border))]">
                      Total
                    </TableCell>
                    {projectHoursMatrix.monthGroups.map((g, gi) => (
                      <Fragment key={g.key}>
                        {g.weekIndices.map(wi => (
                          <TableCell key={wi} className="text-center text-sm font-bold tabular-nums text-primary">
                            {projectHoursMatrix.totals[wi] > 0 ? `${projectHoursMatrix.totals[wi].toFixed(1)}h` : ''}
                          </TableCell>
                        ))}
                        <TableCell className="text-center text-sm font-bold tabular-nums text-primary border-l border-border bg-muted/20">
                          {projectHoursMatrix.monthTotals[gi] > 0 ? `${projectHoursMatrix.monthTotals[gi].toFixed(1)}h` : ''}
                        </TableCell>
                      </Fragment>
                    ))}
                    <TableCell className="text-center text-sm font-bold tabular-nums text-primary border-l-2 border-border">
                      {projectHoursMatrix.grandTotal > 0 ? `${projectHoursMatrix.grandTotal.toFixed(1)}h` : ''}
                    </TableCell>
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
                      if (key) set('location', [key]);
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
                      onClick={() => set('location', [loc.key])}
                      className={`flex items-center justify-between p-2.5 rounded-lg text-left transition-colors ${
                        f.location.includes(loc.key) ? 'bg-primary/10 border border-primary/40' : 'bg-muted/30 hover:bg-muted/60'
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
              <CardTitle className="text-base">Utilization Detail</CardTitle>
              <p className="text-xs text-muted-foreground">
                Sorted by average weekly hours · Total = Client + Internal (vacation, holidays, meetings, etc. — counted in full, broken out for visibility)
                {` · ${weeksInSelectedRange.toFixed(1)} week${weeksInSelectedRange !== 1 ? 's' : ''} in the selected range`}
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

          {/* ── Who's available for new work — next 5 weeks below 50% load ─── */}
          {canManage && (
            <Card className="card-elevated">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <TrendingDown className="h-4 w-4" />Available for New Projects — Next {LOW_LOAD_WEEKS} Weeks
                </CardTitle>
                <p className="text-xs text-muted-foreground">
                  Active employees averaging under {LOW_LOAD_THRESHOLD_PCT}% projected load over the next {LOW_LOAD_WEEKS} weeks (from Staffing, across ALL their assignments regardless of the Filters card) · Sorted lowest load first · Someone with no Staffing row at all shows as 0%.
                </p>
              </CardHeader>
              <CardContent>
                {availableCapacityForecast.rows.length === 0 ? (
                  <p className="text-center text-muted-foreground py-6 text-sm">No active employees are averaging under {LOW_LOAD_THRESHOLD_PCT}% for the next {LOW_LOAD_WEEKS} weeks.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="table-header sticky left-0 bg-background z-10 min-w-[160px] shadow-[1px_0_0_0_hsl(var(--border))]">
                            Person
                          </TableHead>
                          {availableCapacityForecast.weeks.map(w => (
                            <TableHead key={w.key} className="table-header text-center whitespace-nowrap min-w-[90px]">
                              {w.label}
                            </TableHead>
                          ))}
                          <TableHead className="table-header text-center whitespace-nowrap min-w-[90px] border-l-2 border-border">
                            Avg
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {availableCapacityForecast.rows.map(row => (
                          <TableRow key={row.employeeId}>
                            <TableCell className="font-medium text-sm sticky left-0 bg-background z-10 shadow-[1px_0_0_0_hsl(var(--border))]">
                              {row.name}
                            </TableCell>
                            {row.weekPct.map((pct, i) => (
                              <TableCell key={i} className={`text-center text-sm font-medium tabular-nums transition-colors ${availabilityCellClass(pct)}`}>
                                {pct > 0 ? `${pct.toFixed(0)}%` : '0%'}
                              </TableCell>
                            ))}
                            <TableCell className="text-center text-sm font-bold tabular-nums text-primary border-l-2 border-border">
                              {row.avgPct.toFixed(0)}%
                            </TableCell>
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
                      <div className="overflow-x-auto">
                        <Table className="table-fixed">
                          <TableHeader>
                            <TableRow>
                              <TableHead className="table-header w-[26%]">Project</TableHead>
                              <TableHead className="table-header w-[26%]">Client</TableHead>
                              <TableHead className="table-header text-right w-[12%]">Allocation</TableHead>
                              <TableHead className="table-header text-right w-[16%]">Projected Hrs/Week</TableHead>
                              <TableHead className="table-header text-right w-[14%]">Actual Hrs/Week</TableHead>
                              <TableHead className="table-header text-right w-[12%]">% of Plan</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {person.rows.map(row => (
                              <TableRow key={row.projectId}>
                                <TableCell className="font-medium text-sm break-words">{row.projectName}</TableCell>
                                <TableCell className="text-sm text-muted-foreground break-words">{row.clientName}</TableCell>
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
                      </div>
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
