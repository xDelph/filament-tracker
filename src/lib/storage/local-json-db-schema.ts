import { z } from 'zod';

import {
	PrintFilamentUsageSchema,
	PrintSchema,
	SpoolAdjustmentSchema,
	SpoolSchema,
} from '../domain';

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
