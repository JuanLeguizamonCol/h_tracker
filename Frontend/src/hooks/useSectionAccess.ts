import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { SectionAccess, SectionAccessPatch } from '@/types';

/** The caller's own resolved access — used by AuthContext to drive the sidebar/route guards. */
export function useMySectionAccess() {
  return useQuery({
    queryKey: ['section-access', 'me'],
    queryFn: () => api.get<SectionAccess[]>('/section-access/me'),
  });
}

/** Admin-only: a specific employee's resolved access, for the Access tab. */
export function useEmployeeSectionAccess(employeeId: string | undefined) {
  return useQuery({
    queryKey: ['section-access', employeeId],
    queryFn: () => api.get<SectionAccess[]>(`/section-access/${employeeId}`),
    enabled: !!employeeId,
  });
}

export function useUpdateSectionAccess() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ employeeId, overrides }: { employeeId: string; overrides: SectionAccessPatch[] }) =>
      api.put<SectionAccess[]>(`/section-access/${employeeId}`, { overrides }),
    onSuccess: (_data, { employeeId }) => {
      queryClient.invalidateQueries({ queryKey: ['section-access', employeeId] });
    },
  });
}
