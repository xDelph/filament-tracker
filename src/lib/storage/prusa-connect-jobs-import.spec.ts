import { describe, expect, it } from 'vitest';

import { LocalJsonDbSnapshotSchema } from './local-json-db-schema';
import { buildLocalJsonSnapshotFromPrusaConnectJobsExport } from './prusa-connect-jobs-import';

function metaMinimal(grams: number, extra: Record<string, unknown> = {}) {
	return {
		filament_used_g: grams,
		filament_type: 'PLA',
		filament_cost: 0.5,
		estimated_print_time: 3600,
		...extra,
	};
}

describe('buildLocalJsonSnapshotFromPrusaConnectJobsExport', () => {
	it('importe FIN_OK avec tables structurées et sans notes de méta', () => {
		const snap = buildLocalJsonSnapshotFromPrusaConnectJobsExport(
			{
				jobs: [
					{
						lifetime_id: '11111111-1111-4111-8111-111111111111',
						id: 101,
						origin_id: 201,
						state: 'FIN_OK',
						start: 1_700_000_000,
						end: 1_700_003_600,
						time_printing: 3500,
						printer_uuid: 'printer-uuid-aa',
						hash: 'abc123hash',
						source: 'CONNECT_USER',
						file: {
							display_name: 'Part.gcode',
							name: 'Part.gcode',
							meta: metaMinimal(12.5, {
								filament_used_mm: 4000,
								filament_used_mm3: 100,
								filament_used_cm3: 0.1,
								estimated_print_time: 4000,
								layer_height: 0.2,
								nozzle_diameter: 0.4,
								total_height: 50,
								max_layer_z: 48,
								printer_model: 'COREONEL',
								fill_density: '15%',
								support_material: 1,
								temperature: 220,
								bed_temperature: 60,
								brim_width: 0,
								ironing: 0,
								nozzle_high_flow: 1,
								filament_abrasive: 0,
								objects_info: { objects: [{ name: 'foo.stl' }, { name: 'bar.stl' }] },
							}),
						},
					},
				],
			},
			{ now: new Date('2026-05-09T12:00:00.000Z'), defaultCurrency: 'EUR' },
		);

		expect(LocalJsonDbSnapshotSchema.safeParse(snap).success).toBe(true);
		expect(snap.tables.prints).toHaveLength(1);
		expect(snap.tables.prints[0]!.notes).toBeUndefined();
		expect(snap.tables.prints[0]!.status).toBe('completed');
		expect(snap.tables.prints[0]!.elapsedSec).toBe(3600);
		expect(snap.tables.printExternalImports[0]!.externalJobId).toBe(
			'11111111-1111-4111-8111-111111111111',
		);
		expect(snap.tables.printExternalImports[0]!.externalConnectId).toBe(101);
		expect(snap.tables.printExternalImports[0]!.externalOriginId).toBe(201);
		expect(snap.tables.printExternalImports[0]!.fileHash).toBe('abc123hash');
		expect(snap.tables.printers).toHaveLength(1);
		expect(snap.tables.printSettings[0]!.fillDensityPercent).toBe(15);
		expect(snap.tables.printFiles[0]!.displayName).toBe('Part.gcode');
		expect(snap.tables.printObjects).toHaveLength(2);
		expect(snap.tables.printFilamentUsages[0]!.slicerCost).toMatchObject({
			minorUnits: 50,
			currency: 'EUR',
		});
		expect(snap.tables.printFilamentUsages[0]!.usedLengthMm).toBe(4000);
	});

	it('mappe FIN_STOPPED vers annulée et conserve print_height brut (pas interprété comme couches)', () => {
		const snap = buildLocalJsonSnapshotFromPrusaConnectJobsExport({
			jobs: [
				{
					lifetime_id: '22222222-2222-4222-8222-222222222222',
					state: 'FIN_STOPPED',
					start: 1_700_000_000,
					end: 1_700_001_000,
					time_printing: 500,
					print_height: 42,
					file: {
						display_name: 'stopped.gcode',
						name: 'stopped.gcode',
						meta: metaMinimal(10),
					},
				},
			],
		});
		expect(snap.tables.prints[0]!.status).toBe('cancelled');
		expect(snap.tables.printSettings[0]!.connectPrintHeightRaw).toBe(42);
		expect(snap.tables.printSettings[0]!.layerHeightMm).toBeUndefined();
	});

	it('accepte un job avec méta minimale (champs optionnels absents)', () => {
		const snap = buildLocalJsonSnapshotFromPrusaConnectJobsExport({
			jobs: [
				{
					lifetime_id: '33333333-3333-4333-8333-333333333333',
					state: 'FIN_OK',
					file: {
						name: 'x.gcode',
						meta: { filament_used_g: 5, filament_type: 'PLA' },
					},
				},
			],
		});
		expect(snap.tables.prints).toHaveLength(1);
		expect(snap.tables.printSettings[0]!.layerHeightMm).toBeUndefined();
		expect(snap.tables.printFilamentUsages[0]!.usedWeightG).toBe(5);
	});

	it("importe un job incomplet (ex. id 43) sans filament_used_g — impression sans ligne d'usage", () => {
		const snap = buildLocalJsonSnapshotFromPrusaConnectJobsExport({
			jobs: [
				{
					id: 43,
					state: 'FIN_OK',
					file: {
						display_name: 'partial.gcode',
					},
				},
			],
		});
		expect(snap.tables.prints).toHaveLength(1);
		expect(snap.tables.printExternalImports[0]!.externalJobId).toBe('prusa-connect-job-43');
		expect(snap.tables.printFilamentUsages).toHaveLength(0);
		expect(snap.tables.prints[0]!.name).toContain('partial');
	});

	it('projette file.sync et planned.conditions lorsque présents', () => {
		const snap = buildLocalJsonSnapshotFromPrusaConnectJobsExport(
			{
				jobs: [
					{
						lifetime_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
						state: 'FIN_OK',
						start: 1_700_000_000,
						end: 1_700_001_000,
						planned: {
							conditions: {
								layer_height: 0.15,
								bed_temp: 65,
								nozzle_temp: 210,
								filament_type: 'PETG',
							},
						},
						file: {
							display_name: 'sync.gcode',
							sync: { state: 'synced', updated: 1_700_000_500 },
							meta: {
								...metaMinimal(8),
								m_timestamp: 1_699_999_000,
							},
						},
					},
				],
			},
			{ now: new Date('2026-05-09T12:00:00.000Z') },
		);
		const pf = snap.tables.printFiles[0]!;
		expect(pf.connectSyncState).toBe('synced');
		expect(pf.sourceMetaTimestampSec).toBe(1_699_999_000);
		const ps = snap.tables.printSettings[0]!;
		expect(ps.connectPlannedLayerHeightMm).toBe(0.15);
		expect(ps.connectPlannedBedTempC).toBe(65);
		expect(ps.connectPlannedNozzleTempC).toBe(210);
		expect(ps.connectPlannedFilamentType).toBe('PETG');
	});

	it('réimport identique : même snapshot (idempotence par externalJobId)', () => {
		const payload = {
			jobs: [
				{
					lifetime_id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
					state: 'FIN_OK',
					end: 1_700_002_000,
					file: { name: 'a.gcode', meta: metaMinimal(3) },
				},
			],
		};
		const a = buildLocalJsonSnapshotFromPrusaConnectJobsExport(payload, {
			now: new Date('2026-05-09T15:00:00.000Z'),
		});
		const b = buildLocalJsonSnapshotFromPrusaConnectJobsExport(payload, {
			now: new Date('2026-05-09T15:00:00.000Z'),
		});
		expect(a).toEqual(b);
	});

	it('ignore le second job si même externalJobId dans le même export', () => {
		const snap = buildLocalJsonSnapshotFromPrusaConnectJobsExport({
			jobs: [
				{
					lifetime_id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
					file: { meta: metaMinimal(5) },
				},
				{
					lifetime_id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
					file: { display_name: 'dup.gcode', meta: metaMinimal(99) },
				},
			],
		});
		expect(snap.tables.prints).toHaveLength(1);
		expect(snap.tables.printFilamentUsages[0]!.usedWeightG).toBe(5);
	});

	it('crée deux impressions quand deux jobs partagent le hash fichier', () => {
		const snap = buildLocalJsonSnapshotFromPrusaConnectJobsExport({
			jobs: [
				{
					lifetime_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
					hash: 'shared',
					file: {
						display_name: 'a.gcode',
						meta: metaMinimal(10),
					},
				},
				{
					lifetime_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
					hash: 'shared',
					file: {
						display_name: 'b.gcode',
						meta: metaMinimal(10),
					},
				},
			],
		});
		expect(snap.tables.prints).toHaveLength(2);
		expect(new Set(snap.tables.printExternalImports.map((e) => e.externalJobId)).size).toBe(2);
		expect(snap.tables.printFilamentUsages).toHaveLength(2);
	});
});
