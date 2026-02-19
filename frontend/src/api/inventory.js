import { api } from './client';

export function fetchProducts({ category, nextToken } = {}) {
  const params = new URLSearchParams();
  if (category) params.set('category', category);
  if (nextToken) params.set('next_token', nextToken);
  const qs = params.toString();
  return api.get(`/inventory${qs ? `?${qs}` : ''}`);
}

export function fetchProduct(id) {
  return api.get(`/inventory/${id}`);
}

export function createProduct(data) {
  return api.post('/inventory', data);
}

export function updateProduct(id, data) {
  return api.put(`/inventory/${id}`, data);
}

export function deleteProduct(id) {
  return api.delete(`/inventory/${id}`);
}
