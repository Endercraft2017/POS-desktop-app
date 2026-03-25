import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { expenseRepository } from "../lib/repositories/expense-repository";
import type { NewOperationalExpense } from "@pos/core/types";

export function useExpenses() {
  return useQuery({
    queryKey: ["expenses"],
    queryFn: () => expenseRepository.getAll(),
  });
}

export function useActiveExpenses() {
  return useQuery({
    queryKey: ["expenses", "active"],
    queryFn: () => expenseRepository.getActive(),
  });
}

export function useCreateExpense() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (
      data: Omit<NewOperationalExpense, "id" | "deviceId" | "createdAt" | "updatedAt">
    ) => expenseRepository.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["expenses"] });
    },
  });
}

export function useUpdateExpense() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: string;
      data: Partial<NewOperationalExpense>;
    }) => expenseRepository.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["expenses"] });
    },
  });
}

export function useDeleteExpense() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => expenseRepository.softDelete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["expenses"] });
    },
  });
}
