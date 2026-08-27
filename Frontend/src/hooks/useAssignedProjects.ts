import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { EmployeeProject, EmployeeProjectWithDetails, StaffingAssignment } from '@/types';

export function useAssignedProjects(userId?: string) {
  return useQuery({
    queryKey: ['assigned-projects', userId],
    queryFn: () => {
      const url = userId ? `/employee-projects?user_id=${userId}` : '/employee-projects';
      return api.get<EmployeeProject[]>(url);
    },
  });
}

export function useAssignedProjectsWithDetails(userId: string | undefined) {
  return useQuery({
    queryKey: ['assigned-projects', 'details', userId],
    queryFn: () => api.get<EmployeeProjectWithDetails[]>(`/employee-projects/${userId}/details`),
    enabled: !!userId,
  });
}

export function useBulkAssignProjects() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, assignments }: { userId: string; assignments: { project_id: string }[] }) =>
      api.put<EmployeeProject[]>(`/employee-projects/${userId}/bulk`, { assignments }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assigned-projects'] });
    },
  });
}

// ── Staffing panel: every assignment, across every employee ────────────────

export function useStaffing() {
  return useQuery({
    queryKey: ['staffing'],
    queryFn: () => api.get<StaffingAssignment[]>('/employee-projects/staffing'),
  });
}

type AssignmentPayload = {
  user_id: string;
  project_id: string;
  role_id?: string | null;
  allocation_percentage?: number | null;
  project_start_date?: string | null;
  project_end_date?: string | null;
};

function invalidateStaffing(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: ['staffing'] });
  queryClient.invalidateQueries({ queryKey: ['assigned-projects'] });
  // The project's own start/end dates may have been written through — keep
  // the Projects panel in sync too.
  queryClient.invalidateQueries({ queryKey: ['projects'] });
}

export function useCreateAssignment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: AssignmentPayload) => api.post<EmployeeProject>('/employee-projects', payload),
    onSuccess: () => invalidateStaffing(queryClient),
  });
}

export function useUpdateAssignment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...updates }: { id: string } & Omit<AssignmentPayload, 'user_id' | 'project_id'>) =>
      api.put<EmployeeProject>(`/employee-projects/${id}`, updates),
    onSuccess: () => invalidateStaffing(queryClient),
  });
}

export function useDeleteAssignment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<void>(`/employee-projects/${id}`),
    onSuccess: () => invalidateStaffing(queryClient),
  });
}
