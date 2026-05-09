import { describe, expect, it } from 'vitest';

import { emptyLocalJsonDbSnapshot } from './local-json-db-schema';
import { buildLocalJsonSnapshotFromPrusaConnectJobsExport } from './prusa-connect-jobs-import';
import { mergePrusaConnectDeltaIntoBase } from './prusa-connect-jobs-merge';

describe('mergePrusaConnectDeltaIntoBase', () => {
	it('déduit le restant des bobines déjà présentes', () => {
		const spoolId = '10000000-0000-4000-8000-000000000001';
		const base = emptyLocalJsonDbSnapshot('2026-05-09T12:00:00.000Z');
		base.tables.spools.push({
			id: spoolId,
			name: 'Bobine test',
			material: { kind: 'catalog', code: 'PLA' },
			colorName: 'Gris',
			initialWeightG: 1000,
			remainingWeightG: 500,
			purchasePrice: { minorUnits: 1000, currency: 'EUR' },
			diameterMm: 1.75,
			status: 'active',
			createdAt: base.updatedAt,
			updatedAt: base.updatedAt,
		});

		const delta = buildLocalJsonSnapshotFromPrusaConnectJobsExport(
			{
				jobs: [
					{
						lifetime_id: '20000000-0000-4000-8000-000000000002',
						state: 'FIN_OK',
						file: {
							display_name: 'p.gcode',
							meta: {
								filament_used_g: 50,
								filament_type: 'PLA',
								filament_cost: 0.1,
							},
						},
					},
				],
			},
			{
				filamentTypeToSpoolId: { PLA: spoolId },
				createSyntheticSpools: false,
				now: new Date('2026-05-09T12:00:00.000Z'),
			},
		);

		const merged = mergePrusaConnectDeltaIntoBase(base, delta);
		const spool = merged.tables.spools.find((s) => s.id === spoolId);
		expect(spool?.remainingWeightG).toBe(450);
		expect(merged.tables.prints.length).toBe(1);
		expect(merged.tables.printFilamentUsages.length).toBe(1);
	});
});
