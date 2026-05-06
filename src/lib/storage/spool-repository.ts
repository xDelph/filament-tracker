import {
	SpoolCreateInputSchema,
	SpoolSchema,
	SpoolUpdateInputSchema,
	type Spool,
	type SpoolCreateInput,
	type SpoolUpdateInput,
} from '$lib/domain';

import { db, type FilamentTrackerDatabase } from './db';
import { persistIndexedDbToLocalJson } from './local-json-sync';

/** Raw patch contained `purchaseDate: ''` before Zod strips it — persist clearing the field. */
function patchClearsPurchaseDate(patch: unknown): boolean {
	if (!patch || typeof patch !== 'object') return false;
	return (
		'purchaseDate' in patch &&
		(patch as Record<string, unknown>).purchaseDate === ''
	);
}

export function mergeSpoolUpdate(
	existing: Spool,
	patch: SpoolUpdateInput,
	options?: { clearPurchaseDate?: boolean },
): Spool {
	let purchaseDate: Spool['purchaseDate'];
	if (options?.clearPurchaseDate) {
		purchaseDate = undefined;
	} else if (patch.purchaseDate !== undefined) {
		purchaseDate = patch.purchaseDate;
	} else {
		purchaseDate = existing.purchaseDate;
	}

	const next: Spool = {
		...existing,
		...(patch.name !== undefined && { name: patch.name }),
		...(patch.material !== undefined && { material: patch.material }),
		...(patch.brand !== undefined && { brand: patch.brand === '' ? undefined : patch.brand }),
		...(patch.colorName !== undefined && { colorName: patch.colorName }),
		...(patch.colorHex !== undefined && {
			colorHex: patch.colorHex === '' ? undefined : patch.colorHex,
		}),
		...(patch.initialWeightG !== undefined && { initialWeightG: patch.initialWeightG }),
		...(patch.purchasePrice !== undefined && { purchasePrice: patch.purchasePrice }),
		...(patch.supplier !== undefined && {
			supplier: patch.supplier === '' ? undefined : patch.supplier,
		}),
		...(patch.diameterMm !== undefined && { diameterMm: patch.diameterMm }),
		...(patch.densityGCm3 !== undefined && { densityGCm3: patch.densityGCm3 }),
		...(patch.status !== undefined && { status: patch.status }),
		...(patch.notes !== undefined && { notes: patch.notes === '' ? undefined : patch.notes }),
		purchaseDate,
		updatedAt: new Date().toISOString(),
	};
	return SpoolSchema.parse(next);
}

export async function createSpool(input: unknown): Promise<Spool> {
	const parsed = SpoolCreateInputSchema.parse(input);
	const now = new Date().toISOString();
	const id = crypto.randomUUID();
	const spool = SpoolSchema.parse({
		id,
		name: parsed.name,
		material: parsed.material,
		brand: parsed.brand,
		colorName: parsed.colorName,
		colorHex: parsed.colorHex,
		initialWeightG: parsed.initialWeightG,
		remainingWeightG: parsed.initialWeightG,
		purchasePrice: parsed.purchasePrice,
		purchaseDate: parsed.purchaseDate,
		supplier: parsed.supplier,
		diameterMm: parsed.diameterMm,
		densityGCm3: parsed.densityGCm3,
		status: parsed.status,
		notes: parsed.notes,
		createdAt: now,
		updatedAt: now,
	});
	await db.spools.add(spool);
	await persistIndexedDbToLocalJson();
	return spool;
}

export async function updateSpool(id: string, patch: unknown): Promise<Spool> {
	const existing = await db.spools.get(id);
	if (!existing) {
		throw new Error(`Bobine introuvable (${id}).`);
	}
	const clearPurchaseDate = patchClearsPurchaseDate(patch);
	const parsed = SpoolUpdateInputSchema.parse(patch);
	const updated = mergeSpoolUpdate(existing, parsed, { clearPurchaseDate });
	await db.spools.put(updated);
	await persistIndexedDbToLocalJson();
	return updated;
}

export async function getSpool(id: string, database: FilamentTrackerDatabase = db): Promise<Spool | undefined> {
	return database.spools.get(id);
}

/** Bobines visibles dans l’inventaire principal : actives ou stock bas. */
export async function listActiveInventorySpools(): Promise<Spool[]> {
	const rows = await db.spools.toArray();
	return rows
		.filter((s) => s.status === 'active' || s.status === 'low')
		.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
}

export async function archiveSpool(id: string): Promise<Spool> {
	const existing = await db.spools.get(id);
	if (!existing) {
		throw new Error(`Bobine introuvable (${id}).`);
	}
	const next = SpoolSchema.parse({
		...existing,
		status: 'archived',
		updatedAt: new Date().toISOString(),
	});
	await db.spools.put(next);
	await persistIndexedDbToLocalJson();
	return next;
}

export async function markSpoolEmpty(id: string): Promise<Spool> {
	const existing = await db.spools.get(id);
	if (!existing) {
		throw new Error(`Bobine introuvable (${id}).`);
	}
	const next = SpoolSchema.parse({
		...existing,
		status: 'empty',
		remainingWeightG: 0,
		updatedAt: new Date().toISOString(),
	});
	await db.spools.put(next);
	await persistIndexedDbToLocalJson();
	return next;
}

export type { SpoolCreateInput, SpoolUpdateInput };
