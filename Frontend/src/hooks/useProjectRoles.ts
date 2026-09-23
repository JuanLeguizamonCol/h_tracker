import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { ProjectRole, ProjectRoleName } from '@/types';

// Rates (hourly_rate_usd, additional_hours_rate) — Admin only, 403s for
// everyone else. For a non-admin-safe id/name lookup, use
// useProjectRoleNames / useAllProjectRoleNames below instead.
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

// Id/name only, no rate — open to any authenticated employee (see
// GET /project-roles/names). Use this to label a role (dropdowns, lookups)
// anywhere the viewer might not be an Admin.
export function useProjectRoleNames(projectId?: string) {
  return useQuery({
    queryKey: ['project-roles', 'names', projectId],
    enabled: !!projectId,
    queryFn: () => api.get<ProjectRoleName[]>(`/project-roles/names?project_id=${projectId}`),
  });
}

export function useAllProjectRoleNames() {
  return useQuery({
    queryKey: ['project-roles', 'names', 'all'],
    queryFn: () => api.get<ProjectRoleName[]>('/project-roles/names'),
  });
}

export function useCreateProjectRole() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (role: { project_id: string; name: string; hourly_rate_usd: number; min_hours_enabled?: boolean; min_hours?: number | null; min_hours_basis?: 'week' | 'month' | 'period'; additional_hours_enabled?: boolean; additional_hours_rate?: number | null }) =>
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
