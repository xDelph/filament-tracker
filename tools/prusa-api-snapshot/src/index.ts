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

async function main(): Promise<void> {
	const prusaLinkEnabled = envBool('PRUSALINK_ENABLED', false);
	const connectEnabled = envBool('PRUSA_CONNECT_ENABLED', false);

	const outputPath = resolve(process.env.OUTPUT_PATH ?? join(__dirname, '../out/prusa-snapshot.json'));

	const snapshot: Record<string, unknown> = {
		generatedAt: new Date().toISOString(),
		prusalink: null as unknown,
		prusaConnect: null as unknown,
	};

	if (prusaLinkEnabled) {
		const baseUrl = stripTrailingSlash(process.env.PRUSALINK_BASE_URL ?? '');
		const user = process.env.PRUSALINK_USER ?? 'maker';
		const password = process.env.PRUSALINK_PASSWORD ?? '';
		const useBasic = envBool('PRUSALINK_BASIC_AUTH', false);
		const maxPrintFiles = envInt('PRUSALINK_MAX_PRINT_FILE_SAMPLES', 80);

		if (!baseUrl || !password) {
			console.error('PRUSALINK_ENABLED=true requires PRUSALINK_BASE_URL and PRUSALINK_PASSWORD.');
			process.exit(1);
		}

		const client = createDigestClient(user, password, useBasic);

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
				'Les mots de passe ne sont jamais inclus dans ce fichier.',
				'Les exemples PRINT_FILE sont limités par PRUSALINK_MAX_PRINT_FILE_SAMPLES.',
			],
		};
	} else {
		snapshot.prusalink = { enabled: false };
	}

	if (connectEnabled) {
		const baseUrl = stripTrailingSlash(
			process.env.PRUSA_CONNECT_BASE_URL ?? 'https://connect-mobile-api.prusa3d.com',
		);
		const token = process.env.PRUSA_CONNECT_BEARER_TOKEN ?? '';
		const itemsPerPage = envInt('PRUSA_CONNECT_ITEMS_PER_PAGE', 30);
		const maxPages = envInt('PRUSA_CONNECT_MAX_PAGES', 100);

		if (!token) {
			console.error('PRUSA_CONNECT_ENABLED=true requires PRUSA_CONNECT_BEARER_TOKEN.');
			process.exit(1);
		}

		const printersPaged = await fetchConnectPaged(
			baseUrl,
			token,
			(page) =>
				`/api/v1/printers?page=${page}&itemsPerPage=${itemsPerPage}&pagination=true`,
			itemsPerPage,
			maxPages,
		);

		const jobsPast = await fetchConnectPaged(
			baseUrl,
			token,
			(page) =>
				`/api/v1/jobs?page=${page}&itemsPerPage=${itemsPerPage}&pagination=true&printerJobStatus=past`,
			itemsPerPage,
			maxPages,
		);

		const jobsCurrent = await fetchConnectPaged(
			baseUrl,
			token,
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

			const det = await connectFetchJson(baseUrl, token, `/api/v1/printers/${uuid}/detail`);
			printerExtras.push({ printerUuid: uuid, detail: det });

			const stor = await connectFetchJson(
				baseUrl,
				token,
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
				'Le jeton Bearer n’est jamais inclus dans ce fichier.',
				'La pagination s’arrête à PRUSA_CONNECT_MAX_PAGES pages par collection.',
			],
		};
	} else {
		snapshot.prusaConnect = { enabled: false };
	}

	mkdirSync(dirname(outputPath), { recursive: true });
	writeFileSync(outputPath, JSON.stringify(snapshot, null, 2), 'utf8');
	console.log(`Snapshot écrit : ${outputPath}`);
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
