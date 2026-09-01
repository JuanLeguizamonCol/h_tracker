import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { UserCircle, Search, MoreHorizontal, Edit, Shield, Loader2, FolderKanban, UserPlus, Eye, Lock } from 'lucide-react';
import { useEmployees, useCreateEmployee } from '@/hooks/useEmployees';
import { useAssignedProjects } from '@/hooks/useAssignedProjects';
import { useAuth } from '@/contexts/AuthContext';
import { AppRole, Employee } from '@/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Tooltip, TooltipContent, TooltipTrigger,
} from '@/components/ui/tooltip';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

const PROTECTED_EMAIL = 'jleguizamon@impactpoint.com';

function useEmployeeRoles() {
  return useQuery({
    queryKey: ['user-roles'],
    queryFn: () => api.get<{ id: string; user_id: string; role: AppRole }[]>('/user-roles'),
  });
}

function useUpdateRole() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, newRole }: { userId: string; newRole: AppRole }) =>
      api.put(`/user-roles/${userId}`, { role: newRole }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-roles'] });
    },
  });
}

// ── Role cell — 3-way picker (Employee / Manager / Admin) ────────────────────

const ROLE_LABELS: Record<AppRole, string> = { admin: 'Admin', manager: 'Manager', employee: 'Employee' };
const ROLE_BADGE_VARIANT: Record<AppRole, 'default' | 'secondary' | 'outline'> = {
  admin: 'default', manager: 'secondary', employee: 'outline',
};

interface RoleCellProps {
  emp: Employee;
  role: AppRole;
  /** Only true Admins can assign roles (incl. Manager) — Managers can view this
   * page (they have admin-level access to everything except Invoices) but the
   * backend rejects role changes from anyone but an admin, so the picker is
   * hidden rather than shown-then-rejected. */
  canEditRole: boolean;
  isCurrentUser: boolean;
  isProtected: boolean;
  isLastAdmin: boolean;
  onRequestChange: (emp: Employee, currentRole: AppRole, newRole: AppRole) => void;
}

function RoleCell({ emp, role, canEditRole, isCurrentUser, isProtected, isLastAdmin, onRequestChange }: RoleCellProps) {
  const isLocked = !canEditRole || isCurrentUser || isProtected || (role === 'admin' && isLastAdmin);

  const badge = (
    <Badge variant={ROLE_BADGE_VARIANT[role]} className="gap-1 select-none">
      {isProtected ? <Lock className="h-3 w-3" /> : <Shield className="h-3 w-3" />}
      {ROLE_LABELS[role]}
    </Badge>
  );

  if (isLocked) {
    return (
      <div className="flex items-center gap-1.5">
        {badge}
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex items-center justify-center h-6 w-6 rounded text-muted-foreground/40 cursor-default">
              <Shield className="h-3.5 w-3.5" />
            </span>
          </TooltipTrigger>
          <TooltipContent side="top">
            {!canEditRole
              ? 'Only admins can change roles'
              : isProtected
              ? 'Protected account — role cannot be changed'
              : isCurrentUser
              ? 'You cannot change your own role'
              : 'At least one admin is required'}
          </TooltipContent>
        </Tooltip>
      </div>
    );
  }

  return (
    <Select value={role} onValueChange={v => onRequestChange(emp, role, v as AppRole)}>
      <SelectTrigger className="h-7 w-[128px] text-xs">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="employee">Employee</SelectItem>
        <SelectItem value="manager">Manager</SelectItem>
        <SelectItem value="admin">Admin</SelectItem>
      </SelectContent>
    </Select>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function Employees() {
  const navigate = useNavigate();
  const { data: employees = [], isLoading } = useEmployees();
  const { data: allAssignments = [] } = useAssignedProjects();
  const { data: roles = [] } = useEmployeeRoles();
  const { employee: currentUser, isAdmin } = useAuth();
  const updateRole = useUpdateRole();
  const createEmployee = useCreateEmployee();

  const [searchTerm, setSearchTerm] = useState('');
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [quickName, setQuickName] = useState('');
  const [quickEmail, setQuickEmail] = useState('');
  const [quickError, setQuickError] = useState('');
  const [roleChangeTarget, setRoleChangeTarget] = useState<
    { emp: Employee; currentRole: AppRole; newRole: AppRole } | null
  >(null);

  const getRole = (employeeId: string): AppRole => roles.find(r => r.user_id === employeeId)?.role || 'employee';
  const adminCount = roles.filter(r => r.role === 'admin').length;

  const filteredEmployees = employees.filter(
    emp => emp.name.toLowerCase().includes(searchTerm.toLowerCase()) || emp.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getAssignedProjectsCount = (employeeId: string): number => allAssignments.filter(a => a.user_id === employeeId).length;

  const handleRequestRoleChange = (emp: Employee, currentRole: AppRole, newRole: AppRole) => {
    if (newRole === currentRole) return;
    setRoleChangeTarget({ emp, currentRole, newRole });
  };

  const handleRoleConfirm = async () => {
    if (!roleChangeTarget) return;
    const { emp, newRole } = roleChangeTarget;
    try {
      await updateRole.mutateAsync({ userId: emp.id, newRole });
      toast.success(`${emp.name} is now ${ROLE_LABELS[newRole]}.`);
    } catch {
      toast.error('Failed to update role. Please try again.');
    } finally {
      setRoleChangeTarget(null);
    }
  };

  const openQuickAdd = () => {
    setQuickName('');
    setQuickEmail('');
    setQuickError('');
    setQuickAddOpen(true);
  };

  const handleQuickAdd = async () => {
    const name = quickName.trim();
    const email = quickEmail.trim();
    if (!name) {
      setQuickError('Name is required.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setQuickError('Enter a valid corporate email.');
      return;
    }
    try {
      const created = await createEmployee.mutateAsync({ name, email });
      toast.success(`${created.name} was created. They can now sign in with their Microsoft account.`);
      setQuickAddOpen(false);
    } catch (err) {
      const msg =
        err instanceof Error && err.message.includes('409')
          ? 'An employee with that email already exists.'
          : 'Could not create the employee. Please try again.';
      setQuickError(msg);
    }
  };

  if (isLoading) {
    return (<div className="flex items-center justify-center h-64"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Employees</h1>
          <p className="text-muted-foreground">Manage team members, roles, and project assignments</p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="stat-card">
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10"><UserCircle className="h-6 w-6 text-primary" /></div>
              <div><p className="text-sm text-muted-foreground">Total Employees</p><p className="text-2xl font-bold text-foreground">{employees.length}</p></div>
            </div>
          </CardContent>
        </Card>
        <Card className="stat-card">
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-success/10"><UserCircle className="h-6 w-6 text-success" /></div>
              <div><p className="text-sm text-muted-foreground">Admins</p><p className="text-2xl font-bold text-foreground">{adminCount}</p></div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="card-elevated">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Team Members</CardTitle>
          <div className="flex items-center gap-2">
            <div className="relative w-64">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="Search employees..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-10" />
            </div>
            <Button size="sm" onClick={openQuickAdd}>
              <UserPlus className="h-4 w-4 mr-2" />New Employee
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="table-header">Employee</TableHead>
                <TableHead className="table-header">Email</TableHead>
                <TableHead className="table-header">App Role</TableHead>
                <TableHead className="table-header">Projects</TableHead>
                <TableHead className="table-header text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredEmployees.map(emp => {
                const role = getRole(emp.id);
                const isCurrentUser = emp.id === currentUser?.id;
                const isProtected = emp.email.toLowerCase() === PROTECTED_EMAIL;
                const isLastAdmin = role === 'admin' && adminCount <= 1;

                return (
                  <TableRow
                    key={emp.id}
                    className="cursor-pointer"
                    onClick={() => navigate(`/employees/${emp.id}`)}
                  >
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10"><UserCircle className="h-5 w-5 text-primary" /></div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{emp.name}</span>
                          </div>
                          {emp.title && <p className="text-xs text-muted-foreground">{emp.title}</p>}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{emp.email}</TableCell>
                    <TableCell onClick={e => e.stopPropagation()}>
                      <RoleCell
                        emp={emp}
                        role={role}
                        canEditRole={isAdmin}
                        isCurrentUser={isCurrentUser}
                        isProtected={isProtected}
                        isLastAdmin={isLastAdmin}
                        onRequestChange={handleRequestRoleChange}
                      />
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="gap-1"><FolderKanban className="h-3 w-3" />{getAssignedProjectsCount(emp.id)}</Badge>
                    </TableCell>
                    <TableCell className="text-right" onClick={e => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild><Button variant="ghost" size="icon"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => navigate(`/employees/${emp.id}`)}>
                            <Eye className="h-4 w-4 mr-2" />View Profile
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => navigate(`/employees/${emp.id}/edit`)}>
                            <Edit className="h-4 w-4 mr-2" />Edit
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          {filteredEmployees.length === 0 && (
            <div className="text-center py-12"><UserCircle className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" /><p className="text-muted-foreground">No employees found</p></div>
          )}
        </CardContent>
      </Card>

      {/* Quick Add Employee Dialog */}
      <Dialog open={quickAddOpen} onOpenChange={setQuickAddOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>New Employee</DialogTitle>
            <DialogDescription>
              Create an employee quickly with just a name and corporate email. They'll be able to
              sign in with their Microsoft account, and you can fill in the rest of the details later.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label htmlFor="quick-name">Full name</Label>
              <Input
                id="quick-name"
                value={quickName}
                onChange={e => { setQuickName(e.target.value); setQuickError(''); }}
                placeholder="John Smith"
                autoFocus
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="quick-email">Corporate email</Label>
              <Input
                id="quick-email"
                type="email"
                value={quickEmail}
                onChange={e => { setQuickEmail(e.target.value); setQuickError(''); }}
                onKeyDown={e => { if (e.key === 'Enter') handleQuickAdd(); }}
                placeholder="john@impactpoint.com"
                autoComplete="off"
              />
            </div>
            {quickError && <p className="text-xs text-destructive">{quickError}</p>}
          </div>
          <DialogFooter className="flex-col-reverse flex-wrap gap-2 sm:flex-row sm:justify-between">
            <Button
              variant="link"
              className="px-0 text-muted-foreground"
              onClick={() => { setQuickAddOpen(false); navigate('/employees/new'); }}
            >
              Add all details…
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setQuickAddOpen(false)}>Cancel</Button>
              <Button onClick={handleQuickAdd} disabled={createEmployee.isPending}>
                {createEmployee.isPending ? 'Creating…' : 'Create employee'}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Role Change Confirmation Dialog */}
      <Dialog open={!!roleChangeTarget} onOpenChange={open => { if (!open) setRoleChangeTarget(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Change Role</DialogTitle>
            <DialogDescription>
              Change <strong>{roleChangeTarget?.emp.name}</strong> from{' '}
              <strong>{roleChangeTarget ? ROLE_LABELS[roleChangeTarget.currentRole] : ''}</strong> to{' '}
              <strong>{roleChangeTarget ? ROLE_LABELS[roleChangeTarget.newRole] : ''}</strong>?
              {roleChangeTarget?.newRole === 'manager' && (
                <span className="block mt-2 text-xs text-muted-foreground">
                  Managers get admin-level access to everything except Invoices.
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRoleChangeTarget(null)}>Cancel</Button>
            <Button onClick={handleRoleConfirm} disabled={updateRole.isPending}>
              {updateRole.isPending ? 'Saving...' : 'Confirm'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
