import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { employeeRepository } from "../lib/repositories";

export function useEmployees() {
  return useQuery({
    queryKey: ["employees"],
    queryFn: () => employeeRepository.getAll(),
  });
}

export function useActiveEmployees() {
  return useQuery({
    queryKey: ["employees", "active"],
    queryFn: () => employeeRepository.getActive(),
  });
}

export function useCreateEmployee() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { name: string; pin: string; role?: "admin" | "manager" | "cashier" }) =>
      employeeRepository.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["employees"] });
    },
  });
}

export function useUpdateEmployee() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: string;
      data: { name?: string; role?: string; isActive?: boolean };
    }) => employeeRepository.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["employees"] });
    },
  });
}

export function useChangePin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, newPin }: { id: string; newPin: string }) =>
      employeeRepository.changePin(id, newPin),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["employees"] });
    },
  });
}

export function useDeleteEmployee() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => employeeRepository.softDelete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["employees"] });
    },
  });
}

export function useAuthenticate() {
  return useMutation({
    mutationFn: (pin: string) => employeeRepository.authenticate(pin),
  });
}
