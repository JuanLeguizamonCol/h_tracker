import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { TimeEntryLockOverride } from '@/types';

/** Admin-only: an employee's lock-override history (most recent first). */
export function useTimeEntryLockOverrides(employeeId: string | undefined) {
  return useQuery({
    queryKey: ['time-entry-lock-overrides', employeeId],
    queryFn: () => api.get<TimeEntryLockOverride[]>(`/time-entry-lock-overrides/?employee_id=${employeeId}`),
    enabled: !!employeeId,
  });
}

/** Any authenticated employee: do THEY currently have an active lock
 * override? Used by the Weekly Log page to unlock closed-month cells for
 * themselves when an Admin has granted one — never exposes anyone else's. */
export function useMyLockOverrideStatus() {
  return useQuery({
    queryKey: ['time-entry-lock-overrides', 'me', 'active'],
    queryFn: () => api.get<{ is_active: boolean }>('/time-entry-lock-overrides/me/active'),
    // Only matters while someone is actively trying to log closed-month
    // hours, so poll gently rather than relying on a manual refresh.
    refetchInterval: 60_000,
  });
}

export function useGrantTimeEntryLockOverride() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (employeeId: string) =>
      api.post<TimeEntryLockOverride>('/time-entry-lock-overrides/', { employee_id: employeeId }),
    onSuccess: (_data, employeeId) => {
      queryClient.invalidateQueries({ queryKey: ['time-entry-lock-overrides', employeeId] });
    },
  });
}

export function useRevokeTimeEntryLockOverride() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: { id: string; employeeId: string }) => api.delete<void>(`/time-entry-lock-overrides/${id}`),
    onSuccess: (_data, { employeeId }) => {
      queryClient.invalidateQueries({ queryKey: ['time-entry-lock-overrides', employeeId] });
    },
  });
}
