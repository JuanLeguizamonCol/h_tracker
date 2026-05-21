import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Employee, EmployeeSkill } from '@/types';

export function useProfile() {
  return useQuery({
    queryKey: ['profile'],
    queryFn: () => api.get<Employee>('/profile'),
  });
}

export function usePatchProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (patch: Partial<Employee>) => api.patch<Employee>('/profile', patch),
    onSuccess: (updated) => {
      queryClient.setQueryData(['profile'], updated);
      queryClient.invalidateQueries({ queryKey: ['employees', 'me'] });
    },
  });
}

export function useMySkills() {
  return useQuery({
    queryKey: ['profile', 'skills'],
    queryFn: () => api.get<EmployeeSkill[]>('/profile/skills'),
  });
}

export function useAddSkill() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (skill: Omit<EmployeeSkill, 'id' | 'employee_id' | 'created_at'>) =>
      api.post<EmployeeSkill>('/profile/skills', skill),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['profile', 'skills'] }),
  });
}

export function useUpdateSkill() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...patch }: Partial<EmployeeSkill> & { id: string }) =>
      api.patch<EmployeeSkill>(`/profile/skills/${id}`, patch),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['profile', 'skills'] }),
  });
}

export function useDeleteSkill() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (skillId: string) => api.delete(`/profile/skills/${skillId}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['profile', 'skills'] }),
  });
}
