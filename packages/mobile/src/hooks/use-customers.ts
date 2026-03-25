import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customerRepository } from "../lib/repositories/customer-repository";
import type { NewCustomer } from "@pos/core/types";

export function useCustomers() {
  return useQuery({ queryKey: ["customers"], queryFn: () => customerRepository.getAll() });
}

export function useActiveCustomers() {
  return useQuery({ queryKey: ["customers", "active"], queryFn: () => customerRepository.getActive() });
}

export function useCustomer(id: string) {
  return useQuery({ queryKey: ["customers", id], queryFn: () => customerRepository.getById(id), enabled: !!id });
}

export function useSearchCustomers(query: string) {
  return useQuery({ queryKey: ["customers", "search", query], queryFn: () => customerRepository.search(query), enabled: query.length > 0 });
}

export function useCreateCustomer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Omit<NewCustomer, "id" | "deviceId" | "createdAt" | "updatedAt">) => customerRepository.create(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["customers"] }); },
  });
}

export function useUpdateCustomer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<NewCustomer> }) => customerRepository.update(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["customers"] }); },
  });
}

export function useDeleteCustomer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => customerRepository.softDelete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["customers"] }); },
  });
}
