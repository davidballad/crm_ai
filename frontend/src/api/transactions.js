import { api } from './client';

export function fetchTransactions({ startDate, endDate, nextToken } = {}) {
  const params = new URLSearchParams();
  if (startDate) params.set('start_date', startDate);
  if (endDate) params.set('end_date', endDate);
  if (nextToken) params.set('next_token', nextToken);
  const qs = params.toString();
  return api.get(`/transactions${qs ? `?${qs}` : ''}`);
}

export function fetchTransaction(id) {
  return api.get(`/transactions/${id}`);
}

export function recordSale(data) {
  return api.post('/transactions', data);
}

export function patchTransaction(id, data) {
  return api.patch(`/transactions/${id}`, data);
}

export function fetchDailySummary(date) {
  const qs = date ? `?date=${date}` : '';
  return api.get(`/transactions/summary${qs}`);
}
