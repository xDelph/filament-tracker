import type {
	Print,
	PrintExternalImport,
	PrintFile,
	PrintFilamentUsage,
	PrintSettings,
	Printer,
	Spool,
} from '$lib/domain';

export type BreakdownItem = {
	key: string;
	label: string;
	count: number;
	grams: number;
};

export type InterruptedPrintStat = {
	id: string;
	name: string;
	status: Print['status'];
	printedAt: string;
	durationSec?: number;
	estimatedPrintTimeSec?: number;
	fileName: string;
	connectPrintHeightRaw?: number;
	filamentG: number;
};

export type PrusaDashboardStats = {
	totalPrints: number;
	completedPrints: number;
	interruptedPrints: number;
	totalFilamentG: number;
	totalRealTimeSec: number;
	totalEstimatedTimeSec: number;
	estimateDeltaSec: number;
	statusBreakdown: BreakdownItem[];
	materialBreakdown: BreakdownItem[];
	printerBreakdown: BreakdownItem[];
	layerHeightBreakdown: BreakdownItem[];
	nozzleBreakdown: BreakdownItem[];
	supportBreakdown: BreakdownItem[];
	temperatureBreakdown: BreakdownItem[];
	interrupted: InterruptedPrintStat[];
};

export type PrusaDashboardStatsInput = {
	prints: Print[];
	usages: PrintFilamentUsage[];
	spools: Spool[];
	settings: PrintSettings[];
	files: PrintFile[];
	printers: Printer[];
	externalImports: PrintExternalImport[];
};

const STATUS_LABELS: Record<Print['status'], string> = {
	completed: 'Terminées',
	failed: 'Échouées',
	cancelled: 'Stoppées',
};

function materialLabel(spool: Spool | undefined): string {
	if (!spool) return 'Matière inconnue';
	return spool.material.kind === 'catalog' ? spool.material.code : spool.material.label;
}

function firstDefinedNumber(...values: Array<number | undefined>): number | undefined {
	return values.find((value) => value !== undefined && Number.isFinite(value));
}

function durationForPrint(print: Print): number | undefined {
	return firstDefinedNumber(print.timePrintingSec, print.elapsedSec);
}

function rounded(value: number, decimals = 2): number {
	const factor = 10 ** decimals;
	return Math.round(value * factor) / factor;
}

function printImportKey(
	print: Print,
	importsByPrintId: Map<string, PrintExternalImport[]>,
): string | undefined {
	const imports = importsByPrintId.get(print.id) ?? [];
	const stableImport = imports.find(
		(entry) => entry.source === 'prusa_connect' && entry.externalJobId,
	);
	if (stableImport) {
		return `${stableImport.source}:${stableImport.externalJobId}`;
	}
	return undefined;
}

function newestFirst(a: Print, b: Print): number {
	const au = Date.parse(a.updatedAt);
	const bu = Date.parse(b.updatedAt);
	if (!Number.isNaN(au) && !Number.isNaN(bu) && au !== bu) return bu - au;

	const ap = Date.parse(a.printedAt);
	const bp = Date.parse(b.printedAt);
	if (!Number.isNaN(ap) && !Number.isNaN(bp) && ap !== bp) return bp - ap;

	return a.id.localeCompare(b.id);
}

function uniquePrintsByImportKey(
	prints: Print[],
	externalImports: PrintExternalImport[],
): Print[] {
	const importsByPrintId = new Map<string, PrintExternalImport[]>();
	for (const entry of externalImports) {
		const existing = importsByPrintId.get(entry.printId) ?? [];
		existing.push(entry);
		importsByPrintId.set(entry.printId, existing);
	}

	const selected = new Map<string, Print>();
	for (const print of [...prints].sort(newestFirst)) {
		const key = printImportKey(print, importsByPrintId);
		if (!key) continue;
		if (!selected.has(key)) {
			selected.set(key, print);
		}
	}
	return [...selected.values()];
}

function addBreakdown(
	map: Map<string, BreakdownItem>,
	key: string,
	label: string,
	grams: number,
): void {
	const current = map.get(key);
	if (current) {
		current.count += 1;
		current.grams = rounded(current.grams + grams);
		return;
	}
	map.set(key, { key, label, count: 1, grams: rounded(grams) });
}

function sortedBreakdown(map: Map<string, BreakdownItem>): BreakdownItem[] {
	return [...map.values()].sort(
		(a, b) =>
			b.count - a.count ||
			b.grams - a.grams ||
			a.label.localeCompare(b.label, 'fr', { sensitivity: 'base' }),
	);
}

function settingLabel(value: number | undefined, suffix: string, fallback: string): string {
	if (value === undefined) return fallback;
	return `${rounded(value)} ${suffix}`;
}

function temperatureLabel(setting: PrintSettings | undefined): string {
	const nozzle = setting?.nozzleTemperatureC;
	const bed = setting?.bedTemperatureC;
	if (nozzle === undefined && bed === undefined) return 'Température inconnue';
	if (nozzle !== undefined && bed !== undefined) return `${nozzle}/${bed} °C`;
	if (nozzle !== undefined) return `${nozzle} °C buse`;
	return `${bed} °C plateau`;
}

function supportLabel(value: boolean | undefined): string {
	if (value === true) return 'Avec supports';
	if (value === false) return 'Sans supports';
	return 'Supports inconnus';
}

function printerLabel(print: Print, printersById: Map<string, Printer>): string {
	const printer = print.printerId ? printersById.get(print.printerId) : undefined;
	if (!printer) return 'Imprimante inconnue';
	return printer.model ?? printer.externalPrinterUuid ?? 'Imprimante Prusa';
}

function fileLabel(file: PrintFile | undefined): string {
	return file?.displayName ?? file?.fileName ?? file?.path ?? 'Fichier inconnu';
}

export function buildPrusaDashboardStats(input: PrusaDashboardStatsInput): PrusaDashboardStats {
	const uniquePrints = uniquePrintsByImportKey(input.prints, input.externalImports);
	const uniquePrintIds = new Set(uniquePrints.map((print) => print.id));
	const spoolById = new Map(input.spools.map((spool) => [spool.id, spool]));
	const settingsByPrintId = new Map(input.settings.map((setting) => [setting.printId, setting]));
	const filesByPrintId = new Map(input.files.map((file) => [file.printId, file]));
	const printersById = new Map(input.printers.map((printer) => [printer.id, printer]));

	const usageByPrintId = new Map<string, PrintFilamentUsage[]>();
	for (const usage of input.usages) {
		if (!uniquePrintIds.has(usage.printId)) continue;
		const rows = usageByPrintId.get(usage.printId) ?? [];
		rows.push(usage);
		usageByPrintId.set(usage.printId, rows);
	}

	const status = new Map<string, BreakdownItem>();
	const material = new Map<string, BreakdownItem>();
	const printer = new Map<string, BreakdownItem>();
	const layerHeight = new Map<string, BreakdownItem>();
	const nozzle = new Map<string, BreakdownItem>();
	const supports = new Map<string, BreakdownItem>();
	const temperature = new Map<string, BreakdownItem>();
	const interrupted: InterruptedPrintStat[] = [];

	let totalFilamentG = 0;
	let totalRealTimeSec = 0;
	let totalEstimatedTimeSec = 0;

	for (const print of uniquePrints) {
		const printUsages = usageByPrintId.get(print.id) ?? [];
		const printFilamentG = rounded(
			printUsages.reduce((sum, usage) => sum + usage.usedWeightG + usage.wasteWeightG, 0),
		);
		const durationSec = durationForPrint(print);
		const estimatedSec = print.estimatedPrintTimeSec;
		const setting = settingsByPrintId.get(print.id);

		totalFilamentG = rounded(totalFilamentG + printFilamentG);
		if (durationSec !== undefined) totalRealTimeSec += durationSec;
		if (estimatedSec !== undefined) totalEstimatedTimeSec += estimatedSec;

		addBreakdown(status, print.status, STATUS_LABELS[print.status], printFilamentG);
		addBreakdown(printer, print.printerId ?? 'unknown', printerLabel(print, printersById), printFilamentG);
		addBreakdown(
			layerHeight,
			setting?.layerHeightMm?.toString() ?? 'unknown',
			settingLabel(setting?.layerHeightMm, 'mm', 'Hauteur inconnue'),
			printFilamentG,
		);
		addBreakdown(
			nozzle,
			setting?.nozzleDiameterMm?.toString() ?? 'unknown',
			settingLabel(setting?.nozzleDiameterMm, 'mm', 'Buse inconnue'),
			printFilamentG,
		);
		addBreakdown(
			supports,
			setting?.supportMaterial === undefined ? 'unknown' : String(setting.supportMaterial),
			supportLabel(setting?.supportMaterial),
			printFilamentG,
		);
		addBreakdown(temperature, temperatureLabel(setting), temperatureLabel(setting), printFilamentG);

		for (const usage of printUsages) {
			const spool = spoolById.get(usage.spoolId);
			const label = materialLabel(spool);
			addBreakdown(material, label, label, usage.usedWeightG + usage.wasteWeightG);
		}

		if (print.status !== 'completed') {
			interrupted.push({
				id: print.id,
				name: print.name,
				status: print.status,
				printedAt: print.printedAt,
				durationSec,
				estimatedPrintTimeSec: estimatedSec,
				fileName: fileLabel(filesByPrintId.get(print.id)),
				connectPrintHeightRaw: setting?.connectPrintHeightRaw,
				filamentG: printFilamentG,
			});
		}
	}

	return {
		totalPrints: uniquePrints.length,
		completedPrints: uniquePrints.filter((print) => print.status === 'completed').length,
		interruptedPrints: interrupted.length,
		totalFilamentG,
		totalRealTimeSec,
		totalEstimatedTimeSec,
		estimateDeltaSec: totalRealTimeSec - totalEstimatedTimeSec,
		statusBreakdown: sortedBreakdown(status),
		materialBreakdown: sortedBreakdown(material),
		printerBreakdown: sortedBreakdown(printer),
		layerHeightBreakdown: sortedBreakdown(layerHeight),
		nozzleBreakdown: sortedBreakdown(nozzle),
		supportBreakdown: sortedBreakdown(supports),
		temperatureBreakdown: sortedBreakdown(temperature),
		interrupted: interrupted.sort((a, b) => Date.parse(b.printedAt) - Date.parse(a.printedAt)),
	};
}
