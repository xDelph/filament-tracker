import 'fake-indexeddb/auto';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { fixtureSpoolPlaGrey } from '$lib/test/fixtures/domain-fixtures';

import { FilamentTrackerDatabase } from './db';
import {
	LOCAL_JSON_DB_SCHEMA_VERSION,
	collectLocalJsonDbSnapshot,
	emptyLocalJsonDbSnapshot,
	replaceIndexedDbFromLocalJsonSnapshot,
} from './local-json-snapshot';
import { createPrintWithUsages } from './prints';
import { createSpoolAdjustment } from './spool-adjustments';

let source: FilamentTrackerDatabase;
let target: FilamentTrackerDatabase;

beforeEach(async () => {
	source = new FilamentTrackerDatabase(`filament-tracker-json-source-${crypto.randomUUID()}`);
	target = new FilamentTrackerDatabase(`filament-tracker-json-target-${crypto.randomUUID()}`);
	await source.open();
	await target.open();
});

afterEach(async () => {
	await source.delete();
	await target.delete();
});

describe('local JSON database snapshots', () => {
	it('captures and restores every local table', async () => {
		await source.spools.add(fixtureSpoolPlaGrey);
		const { print, usages } = await createPrintWithUsages(
			{
				name: 'JSON source print',
				status: 'completed',
				printedAt: '2026-05-06T12:00:00.000Z',
				usages: [{ spoolId: fixtureSpoolPlaGrey.id, usedWeightG: 10, wasteWeightG: 1 }],
			},
			source,
		);
		const { adjustment } = await createSpoolAdjustment(
			{
				spoolId: fixtureSpoolPlaGrey.id,
				newRemainingWeightG: 600,
				note: 'JSON file source',
			},
			source,
		);

		const snapshot = await collectLocalJsonDbSnapshot(source);
		await replaceIndexedDbFromLocalJsonSnapshot(snapshot, target);

		expect(snapshot.schemaVersion).toBe(LOCAL_JSON_DB_SCHEMA_VERSION);
		await expect(target.spools.get(fixtureSpoolPlaGrey.id)).resolves.toMatchObject({
			remainingWeightG: 600,
		});
		await expect(target.prints.get(print.id)).resolves.toMatchObject({ id: print.id });
		await expect(target.printFilamentUsages.get(usages[0]!.id)).resolves.toMatchObject({
			id: usages[0]!.id,
		});
		await expect(target.spoolAdjustments.get(adjustment.id)).resolves.toMatchObject({
			id: adjustment.id,
		});
	});

	it('can represent an empty local JSON database', () => {
		expect(emptyLocalJsonDbSnapshot('2026-05-06T12:00:00.000Z')).toEqual({
			schemaVersion: LOCAL_JSON_DB_SCHEMA_VERSION,
			updatedAt: '2026-05-06T12:00:00.000Z',
			tables: {
				spools: [],
				prints: [],
				printFilamentUsages: [],
				spoolAdjustments: [],
				printers: [],
				printExternalImports: [],
				printSettings: [],
				printFiles: [],
				printObjects: [],
			},
		});
	});
});
