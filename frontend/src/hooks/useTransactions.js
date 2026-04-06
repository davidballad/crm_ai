import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchTransactions, recordSale, fetchDailySummary, fetchRevenueRange } from '../api/transactions';

export function useTransactions(filters, queryOptions = {}) {
  return useQuery({
    queryKey: ['transactions', filters],
    queryFn: () => fetchTransactions(filters),
    ...queryOptions,
  });
}

/** Unused: no UI records sales (transactions come from WhatsApp). Available for a future "Record sale" form. */
export function useRecordSale() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: recordSale,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['transactions'] });
      qc.invalidateQueries({ queryKey: ['products'] });
      qc.invalidateQueries({ queryKey: ['daily-summary'] });
    },
  });
}

export function useDailySummary(date) {
  return useQuery({
    queryKey: ['daily-summary', date],
    queryFn: () => fetchDailySummary(date),
  });
}

export function useRevenueRange(start, end) {
  return useQuery({
    queryKey: ['revenue-range', start, end],
    queryFn: () => fetchRevenueRange({ start, end }),
    enabled: !!start && !!end,
  });
}
