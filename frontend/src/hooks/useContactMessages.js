import { useQuery } from '@tanstack/react-query';
import { fetchContactMessages } from '../api/messages';

export function useContactMessages(contactId, opts) {
  return useQuery({
    queryKey: ['contactMessages', contactId, opts],
    queryFn: () => fetchContactMessages(contactId, opts),
    enabled: !!contactId,
  });
}
