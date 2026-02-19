import { api } from './client';

export function fetchInsights(date) {
  const qs = date ? `?date=${date}` : '';
  return api.get(`/insights${qs}`);
}

export function generateInsights() {
  return api.post('/insights/generate');
}
