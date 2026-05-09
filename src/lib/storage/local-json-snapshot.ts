import {
	LOCAL_JSON_DB_SCHEMA_VERSION,
	LocalJsonDbSnapshotSchema,
	emptyLocalJsonDbSnapshot,
	type LocalJsonDbSnapshot,
} from './local-json-db-schema';

import { db, type FilamentTrackerDatabase } from './db';

export {
	LOCAL_JSON_DB_SCHEMA_VERSION,
	LocalJsonDbSnapshotSchema,
	emptyLocalJsonDbSnapshot,
	type LocalJsonDbSnapshot,
} from './local-json-db-schema';

export async function collectLocalJsonDbSnapshot(
	database: FilamentTrackerDatabase = db,
): Promise<LocalJsonDbSnapshot> {
	const [
		spools,
		prints,
		printFilamentUsages,
		spoolAdjustments,
		printers,
		printExternalImports,
		printSettings,
		printFiles,
		printObjects,
	] = await Promise.all([
		database.spools.toArray(),
		database.prints.toArray(),
		database.printFilamentUsages.toArray(),
		database.spoolAdjustments.toArray(),
		database.printers.toArray(),
		database.printExternalImports.toArray(),
		database.printSettings.toArray(),
		database.printFiles.toArray(),
		database.printObjects.toArray(),
	]);

	return LocalJsonDbSnapshotSchema.parse({
		schemaVersion: LOCAL_JSON_DB_SCHEMA_VERSION,
		updatedAt: new Date().toISOString(),
		tables: {
			spools,
			prints,
			printFilamentUsages,
			spoolAdjustments,
			printers,
			printExternalImports,
			printSettings,
			printFiles,
			printObjects,
		},
	});
}

export async function replaceIndexedDbFromLocalJsonSnapshot(
	snapshot: LocalJsonDbSnapshot,
	database: FilamentTrackerDatabase = db,
): Promise<void> {
	const parsed = LocalJsonDbSnapshotSchema.parse(snapshot);

	const stores = [
		database.spools,
		database.prints,
		database.printFilamentUsages,
		database.spoolAdjustments,
		database.printers,
		database.printExternalImports,
		database.printSettings,
		database.printFiles,
		database.printObjects,
	];

	await database.transaction('rw', stores, async () => {
		await database.printObjects.clear();
		await database.printFiles.clear();
		await database.printSettings.clear();
		await database.printExternalImports.clear();
		await database.printFilamentUsages.clear();
		await database.spoolAdjustments.clear();
		await database.prints.clear();
		await database.printers.clear();
		await database.spools.clear();

		await database.spools.bulkPut(parsed.tables.spools);
		await database.printers.bulkPut(parsed.tables.printers);
		await database.prints.bulkPut(parsed.tables.prints);
		await database.printExternalImports.bulkPut(parsed.tables.printExternalImports);
		await database.printSettings.bulkPut(parsed.tables.printSettings);
		await database.printFiles.bulkPut(parsed.tables.printFiles);
		await database.printObjects.bulkPut(parsed.tables.printObjects);
		await database.printFilamentUsages.bulkPut(parsed.tables.printFilamentUsages);
		await database.spoolAdjustments.bulkPut(parsed.tables.spoolAdjustments);
	});
}
