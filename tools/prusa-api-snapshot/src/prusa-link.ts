/**
 * PrusaLink (HTTP Digest) + recursive file listing (metadata samples).
 */

import DigestClient from 'digest-fetch';

export type ApiResult<T> =
	| { ok: true; data: T }
	| { ok: false; status: number; error: string };

function safeJsonParse(text: string): unknown {
	try {
		return JSON.parse(text);
	} catch {
		return { _parseError: true, raw: text.slice(0, 2000) };
	}
}

export async function prusaLinkFetchJson(
	client: DigestClient,
	url: string,
	init?: RequestInit,
): Promise<ApiResult<unknown>> {
	try {
		const res = await client.fetch(url, {
			...init,
			headers: {
				Accept: 'application/json',
				...Object.fromEntries(new Headers(init?.headers as HeadersInit).entries()),
			},
		});
		const text = await res.text();
		if (res.status === 204 || text.trim() === '') {
			return { ok: true, data: null };
		}
		if (!res.ok) {
			return { ok: false, status: res.status, error: text.slice(0, 2000) };
		}
		return { ok: true, data: safeJsonParse(text) };
	} catch (e) {
		const msg = e instanceof Error ? e.message : String(e);
		return { ok: false, status: 0, error: msg };
	}
}

export function createDigestClient(user: string, password: string, useBasic = false): DigestClient {
	return new DigestClient(user, password, { basic: useBasic });
}

type FileEntry = {
	type?: string;
	name?: string;
	children?: unknown[];
};

export async function walkPrusaLinkFiles(args: {
	client: DigestClient;
	baseUrl: string;
	storagePath: string;
	maxPrintFiles: number;
	onProgress?: (msg: string) => void;
}): Promise<{ tree: unknown[]; printFileSamples: unknown[]; truncated: boolean; errors: string[] }> {
	const { client, baseUrl, storagePath, maxPrintFiles } = args;
	const root = baseUrl.replace(/\/$/, '');
	const errors: string[] = [];
	const tree: unknown[] = [];
	const printFileSamples: unknown[] = [];
	let truncated = false;

	const filesBase = `${root}/api/v1/files${storagePath}`;

	async function fetchPath(relPath: string): Promise<ApiResult<unknown>> {
		const pathSeg = relPath.startsWith('/') ? relPath : `/${relPath}`;
		const url = `${filesBase}${pathSeg}`;
		args.onProgress?.(url);
		return prusaLinkFetchJson(client, url);
	}

	function childRelPath(parentRel: string, name: string): string {
		if (parentRel === '/') return `/${name}`;
		return `${parentRel}/${name}`;
	}

	async function visitFolder(rel: string, listing: ApiResult<unknown>): Promise<void> {
		if (!listing.ok) {
			errors.push(`GET ${rel}: ${listing.error} (${listing.status})`);
			return;
		}
		const data = listing.data as FileEntry;
		tree.push({ path: rel, listing: data });

		if (data.type !== 'FOLDER' || !Array.isArray(data.children)) {
			return;
		}
		for (const ch of data.children) {
			const c = ch as FileEntry;
			const name = c.name;
			if (!name) continue;
			const childPath = childRelPath(rel, name);

			if (c.type === 'FOLDER') {
				const sub = await fetchPath(childPath);
				await visitFolder(childPath, sub);
			} else if (c.type === 'PRINT_FILE') {
				if (printFileSamples.length >= maxPrintFiles) {
					truncated = true;
					continue;
				}
				const detail = await fetchPath(childPath);
				if (detail.ok) {
					printFileSamples.push({ path: childPath, detail: detail.data });
				} else {
					errors.push(`PRINT_FILE detail ${childPath}: ${detail.error} (${detail.status})`);
				}
			}
		}
	}

	const rootRes = await fetchPath('/');
	await visitFolder('/', rootRes);

	return { tree, printFileSamples, truncated, errors };
}
