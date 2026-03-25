import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ingredientRepository } from "../lib/repositories";
import type { NewIngredient, NewIngredientPrice } from "@pos/core/types";

export function useIngredients() {
  return useQuery({
    queryKey: ["ingredients"],
    queryFn: () => ingredientRepository.getAll(),
  });
}

export function useActiveIngredients() {
  return useQuery({
    queryKey: ["ingredients", "active"],
    queryFn: () => ingredientRepository.getActive(),
  });
}

export function useLowStockIngredients() {
  return useQuery({
    queryKey: ["ingredients", "low-stock"],
    queryFn: () => ingredientRepository.getLowStock(),
  });
}

export function useIngredient(id: string) {
  return useQuery({
    queryKey: ["ingredients", id],
    queryFn: () => ingredientRepository.getById(id),
    enabled: !!id,
  });
}

export function useIngredientPrices(ingredientId: string) {
  return useQuery({
    queryKey: ["ingredients", ingredientId, "prices"],
    queryFn: () => ingredientRepository.getPrices(ingredientId),
    enabled: !!ingredientId,
  });
}

export function useCreateIngredient() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Omit<NewIngredient, "id" | "deviceId" | "createdAt" | "updatedAt">) =>
      ingredientRepository.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ingredients"] });
    },
  });
}

export function useUpdateIngredient() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<NewIngredient> }) =>
      ingredientRepository.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ingredients"] });
    },
  });
}

export function useDeleteIngredient() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => ingredientRepository.softDelete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ingredients"] });
    },
  });
}

export function useAddIngredientPrice() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Omit<NewIngredientPrice, "id" | "deviceId" | "createdAt" | "updatedAt">) =>
      ingredientRepository.addPrice(data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["ingredients", variables.ingredientId, "prices"],
      });
    },
  });
}
