import { error, json, type RequestHandler } from '@sveltejs/kit';
import { ZodError } from 'zod';

import { readLocalJsonDb, resetLocalJsonDb, writeLocalJsonDb } from '$lib/server/local-json-db';

export const prerender = false;

function badRequestFrom(errorValue: unknown): never {
	if (errorValue instanceof SyntaxError) {
		error(400, 'JSON invalide.');
	}
	if (errorValue instanceof ZodError) {
		error(400, 'Format de base JSON Filament Tracker invalide.');
	}
	throw errorValue;
}

export const GET: RequestHandler = async () => {
	return json(await readLocalJsonDb());
};

export const PUT: RequestHandler = async ({ request }) => {
	try {
		return json(await writeLocalJsonDb(await request.json()));
	} catch (errorValue) {
		badRequestFrom(errorValue);
	}
};

export const DELETE: RequestHandler = async () => {
	return json(await resetLocalJsonDb());
};
