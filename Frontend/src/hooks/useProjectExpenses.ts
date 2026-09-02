import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { ProjectExpense } from '@/types';

export function useProjectExpenses(projectId?: string, userId?: string) {
  return useQuery({
    queryKey: ['project-expenses', projectId ?? null, userId ?? null],
    queryFn: () => {
      const params = new URLSearchParams();
      if (projectId) params.set('project_id', projectId);
      if (userId) params.set('user_id', userId);
      const qs = params.toString();
      return api.get<ProjectExpense[]>(`/project-expenses${qs ? `?${qs}` : ''}`);
    },
  });
}

type CreateProjectExpensePayload = {
  project_id: string;
  user_id: string;
  date: string;
  category: string;
  amount_usd: number;
  description?: string | null;
};

export function useCreateProjectExpense() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateProjectExpensePayload) =>
      api.post<ProjectExpense>('/project-expenses', payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project-expenses'] });
    },
  });
}

export function useDeleteProjectExpense() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<void>(`/project-expenses/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project-expenses'] });
    },
  });
}
