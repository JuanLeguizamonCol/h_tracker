import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { EmployeePerformanceReport } from '@/types';

/** Reports › Performance tab. Omit start/end for the default last 12 months. */
export function useEmployeePerformance(range: { start?: string; end?: string }, options?: { enabled?: boolean }) {
  const params = new URLSearchParams();
  if (range.start) params.set('start', range.start);
  if (range.end) params.set('end', range.end);
  const qs = params.toString();
  return useQuery({
    queryKey: ['reports', 'employee-performance', range.start ?? '', range.end ?? ''],
    queryFn: () => api.get<EmployeePerformanceReport>(`/reports/employee-performance${qs ? `?${qs}` : ''}`),
    enabled: options?.enabled ?? true,
  });
}
