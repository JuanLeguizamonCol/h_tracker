import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { PerformanceReview, PerformanceReviewPatch, PerformanceReviewStatus, ReviewTemplate } from '@/types';

export const REVIEW_STATUS_BADGE: Record<PerformanceReviewStatus, { label: string; className: string }> = {
  self_assessment: { label: 'Self-assessment', className: 'bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300' },
  in_review: { label: 'In review', className: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300' },
  completed: { label: 'Completed', className: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300' },
};

export function useReviewTemplate() {
  return useQuery({
    queryKey: ['performance-reviews', 'template'],
    queryFn: () => api.get<ReviewTemplate>('/performance-reviews/template'),
    staleTime: Infinity,
  });
}

export function usePerformanceReviews(options?: { projectId?: string; employeeId?: string; status?: string }) {
  const params = new URLSearchParams();
  if (options?.projectId) params.set('project_id', options.projectId);
  if (options?.employeeId) params.set('employee_id', options.employeeId);
  if (options?.status) params.set('status_filter', options.status);
  const qs = params.toString();
  return useQuery({
    queryKey: ['performance-reviews', 'list', options?.projectId ?? '', options?.employeeId ?? '', options?.status ?? ''],
    queryFn: () => api.get<PerformanceReview[]>(`/performance-reviews/${qs ? `?${qs}` : ''}`),
  });
}

export function usePerformanceReview(id: string | undefined) {
  return useQuery({
    queryKey: ['performance-reviews', 'detail', id],
    queryFn: () => api.get<PerformanceReview>(`/performance-reviews/${id}`),
    enabled: !!id,
  });
}

/** Hours the employee logged on the project (optionally within a period) — prefills "Duration". */
export function useReviewLoggedHours(params: { projectId?: string; employeeId?: string; periodStart?: string; periodEnd?: string; enabled?: boolean }) {
  const qs = new URLSearchParams();
  if (params.projectId) qs.set('project_id', params.projectId);
  if (params.employeeId) qs.set('employee_id', params.employeeId);
  if (params.periodStart) qs.set('period_start', params.periodStart);
  if (params.periodEnd) qs.set('period_end', params.periodEnd);
  return useQuery({
    queryKey: ['performance-reviews', 'logged-hours', params.projectId, params.employeeId, params.periodStart ?? '', params.periodEnd ?? ''],
    queryFn: () => api.get<{ hours: number }>(`/performance-reviews/logged-hours?${qs.toString()}`),
    enabled: (params.enabled ?? true) && !!params.projectId && !!params.employeeId,
  });
}

export function useCreatePerformanceReview() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      project_id: string; employee_id: string; reviewer_id?: string | null; review_date: string;
      period_start?: string | null; period_end?: string | null; duration_hours?: number | null;
    }) => api.post<PerformanceReview>('/performance-reviews/', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['performance-reviews', 'list'] });
    },
  });
}

export function useUpdatePerformanceReview() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: PerformanceReviewPatch }) =>
      api.patch<PerformanceReview>(`/performance-reviews/${id}`, data),
    onSuccess: (review) => {
      queryClient.setQueryData(['performance-reviews', 'detail', review.id], review);
      queryClient.invalidateQueries({ queryKey: ['performance-reviews', 'list'] });
    },
  });
}

export function useTransitionPerformanceReview() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'submit_self' | 'complete' | 'reopen' }) =>
      api.post<PerformanceReview>(`/performance-reviews/${id}/transition`, { action }),
    onSuccess: (review) => {
      queryClient.setQueryData(['performance-reviews', 'detail', review.id], review);
      queryClient.invalidateQueries({ queryKey: ['performance-reviews', 'list'] });
    },
  });
}

export function useDeletePerformanceReview() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<void>(`/performance-reviews/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['performance-reviews', 'list'] });
    },
  });
}

export function reviewExportFilename(review: PerformanceReview): string {
  const who = review.client_name || review.project_name;
  const year = review.review_date.slice(0, 4);
  return `${who} - ${review.employee_name} - ${year}.xlsx`.replace(/[\\/:*?"<>|]/g, '');
}

export function downloadReviewXlsx(review: PerformanceReview) {
  return api.download(`/performance-reviews/${review.id}/export/xlsx`, reviewExportFilename(review));
}
