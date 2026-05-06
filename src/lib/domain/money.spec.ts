import { describe, expect, it } from 'vitest';

import { MoneyMinorPurchaseSchema, MoneyMinorSchema } from './money';

describe('MoneyMinorSchema', () => {
	it('accepte des montants entiers non négatifs et devise ISO majuscule', () => {
		expect(
			MoneyMinorSchema.safeParse({ minorUnits: 0, currency: 'EUR' }).success,
		).toBe(true);
		expect(
			MoneyMinorSchema.safeParse({ minorUnits: 1234, currency: 'USD' }).success,
		).toBe(true);
	});

	it('rejette les minorUnits non entiers', () => {
		expect(MoneyMinorSchema.safeParse({ minorUnits: 10.5, currency: 'EUR' }).success).toBe(
			false,
		);
	});

	it('rejette une devise mal formatée', () => {
		expect(MoneyMinorSchema.safeParse({ minorUnits: 100, currency: 'eur' }).success).toBe(false);
		expect(MoneyMinorSchema.safeParse({ minorUnits: 100, currency: 'EURO' }).success).toBe(
			false,
		);
	});
});

describe('MoneyMinorPurchaseSchema', () => {
	it('exige un prix strictement positif', () => {
		expect(MoneyMinorPurchaseSchema.safeParse({ minorUnits: 0, currency: 'EUR' }).success).toBe(
			false,
		);
		expect(MoneyMinorPurchaseSchema.safeParse({ minorUnits: 1, currency: 'EUR' }).success).toBe(
			true,
		);
	});
});
