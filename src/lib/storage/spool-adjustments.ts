import {
	SpoolAdjustmentCreateInputSchema,
	SpoolAdjustmentSchema,
	SpoolSchema,
	type Spool,
	type SpoolAdjustment,
	clampRemainingToInitialRange,
	spoolStatusAfterRemainderChange,
} from '$lib/domain';

import { db, type FilamentTrackerDatabase } from './db';

export class SpoolAdjustmentPersistenceError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'SpoolAdjustmentPersistenceError';
	}
}

export async function createSpoolAdjustment(
	input: unknown,
	database: FilamentTrackerDatabase = db,
): Promise<{ adjustment: SpoolAdjustment; spool: Spool }> {
	const parsed = SpoolAdjustmentCreateInputSchema.parse(input);

	return database.transaction('rw', database.spools, database.spoolAdjustments, async () => {
		const spool = await database.spools.get(parsed.spoolId);
		if (!spool) {
			throw new SpoolAdjustmentPersistenceError('Bobine introuvable.');
		}

		const previousRemainingWeightG = spool.remainingWeightG;
		const newRemainingWeightG = clampRemainingToInitialRange(
			parsed.newRemainingWeightG,
			spool.initialWeightG,
		);

		const now = new Date().toISOString();
		const adjustment = SpoolAdjustmentSchema.parse({
			id: crypto.randomUUID(),
			spoolId: parsed.spoolId,
			previousRemainingWeightG,
			newRemainingWeightG,
			note: parsed.note.trim(),
			createdAt: now,
		});

		const updatedSpool = SpoolSchema.parse({
			...spool,
			remainingWeightG: adjustment.newRemainingWeightG,
			status: spoolStatusAfterRemainderChange(spool, adjustment.newRemainingWeightG),
			updatedAt: now,
		});

		await database.spoolAdjustments.add(adjustment);
		await database.spools.put(updatedSpool);

		return { adjustment, spool: updatedSpool };
	});
}

export async function listAdjustmentsForSpool(
	spoolId: string,
	database: FilamentTrackerDatabase = db,
): Promise<SpoolAdjustment[]> {
	const rows = await database.spoolAdjustments.where('spoolId').equals(spoolId).toArray();
	return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
