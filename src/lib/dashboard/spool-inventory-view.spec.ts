import { describe, expect, it } from 'vitest';

import type { Print, PrintFilamentUsage, Spool } from '$lib/domain';

import {
	buildLastUsedMsBySpoolId,
	filterDashboardSpools,
	sortDashboardSpools,
	spoolMaterialFilterKey,
} from './spool-inventory-view';

const baseSpool = (overrides: Partial<Spool> = {}): Spool => ({
	id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
	name: 'Bobine',
	material: { kind: 'catalog', code: 'PLA' },
	colorName: 'Rouge',
	initialWeightG: 1000,
	remainingWeightG: 500,
	purchasePrice: { minorUnits: 2500, currency: 'EUR' },
	diameterMm: 1.75,
	status: 'active',
	createdAt: '2026-01-01T00:00:00.000Z',
	updatedAt: '2026-01-01T00:00:00.000Z',
	...overrides,
});

describe('spoolMaterialFilterKey', () => {
	it('prefixes catalogue codes', () => {
		expect(spoolMaterialFilterKey(baseSpool())).toBe('catalog:PLA');
	});

	it('prefixes custom labels', () => {
		expect(
			spoolMaterialFilterKey(
				baseSpool({ material: { kind: 'custom', label: 'PA-CF' } }),
			),
		).toBe('custom:PA-CF');
	});
});

describe('buildLastUsedMsBySpoolId', () => {
	it('tracks latest print date per spool', () => {
		const prints: Print[] = [
			{
				id: '11111111-1111-1111-1111-111111111111',
				name: 'P1',
				printedAt: '2026-01-01T12:00:00.000Z',
				status: 'completed',
				createdAt: '2026-01-01T12:00:00.000Z',
				updatedAt: '2026-01-01T12:00:00.000Z',
			},
			{
				id: '22222222-2222-2222-2222-222222222222',
				name: 'P2',
				printedAt: '2026-03-01T12:00:00.000Z',
				status: 'completed',
				createdAt: '2026-03-01T12:00:00.000Z',
				updatedAt: '2026-03-01T12:00:00.000Z',
			},
		];

		const usages: PrintFilamentUsage[] = [
			{
				id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
				printId: prints[0]!.id,
				spoolId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
				usedWeightG: 10,
				wasteWeightG: 0,
				cost: { minorUnits: 25, currency: 'EUR' },
				createdAt: '2026-01-01T12:00:00.000Z',
				updatedAt: '2026-01-01T12:00:00.000Z',
			},
			{
				id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
				printId: prints[1]!.id,
				spoolId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
				usedWeightG: 5,
				wasteWeightG: 0,
				cost: { minorUnits: 12, currency: 'EUR' },
				createdAt: '2026-03-01T12:00:00.000Z',
				updatedAt: '2026-03-01T12:00:00.000Z',
			},
		];

		const map = buildLastUsedMsBySpoolId(usages, prints);
		expect(map.get('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee')).toBe(
			Date.parse('2026-03-01T12:00:00.000Z'),
		);
	});
});

describe('filterDashboardSpools', () => {
	it('filters by material key', () => {
		const pla = baseSpool({ id: crypto.randomUUID(), name: 'A' });
		const petg = baseSpool({
			id: crypto.randomUUID(),
			name: 'B',
			material: { kind: 'catalog', code: 'PETG' },
		});
		const out = filterDashboardSpools([pla, petg], {
			materialKey: 'catalog:PETG',
			status: '',
			lowStock: 'all',
		});
		expect(out.map((s) => s.name)).toEqual(['B']);
	});

	it('filters by status', () => {
		const a = baseSpool({ id: crypto.randomUUID(), name: 'A', status: 'active' });
		const b = baseSpool({ id: crypto.randomUUID(), name: 'B', status: 'low' });
		expect(
			filterDashboardSpools([a, b], { materialKey: '', status: 'low', lowStock: 'all' }).map(
				(s) => s.name,
			),
		).toEqual(['B']);
	});

	it('filters low-stock alert bucket', () => {
		const ok = baseSpool({
			id: crypto.randomUUID(),
			name: 'OK',
			remainingWeightG: 900,
			initialWeightG: 1000,
			status: 'active',
		});
		const low = baseSpool({
			id: crypto.randomUUID(),
			name: 'Low',
			remainingWeightG: 50,
			initialWeightG: 1000,
			status: 'low',
		});
		const lowOnly = filterDashboardSpools([ok, low], {
			materialKey: '',
			status: '',
			lowStock: 'low_only',
		});
		expect(lowOnly.map((s) => s.name)).toEqual(['Low']);

		const okOnly = filterDashboardSpools([ok, low], {
			materialKey: '',
			status: '',
			lowStock: 'ok_only',
		});
		expect(okOnly.map((s) => s.name)).toEqual(['OK']);
	});
});

describe('sortDashboardSpools', () => {
	it('sorts by remaining weight', () => {
		const a = baseSpool({ id: crypto.randomUUID(), name: 'A', remainingWeightG: 100 });
		const b = baseSpool({ id: crypto.randomUUID(), name: 'B', remainingWeightG: 300 });
		expect(
			sortDashboardSpools([a, b], 'remainingDesc', new Map()).map((s) => s.name),
		).toEqual(['B', 'A']);
		expect(
			sortDashboardSpools([a, b], 'remainingAsc', new Map()).map((s) => s.name),
		).toEqual(['A', 'B']);
	});

	it('sorts by last usage with stable name tie-break', () => {
		const idSlow = 'aaaaaaaa-bbbb-cccc-dddd-000000000001';
		const idFast = 'aaaaaaaa-bbbb-cccc-dddd-000000000002';
		const slow = baseSpool({ id: idSlow, name: 'Slow', remainingWeightG: 400 });
		const fast = baseSpool({ id: idFast, name: 'Fast', remainingWeightG: 400 });
		const map = new Map<string, number>([
			[idSlow, Date.parse('2026-01-01T00:00:00.000Z')],
			[idFast, Date.parse('2026-06-01T00:00:00.000Z')],
		]);
		expect(
			sortDashboardSpools([slow, fast], 'lastUsedDesc', map).map((s) => s.name),
		).toEqual(['Fast', 'Slow']);
		expect(
			sortDashboardSpools([slow, fast], 'lastUsedAsc', map).map((s) => s.name),
		).toEqual(['Slow', 'Fast']);
	});

	it('places never-used spools after dated usage when sorting recent-first', () => {
		const idUsed = 'aaaaaaaa-bbbb-cccc-dddd-000000000001';
		const idNever = 'aaaaaaaa-bbbb-cccc-dddd-000000000002';
		const used = baseSpool({ id: idUsed, name: 'Used', remainingWeightG: 400 });
		const never = baseSpool({ id: idNever, name: 'Never', remainingWeightG: 400 });
		const map = new Map<string, number>([[idUsed, Date.parse('2026-06-01T00:00:00.000Z')]]);
		expect(sortDashboardSpools([never, used], 'lastUsedDesc', map).map((s) => s.name)).toEqual([
			'Used',
			'Never',
		]);
		expect(sortDashboardSpools([never, used], 'lastUsedAsc', map).map((s) => s.name)).toEqual([
			'Never',
			'Used',
		]);
	});
});
