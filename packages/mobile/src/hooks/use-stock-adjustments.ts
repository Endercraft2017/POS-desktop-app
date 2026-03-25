import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { stockAdjustmentRepository } from "../lib/repositories/stock-adjustment-repository";

export function useStockAdjustments(limit = 50) {
  return useQuery({ queryKey: ["stockAdjustments", limit], queryFn: () => stockAdjustmentRepository.getAll(limit) });
}

export function useIngredientAdjustments(ingredientId: string) {
  return useQuery({
    queryKey: ["stockAdjustments", "ingredient", ingredientId],
    queryFn: () => stockAdjustmentRepository.getByIngredient(ingredientId),
    enabled: !!ingredientId,
  });
}

export function useAdjustStock() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      ingredientId: string;
      type: string;
      quantityChange: number;
      reason?: string;
      employeeId?: string;
    }) => stockAdjustmentRepository.adjustStock(
      data.ingredientId, data.type as any, data.quantityChange, data.reason, data.employeeId
    ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["stockAdjustments"] });
      qc.invalidateQueries({ queryKey: ["ingredients"] });
    },
  });
}
