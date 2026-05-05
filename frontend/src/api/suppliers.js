import { api } from './client';

export function fetchSuppliers() {
  return api.get('/suppliers?limit=200');
}

export function fetchSupplier(id) {
  return api.get(`/suppliers/${id}`);
}

export function createSupplier(data) {
  return api.post('/suppliers', data);
}

export function updateSupplier(id, data) {
  return api.put(`/suppliers/${id}`, data);
}

export function deleteSupplier(id) {
  return api.delete(`/suppliers/${id}`);
}
