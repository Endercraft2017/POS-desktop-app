/**
 * Checks if an ingredient stock is below minimum threshold.
 */
export function isLowStock(currentStock: number, minStock: number): boolean {
  return currentStock <= minStock;
}

/**
 * Calculates how many units of a product can be made given ingredient stock.
 */
export function calculateMaxProducible(
  productIngredients: {
    currentStock: number;
    quantityPerProduct: number;
  }[]
): number {
  if (productIngredients.length === 0) return 0;

  return Math.floor(
    Math.min(
      ...productIngredients.map((ing) => {
        if (ing.quantityPerProduct === 0) return Infinity;
        return ing.currentStock / ing.quantityPerProduct;
      })
    )
  );
}

/**
 * Calculates the stock deductions needed for an order.
 * Returns a map of ingredientId → quantity to deduct.
 */
export function calculateStockDeductions(
  orderItems: {
    productId: string;
    quantity: number;
  }[],
  productIngredientMap: Map<
    string,
    { ingredientId: string; quantityPerProduct: number }[]
  >
): Map<string, number> {
  const deductions = new Map<string, number>();

  for (const item of orderItems) {
    const ingredients = productIngredientMap.get(item.productId) || [];
    for (const ing of ingredients) {
      const currentDeduction = deductions.get(ing.ingredientId) || 0;
      deductions.set(
        ing.ingredientId,
        currentDeduction + ing.quantityPerProduct * item.quantity
      );
    }
  }

  return deductions;
}
