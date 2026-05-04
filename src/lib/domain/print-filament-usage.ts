import { z } from 'zod';

import { MoneyMinorSchema } from './money';
import { finiteNonNegativeGrams, finitePositiveGrams } from './weights';

/**
 * Une ligne de consommation lie une impression à une bobine précise avec coût figé au moment du save (spec).
 */
export const PrintFilamentUsageSchema = z.object({
	id: z.string().uuid('Identifiant consommation doit être un UUID.'),
	printId: z.string().uuid(),
	spoolId: z.string().uuid(),
	usedWeightG: finitePositiveGrams('Grammes utilisées doivent être > 0.'),
	wasteWeightG: finiteNonNegativeGrams().default(0),
	/** Coût matière pour cette ligne, figé à l’écriture (spec). */
	cost: MoneyMinorSchema,
	createdAt: z.string().datetime({ offset: true }),
	updatedAt: z.string().datetime({ offset: true }),
});

export type PrintFilamentUsage = z.infer<typeof PrintFilamentUsageSchema>;

export const PrintFilamentUsageCreateInputSchema = z.object({
	spoolId: PrintFilamentUsageSchema.shape.spoolId,
	usedWeightG: PrintFilamentUsageSchema.shape.usedWeightG,
	wasteWeightG: finiteNonNegativeGrams().optional().default(0),
	cost: MoneyMinorSchema,
});

export type PrintFilamentUsageCreateInput = z.infer<typeof PrintFilamentUsageCreateInputSchema>;

export const PrintFilamentUsageUpdateInputSchema = z.object({
	spoolId: PrintFilamentUsageSchema.shape.spoolId.optional(),
	usedWeightG: finitePositiveGrams().optional(),
	wasteWeightG: finiteNonNegativeGrams().optional(),
	cost: MoneyMinorSchema.optional(),
});

export type PrintFilamentUsageUpdateInput = z.infer<typeof PrintFilamentUsageUpdateInputSchema>;
