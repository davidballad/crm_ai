import { useQuery } from '@tanstack/react-query';
import { fetchMessages } from '../api/messages';

export function useMessages(opts) {
  return useQuery({
    queryKey: ['messages', opts],
    queryFn: () => fetchMessages(opts),
  });
}
