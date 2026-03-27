import { useQuery } from '@tanstack/react-query';
import { fetchConversations, fetchConversationMessages } from '../api/messages';

export function useConversations(opts) {
  return useQuery({
    queryKey: ['conversations', opts],
    queryFn: () => fetchConversations(opts),
    refetchOnWindowFocus: true,
    staleTime: 30_000,
  });
}

export function useConversationMessages(phone, opts) {
  return useQuery({
    queryKey: ['conversationMessages', phone, opts],
    queryFn: () => fetchConversationMessages(phone, opts),
    enabled: Boolean(phone),
    refetchOnWindowFocus: true,
    staleTime: 15_000,
  });
}
