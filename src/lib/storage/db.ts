import Dexie, { type EntityTable } from 'dexie';

import type { Print, PrintFilamentUsage, Spool, SpoolAdjustment } from '$lib/domain';

export class FilamentTrackerDb extends Dexie {
	spools!: EntityTable<Spool, 'id'>;
	prints!: EntityTable<Print, 'id'>;
	printFilamentUsages!: EntityTable<PrintFilamentUsage, 'id'>;
	spoolAdjustments!: EntityTable<SpoolAdjustment, 'id'>;

	constructor(name = 'filament-tracker') {
		super(name);
		this.version(1).stores({
			spools: 'id, status, name, updatedAt',
			prints: 'id, printedAt, status, updatedAt',
			printFilamentUsages: 'id, printId, spoolId, [printId+spoolId]',
			spoolAdjustments: 'id, spoolId, createdAt',
		});
	}
}

/** Singleton ; accès navigateur uniquement (voir routes dashboard `ssr = false`). */
export const db = new FilamentTrackerDb();
export { FilamentTrackerDb as FilamentTrackerDatabase };
