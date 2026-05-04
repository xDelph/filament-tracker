import type { Print, PrintFilamentUsage, Spool, SpoolAdjustment } from '$lib/domain';

import { db, type FilamentTrackerDatabase } from './db';
import { listAdjustmentsForSpool } from './spool-adjustments';
import { getSpool } from './spool-repository';
import { listPrintUsagesForSpool } from './prints';

export type SpoolUsageWithPrint = {
	usage: PrintFilamentUsage;
	print: Print | undefined;
};

export async function loadSpoolAuditData(
	spoolId: string,
	database: FilamentTrackerDatabase = db,
): Promise<{
	spool: Spool | undefined;
	usages: SpoolUsageWithPrint[];
	adjustments: SpoolAdjustment[];
}> {
	const spool = await getSpool(spoolId, database);
	if (!spool) {
		return { spool: undefined, usages: [], adjustments: [] };
	}

	const [usageRows, adjustments] = await Promise.all([
		listPrintUsagesForSpool(spoolId, database),
		listAdjustmentsForSpool(spoolId, database),
	]);

	const printIds = [...new Set(usageRows.map((u) => u.printId))];
	const prints = await database.prints.bulkGet(printIds);
	const printById = new Map(prints.filter(Boolean).map((p) => [p!.id, p!]));

	const usages: SpoolUsageWithPrint[] = usageRows.map((usage) => ({
		usage,
		print: printById.get(usage.printId),
	}));

	usages.sort((a, b) => {
		const ta = a.print?.printedAt ?? a.usage.createdAt;
		const tb = b.print?.printedAt ?? b.usage.createdAt;
		return tb.localeCompare(ta);
	});

	return {
		spool,
		usages,
		adjustments,
	};
}
