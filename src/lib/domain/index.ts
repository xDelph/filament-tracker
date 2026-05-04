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
	isLowStock,
	materialCostForGramsAtSpoolRate,
	remainingPercentOfInitial,
	remainingValueEstimateMinor,
	remainingWeightGrams,
	spoolCostPerGramMinorUnits,
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

export type { Spool, SpoolCreateInput, SpoolMaterial, SpoolUpdateInput } from './spool';

export {
	FILAMENT_DIAMETERS_MM,
	FilamentDiameterSchema,
	SpoolCreateInputSchema,
	SpoolMaterialSchema,
	SpoolSchema,
	SpoolUpdateInputSchema,
} from './spool';

export type { SpoolAdjustment, SpoolAdjustmentCreateInput } from './spool-adjustment';

export { SpoolAdjustmentSchema, SpoolAdjustmentCreateInputSchema } from './spool-adjustment';
