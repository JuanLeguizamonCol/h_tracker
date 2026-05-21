import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { InvoiceManualLine, InvoiceFee, InvoiceFeeAttachment } from '@/types';

// Manual People Lines
export function useInvoiceManualLines(invoiceId?: string) {
  return useQuery({
    queryKey: ['invoice-manual-lines', invoiceId],
    enabled: !!invoiceId,
    queryFn: () => api.get<InvoiceManualLine[]>(`/invoice-manual-lines?invoice_id=${invoiceId}`),
  });
}

export function useCreateInvoiceManualLine() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (line: Omit<InvoiceManualLine, 'id' | 'created_at'>) =>
      api.post<InvoiceManualLine>('/invoice-manual-lines', line),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['invoice-manual-lines', data.invoice_id] });
    },
  });
}

export function useUpdateInvoiceManualLine() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Partial<InvoiceManualLine> }) =>
      api.put<InvoiceManualLine>(`/invoice-manual-lines/${id}`, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoice-manual-lines'] });
    },
  });
}

export function useDeleteInvoiceManualLine() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<void>(`/invoice-manual-lines/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoice-manual-lines'] });
    },
  });
}

// Invoice Fees
export function useInvoiceFees(invoiceId?: string) {
  return useQuery({
    queryKey: ['invoice-fees', invoiceId],
    enabled: !!invoiceId,
    queryFn: () => api.get<InvoiceFee[]>(`/invoice-fees?invoice_id=${invoiceId}`),
  });
}

export function useCreateInvoiceFee() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (fee: Omit<InvoiceFee, 'id' | 'created_at'>) =>
      api.post<InvoiceFee>('/invoice-fees', fee),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['invoice-fees', data.invoice_id] });
    },
  });
}

export function useUpdateInvoiceFee() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Partial<InvoiceFee> }) =>
      api.put<InvoiceFee>(`/invoice-fees/${id}`, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoice-fees'] });
    },
  });
}

export function useDeleteInvoiceFee() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<void>(`/invoice-fees/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoice-fees'] });
    },
  });
}

// Fee Attachments
export function useInvoiceFeeAttachments(feeId?: string) {
  return useQuery({
    queryKey: ['invoice-fee-attachments', feeId],
    enabled: !!feeId,
    queryFn: () => api.get<InvoiceFeeAttachment[]>(`/invoice-fee-attachments?fee_id=${feeId}`),
  });
}

export function useCreateFeeAttachment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ feeId, file }: { feeId: string; file: File }) => {
      const formData = new FormData();
      formData.append('fee_id', feeId);
      formData.append('file', file);
      return api.upload<InvoiceFeeAttachment>('/invoice-fee-attachments/upload', formData);
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['invoice-fee-attachments', data.fee_id] });
    },
  });
}

export function useDeleteFeeAttachment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: { id: string; fileUrl?: string; feeId?: string }) =>
      api.delete<void>(`/invoice-fee-attachments/${id}`),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: variables.feeId ? ['invoice-fee-attachments', variables.feeId] : ['invoice-fee-attachments'],
      });
    },
  });
}
