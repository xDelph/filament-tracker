/**
 * Converts a rich Prusa Connect "jobs export" JSON (with `jobs[].file.meta`) into a
 * `LocalJsonDbSnapshot` suitable for PUT `/api/local-db` after validation.
 *
 * Does not persist PII from `source_info` / `owner`. Creates one synthetic {@link Spool} per distinct
 * `filament_type` so {@link PrintFilamentUsage.spoolId} resolves without manual mapping.
 */

import { z } from 'zod';

import type {
	Print,
	PrintExternalImport,
	PrintFile,
	PrintFilamentUsage,
	PrintObject,
	PrintSettings,
	Printer,
} from '../domain';
import type { FilamentStandardMaterial } from '../domain/enums';
import type { Spool, SpoolMaterial } from '../domain/spool';

import type { LocalJsonDbSnapshot } from './local-json-db-schema';
import { LOCAL_JSON_DB_SCHEMA_VERSION, LocalJsonDbSnapshotSchema } from './local-json-db-schema';

/** UUID v4 sans `node:crypto` — utilisable navigateur et Node 18+. */
function newRandomUuid(): string {
	return crypto.randomUUID();
}

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
	id?: number;
	origin_id?: number;
	lifetime_id?: string;
	state?: string;
	start?: number;
	end?: number;
	time_printing?: number;
	source?: string;
	print_height?: number;
	printer_uuid?: string;
	hash?: string;
	file?: {
		type?: string;
		name?: string;
		display_name?: string;
		size?: number;
		hash?: string;
		upload_id?: string;
		uploaded?: number;
		preview_url?: string;
		preview_mimetype?: string;
		path?: string;
		display_path?: string;
		meta?: {
			filament_used_g?: number;
			filament_type?: string;
			filament_cost?: number;
			filament_used_mm?: number;
			filament_used_m?: number;
			filament_used_mm3?: number;
			filament_used_cm3?: number;
			estimated_print_time?: number;
			layer_height?: number;
			nozzle_diameter?: number | string;
			total_height?: number;
			max_layer_z?: number;
			printer_model?: string;
			fill_density?: string;
			support_material?: string | number;
			temperature?: string | number;
			bed_temperature?: string | number;
			brim_width?: number | string;
			ironing?: string | number;
			nozzle_high_flow?: string | number;
			filament_abrasive?: string | number;
			objects_info?: { objects?: Array<{ name?: string }> };
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

function printIdFromJob(job: PrusaJobRow): string {
	if (typeof job.lifetime_id === 'string' && z.string().uuid().safeParse(job.lifetime_id).success) {
		return job.lifetime_id;
	}
	return newRandomUuid();
}

function externalJobIdFromJob(job: PrusaJobRow): string {
	if (typeof job.lifetime_id === 'string' && job.lifetime_id.length > 0) {
		return job.lifetime_id.slice(0, 256);
	}
	if (typeof job.id === 'number' && Number.isFinite(job.id)) {
		return `prusa-connect-job-${job.id}`;
	}
	return newRandomUuid();
}

function finiteNonNegOpt(v: unknown): number | undefined {
	if (v === undefined || v === null || v === '') return undefined;
	const n = typeof v === 'string' ? parseFloat(v) : Number(v);
	if (!Number.isFinite(n) || n < 0) return undefined;
	return n;
}

function intOpt(v: unknown): number | undefined {
	if (v === undefined || v === null || v === '') return undefined;
	const n = typeof v === 'string' ? parseInt(v, 10) : Math.trunc(Number(v));
	if (!Number.isFinite(n)) return undefined;
	return n;
}

function triBool(v: unknown): boolean | undefined {
	if (v === undefined || v === null) return undefined;
	if (typeof v === 'boolean') return v;
	const n = Number(v);
	if (n === 0) return false;
	if (n === 1) return true;
	return undefined;
}

function parseFillDensityPercent(raw: string | undefined): number | undefined {
	if (!raw || typeof raw !== 'string') return undefined;
	const m = raw.trim().match(/^([\d.,]+)\s*%?$/);
	if (!m) return undefined;
	const n = parseFloat(m[1]!.replace(',', '.'));
	if (!Number.isFinite(n) || n < 0) return undefined;
	return n;
}

function elapsedSecFromJob(job: PrusaJobRow): number | undefined {
	if (
		typeof job.start !== 'number' ||
		typeof job.end !== 'number' ||
		!Number.isFinite(job.start) ||
		!Number.isFinite(job.end) ||
		job.end < job.start
	) {
		return undefined;
	}
	return Math.round(job.end - job.start);
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
		const id = newRandomUuid();
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

	const printerIdByUuid = new Map<string, string>();
	const printers: Printer[] = [];

	for (const j of rows) {
		const u = j.printer_uuid?.trim();
		if (!u || printerIdByUuid.has(u)) continue;
		const pid = newRandomUuid();
		printerIdByUuid.set(u, pid);
		const modelMeta = j.file?.meta?.printer_model?.trim();
		printers.push({
			id: pid,
			source: 'prusa_connect',
			externalPrinterUuid: u.slice(0, 256),
			model: modelMeta && modelMeta.length > 0 ? truncateName(modelMeta, 500) : undefined,
			createdAt: nowIso,
			updatedAt: nowIso,
		});
	}

	const prints: Print[] = [];
	const printFilamentUsages: PrintFilamentUsage[] = [];
	const printExternalImports: PrintExternalImport[] = [];
	const printSettings: PrintSettings[] = [];
	const printFiles: PrintFile[] = [];
	const printObjects: PrintObject[] = [];

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

		const printId = printIdFromJob(job);
		const extJob = externalJobIdFromJob(job);
		const printerUuid = job.printer_uuid?.trim();
		const printerId = printerUuid ? printerIdByUuid.get(printerUuid) : undefined;

		const file = job.file!;
		const nm = truncateName(file.display_name ?? file.name ?? 'Sans nom');
		const status = printStatusFromConnectState(job.state);
		const printedAtIso = isoFromUnixSeconds(job.end, isoFromUnixSeconds(job.start, nowIso));
		const startedAtIso =
			typeof job.start === 'number' && Number.isFinite(job.start)
				? isoFromUnixSeconds(job.start, printedAtIso)
				: undefined;
		const finishedAtIso =
			typeof job.end === 'number' && Number.isFinite(job.end)
				? isoFromUnixSeconds(job.end, printedAtIso)
				: undefined;
		const timePrintingSec =
			typeof job.time_printing === 'number' && job.time_printing >= 0 && Number.isFinite(job.time_printing)
				? Math.round(job.time_printing)
				: undefined;
		const elapsedSec = elapsedSecFromJob(job);
		const estSec = meta.estimated_print_time;
		const estimatedPrintTimeSec =
			typeof estSec === 'number' && estSec >= 0 && Number.isFinite(estSec) ? Math.round(estSec) : undefined;

		const slicerMoney = costMinor(meta.filament_cost, currency);

		prints.push({
			id: printId,
			name: nm,
			printedAt: printedAtIso,
			status,
			printerId,
			startedAt: startedAtIso,
			finishedAt: finishedAtIso,
			timePrintingSec,
			elapsedSec,
			estimatedPrintTimeSec,
			createdAt: printedAtIso,
			updatedAt: printedAtIso,
		});

		printExternalImports.push({
			id: newRandomUuid(),
			printId,
			source: 'prusa_connect',
			externalJobId: extJob,
			externalConnectId: typeof job.id === 'number' && Number.isFinite(job.id) ? job.id : undefined,
			externalOriginId:
				typeof job.origin_id === 'number' && Number.isFinite(job.origin_id) ? job.origin_id : undefined,
			fileHash: typeof job.hash === 'string' && job.hash.length > 0 ? job.hash.slice(0, 512) : undefined,
			importedAt: nowIso,
		});

		const settingsId = newRandomUuid();
		const phRaw = finiteNonNegOpt(job.print_height);
		printSettings.push({
			id: settingsId,
			printId,
			nozzleDiameterMm: finiteNonNegOpt(meta.nozzle_diameter),
			nozzleHighFlow: triBool(meta.nozzle_high_flow),
			layerHeightMm: finiteNonNegOpt(meta.layer_height),
			totalHeightMm: finiteNonNegOpt(meta.total_height),
			maxLayerZMm: finiteNonNegOpt(meta.max_layer_z),
			fillDensityPercent: parseFillDensityPercent(meta.fill_density),
			supportMaterial: triBool(meta.support_material),
			brimWidthMm: finiteNonNegOpt(meta.brim_width),
			ironing: triBool(meta.ironing),
			nozzleTemperatureC: intOpt(meta.temperature),
			bedTemperatureC: intOpt(meta.bed_temperature),
			filamentAbrasive: triBool(meta.filament_abrasive),
			printerModelRaw:
				typeof meta.printer_model === 'string' && meta.printer_model.trim().length > 0
					? truncateName(meta.printer_model, 500)
					: undefined,
			connectPrintHeightRaw: phRaw,
		});

		const fileRow = job.file!;
		const up = fileRow.uploaded;
		const uploadedAt =
			typeof up === 'number' && Number.isFinite(up) ? isoFromUnixSeconds(up, nowIso) : undefined;

		printFiles.push({
			id: newRandomUuid(),
			printId,
			fileType: typeof fileRow.type === 'string' ? fileRow.type.slice(0, 64) : undefined,
			fileName: typeof fileRow.name === 'string' ? truncateName(fileRow.name, 500) : undefined,
			displayName:
				typeof fileRow.display_name === 'string' ? truncateName(fileRow.display_name, 500) : undefined,
			displayPath:
				typeof fileRow.display_path === 'string' ? fileRow.display_path.slice(0, 2000) : undefined,
			path: typeof fileRow.path === 'string' ? fileRow.path.slice(0, 2000) : undefined,
			sizeBytes:
				typeof fileRow.size === 'number' && fileRow.size >= 0 && Number.isFinite(fileRow.size)
					? Math.trunc(fileRow.size)
					: undefined,
			hash: typeof fileRow.hash === 'string' ? fileRow.hash.slice(0, 512) : undefined,
			uploadId: typeof fileRow.upload_id === 'string' ? fileRow.upload_id.slice(0, 256) : undefined,
			uploadedAt,
			previewUrl:
				typeof fileRow.preview_url === 'string' ? fileRow.preview_url.slice(0, 4000) : undefined,
			previewMimeType:
				typeof fileRow.preview_mimetype === 'string' ? fileRow.preview_mimetype.slice(0, 128) : undefined,
		});

		const stlList = meta.objects_info?.objects;
		if (Array.isArray(stlList)) {
			for (const obj of stlList) {
				const on = typeof obj?.name === 'string' ? obj.name.trim() : '';
				if (!on) continue;
				printObjects.push({
					id: newRandomUuid(),
					printId,
					name: truncateName(on, 500),
					quantity: 1,
				});
			}
		}

		const usedMm =
			typeof meta.filament_used_mm === 'number' && meta.filament_used_mm >= 0
				? meta.filament_used_mm
				: typeof meta.filament_used_m === 'number' && meta.filament_used_m >= 0
					? meta.filament_used_m * 1000
					: undefined;

		printFilamentUsages.push({
			id: newRandomUuid(),
			printId,
			spoolId,
			usedWeightG: fg,
			wasteWeightG: 0,
			cost: slicerMoney,
			usedLengthMm: usedMm,
			usedVolumeMm3:
				typeof meta.filament_used_mm3 === 'number' && meta.filament_used_mm3 >= 0
					? meta.filament_used_mm3
					: undefined,
			usedVolumeCm3:
				typeof meta.filament_used_cm3 === 'number' && meta.filament_used_cm3 >= 0
					? meta.filament_used_cm3
					: undefined,
			slicerCost:
				slicerMoney.minorUnits > 0 || meta.filament_cost !== undefined ? slicerMoney : undefined,
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
			printers,
			printExternalImports,
			printSettings,
			printFiles,
			printObjects,
		},
	};

	return LocalJsonDbSnapshotSchema.parse(snapshotCandidate);
}
