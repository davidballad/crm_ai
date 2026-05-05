import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchPurchaseOrders, fetchPurchaseOrder, createPurchaseOrder, updatePurchaseOrder } from '../api/purchases';

export function usePurchaseOrders(filters) {
  return useQuery({
    queryKey: ['purchase_orders', filters],
    queryFn: () => fetchPurchaseOrders(filters),
    select: (data) => data?.purchase_orders ?? [],
  });
}

export function usePurchaseOrder(id) {
  return useQuery({
    queryKey: ['purchase_orders', id],
    queryFn: () => fetchPurchaseOrder(id),
    enabled: !!id,
  });
}

export function useCreatePurchaseOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createPurchaseOrder,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['purchase_orders'] }),
  });
}

export function useUpdatePurchaseOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }) => updatePurchaseOrder(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['purchase_orders'] });
      qc.invalidateQueries({ queryKey: ['products'] });
    },
  });
}
