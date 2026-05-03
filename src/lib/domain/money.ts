import { z } from 'zod';

/**
 * Monetary amounts are represented in minor currency units (e.g. euro cents).
 * Fractional values stay out of IEEE floats; UI layers format with locale rules.
 *
 * Currency uses ISO 4217 alphabetic codes (uppercase) for stable storage keys.
 */
export const MoneyMinorSchema = z.object({
	minorUnits: z
		.number({ invalid_type_error: 'Montant doit être un nombre entier (centimes).' })
		.int('Montant doit être un nombre entier (centimes).')
		.nonnegative(),
	currency: z
		.string()
		.length(3, 'Devise doit être un code ISO 4217 à 3 lettres.')
		.regex(/^[A-Z]{3}$/, 'Devise doit être en majuscules (ex. EUR).'),
});

export type MoneyMinor = z.infer<typeof MoneyMinorSchema>;
