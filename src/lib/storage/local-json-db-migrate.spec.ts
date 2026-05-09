import { describe, expect, it } from 'vitest';

import { fixtureSpoolPlaGrey } from '$lib/fixtures/domain-fixtures';

import { LOCAL_JSON_DB_SCHEMA_VERSION } from './local-json-db-schema';
import {
	LocalJsonDbSnapshotV1Schema,
	migrateLocalJsonDbSnapshotV1ToV2,
	parseAndMigrateLocalJsonDbSnapshot,
} from './local-json-db-migrate';

describe('local JSON DB migration v1 → v2', () => {
	it('parseAndMigrate accepte v1 et ajoute les tables Prusa vides', () => {
		const v1 = {
			schemaVersion: 1,
			updatedAt: '2026-05-06T12:00:00.000Z',
			tables: {
				spools: [fixtureSpoolPlaGrey],
				prints: [],
				printFilamentUsages: [],
				spoolAdjustments: [],
			},
		};
		const v2 = parseAndMigrateLocalJsonDbSnapshot(v1);
		expect(v2.schemaVersion).toBe(LOCAL_JSON_DB_SCHEMA_VERSION);
		expect(v2.tables.spools).toHaveLength(1);
		expect(v2.tables.printers).toEqual([]);
		expect(v2.tables.printExternalImports).toEqual([]);
		expect(v2.tables.printSettings).toEqual([]);
		expect(v2.tables.printFiles).toEqual([]);
		expect(v2.tables.printObjects).toEqual([]);
	});

	it('migrateLocalJsonDbSnapshotV1ToV2 préserve le contenu existant', () => {
		const v1 = LocalJsonDbSnapshotV1Schema.parse({
			schemaVersion: 1,
			updatedAt: '2026-05-06T12:00:00.000Z',
			tables: {
				spools: [fixtureSpoolPlaGrey],
				prints: [],
				printFilamentUsages: [],
				spoolAdjustments: [],
			},
		});
		const v2 = migrateLocalJsonDbSnapshotV1ToV2(v1);
		expect(v2.tables.spools[0]!.id).toBe(fixtureSpoolPlaGrey.id);
	});

	it('parseAndMigrate laisse une v2 inchangée', () => {
		const raw = parseAndMigrateLocalJsonDbSnapshot({
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
		expect(raw.schemaVersion).toBe(2);
	});
});
