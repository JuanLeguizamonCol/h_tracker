import { useState, useMemo } from 'react';
import { format, startOfMonth, endOfMonth, subMonths, addMonths } from 'date-fns';
import { CalendarIcon, ChevronLeft, ChevronRight, FileText, DollarSign, Users, Briefcase, Loader2 } from 'lucide-react';
import { useEmployees } from '@/hooks/useEmployees';
import { useClients } from '@/hooks/useClients';
import { useProjects } from '@/hooks/useProjects';
import { useAllTimeEntriesByDateRange } from '@/hooks/useTimeEntries';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';

export default function Billing() {
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());

  const monthStart = startOfMonth(selectedDate);
  const monthEnd = endOfMonth(selectedDate);

  const { data: employees = [] } = useEmployees();
  const { data: clients = [] } = useClients();
  const { data: projects = [] } = useProjects();
  const { data: timeEntries = [], isLoading } = useAllTimeEntriesByDateRange(monthStart, monthEnd);

  const billingByProject = useMemo(() => {
    const projectBilling: Record<string, {
      projectName: string; clientName: string;
      employeeDetails: { name: string; hours: number; rate: number; total: number }[];
      totalHours: number; totalAmount: number;
    }> = {};

    timeEntries.forEach(entry => {
      const project = projects.find(p => p.id === entry.project_id);
      const emp = employees.find(e => e.user_id === entry.user_id);
      if (!project || !emp) return;

      const client = clients.find(c => c.id === project.client_id);

      if (!projectBilling[entry.project_id]) {
        projectBilling[entry.project_id] = {
          projectName: project.name,
          clientName: client?.name || 'No client',
          employeeDetails: [],
          totalHours: 0,
          totalAmount: 0,
        };
      }

      const existingEmployee = projectBilling[entry.project_id].employeeDetails.find(e => e.name === emp.name);
      const hours = Number(entry.hours);
      const rate = 0; // rate lives in project roles, not employees

      if (existingEmployee) {
        existingEmployee.hours += hours;
        existingEmployee.total = existingEmployee.hours * existingEmployee.rate;
      } else {
        projectBilling[entry.project_id].employeeDetails.push({ name: emp.name, hours, rate, total: hours * rate });
      }

      projectBilling[entry.project_id].totalHours += hours;
      projectBilling[entry.project_id].totalAmount += hours * rate;
    });

    return Object.entries(projectBilling).sort((a, b) => b[1].totalAmount - a[1].totalAmount);
  }, [timeEntries, projects, clients, employees]);

  const billingByClient = useMemo(() => {
    const clientBilling: Record<string, {
      clientName: string;
      projects: { name: string; hours: number; amount: number }[];
      totalHours: number; totalAmount: number;
    }> = {};

    billingByProject.forEach(([, projectData]) => {
      const client = clients.find(c => c.name === projectData.clientName);
      const clientId = client?.id || 'unknown';

      if (!clientBilling[clientId]) {
        clientBilling[clientId] = { clientName: projectData.clientName, projects: [], totalHours: 0, totalAmount: 0 };
      }

      clientBilling[clientId].projects.push({ name: projectData.projectName, hours: projectData.totalHours, amount: projectData.totalAmount });
      clientBilling[clientId].totalHours += projectData.totalHours;
      clientBilling[clientId].totalAmount += projectData.totalAmount;
    });

    return Object.entries(clientBilling).sort((a, b) => b[1].totalAmount - a[1].totalAmount);
  }, [billingByProject, clients]);

  const totals = useMemo(() => {
    return billingByProject.reduce((acc, [, data]) => ({ hours: acc.hours + data.totalHours, amount: acc.amount + data.totalAmount }), { hours: 0, amount: 0 });
  }, [billingByProject]);

  const navigateMonth = (direction: 'prev' | 'next') => {
    setSelectedDate(prev => (direction === 'prev' ? subMonths(prev, 1) : addMonths(prev, 1)));
  };

  if (isLoading) {
    return (<div className="flex items-center justify-center h-64"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Billing</h1>
          <p className="text-muted-foreground">Billing summary by project and client</p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Button variant="outline" size="icon" onClick={() => navigateMonth('prev')}><ChevronLeft className="h-4 w-4" /></Button>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className="gap-2 min-w-[180px]">
              <CalendarIcon className="h-4 w-4" />
              {format(selectedDate, 'MMMM yyyy')}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar mode="single" selected={selectedDate} onSelect={(date) => date && setSelectedDate(date)} initialFocus className="pointer-events-auto" />
          </PopoverContent>
        </Popover>
        <Button variant="outline" size="icon" onClick={() => navigateMonth('next')}><ChevronRight className="h-4 w-4" /></Button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="stat-card"><CardContent className="p-6"><div className="flex items-center gap-4"><div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10"><DollarSign className="h-6 w-6 text-primary" /></div><div><p className="text-sm text-muted-foreground">Total Billed</p><p className="text-2xl font-bold text-foreground">${totals.amount.toLocaleString()}</p></div></div></CardContent></Card>
        <Card className="stat-card"><CardContent className="p-6"><div className="flex items-center gap-4"><div className="flex h-12 w-12 items-center justify-center rounded-xl bg-success/10"><FileText className="h-6 w-6 text-success" /></div><div><p className="text-sm text-muted-foreground">Total Hours</p><p className="text-2xl font-bold text-foreground">{totals.hours}h</p></div></div></CardContent></Card>
        <Card className="stat-card"><CardContent className="p-6"><div className="flex items-center gap-4"><div className="flex h-12 w-12 items-center justify-center rounded-xl bg-warning/10"><Users className="h-6 w-6 text-warning" /></div><div><p className="text-sm text-muted-foreground">Active Clients</p><p className="text-2xl font-bold text-foreground">{billingByClient.length}</p></div></div></CardContent></Card>
      </div>

      <Tabs defaultValue="projects" className="space-y-4">
        <TabsList>
          <TabsTrigger value="projects" className="gap-2"><Briefcase className="h-4 w-4" />By Project</TabsTrigger>
          <TabsTrigger value="clients" className="gap-2"><Users className="h-4 w-4" />By Client</TabsTrigger>
        </TabsList>

        <TabsContent value="projects" className="space-y-4">
          {billingByProject.map(([projectId, data]) => (
            <Card key={projectId} className="card-elevated">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10"><Briefcase className="h-5 w-5 text-primary" /></div>
                    <div><CardTitle className="text-lg">{data.projectName}</CardTitle><p className="text-sm text-muted-foreground">{data.clientName}</p></div>
                  </div>
                  <div className="text-right"><p className="text-2xl font-bold text-primary">${data.totalAmount.toLocaleString()}</p><p className="text-sm text-muted-foreground">{data.totalHours}h total</p></div>
                </div>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader><TableRow><TableHead className="table-header">Employee</TableHead><TableHead className="table-header text-right">Hours</TableHead><TableHead className="table-header text-right">Rate</TableHead><TableHead className="table-header text-right">Total</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {data.employeeDetails.map(employee => (
                      <TableRow key={employee.name}>
                        <TableCell className="font-medium">{employee.name}</TableCell>
                        <TableCell className="text-right">{employee.hours}h</TableCell>
                        <TableCell className="text-right">${employee.rate}/h</TableCell>
                        <TableCell className="text-right font-semibold text-primary">${employee.total.toLocaleString()}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          ))}
          {billingByProject.length === 0 && (<div className="text-center py-12"><Briefcase className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" /><p className="text-muted-foreground">No billing data for this month</p></div>)}
        </TabsContent>

        <TabsContent value="clients" className="space-y-4">
          {billingByClient.map(([clientId, data]) => (
            <Card key={clientId} className="card-elevated">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10"><Users className="h-5 w-5 text-primary" /></div>
                    <div><CardTitle className="text-lg">{data.clientName}</CardTitle><p className="text-sm text-muted-foreground">{data.projects.length} projects</p></div>
                  </div>
                  <div className="text-right"><p className="text-2xl font-bold text-primary">${data.totalAmount.toLocaleString()}</p><p className="text-sm text-muted-foreground">{data.totalHours}h total</p></div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {data.projects.map(project => (
                    <div key={project.name} className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                      <div className="flex items-center gap-2"><Briefcase className="h-4 w-4 text-muted-foreground" /><span className="font-medium">{project.name}</span></div>
                      <div className="flex items-center gap-4"><Badge variant="outline">{project.hours}h</Badge><span className="font-semibold text-primary">${project.amount.toLocaleString()}</span></div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
          {billingByClient.length === 0 && (<div className="text-center py-12"><Users className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" /><p className="text-muted-foreground">No billing data for this month</p></div>)}
        </TabsContent>
      </Tabs>
    </div>
  );
}
