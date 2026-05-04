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

/** Format stored minor units for display (locale defaults to French grouping rules). */
export function formatMoneyMinor(amount: MoneyMinor, locale = 'fr-FR'): string {
	return new Intl.NumberFormat(locale, {
		style: 'currency',
		currency: amount.currency,
	}).format(amount.minorUnits / 100);
}

/**
 * Snapshot typique d’un achat de bobine ou d’une valeur stockée où un prix nul n’a pas lieu d’être.
 */
export const MoneyMinorPurchaseSchema = MoneyMinorSchema.superRefine((amount, ctx) => {
	if (amount.minorUnits <= 0) {
		ctx.addIssue({
			code: z.ZodIssueCode.custom,
			path: ['minorUnits'],
			message: 'Le prix doit être strictement positif (centimes).',
		});
	}
});
