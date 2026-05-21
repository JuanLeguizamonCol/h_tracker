import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type {
  FreshSalesTestResponse,
  FreshSalesAccountsResponse,
  FreshSalesImportResponse,
} from '@/types';

export function useFreshSalesTest(enabled = true) {
  return useQuery({
    queryKey: ['freshsales', 'test'],
    queryFn: () => api.get<FreshSalesTestResponse>('/integrations/freshsales/test'),
    staleTime: 60_000,
    retry: false,
    enabled,
  });
}

export function useFreshSalesAccounts(page: number, search: string, enabled = true) {
  return useQuery({
    queryKey: ['freshsales', 'accounts', page, search],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page) });
      if (search) params.set('search', search);
      return api.get<FreshSalesAccountsResponse>(`/integrations/freshsales/accounts?${params}`);
    },
    enabled,
    staleTime: 30_000,
  });
}

export function useImportFreshSalesAccounts() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (accountIds: number[]) =>
      api.post<FreshSalesImportResponse>('/integrations/freshsales/import', {
        account_ids: accountIds,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clients'] });
    },
  });
}

export function useSyncFreshSalesAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (freshsalesId: number) =>
      api.post<{ success: boolean; client_id: string }>(
        `/integrations/freshsales/sync/${freshsalesId}`,
        {},
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clients'] });
    },
  });
}
