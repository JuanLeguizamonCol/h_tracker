import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { format, startOfWeek, endOfWeek } from 'date-fns';
import { Clock, TrendingUp, Briefcase, AlertTriangle, ArrowRight, Loader2, FileText, DollarSign } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useActiveProjects } from '@/hooks/useProjects';
import { useClients } from '@/hooks/useClients';
import { useTimeEntriesByWeek } from '@/hooks/useTimeEntries';
import { useAssignedProjectsWithDetails } from '@/hooks/useAssignedProjects';
import { useInvoices } from '@/hooks/useInvoices';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';

export default function Dashboard() {
  const navigate = useNavigate();
  const { employee, isAdmin } = useAuth();
  const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 });

  const { data: allProjects = [] } = useActiveProjects();
  const { data: clients = [] } = useClients();
  const { data: assignedProjects = [] } = useAssignedProjectsWithDetails(employee?.id);
  const { data: weekEntries = [], isLoading } = useTimeEntriesByWeek(weekStart, employee?.id);
  const { data: invoices = [] } = useInvoices();

  const stats = useMemo(() => {
    const billableHours = weekEntries.filter(e => e.billable).reduce((sum, e) => sum + Number(e.hours), 0);
    const nonBillableHours = weekEntries.filter(e => !e.billable).reduce((sum, e) => sum + Number(e.hours), 0);
    const totalHours = billableHours + nonBillableHours;
    const projectCount = isAdmin ? allProjects.length : assignedProjects.length;
    const draftInvoices = invoices.filter(i => i.status === 'draft').length;
    const unpaidTotal = invoices.filter(i => i.status === 'sent').reduce((sum, i) => sum + Number(i.total), 0);
    return { billableHours, nonBillableHours, totalHours, projectCount, draftInvoices, unpaidTotal };
  }, [weekEntries, allProjects, assignedProjects, invoices, isAdmin]);

  const projectBreakdown = useMemo(() => {
    const breakdown: Record<string, { name: string; hours: number; billable: number }> = {};
    weekEntries.forEach(entry => {
      if (!breakdown[entry.project_id]) {
        const proj = allProjects.find(p => p.id === entry.project_id);
        breakdown[entry.project_id] = { name: proj?.name || 'Unknown', hours: 0, billable: 0 };
      }
      breakdown[entry.project_id].hours += Number(entry.hours);
      if (entry.billable) breakdown[entry.project_id].billable += Number(entry.hours);
    });
    return Object.entries(breakdown).sort((a, b) => b[1].hours - a[1].hours);
  }, [weekEntries, allProjects]);

  const billablePercent = stats.totalHours > 0 ? Math.round((stats.billableHours / stats.totalHours) * 100) : 0;

  if (isLoading) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            Hey{employee ? `, ${employee.name.split(' ')[0]}` : ''}! 👋
          </h1>
          <p className="text-muted-foreground">
            Week of {format(weekStart, 'MMM d')} — {format(endOfWeek(new Date(), { weekStartsOn: 1 }), 'MMM d, yyyy')}
          </p>
        </div>
        <Button className="gap-2" onClick={() => navigate('/timesheet')}>
          <Clock className="h-4 w-4" />Log this week
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="stat-card">
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
                <Clock className="h-6 w-6 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Hours</p>
                <p className="text-2xl font-bold text-foreground">{stats.totalHours}h</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="stat-card">
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-success/10">
                <TrendingUp className="h-6 w-6 text-success" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Billable</p>
                <p className="text-2xl font-bold text-foreground">{stats.billableHours}h</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="stat-card">
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
                <Briefcase className="h-6 w-6 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Active Projects</p>
                <p className="text-2xl font-bold text-foreground">{stats.projectCount}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        {isAdmin && (
          <Card className="stat-card">
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-warning/10">
                  <DollarSign className="h-6 w-6 text-warning" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Unpaid</p>
                  <p className="text-2xl font-bold text-foreground">${stats.unpaidTotal.toLocaleString()}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Billable ratio */}
      <Card className="card-elevated">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Billable Ratio</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Billable: {stats.billableHours}h / Non-billable: {stats.nonBillableHours}h</span>
              <span className="font-semibold text-primary">{billablePercent}%</span>
            </div>
            <Progress value={billablePercent} className="h-3" />
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Project breakdown */}
        <Card className="card-elevated">
          <CardHeader>
            <CardTitle className="text-base">This Week by Project</CardTitle>
          </CardHeader>
          <CardContent>
            {projectBreakdown.length === 0 ? (
              <div className="text-center py-8">
                <Clock className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
                <p className="text-muted-foreground">No hours logged yet this week.</p>
                <Button variant="link" onClick={() => navigate('/')}>Start logging →</Button>
              </div>
            ) : (
              <div className="space-y-3">
                {projectBreakdown.map(([projectId, { name, hours, billable }]) => (
                  <div key={projectId} className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                    <div>
                      <p className="font-medium text-foreground">{name}</p>
                      <p className="text-xs text-muted-foreground">{billable}h billable · {hours - billable}h non-billable</p>
                    </div>
                    <span className="font-bold text-primary">{hours}h</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Admin alerts */}
        {isAdmin && (
          <Card className="card-elevated">
            <CardHeader>
              <CardTitle className="text-base">Admin Alerts</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {stats.draftInvoices > 0 && (
                  <div className="flex items-center gap-3 p-3 bg-warning/10 rounded-lg cursor-pointer hover:bg-warning/15 transition-colors" onClick={() => navigate('/invoices')}>
                    <FileText className="h-5 w-5 text-warning shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-foreground">{stats.draftInvoices} draft invoice{stats.draftInvoices > 1 ? 's' : ''}</p>
                      <p className="text-xs text-muted-foreground">Ready to review and send</p>
                    </div>
                    <ArrowRight className="h-4 w-4 text-muted-foreground ml-auto" />
                  </div>
                )}
                {stats.unpaidTotal > 0 && (
                  <div className="flex items-center gap-3 p-3 bg-primary/5 rounded-lg cursor-pointer hover:bg-primary/10 transition-colors" onClick={() => navigate('/invoices')}>
                    <DollarSign className="h-5 w-5 text-primary shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-foreground">${stats.unpaidTotal.toLocaleString()} outstanding</p>
                      <p className="text-xs text-muted-foreground">Sent invoices awaiting payment</p>
                    </div>
                    <ArrowRight className="h-4 w-4 text-muted-foreground ml-auto" />
                  </div>
                )}
                {stats.draftInvoices === 0 && stats.unpaidTotal === 0 && (
                  <div className="text-center py-6">
                    <p className="text-muted-foreground text-sm">All clear! No alerts right now. 🎉</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
