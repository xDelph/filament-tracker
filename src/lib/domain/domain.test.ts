import { describe, expect, it, vi } from 'vitest';

import {
	PrintCreateInputSchema,
	PrintFilamentUsageCreateInputSchema,
	SpoolAdjustmentCreateInputSchema,
	SpoolCreateInputSchema,
	SpoolSchema,
	SpoolUpdateInputSchema,
} from './index';

import {
	fixtureAdjustmentBenchScale,
	fixturePrintBenchy,
	fixtureSpoolPlaGrey,
	fixtureUsageBenchyGrey,
} from '../test/fixtures/domain-fixtures';

describe('domain fixtures', () => {
	it('valide les artefacts synthétiques', () => {
		expect(fixtureSpoolPlaGrey.material.kind).toBe('catalog');
		expect(fixtureUsageBenchyGrey.cost.minorUnits).toBeGreaterThan(0);
		expect(fixtureAdjustmentBenchScale.note.length).toBeGreaterThan(0);
		expect(fixturePrintBenchy.status).toBe('failed');
	});

	it('refuse une bobine où le restant dépasse le poids initial', () => {
		const dup = structuredClone(fixtureSpoolPlaGrey);
		dup.remainingWeightG = dup.initialWeightG + 1;

		const parsed = SpoolSchema.safeParse(dup);
		expect(parsed.success).toBe(false);
	});
});

describe('create/edit schemas', () => {
	it('accepte une création minimale conforme MVP', () => {
		expect(
			SpoolCreateInputSchema.safeParse({
				name: 'Test spool',
				material: { kind: 'catalog', code: 'PLA' },
				colorName: 'Bleu',
				initialWeightG: 1000,
				purchasePrice: { minorUnits: 2599, currency: 'EUR' },
			}).success,
		).toBe(true);
	});

	it('applique 1000 g par défaut pour initialWeightG quand le champ est absent', () => {
		const parsed = SpoolCreateInputSchema.parse({
			name: 'Default weight spool',
			material: { kind: 'catalog', code: 'PLA' },
			colorName: 'Blue',
			purchasePrice: { minorUnits: 2599, currency: 'EUR' },
		});

		expect(parsed.initialWeightG).toBe(1000);
	});

	it('rejette un prix en float', () => {
		const result = PrintFilamentUsageCreateInputSchema.safeParse({
			spoolId: fixtureSpoolPlaGrey.id,
			usedWeightG: 10,
			cost: { minorUnits: 10.25, currency: 'EUR' },
		});

		expect(result.success).toBe(false);
	});

	it('rejette une couleur hors liste à la création de bobine', () => {
		expect(
			SpoolCreateInputSchema.safeParse({
				name: 'Test',
				material: { kind: 'catalog', code: 'PLA' },
				colorName: 'Magenta custom',
				initialWeightG: 1000,
				purchasePrice: { minorUnits: 100, currency: 'EUR' },
			}).success,
		).toBe(false);
	});

	it('exige un prix strictement positif à la création de bobine', () => {
		expect(
			SpoolCreateInputSchema.safeParse({
				name: 'Gratuite',
				material: { kind: 'catalog', code: 'PLA' },
				colorName: 'Bleu',
				initialWeightG: 1000,
				purchasePrice: { minorUnits: 0, currency: 'EUR' },
			}).success,
		).toBe(false);

		expect(
			SpoolCreateInputSchema.safeParse({
				name: 'Paid',
				material: { kind: 'catalog', code: 'PLA' },
				colorName: 'Bleu',
				initialWeightG: 1000,
				purchasePrice: { minorUnits: 1, currency: 'EUR' },
			}).success,
		).toBe(true);
	});

	it('normalise les dates calendaires d’achat', () => {
		const parsed = SpoolCreateInputSchema.parse({
			name: 'Date test',
			material: { kind: 'catalog', code: 'PLA' },
			colorName: 'Bleu',
			initialWeightG: 1000,
			purchasePrice: { minorUnits: 2599, currency: 'EUR' },
			purchaseDate: '2026-03-01',
		});

		expect(parsed.purchaseDate).toBe('2026-03-01T00:00:00.000Z');
	});

	it('réinitialise la date d’achat via chaîne vide en update', () => {
		const parsed = SpoolUpdateInputSchema.parse({ purchaseDate: '   ' });

		expect(parsed.purchaseDate).toBeUndefined();
	});

	it('exige une note non vide pour les ajustements', () => {
		expect(
			SpoolAdjustmentCreateInputSchema.safeParse({
				spoolId: fixtureSpoolPlaGrey.id,
				newRemainingWeightG: 500,
				note: '',
			}).success,
		).toBe(false);

		expect(
			SpoolAdjustmentCreateInputSchema.safeParse({
				spoolId: fixtureSpoolPlaGrey.id,
				newRemainingWeightG: 500,
				note: 'Balance recalibrated',
			}).success,
		).toBe(true);
	});

	it('applique date et statut par défaut sur une création impression', () => {
		vi.useFakeTimers();

		try {
			vi.setSystemTime(new Date('2026-05-03T14:07:41.883Z'));

			const parsed = PrintCreateInputSchema.parse({ name: 'Calibration cube' });

			expect(parsed.status).toBe('completed');
			expect(parsed.printedAt).toBe('2026-05-03T14:07:41.883Z');
		} finally {
			vi.useRealTimers();
		}
	});
});
