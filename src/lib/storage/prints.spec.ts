import 'fake-indexeddb/auto';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { fixtureSpoolFlex, fixtureSpoolPlaGrey } from '$lib/test/fixtures/domain-fixtures';

import { FilamentTrackerDatabase } from './db';
import { PrintPersistenceError, createPrintWithUsages } from './prints';

let database: FilamentTrackerDatabase;

beforeEach(async () => {
	database = new FilamentTrackerDatabase(`filament-tracker-test-${crypto.randomUUID()}`);
	await database.open();
	await database.spools.bulkPut([
		fixtureSpoolPlaGrey,
		{ ...fixtureSpoolFlex, remainingWeightG: 6, status: 'low' },
	]);
});

afterEach(async () => {
	await database.delete();
});

describe('createPrintWithUsages', () => {
	it('persists a print, usage rows, cost snapshots, and updated spool weights', async () => {
		const result = await createPrintWithUsages(
			{
				name: 'Dragon drawer',
				status: 'completed',
				printedAt: '2026-05-04T08:00:00.000Z',
				usages: [
					{ spoolId: fixtureSpoolPlaGrey.id, usedWeightG: 40, wasteWeightG: 2 },
					{ spoolId: fixtureSpoolFlex.id, usedWeightG: 5, wasteWeightG: 1 },
				],
			},
			database,
		);

		expect(result.print.name).toBe('Dragon drawer');
		expect(result.usages).toHaveLength(2);
		expect(result.usages[0]!.cost).toEqual({ minorUnits: 105, currency: 'EUR' });
		expect(result.usages[1]!.cost).toEqual({ minorUnits: 24, currency: 'EUR' });

		await expect(database.prints.count()).resolves.toBe(1);
		await expect(database.printFilamentUsages.count()).resolves.toBe(2);

		const grey = await database.spools.get(fixtureSpoolPlaGrey.id);
		const flex = await database.spools.get(fixtureSpoolFlex.id);

		expect(grey?.remainingWeightG).toBe(576.75);
		expect(flex?.remainingWeightG).toBe(0);
		expect(flex?.status).toBe('empty');
	});

	it('rejects over-consumption without persisting partial records', async () => {
		await expect(
			createPrintWithUsages(
				{
					name: 'Too large',
					status: 'failed',
					usages: [{ spoolId: fixtureSpoolPlaGrey.id, usedWeightG: 700, wasteWeightG: 0 }],
				},
				database,
			),
		).rejects.toBeInstanceOf(PrintPersistenceError);

		await expect(database.prints.count()).resolves.toBe(0);
		await expect(database.printFilamentUsages.count()).resolves.toBe(0);
		await expect(database.spools.get(fixtureSpoolPlaGrey.id)).resolves.toMatchObject({
			remainingWeightG: fixtureSpoolPlaGrey.remainingWeightG,
		});
	});

	it('rejects duplicate spool rows to prevent accidental double entry', async () => {
		await expect(
			createPrintWithUsages(
				{
					name: 'Duplicate spool',
					usages: [
						{ spoolId: fixtureSpoolPlaGrey.id, usedWeightG: 10, wasteWeightG: 0 },
						{ spoolId: fixtureSpoolPlaGrey.id, usedWeightG: 12, wasteWeightG: 1 },
					],
				},
				database,
			),
		).rejects.toThrow(/une seule fois/i);
	});

	it('rejects non-printable spools even when they still have weight', async () => {
		await database.spools.put({
			...fixtureSpoolPlaGrey,
			status: 'archived',
			remainingWeightG: 500,
		});

		await expect(
			createPrintWithUsages(
				{
					name: 'Archived spool',
					usages: [{ spoolId: fixtureSpoolPlaGrey.id, usedWeightG: 10, wasteWeightG: 0 }],
				},
				database,
			),
		).rejects.toThrow(/ne peut pas être utilisée/i);
	});

	it('accepts consumption exactly equal to remaining weight (non-régression sur-consumption)', async () => {
		await database.spools.put({
			...fixtureSpoolFlex,
			remainingWeightG: 10,
			status: 'low',
		});

		const result = await createPrintWithUsages(
			{
				name: 'Exact remainder',
				usages: [{ spoolId: fixtureSpoolFlex.id, usedWeightG: 10, wasteWeightG: 0 }],
			},
			database,
		);

		const flex = await database.spools.get(fixtureSpoolFlex.id);
		expect(flex?.remainingWeightG).toBe(0);
		expect(flex?.status).toBe('empty');
		expect(result.usages).toHaveLength(1);
	});
});
