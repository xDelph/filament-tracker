import 'fake-indexeddb/auto';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { SpoolSchema, SpoolUpdateInputSchema } from '$lib/domain';

import { fixtureSpoolPlaGrey } from '$lib/test/fixtures/domain-fixtures';

import { FilamentTrackerDatabase } from './db';
import { createSpool, mergeSpoolUpdate } from './spool-repository';

let database: FilamentTrackerDatabase;

beforeEach(async () => {
	database = new FilamentTrackerDatabase(`filament-tracker-test-${crypto.randomUUID()}`);
	await database.open();
});

afterEach(async () => {
	await database.delete();
});

describe('createSpool', () => {
	it('persiste une bobine avec restant égal au poids initial', async () => {
		const spool = await createSpool(
			{
				name: 'Nouvelle bobine',
				material: { kind: 'catalog', code: 'PLA' },
				colorName: 'Jaune',
				initialWeightG: 750,
				purchasePrice: { minorUnits: 1899, currency: 'EUR' },
			},
			database,
		);

		expect(spool.remainingWeightG).toBe(750);
		expect(spool.status).toBe('active');

		const stored = await database.spools.get(spool.id);
		expect(stored).toEqual(spool);
		await expect(database.spools.count()).resolves.toBe(1);
	});

	it('rejette une entrée invalide sans rien persister', async () => {
		await expect(
			createSpool(
				{
					name: '',
					material: { kind: 'catalog', code: 'PLA' },
					colorName: 'Gris',
					initialWeightG: 1000,
					purchasePrice: { minorUnits: 100, currency: 'EUR' },
				},
				database,
			),
		).rejects.toThrow();

		await expect(database.spools.count()).resolves.toBe(0);
	});
});

describe('mergeSpoolUpdate', () => {
	it('clears purchaseDate when clearPurchaseDate is set', () => {
		const existing = SpoolSchema.parse({
			...fixtureSpoolPlaGrey,
			purchaseDate: '2026-03-01T12:00:00.000Z',
		});
		const patch = SpoolUpdateInputSchema.parse({ name: existing.name });
		const merged = mergeSpoolUpdate(existing, patch, { clearPurchaseDate: true });
		expect(merged.purchaseDate).toBeUndefined();
		expect(merged.name).toBe(existing.name);
	});

	it('applies a new purchaseDate when provided', () => {
		const existing = SpoolSchema.parse({
			...fixtureSpoolPlaGrey,
			purchaseDate: '2026-03-01T12:00:00.000Z',
		});
		const patch = SpoolUpdateInputSchema.parse({ purchaseDate: '2026-04-15' });
		const merged = mergeSpoolUpdate(existing, patch, {});
		expect(merged.purchaseDate).toBe('2026-04-15T00:00:00.000Z');
	});
});
