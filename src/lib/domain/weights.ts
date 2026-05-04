import { z } from 'zod';

/**
 * Stored weights use grams as finite decimals (fractional grams supported).
 */

export function finiteNonNegativeGrams(message = 'Grammes invalides.') {
	return z.number({ invalid_type_error: message }).finite(message).gte(0, message);
}

export function finitePositiveGrams(message = 'Doit être strictement positif (grammes).') {
	return z.number({ invalid_type_error: message }).finite(message).gt(0, message);
}
