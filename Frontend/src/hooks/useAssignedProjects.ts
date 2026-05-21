import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { EmployeeProject, EmployeeProjectWithDetails } from '@/types';

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
