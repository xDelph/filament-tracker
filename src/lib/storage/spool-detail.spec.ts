import 'fake-indexeddb/auto';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { PrintFilamentUsageSchema, PrintSchema } from '$lib/domain';

import { fixtureSpoolPlaGrey } from '$lib/test/fixtures/domain-fixtures';

import { FilamentTrackerDatabase } from './db';
import { loadSpoolAuditData } from './spool-detail';

let database: FilamentTrackerDatabase;

beforeEach(async () => {
	database = new FilamentTrackerDatabase(`filament-tracker-test-${crypto.randomUUID()}`);
	await database.open();
});

afterEach(async () => {
	await database.delete();
});

describe('loadSpoolAuditData', () => {
	it('orders print usages by print printedAt (newest first), not usage createdAt', async () => {
		await database.spools.add(fixtureSpoolPlaGrey);

		const printOld = PrintSchema.parse({
			id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
			name: 'Older job',
			printedAt: '2026-01-01T10:00:00.000Z',
			status: 'completed',
			createdAt: '2026-01-01T10:00:00.000Z',
			updatedAt: '2026-01-01T10:00:00.000Z',
		});

		const printNew = PrintSchema.parse({
			id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
			name: 'Newer job',
			printedAt: '2026-06-01T10:00:00.000Z',
			status: 'completed',
			createdAt: '2026-06-01T10:00:00.000Z',
			updatedAt: '2026-06-01T10:00:00.000Z',
		});

		await database.prints.bulkAdd([printOld, printNew]);

		const usageOldPrint = PrintFilamentUsageSchema.parse({
			id: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
			printId: printOld.id,
			spoolId: fixtureSpoolPlaGrey.id,
			usedWeightG: 10,
			wasteWeightG: 0,
			cost: { minorUnits: 25, currency: 'EUR' },
			createdAt: '2026-06-15T10:00:00.000Z',
			updatedAt: '2026-06-15T10:00:00.000Z',
		});

		const usageNewPrint = PrintFilamentUsageSchema.parse({
			id: 'dddddddd-dddd-dddd-dddd-dddddddddddd',
			printId: printNew.id,
			spoolId: fixtureSpoolPlaGrey.id,
			usedWeightG: 5,
			wasteWeightG: 0,
			cost: { minorUnits: 12, currency: 'EUR' },
			createdAt: '2026-01-02T10:00:00.000Z',
			updatedAt: '2026-01-02T10:00:00.000Z',
		});

		await database.printFilamentUsages.bulkAdd([usageOldPrint, usageNewPrint]);

		const { usages } = await loadSpoolAuditData(fixtureSpoolPlaGrey.id, database);

		expect(usages.map((row) => row.print?.name)).toEqual(['Newer job', 'Older job']);
	});
});
