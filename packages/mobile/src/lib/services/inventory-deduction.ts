import { stockAdjustmentRepository } from "../repositories/stock-adjustment-repository";
import { productIngredientRepository } from "../repositories/product-ingredient-repository";

/**
 * Deducts ingredient stock when an order is completed.
 * For each order item, looks up the product's recipe (ingredient links)
 * and creates stock adjustments for each ingredient used.
 */
export async function deductInventoryForOrder(
  orderItems: { productId: string; quantity: number }[],
  employeeId?: string
): Promise<void> {
  for (const item of orderItems) {
    const recipe = await productIngredientRepository.getByProduct(item.productId);

    for (const link of recipe) {
      const deductionQty = link.quantity * item.quantity;

      await stockAdjustmentRepository.adjustStock(
        link.ingredientId,
        "sale_deduction",
        -deductionQty,
        `Order sale: ${item.quantity}x product`,
        employeeId
      );
    }
  }
}

/**
 * Re-stocks ingredient inventory when items are refunded.
 * Reverses the deduction that happened during the sale.
 */
export async function restockForRefund(
  orderItems: { productId: string; quantity: number }[],
  employeeId?: string
): Promise<void> {
  for (const item of orderItems) {
    const recipe = await productIngredientRepository.getByProduct(item.productId);

    for (const link of recipe) {
      const restockQty = link.quantity * item.quantity;

      await stockAdjustmentRepository.adjustStock(
        link.ingredientId,
        "returned",
        restockQty,
        `Refund restock: ${item.quantity}x product`,
        employeeId
      );
    }
  }
}
