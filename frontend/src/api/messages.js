import { api } from './client';

export function fetchMessages({ contactId, channel, category, nextToken } = {}) {
  const params = new URLSearchParams();
  if (contactId) params.set('contact_id', contactId);
  if (channel) params.set('channel', channel);
  if (category) params.set('category', category);
  if (nextToken) params.set('next_token', nextToken);
  const qs = params.toString();
  return api.get(`/messages${qs ? `?${qs}` : ''}`);
}

export function fetchContactMessages(contactId, { nextToken } = {}) {
  const params = new URLSearchParams();
  if (nextToken) params.set('next_token', nextToken);
  const qs = params.toString();
  return api.get(`/contacts/${contactId}/messages${qs ? `?${qs}` : ''}`);
}

export function createMessage(data) {
  return api.post('/messages', data);
}

export function patchMessageFlags(id, data) {
  return api.patch(`/messages/${id}/flags`, data);
}
