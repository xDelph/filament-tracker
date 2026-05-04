import { redirect } from '@sveltejs/kit';

/** Le tableau de bord est l’écran principal de consultation et d’action rapide. */
export function load(): never {
	throw redirect(307, '/dashboard');
}
