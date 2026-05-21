import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { TimeEntry } from '@/types';
import { format } from 'date-fns';

export function useTimeEntriesByWeek(weekStart: Date, userId?: string) {
  const ws = format(weekStart, 'yyyy-MM-dd');
  const we = format(new Date(weekStart.getTime() + 6 * 24 * 60 * 60 * 1000), 'yyyy-MM-dd');

  return useQuery({
    queryKey: ['time-entries', 'week', ws, userId],
    queryFn: () => {
      let url = `/time-entries?date_gte=${ws}&date_lte=${we}`;
      if (userId) url += `&user_id=${userId}`;
      return api.get<TimeEntry[]>(url);
    },
  });
}

export function useTimeEntriesByDateRange(
  startDate: Date,
  endDate: Date,
  userId?: string,
  projectId?: string,
) {
  const gte = format(startDate, 'yyyy-MM-dd');
  const lte = format(endDate, 'yyyy-MM-dd');

  return useQuery({
    queryKey: ['time-entries', 'range', gte, lte, userId ?? null, projectId ?? null],
    queryFn: () => {
      let url = `/time-entries?date_gte=${gte}&date_lte=${lte}`;
      if (userId) url += `&user_id=${userId}`;
      if (projectId) url += `&project_id=${projectId}`;
      return api.get<TimeEntry[]>(url);
    },
  });
}

export function useAllTimeEntriesByDateRange(startDate: Date, endDate: Date) {
  const gte = format(startDate, 'yyyy-MM-dd');
  const lte = format(endDate, 'yyyy-MM-dd');

  return useQuery({
    queryKey: ['time-entries', 'range-all', gte, lte],
    queryFn: () => api.get<TimeEntry[]>(`/time-entries?date_gte=${gte}&date_lte=${lte}`),
  });
}

export function useCreateTimeEntry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (entry: Omit<TimeEntry, 'id' | 'created_at'>) =>
      api.post<TimeEntry>('/time-entries', entry),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['time-entries'] });
    },
  });
}

export function useUpdateTimeEntry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Partial<TimeEntry> }) =>
      api.put<TimeEntry>(`/time-entries/${id}`, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['time-entries'] });
    },
  });
}

export function useDeleteTimeEntry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<void>(`/time-entries/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['time-entries'] });
    },
  });
}
