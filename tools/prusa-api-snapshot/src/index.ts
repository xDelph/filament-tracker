/**
 * Load `.env` from this package directory, then snapshot PrusaLink + Prusa Connect into one JSON file.
 *
 * Usage: `bun run snapshot` (see README).
 */

import { config } from 'dotenv';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
	createDigestClient,
	prusaLinkFetchJson,
	walkPrusaLinkFiles,
} from './prusa-link';
import { connectFetchJson, fetchConnectPaged } from './prusa-connect';

const __dirname = dirname(fileURLToPath(import.meta.url));

config({ path: join(__dirname, '../.env') });

function envBool(key: string, defaultValue: boolean): boolean {
	const v = process.env[key];
	if (v === undefined || v === '') return defaultValue;
	return /^(1|true|yes|on)$/i.test(v.trim());
}

function envInt(key: string, defaultValue: number): number {
	const v = process.env[key];
	if (v === undefined || v === '') return defaultValue;
	const n = Number.parseInt(v, 10);
	return Number.isFinite(n) ? n : defaultValue;
}

function stripTrailingSlash(s: string): string {
	return s.replace(/\/$/, '');
}

/** First non-empty trimmed value among env keys (order = preference). */
function envFirst(...keys: string[]): string {
	for (const k of keys) {
		const v = process.env[k];
		if (v !== undefined && v.trim() !== '') return v.trim();
	}
	return '';
}

type SnapshotScope = 'both' | 'prusalink-only' | 'prusaconnect-only';

function parseSnapshotScope(argv: string[]): SnapshotScope {
	const link = argv.includes('--prusalink-only') || argv.includes('--link-only');
	const connect = argv.includes('--prusaconnect-only') || argv.includes('--connect-only');
	if (link && connect) {
		console.error('Utilise soit --prusalink-only soit --prusaconnect-only, pas les deux.');
		process.exit(1);
	}
	if (link) return 'prusalink-only';
	if (connect) return 'prusaconnect-only';
	return 'both';
}

async function main(): Promise<void> {
	const scope = parseSnapshotScope(process.argv.slice(2));

	const envLink = envBool('PRUSALINK_ENABLED', false);
	const envConnect = envBool('PRUSA_CONNECT_ENABLED', false);

	const prusaLinkEnabled = scope === 'prusaconnect-only' ? false : envLink;
	const connectEnabled = scope === 'prusalink-only' ? false : envConnect;

	if (scope === 'prusaconnect-only') {
		console.info('Snapshot : mode Prusa Connect uniquement — aucune requête vers l’imprimante locale.');
	} else if (scope === 'prusalink-only') {
		console.info('Snapshot : mode PrusaLink uniquement — aucune requête vers Prusa Connect.');
	}

	const outputPath = resolve(process.env.OUTPUT_PATH ?? join(__dirname, '../out/prusa-snapshot.json'));

	const snapshot: Record<string, unknown> = {
		generatedAt: new Date().toISOString(),
		snapshotScope: scope,
		prusalink: null as unknown,
		prusaConnect: null as unknown,
	};

	if (prusaLinkEnabled) {
		const baseUrl = stripTrailingSlash(process.env.PRUSALINK_BASE_URL ?? '');
		const user = process.env.PRUSALINK_USER ?? 'maker';
		const apiKey = envFirst('PRUSALINK_API_KEY', 'PRUSALINK_PASSWORD');
		const useBasic = envBool('PRUSALINK_BASIC_AUTH', false);
		const maxPrintFiles = envInt('PRUSALINK_MAX_PRINT_FILE_SAMPLES', 80);

		if (!baseUrl || !apiKey) {
			console.error(
				'PRUSALINK_ENABLED=true requires PRUSALINK_BASE_URL and PRUSALINK_API_KEY (or legacy PRUSALINK_PASSWORD).',
			);
			process.exit(1);
		}

		const client = createDigestClient(user, apiKey, useBasic);

		const version = await prusaLinkFetchJson(client, `${baseUrl}/api/version`);
		const info = await prusaLinkFetchJson(client, `${baseUrl}/api/v1/info`);
		const status = await prusaLinkFetchJson(client, `${baseUrl}/api/v1/status`);
		const job = await prusaLinkFetchJson(client, `${baseUrl}/api/v1/job`);
		const storageList = await prusaLinkFetchJson(client, `${baseUrl}/api/v1/storage`);

		const storages: unknown[] = [];
		const fileWalks: unknown[] = [];

		if (storageList.ok && storageList.data && typeof storageList.data === 'object') {
			const sl = (storageList.data as Record<string, unknown>).storage_list;
			if (Array.isArray(sl)) {
				for (const st of sl) {
					storages.push(st);
					const stObj = st as Record<string, unknown>;
					const path = typeof stObj.path === 'string' ? stObj.path : null;
					const type = typeof stObj.type === 'string' ? stObj.type : '';
					if (!path) continue;
					const walked = await walkPrusaLinkFiles({
						client,
						baseUrl,
						storagePath: path,
						maxPrintFiles,
					});
					fileWalks.push({
						storagePath: path,
						storageType: type,
						...walked,
					});
				}
			}
		}

		snapshot.prusalink = {
			enabled: true,
			baseUrl,
			user,
			endpoints: {
				version,
				info,
				status,
				job,
				storage: storageList,
			},
			storagesDiscovered: storages,
			fileWalks,
			notes: [
				'Les secrets (API key PrusaLink, etc.) ne sont jamais inclus dans ce fichier.',
				'Les exemples PRINT_FILE sont limités par PRUSALINK_MAX_PRINT_FILE_SAMPLES.',
			],
		};
	} else {
		snapshot.prusalink =
			scope === 'prusaconnect-only'
				? {
						enabled: false,
						skippedByScope:
							'Connect uniquement : aucune requête PrusaLink (imprimante locale non contactée par ce script).',
					}
				: { enabled: false };
	}

	if (connectEnabled) {
		const baseUrl = stripTrailingSlash(
			process.env.PRUSA_CONNECT_BASE_URL ?? 'https://connect-mobile-api.prusa3d.com',
		);
		const connectApiKey = envFirst('PRUSA_CONNECT_API_KEY', 'PRUSA_CONNECT_BEARER_TOKEN');
		const itemsPerPage = envInt('PRUSA_CONNECT_ITEMS_PER_PAGE', 30);
		const maxPages = envInt('PRUSA_CONNECT_MAX_PAGES', 100);

		if (!connectApiKey) {
			console.error(
				'PRUSA_CONNECT_ENABLED=true requires PRUSA_CONNECT_API_KEY (or legacy PRUSA_CONNECT_BEARER_TOKEN).',
			);
			process.exit(1);
		}

		const printersPaged = await fetchConnectPaged(
			baseUrl,
			connectApiKey,
			(page) =>
				`/api/v1/printers?page=${page}&itemsPerPage=${itemsPerPage}&pagination=true`,
			itemsPerPage,
			maxPages,
		);

		const jobsPast = await fetchConnectPaged(
			baseUrl,
			connectApiKey,
			(page) =>
				`/api/v1/jobs?page=${page}&itemsPerPage=${itemsPerPage}&pagination=true&printerJobStatus=past`,
			itemsPerPage,
			maxPages,
		);

		const jobsCurrent = await fetchConnectPaged(
			baseUrl,
			connectApiKey,
			(page) =>
				`/api/v1/jobs?page=${page}&itemsPerPage=${itemsPerPage}&pagination=true&printerJobStatus=current`,
			itemsPerPage,
			maxPages,
		);

		const printerExtras: unknown[] = [];
		const storageExtras: unknown[] = [];

		const flatPrinters = printersPaged.pages.flat();
		const seenUuid = new Set<string>();
		for (const p of flatPrinters) {
			if (!p || typeof p !== 'object') continue;
			const rec = p as Record<string, unknown>;
			const uuid = rec.uuid ?? rec.id;
			if (typeof uuid !== 'string' || seenUuid.has(uuid)) continue;
			seenUuid.add(uuid);

			const det = await connectFetchJson(baseUrl, connectApiKey, `/api/v1/printers/${uuid}/detail`);
			printerExtras.push({ printerUuid: uuid, detail: det });

			const stor = await connectFetchJson(
				baseUrl,
				connectApiKey,
				`/api/v1/storage/printer/${uuid}?page=1&itemsPerPage=20`,
			);
			storageExtras.push({ printerUuid: uuid, storagePage1: stor });
		}

		snapshot.prusaConnect = {
			enabled: true,
			baseUrl,
			printers: printersPaged,
			jobsPast,
			jobsCurrent,
			printerDetails: printerExtras,
			printerStorageSamples: storageExtras,
			notes: [
				'La clé API Connect / jeton Bearer n’est jamais inclus dans ce fichier.',
				'La pagination s’arrête à PRUSA_CONNECT_MAX_PAGES pages par collection.',
			],
		};
	} else {
		snapshot.prusaConnect =
			scope === 'prusalink-only'
				? {
						enabled: false,
						skippedByScope: 'PrusaLink uniquement : aucune requête vers Prusa Connect.',
					}
				: { enabled: false };
	}

	mkdirSync(dirname(outputPath), { recursive: true });
	writeFileSync(outputPath, JSON.stringify(snapshot, null, 2), 'utf8');
	console.log(`Snapshot écrit : ${outputPath}`);
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
