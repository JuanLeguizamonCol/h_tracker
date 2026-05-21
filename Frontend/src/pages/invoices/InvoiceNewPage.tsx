import { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader2, AlertTriangle, Clock, CheckCircle } from 'lucide-react';
import { toast } from 'sonner';
import { useProjects } from '@/hooks/useProjects';
import { useEmployees } from '@/hooks/useEmployees';
import { useCreateInvoice, useCreateInvoiceLines, useLinkTimeEntries, useUpdateInvoice } from '@/hooks/useInvoices';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from '@/components/ui/breadcrumb';

type CheckResult = {
  has_entries: boolean;
  total_hours: number;
  total_amount: number;
  entry_count: number;
};

export default function InvoiceNewPage() {
  const navigate = useNavigate();
  const { data: projects = [] } = useProjects();
  const { data: employees = [] } = useEmployees();

  const createInvoice = useCreateInvoice();
  const createLines = useCreateInvoiceLines();
  const linkTimeEntries = useLinkTimeEntries();
  const updateInvoice = useUpdateInvoice();

  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [checkResult, setCheckResult] = useState<CheckResult | null>(null);

  const activeProjects = useMemo(
    () => projects.filter(p => p.is_active && !p.is_internal),
    [projects]
  );

  const selectedProject = useMemo(
    () => activeProjects.find(p => p.id === selectedProjectId),
    [activeProjects, selectedProjectId]
  );

  // Auto-check hours whenever project changes
  useEffect(() => {
    if (!selectedProjectId) {
      setCheckResult(null);
      return;
    }
    let cancelled = false;
    setIsChecking(true);
    setCheckResult(null);
    api.get<CheckResult>(`/invoices/check-hours?project_id=${selectedProjectId}`)
      .then(res => { if (!cancelled) setCheckResult(res); })
      .catch(() => { if (!cancelled) setCheckResult(null); })
      .finally(() => { if (!cancelled) setIsChecking(false); });
    return () => { cancelled = true; };
  }, [selectedProjectId]);

  const doCreateInvoice = async () => {
    setIsCreating(true);
    try {
      const invoice = await createInvoice.mutateAsync({ project_id: selectedProjectId });

      const linkedIds = new Set(await api.get<string[]>('/invoice-time-entries/linked-ids'));
      const entries = await api.get<{ id: string; user_id: string; hours: number; billable: boolean; status: string }[]>(
        `/time-entries?project_id=${selectedProjectId}&billable=true&status=normal`
      );
      const availableEntries = entries.filter(e => !linkedIds.has(e.id));

      if (availableEntries.length > 0) {
        const projectRoles = await api.get<{ id: string; name: string; hourly_rate_usd: number }[]>(
          `/project-roles?project_id=${selectedProjectId}`
        );
        const assignments = await api.get<{ user_id: string; role_id: string | null }[]>(
          `/employee-projects?project_id=${selectedProjectId}`
        );
        const assignmentMap = new Map(assignments.map(a => [a.user_id, a.role_id]));
        const rolesMap = new Map(projectRoles.map(r => [r.id, r]));

        const employeeHours: Record<string, { hours: number; userId: string; name: string; entryIds: string[] }> = {};
        availableEntries.forEach(entry => {
          const emp = employees.find(e => e.id === entry.user_id);
          if (!employeeHours[entry.user_id]) {
            employeeHours[entry.user_id] = { hours: 0, userId: entry.user_id, name: emp?.name || 'Unknown', entryIds: [] };
          }
          employeeHours[entry.user_id].hours += Number(entry.hours);
          employeeHours[entry.user_id].entryIds.push(entry.id);
        });

        const lineData = Object.values(employeeHours).map(eh => {
          const roleId = assignmentMap.get(eh.userId);
          const role = roleId ? rolesMap.get(roleId) : null;
          const rate = role ? Number(role.hourly_rate_usd) : 0;
          return {
            invoice_id: invoice.id,
            user_id: eh.userId,
            employee_name: eh.name,
            role_name: role?.name || null,
            hours: eh.hours,
            rate_snapshot: rate,
            amount: eh.hours * rate,
          };
        });

        await createLines.mutateAsync(lineData);
        const timeEntryIds = Object.values(employeeHours).flatMap(eh => eh.entryIds);
        await linkTimeEntries.mutateAsync({ invoice_id: invoice.id, time_entry_ids: timeEntryIds });
        const subtotalVal = lineData.reduce((sum, l) => sum + l.amount, 0);
        await updateInvoice.mutateAsync({ id: invoice.id, updates: { subtotal: subtotalVal, total: subtotalVal } });
      }

      toast.success('Invoice created.');
      navigate(`/invoices/${invoice.id}/edit`);
    } catch (err) {
      console.error('[Invoice Creation Error]', err);
      const msg = err instanceof Error ? err.message : String(err);
      // Map known API errors to friendly messages
      if (msg.includes('422') || msg.includes('Unprocessable')) {
        toast.error('Invalid data — check all required fields and try again.');
      } else if (msg.includes('401') || msg.includes('403')) {
        toast.error('Session expired — please sign in again.');
      } else if (msg.includes('already exists') || msg.includes('duplicate')) {
        toast.error('An invoice already exists for this project and period.');
      } else if (msg.includes('500') || msg.includes('Internal')) {
        toast.error('Server error — please check the logs or try again later.');
      } else {
        toast.error(`Invoice creation failed: ${msg}`);
      }
      setIsCreating(false);
    }
  };

  return (
    <div className="space-y-6 max-w-lg">
      {/* Breadcrumb */}
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink onClick={() => navigate('/invoices')} className="cursor-pointer">
              Invoices
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>New Invoice</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate('/invoices')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-2xl font-bold">New Invoice</h1>
      </div>

      {/* Project selector */}
      <Card>
        <CardHeader>
          <CardTitle>Select Project</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Project *</Label>
            <Select value={selectedProjectId} onValueChange={setSelectedProjectId}>
              <SelectTrigger>
                <SelectValue placeholder="Choose a project..." />
              </SelectTrigger>
              <SelectContent>
                {activeProjects.map(p => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Checking state */}
          {isChecking && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-1">
              <Loader2 className="h-4 w-4 animate-spin" />
              Checking available hours…
            </div>
          )}

          {/* Has hours — show summary + action */}
          {!isChecking && checkResult?.has_entries && (
            <div className="rounded-lg border border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950/40 p-4 space-y-3">
              <div className="flex items-center gap-2 text-green-700 dark:text-green-400">
                <CheckCircle className="h-4 w-4 flex-shrink-0" />
                <span className="font-medium text-sm">Billable hours found</span>
              </div>
              <div className="flex gap-6 text-sm">
                <div>
                  <p className="text-muted-foreground text-xs">Unlinked entries</p>
                  <p className="font-semibold">{checkResult.entry_count}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Total hours</p>
                  <p className="font-semibold">{checkResult.total_hours.toFixed(2)} h</p>
                </div>
              </div>
              <div className="flex gap-2 pt-1">
                <Button variant="outline" onClick={() => navigate('/invoices')} className="flex-1">
                  Cancel
                </Button>
                <Button onClick={doCreateInvoice} disabled={isCreating} className="flex-1">
                  {isCreating && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Create Invoice
                </Button>
              </div>
            </div>
          )}

          {/* No hours — inline warning */}
          {!isChecking && checkResult && !checkResult.has_entries && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/40 p-4 space-y-3">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-sm text-amber-800 dark:text-amber-300">
                    No hours logged for this project
                  </p>
                  <p className="text-sm text-amber-700 dark:text-amber-400 mt-1">
                    There are no billable hours recorded for{' '}
                    <span className="font-semibold">"{selectedProject?.name}"</span>{' '}
                    in the current period. Would you like to create a blank invoice and fill in the details manually?
                  </p>
                </div>
              </div>
              <div className="flex gap-2 pt-1">
                <Button
                  variant="outline"
                  onClick={() => navigate('/invoices')}
                  className="flex-1"
                >
                  Cancel
                </Button>
                <Button
                  onClick={() => navigate(`/invoices/new/manual?project_id=${selectedProjectId}`)}
                  className="flex-1"
                >
                  <Clock className="h-4 w-4 mr-2" />
                  Create Blank Invoice
                </Button>
              </div>
            </div>
          )}

          {/* Default actions when no project selected */}
          {!selectedProjectId && (
            <div className="flex justify-end pt-2">
              <Button variant="outline" onClick={() => navigate('/invoices')}>
                Cancel
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
