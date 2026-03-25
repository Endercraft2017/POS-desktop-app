import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { productRepository } from "../lib/repositories";
import type { NewProduct } from "@pos/core/types";

export function useProducts() {
  return useQuery({
    queryKey: ["products"],
    queryFn: () => productRepository.getAll(),
  });
}

export function useActiveProducts() {
  return useQuery({
    queryKey: ["products", "active"],
    queryFn: () => productRepository.getActive(),
  });
}

export function useProductsByCategory(categoryId: string | null) {
  return useQuery({
    queryKey: ["products", "category", categoryId],
    queryFn: () =>
      categoryId
        ? productRepository.getByCategory(categoryId)
        : productRepository.getActive(),
    enabled: true,
  });
}

export function useProduct(id: string) {
  return useQuery({
    queryKey: ["products", id],
    queryFn: () => productRepository.getById(id),
    enabled: !!id,
  });
}

export function useSearchProducts(query: string) {
  return useQuery({
    queryKey: ["products", "search", query],
    queryFn: () => productRepository.search(query),
    enabled: query.length > 0,
  });
}

export function useCreateProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Omit<NewProduct, "id" | "deviceId" | "createdAt" | "updatedAt">) =>
      productRepository.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
    },
  });
}

export function useUpdateProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<NewProduct> }) =>
      productRepository.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
    },
  });
}

export function useDeleteProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => productRepository.softDelete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
    },
  });
}

export function useToggleProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      productRepository.toggleActive(id, isActive),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
    },
  });
}
