import { api, getTokenGetter } from './client';

const API_URL = import.meta.env.VITE_API_URL || '';

export function fetchContacts({ nextToken, phone, tier, lead_status, tag, min_spent, max_spent, days_inactive } = {}) {
  const params = new URLSearchParams();
  if (nextToken) params.set('next_token', nextToken);
  if (phone) params.set('phone', phone);
  if (tier) params.set('tier', tier);
  if (lead_status) params.set('lead_status', lead_status);
  if (tag) params.set('tag', tag);
  if (min_spent != null) params.set('min_spent', min_spent);
  if (max_spent != null) params.set('max_spent', max_spent);
  if (days_inactive != null) params.set('days_inactive', days_inactive);
  const qs = params.toString();
  return api.get(`/contacts${qs ? `?${qs}` : ''}`);
}

export function fetchContactStats() {
  return api.get('/contacts/stats');
}

export function bulkTagContacts({ contact_ids, tags, action }) {
  return api.post('/contacts/bulk-tag', { contact_ids, tags, action });
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

export function fetchNotes(contactId) {
  return api.get(`/contacts/${contactId}/notes`);
}

export function addNote(contactId, content) {
  return api.post(`/contacts/${contactId}/notes`, { content });
}

export function deleteNote(contactId, noteId) {
  return api.delete(`/contacts/${contactId}/notes/${noteId}`);
}

/** Download leads export CSV (Google Sheets-friendly). */
export async function downloadLeadsExport() {
  if (!API_URL) throw new Error('API URL is not configured');
  const getToken = getTokenGetter();
  const token = getToken?.();
  const res = await fetch(`${API_URL}/contacts/export`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error('Failed to download leads export');
  const blob = await res.blob();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'leads_export.csv';
  a.click();
  URL.revokeObjectURL(a.href);
}
