import { type Spool, materialCostForGramsAtSpoolRate } from '$lib/domain';
import { fixtureSpoolFlex, fixtureSpoolPlaGrey } from '$lib/fixtures/domain-fixtures';

import { db, type FilamentTrackerDatabase } from './db';

export async function seedFixtureSpools(database: FilamentTrackerDatabase = db): Promise<void> {
	const count = await database.spools.count();

	if (count > 0) {
		return;
	}

	await database.spools.bulkPut([fixtureSpoolPlaGrey, fixtureSpoolFlex]);
}

export async function listSpools(database: FilamentTrackerDatabase = db): Promise<Spool[]> {
	return database.spools.orderBy('updatedAt').reverse().toArray();
}

export async function listPrintableSpools(database: FilamentTrackerDatabase = db): Promise<Spool[]> {
	const spools = await listSpools(database);

	return spools.filter((spool) => spool.status === 'active' || spool.status === 'low');
}

export function formatSpoolMaterial(spool: Pick<Spool, 'material'>): string {
	return spool.material.kind === 'catalog' ? spool.material.code : spool.material.label;
}

export function formatMoney(minorUnits: number, currency: string): string {
	return new Intl.NumberFormat('fr-FR', {
		style: 'currency',
		currency,
	}).format(minorUnits / 100);
}

export function remainingValueLabel(spool: Spool): string {
	const value = materialCostForGramsAtSpoolRate(spool, spool.remainingWeightG);

	return formatMoney(value.minorUnits, value.currency);
}
