import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { loyaltyRepository } from "../lib/repositories/loyalty-repository";

export function useLoyaltyRewards() {
  return useQuery({ queryKey: ["loyalty", "rewards"], queryFn: () => loyaltyRepository.getRewards() });
}

export function useCreateReward() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: any) => loyaltyRepository.createReward(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["loyalty"] }); },
  });
}

export function useUpdateReward() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => loyaltyRepository.updateReward(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["loyalty"] }); },
  });
}

export function useDeleteReward() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => loyaltyRepository.deleteReward(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["loyalty"] }); },
  });
}

export function useCustomerLoyalty(customerId: string) {
  return useQuery({
    queryKey: ["loyalty", "customer", customerId],
    queryFn: async () => {
      const [transactions, balance] = await Promise.all([
        loyaltyRepository.getTransactions(customerId),
        loyaltyRepository.getBalance(customerId),
      ]);
      return { transactions, balance };
    },
    enabled: !!customerId,
  });
}

export function useEarnPoints() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params: { customerId: string; orderId: string; points: number; description: string }) =>
      loyaltyRepository.earnPoints(params.customerId, params.orderId, params.points, params.description),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["loyalty"] });
      qc.invalidateQueries({ queryKey: ["customers"] });
    },
  });
}

export function useRedeemPoints() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params: { customerId: string; orderId: string; points: number; description: string }) =>
      loyaltyRepository.redeemPoints(params.customerId, params.orderId, params.points, params.description),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["loyalty"] });
      qc.invalidateQueries({ queryKey: ["customers"] });
    },
  });
}
