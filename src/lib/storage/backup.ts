import { z } from 'zod';

import {
	PrintFilamentUsageSchema,
	PrintSchema,
	SpoolAdjustmentSchema,
	SpoolSchema,
} from '$lib/domain';

import { db, type FilamentTrackerDatabase } from './db';

export const BACKUP_SCHEMA_VERSION = 1;

const BackupSchema = z.object({
	schemaVersion: z.literal(BACKUP_SCHEMA_VERSION),
	exportedAt: z.string().datetime({ offset: true }),
	tables: z.object({
		spools: z.array(SpoolSchema),
		prints: z.array(PrintSchema),
		printFilamentUsages: z.array(PrintFilamentUsageSchema),
		spoolAdjustments: z.array(SpoolAdjustmentSchema),
	}),
});

export type FilamentTrackerBackup = z.infer<typeof BackupSchema>;

export type BackupImportResult = {
	spools: number;
	prints: number;
	printFilamentUsages: number;
	spoolAdjustments: number;
};

export class BackupImportError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'BackupImportError';
	}
}

export async function exportDatabaseBackup(
	database: FilamentTrackerDatabase = db,
): Promise<FilamentTrackerBackup> {
	const [spools, prints, printFilamentUsages, spoolAdjustments] = await Promise.all([
		database.spools.toArray(),
		database.prints.toArray(),
		database.printFilamentUsages.toArray(),
		database.spoolAdjustments.toArray(),
	]);

	return BackupSchema.parse({
		schemaVersion: BACKUP_SCHEMA_VERSION,
		exportedAt: new Date().toISOString(),
		tables: {
			spools,
			prints,
			printFilamentUsages,
			spoolAdjustments,
		},
	});
}

export function serializeDatabaseBackup(backup: FilamentTrackerBackup): string {
	return `${JSON.stringify(BackupSchema.parse(backup), null, 2)}\n`;
}

export function backupFileName(date = new Date()): string {
	const stamp = date.toISOString().replace(/\.\d{3}Z$/, 'Z').replace(/[:]/g, '-');
	return `filament-tracker-backup-${stamp}.json`;
}

export function parseDatabaseBackupJson(content: string): FilamentTrackerBackup {
	try {
		return BackupSchema.parse(JSON.parse(content));
	} catch (error) {
		if (error instanceof SyntaxError) {
			throw new BackupImportError('Le fichier JSON de sauvegarde est invalide.');
		}
		throw new BackupImportError(
			'Le fichier ne correspond pas au format de sauvegarde Filament Tracker attendu.',
		);
	}
}

export async function importDatabaseBackup(
	backup: FilamentTrackerBackup,
	database: FilamentTrackerDatabase = db,
): Promise<BackupImportResult> {
	const parsed = BackupSchema.parse(backup);

	await database.transaction(
		'rw',
		database.spools,
		database.prints,
		database.printFilamentUsages,
		database.spoolAdjustments,
		async () => {
			await Promise.all([
				database.printFilamentUsages.clear(),
				database.spoolAdjustments.clear(),
				database.prints.clear(),
				database.spools.clear(),
			]);

			await database.spools.bulkPut(parsed.tables.spools);
			await database.prints.bulkPut(parsed.tables.prints);
			await database.printFilamentUsages.bulkPut(parsed.tables.printFilamentUsages);
			await database.spoolAdjustments.bulkPut(parsed.tables.spoolAdjustments);
		},
	);

	return {
		spools: parsed.tables.spools.length,
		prints: parsed.tables.prints.length,
		printFilamentUsages: parsed.tables.printFilamentUsages.length,
		spoolAdjustments: parsed.tables.spoolAdjustments.length,
	};
}
