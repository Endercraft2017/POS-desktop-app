import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { categoryRepository } from "../lib/repositories";
import type { NewCategory } from "@pos/core/types";

export function useCategories() {
  return useQuery({
    queryKey: ["categories"],
    queryFn: () => categoryRepository.getAll(),
  });
}

export function useActiveCategories() {
  return useQuery({
    queryKey: ["categories", "active"],
    queryFn: () => categoryRepository.getActive(),
  });
}

export function useCreateCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Omit<NewCategory, "id" | "deviceId" | "createdAt" | "updatedAt">) =>
      categoryRepository.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["categories"] });
    },
  });
}

export function useUpdateCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<NewCategory> }) =>
      categoryRepository.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["categories"] });
    },
  });
}

export function useDeleteCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => categoryRepository.softDelete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["categories"] });
    },
  });
}
