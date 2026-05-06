/** Barrel réexport pour `src/lib/domain` (voir `docs/technical-stack.md`). */
export type {
	FilamentStandardMaterial,
	PrintStatus,
	SpoolStatus,
} from './enums';

export {
	FilamentStandardMaterialSchema,
	PrintStatusSchema,
	SpoolStatusSchema,
} from './enums';

export type { PurchaseDateInput } from './dates';

export { optionalClearablePurchaseDate, PurchaseDateInputSchema } from './dates';

export type { MoneyMinor } from './money';

export { formatMoneyMinor, MoneyMinorPurchaseSchema, MoneyMinorSchema } from './money';

export { finiteNonNegativeGrams, finitePositiveGrams } from './weights';

export type { LowStockOptions } from './inventory-cost';

export {
	clampRemainingToInitialRange,
	consumptionCostPerGramMinorUnits,
	consumptionMaterialCost,
	consumptionTotalGrams,
	DEFAULT_LOW_STOCK_THRESHOLDS,
	isLowStock,
	materialCostForGramsAtSpoolRate,
	remainingPercentOfInitial,
	remainingValueEstimateMinor,
	remainingWeightGrams,
	spoolCostPerGramMinorUnits,
	spoolStatusAfterRemainderChange,
	totalPrintMaterialCost,
} from './inventory-cost';

export type { Print, PrintCreateInput, PrintUpdateInput } from './print';

export { PrintSchema, PrintCreateInputSchema, PrintUpdateInputSchema } from './print';

export type {
	PrintFilamentUsage,
	PrintFilamentUsageCreateInput,
	PrintFilamentUsageUpdateInput,
} from './print-filament-usage';

export {
	PrintFilamentUsageSchema,
	PrintFilamentUsageCreateInputSchema,
	PrintFilamentUsageUpdateInputSchema,
} from './print-filament-usage';

export type {
	FilamentPaletteColorName,
	Spool,
	SpoolCreateInput,
	SpoolMaterial,
	SpoolUpdateInput,
} from './spool';

export {
	FILAMENT_DIAMETERS_MM,
	FILAMENT_PALETTE,
	FilamentDiameterSchema,
	FilamentPaletteColorNameSchema,
	SpoolCreateInputSchema,
	SpoolMaterialSchema,
	SpoolSchema,
	SpoolUpdateInputSchema,
	filamentHexForPaletteColor,
} from './spool';

export type { SpoolAdjustment, SpoolAdjustmentCreateInput } from './spool-adjustment';

export { SpoolAdjustmentSchema, SpoolAdjustmentCreateInputSchema } from './spool-adjustment';
