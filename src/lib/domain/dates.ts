import { z } from 'zod';

/**
 * Champ « date » côté UI : accepte soit une journée UTC (`YYYY-MM-DD`), soit un instant ISO complet.
 * Les dates calendaires sont normalisées en minuit UTC pour un stockage cohérent côté entité (`Spool.purchaseDate`).
 */
const CalendarDaySchema = z
	.string()
	.regex(/^\d{4}-\d{2}-\d{2}$/, 'Date attendue au format AAAA-MM-JJ ou ISO 8601 avec fuseau.')
	.superRefine((value, ctx) => {
		const [year, month, day] = value.split('-').map((part) => Number.parseInt(part, 10));

		if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
			ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Date invalide.' });
			return;
		}

		const utc = new Date(Date.UTC(year, month - 1, day));

		if (
			utc.getUTCFullYear() !== year ||
			utc.getUTCMonth() !== month - 1 ||
			utc.getUTCDate() !== day
		) {
			ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Date invalide (calendrier).' });
		}
	});

const CalendarDayToMidnightUtc = CalendarDaySchema.transform(
	(day) => `${day}T00:00:00.000Z` as string,
);

const InstantPurchaseDateSchema = z.string().datetime({ offset: true });

/** Entrées formulaire / import : fuseau implicite en UTC pour une date calendaire nue. */
export const PurchaseDateInputSchema = z.union([InstantPurchaseDateSchema, CalendarDayToMidnightUtc]);

export type PurchaseDateInput = z.infer<typeof PurchaseDateInputSchema>;

/** Met à jour un champ optional en autorisant `''` pour effacer avant normalisation éventuelle. */
export function optionalClearablePurchaseDate() {
	return z.preprocess(
		(value) => {
			if (typeof value !== 'string') {
				return value;
			}

			return value.trim() === '' ? undefined : value;
		},
		PurchaseDateInputSchema.optional(),
	);
}
