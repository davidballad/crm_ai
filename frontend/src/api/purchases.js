import { api } from './client';

export function fetchPurchaseOrders({ status } = {}) {
  const params = new URLSearchParams();
  if (status) params.set('status', status);
  const qs = params.toString();
  return api.get(`/purchases${qs ? `?${qs}` : ''}`);
}

export function fetchPurchaseOrder(id) {
  return api.get(`/purchases/${id}`);
}

export function createPurchaseOrder(data) {
  return api.post('/purchases', data);
}

export function updatePurchaseOrder(id, data) {
  return api.put(`/purchases/${id}`, data);
}
