/**
 * Calculates the cost of a product based on its ingredients and their prices.
 */
export function calculateProductCost(
  ingredients: {
    quantity: number; // amount of ingredient per product unit
    pricePerUnit: number; // cost per unit of ingredient
  }[]
): number {
  const total = ingredients.reduce((sum, ing) => {
    return sum + ing.quantity * ing.pricePerUnit;
  }, 0);
  return roundCurrency(total);
}

/**
 * Calculates profit margin as a percentage.
 */
export function calculateMargin(sellingPrice: number, costPrice: number): number {
  if (sellingPrice === 0) return 0;
  return roundCurrency(((sellingPrice - costPrice) / sellingPrice) * 100);
}

/**
 * Calculates markup as a percentage.
 */
export function calculateMarkup(sellingPrice: number, costPrice: number): number {
  if (costPrice === 0) return 0;
  return roundCurrency(((sellingPrice - costPrice) / costPrice) * 100);
}

/**
 * Calculates tax amount for a given subtotal and rate.
 */
export function calculateTax(subtotal: number, taxRate: number): number {
  return roundCurrency(subtotal * taxRate);
}

/**
 * Calculates the price per unit from a bulk purchase.
 * E.g., bought 25kg flour for $30 → $1.20/kg
 */
export function calculatePricePerUnit(
  totalCost: number,
  quantity: number
): number {
  if (quantity === 0) return 0;
  return roundCurrency(totalCost / quantity);
}

/**
 * Auto-calculates a selling price based on ingredient cost and desired markup percentage.
 * E.g., cost = $5, markup = 60% → price = $5 * 1.60 = $8.00
 */
export function calculateAutoPrice(
  totalCostPerUnit: number,
  desiredMarkupPercent: number,
  additionalCostsPerUnit: number = 0
): {
  suggestedPrice: number;
  totalCost: number;
  profitPerUnit: number;
  actualMarginPercent: number;
} {
  const totalCost = totalCostPerUnit + additionalCostsPerUnit;
  const suggestedPrice = roundCurrency(totalCost * (1 + desiredMarkupPercent / 100));
  const profitPerUnit = roundCurrency(suggestedPrice - totalCost);
  const actualMarginPercent =
    suggestedPrice > 0
      ? roundCurrency((profitPerUnit / suggestedPrice) * 100)
      : 0;

  return {
    suggestedPrice,
    totalCost: roundCurrency(totalCost),
    profitPerUnit,
    actualMarginPercent,
  };
}

/**
 * Calculates per-product ingredient quantity from a batch.
 * E.g., 25kg flour makes 100 loaves → 0.25kg per loaf
 */
export function calculateBatchQuantityPerProduct(
  batchIngredientQty: number,
  batchYield: number
): number {
  if (batchYield === 0) return 0;
  return roundCurrency(batchIngredientQty / batchYield);
}

/**
 * Full pricing calculation from ingredients with auto-price.
 */
export function calculateFullPricing(
  ingredients: {
    ingredientName: string;
    quantityPerProduct: number;
    pricePerUnit: number;
    unit: string;
  }[],
  desiredMarkupPercent: number,
  additionalCostsPerUnit: number = 0
): {
  totalIngredientCost: number;
  additionalCosts: number;
  totalCostPerUnit: number;
  suggestedPrice: number;
  actualMarkupPercent: number;
  profitPerUnit: number;
  profitMarginPercent: number;
  ingredientBreakdown: {
    name: string;
    quantity: number;
    unit: string;
    costPerProduct: number;
  }[];
} {
  const ingredientBreakdown = ingredients.map((ing) => ({
    name: ing.ingredientName,
    quantity: ing.quantityPerProduct,
    unit: ing.unit,
    costPerProduct: roundCurrency(ing.quantityPerProduct * ing.pricePerUnit),
  }));

  const totalIngredientCost = roundCurrency(
    ingredientBreakdown.reduce((sum, ing) => sum + ing.costPerProduct, 0)
  );

  const totalCostPerUnit = roundCurrency(totalIngredientCost + additionalCostsPerUnit);
  const suggestedPrice = roundCurrency(totalCostPerUnit * (1 + desiredMarkupPercent / 100));
  const profitPerUnit = roundCurrency(suggestedPrice - totalCostPerUnit);
  const profitMarginPercent =
    suggestedPrice > 0
      ? roundCurrency((profitPerUnit / suggestedPrice) * 100)
      : 0;
  const actualMarkupPercent =
    totalCostPerUnit > 0
      ? roundCurrency((profitPerUnit / totalCostPerUnit) * 100)
      : 0;

  return {
    totalIngredientCost,
    additionalCosts: additionalCostsPerUnit,
    totalCostPerUnit,
    suggestedPrice,
    actualMarkupPercent,
    profitPerUnit,
    profitMarginPercent,
    ingredientBreakdown,
  };
}

/**
 * Generates the next order number (daily sequential).
 * Format: YYYYMMDD-NNN (e.g., 20260324-001)
 */
export function generateOrderNumber(
  date: Date,
  sequenceNumber: number
): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const seq = String(sequenceNumber).padStart(3, "0");
  return `${y}${m}${d}-${seq}`;
}

function roundCurrency(amount: number): number {
  return Math.round(amount * 100) / 100;
}
