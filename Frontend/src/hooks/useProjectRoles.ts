import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { ProjectRole } from '@/types';

export function useProjectRoles(projectId?: string) {
  return useQuery({
    queryKey: ['project-roles', projectId],
    enabled: !!projectId,
    queryFn: () => api.get<ProjectRole[]>(`/project-roles?project_id=${projectId}`),
  });
}

export function useAllProjectRoles() {
  return useQuery({
    queryKey: ['project-roles', 'all'],
    queryFn: () => api.get<ProjectRole[]>('/project-roles'),
  });
}

export function useCreateProjectRole() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (role: { project_id: string; name: string; hourly_rate_usd: number }) =>
      api.post<ProjectRole>('/project-roles', role),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project-roles'] });
    },
  });
}

export function useUpdateProjectRole() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Partial<ProjectRole> }) =>
      api.put<ProjectRole>(`/project-roles/${id}`, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project-roles'] });
    },
  });
}

export function useDeleteProjectRole() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<void>(`/project-roles/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project-roles'] });
    },
  });
}
