import { useState, useMemo, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { format, startOfMonth, endOfMonth, subMonths, addMonths, parseISO } from 'date-fns';
import { CalendarIcon, ChevronLeft, ChevronRight, FileBarChart, Loader2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useProjects } from '@/hooks/useProjects';
import { useClients } from '@/hooks/useClients';
import { useEmployees } from '@/hooks/useEmployees';
import { useTimeEntriesByDateRange } from '@/hooks/useTimeEntries';
import { useAllProjectRoles } from '@/hooks/useProjectRoles';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Calendar } from '@/components/ui/calendar';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

export default function History() {
  const { employee, isAdmin } = useAuth();
  const [searchParams] = useSearchParams();

  // Pre-populate from query params (e.g., from InvoiceEditPage "View in Hours Tracker")
  const paramProjectId = searchParams.get('project_id') || '';
  const paramFrom = searchParams.get('from');

  const [selectedDate, setSelectedDate] = useState<Date>(() => {
    if (paramFrom) {
      try { return startOfMonth(parseISO(paramFrom)); } catch { /* ignore */ }
    }
    return new Date();
  });

  // Employee filter — only relevant for admins
  const [selectedUserId, setSelectedUserId] = useState<string>(() => {
    return isAdmin ? 'all' : (employee?.id || '');
  });

  // Project filter
  const [selectedProjectId, setSelectedProjectId] = useState<string>(paramProjectId);

  // Sync project filter if URL param changes
  useEffect(() => {
    if (paramProjectId) setSelectedProjectId(paramProjectId);
  }, [paramProjectId]);

  const monthStart = startOfMonth(selectedDate);
  const monthEnd = endOfMonth(selectedDate);

  const { data: projects = [] } = useProjects();
  const { data: clients = [] } = useClients();
  const { data: employees = [] } = useEmployees();
  const { data: allRoles = [] } = useAllProjectRoles();

  // Resolve which user_id to filter by (always employees.id — FK used in time_entries)
  const filterUserId = useMemo(() => {
    if (!isAdmin) return employee?.id;
    if (selectedUserId === 'all') return undefined;
    return selectedUserId;
  }, [isAdmin, employee, selectedUserId]);

  const filterProjectId = selectedProjectId || undefined;

  const { data: monthEntries = [], isLoading } = useTimeEntriesByDateRange(
    monthStart,
    monthEnd,
    filterUserId,
    filterProjectId,
  );

  const sortedEntries = useMemo(() => {
    return [...monthEntries].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [monthEntries]);

  const totalHours = monthEntries.reduce((sum, entry) => sum + Number(entry.hours), 0);

  const projectStats = useMemo(() => {
    const stats: Record<string, { hours: number; projectName: string; clientName: string }> = {};
    monthEntries.forEach(entry => {
      if (!stats[entry.project_id]) {
        const project = projects.find(p => p.id === entry.project_id);
        const client = project ? clients.find(c => c.id === project.client_id) : null;
        stats[entry.project_id] = {
          hours: 0,
          projectName: project?.name || 'Unknown project',
          clientName: client?.name || 'No client',
        };
      }
      stats[entry.project_id].hours += Number(entry.hours);
    });
    return Object.entries(stats).sort((a, b) => b[1].hours - a[1].hours);
  }, [monthEntries, projects, clients]);

  const navigateMonth = (direction: 'prev' | 'next') => {
    setSelectedDate(prev => (direction === 'prev' ? subMonths(prev, 1) : addMonths(prev, 1)));
  };

  const roleMap = useMemo(() => new Map(allRoles.map(r => [r.id, r.name])), [allRoles]);

  const getProjectName = (projectId: string) => projects.find(p => p.id === projectId)?.name || 'Unknown project';
  const getEmployeeName = (userId: string) => employees.find(e => e.id === userId)?.name || 'Unknown Employee';
  const getRoleName = (roleId: string | null) => (roleId ? roleMap.get(roleId) ?? null : null);

  const hasActiveFilters = selectedProjectId || (isAdmin && selectedUserId !== 'all');

  if (isLoading) {
    return (<div className="flex items-center justify-center h-64"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Hours History</h1>
          <p className="text-muted-foreground">Review logged hours by month</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3">
        {/* Month navigation */}
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" onClick={() => navigateMonth('prev')}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="gap-2 min-w-[160px]">
                <CalendarIcon className="h-4 w-4" />
                {format(selectedDate, 'MMMM yyyy')}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={(date) => date && setSelectedDate(date)}
                initialFocus
                className="pointer-events-auto"
              />
            </PopoverContent>
          </Popover>
          <Button variant="outline" size="icon" onClick={() => navigateMonth('next')}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        {/* Employee filter (admin only) */}
        {isAdmin && (
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Employee</Label>
            <Select value={selectedUserId} onValueChange={setSelectedUserId}>
              <SelectTrigger className="w-[180px] h-9">
                <SelectValue placeholder="All employees" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Employees</SelectItem>
                {employees.filter(e => e.is_active).map(emp => (
                  <SelectItem key={emp.id} value={emp.id}>
                    {emp.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Project filter */}
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Project</Label>
          <Select
            value={selectedProjectId || 'all'}
            onValueChange={v => setSelectedProjectId(v === 'all' ? '' : v)}
          >
            <SelectTrigger className="w-[200px] h-9">
              <SelectValue placeholder="All projects" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Projects</SelectItem>
              {projects.filter(p => p.is_active).map(p => (
                <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground h-9 self-end"
            onClick={() => {
              setSelectedUserId(isAdmin ? 'all' : (employee?.id || ''));
              setSelectedProjectId('');
            }}
          >
            Clear filters
          </Button>
        )}
      </div>

      {/* Stats */}
      <div className="grid gap-6 md:grid-cols-3">
        <Card className="stat-card">
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
                <FileBarChart className="h-6 w-6 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Hours</p>
                <p className="text-2xl font-bold text-foreground">{totalHours}h</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="stat-card">
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-success/10">
                <FileBarChart className="h-6 w-6 text-success" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Entries</p>
                <p className="text-2xl font-bold text-foreground">{monthEntries.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="stat-card">
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-warning/10">
                <FileBarChart className="h-6 w-6 text-warning" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Projects</p>
                <p className="text-2xl font-bold text-foreground">{projectStats.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="card-elevated">
          <CardHeader><CardTitle>By Project</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-4">
              {projectStats.map(([projectId, { hours, projectName, clientName }]) => (
                <div key={projectId} className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                  <div>
                    <p className="font-medium text-foreground">{projectName}</p>
                    <p className="text-sm text-muted-foreground">{clientName}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-primary">{hours}h</p>
                    <p className="text-xs text-muted-foreground">
                      {totalHours > 0 ? Math.round((hours / totalHours) * 100) : 0}%
                    </p>
                  </div>
                </div>
              ))}
              {projectStats.length === 0 && (
                <p className="text-center text-muted-foreground py-8">No entries this month</p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="card-elevated">
          <CardHeader><CardTitle>Entry Details</CardTitle></CardHeader>
          <CardContent>
            <div className="max-h-[400px] overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="table-header">Date</TableHead>
                    {isAdmin && selectedUserId === 'all' && (
                      <TableHead className="table-header">Employee</TableHead>
                    )}
                    <TableHead className="table-header">Project</TableHead>
                    <TableHead className="table-header text-right">Hours</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedEntries.map(entry => (
                    <TableRow key={entry.id}>
                      <TableCell>{format(new Date(entry.date), 'MMM d')}</TableCell>
                      {isAdmin && selectedUserId === 'all' && (
                        <TableCell>
                          <span className="text-sm font-medium text-foreground">
                            {getEmployeeName(entry.user_id)}
                          </span>
                          {getRoleName(entry.role_id) && (
                            <p className="text-xs text-muted-foreground leading-tight">
                              {getRoleName(entry.role_id)}
                            </p>
                          )}
                        </TableCell>
                      )}
                      <TableCell>{getProjectName(entry.project_id)}</TableCell>
                      <TableCell className="text-right font-medium">{Number(entry.hours)}h</TableCell>
                    </TableRow>
                  ))}
                  {sortedEntries.length === 0 && (
                    <TableRow>
                      <TableCell
                        colSpan={isAdmin && selectedUserId === 'all' ? 4 : 3}
                        className="text-center text-muted-foreground py-8"
                      >
                        No entries this month
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
