import { api } from './client';

export function fetchConversationsPage({ category, phone, nextToken, limit } = {}) {
  const params = new URLSearchParams();
  if (category) params.set('category', category);
  if (phone) params.set('phone', phone);
  if (nextToken) params.set('next_token', nextToken);
  if (limit) params.set('limit', String(limit));
  const qs = params.toString();
  return api.get(`/conversations${qs ? `?${qs}` : ''}`);
}

export async function fetchConversations(opts = {}) {
  let all = [];
  let nextToken = opts.nextToken;
  let pages = 0;
  do {
    const data = await fetchConversationsPage({ ...opts, nextToken });
    all = all.concat(data.conversations || []);
    nextToken = data.next_token;
    pages++;
  } while (nextToken && pages < MAX_PAGES);
  return { conversations: all };
}

export function fetchConversationMessages(phone, { nextToken, limit } = {}) {
  const params = new URLSearchParams();
  if (nextToken) params.set('next_token', nextToken);
  if (limit) params.set('limit', String(limit));
  const qs = params.toString();
  return api.get(`/conversations/${encodeURIComponent(phone)}/messages${qs ? `?${qs}` : ''}`);
}

export function fetchMessagesPage({ contactId, channel, category, nextToken } = {}) {
  const params = new URLSearchParams();
  if (contactId) params.set('contact_id', contactId);
  if (channel) params.set('channel', channel);
  if (category) params.set('category', category);
  if (nextToken) params.set('next_token', nextToken);
  const qs = params.toString();
  return api.get(`/messages${qs ? `?${qs}` : ''}`);
}

const MAX_PAGES = 20;

export async function fetchMessages(opts = {}) {
  let allMessages = [];
  let nextToken = opts.nextToken;
  let pages = 0;
  do {
    const data = await fetchMessagesPage({ ...opts, nextToken });
    allMessages = allMessages.concat(data.messages || []);
    nextToken = data.next_token;
    pages++;
  } while (nextToken && pages < MAX_PAGES);
  return { messages: allMessages };
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

/** Send WhatsApp message from UI. Body: { to_number, text }. */
export function sendMessage({ to_number, text }) {
  return api.post('/messages/send', { to_number, text });
}

/** Mark a conversation closed by customer phone number. Called after checkout. */
export function markConversationClosed(from_number) {
  return api.post('/messages/mark-conversation-closed', { from_number });
}
