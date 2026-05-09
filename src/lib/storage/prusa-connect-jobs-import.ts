/**
 * Converts a rich Prusa Connect "jobs export" JSON (with `jobs[].file.meta`) into a
 * `LocalJsonDbSnapshot` suitable for PUT `/api/local-db` after validation.
 *
 * Does not persist PII from `source_info` / `owner`. Creates one synthetic {@link Spool} per distinct
 * `filament_type` so {@link PrintFilamentUsage.spoolId} resolves without manual mapping.
 *
 * **FIN_STOPPED — `print_height` :** la valeur Connect est stockée telle quelle dans
 * {@link PrintSettings.connectPrintHeightRaw}. Elle n’est pas interprétée comme un nombre de couches
 * côté domaine (contrairement à d’autres champs de hauteur issus des méta G-code).
 *
 * **Idempotence :** les identifiants dérivés du couple logique `(source='prusa_connect', externalJobId)`
 * sont stables (UUID déterministes). Réimporter le même export produit les mêmes clés primaires ;
 * les doublons d’`externalJobId` dans un même fichier sont ignorés (première occurrence conservée).
 */

import { createHash } from 'node:crypto';

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

const UUID_NS_EXT_IMPORT = 'filament-tracker/prusa-connect/v1/external-import';
const UUID_NS_PRINT = 'filament-tracker/prusa-connect/v1/print';
const UUID_NS_SETTINGS = 'filament-tracker/prusa-connect/v1/settings';
const UUID_NS_FILE = 'filament-tracker/prusa-connect/v1/file';
const UUID_NS_USAGE = 'filament-tracker/prusa-connect/v1/usage';
const UUID_NS_OBJECT = 'filament-tracker/prusa-connect/v1/object';
const UUID_NS_SPOOL = 'filament-tracker/prusa-connect/v1/spool';
const UUID_NS_PRINTER = 'filament-tracker/prusa-connect/v1/printer';

/** UUID déterministe (RFC 4122 variante aléatoire, bits dérivés de SHA-256). */
function deterministicUuid(namespace: string, key: string): string {
	const digest = createHash('sha256').update(`${namespace}\0${key}`, 'utf8').digest().subarray(0, 16);
	digest[6] = (digest[6]! & 0x0f) | 0x40;
	digest[8] = (digest[8]! & 0x3f) | 0x80;
	const h = digest.toString('hex');
	return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
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
	planned?: {
		conditions?: Record<string, unknown>;
	};
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
		sync?: Record<string, unknown>;
		meta?: {
			filament_used_g?: number;
			filament_type?: string;
			filament_cost?: number;
			filament_used_mm?: number;
			filament_used_m?: number;
			filament_used_mm3?: number;
			filament_used_cm3?: number;
			estimated_print_time?: number;
			print_time?: number;
			layer_height?: number;
			nozzle_diameter?: number | string;
			total_height?: number;
			max_layer_z?: number;
			printer_model?: string;
			material_name?: string;
			fill_density?: string;
			support_material?: string | number;
			temperature?: string | number;
			bed_temperature?: string | number;
			brim_width?: number | string;
			ironing?: string | number;
			nozzle_high_flow?: string | number;
			filament_abrasive?: string | number;
			m_timestamp?: number;
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

function externalJobIdFromJob(job: PrusaJobRow): string {
	if (typeof job.lifetime_id === 'string' && job.lifetime_id.length > 0) {
		return job.lifetime_id.slice(0, 256);
	}
	if (typeof job.id === 'number' && Number.isFinite(job.id)) {
		return `prusa-connect-job-${job.id}`;
	}
	const h = job.file?.hash?.trim();
	if (h && h.length > 0) {
		return `prusa-connect-file-${h.slice(0, 200)}`;
	}
	const key = [
		job.file?.path ?? '',
		job.file?.display_name ?? job.file?.name ?? '',
		String(job.start ?? ''),
		String(job.end ?? ''),
	].join('\x1e');
	return `prusa-connect-anon-${createHash('sha256').update(key, 'utf8').digest('hex').slice(0, 40)}`;
}

function printIdFromJob(job: PrusaJobRow, externalJobId: string): string {
	if (typeof job.lifetime_id === 'string' && z.string().uuid().safeParse(job.lifetime_id).success) {
		return job.lifetime_id;
	}
	return deterministicUuid(UUID_NS_PRINT, externalJobId);
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

function isImportableJobRow(j: unknown): j is PrusaJobRow {
	if (j === null || typeof j !== 'object') return false;
	const r = j as PrusaJobRow;
	if (typeof r.id === 'number' && Number.isFinite(r.id)) return true;
	if (typeof r.lifetime_id === 'string' && r.lifetime_id.trim().length > 0) return true;
	if (r.file !== undefined && r.file !== null && typeof r.file === 'object') return true;
	return false;
}

function plannedConditionFields(job: PrusaJobRow): Pick<
	PrintSettings,
	| 'connectPlannedLayerHeightMm'
	| 'connectPlannedNozzleTempC'
	| 'connectPlannedBedTempC'
	| 'connectPlannedFilamentType'
> {
	const p = job.planned;
	if (!p || typeof p !== 'object') return {};
	const cond = (p as { conditions?: unknown }).conditions;
	if (!cond || typeof cond !== 'object') return {};
	const raw = cond as Record<string, unknown>;
	const layer =
		raw.layer_height ?? raw.layerHeight ?? raw.layer_height_mm ?? raw['layer-height'];
	const ft =
		typeof raw.filament_type === 'string'
			? truncateName(raw.filament_type, 128)
			: typeof raw.material === 'string'
				? truncateName(raw.material, 128)
				: undefined;
	return {
		connectPlannedLayerHeightMm: finiteNonNegOpt(layer),
		connectPlannedNozzleTempC: intOpt(
			raw.nozzle_temp ?? raw.extruder_temp ?? raw.nozzle_temperature ?? raw.temperature,
		),
		connectPlannedBedTempC: intOpt(raw.bed_temp ?? raw.bed_temperature),
		connectPlannedFilamentType: ft,
	};
}

function readFileSyncFields(
	file: NonNullable<PrusaJobRow['file']>,
	nowIso: string,
): Pick<PrintFile, 'connectSyncState' | 'connectSyncUpdatedAt'> {
	const s = file.sync;
	if (!s || typeof s !== 'object') return {};
	const o = s as Record<string, unknown>;
	const state =
		typeof o.state === 'string'
			? o.state.slice(0, 128)
			: typeof o.sync_state === 'string'
				? o.sync_state.slice(0, 128)
				: undefined;
	let updated: string | undefined;
	const u = o.updated ?? o.updated_at ?? o.timestamp ?? o.last_sync;
	if (typeof u === 'number' && Number.isFinite(u)) {
		updated = isoFromUnixSeconds(u, nowIso);
	}
	return { connectSyncState: state, connectSyncUpdatedAt: updated };
}

function positiveFilamentGrams(
	meta: NonNullable<PrusaJobRow['file']>['meta'] | undefined,
): number | undefined {
	if (!meta || typeof meta !== 'object') return undefined;
	const g = meta.filament_used_g;
	if (typeof g !== 'number' || !Number.isFinite(g) || !(g > 0)) return undefined;
	return g;
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

	const rowsAll: PrusaJobRow[] = jobsRaw.filter(isImportableJobRow);

	const rows: PrusaJobRow[] = [];
	const seenExternal = new Set<string>();
	for (const job of rowsAll) {
		const ext = externalJobIdFromJob(job);
		if (seenExternal.has(ext)) continue;
		seenExternal.add(ext);
		rows.push(job);
	}

	const usedByType = new Map<string, number>();
	for (const j of rows) {
		const fg = positiveFilamentGrams(j.file?.meta);
		if (fg === undefined) continue;
		const meta = j.file!.meta!;
		const typeKey = filamentTypeKey(meta);
		usedByType.set(typeKey, (usedByType.get(typeKey) ?? 0) + fg);
	}

	const spoolIdByType = new Map<string, string>();
	const spools: Spool[] = [];

	for (const typeKey of usedByType.keys()) {
		const id = deterministicUuid(UUID_NS_SPOOL, typeKey);
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
		const pid = deterministicUuid(UUID_NS_PRINTER, u);
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
		const extJob = externalJobIdFromJob(job);
		const printId = printIdFromJob(job, extJob);
		const meta = job.file?.meta;
		const fg = positiveFilamentGrams(meta);
		const typeKey = meta ? filamentTypeKey(meta) : 'UNKNOWN';
		const spoolId = fg !== undefined ? spoolIdByType.get(typeKey) : undefined;

		const printerUuid = job.printer_uuid?.trim();
		const printerId = printerUuid ? printerIdByUuid.get(printerUuid) : undefined;

		const file = job.file;
		const nm = file
			? truncateName(file.display_name ?? file.name ?? 'Sans nom')
			: typeof job.id === 'number'
				? truncateName(`Job #${job.id}`)
				: truncateName(extJob.slice(0, 80));
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
				: typeof meta?.print_time === 'number' && meta.print_time >= 0 && Number.isFinite(meta.print_time)
					? Math.round(meta.print_time)
					: undefined;
		const elapsedSec = elapsedSecFromJob(job);
		const estSec = meta?.estimated_print_time;
		const estimatedPrintTimeSec =
			typeof estSec === 'number' && estSec >= 0 && Number.isFinite(estSec) ? Math.round(estSec) : undefined;

		const slicerMoney = costMinor(meta?.filament_cost, currency);
		const planned = plannedConditionFields(job);

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
			id: deterministicUuid(UUID_NS_EXT_IMPORT, `prusa_connect|${extJob}`),
			printId,
			source: 'prusa_connect',
			externalJobId: extJob,
			externalConnectId: typeof job.id === 'number' && Number.isFinite(job.id) ? job.id : undefined,
			externalOriginId:
				typeof job.origin_id === 'number' && Number.isFinite(job.origin_id) ? job.origin_id : undefined,
			fileHash: typeof job.hash === 'string' && job.hash.length > 0 ? job.hash.slice(0, 512) : undefined,
			importedAt: nowIso,
		});

		const settingsId = deterministicUuid(UUID_NS_SETTINGS, extJob);
		const phRaw = finiteNonNegOpt(job.print_height);
		const modelFromMeta =
			typeof meta?.printer_model === 'string' && meta.printer_model.trim().length > 0
				? truncateName(meta.printer_model, 500)
				: undefined;
		const modelFromMaterial =
			typeof meta?.material_name === 'string' && meta.material_name.trim().length > 0
				? truncateName(meta.material_name, 500)
				: undefined;

		printSettings.push({
			id: settingsId,
			printId,
			nozzleDiameterMm: meta ? finiteNonNegOpt(meta.nozzle_diameter) : undefined,
			nozzleHighFlow: meta ? triBool(meta.nozzle_high_flow) : undefined,
			layerHeightMm: meta ? finiteNonNegOpt(meta.layer_height) : undefined,
			totalHeightMm: meta ? finiteNonNegOpt(meta.total_height) : undefined,
			maxLayerZMm: meta ? finiteNonNegOpt(meta.max_layer_z) : undefined,
			fillDensityPercent: meta ? parseFillDensityPercent(meta.fill_density) : undefined,
			supportMaterial: meta ? triBool(meta.support_material) : undefined,
			brimWidthMm: meta ? finiteNonNegOpt(meta.brim_width) : undefined,
			ironing: meta ? triBool(meta.ironing) : undefined,
			nozzleTemperatureC: meta ? intOpt(meta.temperature) : undefined,
			bedTemperatureC: meta ? intOpt(meta.bed_temperature) : undefined,
			filamentAbrasive: meta ? triBool(meta.filament_abrasive) : undefined,
			printerModelRaw: modelFromMeta ?? modelFromMaterial,
			connectPrintHeightRaw: phRaw,
			...planned,
		});

		if (file) {
			const up = file.uploaded;
			const uploadedAt =
				typeof up === 'number' && Number.isFinite(up) ? isoFromUnixSeconds(up, nowIso) : undefined;
			const syncFields = readFileSyncFields(file, nowIso);
			const metaTs = meta?.m_timestamp;
			const sourceMetaTimestampSec =
				typeof metaTs === 'number' && Number.isFinite(metaTs) ? metaTs : undefined;

			printFiles.push({
				id: deterministicUuid(UUID_NS_FILE, extJob),
				printId,
				fileType: typeof file.type === 'string' ? file.type.slice(0, 64) : undefined,
				fileName: typeof file.name === 'string' ? truncateName(file.name, 500) : undefined,
				displayName:
					typeof file.display_name === 'string' ? truncateName(file.display_name, 500) : undefined,
				displayPath:
					typeof file.display_path === 'string' ? file.display_path.slice(0, 2000) : undefined,
				path: typeof file.path === 'string' ? file.path.slice(0, 2000) : undefined,
				sizeBytes:
					typeof file.size === 'number' && file.size >= 0 && Number.isFinite(file.size)
						? Math.trunc(file.size)
						: undefined,
				hash: typeof file.hash === 'string' ? file.hash.slice(0, 512) : undefined,
				uploadId: typeof file.upload_id === 'string' ? file.upload_id.slice(0, 256) : undefined,
				uploadedAt,
				previewUrl:
					typeof file.preview_url === 'string' ? file.preview_url.slice(0, 4000) : undefined,
				previewMimeType:
					typeof file.preview_mimetype === 'string' ? file.preview_mimetype.slice(0, 128) : undefined,
				sourceMetaTimestampSec,
				...syncFields,
			});
		}

		const stlList = meta?.objects_info?.objects;
		if (Array.isArray(stlList)) {
			let objIdx = 0;
			for (const obj of stlList) {
				const on = typeof obj?.name === 'string' ? obj.name.trim() : '';
				if (!on) continue;
				printObjects.push({
					id: deterministicUuid(UUID_NS_OBJECT, `${extJob}|${objIdx}|${on}`),
					printId,
					name: truncateName(on, 500),
					quantity: 1,
				});
				objIdx += 1;
			}
		}

		if (fg !== undefined && spoolId) {
			const usedMm =
				typeof meta!.filament_used_mm === 'number' && meta!.filament_used_mm >= 0
					? meta!.filament_used_mm
					: typeof meta!.filament_used_m === 'number' && meta!.filament_used_m >= 0
						? meta!.filament_used_m * 1000
						: undefined;

			printFilamentUsages.push({
				id: deterministicUuid(UUID_NS_USAGE, `${extJob}|${spoolId}`),
				printId,
				spoolId,
				usedWeightG: fg,
				wasteWeightG: 0,
				cost: slicerMoney,
				usedLengthMm: usedMm,
				usedVolumeMm3:
					typeof meta!.filament_used_mm3 === 'number' && meta!.filament_used_mm3 >= 0
						? meta!.filament_used_mm3
						: undefined,
				usedVolumeCm3:
					typeof meta!.filament_used_cm3 === 'number' && meta!.filament_used_cm3 >= 0
						? meta!.filament_used_cm3
						: undefined,
				slicerCost:
					slicerMoney.minorUnits > 0 || meta!.filament_cost !== undefined ? slicerMoney : undefined,
				createdAt: printedAtIso,
				updatedAt: printedAtIso,
			});
		}
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
