import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchContacts, fetchContact, createContact, updateContact, patchContact, deleteContact, fetchContactStats, bulkTagContacts, fetchNotes, addNote, deleteNote } from '../api/contacts';

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

export function usePatchContact() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }) => patchContact(id, data),
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

export function useContactStats() {
  return useQuery({
    queryKey: ['contact-stats'],
    queryFn: fetchContactStats,
  });
}

export function useBulkTagContacts() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: bulkTagContacts,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['contacts'] }),
  });
}

export function useContactNotes(contactId) {
  return useQuery({
    queryKey: ['contact-notes', contactId],
    queryFn: () => fetchNotes(contactId),
    enabled: !!contactId,
  });
}

export function useAddNote(contactId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (content) => addNote(contactId, content),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['contact-notes', contactId] }),
  });
}

export function useDeleteNote(contactId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (noteId) => deleteNote(contactId, noteId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['contact-notes', contactId] }),
  });
}
