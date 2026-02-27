import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchContacts, fetchContact, createContact, updateContact, deleteContact } from '../api/contacts';

export function useContacts(opts) {
  return useQuery({
    queryKey: ['contacts', opts],
    queryFn: () => fetchContacts(opts),
  });
}

export function useContact(id) {
  return useQuery({
    queryKey: ['contacts', id],
    queryFn: () => fetchContact(id),
    enabled: !!id,
  });
}

export function useCreateContact() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createContact,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['contacts'] }),
  });
}

export function useUpdateContact() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }) => updateContact(id, data),
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({ queryKey: ['contacts'] });
      qc.invalidateQueries({ queryKey: ['contacts', id] });
    },
  });
}

export function useDeleteContact() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deleteContact,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['contacts'] }),
  });
}
