<script lang="ts">
	import { liveQuery } from 'dexie';
	import { Plus, Trash2 } from 'lucide-svelte';

	import {
		buildLastUsedMsBySpoolId,
		filterDashboardSpools,
		formatLastUsedRelative,
		formatMaterialFilterLabel,
		sortDashboardSpools,
		spoolMaterialFilterKey,
		type DashboardSpoolFilters,
		type DashboardSpoolSort,
	} from '$lib/dashboard/spool-inventory-view';
	import { Button, Modal, NumberInput, Select, SpoolForm, SpoolList, TextInput } from '$lib/components/ui';
	import type { Print, PrintFilamentUsage, PrintStatus, Spool } from '$lib/domain';
	import {
		formatMoneyMinor,
		remainingPercentOfInitial,
		remainingValueEstimateMinor,
	} from '$lib/domain';
	import {
		PRINT_STATUS_OPTIONS,
		PrintPersistenceError,
		archiveSpool,
		createPrintWithUsages,
		listActiveInventorySpools,
		listPrintUsages,
		listPrints,
		markSpoolEmpty,
	} from '$lib/storage';

	type UsageFormRow = {
		id: string;
		spoolId: string;
		usedWeightG?: number;
		wasteWeightG?: number;
	};

	let spools = $state<Spool[]>([]);
	let prints = $state<Print[]>([]);
	let usages = $state<PrintFilamentUsage[]>([]);

	$effect(() => {
		const subscription = liveQuery(() => listActiveInventorySpools()).subscribe((rows) => {
			spools = rows;
		});
		return () => subscription.unsubscribe();
	});

	$effect(() => {
		const subscription = liveQuery(() => listPrints()).subscribe((rows) => {
			prints = rows;
		});
		return () => subscription.unsubscribe();
	});

	$effect(() => {
		const subscription = liveQuery(() => listPrintUsages()).subscribe((rows) => {
			usages = rows;
		});
		return () => subscription.unsubscribe();
	});

	let filterMaterialKey = $state('');
	let filterStatus = $state<DashboardSpoolFilters['status']>('');
	let filterLowStock = $state<DashboardSpoolFilters['lowStock']>('all');
	let sortBy = $state<DashboardSpoolSort>('name');

	$effect(() => {
		const keys = new Set(spools.map(spoolMaterialFilterKey));
		if (filterMaterialKey && !keys.has(filterMaterialKey)) {
			filterMaterialKey = '';
		}
	});

	let lastUsedMsBySpoolId = $derived(buildLastUsedMsBySpoolId(usages, prints));

	let materialFilterOptions = $derived.by(() => {
		const labels = new Map<string, string>();
		for (const s of spools) {
			const key = spoolMaterialFilterKey(s);
			if (!labels.has(key)) {
				labels.set(key, formatMaterialFilterLabel(s));
			}
		}
		return [...labels.entries()]
			.sort((a, b) => a[1].localeCompare(b[1], 'fr', { sensitivity: 'base' }))
			.map(([value, label]) => ({ value, label }));
	});

	let filteredSpools = $derived(
		filterDashboardSpools(spools, {
			materialKey: filterMaterialKey,
			status: filterStatus,
			lowStock: filterLowStock,
		}),
	);

	let sortedSpools = $derived(sortDashboardSpools(filteredSpools, sortBy, lastUsedMsBySpoolId));

	const statusFilterOptions = [
		{ value: '', label: 'Tous les statuts' },
		{ value: 'active', label: 'Actif' },
		{ value: 'low', label: 'Stock bas' },
	];

	const lowStockFilterOptions = [
		{ value: 'all', label: 'Alerte stock bas : toutes' },
		{ value: 'low_only', label: 'Uniquement en alerte' },
		{ value: 'ok_only', label: 'Sans alerte' },
	];

	const sortOptions: Array<{ value: DashboardSpoolSort; label: string }> = [
		{ value: 'name', label: 'Nom (A–Z)' },
		{ value: 'remainingAsc', label: 'Stock restant (léger → lourd)' },
		{ value: 'remainingDesc', label: 'Stock restant (lourd → léger)' },
		{ value: 'lastUsedDesc', label: 'Dernière utilisation (récent)' },
		{ value: 'lastUsedAsc', label: 'Dernière utilisation (ancien)' },
	];

	const PRINT_STATUS_LABEL_FR: Record<PrintStatus, string> = {
		completed: 'Terminée',
		failed: 'Échouée',
		cancelled: 'Annulée',
	};

	let filtersActive = $derived(
		Boolean(filterMaterialKey) || Boolean(filterStatus) || filterLowStock !== 'all',
	);

	function resetInventoryFilters(): void {
		filterMaterialKey = '';
		filterStatus = '';
		filterLowStock = 'all';
	}

	let spoolModalOpen = $state(false);
	let spoolModalMode = $state<'create' | 'edit'>('create');
	let editingSpoolId = $state<string | null>(null);
	let editingSpoolFallback = $state<Spool | null>(null);
	let spoolModalNonce = $state(0);

	const spoolFormId = 'dashboard-spool-form';
	const printFormId = 'dashboard-print-form';

	let printModalOpen = $state(false);
	let savingPrint = $state(false);
	let printFormError = $state('');
	let successMessage = $state('');
	let printName = $state('');
	let status = $state<PrintStatus>('completed');
	let printedAt = $state(localDateTimeInputValue());
	let notes = $state('');
	let usageRows = $state<UsageFormRow[]>([emptyUsageRow()]);

	let spoolForEditForm = $derived(
		editingSpoolId
			? (spools.find((s) => s.id === editingSpoolId) ?? editingSpoolFallback)
			: null,
	);

	let editingLiveRemainingG = $derived(
		editingSpoolId ? spools.find((s) => s.id === editingSpoolId)?.remainingWeightG : undefined,
	);

	let spoolOptions = $derived(
		spools.map((spool) => ({
			value: spool.id,
			label: `${spool.name} (${spool.remainingWeightG} g)`,
		})),
	);

	let recentPrints = $derived(
		prints.slice(0, 5).map((print) => {
			const printUsages = usages.filter((usage) => usage.printId === print.id);
			const totalG = printUsages.reduce(
				(sum, usage) => sum + usage.usedWeightG + usage.wasteWeightG,
				0,
			);
			const totalMinor = printUsages.reduce((sum, usage) => sum + usage.cost.minorUnits, 0);
			const currency = printUsages[0]?.cost.currency ?? 'EUR';

			return {
				...print,
				totalG: Number(totalG.toFixed(2)),
				totalCost: formatMoneyMinor({ minorUnits: totalMinor, currency }),
				statusLabel: PRINT_STATUS_LABEL_FR[print.status],
				spoolNames: printUsages
					.map((usage) => spools.find((spool) => spool.id === usage.spoolId)?.name)
					.filter(Boolean)
					.join(', '),
			};
		}),
	);

	function openCreate() {
		spoolModalMode = 'create';
		editingSpoolId = null;
		editingSpoolFallback = null;
		spoolModalNonce += 1;
		spoolModalOpen = true;
	}

	function openEdit(spool: Spool) {
		spoolModalMode = 'edit';
		editingSpoolId = spool.id;
		editingSpoolFallback = spool;
		spoolModalNonce += 1;
		spoolModalOpen = true;
	}

	function closeSpoolModal() {
		spoolModalOpen = false;
		editingSpoolId = null;
		editingSpoolFallback = null;
	}

	function localDateTimeInputValue(date = new Date()): string {
		const offsetMs = date.getTimezoneOffset() * 60_000;
		return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
	}

	function emptyUsageRow(spoolId = ''): UsageFormRow {
		return {
			id: crypto.randomUUID(),
			spoolId,
			usedWeightG: undefined,
			wasteWeightG: 0,
		};
	}

	function openPrintModal(spoolId = ''): void {
		printFormError = '';
		successMessage = '';
		printName = '';
		status = 'completed';
		printedAt = localDateTimeInputValue();
		notes = '';
		usageRows = [emptyUsageRow(spoolId)];
		printModalOpen = true;
	}

	function closePrintModal(): void {
		printModalOpen = false;
	}

	function addUsageRow(): void {
		usageRows = [...usageRows, emptyUsageRow()];
	}

	function removeUsageRow(rowId: string): void {
		if (usageRows.length === 1) {
			return;
		}

		usageRows = usageRows.filter((row) => row.id !== rowId);
	}

	function materialLabel(s: Spool): string {
		return s.material.kind === 'catalog' ? s.material.code : s.material.label;
	}

	function selectedSpoolName(spoolId: string): string {
		return spools.find((spool) => spool.id === spoolId)?.name ?? 'Bobine';
	}

	function remainingPercentLabelForSpool(s: Spool): string {
		const p = remainingPercentOfInitial(s.remainingWeightG, s.initialWeightG);
		if (Number.isNaN(p)) {
			return '—';
		}
		const clamped = Math.max(0, Math.min(100, p));
		return `${clamped.toFixed(1)}\u00a0% restant`;
	}

	function toSummary(s: Spool, nowMs: number) {
		const remainingMinor = remainingValueEstimateMinor(s);
		const lastMs = lastUsedMsBySpoolId.get(s.id);
		return {
			id: s.id,
			name: s.name,
			material: materialLabel(s),
			brand: s.brand,
			colorName: s.colorName,
			colorHex: s.colorHex,
			remainingWeightG: s.remainingWeightG,
			initialWeightG: s.initialWeightG,
			remainingPercentLabel: remainingPercentLabelForSpool(s),
			remainingValue: formatMoneyMinor(remainingMinor),
			lastUsedText:
				lastMs !== undefined ? formatLastUsedRelative(lastMs, nowMs) ?? '—' : 'Jamais',
			status: s.status,
			onPrint: () => openPrintModal(s.id),
			onEdit: () => openEdit(s),
			onArchive: async () => {
				if (
					!confirm(
						`Archiver « ${s.name} » ? Elle reste dans l’historique mais disparaît de cette liste.`,
					)
				)
					return;
				await archiveSpool(s.id);
			},
			onMarkEmpty: async () => {
				if (!confirm(`Marquer « ${s.name} » comme vide (0 g restants) ?`)) return;
				await markSpoolEmpty(s.id);
			},
		};
	}

	let spoolSummaries = $derived(sortedSpools.map((s) => toSummary(s, Date.now())));

	async function handlePrintSubmit(event: SubmitEvent): Promise<void> {
		event.preventDefault();
		printFormError = '';
		successMessage = '';
		savingPrint = true;

		try {
			await createPrintWithUsages({
				name: printName.trim(),
				printedAt: new Date(printedAt).toISOString(),
				status,
				notes: notes.trim() || undefined,
				usages: usageRows.map((row) => ({
					spoolId: row.spoolId,
					usedWeightG: Number(row.usedWeightG),
					wasteWeightG: Number(row.wasteWeightG ?? 0),
				})),
			});

			successMessage = 'Impression enregistrée et stocks mis à jour.';
			closePrintModal();
		} catch (error) {
			if (error instanceof PrintPersistenceError) {
				printFormError = error.message;
			} else if (error instanceof Error) {
				printFormError = error.message;
			} else {
				printFormError = 'Impossible d’enregistrer cette impression.';
			}
		} finally {
			savingPrint = false;
		}
	}
</script>

<div class="grid gap-6">
	<header class="flex flex-wrap items-center justify-between gap-3">
		<div>
			<h1 class="text-2xl font-semibold tracking-tight">Tableau de bord</h1>
			<p class="mt-2 text-zinc-600">
				Inventaire des bobines actives ou en stock bas — données locales (IndexedDB / Dexie).
			</p>
		</div>
		<div class="flex flex-wrap gap-2">
			<Button variant="secondary" onclick={() => openPrintModal()} disabled={spools.length === 0}>
				<Plus size={16} />
				Ajouter une impression
			</Button>
			<Button onclick={openCreate}><Plus size={16} /> Ajouter une bobine</Button>
		</div>
	</header>

	{#if successMessage}
		<p
			class="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-success"
		>
			{successMessage}
		</p>
	{/if}

	<section class="grid gap-4" aria-labelledby="inventory-heading">
		<div class="flex flex-wrap items-end justify-between gap-3">
			<div class="min-w-0 flex-1">
				<h2 id="inventory-heading" class="text-base font-semibold text-ink">Inventaire</h2>
				{#if spools.length === 0}
					<p class="mt-1 text-sm text-ink-muted">
						Ajoute une bobine pour alimenter cet inventaire.
					</p>
				{:else}
					<p class="mt-1 text-sm text-ink-muted">
						{sortedSpools.length} bobine{sortedSpools.length === 1 ? '' : 's'} affichée{sortedSpools.length === 1
							? ''
							: 's'}{#if sortedSpools.length !== spools.length}&nbsp;sur {spools.length}{/if}. Combine matériau, statut
						et alerte&nbsp;: sans résultat, élargis ou réinitialise les filtres.
					</p>
				{/if}
			</div>
			{#if filtersActive}
				<Button variant="ghost" size="sm" type="button" onclick={resetInventoryFilters}>
					Réinitialiser les filtres
				</Button>
			{/if}
		</div>

		<div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
			<Select
				id="filter-material"
				label="Matériau"
				bind:value={filterMaterialKey}
				options={materialFilterOptions}
				placeholder="Tous les matériaux"
			/>
			<Select
				id="filter-status"
				label="Statut enregistré"
				bind:value={filterStatus}
				options={statusFilterOptions}
			/>
			<Select
				id="filter-low-stock"
				label="Alerte stock bas"
				bind:value={filterLowStock}
				options={lowStockFilterOptions}
			/>
			<Select
				id="sort-spools"
				label="Tri"
				bind:value={sortBy}
				options={sortOptions}
			/>
		</div>

		{#if sortBy === 'lastUsedDesc' || sortBy === 'lastUsedAsc'}
			<p id="inventory-sort-hint" class="text-xs leading-relaxed text-ink-muted">
				Les bobines sans historique d’impression sont en bas lorsque tu tries par utilisation la plus récente,
				et en haut lorsque tu tries par la plus ancienne. À l’intérieur de chaque groupe, tri alphabétique sur le nom.
			</p>
		{/if}

		{#if sortedSpools.length === 0 && spools.length > 0}
			<div
				class="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-ink shadow-sm"
				role="status"
				aria-live="polite"
			>
				<p class="font-semibold text-ink">Aucun résultat pour ces filtres</p>
				<p class="mt-1 text-ink-muted">
					Réinitialise les filtres ou assouplis au moins un critère pour retrouver des bobines.
				</p>
				<Button
					variant="secondary"
					size="sm"
					class="mt-3"
					type="button"
					onclick={resetInventoryFilters}
				>
					Réinitialiser les filtres
				</Button>
			</div>
		{:else}
			<SpoolList
				spools={spoolSummaries}
				emptyMessage="Aucune bobine dans l’inventaire actif ou stock bas. Ajoutez une bobine pour commencer."
			/>
		{/if}
	</section>

	<section>
		<div class="mb-3 flex items-center justify-between gap-3">
			<h2 class="text-base font-semibold text-ink">Impressions récentes</h2>
			<p class="text-sm text-ink-muted">{prints.length} enregistrée{prints.length === 1 ? '' : 's'}</p>
		</div>
		<div class="overflow-hidden rounded-lg border border-line bg-panel">
			{#each recentPrints as print}
				<div
					class="grid gap-2 border-b border-line px-4 py-3 last:border-b-0 sm:grid-cols-[1fr_auto_auto] sm:items-center"
				>
					<div class="min-w-0">
						<p class="truncate text-sm font-semibold text-ink">{print.name}</p>
						<p class="truncate text-xs text-ink-muted">
							{print.spoolNames || 'Aucune bobine'} / {print.statusLabel}
						</p>
					</div>
					<p class="text-sm font-medium text-ink">{print.totalG} g</p>
					<p class="text-sm font-semibold text-ink">{print.totalCost}</p>
				</div>
			{:else}
				<p class="p-6 text-sm text-ink-muted">Aucune impression enregistrée.</p>
			{/each}
		</div>
	</section>

	<Modal
		open={spoolModalOpen}
		title={spoolModalMode === 'create' ? 'Ajouter une bobine' : 'Modifier la bobine'}
		description="Les poids, le prix, le matériau, la couleur et le statut sont validés avant enregistrement."
		onClose={closeSpoolModal}
	>
		{#key spoolModalNonce}
			<SpoolForm
				formId={spoolFormId}
				mode={spoolModalMode}
				spool={spoolForEditForm}
				liveRemainingWeightG={editingLiveRemainingG}
				onsaved={closeSpoolModal}
			/>
		{/key}
		{#snippet footer()}
			<Button variant="secondary" onclick={closeSpoolModal}>Annuler</Button>
			<Button type="submit" form={spoolFormId}>Enregistrer la bobine</Button>
		{/snippet}
	</Modal>

	<Modal
		open={printModalOpen}
		title="Ajouter une impression"
		description="Enregistrez la consommation et mettez à jour les poids des bobines."
		onClose={closePrintModal}
	>
		<form id={printFormId} class="grid gap-4" onsubmit={handlePrintSubmit}>
			{#if printFormError}
				<p class="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-danger">
					{printFormError}
				</p>
			{/if}

			<div class="grid gap-3 sm:grid-cols-2">
				<TextInput id="print-name" label="Nom de l’impression" bind:value={printName} required />
				<label class="grid gap-1.5 text-sm font-medium text-ink" for="printed-at">
					<span>Date d’impression</span>
					<input
						id="printed-at"
						class="h-9 rounded-md border border-line bg-panel px-3 text-sm text-ink shadow-sm"
						type="datetime-local"
						bind:value={printedAt}
						required
					/>
				</label>
				<Select
					id="print-status"
					label="Statut"
					bind:value={status}
					options={PRINT_STATUS_OPTIONS}
					required
				/>
				<TextInput id="print-notes" label="Notes" bind:value={notes} placeholder="Optionnel" />
			</div>

			<div class="grid gap-3">
				<div class="flex items-center justify-between gap-3">
					<h3 class="text-sm font-semibold text-ink">Consommation par bobine</h3>
					<Button variant="secondary" size="sm" onclick={addUsageRow}>
						<Plus size={16} />
						Bobine
					</Button>
				</div>

				{#each usageRows as row (row.id)}
					<div
						class="grid gap-3 rounded-lg border border-line bg-panel-muted p-3 sm:grid-cols-[1fr_8rem_8rem_auto] sm:items-end"
					>
						<Select
							id={`spool-${row.id}`}
							label="Bobine"
							bind:value={row.spoolId}
							options={spoolOptions}
							placeholder="Choisir une bobine"
							required
						/>
						<NumberInput
							id={`used-${row.id}`}
							label="Utilisé"
							bind:value={row.usedWeightG}
							min={0.01}
							step="any"
							unit="g"
							required
						/>
						<NumberInput
							id={`waste-${row.id}`}
							label="Rebut"
							bind:value={row.wasteWeightG}
							min={0}
							step="any"
							unit="g"
						/>
						<Button
							variant="ghost"
							size="sm"
							disabled={usageRows.length === 1}
							onclick={() => removeUsageRow(row.id)}
						>
							<Trash2 size={16} />
							<span class="sr-only">Retirer {selectedSpoolName(row.spoolId)}</span>
						</Button>
					</div>
				{/each}
			</div>
		</form>
		{#snippet footer()}
			<Button variant="ghost" onclick={closePrintModal}>Annuler</Button>
			<Button type="submit" form={printFormId} disabled={savingPrint || spools.length === 0}>
				{savingPrint ? 'Enregistrement…' : 'Enregistrer l’impression'}
			</Button>
		{/snippet}
	</Modal>
</div>
