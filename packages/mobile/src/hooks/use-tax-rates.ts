import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { taxRateRepository } from "../lib/repositories";
import type { NewTaxRate } from "@pos/core/types";

export function useTaxRates() {
  return useQuery({
    queryKey: ["taxRates"],
    queryFn: () => taxRateRepository.getAll(),
  });
}

export function useDefaultTaxRate() {
  return useQuery({
    queryKey: ["taxRates", "default"],
    queryFn: () => taxRateRepository.getDefault(),
  });
}

export function useCreateTaxRate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Omit<NewTaxRate, "id" | "deviceId" | "createdAt" | "updatedAt">) =>
      taxRateRepository.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["taxRates"] });
    },
  });
}

export function useUpdateTaxRate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<NewTaxRate> }) =>
      taxRateRepository.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["taxRates"] });
    },
  });
}

export function useDeleteTaxRate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => taxRateRepository.softDelete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["taxRates"] });
    },
  });
}
