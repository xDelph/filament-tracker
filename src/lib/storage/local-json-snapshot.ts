import { z } from 'zod';

import {
	PrintFilamentUsageSchema,
	PrintSchema,
	SpoolAdjustmentSchema,
	SpoolSchema,
} from '$lib/domain';

import { db, type FilamentTrackerDatabase } from './db';

export const LOCAL_JSON_DB_SCHEMA_VERSION = 1;

export const LocalJsonDbSnapshotSchema = z.object({
	schemaVersion: z.literal(LOCAL_JSON_DB_SCHEMA_VERSION),
	updatedAt: z.string().datetime({ offset: true }),
	tables: z.object({
		spools: z.array(SpoolSchema),
		prints: z.array(PrintSchema),
		printFilamentUsages: z.array(PrintFilamentUsageSchema),
		spoolAdjustments: z.array(SpoolAdjustmentSchema),
	}),
});

export type LocalJsonDbSnapshot = z.infer<typeof LocalJsonDbSnapshotSchema>;

export function emptyLocalJsonDbSnapshot(now = new Date().toISOString()): LocalJsonDbSnapshot {
	return {
		schemaVersion: LOCAL_JSON_DB_SCHEMA_VERSION,
		updatedAt: now,
		tables: {
			spools: [],
			prints: [],
			printFilamentUsages: [],
			spoolAdjustments: [],
		},
	};
}

export async function collectLocalJsonDbSnapshot(
	database: FilamentTrackerDatabase = db,
): Promise<LocalJsonDbSnapshot> {
	const [spools, prints, printFilamentUsages, spoolAdjustments] = await Promise.all([
		database.spools.toArray(),
		database.prints.toArray(),
		database.printFilamentUsages.toArray(),
		database.spoolAdjustments.toArray(),
	]);

	return LocalJsonDbSnapshotSchema.parse({
		schemaVersion: LOCAL_JSON_DB_SCHEMA_VERSION,
		updatedAt: new Date().toISOString(),
		tables: {
			spools,
			prints,
			printFilamentUsages,
			spoolAdjustments,
		},
	});
}

export async function replaceIndexedDbFromLocalJsonSnapshot(
	snapshot: LocalJsonDbSnapshot,
	database: FilamentTrackerDatabase = db,
): Promise<void> {
	const parsed = LocalJsonDbSnapshotSchema.parse(snapshot);

	await database.transaction(
		'rw',
		database.spools,
		database.prints,
		database.printFilamentUsages,
		database.spoolAdjustments,
		async () => {
			await database.printFilamentUsages.clear();
			await database.spoolAdjustments.clear();
			await database.prints.clear();
			await database.spools.clear();

			await database.spools.bulkPut(parsed.tables.spools);
			await database.prints.bulkPut(parsed.tables.prints);
			await database.printFilamentUsages.bulkPut(parsed.tables.printFilamentUsages);
			await database.spoolAdjustments.bulkPut(parsed.tables.spoolAdjustments);
		},
	);
}
