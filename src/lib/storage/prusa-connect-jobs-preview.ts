import type { PrusaConnectObjectsMode, PrusaJobRow } from './prusa-connect-jobs-import';
import {
	externalJobIdFromPrusaJob,
	filamentTypeKeyFromPrusaMeta,
} from './prusa-connect-jobs-import';

/** Ligne métier Prusa (sans PII) — alignée sur l’extracteur interne. */
export type PrusaConnectPreviewJobRow = {
	index: number;
	displayName: string;
	state?: string;
	filamentTypeKey: string;
	filamentUsedG?: number;
	externalJobId: string;
	printerUuid?: string;
	issues: string[];
};

export type PrusaConnectPreviewSummary = {
	jobCount: number;
	jobsWithMetaGrams: number;
	skippedNoGrams: number;
	statusCounts: Record<string, number>;
	dateMinSec?: number;
	dateMaxSec?: number;
	printerUuids: string[];
	/** Grammes comptées pour la conso bobine si les jobs `FIN_STOPPED` consomment. */
	totalFilamentGConsume: number;
	/** Secondes d’impression cumulées (`time_printing` si présent, sinon `end-start`). */
	totalDurationSec: number;
	missingCounts: {
		filamentType: number;
		filamentCost: number;
		estimatedPrintTime: number;
	};
};

export type PrusaConnectJobsPreview = {
	summary: PrusaConnectPreviewSummary;
	jobs: PrusaConnectPreviewJobRow[];
};

type LooseJob = {
	id?: number;
	lifetime_id?: string;
	state?: string;
	start?: number;
	end?: number;
	time_printing?: number;
	printer_uuid?: string;
	file?: {
		name?: string;
		display_name?: string;
		meta?: {
			filament_used_g?: number;
			filament_type?: string;
			filament_cost?: number;
			estimated_print_time?: number;
			objects_info?: { objects?: unknown[] };
		};
	};
};

type LooseRoot = { jobs?: unknown[] };

function durationSecForJob(job: LooseJob): number {
	if (
		typeof job.time_printing === 'number' &&
		job.time_printing >= 0 &&
		Number.isFinite(job.time_printing)
	) {
		return Math.round(job.time_printing);
	}
	if (
		typeof job.start === 'number' &&
		typeof job.end === 'number' &&
		Number.isFinite(job.start) &&
		Number.isFinite(job.end) &&
		job.end >= job.start
	) {
		return Math.round(job.end - job.start);
	}
	return 0;
}

/**
 * Aperçu d’un export jobs Prusa Connect enrichi : statistiques et anomalies par job (sans bloquer l’import).
 */
export function previewPrusaConnectJobsExport(
	raw: unknown,
	context: {
		stoppedJobsConsumeFilament: boolean;
		objectsMode: PrusaConnectObjectsMode;
	} = {
		stoppedJobsConsumeFilament: true,
		objectsMode: 'per_stl',
	},
): PrusaConnectJobsPreview {
	const root = raw as LooseRoot;
	const jobsRaw = Array.isArray(root.jobs) ? root.jobs : [];

	let skippedNoGrams = 0;
	const statusCounts: Record<string, number> = {};
	const printerSet = new Set<string>();
	let dateMinSec: number | undefined;
	let dateMaxSec: number | undefined;
	const missingCounts = {
		filamentType: 0,
		filamentCost: 0,
		estimatedPrintTime: 0,
	};

	let totalFilamentGConsume = 0;
	let totalDurationSec = 0;
	let jobsWithMetaGrams = 0;

	const jobs: PrusaConnectPreviewJobRow[] = [];

	for (let index = 0; index < jobsRaw.length; index++) {
		const j = jobsRaw[index];
		if (j === null || typeof j !== 'object') continue;
		const job = j as LooseJob;
		const st = typeof job.state === 'string' ? job.state : 'UNKNOWN';
		statusCounts[st] = (statusCounts[st] ?? 0) + 1;

		const displayName = (
			typeof job.file?.display_name === 'string'
				? job.file.display_name
				: typeof job.file?.name === 'string'
					? job.file.name
					: 'Sans nom'
		).trim();

		let meta = job.file?.meta;
		if (meta === null || typeof meta !== 'object') meta = undefined;

		const issues: string[] = [];
		const g =
			meta !== undefined &&
			typeof meta.filament_used_g === 'number' &&
			Number.isFinite(meta.filament_used_g)
				? meta.filament_used_g
				: undefined;

		if (g === undefined) {
			skippedNoGrams += 1;
			issues.push('Méta sans grammes utilisés (`filament_used_g`) — job ignoré à l’import.');
		} else if (!(g > 0)) {
			issues.push('Grammes utilisés nuls ou négatifs — ignoré à l’import.');
		} else {
			jobsWithMetaGrams += 1;
		}

		const filamentTypeKey = filamentTypeKeyFromPrusaMeta(
			meta as NonNullable<NonNullable<PrusaJobRow['file']>['meta']>,
		);

		if (meta && (meta.filament_type === undefined || String(meta.filament_type).trim() === '')) {
			missingCounts.filamentType += 1;
			if (g !== undefined && g > 0) issues.push('Type filament absent (clef « UNKNOWN »).');
		}
		if (meta && (meta.filament_cost === undefined || !Number.isFinite(meta.filament_cost))) {
			missingCounts.filamentCost += 1;
		}
		if (
			meta &&
			(meta.estimated_print_time === undefined || !Number.isFinite(meta.estimated_print_time))
		) {
			missingCounts.estimatedPrintTime += 1;
		}

		const isStopped = st === 'FIN_STOPPED';
		const countsFilament =
			g !== undefined && g > 0 && !(isStopped && !context.stoppedJobsConsumeFilament);

		if (countsFilament && g !== undefined) {
			totalFilamentGConsume += g;
		}

		const pu = typeof job.printer_uuid === 'string' ? job.printer_uuid.trim() : '';
		if (pu) printerSet.add(pu);

		const tEnd = typeof job.end === 'number' && Number.isFinite(job.end) ? job.end : undefined;
		const tStart = typeof job.start === 'number' && Number.isFinite(job.start) ? job.start : undefined;
		for (const t of [tStart, tEnd]) {
			if (t === undefined) continue;
			if (dateMinSec === undefined || t < dateMinSec) dateMinSec = t;
			if (dateMaxSec === undefined || t > dateMaxSec) dateMaxSec = t;
		}

		totalDurationSec += durationSecForJob(job);

		let objectIssue: string | undefined;
		const stlCount = Array.isArray(meta?.objects_info?.objects)
			? meta!.objects_info!.objects!.length
			: 0;
		if (context.objectsMode === 'per_stl' && stlCount === 0) {
			objectIssue = 'Aucun `objects_info.objects` — pas d’objets STL listés.';
		}

		const externalJobId = externalJobIdFromPrusaJob(job as PrusaJobRow);

		jobs.push({
			index,
			displayName,
			state: st,
			filamentTypeKey,
			filamentUsedG: g,
			externalJobId,
			printerUuid: pu || undefined,
			issues: objectIssue ? [...issues, objectIssue] : issues,
		});
	}

	return {
		summary: {
			jobCount: jobsRaw.length,
			jobsWithMetaGrams,
			skippedNoGrams,
			statusCounts,
			dateMinSec,
			dateMaxSec,
			printerUuids: [...printerSet].sort(),
			totalFilamentGConsume,
			totalDurationSec,
			missingCounts,
		},
		jobs,
	};
}
