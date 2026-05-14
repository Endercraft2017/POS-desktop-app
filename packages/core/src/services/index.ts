export {
  createEmptyCart,
  addItemToCart,
  updateItemQuantity,
  removeItemFromCart,
  applyCartDiscount,
  clearCart,
} from "./cart.service";

export {
  calculateProductCost,
  calculateMargin,
  calculateMarkup,
  calculateTax,
  calculatePricePerUnit,
  calculateAutoPrice,
  calculateBatchQuantityPerProduct,
  calculateFullPricing,
  generateOrderNumber,
} from "./pricing.service";

export {
  isLowStock,
  calculateMaxProducible,
  calculateStockDeductions,
} from "./inventory.service";

export {
  calculateDailyForecast,
  calculateWeeklyForecast,
  calculateMonthlyForecast,
} from "./forecast.service";

export {
  pushChanges,
  pullChanges,
  syncAll,
} from "./sync.service";
export type { SyncAdapter, SyncLogRow, SyncResult } from "./sync.service";

export {
  convertUnit,
  canConvert,
  getCompatibleUnits,
  formatWithBestUnit,
  getUnitLabel,
  normalizeUnit,
  getUnitType,
  isVolumeUnit,
  isWeightUnit,
  isCountUnit,
  ALL_UNITS,
  VOLUME_UNITS,
  WEIGHT_UNITS,
  COUNT_UNITS,
} from "./unit-conversion.service";
export type { Unit, VolumeUnit, WeightUnit, CountUnit } from "./unit-conversion.service";
