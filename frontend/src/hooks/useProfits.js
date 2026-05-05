import { useQuery } from '@tanstack/react-query';
import { fetchProfitsSummary } from '../api/profits';

export function useProfitsSummary(period = 'this-month') {
  return useQuery({
    queryKey: ['profits-summary', period],
    queryFn: () => fetchProfitsSummary(period),
    staleTime: 1000 * 60 * 5, // 5 min — profit aggregations don't need real-time freshness
  });
}
