import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import {
  PerformanceReview, PerformanceReviewPatch, PerformanceReviewStatus, ReviewTemplate, ReviewProject, ReviewTeamMember,
  ReviewAnalytics, EvaluationKey,
} from '@/types';

export const REVIEW_STATUS_BADGE: Record<PerformanceReviewStatus, { label: string; className: string }> = {
  self_assessment: { label: 'Self-assessment', className: 'bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300' },
  in_review: { label: 'Manager Review', className: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300' },
  completed: { label: 'Completed', className: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300' },
};

export const EVALUATION_META: Record<EvaluationKey, { label: string; short: string; who: string; dot: string; text: string; ring: string; activeTab: string }> = {
  self: {
    label: 'Self evaluation', short: 'Self', who: 'by the employee', dot: 'bg-sky-500', text: 'text-sky-700 dark:text-sky-400', ring: 'bg-sky-600 border-sky-600',
    activeTab: 'data-[state=active]:border-sky-600 dark:data-[state=active]:border-sky-400 data-[state=active]:text-sky-700 dark:data-[state=active]:text-sky-400',
  },
  manager: {
    label: 'Manager Review', short: 'Manager', who: 'shared by every assigned reviewer — official', dot: 'bg-emerald-600', text: 'text-emerald-700 dark:text-emerald-400', ring: 'bg-emerald-600 border-emerald-600',
    activeTab: 'data-[state=active]:border-emerald-600 dark:data-[state=active]:border-emerald-400 data-[state=active]:text-emerald-700 dark:data-[state=active]:text-emerald-400',
  },
};

/** The criteria for one evaluation format (a review's `evaluation_format`);
 * omitted → the standard format. Pass `enabled: false` to wait for the format. */
export function useReviewTemplate(format?: string, enabled = true) {
  const fmt = format || 'standard';
  return useQuery({
    queryKey: ['performance-reviews', 'template', fmt],
    queryFn: () => api.get<ReviewTemplate>(`/performance-reviews/template?format=${encodeURIComponent(fmt)}`),
    staleTime: Infinity,
    enabled,
  });
}

/** Every format's template, keyed by format — for views that mix reviews of
 * different formats (Analytics). */
export function useAllReviewTemplates() {
  const { data: formats = [], isLoading: formatsLoading } = useEvaluationFormats();
  return useQuery({
    queryKey: ['performance-reviews', 'templates', formats.map(f => f.key).join(',')],
    queryFn: async () => {
      const entries = await Promise.all(formats.map(async f =>
        [f.key, await api.get<ReviewTemplate>(`/performance-reviews/template?format=${encodeURIComponent(f.key)}`)] as const));
      return Object.fromEntries(entries) as Record<string, ReviewTemplate>;
    },
    enabled: !formatsLoading && formats.length > 0,
    staleTime: Infinity,
  });
}

/** Which evaluation formats a review can be assigned under — the selector's
 * data source (see services/performance_reviews.py::EVALUATION_FORMATS). */
export function useEvaluationFormats() {
  return useQuery({
    queryKey: ['performance-reviews', 'formats'],
    queryFn: () => api.get<{ key: string; label: string }[]>('/performance-reviews/formats'),
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

export function useUpdatePerformanceReview() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: PerformanceReviewPatch }) =>
      api.patch<PerformanceReview>(`/performance-reviews/${id}`, data),
    onSuccess: (review) => {
      queryClient.setQueryData(['performance-reviews', 'detail', review.id], review);
      queryClient.invalidateQueries({ queryKey: ['performance-reviews', 'list'] });
      queryClient.invalidateQueries({ queryKey: ['performance-reviews', 'projects'] });
    },
  });
}

export type ReviewTransitionAction =
  | 'submit_self' | 'complete'
  // Reopening is scoped: the self-assessment, or a completed Manager Review —
  // see Backend/services/performance_reviews.py::transition_review.
  | 'reopen_self' | 'reopen_manager';

export function useTransitionPerformanceReview() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, action }: { id: string; action: ReviewTransitionAction }) =>
      api.post<PerformanceReview>(`/performance-reviews/${id}/transition`, { action }),
    onSuccess: (review) => {
      queryClient.setQueryData(['performance-reviews', 'detail', review.id], review);
      queryClient.invalidateQueries({ queryKey: ['performance-reviews', 'list'] });
      queryClient.invalidateQueries({ queryKey: ['performance-reviews', 'projects'] });
    },
  });
}

export function useDeletePerformanceReview() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<void>(`/performance-reviews/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['performance-reviews', 'list'] });
      queryClient.invalidateQueries({ queryKey: ['performance-reviews', 'projects'] });
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

// One .xlsx per review (the exact same workbook as the single export),
// bundled into a zip — for downloading a multi-selection from Analytics.
export function downloadReviewsXlsxBulk(reviewIds: string[]) {
  const query = reviewIds.map(id => `ids=${encodeURIComponent(id)}`).join('&');
  return api.download(`/performance-reviews/export/xlsx/bulk?${query}`, 'performance-reviews.zip');
}

// ---------- Projects panel ----------

export function useReviewProjects(includeInactive = false) {
  return useQuery({
    queryKey: ['performance-reviews', 'projects', 'list', includeInactive],
    queryFn: () => api.get<ReviewProject[]>(`/performance-reviews/projects${includeInactive ? '?include_inactive=true' : ''}`),
  });
}

export function useToggleProjectReviews() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ projectId, enabled }: { projectId: string; enabled: boolean }) =>
      api.put<ReviewProject>(`/performance-reviews/projects/${projectId}`, { enabled }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['performance-reviews', 'projects'] });
    },
  });
}

export function useProjectReviewTeam(projectId: string | undefined) {
  return useQuery({
    queryKey: ['performance-reviews', 'projects', 'team', projectId],
    queryFn: () => api.get<ReviewTeamMember[]>(`/performance-reviews/projects/${projectId}/team`),
    enabled: !!projectId,
  });
}

export function useAssignSelfAssessments() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      project_id: string; employee_ids: string[]; review_date: string;
      self_due_date?: string | null; evaluation_format?: string;
      reviewer_ids?: string[]; period_start?: string | null; period_end?: string | null;
    }) => api.post<{ created: PerformanceReview[]; skipped_employee_ids: string[] }>('/performance-reviews/bulk', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['performance-reviews', 'list'] });
      queryClient.invalidateQueries({ queryKey: ['performance-reviews', 'projects'] });
    },
  });
}

export function useReviewAnalytics(year: number | null) {
  return useQuery({
    queryKey: ['performance-reviews', 'analytics', year ?? 'all'],
    queryFn: () => api.get<ReviewAnalytics>(`/performance-reviews/analytics${year ? `?year=${year}` : ''}`),
  });
}
