import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchTransactions, recordSale, fetchDailySummary } from '../api/transactions';

export function useTransactions(filters) {
  return useQuery({
    queryKey: ['transactions', filters],
    queryFn: () => fetchTransactions(filters),
  });
}

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
