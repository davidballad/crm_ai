import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchSuppliers, fetchSupplier, createSupplier, updateSupplier, deleteSupplier } from '../api/suppliers';

export function useSuppliers() {
  return useQuery({
    queryKey: ['suppliers'],
    queryFn: fetchSuppliers,
    select: (data) => data?.suppliers ?? [],
  });
}

export function useSupplier(id) {
  return useQuery({
    queryKey: ['suppliers', id],
    queryFn: () => fetchSupplier(id),
    enabled: !!id,
  });
}

export function useCreateSupplier() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createSupplier,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['suppliers'] }),
  });
}

export function useUpdateSupplier() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }) => updateSupplier(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['suppliers'] }),
  });
}

export function useDeleteSupplier() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deleteSupplier,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['suppliers'] }),
  });
}
