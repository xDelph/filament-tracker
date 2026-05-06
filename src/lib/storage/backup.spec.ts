import 'fake-indexeddb/auto';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { fixtureSpoolPlaGrey } from '$lib/test/fixtures/domain-fixtures';

import {
	BACKUP_SCHEMA_VERSION,
	BackupImportError,
	backupFileName,
	exportDatabaseBackup,
	importDatabaseBackup,
	parseDatabaseBackupJson,
	serializeDatabaseBackup,
} from './backup';
import { FilamentTrackerDatabase } from './db';
import { createPrintWithUsages } from './prints';
import { createSpoolAdjustment } from './spool-adjustments';

let source: FilamentTrackerDatabase;
let target: FilamentTrackerDatabase;

beforeEach(async () => {
	source = new FilamentTrackerDatabase(`filament-tracker-backup-source-${crypto.randomUUID()}`);
	target = new FilamentTrackerDatabase(`filament-tracker-backup-target-${crypto.randomUUID()}`);
	await source.open();
	await target.open();
});

afterEach(async () => {
	await source.delete();
	await target.delete();
});

describe('database JSON backup', () => {
	it('exports and imports all local storage tables', async () => {
		await source.spools.add(fixtureSpoolPlaGrey);
		const { print, usages } = await createPrintWithUsages(
			{
				name: 'Backup cube',
				status: 'completed',
				printedAt: '2026-05-06T08:00:00.000Z',
				usages: [{ spoolId: fixtureSpoolPlaGrey.id, usedWeightG: 10, wasteWeightG: 1 }],
			},
			source,
		);
		const { adjustment } = await createSpoolAdjustment(
			{
				spoolId: fixtureSpoolPlaGrey.id,
				newRemainingWeightG: 600,
				note: 'Backup calibration',
			},
			source,
		);

		const exported = await exportDatabaseBackup(source);
		const serialized = serializeDatabaseBackup(exported);
		const parsed = parseDatabaseBackupJson(serialized);
		const result = await importDatabaseBackup(parsed, target);

		expect(result).toEqual({
			spools: 1,
			prints: 1,
			printFilamentUsages: 1,
			spoolAdjustments: 1,
		});
		await expect(target.spools.get(fixtureSpoolPlaGrey.id)).resolves.toMatchObject({
			id: fixtureSpoolPlaGrey.id,
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

	it('replaces existing data during import', async () => {
		await source.spools.add(fixtureSpoolPlaGrey);
		await target.spools.add({ ...fixtureSpoolPlaGrey, name: 'Stale local row' });

		await importDatabaseBackup(await exportDatabaseBackup(source), target);

		await expect(target.spools.count()).resolves.toBe(1);
		await expect(target.spools.get(fixtureSpoolPlaGrey.id)).resolves.toMatchObject({
			name: fixtureSpoolPlaGrey.name,
		});
	});

	it('rejects invalid backup JSON', () => {
		expect(() => parseDatabaseBackupJson('{')).toThrow(BackupImportError);
		expect(() => parseDatabaseBackupJson(JSON.stringify({ schemaVersion: 99 }))).toThrow(
			BackupImportError,
		);
	});

	it('uses a stable backup file naming pattern', () => {
		expect(backupFileName(new Date('2026-05-06T08:00:00.000Z'))).toBe(
			'filament-tracker-backup-2026-05-06T08-00-00Z.json',
		);
	});

	it('records the current backup schema version', async () => {
		const backup = await exportDatabaseBackup(source);

		expect(backup.schemaVersion).toBe(BACKUP_SCHEMA_VERSION);
	});
});
