import type { Print, PrintFilamentUsage, Spool } from '$lib/domain';
import { isLowStock } from '$lib/domain';
import { LOW_STOCK_THRESHOLDS } from '$lib/storage/prints';

type Thresholds = typeof LOW_STOCK_THRESHOLDS;

/** Clé stable pour filtrer par matériau (catalogue ou libellé custom). */
export function spoolMaterialFilterKey(spool: Spool): string {
	return spool.material.kind === 'catalog'
		? `catalog:${spool.material.code}`
		: `custom:${spool.material.label}`;
}

/** Libellé UI pour une entrée de filtre matériau. */
export function formatMaterialFilterLabel(spool: Spool): string {
	return spool.material.kind === 'catalog'
		? spool.material.code
		: spool.material.label;
}

export function buildLastUsedMsBySpoolId(
	usages: PrintFilamentUsage[],
	prints: Print[],
): Map<string, number> {
	const printedAtMs = new Map<string, number>();
	for (const p of prints) {
		printedAtMs.set(p.id, Date.parse(p.printedAt));
	}

	const bySpool = new Map<string, number>();
	for (const u of usages) {
		const ms = printedAtMs.get(u.printId);
		if (ms === undefined || Number.isNaN(ms)) continue;
		const prev = bySpool.get(u.spoolId);
		if (prev === undefined || ms > prev) {
			bySpool.set(u.spoolId, ms);
		}
	}
	return bySpool;
}

export function isSpoolLowStockAlert(spool: Spool, thresholds: Thresholds): boolean {
	return (
		spool.status === 'low' ||
		isLowStock(spool.remainingWeightG, spool.initialWeightG, thresholds)
	);
}

export type DashboardSpoolSort =
	| 'name'
	| 'remainingAsc'
	| 'remainingDesc'
	| 'lastUsedDesc'
	| 'lastUsedAsc';

export type DashboardSpoolFilters = {
	materialKey: string;
	status: '' | 'active' | 'low';
	lowStock: 'all' | 'low_only' | 'ok_only';
};

export function filterDashboardSpools(spools: Spool[], filters: DashboardSpoolFilters): Spool[] {
	return spools.filter((s) => {
		if (filters.materialKey && spoolMaterialFilterKey(s) !== filters.materialKey) {
			return false;
		}
		if (filters.status && s.status !== filters.status) {
			return false;
		}
		if (filters.lowStock === 'all') {
			return true;
		}
		const low = isSpoolLowStockAlert(s, LOW_STOCK_THRESHOLDS);
		if (filters.lowStock === 'low_only') return low;
		return !low;
	});
}

export function sortDashboardSpools(
	spools: Spool[],
	sort: DashboardSpoolSort,
	lastUsedMsBySpoolId: Map<string, number>,
): Spool[] {
	const copy = [...spools];

	const cmpLastUsed = (a: Spool, b: Spool, desc: boolean): number => {
		const ta = lastUsedMsBySpoolId.get(a.id);
		const tb = lastUsedMsBySpoolId.get(b.id);
		const aNever = ta === undefined;
		const bNever = tb === undefined;

		if (aNever && bNever) {
			return a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' });
		}

		if (aNever !== bNever) {
			if (desc) {
				return aNever ? 1 : -1;
			}
			return aNever ? -1 : 1;
		}

		const primary = desc ? tb! - ta! : ta! - tb!;
		if (primary !== 0) return primary;
		return a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' });
	};

	copy.sort((a, b) => {
		switch (sort) {
			case 'remainingAsc':
				return (
					a.remainingWeightG - b.remainingWeightG ||
					a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' })
				);
			case 'remainingDesc':
				return (
					b.remainingWeightG - a.remainingWeightG ||
					a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' })
				);
			case 'lastUsedDesc':
				return cmpLastUsed(a, b, true);
			case 'lastUsedAsc':
				return cmpLastUsed(a, b, false);
			case 'name':
			default:
				return a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' });
		}
	});

	return copy;
}

export function formatLastUsedRelative(ms: number | undefined, nowMs: number): string | undefined {
	if (ms === undefined || ms < 0 || Number.isNaN(ms)) return undefined;
	const diffDays = Math.floor((nowMs - ms) / 86_400_000);
	if (diffDays <= 0) return "Aujourd'hui";
	if (diffDays === 1) return 'Hier';
	if (diffDays < 7) return `Il y a ${diffDays} jours`;
	return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium' }).format(new Date(ms));
}
