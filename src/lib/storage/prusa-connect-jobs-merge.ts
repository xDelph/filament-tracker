import {
	clampRemainingToInitialRange,
	spoolStatusAfterRemainderChange,
	type Spool,
} from '../domain';

import { LocalJsonDbSnapshotSchema, type LocalJsonDbSnapshot } from './local-json-db-schema';

/**
 * Fusionne un snapshot issu de `buildLocalJsonSnapshotFromPrusaConnectJobsExport` dans une base existante.
 * Pour les bobines déjà présentes dans `base`, met à jour le restant à partir des nouvelles lignes de consommation.
 * Les bobines entièrement nouvelles (ex. synthèses) sont ajoutées telles quelles — pas de double soustraction.
 */
export function mergePrusaConnectDeltaIntoBase(
	base: LocalJsonDbSnapshot,
	delta: LocalJsonDbSnapshot,
): LocalJsonDbSnapshot {
	const baseSpoolIds = new Set(base.tables.spools.map((s) => s.id));
	const spoolById = new Map<string, Spool>(base.tables.spools.map((s) => [s.id, s]));

	for (const s of delta.tables.spools) {
		if (!spoolById.has(s.id)) {
			spoolById.set(s.id, s);
		}
	}

	const nowIso = new Date().toISOString();

	for (const usage of delta.tables.printFilamentUsages) {
		if (!baseSpoolIds.has(usage.spoolId)) continue;
		const spool = spoolById.get(usage.spoolId);
		if (!spool) continue;
		const consumed = usage.usedWeightG + usage.wasteWeightG;
		const newRem = clampRemainingToInitialRange(
			Number((spool.remainingWeightG - consumed).toFixed(2)),
			spool.initialWeightG,
		);
		const updated: Spool = {
			...spool,
			remainingWeightG: newRem,
			status: spoolStatusAfterRemainderChange(spool, newRem),
			updatedAt: nowIso,
		};
		spoolById.set(spool.id, updated);
	}

	const merged: LocalJsonDbSnapshot = {
		schemaVersion: base.schemaVersion,
		updatedAt: nowIso,
		tables: {
			spools: [...spoolById.values()],
			prints: [...base.tables.prints, ...delta.tables.prints],
			printFilamentUsages: [
				...base.tables.printFilamentUsages,
				...delta.tables.printFilamentUsages,
			],
			spoolAdjustments: [...base.tables.spoolAdjustments, ...delta.tables.spoolAdjustments],
			printers: [...base.tables.printers, ...delta.tables.printers],
			printExternalImports: [
				...base.tables.printExternalImports,
				...delta.tables.printExternalImports,
			],
			printSettings: [...base.tables.printSettings, ...delta.tables.printSettings],
			printFiles: [...base.tables.printFiles, ...delta.tables.printFiles],
			printObjects: [...base.tables.printObjects, ...delta.tables.printObjects],
		},
	};

	return LocalJsonDbSnapshotSchema.parse(merged);
}
