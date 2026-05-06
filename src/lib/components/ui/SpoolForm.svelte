<script lang="ts">
	import { z } from 'zod';
	import {
		FILAMENT_PALETTE,
		FilamentPaletteColorNameSchema,
		FilamentStandardMaterialSchema,
		filamentHexForPaletteColor,
		type FilamentPaletteColorName,
		type Spool,
		type SpoolMaterial,
		type SpoolStatus,
		SpoolCreateInputSchema,
		SpoolUpdateInputSchema,
	} from '$lib/domain';
	import { createSpool, updateSpool } from '$lib/storage';
	import NumberInput from './NumberInput.svelte';
	import Select from './Select.svelte';
	import TextInput from './TextInput.svelte';

	const MATERIAL_CODES = [...FilamentStandardMaterialSchema.options];

	const currencyOptions = [
		{ label: 'EUR', value: 'EUR' },
		{ label: 'USD', value: 'USD' },
		{ label: 'GBP', value: 'GBP' },
	];

	const diameterOptions = [
		{ label: '1.75 mm', value: '1.75' },
		{ label: '2.85 mm', value: '2.85' },
	];

	const inventoryStatusOptions: { label: string; value: SpoolStatus }[] = [
		{ label: 'Active', value: 'active' },
		{ label: 'Low stock', value: 'low' },
	];

	const materialKindOptions = [
		{ label: 'Catalog', value: 'catalog' },
		{ label: 'Custom label', value: 'custom' },
	];

	const filamentColorOptions = FILAMENT_PALETTE.map((e) => ({ label: e.name, value: e.name }));

	function isPaletteColorName(s: string): s is FilamentPaletteColorName {
		return FilamentPaletteColorNameSchema.safeParse(s).success;
	}

	function catalogMaterialOptions() {
		return MATERIAL_CODES.map((code) => ({ label: code, value: code }));
	}

	function zodFieldMap(err: z.ZodError): Record<string, string> {
		const map: Record<string, string> = {};
		for (const issue of err.issues) {
			const key = issue.path.length ? issue.path.join('.') : '_root';
			if (!map[key]) map[key] = issue.message;
		}
		return map;
	}

	function materialPayload(): SpoolMaterial {
		if (materialKind === 'catalog') {
			return { kind: 'catalog', code: catalogCode };
		}
		return { kind: 'custom', label: customMaterialLabel.trim() };
	}

	let {
		mode,
		formId,
		spool = null,
		liveRemainingWeightG,
		onsaved = () => {}
	}: {
		mode: 'create' | 'edit';
		formId: string;
		spool?: Spool | null;
		/** When IndexedDB refreshes (e.g. another writer), reflect latest remaining grams without resetting the form. */
		liveRemainingWeightG?: number | undefined;
		onsaved?: () => void;
	} = $props();

	let name = $state('');
	let materialKind = $state<'catalog' | 'custom'>('catalog');
	let catalogCode = $state<(typeof MATERIAL_CODES)[number]>('PLA');
	let customMaterialLabel = $state('');
	let brand = $state('');
	let filamentColor = $state<'' | FilamentPaletteColorName>('');
	let initialWeightG = $state<number | undefined>(undefined);
	let priceMajor = $state<number | undefined>(undefined);
	let currency = $state('EUR');
	let purchaseDate = $state('');
	let supplier = $state('');
	let diameterMm = $state<'1.75' | '2.85'>('1.75');
	let densityGCm3 = $state<number | undefined>(undefined);
	let status = $state<SpoolStatus>('active');
	let notes = $state('');

	let formError = $state('');
	let fieldErrors = $state<Record<string, string>>({});
	let lastHydratedSpoolId = $state<string | null>(null);

	function hydrateFromSpool(s: Spool) {
		name = s.name;
		materialKind = s.material.kind;
		if (s.material.kind === 'catalog') {
			catalogCode = s.material.code;
			customMaterialLabel = '';
		} else {
			customMaterialLabel = s.material.label;
			catalogCode = 'PLA';
		}
		brand = s.brand ?? '';
		filamentColor = isPaletteColorName(s.colorName) ? s.colorName : '';
		initialWeightG = s.initialWeightG;
		priceMajor = s.purchasePrice.minorUnits / 100;
		currency = s.purchasePrice.currency;
		purchaseDate = s.purchaseDate ? s.purchaseDate.slice(0, 10) : '';
		supplier = s.supplier ?? '';
		diameterMm = String(s.diameterMm) as '1.75' | '2.85';
		densityGCm3 = s.densityGCm3;
		status = s.status === 'active' || s.status === 'low' ? s.status : 'active';
		notes = s.notes ?? '';
	}

	$effect(() => {
		formError = '';
		fieldErrors = {};
		if (mode === 'edit' && spool) {
			if (lastHydratedSpoolId !== spool.id) {
				hydrateFromSpool(spool);
				lastHydratedSpoolId = spool.id;
			}
		} else {
			lastHydratedSpoolId = null;
		}
	});

	async function handleSubmit(e: Event) {
		e.preventDefault();
		formError = '';
		fieldErrors = {};

		const diameter = Number.parseFloat(diameterMm) as 1.75 | 2.85;
		const purchasePrice =
			priceMajor !== undefined && Number.isFinite(priceMajor)
				? {
						minorUnits: Math.max(0, Math.round(priceMajor * 100)),
						currency: currency.toUpperCase(),
					}
				: undefined;

		if (mode === 'create') {
			const paletteHex = filamentColor
				? filamentHexForPaletteColor(filamentColor)
				: undefined;
			const payload = {
				name: name.trim(),
				material: materialPayload(),
				brand: brand.trim() || undefined,
				colorName: filamentColor,
				colorHex: paletteHex,
				initialWeightG,
				purchasePrice,
				purchaseDate: purchaseDate.trim() || undefined,
				supplier: supplier.trim() || undefined,
				diameterMm: diameter,
				densityGCm3,
				status,
				notes: notes.trim() || undefined,
			};
			const parsed = SpoolCreateInputSchema.safeParse(payload);
			if (!parsed.success) {
				fieldErrors = zodFieldMap(parsed.error);
				formError = 'Some fields need attention.';
				return;
			}
			try {
				await createSpool(parsed.data);
				onsaved();
			} catch (err) {
				formError = err instanceof Error ? err.message : 'Save failed.';
			}
			return;
		}

		if (!spool) {
			formError = 'No spool loaded.';
			return;
		}

		const patchRaw: Record<string, unknown> = {
			name: name.trim(),
			material: materialPayload(),
			brand: brand.trim() ? brand.trim() : ('' as const),
			initialWeightG,
			purchasePrice,
			purchaseDate: purchaseDate.trim(),
			supplier: supplier.trim() ? supplier.trim() : ('' as const),
			diameterMm: diameter,
			densityGCm3,
			status,
			notes: notes.trim() ? notes.trim() : ('' as const),
		};
		if (filamentColor) {
			patchRaw.colorName = filamentColor;
			patchRaw.colorHex = filamentHexForPaletteColor(filamentColor) ?? '';
		}
		const parsed = SpoolUpdateInputSchema.safeParse(patchRaw);
		if (!parsed.success) {
			fieldErrors = zodFieldMap(parsed.error);
			formError = 'Some fields need attention.';
			return;
		}
		try {
			await updateSpool(spool.id, patchRaw);
			onsaved();
		} catch (err) {
			formError = err instanceof Error ? err.message : 'Save failed.';
		}
	}

	function err(...paths: string[]): string {
		for (const p of paths) {
			if (fieldErrors[p]) return fieldErrors[p];
		}
		return '';
	}
</script>

<form id={formId} class="grid gap-4" onsubmit={handleSubmit}>
	{#if formError}
		<p class="rounded-md border border-danger/40 bg-red-50 px-3 py-2 text-sm text-danger" role="alert">
			{formError}
		</p>
	{/if}

	{#if mode === 'edit' && spool}
		<p class="text-sm text-ink-muted">
			Remaining weight:
			<span class="font-semibold text-ink"
				>{liveRemainingWeightG ?? spool.remainingWeightG} g</span
			>
			— adjust via usage or manual adjustments when those flows exist.
		</p>
	{/if}

	<div class="grid gap-3 sm:grid-cols-2">
		<TextInput
			id={`${formId}-name`}
			label="Name"
			bind:value={name}
			required
			error={err('name')}
			autocomplete="off"
		/>
		<Select
			id={`${formId}-status`}
			label="Status"
			bind:value={status}
			options={inventoryStatusOptions.map((o) => ({ label: o.label, value: o.value }))}
			error={err('status')}
		/>
	</div>

	<div class="grid gap-3 sm:grid-cols-2">
		<Select
			id={`${formId}-mat-kind`}
			label="Material source"
			bind:value={materialKind}
			options={materialKindOptions}
			error={err('material.kind')}
		/>
		{#if materialKind === 'catalog'}
			<Select
				id={`${formId}-mat-code`}
				label="Catalog material"
				bind:value={catalogCode}
				options={catalogMaterialOptions()}
				error={err('material.code')}
			/>
		{:else}
			<TextInput
				id={`${formId}-mat-custom`}
				label="Custom material"
				bind:value={customMaterialLabel}
				placeholder="e.g. PA-CF blend"
				required
				error={err('material.label')}
			/>
		{/if}
	</div>

	<div class="grid gap-3 sm:grid-cols-2">
		<TextInput
			id={`${formId}-brand`}
			label="Brand"
			bind:value={brand}
			error={err('brand')}
			hint="Optional"
		/>
		<Select
			id={`${formId}-color`}
			label="Couleur"
			bind:value={filamentColor}
			options={filamentColorOptions}
			placeholder="Choisir une couleur"
			required={mode === 'create'}
			error={err('colorName')}
		/>
	</div>

	{#if mode === 'edit' && spool && !isPaletteColorName(spool.colorName)}
		<p class="text-xs text-ink-muted">
			Couleur enregistrée (libre) : {spool.colorName}. Sélectionnez une couleur dans la liste pour l’aligner
			sur le catalogue.
		</p>
	{/if}

	<div class="grid gap-3 sm:grid-cols-2">
		<div class="sm:col-span-2 max-w-md">
			<NumberInput
				id={`${formId}-initial`}
				label="Initial weight"
				bind:value={initialWeightG}
				unit="g"
				min={0}
				step={0.01}
				required
				error={err('initialWeightG')}
			/>
		</div>
	</div>

	<div class="grid gap-3 sm:grid-cols-2">
		<NumberInput
			id={`${formId}-price`}
			label="Purchase price"
			bind:value={priceMajor}
			min={0}
			step={0.01}
			required
			error={err('purchasePrice', 'purchasePrice.minorUnits')}
		/>
		<Select
			id={`${formId}-currency`}
			label="Currency"
			bind:value={currency}
			options={currencyOptions}
			error={err('purchasePrice.currency')}
		/>
	</div>

	<div class="grid gap-3 sm:grid-cols-2">
		<label class="grid gap-1.5 text-sm font-medium text-ink" for={`${formId}-date`}>
			<span>Purchase date</span>
			<input
				id={`${formId}-date`}
				type="date"
				bind:value={purchaseDate}
				class="h-9 rounded-md border border-line bg-panel px-3 text-sm text-ink shadow-sm"
				aria-invalid={err('purchaseDate') ? 'true' : undefined}
			/>
			{#if err('purchaseDate')}
				<span class="text-xs font-medium text-danger">{err('purchaseDate')}</span>
			{:else}
				<span class="text-xs font-normal text-ink-muted">Optional</span>
			{/if}
		</label>
		<TextInput
			id={`${formId}-supplier`}
			label="Supplier"
			bind:value={supplier}
			error={err('supplier')}
			hint="Optional"
		/>
	</div>

	<div class="grid gap-3 sm:grid-cols-2">
		<Select
			id={`${formId}-diameter`}
			label="Diameter"
			bind:value={diameterMm}
			options={diameterOptions}
			error={err('diameterMm')}
		/>
		<NumberInput
			id={`${formId}-density`}
			label="Density (g/cm³, optional)"
			bind:value={densityGCm3}
			min={0}
			step={0.01}
			error={err('densityGCm3')}
		/>
	</div>

	<label class="grid gap-1.5 text-sm font-medium text-ink" for={`${formId}-notes`}>
		<span>Notes</span>
		<textarea
			id={`${formId}-notes`}
			bind:value={notes}
			rows={3}
			maxlength={5000}
			class="min-h-[4.5rem] rounded-md border border-line bg-panel px-3 py-2 text-sm text-ink shadow-sm placeholder:text-ink-muted/70"
			placeholder="Supplier batch, drying notes…"
			aria-invalid={err('notes') ? 'true' : undefined}
		></textarea>
		{#if err('notes')}
			<span class="text-xs font-medium text-danger">{err('notes')}</span>
		{/if}
	</label>
</form>
