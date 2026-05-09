import { z } from 'zod';

export const PrintObjectSchema = z.object({
	id: z.string().uuid(),
	printId: z.string().uuid(),
	name: z.string().min(1).max(500),
	/** Quantité agrégée ou occurrence unitaire selon la stratégie d’import. */
	quantity: z.number().int().positive().optional(),
});

export type PrintObject = z.infer<typeof PrintObjectSchema>;
