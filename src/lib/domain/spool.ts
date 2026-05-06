import { z } from 'zod';

import {
	FilamentStandardMaterialSchema,
	SpoolStatusSchema,
	type FilamentStandardMaterial,
} from './enums';
import { optionalClearablePurchaseDate, PurchaseDateInputSchema } from './dates';
import { MoneyMinorPurchaseSchema } from './money';
import { finiteNonNegativeGrams, finitePositiveGrams } from './weights';

/** Couleurs filament courantes (libellés et teintes suggestion pour l'aperçu). */
export const FILAMENT_PALETTE = [
	{ name: 'Blanc', hex: '#f8fafc' as const },
	{ name: 'Noir', hex: '#111827' as const },
	{ name: 'Gris', hex: '#6b7280' as const },
	{ name: 'Rouge', hex: '#dc2626' as const },
	{ name: 'Bleu', hex: '#2563eb' as const },
	{ name: 'Vert', hex: '#16a34a' as const },
	{ name: 'Jaune', hex: '#ca8a04' as const },
	{ name: 'Orange', hex: '#ea580c' as const },
	{ name: 'Violet', hex: '#9333ea' as const },
	{ name: 'Rose', hex: '#ec4899' as const },
	{ name: 'Transparent', hex: undefined },
] as const;

export type FilamentPaletteColorName = (typeof FILAMENT_PALETTE)[number]['name'];

export const FilamentPaletteColorNameSchema = z.enum(
	FILAMENT_PALETTE.map((e) => e.name) as [FilamentPaletteColorName, ...FilamentPaletteColorName[]],
);

export function filamentHexForPaletteColor(name: FilamentPaletteColorName): string | undefined {
	const entry = FILAMENT_PALETTE.find((e) => e.name === name);
	return entry?.hex;
}

/**
 * Default full-spool weight (g) for new-inventory UX (`SpoolForm` create mode).
 * `SpoolCreateInputSchema` still requires an explicit `initialWeightG` on parse — typically this value.
 */
export const DEFAULT_SPOOL_INITIAL_WEIGHT_G = 1000;

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
	/** Valeurs catalogue ; les enregistrements plus anciens peuvent encore avoir un libellé libre. */
	colorName: z.union([
		FilamentPaletteColorNameSchema,
		z.string().min(1).max(128),
	]),
	colorHex: z
		.string()
		.regex(/^#[0-9A-Fa-f]{6}$/, 'Couleur hex attendue (#RRVVBB).')
		.optional(),
	initialWeightG: finitePositiveGrams(),
	remainingWeightG: finiteNonNegativeGrams(),
	purchasePrice: MoneyMinorPurchaseSchema,
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
	colorName: FilamentPaletteColorNameSchema,
	colorHex: BaseSpoolShape.colorHex,
	initialWeightG: BaseSpoolShape.initialWeightG,
	purchasePrice: MoneyMinorPurchaseSchema,
	purchaseDate: PurchaseDateInputSchema.optional(),
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
	colorName: FilamentPaletteColorNameSchema.optional(),
	colorHex: z.union([BaseSpoolShape.colorHex, z.literal('')]).optional(),
	initialWeightG: finitePositiveGrams().optional(),
	purchasePrice: MoneyMinorPurchaseSchema.optional(),
	purchaseDate: optionalClearablePurchaseDate(),
	supplier: z.union([z.string().min(1).max(200), z.literal('')]).optional(),
	diameterMm: FilamentDiameterSchema.optional(),
	densityGCm3: BaseSpoolShape.densityGCm3.optional(),
	status: SpoolStatusSchema.optional(),
	notes: z.union([z.string().max(5000), z.literal('')]).optional(),
});

export type SpoolUpdateInput = z.infer<typeof SpoolUpdateInputSchema>;
