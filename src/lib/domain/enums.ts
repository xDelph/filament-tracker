import { z } from 'zod';

/** Standard catalogue materials; bespoke blends use the custom discriminator on `Spool`. */
export const FilamentStandardMaterialSchema = z.enum([
	'PLA',
	'PETG',
	'ABS',
	'TPU',
	'ASA',
	'Nylon',
	'PC',
]);

export type FilamentStandardMaterial = z.infer<typeof FilamentStandardMaterialSchema>;

export const SpoolStatusSchema = z.enum(['active', 'low', 'empty', 'archived']);

export type SpoolStatus = z.infer<typeof SpoolStatusSchema>;

export const PrintStatusSchema = z.enum(['completed', 'failed', 'cancelled']);

export type PrintStatus = z.infer<typeof PrintStatusSchema>;
