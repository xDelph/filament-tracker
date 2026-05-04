import 'fake-indexeddb/auto';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { fixtureSpoolPlaGrey } from '$lib/test/fixtures/domain-fixtures';

import { FilamentTrackerDatabase } from './db';
import { createSpoolAdjustment, listAdjustmentsForSpool } from './spool-adjustments';

let database: FilamentTrackerDatabase;

beforeEach(async () => {
	database = new FilamentTrackerDatabase(`filament-tracker-test-${crypto.randomUUID()}`);
	await database.open();
	await database.spools.add(fixtureSpoolPlaGrey);
});

afterEach(async () => {
	await database.delete();
});

describe('createSpoolAdjustment', () => {
	it('negative adjustment: decreases remaining weight and keeps audit trail', async () => {
		const { adjustment, spool } = await createSpoolAdjustment(
			{
				spoolId: fixtureSpoolPlaGrey.id,
				newRemainingWeightG: 600,
				note: 'Kitchen scale check.',
			},
			database,
		);

		expect(adjustment.previousRemainingWeightG).toBe(fixtureSpoolPlaGrey.remainingWeightG);
		expect(adjustment.newRemainingWeightG).toBe(600);
		expect(adjustment.newRemainingWeightG).toBeLessThan(adjustment.previousRemainingWeightG);
		expect(spool.remainingWeightG).toBe(600);

		await expect(database.spoolAdjustments.count()).resolves.toBe(1);
	});

	it('positive adjustment: increases remaining weight without touching print history', async () => {
		const { adjustment, spool } = await createSpoolAdjustment(
			{
				spoolId: fixtureSpoolPlaGrey.id,
				newRemainingWeightG: 700,
				note: 'Corrected underestimate after partial wind-back.',
			},
			database,
		);

		expect(adjustment.previousRemainingWeightG).toBe(fixtureSpoolPlaGrey.remainingWeightG);
		expect(adjustment.newRemainingWeightG).toBe(700);
		expect(adjustment.newRemainingWeightG).toBeGreaterThan(adjustment.previousRemainingWeightG);
		expect(spool.remainingWeightG).toBe(700);

		await expect(database.spoolAdjustments.count()).resolves.toBe(1);
	});

	it('rejects identical remainder without persisting', async () => {
		await expect(
			createSpoolAdjustment(
				{
					spoolId: fixtureSpoolPlaGrey.id,
					newRemainingWeightG: fixtureSpoolPlaGrey.remainingWeightG,
					note: 'No-op.',
				},
				database,
			),
		).rejects.toThrow();

		await expect(database.spoolAdjustments.count()).resolves.toBe(0);
	});

	it('rejects remainder above initial weight without persisting', async () => {
		await expect(
			createSpoolAdjustment(
				{
					spoolId: fixtureSpoolPlaGrey.id,
					newRemainingWeightG: 9_999,
					note: 'Above capacity.',
				},
				database,
			),
		).rejects.toThrow(/poids initial/i);

		await expect(database.spoolAdjustments.count()).resolves.toBe(0);
		const stored = await database.spools.get(fixtureSpoolPlaGrey.id);
		expect(stored?.remainingWeightG).toBe(fixtureSpoolPlaGrey.remainingWeightG);
	});
});

describe('listAdjustmentsForSpool', () => {
	it('sorts newest first', async () => {
		await createSpoolAdjustment(
			{
				spoolId: fixtureSpoolPlaGrey.id,
				newRemainingWeightG: 610,
				note: 'First.',
			},
			database,
		);

		await new Promise((r) => setTimeout(r, 25));

		await createSpoolAdjustment(
			{
				spoolId: fixtureSpoolPlaGrey.id,
				newRemainingWeightG: 605,
				note: 'Second.',
			},
			database,
		);

		const rows = await listAdjustmentsForSpool(fixtureSpoolPlaGrey.id, database);
		expect(rows).toHaveLength(2);
		expect(rows[0]!.note).toBe('Second.');
		expect(rows[1]!.note).toBe('First.');
	});
});
