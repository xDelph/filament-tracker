import { z } from 'zod';

import { PrintStatusSchema } from './enums';

/**
 * Une impression représente une session d'impression pouvant tirer plusieurs bobines (`PrintFilamentUsage`).
 */
export const PrintSchema = z.object({
	id: z.string().uuid('Identifiant impression doit être un UUID.'),
	name: z
		.string({ required_error: 'Nom d’impression obligatoire.' })
		.min(1)
		.max(200),
	printedAt: z.string().datetime({ offset: true }),
	status: PrintStatusSchema,
	notes: z.string().max(5000).optional(),
	printerId: z.string().uuid().optional(),
	startedAt: z.string().datetime({ offset: true }).optional(),
	finishedAt: z.string().datetime({ offset: true }).optional(),
	timePrintingSec: z.number().finite().nonnegative().optional(),
	elapsedSec: z.number().finite().nonnegative().optional(),
	estimatedPrintTimeSec: z.number().finite().nonnegative().optional(),
	createdAt: z.string().datetime({ offset: true }),
	updatedAt: z.string().datetime({ offset: true }),
});

export type Print = z.infer<typeof PrintSchema>;

export const PrintCreateInputSchema = z.object({
	name: PrintSchema.shape.name,
	/** Fuseau préservé depuis `Date`; le dépôt peut surcharger après validation pour des audits déterministes. */
	printedAt: PrintSchema.shape.printedAt
		.optional()
		.default(() => new Date().toISOString()),
	status: PrintStatusSchema.default('completed'),
	notes: PrintSchema.shape.notes,
});

export type PrintCreateInput = z.infer<typeof PrintCreateInputSchema>;

export const PrintUpdateInputSchema = z.object({
	name: PrintSchema.shape.name.optional(),
	printedAt: PrintSchema.shape.printedAt.optional(),
	status: PrintStatusSchema.optional(),
	notes: z.union([z.string().max(5000), z.literal('')]).optional(),
});

export type PrintUpdateInput = z.infer<typeof PrintUpdateInputSchema>;
