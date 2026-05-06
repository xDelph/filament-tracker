import 'fake-indexeddb/auto';

import { afterEach, describe, expect, it } from 'vitest';

import { fixtureSpoolFlex, fixtureSpoolPlaGrey } from '$lib/test/fixtures/domain-fixtures';

import { FilamentTrackerDatabase } from './db';
import { createPrintWithUsages, listPrintUsages, listPrints } from './prints';
import { createSpoolAdjustment, listAdjustmentsForSpool } from './spool-adjustments';
import { listSpools, seedFixtureSpools } from './spools';

let databaseName = '';

afterEach(async () => {
	if (!databaseName) return;
	const database = new FilamentTrackerDatabase(databaseName);
	await database.delete();
	databaseName = '';
});

describe('local IndexedDB persistence', () => {
	it('keeps spools, prints, usages, and adjustments after reopening the same database', async () => {
		databaseName = `filament-tracker-persistence-test-${crypto.randomUUID()}`;
		const firstSession = new FilamentTrackerDatabase(databaseName);
		await firstSession.open();
		await firstSession.spools.add(fixtureSpoolPlaGrey);
		await createPrintWithUsages(
			{
				name: 'Reload survivor',
				status: 'completed',
				printedAt: '2026-05-05T09:00:00.000Z',
				usages: [{ spoolId: fixtureSpoolPlaGrey.id, usedWeightG: 12, wasteWeightG: 1 }],
			},
			firstSession,
		);
		await createSpoolAdjustment(
			{
				spoolId: fixtureSpoolPlaGrey.id,
				newRemainingWeightG: 590,
				note: 'Measured after reload test',
			},
			firstSession,
		);
		firstSession.close();

		const nextSession = new FilamentTrackerDatabase(databaseName);
		await nextSession.open();

		await expect(listSpools(nextSession)).resolves.toMatchObject([
			{
				id: fixtureSpoolPlaGrey.id,
				name: fixtureSpoolPlaGrey.name,
				remainingWeightG: 590,
			},
		]);
		await expect(listPrints(nextSession)).resolves.toMatchObject([
			{ name: 'Reload survivor', status: 'completed' },
		]);
		await expect(listPrintUsages(nextSession)).resolves.toMatchObject([
			{ spoolId: fixtureSpoolPlaGrey.id, usedWeightG: 12, wasteWeightG: 1 },
		]);
		await expect(
			listAdjustmentsForSpool(fixtureSpoolPlaGrey.id, nextSession),
		).resolves.toMatchObject([
			{
				spoolId: fixtureSpoolPlaGrey.id,
				previousRemainingWeightG: 605.75,
				newRemainingWeightG: 590,
				note: 'Measured after reload test',
			},
		]);

		nextSession.close();
	});

	it('does not overwrite existing user spools when fixture seeding runs again', async () => {
		databaseName = `filament-tracker-seed-test-${crypto.randomUUID()}`;
		const database = new FilamentTrackerDatabase(databaseName);
		await database.open();
		await database.spools.add({ ...fixtureSpoolPlaGrey, name: 'User spool' });

		await seedFixtureSpools(database);

		await expect(database.spools.count()).resolves.toBe(1);
		await expect(database.spools.get(fixtureSpoolPlaGrey.id)).resolves.toMatchObject({
			name: 'User spool',
		});

		database.close();
	});

	it('seeds demo spools only when the local inventory is empty', async () => {
		databaseName = `filament-tracker-empty-seed-test-${crypto.randomUUID()}`;
		const database = new FilamentTrackerDatabase(databaseName);
		await database.open();

		await seedFixtureSpools(database);

		await expect(database.spools.count()).resolves.toBe(2);
		await expect(
			database.spools.bulkGet([fixtureSpoolPlaGrey.id, fixtureSpoolFlex.id]),
		).resolves.toMatchObject([{ id: fixtureSpoolPlaGrey.id }, { id: fixtureSpoolFlex.id }]);

		database.close();
	});
});
