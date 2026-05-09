import { z } from 'zod';

import { PrintExternalSourceSchema } from './enums';

const ExternalIdSchema = z.union([z.number().int(), z.string().min(1).max(64)]);

/**
 * Identité d’import externe pour idempotence logique `(source, externalJobId)`.
 */
export const PrintExternalImportSchema = z.object({
	id: z.string().uuid(),
	printId: z.string().uuid(),
	source: PrintExternalSourceSchema,
	externalJobId: z.string().min(1).max(256),
	externalConnectId: ExternalIdSchema.optional(),
	externalOriginId: ExternalIdSchema.optional(),
	fileHash: z.string().max(512).optional(),
	importedAt: z.string().datetime({ offset: true }),
});

export type PrintExternalImport = z.infer<typeof PrintExternalImportSchema>;
