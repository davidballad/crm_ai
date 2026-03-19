import { api } from './client';

/**
 * Submit the contact/collaboration form. Sends to POST /contact (no auth).
 * @param {{ name: string, email: string, message: string, subject?: string }} data
 */
export async function submitContact(data) {
  return api.post('/contact', {
    name: data.name?.trim() || '',
    email: data.email?.trim() || '',
    message: data.message?.trim() || '',
    subject: data.subject?.trim() || 'Collaboration',
  });
}
