import Dexie, { type EntityTable } from 'dexie';

import type { Spool } from '$lib/domain';

export class FilamentTrackerDb extends Dexie {
	spools!: EntityTable<Spool, 'id'>;

	constructor() {
		super('filament-tracker');
		this.version(1).stores({
			spools: 'id, status, name, updatedAt',
		});
	}
}

/** Singleton ; accès navigateur uniquement (voir routes dashboard `ssr = false`). */
export const db = new FilamentTrackerDb();
