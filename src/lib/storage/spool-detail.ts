import type { Print, PrintFilamentUsage, Spool, SpoolAdjustment } from '$lib/domain';

import { db } from './db';
import { listAdjustmentsForSpool } from './spool-adjustments';
import { getSpool } from './spool-repository';
import { listPrintUsagesForSpool } from './prints';

export type SpoolUsageWithPrint = {
	usage: PrintFilamentUsage;
	print: Print | undefined;
};

export async function loadSpoolAuditData(spoolId: string): Promise<{
	spool: Spool | undefined;
	usages: SpoolUsageWithPrint[];
	adjustments: SpoolAdjustment[];
}> {
	const spool = await getSpool(spoolId);
	if (!spool) {
		return { spool: undefined, usages: [], adjustments: [] };
	}

	const [usageRows, adjustments] = await Promise.all([
		listPrintUsagesForSpool(spoolId),
		listAdjustmentsForSpool(spoolId),
	]);

	const printIds = [...new Set(usageRows.map((u) => u.printId))];
	const prints = await db.prints.bulkGet(printIds);
	const printById = new Map(prints.filter(Boolean).map((p) => [p!.id, p!]));

	return {
		spool,
		usages: usageRows.map((usage) => ({
			usage,
			print: printById.get(usage.printId),
		})),
		adjustments,
	};
}
