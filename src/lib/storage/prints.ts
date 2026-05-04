import { z } from 'zod';

import {
	PrintCreateInputSchema,
	PrintFilamentUsageSchema,
	PrintSchema,
	type Print,
	type PrintFilamentUsage,
	type PrintStatus,
	type Spool,
	clampRemainingToInitialRange,
	isLowStock,
	materialCostForGramsAtSpoolRate,
} from '$lib/domain';

import { db, type FilamentTrackerDatabase } from './db';

const LOW_STOCK_THRESHOLDS = {
	maxRemainingGrams: 100,
	maxRemainingPercent: 15,
} as const;

const QuickPrintUsageInputSchema = z.object({
	spoolId: z.string().uuid(),
	usedWeightG: PrintFilamentUsageSchema.shape.usedWeightG,
	wasteWeightG: PrintFilamentUsageSchema.shape.wasteWeightG.default(0),
});

export const QuickPrintCreateInputSchema = PrintCreateInputSchema.extend({
	usages: z.array(QuickPrintUsageInputSchema).min(1, 'Au moins une bobine est requise.'),
});

export type QuickPrintCreateInput = z.input<typeof QuickPrintCreateInputSchema>;

export type CreatePrintResult = {
	print: Print;
	usages: PrintFilamentUsage[];
	spools: Spool[];
};

export class PrintPersistenceError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'PrintPersistenceError';
	}
}

function nextSpoolStatus(spool: Spool, remainingWeightG: number): Spool['status'] {
	if (spool.status === 'archived') {
		return spool.status;
	}

	if (remainingWeightG <= 0) {
		return 'empty';
	}

	return isLowStock(remainingWeightG, spool.initialWeightG, LOW_STOCK_THRESHOLDS) ? 'low' : 'active';
}

function createId(): string {
	return crypto.randomUUID();
}

export async function createPrintWithUsages(
	input: QuickPrintCreateInput,
	database: FilamentTrackerDatabase = db,
): Promise<CreatePrintResult> {
	const parsed = QuickPrintCreateInputSchema.parse(input);
	const uniqueSpoolIds = new Set(parsed.usages.map((usage) => usage.spoolId));

	if (uniqueSpoolIds.size !== parsed.usages.length) {
		throw new PrintPersistenceError('Chaque bobine ne peut apparaître qu’une seule fois.');
	}

	return database.transaction('rw', database.spools, database.prints, database.printFilamentUsages, async () => {
		const now = new Date().toISOString();
		const spools = await database.spools.bulkGet([...uniqueSpoolIds]);
		const spoolById = new Map<string, Spool>();

		for (const spool of spools) {
			if (spool) {
				spoolById.set(spool.id, spool);
			}
		}

		for (const spoolId of uniqueSpoolIds) {
			if (!spoolById.has(spoolId)) {
				throw new PrintPersistenceError('Bobine introuvable.');
			}
		}

		const print = PrintSchema.parse({
			id: createId(),
			name: parsed.name,
			printedAt: parsed.printedAt,
			status: parsed.status,
			notes: parsed.notes?.trim() || undefined,
			createdAt: now,
			updatedAt: now,
		});

		const usages: PrintFilamentUsage[] = [];
		const updates = new Map<string, Spool>();

		for (const usageInput of parsed.usages) {
			const spool = spoolById.get(usageInput.spoolId)!;
			const consumedG = usageInput.usedWeightG + usageInput.wasteWeightG;

			if (consumedG > spool.remainingWeightG) {
				throw new PrintPersistenceError(
					`${spool.name} ne contient plus assez de filament pour ${consumedG} g.`,
				);
			}

			const remainingWeightG = clampRemainingToInitialRange(
				Number((spool.remainingWeightG - consumedG).toFixed(2)),
				spool.initialWeightG,
			);

			const usage = PrintFilamentUsageSchema.parse({
				id: createId(),
				printId: print.id,
				spoolId: spool.id,
				usedWeightG: usageInput.usedWeightG,
				wasteWeightG: usageInput.wasteWeightG,
				cost: materialCostForGramsAtSpoolRate(spool, consumedG),
				createdAt: now,
				updatedAt: now,
			});

			usages.push(usage);
			updates.set(spool.id, {
				...spool,
				remainingWeightG,
				status: nextSpoolStatus(spool, remainingWeightG),
				updatedAt: now,
			});
		}

		await database.prints.add(print);
		await database.printFilamentUsages.bulkAdd(usages);
		await database.spools.bulkPut([...updates.values()]);

		return {
			print,
			usages,
			spools: [...updates.values()],
		};
	});
}

export async function listPrints(database: FilamentTrackerDatabase = db): Promise<Print[]> {
	return database.prints.orderBy('printedAt').reverse().toArray();
}

export async function listPrintUsages(
	database: FilamentTrackerDatabase = db,
): Promise<PrintFilamentUsage[]> {
	return database.printFilamentUsages.toArray();
}

export const PRINT_STATUS_OPTIONS: Array<{ value: PrintStatus; label: string }> = [
	{ value: 'completed', label: 'Completed' },
	{ value: 'failed', label: 'Failed' },
	{ value: 'cancelled', label: 'Cancelled' },
];
