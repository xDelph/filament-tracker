/**
 * Prusa Connect mobile API (Bearer : clé API ou JWT dans Authorization).
 */

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

export async function connectFetchJson(
	baseUrl: string,
	bearerSecret: string,
	pathAndQuery: string,
): Promise<ApiResult<unknown>> {
	const root = baseUrl.replace(/\/$/, '');
	const url = pathAndQuery.startsWith('http')
		? pathAndQuery
		: `${root}${pathAndQuery.startsWith('/') ? '' : '/'}${pathAndQuery}`;
	try {
		const res = await fetch(url, {
			headers: {
				Accept: 'application/json',
				Authorization: `Bearer ${bearerSecret}`,
			},
		});
		const text = await res.text();
		if (!res.ok) {
			return { ok: false, status: res.status, error: text.slice(0, 2000) };
		}
		return { ok: true, data: safeJsonParse(text) };
	} catch (e) {
		const msg = e instanceof Error ? e.message : String(e);
		return { ok: false, status: 0, error: msg };
	}
}

function isJobArray(data: unknown): data is unknown[] {
	return Array.isArray(data);
}

function hydraMember(data: unknown): unknown[] | null {
	if (data && typeof data === 'object' && 'hydra:member' in data) {
		const m = (data as Record<string, unknown>)['hydra:member'];
		return Array.isArray(m) ? m : null;
	}
	return null;
}

/** Fetches JSON array pages (plain or Hydra) until a page is empty or shorter than page size. */
export async function fetchConnectPaged(
	baseUrl: string,
	bearerSecret: string,
	buildPath: (page: number) => string,
	itemsPerPage: number,
	maxPages: number,
): Promise<{ pages: unknown[][]; errors: string[]; truncated: boolean }> {
	const pages: unknown[][] = [];
	const errors: string[] = [];
	let truncated = false;

	for (let page = 1; page <= maxPages; page++) {
		const res = await connectFetchJson(baseUrl, bearerSecret, buildPath(page));
		if (!res.ok) {
			errors.push(`page ${page}: ${res.error} (${res.status})`);
			break;
		}
		const raw = res.data;
		const hydra = hydraMember(raw);
		const arr = hydra ?? (isJobArray(raw) ? raw : null);
		if (!arr) {
			errors.push(`page ${page}: unexpected JSON shape`);
			break;
		}
		pages.push(arr);
		if (arr.length === 0) break;
		if (arr.length < itemsPerPage) break;
		if (page === maxPages && arr.length === itemsPerPage) {
			truncated = true;
		}
	}

	return { pages, errors, truncated };
}
