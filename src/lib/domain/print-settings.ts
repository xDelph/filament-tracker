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
});

export type PrintSettings = z.infer<typeof PrintSettingsSchema>;
