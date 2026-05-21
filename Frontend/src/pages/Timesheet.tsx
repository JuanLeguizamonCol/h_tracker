import { useState, useMemo, useRef, useEffect } from 'react';
import { format, startOfWeek, addDays } from 'date-fns';
import { CalendarIcon, ChevronLeft, ChevronRight, Save, Loader2, MessageSquare, Plus, X, Search } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useActiveProjects } from '@/hooks/useProjects';
import { useClients } from '@/hooks/useClients';
import { useAssignedProjectsWithDetails, useAssignedProjects } from '@/hooks/useAssignedProjects';
import { useTimeEntriesByWeek, useCreateTimeEntry, useUpdateTimeEntry, useDeleteTimeEntry } from '@/hooks/useTimeEntries';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { toast } from 'sonner';

// ── Project selector dropdown ─────────────────────────────────────────────────

interface ProjectOption {
  id: string;
  name: string;
  clientName: string;
  isInternal: boolean;
  assigned: boolean;
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

// ── Main component ────────────────────────────────────────────────────────────

export default function Timesheet() {
  const { employee } = useAuth();
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [isSaving, setIsSaving] = useState(false);
  const [rows, setRows] = useState<ProjectRow[]>([]);
  const [pendingDeletions, setPendingDeletions] = useState<string[]>([]);
  const [openNoteKey, setOpenNoteKey] = useState<string | null>(null); // '{projectId}:{dateStr}'

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
      };
    });
  }, [allProjects, clients, assignedProjects, assignedProjectIds]);

  const isLoading = projectsLoading || assignmentsLoading || entriesLoading;

  // Initialize (or re-initialize) rows when data for the current week arrives
  useEffect(() => {
    if (isLoading) return;
    if (prevWeekKeyRef.current === weekKey) return;
    prevWeekKeyRef.current = weekKey;

    const rowMap = new Map<string, ProjectRow>();
    weekEntries.forEach(entry => {
      const proj = availableProjects.find(p => p.id === entry.project_id);
      if (!rowMap.has(entry.project_id)) {
        rowMap.set(entry.project_id, {
          projectId: entry.project_id,
          projectName: proj?.name ?? entry.project_id,
          clientName: proj?.clientName ?? '',
          isInternal: proj?.isInternal ?? false,
          billable: entry.billable,
          days: {},
        });
      }
      rowMap.get(entry.project_id)!.days[entry.date] = {
        id: entry.id,
        hours: Number(entry.hours),
        notes: entry.notes || '',
        dirty: false,
      };
    });

    setRows(Array.from(rowMap.values()));
    setPendingDeletions([]);
  }, [isLoading, weekKey, weekEntries, availableProjects]);

  const weekDates = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart],
  );

  const addableProjects = useMemo(() => {
    const addedIds = new Set(rows.map(r => r.projectId));
    return availableProjects.filter(p => !addedIds.has(p.id));
  }, [rows, availableProjects]);

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
    () => pendingDeletions.length > 0 || rows.some(row => Object.values(row.days).some(d => d.dirty)),
    [rows, pendingDeletions],
  );

  // ── Handlers ─────────────────────────────────────────────────────────────────

  const handleAddProject = (projectId: string) => {
    const proj = availableProjects.find(p => p.id === projectId);
    if (!proj) return;
    setRows(prev => [...prev, {
      projectId: proj.id,
      projectName: proj.name,
      clientName: proj.clientName,
      isInternal: proj.isInternal,
      billable: !proj.isInternal,
      days: {},
    }]);
  };

  const handleUpdateHours = (projectId: string, dateStr: string, hours: number) => {
    setRows(prev => prev.map(row => {
      if (row.projectId !== projectId) return row;
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

  const handleUpdateNotes = (projectId: string, dateStr: string, notes: string) => {
    setRows(prev => prev.map(row => {
      if (row.projectId !== projectId) return row;
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

  const handleUpdateBillable = (projectId: string, billable: boolean) => {
    setRows(prev => prev.map(row => {
      if (row.projectId !== projectId) return row;
      // Mark all persisted days as dirty so they get updated on save
      const updatedDays = Object.fromEntries(
        Object.entries(row.days).map(([d, e]) => [d, { ...e, dirty: true }]),
      );
      return { ...row, billable, days: updatedDays };
    }));
  };

  const handleRemoveRow = (projectId: string) => {
    const row = rows.find(r => r.projectId === projectId);
    if (row) {
      const idsToDelete = Object.values(row.days).filter(d => d.id).map(d => d.id!);
      if (idsToDelete.length > 0) {
        setPendingDeletions(prev => [...prev, ...idsToDelete]);
      }
    }
    setRows(prev => prev.filter(r => r.projectId !== projectId));
  };

  const handleSave = async () => {
    if (!employee) return;
    setIsSaving(true);
    try {
      const promises: Promise<unknown>[] = [];

      for (const id of pendingDeletions) {
        promises.push(deleteTimeEntry.mutateAsync(id));
      }

      for (const row of rows) {
        for (const [dateStr, dayEntry] of Object.entries(row.days)) {
          if (!dayEntry.dirty) continue;
          const roleId = assignmentRoleMap.get(row.projectId) ?? null;
          const billable = row.isInternal ? false : row.billable;

          if (dayEntry.id) {
            if (dayEntry.hours <= 0) {
              promises.push(deleteTimeEntry.mutateAsync(dayEntry.id));
            } else {
              promises.push(updateTimeEntry.mutateAsync({
                id: dayEntry.id,
                updates: { hours: dayEntry.hours, notes: dayEntry.notes || null, billable, role_id: roleId },
              }));
            }
          } else if (dayEntry.hours > 0) {
            promises.push(createTimeEntry.mutateAsync({
              user_id: employee.id,
              project_id: row.projectId,
              date: dateStr,
              hours: dayEntry.hours,
              billable,
              notes: dayEntry.notes || null,
              status: 'normal',
              role_id: roleId,
            }));
          }
        }
      }

      await Promise.all(promises);
      setPendingDeletions([]);
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
          <Button onClick={handleSave} className="gap-2" disabled={isSaving || !hasChanges}>
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
                    key={row.projectId}
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
                          <Switch
                            checked={row.billable}
                            onCheckedChange={v => handleUpdateBillable(row.projectId, v)}
                            className="h-5 w-9"
                          />
                          <Label className={`text-[10px] cursor-pointer ${row.billable ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground'}`}>
                            {row.billable ? 'Billable' : 'Non-bill.'}
                          </Label>
                        </div>
                      )}
                    </div>

                    {/* Day cells */}
                    {weekDates.map((date, dayIdx) => {
                      const dateStr = format(date, 'yyyy-MM-dd');
                      const isToday = dateStr === todayStr;
                      const dayEntry = row.days[dateStr];
                      const hours = dayEntry?.hours ?? 0;
                      const notes = dayEntry?.notes ?? '';
                      const noteKey = `${row.projectId}:${dateStr}`;

                      return (
                        <div
                          key={dayIdx}
                          className={`px-1.5 py-2 border-r flex flex-col items-center gap-1 ${isToday ? 'bg-primary/5' : ''}`}
                        >
                          <Input
                            type="number"
                            min="0" max="24" step="0.5"
                            value={hours === 0 ? '' : hours}
                            placeholder="—"
                            onChange={e => handleUpdateHours(row.projectId, dateStr, parseFloat(e.target.value) || 0)}
                            className="w-full h-8 text-center text-sm px-1 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                          />
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
                                onChange={e => handleUpdateNotes(row.projectId, dateStr, e.target.value)}
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
    </div>
  );
}
