import type {
  DailyForecastInput,
  DailyForecastResult,
  ExpenseFrequency,
} from "../types";

/**
 * Converts an expense to its daily equivalent.
 */
function toDailyCost(amount: number, frequency: ExpenseFrequency): number {
  switch (frequency) {
    case "daily":
      return amount;
    case "weekly":
      return amount / 7;
    case "monthly":
      return amount / 30;
    case "per_use":
      return amount; // per_use is treated as daily when used
    default:
      return amount;
  }
}

/**
 * Calculates a comprehensive daily sales forecast.
 *
 * Takes into account:
 * - Average customers per day and their average spend
 * - Risk percentage (reduces projected revenue — e.g., slow days, no-shows)
 * - All operational expenses (wages, gas, butane, rent, etc.) normalized to daily
 * - Optional product-level breakdown with individual cost/profit
 */
export function calculateDailyForecast(
  input: DailyForecastInput
): DailyForecastResult {
  // Projected gross revenue
  const projectedGrossRevenue = roundCurrency(
    input.avgCustomersPerDay * input.avgSpendPerCustomer
  );

  // Apply risk reduction
  const riskMultiplier = 1 - input.riskPercentage / 100;
  const riskAdjustedRevenue = roundCurrency(
    projectedGrossRevenue * riskMultiplier
  );

  // Calculate daily expenses
  const expenseBreakdown = input.operationalExpenses.map((exp) => ({
    name: exp.name,
    dailyCost: roundCurrency(toDailyCost(exp.amount, exp.frequency)),
    category: "operational",
  }));

  const totalDailyExpenses = roundCurrency(
    expenseBreakdown.reduce((sum, e) => sum + e.dailyCost, 0)
  );

  // Net profit
  const projectedNetProfit = roundCurrency(
    riskAdjustedRevenue - totalDailyExpenses
  );

  // Break-even: how many customers needed to cover expenses
  const breakEvenCustomers =
    input.avgSpendPerCustomer > 0
      ? Math.ceil(totalDailyExpenses / input.avgSpendPerCustomer)
      : 0;

  // Profit margin
  const profitMargin =
    riskAdjustedRevenue > 0
      ? roundCurrency((projectedNetProfit / riskAdjustedRevenue) * 100)
      : 0;

  // Product-level forecast
  const productForecast = (input.productMix || []).map((p) => {
    const revenue = roundCurrency(p.estimatedDailySales * p.sellingPrice);
    const cost = roundCurrency(p.estimatedDailySales * p.costPrice);
    return {
      productName: p.productName,
      estimatedDailySales: p.estimatedDailySales,
      revenue,
      cost,
      profit: roundCurrency(revenue - cost),
    };
  });

  return {
    projectedGrossRevenue,
    riskAdjustedRevenue,
    totalDailyExpenses,
    projectedNetProfit,
    breakEvenCustomers,
    profitMargin,
    expenseBreakdown,
    productForecast,
  };
}

/**
 * Calculates weekly forecast from daily forecast.
 */
export function calculateWeeklyForecast(
  dailyForecast: DailyForecastResult
): DailyForecastResult {
  return {
    projectedGrossRevenue: roundCurrency(dailyForecast.projectedGrossRevenue * 7),
    riskAdjustedRevenue: roundCurrency(dailyForecast.riskAdjustedRevenue * 7),
    totalDailyExpenses: roundCurrency(dailyForecast.totalDailyExpenses * 7),
    projectedNetProfit: roundCurrency(dailyForecast.projectedNetProfit * 7),
    breakEvenCustomers: dailyForecast.breakEvenCustomers * 7,
    profitMargin: dailyForecast.profitMargin,
    expenseBreakdown: dailyForecast.expenseBreakdown.map((e) => ({
      ...e,
      dailyCost: roundCurrency(e.dailyCost * 7),
    })),
    productForecast: dailyForecast.productForecast.map((p) => ({
      ...p,
      estimatedDailySales: p.estimatedDailySales * 7,
      revenue: roundCurrency(p.revenue * 7),
      cost: roundCurrency(p.cost * 7),
      profit: roundCurrency(p.profit * 7),
    })),
  };
}

/**
 * Calculates monthly forecast (30 days) from daily forecast.
 */
export function calculateMonthlyForecast(
  dailyForecast: DailyForecastResult
): DailyForecastResult {
  return {
    projectedGrossRevenue: roundCurrency(dailyForecast.projectedGrossRevenue * 30),
    riskAdjustedRevenue: roundCurrency(dailyForecast.riskAdjustedRevenue * 30),
    totalDailyExpenses: roundCurrency(dailyForecast.totalDailyExpenses * 30),
    projectedNetProfit: roundCurrency(dailyForecast.projectedNetProfit * 30),
    breakEvenCustomers: dailyForecast.breakEvenCustomers * 30,
    profitMargin: dailyForecast.profitMargin,
    expenseBreakdown: dailyForecast.expenseBreakdown.map((e) => ({
      ...e,
      dailyCost: roundCurrency(e.dailyCost * 30),
    })),
    productForecast: dailyForecast.productForecast.map((p) => ({
      ...p,
      estimatedDailySales: p.estimatedDailySales * 30,
      revenue: roundCurrency(p.revenue * 30),
      cost: roundCurrency(p.cost * 30),
      profit: roundCurrency(p.profit * 30),
    })),
  };
}

function roundCurrency(amount: number): number {
  return Math.round(amount * 100) / 100;
}
