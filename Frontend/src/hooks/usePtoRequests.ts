import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { PtoRequest } from '@/types';

export function usePtoRequests(options?: { userId?: string; status?: string; enabled?: boolean }) {
  const params = new URLSearchParams();
  if (options?.userId) params.set('user_id', options.userId);
  if (options?.status) params.set('status_filter', options.status);
  const qs = params.toString();
  return useQuery({
    queryKey: ['pto-requests', options?.userId ?? 'me', options?.status ?? 'all'],
    queryFn: () => api.get<PtoRequest[]>(`/pto-requests/${qs ? `?${qs}` : ''}`),
    enabled: options?.enabled ?? true,
  });
}

export function useCreatePtoRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { category: string; start_date: string; end_date: string; hours: number; notes?: string | null }) =>
      api.post<PtoRequest>('/pto-requests/', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pto-requests'] });
    },
  });
}

export function useReviewPtoRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status, review_notes }: { id: string; status: 'approved' | 'rejected'; review_notes?: string | null }) =>
      api.patch<PtoRequest>(`/pto-requests/${id}/review`, { status, review_notes }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pto-requests'] });
    },
  });
}

export function useCancelPtoRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<void>(`/pto-requests/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pto-requests'] });
    },
  });
}
