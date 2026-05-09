import { z } from 'zod';

import { PrintExternalSourceSchema } from './enums';

export const PrinterSchema = z.object({
	id: z.string().uuid('Identifiant imprimante doit être un UUID.'),
	source: PrintExternalSourceSchema,
	externalPrinterUuid: z
		.string({ required_error: 'Identifiant imprimante externe obligatoire.' })
		.min(1)
		.max(256),
	model: z.string().max(500).optional(),
	displayName: z.string().max(500).optional(),
	createdAt: z.string().datetime({ offset: true }),
	updatedAt: z.string().datetime({ offset: true }),
});

export type Printer = z.infer<typeof PrinterSchema>;
