import { z } from 'zod';

import {
	PrintFilamentUsageSchema,
	PrintSchema,
	SpoolAdjustmentSchema,
	SpoolSchema,
} from '../domain';

import {
	LOCAL_JSON_DB_SCHEMA_VERSION,
	LocalJsonDbSnapshotSchema,
	type LocalJsonDbSnapshot,
} from './local-json-db-schema';

/** Schéma disque v1 (avant tables Prusa Connect structurées). */
export const LocalJsonDbSnapshotV1Schema = z.object({
	schemaVersion: z.literal(1),
	updatedAt: z.string().datetime({ offset: true }),
	tables: z.object({
		spools: z.array(SpoolSchema),
		prints: z.array(PrintSchema),
		printFilamentUsages: z.array(PrintFilamentUsageSchema),
		spoolAdjustments: z.array(SpoolAdjustmentSchema),
	}),
});

export type LocalJsonDbSnapshotV1 = z.infer<typeof LocalJsonDbSnapshotV1Schema>;

export function migrateLocalJsonDbSnapshotV1ToV2(v1: LocalJsonDbSnapshotV1): LocalJsonDbSnapshot {
	return LocalJsonDbSnapshotSchema.parse({
		schemaVersion: LOCAL_JSON_DB_SCHEMA_VERSION,
		updatedAt: v1.updatedAt,
		tables: {
			...v1.tables,
			printers: [],
			printExternalImports: [],
			printSettings: [],
			printFiles: [],
			printObjects: [],
		},
	});
}

/**
 * Accepte une sauvegarde v1 ou v2 et retourne toujours un snapshot v2 validé.
 */
export function parseAndMigrateLocalJsonDbSnapshot(raw: unknown): LocalJsonDbSnapshot {
	const asV2 = LocalJsonDbSnapshotSchema.safeParse(raw);
	if (asV2.success) return asV2.data;

	const asV1 = LocalJsonDbSnapshotV1Schema.safeParse(raw);
	if (asV1.success) {
		return migrateLocalJsonDbSnapshotV1ToV2(asV1.data);
	}

	throw new z.ZodError([...asV2.error.issues, ...asV1.error.issues]);
}
