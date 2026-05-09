import { z } from 'zod';

const finiteNonNeg = z.number().finite().nonnegative();

export const PrintSettingsSchema = z.object({
	id: z.string().uuid(),
	printId: z.string().uuid(),
	nozzleDiameterMm: finiteNonNeg.optional(),
	nozzleHighFlow: z.boolean().optional(),
	layerHeightMm: finiteNonNeg.optional(),
	totalHeightMm: finiteNonNeg.optional(),
	maxLayerZMm: finiteNonNeg.optional(),
	fillDensityPercent: finiteNonNeg.optional(),
	supportMaterial: z.boolean().optional(),
	brimWidthMm: finiteNonNeg.optional(),
	ironing: z.boolean().optional(),
	nozzleTemperatureC: z.number().int().optional(),
	bedTemperatureC: z.number().int().optional(),
	filamentAbrasive: z.boolean().optional(),
	printerModelRaw: z.string().max(500).optional(),
	/** Valeur brute Connect ; interprétation « couches ratées » non retenue côté domaine. */
	connectPrintHeightRaw: finiteNonNeg.optional(),
	/** Données planifiées Prusa Connect (`planned.conditions`) — hauteur de couche cible si présente. */
	connectPlannedLayerHeightMm: finiteNonNeg.optional(),
	connectPlannedNozzleTempC: z.number().int().optional(),
	connectPlannedBedTempC: z.number().int().optional(),
	connectPlannedFilamentType: z.string().max(128).optional(),
});

export type PrintSettings = z.infer<typeof PrintSettingsSchema>;
