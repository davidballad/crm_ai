import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchInsights, generateInsights } from '../api/insights';

export function useInsights(date) {
  return useQuery({
    queryKey: ['insights', date],
    queryFn: () => fetchInsights(date),
    retry: false,
  });
}

export function useGenerateInsights() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: generateInsights,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['insights'] }),
  });
}
