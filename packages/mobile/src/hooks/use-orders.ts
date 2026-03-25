import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { orderRepository } from "../lib/repositories";
import type { NewOrderItem, NewPayment } from "@pos/core/types";

export function useOrders(limit = 50) {
  return useQuery({
    queryKey: ["orders", limit],
    queryFn: () => orderRepository.getAll(limit),
  });
}

export function useTodayOrders() {
  return useQuery({
    queryKey: ["orders", "today"],
    queryFn: () => orderRepository.getToday(),
  });
}

export function useOrdersByStatus(status: string) {
  return useQuery({
    queryKey: ["orders", "status", status],
    queryFn: () => orderRepository.getByStatus(status),
  });
}

export function useOrder(id: string) {
  return useQuery({
    queryKey: ["orders", id],
    queryFn: () => orderRepository.getById(id),
    enabled: !!id,
  });
}

export function useTodayStats() {
  return useQuery({
    queryKey: ["orders", "stats", "today"],
    queryFn: () => orderRepository.getTodayStats(),
    refetchInterval: 30000, // refresh every 30s
  });
}

export function useCreateOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      data,
      items,
    }: {
      data: {
        subtotal: number;
        taxAmount: number;
        discountAmount: number;
        total: number;
        discountType?: string;
        discountValue?: number;
        notes?: string;
        employeeId?: string;
      };
      items: Omit<NewOrderItem, "id" | "deviceId" | "createdAt" | "updatedAt" | "orderId">[];
    }) => orderRepository.create(data, items),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["orders"] });
    },
  });
}

export function useAddPayment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Omit<NewPayment, "id" | "deviceId" | "createdAt" | "updatedAt">) =>
      orderRepository.addPayment(data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      queryClient.invalidateQueries({ queryKey: ["orders", variables.orderId] });
    },
  });
}

export function useUpdateOrderStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      status,
    }: {
      id: string;
      status: "pending" | "held" | "completed" | "cancelled" | "refunded";
    }) => orderRepository.updateStatus(id, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["orders"] });
    },
  });
}
