import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { TimeEntryDelegate } from '@/types';

/** Admin-only: everyone a given employee is delegated for, or delegated by —
 * pass whichever side you're viewing from (an employee's profile page shows
 * delegations where they're the delegate). */
export function useTimeEntryDelegates(delegateUserId: string | undefined) {
  return useQuery({
    queryKey: ['time-entry-delegates', 'delegate', delegateUserId],
    queryFn: () => api.get<TimeEntryDelegate[]>(`/time-entry-delegates/?delegate_user_id=${delegateUserId}`),
    enabled: !!delegateUserId,
  });
}

/** Any authenticated employee: who am I currently delegated to also log time
 * for? Drives the "log hours for..." switcher on the Timesheet page — empty
 * for almost everyone. */
export function useMyTimeEntryDelegateTargets() {
  return useQuery({
    queryKey: ['time-entry-delegates', 'me', 'targets'],
    queryFn: () => api.get<{ id: string; name: string }[]>('/time-entry-delegates/me/targets'),
  });
}

export function useGrantTimeEntryDelegate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { delegate_user_id: string; target_user_id: string }) =>
      api.post<TimeEntryDelegate>('/time-entry-delegates/', body),
    onSuccess: (_data, { delegate_user_id }) => {
      queryClient.invalidateQueries({ queryKey: ['time-entry-delegates', 'delegate', delegate_user_id] });
    },
  });
}

export function useRevokeTimeEntryDelegate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: { id: string; delegateUserId: string }) => api.delete<void>(`/time-entry-delegates/${id}`),
    onSuccess: (_data, { delegateUserId }) => {
      queryClient.invalidateQueries({ queryKey: ['time-entry-delegates', 'delegate', delegateUserId] });
    },
  });
}
