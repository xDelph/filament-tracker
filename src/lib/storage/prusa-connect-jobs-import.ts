/**
 * Converts a rich Prusa Connect "jobs export" JSON (with `jobs[].file.meta`) into a
 * `LocalJsonDbSnapshot` suitable for PUT `/api/local-db` after validation.
 *
 * Does not persist PII from `source_info`. Creates one synthetic {@link Spool} per distinct
 * `filament_type` so {@link PrintFilamentUsage.spoolId} resolves without manual mapping.
 */

import { randomUUID } from 'node:crypto';

import type { LocalJsonDbSnapshot } from './local-json-db-schema';
import { LOCAL_JSON_DB_SCHEMA_VERSION, LocalJsonDbSnapshotSchema } from './local-json-db-schema';

import type { Print, PrintFilamentUsage } from '../domain';
import type { FilamentStandardMaterial } from '../domain/enums';
import type { Spool, SpoolMaterial } from '../domain/spool';

const STANDARD_MATERIALS = new Set<FilamentStandardMaterial>([
	'PLA',
	'PETG',
	'ABS',
	'TPU',
	'ASA',
	'Nylon',
	'PC',
]);

export type BuildPrusaConnectJobsSnapshotOptions = {
	/** ISO 4217 code for slicer monetary fields that have no currency in the JSON. */
	defaultCurrency?: string;
	/** Override "now" for timestamps (tests). */
	now?: Date;
};

type PrusaJobRow = {
	lifetime_id?: string;
	state?: string;
	start?: number;
	end?: number;
	printer_uuid?: string;
	hash?: string;
	source?: string;
	file?: {
		display_name?: string;
		name?: string;
		meta?: {
			filament_used_g?: number;
			filament_type?: string;
			filament_cost?: number;
		};
	};
};

type PrusaJobsExportRoot = {
	jobs?: PrusaJobRow[];
};

function materialFromFilamentType(label: string): SpoolMaterial {
	const trimmed = label.trim();
	const upper = trimmed.toUpperCase();
	if (STANDARD_MATERIALS.has(upper as FilamentStandardMaterial)) {
		return { kind: 'catalog', code: upper as FilamentStandardMaterial };
	}
	return {
		kind: 'custom',
		label: (trimmed || 'UNKNOWN').slice(0, 128),
	};
}

function isoFromUnixSeconds(sec: number | undefined, fallbackIso: string): string {
	if (sec === undefined || !Number.isFinite(sec)) return fallbackIso;
	return new Date(sec * 1000).toISOString();
}

function printStatusFromConnectState(state: string | undefined): Print['status'] {
	switch (state) {
		case 'FIN_OK':
		case 'FIN_HARVESTED':
			return 'completed';
		case 'FIN_STOPPED':
			return 'cancelled';
		case 'FIN_ERROR':
			return 'failed';
		default:
			return 'completed';
	}
}

function truncateName(raw: string, max = 200): string {
	const t = raw.trim();
	return t.length <= max ? t : t.slice(0, max);
}

function filamentTypeKey(meta: NonNullable<PrusaJobRow['file']>['meta']): string {
	const ft = meta?.filament_type?.trim().toUpperCase();
	return ft && ft.length > 0 ? ft : 'UNKNOWN';
}

function costMinor(cost: number | undefined, currency: string): {
	minorUnits: number;
	currency: string;
} {
	if (cost === undefined || !Number.isFinite(cost) || cost < 0) {
		return { minorUnits: 0, currency };
	}
	const cents = Math.round(cost * 100);
	return {
		minorUnits: cents,
		currency,
	};
}

/** Parse and convert; throws if the snapshot does not satisfy {@link LocalJsonDbSnapshotSchema}. */
export function buildLocalJsonSnapshotFromPrusaConnectJobsExport(
	raw: unknown,
	options: BuildPrusaConnectJobsSnapshotOptions = {},
): LocalJsonDbSnapshot {
	const currency = (
		options.defaultCurrency ??
		process.env.FILAMENT_IMPORT_CURRENCY ??
		'EUR'
	).toUpperCase();
	const nowIso = (options.now ?? new Date()).toISOString();

	const root = raw as PrusaJobsExportRoot;
	const jobsRaw = Array.isArray(root.jobs) ? root.jobs : [];

	const rows: PrusaJobRow[] = jobsRaw.filter(
		(j): j is PrusaJobRow =>
			j !== null && typeof j === 'object' && typeof j?.file?.meta?.filament_used_g === 'number',
	);

	/** Total grams consumed per normalized filament label (for plausible spool remaining). */
	const usedByType = new Map<string, number>();
	for (const j of rows) {
		const meta = j.file!.meta!;
		const typeKey = filamentTypeKey(meta);
		const g = meta.filament_used_g!;
		if (g <= 0) continue;
		usedByType.set(typeKey, (usedByType.get(typeKey) ?? 0) + g);
	}

	const spoolIdByType = new Map<string, string>();
	const spools: Spool[] = [];

	for (const typeKey of usedByType.keys()) {
		const id = randomUUID();
		spoolIdByType.set(typeKey, id);
		const sumG = usedByType.get(typeKey) ?? 0;
		const bufferG = Math.max(10_000, Math.ceil(sumG * 0.1));
		const initialWeightG = Math.ceil(sumG + bufferG);
		const remainingWeightG = bufferG;

		spools.push({
			id,
			name: truncateName(`Import Prusa Connect · ${typeKey}`),
			material: materialFromFilamentType(typeKey),
			colorName: 'Gris',
			initialWeightG,
			remainingWeightG,
			purchasePrice: { minorUnits: 2500, currency },
			diameterMm: 1.75,
			status: 'active',
			notes: `Bobine synthétique générée à l’import (jobs export). À fusionner avec une bobine réelle dans l’UI si besoin.`,
			createdAt: nowIso,
			updatedAt: nowIso,
		});
	}

	const prints: Print[] = [];
	const printFilamentUsages: PrintFilamentUsage[] = [];

	const sortedRows = [...rows].sort((a, b) => {
		const ta = typeof a?.end === 'number' ? a.end : typeof a?.start === 'number' ? a.start : 0;
		const tb = typeof b?.end === 'number' ? b.end : typeof b?.start === 'number' ? b.start : 0;
		return ta - tb;
	});

	for (const job of sortedRows) {
		const meta = job.file!.meta!;
		const fg = meta.filament_used_g!;
		if (!(fg > 0)) continue;

		const typeKey = filamentTypeKey(meta);
		const spoolId = spoolIdByType.get(typeKey);
		if (!spoolId) continue;

		let printId: string = randomUUID();
		if (typeof job.lifetime_id === 'string' && job.lifetime_id.length >= 30) {
			printId = job.lifetime_id;
		}

		const file = job.file!;
		const nm = truncateName(file.display_name ?? file.name ?? 'Sans nom');
		const status = printStatusFromConnectState(job.state);
		const printedAtIso = isoFromUnixSeconds(job.end, isoFromUnixSeconds(job.start, nowIso));

		const metaBits: string[] = ['Source: export Prusa Connect jobs'];
		if (typeof job.hash === 'string') metaBits.push(`hash fichier: ${job.hash}`);
		if (typeof job.printer_uuid === 'string') metaBits.push(`printer_uuid: ${job.printer_uuid}`);
		metaBits.push(`state_connect: ${job.state ?? '?'}`);
		metaBits.push('Données compte utilisateur omises volontairement (source_info non importé).');

		prints.push({
			id: printId,
			name: nm,
			printedAt: printedAtIso,
			status,
			notes: metaBits.join(' · ').slice(0, 5000),
			createdAt: printedAtIso,
			updatedAt: printedAtIso,
		});

		printFilamentUsages.push({
			id: randomUUID(),
			printId,
			spoolId,
			usedWeightG: fg,
			wasteWeightG: 0,
			cost: costMinor(meta.filament_cost, currency),
			createdAt: printedAtIso,
			updatedAt: printedAtIso,
		});
	}

	const snapshotCandidate: LocalJsonDbSnapshot = {
		schemaVersion: LOCAL_JSON_DB_SCHEMA_VERSION,
		updatedAt: nowIso,
		tables: {
			spools,
			prints,
			printFilamentUsages,
			spoolAdjustments: [],
		},
	};

	return LocalJsonDbSnapshotSchema.parse(snapshotCandidate);
}
