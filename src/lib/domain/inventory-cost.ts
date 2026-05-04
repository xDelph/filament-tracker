import type { MoneyMinor } from './money';
import type { PrintFilamentUsage } from './print-filament-usage';
import type { Spool } from './spool';

/**
 * Coût moyen (centimes / équivalent mineur) pour une gramme de matière, dérivé du prix d'achat et du poids initial.
 * Résultat potentiellement fractionnaire ; arrondir côté facturation via `materialCostForGramsAtSpoolRate`.
 */
export function spoolCostPerGramMinorUnits(
	spool: Pick<Spool, 'purchasePrice' | 'initialWeightG'>,
): number {
	if (!(spool.initialWeightG > 0)) {
		return Number.NaN;
	}
	return spool.purchasePrice.minorUnits / spool.initialWeightG;
}

/** Poids total facturé pour une ligne de consommation (utilisé + déchet). */
export function consumptionTotalGrams(
	usage: Pick<PrintFilamentUsage, 'usedWeightG' | 'wasteWeightG'>,
): number {
	return usage.usedWeightG + usage.wasteWeightG;
}

/** Coût matière figé sur la ligne (snapshot au moment de l'enregistrement). */
export function consumptionMaterialCost(
	usage: Pick<PrintFilamentUsage, 'cost'>,
): MoneyMinor {
	return usage.cost;
}

/**
 * Coût moyen par gramme pour une ligne, à partir du coût figé et du poids total.
 */
export function consumptionCostPerGramMinorUnits(
	usage: Pick<PrintFilamentUsage, 'usedWeightG' | 'wasteWeightG' | 'cost'>,
): number {
	const totalG = consumptionTotalGrams(usage);
	if (!(totalG > 0)) {
		return Number.NaN;
	}
	return usage.cost.minorUnits / totalG;
}

/**
 * Estime le coût matière pour un poids donné au tarif moyen de la bobine (arrondi entier des centimes).
 */
export function materialCostForGramsAtSpoolRate(
	spool: Pick<Spool, 'purchasePrice' | 'initialWeightG'>,
	grams: number,
): MoneyMinor {
	if (!Number.isFinite(grams) || grams < 0) {
		return { minorUnits: 0, currency: spool.purchasePrice.currency };
	}
	const rate = spoolCostPerGramMinorUnits(spool);
	if (!Number.isFinite(rate)) {
		return { minorUnits: 0, currency: spool.purchasePrice.currency };
	}
	const rounded = Math.round(rate * grams);
	return {
		minorUnits: Math.max(0, rounded),
		currency: spool.purchasePrice.currency,
	};
}

/**
 * Somme des coûts matière des lignes d'une impression.
 * @param emptyCurrency — requis lorsque `usages` est vide (devise du total zéro).
 * @throws RangeError si les lignes mélangent plusieurs codes devise.
 */
export function totalPrintMaterialCost(
	usages: Array<Pick<PrintFilamentUsage, 'cost'>>,
	emptyCurrency: string,
): MoneyMinor {
	if (usages.length === 0) {
		return { minorUnits: 0, currency: emptyCurrency };
	}

	const currency = usages[0]!.cost.currency;
	let sum = 0;

	for (const u of usages) {
		if (u.cost.currency !== currency) {
			throw new RangeError('totalPrintMaterialCost: mixed currency');
		}
		sum += u.cost.minorUnits;
	}

	return { minorUnits: sum, currency };
}

/** Poids restant sur la bobine (projection typée du champ métier). */
export function remainingWeightGrams(spool: Pick<Spool, 'remainingWeightG'>): number {
	return spool.remainingWeightG;
}

/**
 * Pourcentage du poids initial encore disponible (0–100).
 * Retourne NaN si le poids initial est nul ou invalide.
 */
export function remainingPercentOfInitial(
	remainingWeightG: number,
	initialWeightG: number,
): number {
	if (!(initialWeightG > 0) || !Number.isFinite(remainingWeightG)) {
		return Number.NaN;
	}
	return (remainingWeightG / initialWeightG) * 100;
}

export type LowStockOptions = {
	/** Seuil absolu : stock bas si le restant est <= cette valeur (grammes). */
	maxRemainingGrams?: number;
	/** Seuil relatif : stock bas si le pourcentage restant est <= cette valeur (0–100). */
	maxRemainingPercent?: number;
};

/**
 * Détection « stock bas » : vrai si l'une des conditions configurées est satisfaite.
 * Sans seuil, retourne faux.
 */
export function isLowStock(
	remainingWeightG: number,
	initialWeightG: number,
	options: LowStockOptions,
): boolean {
	const { maxRemainingGrams, maxRemainingPercent } = options;
	const hasGramThreshold = maxRemainingGrams !== undefined && Number.isFinite(maxRemainingGrams);
	const hasPercentThreshold =
		maxRemainingPercent !== undefined && Number.isFinite(maxRemainingPercent);

	if (!hasGramThreshold && !hasPercentThreshold) {
		return false;
	}

	if (hasGramThreshold && remainingWeightG <= maxRemainingGrams!) {
		return true;
	}

	if (hasPercentThreshold) {
		const p = remainingPercentOfInitial(remainingWeightG, initialWeightG);
		if (!Number.isNaN(p) && p <= maxRemainingPercent!) {
			return true;
		}
	}

	return false;
}

/**
 * Borne le restant dans [0, initial] pour affichages ou calculs défensifs hors persistance validée.
 */
export function clampRemainingToInitialRange(
	remainingWeightG: number,
	initialWeightG: number,
): number {
	if (!Number.isFinite(initialWeightG) || initialWeightG < 0) {
		return 0;
	}

	const upper = initialWeightG;

	if (remainingWeightG === Number.POSITIVE_INFINITY) {
		return upper;
	}

	if (!Number.isFinite(remainingWeightG) || remainingWeightG === Number.NEGATIVE_INFINITY) {
		return 0;
	}

	return Math.min(Math.max(0, remainingWeightG), upper);
}
