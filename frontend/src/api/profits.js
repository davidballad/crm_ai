import { api } from './client';

export function fetchProfitsSummary(period = 'this-month') {
  return api.get(`/profits/summary?period=${encodeURIComponent(period)}`);
}
