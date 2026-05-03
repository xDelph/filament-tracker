import { z } from 'zod';

import {
	FilamentStandardMaterialSchema,
	SpoolStatusSchema,
	type FilamentStandardMaterial,
} from './enums';
import { MoneyMinorSchema } from './money';
import { finiteNonNegativeGrams, finitePositiveGrams } from './weights';

/**
 * Describes how `material` is interpreted (catalog vs free-text custom label).
 */
export const SpoolMaterialSchema = z.discriminatedUnion('kind', [
	z.object({
		kind: z.literal('catalog'),
		code: FilamentStandardMaterialSchema,
	}),
	z.object({
		kind: z.literal('custom'),
		/** Human-readable filament type when not in the built-in list. */
		label: z
			.string({ required_error: 'Libellé matériau obligatoire.' })
			.min(1)
			.max(128),
	}),
]);

export type SpoolMaterial =
	| { kind: 'catalog'; code: FilamentStandardMaterial }
	| { kind: 'custom'; label: string };

export const FILAMENT_DIAMETERS_MM = [1.75, 2.85] as const;

/** Millimetres; MVP supports the two dominant consumer filament diameters only. */
export const FilamentDiameterSchema = z.union([z.literal(1.75), z.literal(2.85)]);

const BaseSpoolShape = {
	id: z.string().uuid('Identifiant bobine doit être un UUID.'),
	name: z
		.string({ required_error: 'Nom obligatoire.' })
		.min(1, 'Nom obligatoire.')
		.max(200),
	material: SpoolMaterialSchema,
	brand: z.string().min(1).max(128).optional(),
	colorName: z
		.string({ required_error: 'Couleur (libellé) obligatoire.' })
		.min(1)
		.max(128),
	colorHex: z
		.string()
		.regex(/^#[0-9A-Fa-f]{6}$/, 'Couleur hex attendue (#RRVVBB).')
		.optional(),
	initialWeightG: finitePositiveGrams(),
	remainingWeightG: finiteNonNegativeGrams(),
	purchasePrice: MoneyMinorSchema,
	purchaseDate: z.string().datetime({ offset: true }).optional(),
	supplier: z.string().min(1).max(200).optional(),
	diameterMm: FilamentDiameterSchema,
	densityGCm3: z.number().finite().positive().optional(),
	status: SpoolStatusSchema,
	notes: z.string().max(5000).optional(),
	createdAt: z.string().datetime({ offset: true }),
	updatedAt: z.string().datetime({ offset: true }),
};

export const SpoolSchema = z.object(BaseSpoolShape).superRefine((data, ctx) => {
	if (data.remainingWeightG > data.initialWeightG) {
		ctx.addIssue({
			code: z.ZodIssueCode.custom,
			path: ['remainingWeightG'],
			message: 'Reste ne peut pas dépasser le poids initial.',
		});
	}
});

export type Spool = z.infer<typeof SpoolSchema>;

/**
 * Minimal fields required when opening a bobine dans l'inventaire.
 * Persisted layer assigne `remainingWeightG = initialWeightG` après validation.
 */
export const SpoolCreateInputSchema = z.object({
	name: BaseSpoolShape.name,
	material: BaseSpoolShape.material,
	brand: BaseSpoolShape.brand,
	colorName: BaseSpoolShape.colorName,
	colorHex: BaseSpoolShape.colorHex,
	initialWeightG: BaseSpoolShape.initialWeightG,
	purchasePrice: BaseSpoolShape.purchasePrice,
	purchaseDate: BaseSpoolShape.purchaseDate,
	supplier: BaseSpoolShape.supplier,
	diameterMm: BaseSpoolShape.diameterMm.default(1.75),
	densityGCm3: BaseSpoolShape.densityGCm3,
	status: SpoolStatusSchema.default('active'),
	notes: BaseSpoolShape.notes,
});

export type SpoolCreateInput = z.infer<typeof SpoolCreateInputSchema>;

/** Champs métier éditables; identifiants/timestamps gérés côté persistance. */
export const SpoolUpdateInputSchema = z.object({
	name: BaseSpoolShape.name.optional(),
	material: BaseSpoolShape.material.optional(),
	brand: z.union([z.string().min(1).max(128), z.literal('')]).optional(),
	colorName: BaseSpoolShape.colorName.optional(),
	colorHex: z.union([BaseSpoolShape.colorHex, z.literal('')]).optional(),
	initialWeightG: finitePositiveGrams().optional(),
	purchasePrice: MoneyMinorSchema.optional(),
	purchaseDate: z.union([BaseSpoolShape.purchaseDate, z.literal('')]).optional(),
	supplier: z.union([z.string().min(1).max(200), z.literal('')]).optional(),
	diameterMm: FilamentDiameterSchema.optional(),
	densityGCm3: BaseSpoolShape.densityGCm3.optional(),
	status: SpoolStatusSchema.optional(),
	notes: z.union([z.string().max(5000), z.literal('')]).optional(),
});

export type SpoolUpdateInput = z.infer<typeof SpoolUpdateInputSchema>;
