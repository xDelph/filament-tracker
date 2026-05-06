import { db, type FilamentTrackerDatabase } from './db';
import {
	LocalJsonDbSnapshotSchema,
	collectLocalJsonDbSnapshot,
	replaceIndexedDbFromLocalJsonSnapshot,
	type LocalJsonDbSnapshot,
} from './local-json-snapshot';

const LOCAL_JSON_DB_ENDPOINT = '/api/local-db';

let hydrationPromise: Promise<void> | null = null;

function shouldSync(database: FilamentTrackerDatabase): boolean {
	return database === db && typeof fetch === 'function';
}

async function requestLocalJsonDbSnapshot(): Promise<unknown> {
	const response = await fetch(LOCAL_JSON_DB_ENDPOINT, {
		headers: { accept: 'application/json' },
	});
	if (!response.ok) {
		throw new Error('Impossible de lire la base JSON locale.');
	}
	return response.json();
}

function snapshotHasData(snapshot: LocalJsonDbSnapshot): boolean {
	return (
		snapshot.tables.spools.length > 0 ||
		snapshot.tables.prints.length > 0 ||
		snapshot.tables.printFilamentUsages.length > 0 ||
		snapshot.tables.spoolAdjustments.length > 0
	);
}

async function indexedDbHasData(database: FilamentTrackerDatabase): Promise<boolean> {
	const [spools, prints, printFilamentUsages, spoolAdjustments] = await Promise.all([
		database.spools.count(),
		database.prints.count(),
		database.printFilamentUsages.count(),
		database.spoolAdjustments.count(),
	]);
	return spools + prints + printFilamentUsages + spoolAdjustments > 0;
}

async function writeSnapshotToLocalJson(snapshot: LocalJsonDbSnapshot): Promise<void> {
	const response = await fetch(LOCAL_JSON_DB_ENDPOINT, {
		method: 'PUT',
		headers: {
			'content-type': 'application/json',
			accept: 'application/json',
		},
		body: JSON.stringify(snapshot),
	});
	if (!response.ok) {
		throw new Error('Impossible de sauvegarder la base JSON locale.');
	}
}

export async function hydrateIndexedDbFromLocalJson(
	database: FilamentTrackerDatabase = db,
): Promise<void> {
	if (!shouldSync(database)) return;
	const snapshot = LocalJsonDbSnapshotSchema.parse(await requestLocalJsonDbSnapshot());
	if (!snapshotHasData(snapshot) && (await indexedDbHasData(database))) {
		await writeSnapshotToLocalJson(await collectLocalJsonDbSnapshot(database));
		return;
	}
	await replaceIndexedDbFromLocalJsonSnapshot(snapshot, database);
}

export function ensureLocalJsonDbHydrated(
	database: FilamentTrackerDatabase = db,
): Promise<void> {
	if (!shouldSync(database)) return Promise.resolve();
	hydrationPromise ??= hydrateIndexedDbFromLocalJson(database).catch((error) => {
		hydrationPromise = null;
		throw error;
	});
	return hydrationPromise;
}

export async function persistIndexedDbToLocalJson(
	database: FilamentTrackerDatabase = db,
): Promise<void> {
	if (!shouldSync(database)) return;
	if (hydrationPromise) {
		await hydrationPromise;
	}
	await writeSnapshotToLocalJson(await collectLocalJsonDbSnapshot(database));
}
