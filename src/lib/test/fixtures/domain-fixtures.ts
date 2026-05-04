/**
 * Fixtures représentatives pour tests et développement (spec « bobines / impressions »).
 * Les valeurs restent synthétiques ; calculs métier vérifiant la cohérence arrivent avec l’issue calculs.
 */
import {
	PrintFilamentUsageSchema,
	PrintSchema,
	type Spool,
	SpoolAdjustmentSchema,
	SpoolSchema,
} from '../../domain';

/** Bobine catalogue PLA, stock partiel après quelques tirages fictifs */
export const fixtureSpoolPlaGrey: Spool = SpoolSchema.parse({
	id: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
	name: 'Prusament PLA — Urban Grey',
	brand: 'Prusa',
	material: { kind: 'catalog', code: 'PLA' },
	colorName: 'Urban Grey',
	colorHex: '#6B7280',
	initialWeightG: 1000,
	remainingWeightG: 618.75,
	purchasePrice: { minorUnits: 2499, currency: 'EUR' },
	purchaseDate: '2026-03-01T12:00:00.000Z',
	diameterMm: 1.75,
	densityGCm3: 1.24,
	status: 'active',
	supplier: 'Prusa Research',
	notes: 'Bobine exemple pour flux dashboard.',
	createdAt: '2026-03-01T08:05:11.125Z',
	updatedAt: '2026-05-03T10:41:52.983Z',
});

export const fixtureSpoolFlex = SpoolSchema.parse({
	id: 'b4d7d5c9-91e3-4975-9bbf-62d74d4c91d2',
	name: 'Extrudr Flex semiflex',
	material: { kind: 'custom', label: 'Semiflex PETG Blend' },
	colorName: 'Signal Orange',
	initialWeightG: 800,
	remainingWeightG: 0,
	purchasePrice: { minorUnits: 3199, currency: 'EUR' },
	diameterMm: 1.75,
	status: 'empty',
	supplier: 'Extrudr',
	createdAt: '2026-01-15T16:42:07.412Z',
	updatedAt: '2026-04-22T06:58:41.771Z',
});

export const fixturePrintBenchy = PrintSchema.parse({
	id: '0d6d5e74-91e3-4c7b-9125-111111ffffff',
	name: '#3DLab — Benchy QA',
	printedAt: '2026-05-02T07:41:09.442Z',
	status: 'failed',
	notes: 'Warping léger mais matière bien comptabilisée.',
	createdAt: '2026-05-02T07:43:51.442Z',
	updatedAt: '2026-05-02T07:43:51.442Z',
});

/** Ligne mono-bobine rattachée au benchy fictif ci-dessus */
export const fixtureUsageBenchyGrey = PrintFilamentUsageSchema.parse({
	id: '6d74d94c-bd7c-4826-9356-aaaaaaaaaaaa',
	printId: fixturePrintBenchy.id,
	spoolId: fixtureSpoolPlaGrey.id,
	usedWeightG: 52.35,
	wasteWeightG: 14.05,
	cost: { minorUnits: 166, currency: 'EUR' },
	createdAt: fixturePrintBenchy.createdAt,
	updatedAt: fixturePrintBenchy.updatedAt,
});

/** Ajustement manuel après pesée précise au kilo */
export const fixtureAdjustmentBenchScale = SpoolAdjustmentSchema.parse({
	id: '2d5d5e94-93e5-4935-8312-bbbbbbbbbbbb',
	spoolId: fixtureSpoolPlaGrey.id,
	previousRemainingWeightG: 618.75,
	newRemainingWeightG: 612.01,
	note: 'Pesée sur balance de cuisine après calibration.',
	createdAt: '2026-05-03T07:58:41.883Z',
});
