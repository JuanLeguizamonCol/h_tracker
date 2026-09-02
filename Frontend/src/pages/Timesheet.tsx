import { useState, useMemo, useRef, useEffect } from 'react';
import { format, startOfWeek, addDays } from 'date-fns';
import { CalendarIcon, ChevronLeft, ChevronRight, Save, Loader2, MessageSquare, Plus, X, Search, MapPin, Receipt } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useActiveProjects } from '@/hooks/useProjects';
import { useClients } from '@/hooks/useClients';
import { useAssignedProjectsWithDetails, useAssignedProjects } from '@/hooks/useAssignedProjects';
import { useTimeEntriesByWeek, useCreateTimeEntry, useUpdateTimeEntry, useDeleteTimeEntry } from '@/hooks/useTimeEntries';
import { useCreateProjectExpense } from '@/hooks/useProjectExpenses';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { WORK_LOCATION_GROUPS } from '@/lib/workLocations';
import { EXPENSE_CATEGORIES } from '@/lib/expenseCategories';
import { toast } from 'sonner';

// ── Project selector dropdown ─────────────────────────────────────────────────

interface ProjectOption {
  id: string;
  name: string;
  clientName: string;
  isInternal: boolean;
  assigned: boolean;
  status: string;
}

function AddProjectDropdown({ projects, onAdd }: { projects: ProjectOption[]; onAdd: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const q = search.toLowerCase();
  const allFiltered = projects.filter(
    p => p.name.toLowerCase().includes(q) || p.clientName.toLowerCase().includes(q),
  );
  const myProjects = allFiltered.filter(p => p.assigned);
  const otherProjects = allFiltered.filter(p => !p.assigned);

  useEffect(() => {
    function handleMouseDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch('');
      }
    }
    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, []);

  const handleSelect = (id: string) => {
    onAdd(id);
    setOpen(false);
    setSearch('');
  };

  const renderItem = (proj: ProjectOption) => (
    <button
      key={proj.id}
      type="button"
      className="flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left text-sm hover:bg-accent"
      onClick={() => handleSelect(proj.id)}
    >
      <span className="font-medium leading-tight">{proj.name}</span>
      <span className="text-xs text-muted-foreground leading-tight">
        {proj.clientName || (proj.isInternal ? 'Internal' : '—')}
      </span>
    </button>
  );

  return (
    <div ref={containerRef} className="relative">
      <Button
        variant="default"
        size="sm"
        className="gap-1.5"
        onClick={() => { setOpen(true); setTimeout(() => inputRef.current?.focus(), 10); }}
        type="button"
        disabled={projects.length === 0}
      >
        <Plus className="h-3.5 w-3.5" />
        Add Project
      </Button>

      {open && (
        <div className="absolute right-0 z-50 mt-1 w-72 rounded-md border bg-popover shadow-md">
          <div className="flex items-center border-b px-3">
            <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
            <input
              ref={inputRef}
              value={search}
              onChange={e => setSearch(e.target.value)}
              onKeyDown={e => e.key === 'Escape' && (setOpen(false), setSearch(''))}
              className="flex h-9 w-full bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground"
              placeholder="Search projects…"
            />
          </div>
          <div className="max-h-64 overflow-y-auto py-1">
            {allFiltered.length === 0 ? (
              <p className="px-3 py-4 text-center text-sm text-muted-foreground">No more projects to add.</p>
            ) : (
              <>
                {myProjects.length > 0 && (
                  <>
                    <p className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      My Projects
                    </p>
                    {myProjects.map(renderItem)}
                  </>
                )}
                {myProjects.length > 0 && otherProjects.length > 0 && (
                  <div className="my-1 h-px bg-border" />
                )}
                {otherProjects.length > 0 && (
                  <>
                    <p className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Other Projects
                    </p>
                    {otherProjects.map(renderItem)}
                  </>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Data model ────────────────────────────────────────────────────────────────

interface DayEntry {
  id?: string;
  hours: number;
  notes: string;
  dirty: boolean;
}

interface ProjectRow {
  projectId: string;
  projectName: string;
  clientName: string;
  isInternal: boolean;
  billable: boolean;
  days: Record<string, DayEntry>; // key: 'yyyy-MM-dd'
}

const DAY_ABBRS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const GRID_COLS = '200px repeat(7, minmax(80px, 1fr)) 56px 36px';

// Maximum hours allowed in a single day cell — a day only has 24 hours.
const MAX_HOURS_PER_DAY = 24;

// Hours must be logged in 15-minute increments — anything finer isn't
// meaningful for billing/reporting.
const HOURS_STEP = 0.25;

function isOffHoursStep(hours: number): boolean {
  const steps = hours / HOURS_STEP;
  return hours > 0 && Math.abs(steps - Math.round(steps)) > 1e-6;
}

// ── Main component ────────────────────────────────────────────────────────────

export default function Timesheet() {
  const { employee } = useAuth();
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [isSaving, setIsSaving] = useState(false);
  const [rows, setRows] = useState<ProjectRow[]>([]);
  const [pendingDeletions, setPendingDeletions] = useState<string[]>([]);
  const [openNoteKey, setOpenNoteKey] = useState<string | null>(null); // '{projectId}:{dateStr}'
  // Where each day's hours were actually worked — defaults to the employee's
  // home location, overridable per day (a short trip) or for the whole week
  // at once (an extended trip). Keyed by 'yyyy-MM-dd'.
  const [dayLocations, setDayLocations] = useState<Record<string, string>>({});
  const [dirtyLocationDays, setDirtyLocationDays] = useState<Set<string>>(new Set());

  // Optional per-project expenses — logged inline via a small panel, no
  // redirect to the Invoices module. Independent of the hours grid above.
  const [expenseTarget, setExpenseTarget] = useState<{ projectId: string; projectName: string } | null>(null);
  const [expenseForm, setExpenseForm] = useState({ date: '', category: '', amount: '', description: '' });
  const [isSavingExpense, setIsSavingExpense] = useState(false);
  const createProjectExpense = useCreateProjectExpense();

  const weekStart = startOfWeek(selectedDate, { weekStartsOn: 1 });
  const weekKey = format(weekStart, 'yyyy-MM-dd');
  const prevWeekKeyRef = useRef<string>('');

  const { data: allProjects = [], isLoading: projectsLoading } = useActiveProjects();
  const { data: clients = [] } = useClients();
  const { data: assignedProjects = [], isLoading: assignmentsLoading } = useAssignedProjectsWithDetails(employee?.id);
  const { data: rawAssignments = [] } = useAssignedProjects(employee?.id);
  const { data: weekEntries = [], isLoading: entriesLoading } = useTimeEntriesByWeek(weekStart, employee?.id);

  const createTimeEntry = useCreateTimeEntry();
  const updateTimeEntry = useUpdateTimeEntry();
  const deleteTimeEntry = useDeleteTimeEntry();

  const assignmentRoleMap = useMemo(() => {
    const map = new Map<string, string | null>();
    rawAssignments.forEach(a => map.set(a.project_id, a.role_id));
    return map;
  }, [rawAssignments]);

  const assignedProjectIds = useMemo(
    () => new Set(assignedProjects.map(ap => ap.project_id)),
    [assignedProjects],
  );

  const availableProjects = useMemo(() => {
    return allProjects.map(p => {
      const client = clients.find(c => c.id === p.client_id);
      const assignedDetail = assignedProjects.find(ap => ap.project_id === p.id);
      return {
        id: p.id,
        name: assignedDetail?.project_name || p.name,
        clientName: assignedDetail?.client_name || client?.name || '',
        isInternal: p.is_internal,
        assigned: assignedProjectIds.has(p.id),
        status: p.status,
      };
    });
  }, [allProjects, clients, assignedProjects, assignedProjectIds]);

  const isLoading = projectsLoading || assignmentsLoading || entriesLoading;

  // Initialize (or re-initialize) rows when data for the current week arrives
  useEffect(() => {
    if (isLoading) return;
    if (prevWeekKeyRef.current === weekKey) return;
    prevWeekKeyRef.current = weekKey;

    // Keyed by project + billable type, NOT project alone — a project can carry
    // both billable and non-billable hours at once, and merging them into a
    // single row would silently flatten one type into the other on save.
    const rowKey = (projectId: string, billable: boolean) => `${projectId}::${billable}`;
    const rowMap = new Map<string, ProjectRow>();
    weekEntries.forEach(entry => {
      const proj = availableProjects.find(p => p.id === entry.project_id);
      const key = rowKey(entry.project_id, entry.billable);
      if (!rowMap.has(key)) {
        rowMap.set(key, {
          projectId: entry.project_id,
          projectName: proj?.name ?? entry.project_id,
          clientName: proj?.clientName ?? '',
          isInternal: proj?.isInternal ?? false,
          billable: entry.billable,
          days: {},
        });
      }
      rowMap.get(key)!.days[entry.date] = {
        id: entry.id,
        hours: Number(entry.hours),
        notes: entry.notes || '',
        dirty: false,
      };
    });

    // Every non-internal project always gets both a billable and a non-billable
    // row (even empty), so both types of hours can be logged for it at any time.
    Array.from(rowMap.values()).forEach(row => {
      if (row.isInternal) return;
      const counterKey = rowKey(row.projectId, !row.billable);
      if (!rowMap.has(counterKey)) {
        rowMap.set(counterKey, {
          projectId: row.projectId,
          projectName: row.projectName,
          clientName: row.clientName,
          isInternal: false,
          billable: !row.billable,
          days: {},
        });
      }
    });

    setRows(Array.from(rowMap.values()).sort((a, b) =>
      a.projectName === b.projectName
        ? Number(b.billable) - Number(a.billable) // billable row first within a project
        : a.projectName.localeCompare(b.projectName)
    ));
    setPendingDeletions([]);

    // Per-day work location: use whatever was already saved for that date
    // (any row's entry — they should all agree), else the employee's home
    // location as the default.
    const datesInWeek = Array.from({ length: 7 }, (_, i) => format(addDays(weekStart, i), 'yyyy-MM-dd'));
    const locationByDate: Record<string, string> = {};
    datesInWeek.forEach(ds => { locationByDate[ds] = employee?.location || ''; });
    weekEntries.forEach(entry => {
      if (entry.location) locationByDate[entry.date] = entry.location;
    });
    setDayLocations(locationByDate);
    setDirtyLocationDays(new Set());
  }, [isLoading, weekKey, weekEntries, availableProjects, weekStart, employee?.location]);

  const weekDates = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart],
  );

  const addableProjects = useMemo(() => {
    const addedIds = new Set(rows.map(r => r.projectId));
    // Business Development projects are prospective — no hours are loggable
    // against them yet, so they don't show up as addable.
    return availableProjects.filter(p => !addedIds.has(p.id) && p.status !== 'business_development');
  }, [rows, availableProjects]);

  // A project can have two rows (billable + non-billable) — the "Add expense"
  // action isn't tied to either lane, so it's only rendered on the first row
  // for that project to avoid showing it twice.
  const firstRowIdxByProject = useMemo(() => {
    const map: Record<string, number> = {};
    rows.forEach((r, i) => { if (!(r.projectId in map)) map[r.projectId] = i; });
    return map;
  }, [rows]);

  const weeklyTotal = useMemo(
    () => rows.reduce((sum, row) => sum + Object.values(row.days).reduce((s, d) => s + d.hours, 0), 0),
    [rows],
  );

  const dayTotals = useMemo(
    () => weekDates.map(date => {
      const ds = format(date, 'yyyy-MM-dd');
      return rows.reduce((sum, row) => sum + (row.days[ds]?.hours ?? 0), 0);
    }),
    [rows, weekDates],
  );

  const hasChanges = useMemo(
    () => pendingDeletions.length > 0 || dirtyLocationDays.size > 0 || rows.some(row => Object.values(row.days).some(d => d.dirty)),
    [rows, pendingDeletions, dirtyLocationDays],
  );

  // A single day's entry can't exceed 24 hours, and must land on a 15-minute
  // increment. Flag any offending cell and block saving until it's fixed.
  const hasInvalidHours = useMemo(
    () => rows.some(row => Object.values(row.days).some(d => d.hours > MAX_HOURS_PER_DAY || isOffHoursStep(d.hours))),
    [rows],
  );

  // ── Handlers ─────────────────────────────────────────────────────────────────

  const handleAddProject = (projectId: string) => {
    const proj = availableProjects.find(p => p.id === projectId);
    if (!proj) return;
    if (proj.isInternal) {
      setRows(prev => [...prev, {
        projectId: proj.id,
        projectName: proj.name,
        clientName: proj.clientName,
        isInternal: true,
        billable: false,
        days: {},
      }]);
      return;
    }
    // Non-internal projects can carry both billable and non-billable hours, so
    // add both lanes up front — no need to add the project twice or toggle.
    setRows(prev => [...prev,
      { projectId: proj.id, projectName: proj.name, clientName: proj.clientName, isInternal: false, billable: true, days: {} },
      { projectId: proj.id, projectName: proj.name, clientName: proj.clientName, isInternal: false, billable: false, days: {} },
    ]);
  };

  const handleUpdateHours = (projectId: string, billable: boolean, dateStr: string, hours: number) => {
    setRows(prev => prev.map(row => {
      if (row.projectId !== projectId || row.billable !== billable) return row;
      const existing = row.days[dateStr];
      return {
        ...row,
        days: {
          ...row.days,
          [dateStr]: { id: existing?.id, notes: existing?.notes ?? '', hours, dirty: true },
        },
      };
    }));
  };

  const handleUpdateNotes = (projectId: string, billable: boolean, dateStr: string, notes: string) => {
    setRows(prev => prev.map(row => {
      if (row.projectId !== projectId || row.billable !== billable) return row;
      const existing = row.days[dateStr];
      return {
        ...row,
        days: {
          ...row.days,
          [dateStr]: { id: existing?.id, hours: existing?.hours ?? 0, notes, dirty: true },
        },
      };
    }));
  };

  const handleSetDayLocation = (dateStr: string, location: string) => {
    setDayLocations(prev => ({ ...prev, [dateStr]: location }));
    setDirtyLocationDays(prev => new Set(prev).add(dateStr));
  };

  const handleSetWeekLocation = (location: string) => {
    const datesInWeek = weekDates.map(d => format(d, 'yyyy-MM-dd'));
    setDayLocations(prev => {
      const next = { ...prev };
      datesInWeek.forEach(ds => { next[ds] = location; });
      return next;
    });
    setDirtyLocationDays(prev => new Set([...prev, ...datesInWeek]));
  };

  const handleRemoveRow = (projectId: string) => {
    // A project can have both a billable and non-billable row — remove BOTH and
    // queue every persisted entry across them for deletion (previously only the
    // first matching row's entries were queued, orphaning the other type's rows).
    const idsToDelete = rows
      .filter(r => r.projectId === projectId)
      .flatMap(r => Object.values(r.days).filter(d => d.id).map(d => d.id!));
    if (idsToDelete.length > 0) {
      setPendingDeletions(prev => [...prev, ...idsToDelete]);
    }
    setRows(prev => prev.filter(r => r.projectId !== projectId));
  };

  const openExpenseDialog = (projectId: string, projectName: string) => {
    setExpenseTarget({ projectId, projectName });
    setExpenseForm({ date: format(new Date(), 'yyyy-MM-dd'), category: '', amount: '', description: '' });
  };

  const handleSaveExpense = async () => {
    if (!employee || !expenseTarget) return;
    if (!expenseForm.date) { toast.error('Pick a date.'); return; }
    if (!expenseForm.category) { toast.error('Pick a category.'); return; }
    const amount = parseFloat(expenseForm.amount);
    if (!amount || amount <= 0) { toast.error('Enter an amount greater than 0.'); return; }

    setIsSavingExpense(true);
    try {
      await createProjectExpense.mutateAsync({
        project_id: expenseTarget.projectId,
        user_id: employee.id,
        date: expenseForm.date,
        category: expenseForm.category,
        amount_usd: amount,
        description: expenseForm.description || null,
      });
      toast.success(`Expense added to ${expenseTarget.projectName}.`);
      setExpenseTarget(null);
    } catch {
      toast.error('Something went wrong while saving the expense. Please try again.');
    } finally {
      setIsSavingExpense(false);
    }
  };

  const handleSave = async () => {
    if (!employee) return;
    if (hasInvalidHours) {
      toast.error(`Hours must be in 15-minute increments and can't exceed ${MAX_HOURS_PER_DAY} per day. Fix the highlighted cells before saving.`);
      return;
    }
    setIsSaving(true);
    try {
      const promises: Promise<unknown>[] = [];

      for (const id of pendingDeletions) {
        promises.push(deleteTimeEntry.mutateAsync(id));
      }

      for (const row of rows) {
        for (const [dateStr, dayEntry] of Object.entries(row.days)) {
          // A day's location can be changed without touching hours (e.g. fixing
          // just Thursday's location after the fact) — still needs saving for
          // any entry that already exists on that date.
          const locationDirty = dirtyLocationDays.has(dateStr) && !!dayEntry.id;
          if (!dayEntry.dirty && !locationDirty) continue;
          const roleId = assignmentRoleMap.get(row.projectId) ?? null;
          const billable = row.isInternal ? false : row.billable;
          const location = dayLocations[dateStr] || null;

          if (dayEntry.id) {
            if (dayEntry.dirty && dayEntry.hours <= 0) {
              promises.push(deleteTimeEntry.mutateAsync(dayEntry.id));
            } else {
              promises.push(updateTimeEntry.mutateAsync({
                id: dayEntry.id,
                updates: { hours: dayEntry.hours, notes: dayEntry.notes || null, billable, role_id: roleId, location },
              }));
            }
          } else if (dayEntry.dirty && dayEntry.hours > 0) {
            promises.push(createTimeEntry.mutateAsync({
              user_id: employee.id,
              project_id: row.projectId,
              date: dateStr,
              hours: dayEntry.hours,
              billable,
              notes: dayEntry.notes || null,
              status: 'normal',
              role_id: roleId,
              location,
            }));
          }
        }
      }

      await Promise.all(promises);
      setPendingDeletions([]);
      setDirtyLocationDays(new Set());
      prevWeekKeyRef.current = ''; // allow re-init from refreshed server data
      toast.success("Saved — you're all set.");
    } catch (error) {
      toast.error('Something went wrong while saving. Please try again.');
      console.error(error);
    } finally {
      setIsSaving(false);
    }
  };

  const resetWeek = (date: Date) => {
    prevWeekKeyRef.current = '';
    setSelectedDate(date);
    setRows([]);
    setPendingDeletions([]);
    setOpenNoteKey(null);
  };

  const navigateWeek = (direction: 'prev' | 'next') =>
    resetWeek(addDays(selectedDate, direction === 'prev' ? -7 : 7));

  const todayStr = format(new Date(), 'yyyy-MM-dd');

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Weekly Time Log</h1>
          <p className="text-muted-foreground">Add projects and fill in hours per day, then save</p>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant="outline" className="text-base px-3 py-1.5 font-bold">
            {weeklyTotal}h this week
          </Badge>
          <Button
            onClick={handleSave}
            className="gap-2"
            disabled={isSaving || !hasChanges || hasInvalidHours}
            title={hasInvalidHours ? `Hours must be in 15-minute increments and can't exceed ${MAX_HOURS_PER_DAY} per day` : undefined}
          >
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save Changes
          </Button>
        </div>
      </div>

      {/* Week Navigator + Add Project */}
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="icon" onClick={() => navigateWeek('prev')}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className="gap-2 min-w-[220px]">
              <CalendarIcon className="h-4 w-4" />
              Week of {format(weekStart, 'MMM d, yyyy')}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={selectedDate}
              onSelect={date => { if (date) resetWeek(date); }}
              initialFocus
              className="pointer-events-auto"
            />
          </PopoverContent>
        </Popover>
        <Button variant="outline" size="icon" onClick={() => navigateWeek('next')}>
          <ChevronRight className="h-4 w-4" />
        </Button>

        <Select onValueChange={handleSetWeekLocation}>
          <SelectTrigger className="h-9 w-[200px] gap-1.5 text-sm">
            <MapPin className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <SelectValue placeholder="Set whole week's location" />
          </SelectTrigger>
          <SelectContent>
            {WORK_LOCATION_GROUPS.map(group => (
              <SelectGroup key={group.label}>
                <SelectLabel>{group.label}</SelectLabel>
                {group.options.map(opt => <SelectItem key={opt} value={opt}>{opt}</SelectItem>)}
              </SelectGroup>
            ))}
          </SelectContent>
        </Select>

        <div className="flex-1" />
        <AddProjectDropdown projects={addableProjects} onAdd={handleAddProject} />
      </div>

      {/* Spreadsheet */}
      <Card className="card-elevated overflow-hidden">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <div className="min-w-[780px]">

              {/* Header row */}
              <div className="grid border-b bg-muted/50" style={{ gridTemplateColumns: GRID_COLS }}>
                <div className="sticky left-0 z-10 bg-muted/50 px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide border-r">
                  Project
                </div>
                {weekDates.map((date, i) => {
                  const isToday = format(date, 'yyyy-MM-dd') === todayStr;
                  return (
                    <div
                      key={i}
                      className={`px-2 py-2 text-center border-r ${isToday ? 'bg-primary/10' : ''}`}
                    >
                      <div className={`text-xs font-semibold ${isToday ? 'text-primary' : 'text-muted-foreground'}`}>
                        {DAY_ABBRS[i]}
                      </div>
                      <div className={`text-xs ${isToday ? 'text-primary' : 'text-muted-foreground/70'}`}>
                        {format(date, 'MMM d')}
                      </div>
                    </div>
                  );
                })}
                <div className="px-2 py-2.5 text-center text-xs font-semibold text-muted-foreground border-l">
                  Total
                </div>
                <div />
              </div>

              {/* Location row — where each day's hours were actually worked;
                  defaults to the employee's home location, overridable per day
                  for a short trip (see the week-level picker above for longer ones). */}
              <div className="grid border-b bg-muted/30" style={{ gridTemplateColumns: GRID_COLS }}>
                <div className="sticky left-0 z-10 bg-muted/30 px-3 py-1.5 border-r flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                  <MapPin className="h-3.5 w-3.5" /> Location
                </div>
                {weekDates.map((date, i) => {
                  const dateStr = format(date, 'yyyy-MM-dd');
                  const value = dayLocations[dateStr] || '';
                  const isOverride = !!employee?.location && value !== employee.location;
                  return (
                    <div key={i} className="px-1.5 py-1.5 border-r flex items-center justify-center">
                      <Select value={value} onValueChange={v => handleSetDayLocation(dateStr, v)}>
                        <SelectTrigger className={`h-7 text-xs px-2 ${isOverride ? 'border-primary/60 bg-primary/5 text-primary' : ''}`}>
                          <SelectValue placeholder="—" />
                        </SelectTrigger>
                        <SelectContent>
                          {WORK_LOCATION_GROUPS.map(group => (
                            <SelectGroup key={group.label}>
                              <SelectLabel>{group.label}</SelectLabel>
                              {group.options.map(opt => <SelectItem key={opt} value={opt}>{opt}</SelectItem>)}
                            </SelectGroup>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  );
                })}
                <div className="border-l" />
                <div />
              </div>

              {/* Empty state */}
              {rows.length === 0 && (
                <div className="py-16 text-center">
                  <p className="text-sm font-medium text-muted-foreground">No projects added yet</p>
                  <p className="text-xs mt-1 text-muted-foreground/60">
                    Click "+ Add Project" above to start logging hours
                  </p>
                </div>
              )}

              {/* Project rows */}
              {rows.map((row, rowIdx) => {
                const rowTotal = Object.values(row.days).reduce((s, d) => s + d.hours, 0);
                const isOdd = rowIdx % 2 !== 0;

                return (
                  <div
                    key={`${row.projectId}-${row.billable}`}
                    className={`grid items-stretch border-b last:border-b-0 group ${isOdd ? 'bg-muted/20' : ''}`}
                    style={{ gridTemplateColumns: GRID_COLS }}
                  >
                    {/* Project info — sticky */}
                    <div className={`sticky left-0 z-10 px-3 py-2.5 border-r flex flex-col justify-center gap-0.5 ${isOdd ? 'bg-muted/20' : 'bg-card'}`}>
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="text-sm font-medium text-foreground truncate leading-snug">
                          {row.projectName}
                        </span>
                        {row.isInternal && (
                          <span className="shrink-0 inline-flex items-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300 px-1.5 py-0 text-[10px] font-semibold">
                            Int
                          </span>
                        )}
                      </div>
                      {row.clientName && (
                        <span className="text-[11px] text-muted-foreground truncate leading-tight">
                          {row.clientName}
                        </span>
                      )}
                      {!row.isInternal && (
                        <div className="flex items-center gap-1.5 mt-1">
                          <span className={`inline-flex items-center rounded-full px-1.5 py-0 text-[10px] font-semibold ${
                            row.billable
                              ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300'
                              : 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200'
                          }`}>
                            {row.billable ? 'Billable' : 'Non-billable'}
                          </span>
                        </div>
                      )}
                      {firstRowIdxByProject[row.projectId] === rowIdx && (
                        <button
                          type="button"
                          onClick={() => openExpenseDialog(row.projectId, row.projectName)}
                          className="inline-flex items-center gap-1 self-start text-[11px] text-muted-foreground hover:text-primary transition-colors mt-1"
                        >
                          <Receipt className="h-3 w-3" /> Add expense
                        </button>
                      )}
                    </div>

                    {/* Day cells */}
                    {weekDates.map((date, dayIdx) => {
                      const dateStr = format(date, 'yyyy-MM-dd');
                      const isToday = dateStr === todayStr;
                      const dayEntry = row.days[dateStr];
                      const hours = dayEntry?.hours ?? 0;
                      const notes = dayEntry?.notes ?? '';
                      const noteKey = `${row.projectId}:${row.billable}:${dateStr}`;

                      return (
                        <div
                          key={dayIdx}
                          className={`px-1.5 py-2 border-r flex flex-col items-center gap-1 ${isToday ? 'bg-primary/5' : ''}`}
                        >
                          <Input
                            type="number"
                            min="0" max={MAX_HOURS_PER_DAY} step={HOURS_STEP}
                            value={hours === 0 ? '' : hours}
                            placeholder="—"
                            aria-invalid={hours > MAX_HOURS_PER_DAY || isOffHoursStep(hours)}
                            title={
                              hours > MAX_HOURS_PER_DAY ? `Max ${MAX_HOURS_PER_DAY} hours per day`
                              : isOffHoursStep(hours) ? 'Hours must be in 15-minute increments (e.g. 0.25, 0.5, 0.75)'
                              : undefined
                            }
                            onChange={e => handleUpdateHours(row.projectId, row.billable, dateStr, parseFloat(e.target.value) || 0)}
                            className={`w-full h-8 text-center text-sm px-1 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${
                              hours > MAX_HOURS_PER_DAY || isOffHoursStep(hours) ? 'border-destructive text-destructive focus-visible:ring-destructive' : ''
                            }`}
                          />
                          {hours > MAX_HOURS_PER_DAY && (
                            <span className="text-[10px] leading-tight text-destructive">max {MAX_HOURS_PER_DAY}h</span>
                          )}
                          {hours <= MAX_HOURS_PER_DAY && isOffHoursStep(hours) && (
                            <span className="text-[10px] leading-tight text-destructive">15-min steps</span>
                          )}
                          <Popover
                            open={openNoteKey === noteKey}
                            onOpenChange={open => setOpenNoteKey(open ? noteKey : null)}
                          >
                            <PopoverTrigger asChild>
                              <button
                                type="button"
                                className={`h-4 w-4 flex items-center justify-center rounded transition-colors ${
                                  notes
                                    ? 'text-primary hover:text-primary/80'
                                    : 'text-muted-foreground/30 hover:text-muted-foreground'
                                }`}
                                title={notes || 'Add note'}
                              >
                                <MessageSquare className="h-3 w-3" />
                              </button>
                            </PopoverTrigger>
                            <PopoverContent className="w-60 p-2" side="bottom" align="center">
                              <Textarea
                                placeholder="Notes for this day…"
                                value={notes}
                                onChange={e => handleUpdateNotes(row.projectId, row.billable, dateStr, e.target.value)}
                                rows={3}
                                className="text-xs resize-none"
                                autoFocus
                              />
                            </PopoverContent>
                          </Popover>
                        </div>
                      );
                    })}

                    {/* Row total */}
                    <div className="flex items-center justify-center px-2 py-2 border-l">
                      <span className="text-sm font-semibold text-muted-foreground">
                        {rowTotal > 0 ? `${rowTotal}h` : '—'}
                      </span>
                    </div>

                    {/* Remove row — visible on row hover */}
                    <div className="flex items-center justify-center py-2">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost" size="sm"
                            className="h-7 w-7 p-0 text-muted-foreground/40 hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={() => handleRemoveRow(row.projectId)}
                          >
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Remove project row</TooltipContent>
                      </Tooltip>
                    </div>
                  </div>
                );
              })}

              {/* Footer — daily totals */}
              {rows.length > 0 && (
                <div className="grid border-t bg-muted/40" style={{ gridTemplateColumns: GRID_COLS }}>
                  <div className="sticky left-0 z-10 bg-muted/40 px-4 py-2 text-xs font-semibold text-muted-foreground border-r">
                    Daily Total
                  </div>
                  {dayTotals.map((total, i) => {
                    const isToday = format(weekDates[i], 'yyyy-MM-dd') === todayStr;
                    return (
                      <div
                        key={i}
                        className={`px-2 py-2 text-center text-xs font-semibold border-r ${isToday ? 'text-primary' : 'text-muted-foreground'}`}
                      >
                        {total > 0 ? `${total}h` : '—'}
                      </div>
                    );
                  })}
                  <div className="px-2 py-2 text-center text-sm font-bold border-l text-foreground">
                    {weeklyTotal}h
                  </div>
                  <div />
                </div>
              )}

            </div>
          </div>
        </CardContent>
      </Card>

      {/* Add Expense — inline panel, no redirect to Invoices */}
      <Dialog open={!!expenseTarget} onOpenChange={open => { if (!open) setExpenseTarget(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Expense{expenseTarget ? ` — ${expenseTarget.projectName}` : ''}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Date *</Label>
              <Input
                type="date"
                value={expenseForm.date}
                onChange={e => setExpenseForm(f => ({ ...f, date: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Category *</Label>
              <Select value={expenseForm.category} onValueChange={v => setExpenseForm(f => ({ ...f, category: v }))}>
                <SelectTrigger><SelectValue placeholder="Select a category" /></SelectTrigger>
                <SelectContent>
                  {EXPENSE_CATEGORIES.map(cat => <SelectItem key={cat} value={cat}>{cat}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Amount (USD) *</Label>
              <Input
                type="number" min="0" step="0.01" placeholder="0.00"
                value={expenseForm.amount}
                onChange={e => setExpenseForm(f => ({ ...f, amount: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Description</Label>
              <Textarea
                rows={2} placeholder="Optional details…"
                value={expenseForm.description}
                onChange={e => setExpenseForm(f => ({ ...f, description: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setExpenseTarget(null)}>Cancel</Button>
            <Button onClick={handleSaveExpense} disabled={isSavingExpense}>
              {isSavingExpense && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
              Save Expense
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
