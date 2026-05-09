import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { fixtureSpoolPlaGrey } from '$lib/test/fixtures/domain-fixtures';
import {
	LOCAL_JSON_DB_SCHEMA_VERSION,
	emptyLocalJsonDbSnapshot,
} from '$lib/storage/local-json-snapshot';

import { readLocalJsonDb, resetLocalJsonDb, writeLocalJsonDb } from './local-json-db';

let directory = '';
let filePath = '';

beforeEach(async () => {
	directory = await mkdtemp(join(tmpdir(), 'filament-tracker-json-db-'));
	filePath = join(directory, 'db.json');
});

afterEach(async () => {
	await rm(directory, { recursive: true, force: true });
});

describe('local JSON database file', () => {
	it('returns an empty snapshot when the file does not exist yet', async () => {
		await expect(readLocalJsonDb(filePath)).resolves.toMatchObject({
			schemaVersion: LOCAL_JSON_DB_SCHEMA_VERSION,
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

	it('writes and reads a validated JSON database file', async () => {
		const snapshot = emptyLocalJsonDbSnapshot('2026-05-06T12:00:00.000Z');
		snapshot.tables.spools.push(fixtureSpoolPlaGrey);

		await writeLocalJsonDb(snapshot, filePath);

		await expect(readLocalJsonDb(filePath)).resolves.toMatchObject({
			tables: { spools: [{ id: fixtureSpoolPlaGrey.id }] },
		});
		await expect(readFile(filePath, 'utf8')).resolves.toContain('"spools"');
	});

	it('resets an existing file to an empty snapshot', async () => {
		const snapshot = emptyLocalJsonDbSnapshot('2026-05-06T12:00:00.000Z');
		snapshot.tables.spools.push(fixtureSpoolPlaGrey);
		await writeLocalJsonDb(snapshot, filePath);

		await resetLocalJsonDb(filePath);

		await expect(readLocalJsonDb(filePath)).resolves.toMatchObject({
			tables: { spools: [] },
		});
	});
});
