import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { InvoiceExpense } from '@/types';

export function useInvoiceExpenses(invoiceId?: string) {
  return useQuery({
    queryKey: ['invoice-expenses', invoiceId],
    enabled: !!invoiceId,
    queryFn: () => api.get<InvoiceExpense[]>(`/invoice-expenses?invoice_id=${invoiceId}`),
  });
}

export function useCreateInvoiceExpense() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (expense: Omit<InvoiceExpense, 'id' | 'created_at'>) =>
      api.post<InvoiceExpense>('/invoice-expenses', expense),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['invoice-expenses', variables.invoice_id] });
    },
  });
}

export function useUpdateInvoiceExpense() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, updates }: { id: string; invoiceId: string; updates: Partial<InvoiceExpense> }) =>
      api.put<InvoiceExpense>(`/invoice-expenses/${id}`, updates),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['invoice-expenses', variables.invoiceId] });
    },
  });
}

export function useDeleteInvoiceExpense() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: { id: string; invoiceId: string }) =>
      api.delete<void>(`/invoice-expenses/${id}`),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['invoice-expenses', variables.invoiceId] });
    },
  });
}
