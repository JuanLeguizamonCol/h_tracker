import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { SkillCatalog, EmployeeSkill } from '@/types';

export function useSkillCatalog(search?: string) {
  return useQuery({
    queryKey: ['skill-catalog', search ?? ''],
    queryFn: () =>
      api.get<SkillCatalog[]>(
        `/skill-catalog${search ? `?search=${encodeURIComponent(search)}` : ''}`
      ),
  });
}

export function useEmployeeSkills(employeeId: string | undefined) {
  return useQuery({
    queryKey: ['employee-skills', employeeId],
    queryFn: () => api.get<EmployeeSkill[]>(`/employees/${employeeId}/skills`),
    enabled: !!employeeId,
  });
}

export function useCreateEmployeeSkill(employeeId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (skill: Omit<EmployeeSkill, 'id' | 'employee_id' | 'created_at'>) =>
      api.post<EmployeeSkill>(`/employees/${employeeId}/skills`, skill),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employee-skills', employeeId] });
    },
  });
}

export function useUpdateEmployeeSkill(employeeId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Partial<EmployeeSkill> }) =>
      api.patch<EmployeeSkill>(`/employees/${employeeId}/skills/${id}`, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employee-skills', employeeId] });
    },
  });
}

export function useDeleteEmployeeSkill(employeeId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (skillId: string) =>
      api.delete<void>(`/employees/${employeeId}/skills/${skillId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employee-skills', employeeId] });
    },
  });
}
