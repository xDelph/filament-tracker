import { z } from 'zod';

import {
	PrintCreateInputSchema,
	type PrintExternalImport,
	type PrintFile,
	PrintFilamentUsageSchema,
	type PrintObject,
	type PrintSettings,
	PrintSchema,
	type Print,
	type PrintFilamentUsage,
	type PrintStatus,
	type Printer,
	type Spool,
	clampRemainingToInitialRange,
	materialCostForGramsAtSpoolRate,
	spoolStatusAfterRemainderChange,
} from '$lib/domain';

import { db, type FilamentTrackerDatabase } from './db';
import { persistIndexedDbToLocalJson } from './local-json-sync';

/** Aligné avec la détection « stock bas » côté impressions et filtres tableau de bord. */
export const LOW_STOCK_THRESHOLDS = {
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

	const result = await database.transaction('rw', database.spools, database.prints, database.printFilamentUsages, async () => {
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

			if (spool.status !== 'active' && spool.status !== 'low') {
				throw new PrintPersistenceError(`${spool.name} ne peut pas être utilisée pour une impression.`);
			}

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
				status: spoolStatusAfterRemainderChange(spool, remainingWeightG),
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

	await persistIndexedDbToLocalJson(database);
	return result;
}

export async function listPrints(database: FilamentTrackerDatabase = db): Promise<Print[]> {
	return database.prints.orderBy('printedAt').reverse().toArray();
}

export async function listPrintUsages(
	database: FilamentTrackerDatabase = db,
): Promise<PrintFilamentUsage[]> {
	return database.printFilamentUsages.toArray();
}

export async function listPrinters(database: FilamentTrackerDatabase = db): Promise<Printer[]> {
	return database.printers.toArray();
}

export async function listPrintExternalImports(
	database: FilamentTrackerDatabase = db,
): Promise<PrintExternalImport[]> {
	return database.printExternalImports.toArray();
}

export async function listPrintSettings(
	database: FilamentTrackerDatabase = db,
): Promise<PrintSettings[]> {
	return database.printSettings.toArray();
}

export async function listPrintFiles(database: FilamentTrackerDatabase = db): Promise<PrintFile[]> {
	return database.printFiles.toArray();
}

export async function listPrintObjects(
	database: FilamentTrackerDatabase = db,
): Promise<PrintObject[]> {
	return database.printObjects.toArray();
}

export async function listPrintUsagesForSpool(
	spoolId: string,
	database: FilamentTrackerDatabase = db,
): Promise<PrintFilamentUsage[]> {
	return database.printFilamentUsages.where('spoolId').equals(spoolId).toArray();
}

export const PRINT_STATUS_OPTIONS: Array<{ value: PrintStatus; label: string }> = [
	{ value: 'completed', label: 'Terminée' },
	{ value: 'failed', label: 'Échouée' },
	{ value: 'cancelled', label: 'Annulée' },
];
