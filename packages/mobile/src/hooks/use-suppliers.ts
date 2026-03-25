import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supplierRepository } from "../lib/repositories";
import type { NewSupplier } from "@pos/core/types";

export function useSuppliers() {
  return useQuery({
    queryKey: ["suppliers"],
    queryFn: () => supplierRepository.getAll(),
  });
}

export function useCreateSupplier() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Omit<NewSupplier, "id" | "deviceId" | "createdAt" | "updatedAt">) =>
      supplierRepository.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["suppliers"] });
    },
  });
}

export function useUpdateSupplier() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<NewSupplier> }) =>
      supplierRepository.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["suppliers"] });
    },
  });
}

export function useDeleteSupplier() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => supplierRepository.softDelete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["suppliers"] });
    },
  });
}
