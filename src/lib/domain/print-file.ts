import { z } from 'zod';

export const PrintFileSchema = z.object({
	id: z.string().uuid(),
	printId: z.string().uuid(),
	fileType: z.string().max(64).optional(),
	fileName: z.string().max(500).optional(),
	displayName: z.string().max(500).optional(),
	displayPath: z.string().max(2000).optional(),
	path: z.string().max(2000).optional(),
	sizeBytes: z.number().finite().nonnegative().optional(),
	hash: z.string().max(512).optional(),
	uploadId: z.string().max(256).optional(),
	uploadedAt: z.string().datetime({ offset: true }).optional(),
	previewUrl: z.string().max(4000).optional(),
	previewMimeType: z.string().max(128).optional(),
});

export type PrintFile = z.infer<typeof PrintFileSchema>;
