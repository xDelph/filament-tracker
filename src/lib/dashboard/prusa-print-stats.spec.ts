import { describe, expect, it } from 'vitest';

import type {
	Print,
	PrintExternalImport,
	PrintFile,
	PrintFilamentUsage,
	PrintSettings,
	Printer,
	Spool,
} from '$lib/domain';

import { buildPrusaDashboardStats } from './prusa-print-stats';

const basePrint = (overrides: Partial<Print> = {}): Print => ({
	id: crypto.randomUUID(),
	name: 'Print',
	printedAt: '2026-05-01T12:00:00.000Z',
	status: 'completed',
	createdAt: '2026-05-01T12:00:00.000Z',
	updatedAt: '2026-05-01T12:00:00.000Z',
	...overrides,
});

const baseSpool = (overrides: Partial<Spool> = {}): Spool => ({
	id: crypto.randomUUID(),
	name: 'PLA spool',
	material: { kind: 'catalog', code: 'PLA' },
	colorName: 'Rouge',
	initialWeightG: 1000,
	remainingWeightG: 900,
	purchasePrice: { minorUnits: 2500, currency: 'EUR' },
	diameterMm: 1.75,
	status: 'active',
	createdAt: '2026-01-01T00:00:00.000Z',
	updatedAt: '2026-01-01T00:00:00.000Z',
	...overrides,
});

const usage = (printId: string, spoolId: string, grams: number): PrintFilamentUsage => ({
	id: crypto.randomUUID(),
	printId,
	spoolId,
	usedWeightG: grams,
	wasteWeightG: 0,
	cost: { minorUnits: 0, currency: 'EUR' },
	createdAt: '2026-05-01T12:00:00.000Z',
	updatedAt: '2026-05-01T12:00:00.000Z',
});

const prusaImport = (printId: string, externalJobId = printId): PrintExternalImport => ({
	id: crypto.randomUUID(),
	printId,
	source: 'prusa_connect',
	externalJobId,
	importedAt: '2026-05-02T12:00:00.000Z',
});

describe('buildPrusaDashboardStats', () => {
	it('aggregates enriched Prusa metadata across statuses, materials and settings', () => {
		const spoolPla = baseSpool({ id: '11111111-1111-4111-8111-111111111111' });
		const spoolPetg = baseSpool({
			id: '22222222-2222-4222-8222-222222222222',
			material: { kind: 'catalog', code: 'PETG' },
		});
		const printer: Printer = {
			id: '33333333-3333-4333-8333-333333333333',
			source: 'prusa_connect',
			externalPrinterUuid: 'mk4-1',
			model: 'MK4',
			createdAt: '2026-01-01T00:00:00.000Z',
			updatedAt: '2026-01-01T00:00:00.000Z',
		};
		const ok = basePrint({
			id: '44444444-4444-4444-8444-444444444444',
			name: 'Done',
			printerId: printer.id,
			timePrintingSec: 3600,
			estimatedPrintTimeSec: 3300,
		});
		const stopped = basePrint({
			id: '55555555-5555-4555-8555-555555555555',
			name: 'Stopped',
			status: 'cancelled',
			printedAt: '2026-05-02T12:00:00.000Z',
			elapsedSec: 900,
			estimatedPrintTimeSec: 1800,
		});
		const settings: PrintSettings[] = [
			{
				id: crypto.randomUUID(),
				printId: ok.id,
				layerHeightMm: 0.2,
				nozzleDiameterMm: 0.4,
				supportMaterial: false,
				nozzleTemperatureC: 215,
				bedTemperatureC: 60,
			},
			{
				id: crypto.randomUUID(),
				printId: stopped.id,
				layerHeightMm: 0.15,
				nozzleDiameterMm: 0.4,
				supportMaterial: true,
				connectPrintHeightRaw: 12.4,
			},
		];

		const stats = buildPrusaDashboardStats({
			prints: [ok, stopped],
			usages: [usage(ok.id, spoolPla.id, 12), usage(stopped.id, spoolPetg.id, 4)],
			spools: [spoolPla, spoolPetg],
			settings,
			files: [{ id: crypto.randomUUID(), printId: stopped.id, displayName: 'fail.gcode' }],
			printers: [printer],
			externalImports: [prusaImport(ok.id), prusaImport(stopped.id)],
		});

		expect(stats.totalPrints).toBe(2);
		expect(stats.totalFilamentG).toBe(16);
		expect(stats.totalRealTimeSec).toBe(4500);
		expect(stats.totalEstimatedTimeSec).toBe(5100);
		expect(stats.estimateDeltaSec).toBe(-600);
		expect(stats.statusBreakdown.map((item) => item.label)).toContain('Stoppées');
		expect(stats.materialBreakdown.map((item) => item.label)).toEqual(['PLA', 'PETG']);
		expect(stats.printerBreakdown[0]).toMatchObject({ label: 'MK4', count: 1 });
		expect(stats.nozzleBreakdown[0]).toMatchObject({ label: '0.4 mm', count: 2 });
		expect(stats.supportBreakdown.map((item) => item.label)).toEqual([
			'Sans supports',
			'Avec supports',
		]);
		expect(stats.interrupted[0]).toMatchObject({
			name: 'Stopped',
			fileName: 'fail.gcode',
			connectPrintHeightRaw: 12.4,
			filamentG: 4,
		});
	});

	it('deduplicates reimported jobs by Prusa external job id', () => {
		const spool = baseSpool({ id: '66666666-6666-4666-8666-666666666666' });
		const older = basePrint({
			id: '77777777-7777-4777-8777-777777777777',
			updatedAt: '2026-05-01T12:00:00.000Z',
			timePrintingSec: 100,
		});
		const newer = basePrint({
			id: '88888888-8888-4888-8888-888888888888',
			updatedAt: '2026-05-02T12:00:00.000Z',
			timePrintingSec: 100,
		});
		const externalImports: PrintExternalImport[] = [
			prusaImport(older.id, 'same-connect-job'),
			prusaImport(newer.id, 'same-connect-job'),
		];

		const stats = buildPrusaDashboardStats({
			prints: [older, newer],
			usages: [usage(older.id, spool.id, 10), usage(newer.id, spool.id, 10)],
			spools: [spool],
			settings: [],
			files: [],
			printers: [],
			externalImports,
		});

		expect(stats.totalPrints).toBe(1);
		expect(stats.totalFilamentG).toBe(10);
		expect(stats.totalRealTimeSec).toBe(100);
	});

	it('keeps partial metadata in unknown buckets without dropping consumption', () => {
		const spool = baseSpool({ id: '99999999-9999-4999-8999-999999999999' });
		const print = basePrint({ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' });

		const stats = buildPrusaDashboardStats({
			prints: [print],
			usages: [usage(print.id, spool.id, 3.5)],
			spools: [spool],
			settings: [],
			files: [],
			printers: [],
			externalImports: [prusaImport(print.id)],
		});

		expect(stats.totalFilamentG).toBe(3.5);
		expect(stats.layerHeightBreakdown[0]).toMatchObject({ label: 'Hauteur inconnue' });
		expect(stats.printerBreakdown[0]).toMatchObject({ label: 'Imprimante inconnue' });
		expect(stats.temperatureBreakdown[0]).toMatchObject({ label: 'Température inconnue' });
	});

	it('does not count manual prints without a Prusa Connect import key', () => {
		const spool = baseSpool({ id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' });
		const print = basePrint({ id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' });

		const stats = buildPrusaDashboardStats({
			prints: [print],
			usages: [usage(print.id, spool.id, 8)],
			spools: [spool],
			settings: [],
			files: [],
			printers: [],
			externalImports: [],
		});

		expect(stats.totalPrints).toBe(0);
		expect(stats.totalFilamentG).toBe(0);
	});
});
