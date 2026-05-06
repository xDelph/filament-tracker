<script lang="ts">
	import { liveQuery } from 'dexie';
	import { Download, Plus, Upload } from 'lucide-svelte';

	import { resolve } from '$app/paths';
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
	import { Button, Modal, AddPrintModal, Select, SpoolForm, SpoolList } from '$lib/components/ui';
	import type { Print, PrintFilamentUsage, PrintStatus, Spool } from '$lib/domain';
	import {
		formatMoneyMinor,
		remainingPercentOfInitial,
		remainingValueEstimateMinor,
	} from '$lib/domain';
	import {
		archiveSpool,
		backupFileName,
		exportDatabaseBackup,
		importDatabaseBackup,
		listActiveInventorySpools,
		listPrintUsages,
		listPrints,
		markSpoolEmpty,
		parseDatabaseBackupJson,
		serializeDatabaseBackup,
	} from '$lib/storage';

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

	let printModalOpen = $state(false);
	let printModalInitialSpoolId = $state('');
	let successMessage = $state('');
	let errorMessage = $state('');
	let backupImportInput = $state<HTMLInputElement | null>(null);

	$effect(() => {
		if (!successMessage) return;
		const timer = setTimeout(() => {
			successMessage = '';
		}, 4500);
		return () => clearTimeout(timer);
	});

	$effect(() => {
		if (!errorMessage) return;
		const timer = setTimeout(() => {
			errorMessage = '';
		}, 6500);
		return () => clearTimeout(timer);
	});

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

	function openPrintModal(spoolId = ''): void {
		successMessage = '';
		printModalInitialSpoolId = spoolId;
		printModalOpen = true;
	}

	function closePrintModal(): void {
		printModalOpen = false;
	}

	async function downloadJsonBackup(): Promise<void> {
		errorMessage = '';
		try {
			const backup = await exportDatabaseBackup();
			const blob = new Blob([serializeDatabaseBackup(backup)], {
				type: 'application/json;charset=utf-8',
			});
			const url = URL.createObjectURL(blob);
			const anchor = document.createElement('a');
			anchor.href = url;
			anchor.download = backupFileName();
			anchor.click();
			URL.revokeObjectURL(url);
			successMessage = 'Sauvegarde JSON téléchargée.';
		} catch (error) {
			errorMessage =
				error instanceof Error ? error.message : 'Impossible de créer la sauvegarde JSON.';
		}
	}

	function openBackupImport(): void {
		errorMessage = '';
		backupImportInput?.click();
	}

	async function importBackupFromFile(event: Event): Promise<void> {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		input.value = '';
		if (!file) return;
		if (
			!confirm(
				`Restaurer « ${file.name} » ? Les données locales actuelles seront remplacées par cette sauvegarde.`,
			)
		) {
			return;
		}

		try {
			const result = await importDatabaseBackup(parseDatabaseBackupJson(await file.text()));
			errorMessage = '';
			successMessage = `Sauvegarde restaurée : ${result.spools} bobine${result.spools === 1 ? '' : 's'}, ${result.prints} impression${result.prints === 1 ? '' : 's'}.`;
		} catch (error) {
			successMessage = '';
			errorMessage =
				error instanceof Error ? error.message : 'Impossible de restaurer cette sauvegarde.';
		}
	}

	function materialLabel(s: Spool): string {
		return s.material.kind === 'catalog' ? s.material.code : s.material.label;
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
			detailHref: resolve(`/spools/${s.id}`),
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
			<Button variant="secondary" onclick={downloadJsonBackup}>
				<Download size={16} />
				Exporter JSON
			</Button>
			<Button variant="secondary" onclick={openBackupImport}>
				<Upload size={16} />
				Importer JSON
			</Button>
			<input
				bind:this={backupImportInput}
				type="file"
				accept="application/json,.json"
				class="hidden"
				onchange={importBackupFromFile}
			/>
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

	{#if errorMessage}
		<p
			class="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-danger"
		>
			{errorMessage}
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

	<AddPrintModal
		idPrefix="dashboard-print"
		open={printModalOpen}
		spoolOptions={spoolOptions}
		initialSpoolId={printModalInitialSpoolId}
		disableSubmit={spools.length === 0}
		uiLabels={{
			modalTitle: 'Ajouter une impression',
			modalDescription: 'Enregistrez la consommation et mettez à jour les poids des bobines.',
			printNameLabel: "Nom de l'impression",
			printDateLabel: "Date d'impression",
			statusLabel: 'Statut',
			notesLabel: 'Notes',
			notesPlaceholder: 'Optionnel',
			filamentUsageHeading: 'Consommation par bobine',
			addSpoolRowButton: 'Bobine',
			spoolSelectLabel: 'Bobine',
			spoolPlaceholder: 'Choisir une bobine',
			usedLabel: 'Utilisé',
			wasteLabel: 'Rebut',
			removeRowAriaPrefix: 'Retirer',
			genericSpoolName: 'Bobine',
			cancelButton: 'Annuler',
			savePrintButton: "Enregistrer l'impression",
			savingPrintButton: 'Enregistrement…',
			genericSaveError: "Impossible d'enregistrer cette impression.",
		}}
		onClose={closePrintModal}
		onSaved={() => {
			successMessage = 'Impression enregistrée et stocks mis à jour.';
		}}
	/>
</div>
