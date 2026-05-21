import { useState, useEffect } from 'react';
import { Loader2, FolderKanban } from 'lucide-react';
import { useActiveProjects } from '@/hooks/useProjects';
import { useClients } from '@/hooks/useClients';
import { useAssignedProjects, useBulkAssignProjects } from '@/hooks/useAssignedProjects';
import { Employee } from '@/types';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';

interface EmployeeProjectsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employee: Employee | null;
}

export function EmployeeProjectsDialog({ open, onOpenChange, employee }: EmployeeProjectsDialogProps) {
  const { data: projects = [], isLoading: projectsLoading } = useActiveProjects();
  const { data: clients = [] } = useClients();
  const { data: assignments = [], isLoading: assignmentsLoading } = useAssignedProjects();
  const bulkAssign = useBulkAssignProjects();

  const [selectedProjects, setSelectedProjects] = useState<string[]>([]);

  useEffect(() => {
    if (employee) {
      const assigned = assignments
        .filter(a => a.user_id === employee.id)
        .map(a => a.project_id);
      setSelectedProjects(assigned);
    }
  }, [employee, assignments]);

  const handleToggleProject = (projectId: string) => {
    setSelectedProjects(prev =>
      prev.includes(projectId) ? prev.filter(id => id !== projectId) : [...prev, projectId]
    );
  };

  const getClientName = (clientId: string) => {
    return clients.find(c => c.id === clientId)?.name || '';
  };

  const handleSave = async () => {
    if (!employee) return;

    try {
      const assignmentItems = selectedProjects.map(projectId => ({
        project_id: projectId,
      }));

      await bulkAssign.mutateAsync({
        userId: employee.id,
        assignments: assignmentItems,
      });
      toast.success("Saved — you're all set.");
      onOpenChange(false);
    } catch (error) {
      toast.error('Something went wrong. Please try again.');
      console.error(error);
    }
  };

  const isLoading = projectsLoading || assignmentsLoading;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FolderKanban className="h-5 w-5" />
            Assign Projects
          </DialogTitle>
          <DialogDescription>
            Select projects for {employee?.name}
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : (
          <div className="max-h-[300px] overflow-y-auto space-y-3 py-4">
            {projects.length === 0 ? (
              <p className="text-center text-muted-foreground py-4">
                No active projects available
              </p>
            ) : (
              projects.map(project => (
                <div
                  key={project.id}
                  className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors duration-150"
                >
                  <Checkbox
                    id={project.id}
                    checked={selectedProjects.includes(project.id)}
                    onCheckedChange={() => handleToggleProject(project.id)}
                  />
                  <Label htmlFor={project.id} className="flex-1 cursor-pointer">
                    <span className="font-medium">{project.name}</span>
                    <p className="text-xs text-muted-foreground">
                      {getClientName(project.client_id)}
                    </p>
                  </Label>
                </div>
              ))
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={bulkAssign.isPending}>
            {bulkAssign.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
