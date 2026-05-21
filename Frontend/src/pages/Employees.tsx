import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { UserCircle, Search, MoreHorizontal, Edit, Shield, Loader2, FolderKanban, UserPlus, Eye, KeyRound, AlertTriangle, Lock } from 'lucide-react';
import { useEmployees } from '@/hooks/useEmployees';
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
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Tooltip, TooltipContent, TooltipTrigger,
} from '@/components/ui/tooltip';
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

function useAdminResetPassword() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ employeeId, temporaryPassword }: { employeeId: string; temporaryPassword: string }) =>
      api.post(`/auth/admin-reset-password/${employeeId}`, { temporary_password: temporaryPassword }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employees'] });
    },
  });
}

// ── Role cell with clickable toggle icon ─────────────────────────────────────

interface RoleCellProps {
  emp: Employee;
  role: AppRole;
  isCurrentUser: boolean;
  isProtected: boolean;
  isLastAdmin: boolean;
  onRequestChange: (emp: Employee) => void;
}

function RoleCell({ emp, role, isCurrentUser, isProtected, isLastAdmin, onRequestChange }: RoleCellProps) {
  const isLocked = isCurrentUser || isProtected || (role === 'admin' && isLastAdmin);

  const badge = (
    <Badge variant={role === 'admin' ? 'default' : 'outline'} className="gap-1 select-none">
      {isProtected ? <Lock className="h-3 w-3" /> : <Shield className="h-3 w-3" />}
      {role === 'admin' ? 'Admin' : 'Employee'}
    </Badge>
  );

  const toggleBtn = isLocked ? (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex items-center justify-center h-6 w-6 rounded text-muted-foreground/40 cursor-default">
          <Shield className="h-3.5 w-3.5" />
        </span>
      </TooltipTrigger>
      <TooltipContent side="top">
        {isProtected
          ? 'Protected account — role cannot be changed'
          : isCurrentUser
          ? 'You cannot change your own role'
          : 'At least one admin is required'}
      </TooltipContent>
    </Tooltip>
  ) : (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          className="inline-flex items-center justify-center h-6 w-6 rounded text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
          onClick={e => { e.stopPropagation(); onRequestChange(emp); }}
          aria-label={`Change role for ${emp.name}`}
        >
          <Shield className="h-3.5 w-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="top">
        Change to {role === 'admin' ? 'Employee' : 'Admin'}
      </TooltipContent>
    </Tooltip>
  );

  return (
    <div className="flex items-center gap-1.5">
      {badge}
      {toggleBtn}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function Employees() {
  const navigate = useNavigate();
  const { data: employees = [], isLoading } = useEmployees();
  const { data: allAssignments = [] } = useAssignedProjects();
  const { data: roles = [] } = useEmployeeRoles();
  const { employee: currentUser } = useAuth();
  const updateRole = useUpdateRole();
  const resetPassword = useAdminResetPassword();

  const [searchTerm, setSearchTerm] = useState('');
  const [roleChangeTarget, setRoleChangeTarget] = useState<Employee | null>(null);
  const [isResetPasswordDialogOpen, setIsResetPasswordDialogOpen] = useState(false);
  const [resetTarget, setResetTarget] = useState<Employee | null>(null);
  const [temporaryPassword, setTemporaryPassword] = useState('');
  const [resetPasswordError, setResetPasswordError] = useState('');

  const getRole = (employeeId: string): AppRole => roles.find(r => r.user_id === employeeId)?.role || 'employee';
  const adminCount = roles.filter(r => r.role === 'admin').length;

  const filteredEmployees = employees.filter(
    emp => emp.name.toLowerCase().includes(searchTerm.toLowerCase()) || emp.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getAssignedProjectsCount = (employeeId: string): number => allAssignments.filter(a => a.user_id === employeeId).length;

  const handleRequestRoleChange = (emp: Employee) => {
    setRoleChangeTarget(emp);
  };

  const handleRoleConfirm = async () => {
    if (!roleChangeTarget) return;
    const currentRole = getRole(roleChangeTarget.id);
    const newRole: AppRole = currentRole === 'admin' ? 'employee' : 'admin';
    try {
      await updateRole.mutateAsync({ userId: roleChangeTarget.id, newRole });
      toast.success(`${roleChangeTarget.name} is now ${newRole === 'admin' ? 'an Admin' : 'an Employee'}.`);
    } catch {
      toast.error('Failed to update role. Please try again.');
    } finally {
      setRoleChangeTarget(null);
    }
  };

  const handleOpenResetPasswordDialog = (emp: Employee) => {
    setResetTarget(emp);
    setTemporaryPassword('');
    setResetPasswordError('');
    setIsResetPasswordDialogOpen(true);
  };

  const handleResetPassword = async () => {
    if (!resetTarget) return;
    if (temporaryPassword.length < 8) {
      setResetPasswordError('Password must be at least 8 characters.');
      return;
    }
    try {
      await resetPassword.mutateAsync({ employeeId: resetTarget.id, temporaryPassword });
      toast.success(`Password reset for ${resetTarget.name}. They will be prompted to change it on next login.`);
      setIsResetPasswordDialogOpen(false);
    } catch {
      toast.error('Failed to reset password. Please try again.');
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
            <Button size="sm" onClick={() => navigate('/employees/new')}>
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
                            {emp.must_change_password && (
                              <Badge variant="outline" className="gap-1 border-amber-400 text-amber-600 dark:text-amber-400 text-xs py-0">
                                <AlertTriangle className="h-3 w-3" />Password pending
                              </Badge>
                            )}
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
                          <DropdownMenuItem onClick={() => handleOpenResetPasswordDialog(emp)}>
                            <KeyRound className="h-4 w-4 mr-2" />Reset Password
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
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

      {/* Role Change Confirmation Dialog */}
      <Dialog open={!!roleChangeTarget} onOpenChange={open => { if (!open) setRoleChangeTarget(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Change Role</DialogTitle>
            <DialogDescription>
              Change <strong>{roleChangeTarget?.name}</strong> from{' '}
              <strong>{roleChangeTarget ? getRole(roleChangeTarget.id) === 'admin' ? 'Admin' : 'Employee' : ''}</strong> to{' '}
              <strong>{roleChangeTarget ? getRole(roleChangeTarget.id) === 'admin' ? 'Employee' : 'Admin' : ''}</strong>?
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

      {/* Reset Password Dialog */}
      <Dialog open={isResetPasswordDialogOpen} onOpenChange={setIsResetPasswordDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Reset Password</DialogTitle>
            <DialogDescription>
              Set a temporary password for <strong>{resetTarget?.name}</strong>. They will be required to change it on their next login.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="temp-password">Temporary Password</Label>
              <Input
                id="temp-password"
                type="text"
                value={temporaryPassword}
                onChange={e => { setTemporaryPassword(e.target.value); setResetPasswordError(''); }}
                placeholder="At least 8 characters"
              />
              {resetPasswordError && <p className="text-xs text-destructive">{resetPasswordError}</p>}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsResetPasswordDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleResetPassword} disabled={resetPassword.isPending}>
              {resetPassword.isPending ? 'Resetting...' : 'Reset Password'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
