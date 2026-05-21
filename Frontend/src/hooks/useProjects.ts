import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Project, ProjectCategory, ProjectAssignment, Employee } from '@/types';

export function useProjects() {
  return useQuery({
    queryKey: ['projects'],
    queryFn: () => api.get<Project[]>('/projects'),
  });
}

export function useActiveProjects() {
  return useQuery({
    queryKey: ['projects', 'active'],
    queryFn: () => api.get<Project[]>('/projects?active=true'),
  });
}

export function useProject(projectId: string | undefined) {
  return useQuery({
    queryKey: ['projects', projectId],
    queryFn: () => api.get<Project>(`/projects/${projectId}`),
    enabled: !!projectId,
  });
}

export function useProjectCategories(type?: string) {
  return useQuery({
    queryKey: ['project-categories', type],
    queryFn: () => api.get<ProjectCategory[]>(`/projects/categories${type ? `?type=${type}` : ''}`),
  });
}

export function useProjectAssignments(projectId: string | undefined) {
  return useQuery({
    queryKey: ['project-assignments', projectId],
    queryFn: () => api.get<ProjectAssignment[]>(`/projects/${projectId}/assignments`),
    enabled: !!projectId,
  });
}

export function useAdminEmployees() {
  return useQuery({
    queryKey: ['employees', 'admin'],
    queryFn: () => api.get<Employee[]>('/employees?user_role=admin'),
  });
}

export function useCreateProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (project: Partial<Project>) => api.post<Project>('/projects', project),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
    },
  });
}

export function useUpdateProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Partial<Project> }) =>
      api.put<Project>(`/projects/${id}`, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
    },
  });
}

export function usePatchProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Partial<Project> }) =>
      api.patch<Project>(`/projects/${id}`, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
    },
  });
}
