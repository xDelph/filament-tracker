import Dexie, { type EntityTable } from 'dexie';

import type {
	Print,
	PrintExternalImport,
	PrintFile,
	PrintFilamentUsage,
	PrintObject,
	PrintSettings,
	Printer,
	Spool,
	SpoolAdjustment,
} from '$lib/domain';

/** Nom logique IndexedDB (schéma unique, sans chaîne d’upgrade Dexie). */
export const FILAMENT_TRACKER_INDEXED_DB_NAME = 'filament-tracker-db';

export class FilamentTrackerDb extends Dexie {
	spools!: EntityTable<Spool, 'id'>;
	prints!: EntityTable<Print, 'id'>;
	printFilamentUsages!: EntityTable<PrintFilamentUsage, 'id'>;
	spoolAdjustments!: EntityTable<SpoolAdjustment, 'id'>;
	printers!: EntityTable<Printer, 'id'>;
	printExternalImports!: EntityTable<PrintExternalImport, 'id'>;
	printSettings!: EntityTable<PrintSettings, 'id'>;
	printFiles!: EntityTable<PrintFile, 'id'>;
	printObjects!: EntityTable<PrintObject, 'id'>;

	constructor(name = FILAMENT_TRACKER_INDEXED_DB_NAME) {
		super(name);
		this.version(1).stores({
			spools: 'id, status, name, updatedAt',
			prints: 'id, printedAt, status, updatedAt, printerId',
			printFilamentUsages: 'id, printId, spoolId, [printId+spoolId]',
			spoolAdjustments: 'id, spoolId, createdAt',
			printers: 'id, source, externalPrinterUuid, updatedAt',
			printExternalImports: 'id, printId, source, externalJobId, [source+externalJobId]',
			printSettings: 'id, printId',
			printFiles: 'id, printId',
			printObjects: 'id, printId',
		});
	}
}

/** Singleton ; accès navigateur uniquement (voir routes dashboard `ssr = false`). */
export const db = new FilamentTrackerDb();
export { FilamentTrackerDb as FilamentTrackerDatabase };
