import { z } from 'zod';

import { finiteNonNegativeGrams } from './weights';

const SpoolAdjustmentObjectSchema = z.object({
	id: z.string().uuid('Identifiant ajustement doit être un UUID.'),
	spoolId: z.string().uuid(),
	previousRemainingWeightG: finiteNonNegativeGrams(),
	newRemainingWeightG: finiteNonNegativeGrams(),
	note: z
		.string({ required_error: 'Motif ou note obligatoire pour un ajustement.' })
		.min(1)
		.max(2000),
	createdAt: z.string().datetime({ offset: true }),
});

/**
 * Événement d'inventaire : correction manuelle du poids restant sans effacer l'historique (spec).
 */
export const SpoolAdjustmentSchema = SpoolAdjustmentObjectSchema.superRefine((row, ctx) => {
	if (row.previousRemainingWeightG === row.newRemainingWeightG) {
		ctx.addIssue({
			code: z.ZodIssueCode.custom,
			path: ['newRemainingWeightG'],
			message: 'Le nouveau poids doit différer de l’ancien.',
		});
	}
});

export type SpoolAdjustment = z.infer<typeof SpoolAdjustmentSchema>;

export const SpoolAdjustmentCreateInputSchema = z.object({
	spoolId: SpoolAdjustmentObjectSchema.shape.spoolId,
	newRemainingWeightG: finiteNonNegativeGrams(),
	note: SpoolAdjustmentObjectSchema.shape.note,
});

export type SpoolAdjustmentCreateInput = z.infer<typeof SpoolAdjustmentCreateInputSchema>;
