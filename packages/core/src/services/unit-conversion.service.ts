/**
 * Unit conversion service for recipe ingredients.
 * Supports volume (mL, L, cups, tbsp, tsp) and weight (g, kg, oz, lb) conversions.
 */

// ---------------------------------------------------------------------------
// Unit definitions
// ---------------------------------------------------------------------------

export type VolumeUnit = "mL" | "L" | "cup" | "tbsp" | "tsp";
export type WeightUnit = "g" | "kg" | "oz" | "lb";
export type CountUnit = "pcs" | "each" | "piece";
export type Unit = VolumeUnit | WeightUnit | CountUnit;

export const ALL_UNITS: Unit[] = [
  "g", "kg", "oz", "lb",
  "mL", "L", "cup", "tbsp", "tsp",
  "pcs", "each", "piece",
];

export const VOLUME_UNITS: VolumeUnit[] = ["mL", "L", "cup", "tbsp", "tsp"];
export const WEIGHT_UNITS: WeightUnit[] = ["g", "kg", "oz", "lb"];
export const COUNT_UNITS: CountUnit[] = ["pcs", "each", "piece"];

// ---------------------------------------------------------------------------
// Conversion factors (everything → base unit)
// Base unit for volume: mL
// Base unit for weight: g
// ---------------------------------------------------------------------------

const TO_ML: Record<VolumeUnit, number> = {
  mL: 1,
  L: 1000,
  cup: 236.588,
  tbsp: 14.787,
  tsp: 4.929,
};

const TO_G: Record<WeightUnit, number> = {
  g: 1,
  kg: 1000,
  oz: 28.3495,
  lb: 453.592,
};

// ---------------------------------------------------------------------------
// Unit classification
// ---------------------------------------------------------------------------

export function isVolumeUnit(unit: string): unit is VolumeUnit {
  return VOLUME_UNITS.includes(unit as VolumeUnit);
}

export function isWeightUnit(unit: string): unit is WeightUnit {
  return WEIGHT_UNITS.includes(unit as WeightUnit);
}

export function isCountUnit(unit: string): unit is CountUnit {
  return COUNT_UNITS.includes(unit as CountUnit);
}

export function getUnitType(unit: string): "volume" | "weight" | "count" | "unknown" {
  if (isVolumeUnit(unit)) return "volume";
  if (isWeightUnit(unit)) return "weight";
  if (isCountUnit(unit)) return "count";
  return "unknown";
}

/**
 * Check if two units are convertible (same type).
 */
export function canConvert(from: string, to: string): boolean {
  const fromType = getUnitType(from);
  const toType = getUnitType(to);
  if (fromType === "unknown" || toType === "unknown") return false;
  return fromType === toType;
}

// ---------------------------------------------------------------------------
// Conversion
// ---------------------------------------------------------------------------

/**
 * Convert a quantity from one unit to another.
 * Returns null if units are incompatible (e.g., mL → g).
 */
export function convertUnit(
  quantity: number,
  from: string,
  to: string
): number | null {
  if (from === to) return quantity;

  // Normalize common aliases
  const normFrom = normalizeUnit(from);
  const normTo = normalizeUnit(to);
  if (normFrom === normTo) return quantity;

  // Volume → Volume
  if (isVolumeUnit(normFrom) && isVolumeUnit(normTo)) {
    const inMl = quantity * TO_ML[normFrom];
    return round(inMl / TO_ML[normTo]);
  }

  // Weight → Weight
  if (isWeightUnit(normFrom) && isWeightUnit(normTo)) {
    const inG = quantity * TO_G[normFrom];
    return round(inG / TO_G[normTo]);
  }

  // Count → Count (pcs, each, piece are interchangeable)
  if (isCountUnit(normFrom) && isCountUnit(normTo)) {
    return quantity;
  }

  // Incompatible types
  return null;
}

/**
 * Get all compatible units for a given unit.
 */
export function getCompatibleUnits(unit: string): string[] {
  const norm = normalizeUnit(unit);
  if (isVolumeUnit(norm)) return [...VOLUME_UNITS];
  if (isWeightUnit(norm)) return [...WEIGHT_UNITS];
  if (isCountUnit(norm)) return [...COUNT_UNITS];
  return [unit];
}

/**
 * Format a quantity with its unit for display.
 * Auto-scales to the most readable unit (e.g., 1500 mL → 1.5 L).
 */
export function formatWithBestUnit(
  quantity: number,
  unit: string
): { quantity: number; unit: string } {
  const norm = normalizeUnit(unit);

  if (isVolumeUnit(norm)) {
    const ml = quantity * TO_ML[norm];
    if (ml >= 1000) return { quantity: round(ml / 1000), unit: "L" };
    if (ml >= 236) return { quantity: round(ml / 236.588), unit: "cup" };
    if (ml >= 15) return { quantity: round(ml / 14.787), unit: "tbsp" };
    if (ml < 5) return { quantity: round(ml / 4.929), unit: "tsp" };
    return { quantity: round(ml), unit: "mL" };
  }

  if (isWeightUnit(norm)) {
    const g = quantity * TO_G[norm];
    if (g >= 1000) return { quantity: round(g / 1000), unit: "kg" };
    return { quantity: round(g), unit: "g" };
  }

  return { quantity, unit };
}

/**
 * Get a human-readable label for a unit.
 */
export function getUnitLabel(unit: string): string {
  const labels: Record<string, string> = {
    mL: "Milliliters (mL)",
    L: "Liters (L)",
    cup: "Cups",
    tbsp: "Tablespoons (tbsp)",
    tsp: "Teaspoons (tsp)",
    g: "Grams (g)",
    kg: "Kilograms (kg)",
    oz: "Ounces (oz)",
    lb: "Pounds (lb)",
    pcs: "Pieces",
    each: "Each",
    piece: "Piece",
  };
  return labels[unit] || unit;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Normalize common unit aliases to canonical form.
 */
export function normalizeUnit(unit: string): string {
  const aliases: Record<string, string> = {
    ml: "mL",
    milliliter: "mL",
    milliliters: "mL",
    l: "L",
    liter: "L",
    liters: "L",
    litre: "L",
    litres: "L",
    cups: "cup",
    tablespoon: "tbsp",
    tablespoons: "tbsp",
    teaspoon: "tsp",
    teaspoons: "tsp",
    gram: "g",
    grams: "g",
    kilogram: "kg",
    kilograms: "kg",
    ounce: "oz",
    ounces: "oz",
    pound: "lb",
    pounds: "lb",
    piece: "pcs",
    pieces: "pcs",
    each: "pcs",
  };
  return aliases[unit.toLowerCase()] || unit;
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}
