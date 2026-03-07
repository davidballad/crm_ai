import { api } from './client';

export function fetchContacts({ nextToken, phone } = {}) {
  const params = new URLSearchParams();
  if (nextToken) params.set('next_token', nextToken);
  if (phone) params.set('phone', phone);
  const qs = params.toString();
  return api.get(`/contacts${qs ? `?${qs}` : ''}`);
}

export function fetchContact(id) {
  return api.get(`/contacts/${id}`);
}

export function createContact(data) {
  return api.post('/contacts', data);
}

export function updateContact(id, data) {
  return api.put(`/contacts/${id}`, data);
}

export function patchContact(id, data) {
  return api.patch(`/contacts/${id}`, data);
}

export function deleteContact(id) {
  return api.delete(`/contacts/${id}`);
}
