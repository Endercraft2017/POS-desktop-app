import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { purchaseOrderRepository } from "../lib/repositories/purchase-order-repository";

export function usePurchaseOrders(limit = 50) {
  return useQuery({ queryKey: ["purchaseOrders", limit], queryFn: () => purchaseOrderRepository.getAll(limit) });
}

export function usePurchaseOrder(id: string) {
  return useQuery({
    queryKey: ["purchaseOrders", id],
    queryFn: () => purchaseOrderRepository.getById(id),
    enabled: !!id,
  });
}

export function usePurchaseOrdersByStatus(status: string) {
  return useQuery({
    queryKey: ["purchaseOrders", "status", status],
    queryFn: () => purchaseOrderRepository.getByStatus(status),
    enabled: !!status,
  });
}

export function useCreatePurchaseOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params: {
      data: any;
      items: any[];
    }) => purchaseOrderRepository.create(params.data, params.items),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["purchaseOrders"] }); },
  });
}

export function useUpdatePOStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      purchaseOrderRepository.updateStatus(id, status as any),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["purchaseOrders"] }); },
  });
}

export function useReceivePOItems() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ poId, items }: { poId: string; items: { itemId: string; receivedQty: number }[] }) =>
      purchaseOrderRepository.receiveItems(poId, items),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["purchaseOrders"] });
      qc.invalidateQueries({ queryKey: ["ingredients"] });
      qc.invalidateQueries({ queryKey: ["stockAdjustments"] });
    },
  });
}
