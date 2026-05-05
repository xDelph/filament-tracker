import { describe, expect, it } from 'vitest';

import { PrintFilamentUsageSchema } from './print-filament-usage';
import {
	clampRemainingToInitialRange,
	consumptionCostPerGramMinorUnits,
	consumptionMaterialCost,
	consumptionTotalGrams,
	isLowStock,
	materialCostForGramsAtSpoolRate,
	remainingPercentOfInitial,
	remainingValueEstimateMinor,
	remainingWeightGrams,
	spoolCostPerGramMinorUnits,
	spoolStatusAfterRemainderChange,
	totalPrintMaterialCost,
} from './inventory-cost';

import {
	fixtureSpoolFlex,
	fixtureSpoolPlaGrey,
	fixtureUsageBenchyGrey,
} from '../test/fixtures/domain-fixtures';

describe('inventory-cost', () => {
	it('calcule le coût par gramme à partir du prix d’achat', () => {
		expect(spoolCostPerGramMinorUnits(fixtureSpoolPlaGrey)).toBeCloseTo(2.499, 6);
	});

	it('estime la valeur résiduelle proportionnelle au restant', () => {
		expect(remainingValueEstimateMinor(fixtureSpoolPlaGrey)).toEqual({
			minorUnits: 1546,
			currency: 'EUR',
		});
		expect(remainingValueEstimateMinor(fixtureSpoolFlex).minorUnits).toBe(0);
	});

	it('retourne NaN si le poids initial est nul', () => {
		const broken = { ...fixtureSpoolPlaGrey, initialWeightG: 0 };
		expect(Number.isNaN(spoolCostPerGramMinorUnits(broken))).toBe(true);
	});

	it('estime le coût matière d’une consommation comme dans les fixtures', () => {
		const grams = consumptionTotalGrams(fixtureUsageBenchyGrey);
		expect(grams).toBeCloseTo(66.4, 6);

		const estimated = materialCostForGramsAtSpoolRate(fixtureSpoolPlaGrey, grams);
		expect(estimated).toEqual({
			minorUnits: 166,
			currency: 'EUR',
		});
		expect(consumptionMaterialCost(fixtureUsageBenchyGrey).minorUnits).toBe(166);
	});

	it('arrondit à l’entier le plus proche (0.5 vers le haut)', () => {
		const spool = {
			purchasePrice: { minorUnits: 3, currency: 'EUR' as const },
			initialWeightG: 4,
		};
		expect(materialCostForGramsAtSpoolRate(spool, 1).minorUnits).toBe(1);
		expect(materialCostForGramsAtSpoolRate(spool, 2).minorUnits).toBe(2);
	});

	it('retourne 0 centimes pour un poids négatif ou non fini', () => {
		const costNeg = materialCostForGramsAtSpoolRate(fixtureSpoolPlaGrey, -10);
		expect(costNeg.minorUnits).toBe(0);

		const costNan = materialCostForGramsAtSpoolRate(fixtureSpoolPlaGrey, Number.NaN);
		expect(costNan.minorUnits).toBe(0);
	});

	it('agrège le coût total d’une impression', () => {
		const extra = PrintFilamentUsageSchema.parse({
			...fixtureUsageBenchyGrey,
			id: '123e4567-e89b-12d3-a456-426614174001',
			spoolId: fixtureSpoolFlex.id,
			cost: { minorUnits: 50, currency: 'EUR' },
		});

		const total = totalPrintMaterialCost(
			[fixtureUsageBenchyGrey, extra],
			'EUR',
		);
		expect(total).toEqual({ minorUnits: 216, currency: 'EUR' });
	});

	it('accepte une impression sans ligne avec devise explicite', () => {
		expect(totalPrintMaterialCost([], 'EUR')).toEqual({
			minorUnits: 0,
			currency: 'EUR',
		});
	});

	it('rejette une devise vide ou non ISO 4217 pour un total à 0 ligne', () => {
		expect(() => totalPrintMaterialCost([], '')).toThrowError(/ISO 4217/i);
		expect(() => totalPrintMaterialCost([], 'eu')).toThrowError(/ISO 4217/i);
	});

	it('rejette une somme hors plage entière sûre', () => {
		const hi = Number.MAX_SAFE_INTEGER;
		expect(() =>
			totalPrintMaterialCost(
				[
					{ cost: { minorUnits: hi, currency: 'EUR' } },
					{ cost: { minorUnits: 2, currency: 'EUR' } },
				],
				'EUR',
			),
		).toThrowError(/safe integer/i);
	});

	it('rejette un mélange de devises', () => {
		const mixed = PrintFilamentUsageSchema.parse({
			...fixtureUsageBenchyGrey,
			id: '123e4567-e89b-12d3-a456-426614174002',
			cost: { minorUnits: 10, currency: 'USD' },
		});

		expect(() =>
			totalPrintMaterialCost([fixtureUsageBenchyGrey, mixed], 'EUR'),
		).toThrowError(/mixed currency/i);
	});

	it('expose le poids total et le coût moyen par gramme pour une ligne', () => {
		expect(consumptionTotalGrams(fixtureUsageBenchyGrey)).toBeCloseTo(66.4, 6);
		expect(consumptionCostPerGramMinorUnits(fixtureUsageBenchyGrey)).toBeCloseTo(
			166 / 66.4,
			6,
		);
	});

	it('retourne NaN si la consommation n’a aucun poids', () => {
		const zeroGramsLine = {
			usedWeightG: 0,
			wasteWeightG: 0,
			cost: fixtureUsageBenchyGrey.cost,
		};
		expect(Number.isNaN(consumptionCostPerGramMinorUnits(zeroGramsLine))).toBe(true);
	});

	it('calcule le pourcentage restant et expose le poids résiduel', () => {
		expect(remainingWeightGrams(fixtureSpoolPlaGrey)).toBe(618.75);
		expect(remainingPercentOfInitial(618.75, 1000)).toBeCloseTo(61.875, 6);
		expect(Number.isNaN(remainingPercentOfInitial(100, 0))).toBe(true);
	});

	it('détecte le stock bas par seuils absolus ou relatifs', () => {
		expect(
			isLowStock(40, 1000, { maxRemainingGrams: 50 }),
		).toBe(true);

		expect(
			isLowStock(60, 1000, { maxRemainingGrams: 50 }),
		).toBe(false);

		expect(
			isLowStock(40, 1000, { maxRemainingPercent: 5 }),
		).toBe(true);

		expect(
			isLowStock(100, 1000, { maxRemainingPercent: 5 }),
		).toBe(false);

		expect(isLowStock(500, 1000, {})).toBe(false);
	});

	it('borne le restant lorsque les entrées dépassent le poids initial', () => {
		expect(clampRemainingToInitialRange(1200, 1000)).toBe(1000);
		expect(clampRemainingToInitialRange(-10, 1000)).toBe(0);
		expect(clampRemainingToInitialRange(Number.POSITIVE_INFINITY, 100)).toBe(100);
	});
});

describe('spoolStatusAfterRemainderChange', () => {
	const active1000 = { status: 'active' as const, initialWeightG: 1000 };

	it('laisse une bobine archivée inchangée quel que soit le restant', () => {
		expect(
			spoolStatusAfterRemainderChange({ status: 'archived', initialWeightG: 1000 }, 400),
		).toBe('archived');
		expect(
			spoolStatusAfterRemainderChange({ status: 'archived', initialWeightG: 1000 }, 0),
		).toBe('archived');
	});

	it('passe à vide lorsque le restant est nul ou négatif', () => {
		expect(spoolStatusAfterRemainderChange(active1000, 0)).toBe('empty');
		expect(spoolStatusAfterRemainderChange(active1000, -1)).toBe('empty');
	});

	it('applique stock bas avec les seuils par défaut', () => {
		expect(spoolStatusAfterRemainderChange(active1000, 80)).toBe('low');
		// Au-dessus du seuil absolu (100 g) et du seuil relatif (~15 % du stock initial).
		expect(spoolStatusAfterRemainderChange(active1000, 160)).toBe('active');
	});

	it('respecte des seuils personnalisés', () => {
		expect(
			spoolStatusAfterRemainderChange(active1000, 200, { maxRemainingGrams: 50 }),
		).toBe('active');
		expect(
			spoolStatusAfterRemainderChange(active1000, 200, { maxRemainingGrams: 250 }),
		).toBe('low');
	});
});
