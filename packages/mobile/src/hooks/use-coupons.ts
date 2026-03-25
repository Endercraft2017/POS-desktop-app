import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { couponRepository } from "../lib/repositories/coupon-repository";
import type { NewCoupon } from "@pos/core/types";

export function useCoupons() {
  return useQuery({ queryKey: ["coupons"], queryFn: () => couponRepository.getAll() });
}

export function useActiveCoupons() {
  return useQuery({ queryKey: ["coupons", "active"], queryFn: () => couponRepository.getActive() });
}

export function useCreateCoupon() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Omit<NewCoupon, "id" | "deviceId" | "createdAt" | "updatedAt">) => couponRepository.create(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["coupons"] }); },
  });
}

export function useUpdateCoupon() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<NewCoupon> }) => couponRepository.update(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["coupons"] }); },
  });
}

export function useDeleteCoupon() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => couponRepository.softDelete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["coupons"] }); },
  });
}

export function useValidateCoupon() {
  return useMutation({
    mutationFn: ({ code, orderTotal }: { code: string; orderTotal: number }) =>
      couponRepository.validateCoupon(code, orderTotal),
  });
}
