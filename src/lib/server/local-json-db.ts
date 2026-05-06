import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import {
	LocalJsonDbSnapshotSchema,
	emptyLocalJsonDbSnapshot,
	type LocalJsonDbSnapshot,
} from '$lib/storage/local-json-snapshot';

export function localJsonDbPath(filePath = process.env.FILAMENT_TRACKER_DB_FILE): string {
	return resolve(process.cwd(), filePath || 'data/filament-tracker.json');
}

export async function readLocalJsonDb(filePath?: string): Promise<LocalJsonDbSnapshot> {
	const path = localJsonDbPath(filePath);
	try {
		const content = await readFile(path, 'utf8');
		return LocalJsonDbSnapshotSchema.parse(JSON.parse(content));
	} catch (error) {
		if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
			return emptyLocalJsonDbSnapshot();
		}
		throw error;
	}
}

export async function writeLocalJsonDb(
	snapshot: LocalJsonDbSnapshot,
	filePath?: string,
): Promise<LocalJsonDbSnapshot> {
	const parsed = LocalJsonDbSnapshotSchema.parse(snapshot);
	const path = localJsonDbPath(filePath);
	const temporaryPath = `${path}.${process.pid}.${Date.now()}.tmp`;

	await mkdir(dirname(path), { recursive: true });
	await writeFile(temporaryPath, `${JSON.stringify(parsed, null, 2)}\n`, 'utf8');
	await rename(temporaryPath, path);

	return parsed;
}

export async function resetLocalJsonDb(filePath?: string): Promise<LocalJsonDbSnapshot> {
	return writeLocalJsonDb(emptyLocalJsonDbSnapshot(), filePath);
}
