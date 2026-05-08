/**
 * CLI: turn a Prusa Connect rich jobs export JSON into a LocalJsonDbSnapshot JSON file.
 *
 * Usage (from repo root):
 *   bun run import:prusa-jobs -- path/to/prusa_connect_jobs.json path/to/out.snapshot.json
 * Env: FILAMENT_IMPORT_CURRENCY (default EUR) for slicer costs without currency field.
 */

import { readFileSync, writeFileSync } from 'node:fs';

import { buildLocalJsonSnapshotFromPrusaConnectJobsExport } from '../src/lib/storage/prusa-connect-jobs-import.ts';

const input = process.argv[2];
const output = process.argv[3];

if (!input || !output) {
	console.error('Usage: bun run import:prusa-jobs -- <jobs-export.json> <out.snapshot.json>');
	process.exit(1);
}

const raw: unknown = JSON.parse(readFileSync(input, 'utf8'));
const snapshot = buildLocalJsonSnapshotFromPrusaConnectJobsExport(raw);
writeFileSync(output, JSON.stringify(snapshot, null, 2), 'utf8');

console.log(`OK: ${output} (${snapshot.tables.prints.length} prints, ${snapshot.tables.spools.length} spools)`);
