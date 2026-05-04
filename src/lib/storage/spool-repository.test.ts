import { describe, expect, it } from 'vitest';

import { SpoolSchema, SpoolUpdateInputSchema } from '$lib/domain';

import { fixtureSpoolPlaGrey } from '$lib/test/fixtures/domain-fixtures';

import { mergeSpoolUpdate } from './spool-repository';

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
