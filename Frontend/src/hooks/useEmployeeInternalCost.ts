import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { EmployeeInternalCost } from '@/types';

export function useEmployeeInternalCost(employeeId: string | undefined) {
  return useQuery({
    queryKey: ['employee-internal-cost', employeeId],
    queryFn: () => api.get<EmployeeInternalCost>(`/employees/${employeeId}/internal-cost`),
    enabled: !!employeeId,
    retry: false,
  });
}

export function useEmployeeInternalCostHistory(employeeId: string | undefined) {
  return useQuery({
    queryKey: ['employee-internal-cost-history', employeeId],
    queryFn: () => api.get<EmployeeInternalCost[]>(`/employees/${employeeId}/internal-cost/history`),
    enabled: !!employeeId,
    retry: false,
  });
}

export function useUpsertInternalCost(employeeId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<EmployeeInternalCost>) =>
      api.post<EmployeeInternalCost>(`/employees/${employeeId}/internal-cost`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employee-internal-cost', employeeId] });
      queryClient.invalidateQueries({ queryKey: ['employee-internal-cost-history', employeeId] });
    },
  });
}
