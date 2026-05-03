import { describe, expect, it } from 'vitest';

import {
	PrintCreateInputSchema,
	PrintFilamentUsageCreateInputSchema,
	SpoolAdjustmentCreateInputSchema,
	SpoolCreateInputSchema,
	SpoolSchema,
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
				colorName: 'Blue',
				initialWeightG: 1000,
				purchasePrice: { minorUnits: 2599, currency: 'EUR' },
			}).success,
		).toBe(true);
	});

	it('rejette un prix en float', () => {
		const result = PrintFilamentUsageCreateInputSchema.safeParse({
			spoolId: fixtureSpoolPlaGrey.id,
			usedWeightG: 10,
			cost: { minorUnits: 10.25, currency: 'EUR' },
		});

		expect(result.success).toBe(false);
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

	it('applique un statut par défaut sur une impression créée sans date', () => {
		const parsed = PrintCreateInputSchema.parse({ name: 'Calibration cube' });

		expect(parsed.status).toBe('completed');
	});
});
