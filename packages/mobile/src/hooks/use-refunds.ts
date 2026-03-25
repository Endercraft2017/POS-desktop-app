import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { refundRepository } from "../lib/repositories/refund-repository";

export function useRefunds(limit = 50) {
  return useQuery({ queryKey: ["refunds", limit], queryFn: () => refundRepository.getAll(limit) });
}

export function useOrderRefunds(orderId: string) {
  return useQuery({
    queryKey: ["refunds", "order", orderId],
    queryFn: () => refundRepository.getByOrder(orderId),
    enabled: !!orderId,
  });
}

export function useCreateRefund() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params: {
      data: {
        orderId: string;
        type: "full" | "partial";
        totalAmount: number;
        refundMethod: string;
        reason: string;
        notes?: string;
        employeeId?: string;
        restockItems?: boolean;
      };
      items: { orderItemId: string; quantity: number; amount: number }[];
    }) => refundRepository.create(params.data as any, params.items as any),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["refunds"] });
      qc.invalidateQueries({ queryKey: ["orders"] });
      qc.invalidateQueries({ queryKey: ["ingredients"] });
    },
  });
}
