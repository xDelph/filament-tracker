import { describe, expect, it } from 'vitest';

import { fixtureSpoolPlaGrey } from '$lib/test/fixtures/domain-fixtures';

import { QuickPrintCreateInputSchema } from './prints';

describe('QuickPrintCreateInputSchema', () => {
	it('exige au moins une ligne de consommation', () => {
		const empty = QuickPrintCreateInputSchema.safeParse({
			name: 'Sans bobine',
			usages: [],
		});
		expect(empty.success).toBe(false);
	});

	it('rejette un identifiant bobine invalide', () => {
		const badId = QuickPrintCreateInputSchema.safeParse({
			name: 'Bad',
			usages: [{ spoolId: 'not-a-uuid', usedWeightG: 1 }],
		});
		expect(badId.success).toBe(false);
	});

	it('accepte une entrée minimale valide', () => {
		const ok = QuickPrintCreateInputSchema.safeParse({
			name: 'Calibration',
			usages: [{ spoolId: fixtureSpoolPlaGrey.id, usedWeightG: 5 }],
		});
		expect(ok.success).toBe(true);
	});
});
