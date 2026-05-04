<script lang="ts">
	import { liveQuery } from 'dexie';

	import { resolve } from '$app/paths';
	import { StatusBadge } from '$lib/components/ui';
	import type { Print, PrintFilamentUsage, PrintStatus, Spool } from '$lib/domain';
	import { formatMoneyMinor } from '$lib/domain';
	import { listPrintUsages, listPrints, listSpools } from '$lib/storage';

	type HistoryRow = Print & {
		totalG: number;
		totalCost: string;
		spoolNames: string;
		materials: string[];
		usages: Array<
			PrintFilamentUsage & {
				spool?: Spool;
				consumedG: number;
				costLabel: string;
				materialLabel: string;
			}
		>;
	};

	const statusOptions: Array<{ value: PrintStatus | ''; label: string }> = [
		{ value: '', label: 'All statuses' },
		{ value: 'completed', label: 'Completed' },
		{ value: 'failed', label: 'Failed' },
		{ value: 'cancelled', label: 'Cancelled' },
	];

	let prints = $state<Print[]>([]);
	let usages = $state<PrintFilamentUsage[]>([]);
	let spools = $state<Spool[]>([]);
	let printsLoaded = $state(false);
	let usagesLoaded = $state(false);
	let spoolsLoaded = $state(false);

	let startDate = $state('');
	let endDate = $state('');
	let spoolIdFilter = $state('');
	let materialFilter = $state('');
	let statusFilter = $state<PrintStatus | ''>('');
	let selectedPrintId = $state<string | null>(null);

	$effect(() => {
		const subscription = liveQuery(() => listPrints()).subscribe((rows) => {
			prints = rows;
			printsLoaded = true;
		});
		return () => subscription.unsubscribe();
	});

	$effect(() => {
		const subscription = liveQuery(() => listPrintUsages()).subscribe((rows) => {
			usages = rows;
			usagesLoaded = true;
		});
		return () => subscription.unsubscribe();
	});

	$effect(() => {
		const subscription = liveQuery(() => listSpools()).subscribe((rows) => {
			spools = rows;
			spoolsLoaded = true;
		});
		return () => subscription.unsubscribe();
	});

	let loading = $derived(!(printsLoaded && usagesLoaded && spoolsLoaded));
	let spoolById = $derived(new Map(spools.map((spool) => [spool.id, spool])));

	let spoolOptions = $derived(
		spools
			.toSorted((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
			.map((spool) => ({ value: spool.id, label: spool.name })),
	);

	let materialOptions = $derived(
		[...new Set(spools.map((spool) => materialLabel(spool)))]
			.toSorted((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
			.map((material) => ({ value: material, label: material })),
	);

	let historyRows = $derived(
		prints.map((print) => {
			const printUsages = usages.filter((usage) => usage.printId === print.id);
			const totalG = printUsages.reduce((sum, usage) => sum + consumedGrams(usage), 0);
			const enrichedUsages = printUsages.map((usage) => {
				const spool = spoolById.get(usage.spoolId);
				return {
					...usage,
					spool,
					consumedG: consumedGrams(usage),
					costLabel: formatMoneyMinor(usage.cost),
					materialLabel: spool ? materialLabel(spool) : 'Unknown',
				};
			});
			const materials = [...new Set(enrichedUsages.map((usage) => usage.materialLabel))];

			return {
				...print,
				totalG: Number(totalG.toFixed(2)),
				totalCost: formatCostTotal(printUsages),
				spoolNames: enrichedUsages.map((usage) => usage.spool?.name ?? 'Unknown spool').join(', '),
				materials,
				usages: enrichedUsages,
			};
		}),
	);

	let filteredRows = $derived(
		historyRows.filter((row) => {
			const printDate = localDateKey(row.printedAt);
			const matchesStart = !startDate || printDate >= startDate;
			const matchesEnd = !endDate || printDate <= endDate;
			const matchesStatus = !statusFilter || row.status === statusFilter;
			const matchesSpool =
				!spoolIdFilter || row.usages.some((usage) => usage.spoolId === spoolIdFilter);
			const matchesMaterial = !materialFilter || row.materials.includes(materialFilter);

			return matchesStart && matchesEnd && matchesStatus && matchesSpool && matchesMaterial;
		}),
	);

	let selectedPrint = $derived(
		selectedPrintId
			? (filteredRows.find((row) => row.id === selectedPrintId) ?? filteredRows[0] ?? null)
			: (filteredRows[0] ?? null),
	);

	let filteredTotals = $derived({
		prints: filteredRows.length,
		grams: Number(
			filteredRows.reduce((sum, row) => sum + row.totalG, 0).toFixed(2),
		),
		cost: formatCostTotal(filteredRows.flatMap((row) => row.usages)),
	});

	function consumedGrams(usage: PrintFilamentUsage): number {
		return Number((usage.usedWeightG + usage.wasteWeightG).toFixed(2));
	}

	function materialLabel(spool: Pick<Spool, 'material'>): string {
		return spool.material.kind === 'catalog' ? spool.material.code : spool.material.label;
	}

	function formatDateTime(value: string): string {
		return new Intl.DateTimeFormat('fr-FR', {
			dateStyle: 'medium',
			timeStyle: 'short',
		}).format(new Date(value));
	}

	function localDateKey(value: string): string {
		const date = new Date(value);
		const month = `${date.getMonth() + 1}`.padStart(2, '0');
		const day = `${date.getDate()}`.padStart(2, '0');

		return `${date.getFullYear()}-${month}-${day}`;
	}

	function formatCostTotal(costUsages: Array<Pick<PrintFilamentUsage, 'cost'>>): string {
		if (costUsages.length === 0) {
			return formatMoneyMinor({ minorUnits: 0, currency: 'EUR' });
		}

		const totalsByCurrency = new Map<string, number>();

		for (const usage of costUsages) {
			totalsByCurrency.set(
				usage.cost.currency,
				(totalsByCurrency.get(usage.cost.currency) ?? 0) + usage.cost.minorUnits,
			);
		}

		return [...totalsByCurrency]
			.toSorted(([a], [b]) => a.localeCompare(b))
			.map(([currency, minorUnits]) => formatMoneyMinor({ minorUnits, currency }))
			.join(' + ');
	}

	function clearFilters(): void {
		startDate = '';
		endDate = '';
		spoolIdFilter = '';
		materialFilter = '';
		statusFilter = '';
		selectedPrintId = null;
	}
</script>

<div class="grid gap-6">
	<header class="flex flex-wrap items-start justify-between gap-3">
		<div>
			<h1 class="text-2xl font-semibold tracking-tight">Print history</h1>
			<p class="mt-2 text-zinc-600">
				Review saved prints, consumed grams, frozen material cost, and spool usage.
			</p>
		</div>
		<a
			href={resolve('/dashboard')}
			class="inline-flex h-9 shrink-0 items-center justify-center rounded-md border border-line bg-panel px-4 text-sm font-medium text-ink transition hover:bg-panel-muted"
			>Add print</a
		>
	</header>

	<section class="grid gap-3 rounded-lg border border-line bg-panel p-4">
		<div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
			<label class="grid gap-1.5 text-sm font-medium text-ink" for="start-date">
				<span>From</span>
				<input
					id="start-date"
					class="h-9 rounded-md border border-line bg-panel px-3 text-sm text-ink shadow-sm"
					type="date"
					bind:value={startDate}
				/>
			</label>
			<label class="grid gap-1.5 text-sm font-medium text-ink" for="end-date">
				<span>To</span>
				<input
					id="end-date"
					class="h-9 rounded-md border border-line bg-panel px-3 text-sm text-ink shadow-sm"
					type="date"
					bind:value={endDate}
				/>
			</label>
			<label class="grid gap-1.5 text-sm font-medium text-ink" for="spool-filter">
				<span>Spool</span>
				<select
					id="spool-filter"
					class="h-9 rounded-md border border-line bg-panel px-3 text-sm text-ink shadow-sm"
					bind:value={spoolIdFilter}
				>
					<option value="">All spools</option>
					{#each spoolOptions as option}
						<option value={option.value}>{option.label}</option>
					{/each}
				</select>
			</label>
			<label class="grid gap-1.5 text-sm font-medium text-ink" for="material-filter">
				<span>Material</span>
				<select
					id="material-filter"
					class="h-9 rounded-md border border-line bg-panel px-3 text-sm text-ink shadow-sm"
					bind:value={materialFilter}
				>
					<option value="">All materials</option>
					{#each materialOptions as option}
						<option value={option.value}>{option.label}</option>
					{/each}
				</select>
			</label>
			<label class="grid gap-1.5 text-sm font-medium text-ink" for="status-filter">
				<span>Status</span>
				<select
					id="status-filter"
					class="h-9 rounded-md border border-line bg-panel px-3 text-sm text-ink shadow-sm"
					bind:value={statusFilter}
				>
					{#each statusOptions as option}
						<option value={option.value}>{option.label}</option>
					{/each}
				</select>
			</label>
		</div>
		<div class="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3">
			<p class="text-sm text-ink-muted">
				{filteredTotals.prints} prints / {filteredTotals.grams} g / {filteredTotals.cost}
			</p>
			<button
				type="button"
				class="inline-flex h-8 shrink-0 items-center justify-center rounded-md border border-transparent bg-transparent px-3 text-sm font-medium text-ink transition hover:bg-panel-muted"
				onclick={clearFilters}
			>
				Clear filters
			</button>
		</div>
	</section>

	{#if loading}
		<section class="rounded-lg border border-line bg-panel p-6">
			<div class="grid gap-3">
				<div class="h-4 w-40 rounded bg-panel-muted"></div>
				<div class="h-12 rounded bg-panel-muted"></div>
				<div class="h-12 rounded bg-panel-muted"></div>
				<div class="h-12 rounded bg-panel-muted"></div>
			</div>
		</section>
	{:else if prints.length === 0}
		<section class="rounded-lg border border-line bg-panel p-8 text-center">
			<h2 class="text-base font-semibold text-ink">No prints saved yet</h2>
			<p class="mx-auto mt-2 max-w-md text-sm text-ink-muted">
				Once a print is added from the dashboard, it appears here with its spool usage and cost.
			</p>
			<p class="mt-4">
				<a
					href={resolve('/dashboard')}
					class="text-sm font-medium text-brand underline-offset-4 hover:underline">Go to dashboard</a
				>
			</p>
		</section>
	{:else if filteredRows.length === 0}
		<section class="rounded-lg border border-line bg-panel p-8 text-center">
			<h2 class="text-base font-semibold text-ink">No prints match these filters</h2>
			<p class="mt-2 text-sm text-ink-muted">Try a wider date range or clear one of the filters.</p>
			<div class="mt-4">
				<button
					type="button"
					class="inline-flex h-9 shrink-0 items-center justify-center rounded-md border border-line bg-panel px-4 text-sm font-medium text-ink transition hover:bg-panel-muted"
					onclick={clearFilters}
				>
					Clear filters
				</button>
			</div>
		</section>
	{:else}
		<div class="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
			<section class="overflow-hidden rounded-lg border border-line bg-panel">
				<div class="hidden grid-cols-[1fr_8rem_9rem_7rem] gap-4 border-b border-line bg-panel-muted px-4 py-2 text-xs font-semibold uppercase text-ink-muted md:grid">
					<span>Print</span>
					<span>Status</span>
					<span>Filament</span>
					<span class="text-right">Cost</span>
				</div>
				{#each filteredRows as print (print.id)}
					<button
						type="button"
						class={[
							'grid w-full gap-3 border-b border-line px-4 py-3 text-left last:border-b-0 hover:bg-panel-muted md:grid-cols-[1fr_8rem_9rem_7rem] md:items-center',
							selectedPrint?.id === print.id ? 'bg-emerald-50' : 'bg-panel',
						]}
						onclick={() => (selectedPrintId = print.id)}
					>
						<div class="min-w-0">
							<p class="truncate text-sm font-semibold text-ink">{print.name}</p>
							<p class="truncate text-xs text-ink-muted">
								{formatDateTime(print.printedAt)} / {print.spoolNames}
							</p>
						</div>
						<div>
							<StatusBadge status={print.status} />
						</div>
						<p class="text-sm font-medium text-ink">{print.totalG} g</p>
						<p class="text-sm font-semibold text-ink md:text-right">{print.totalCost}</p>
					</button>
				{/each}
			</section>

			{#if selectedPrint}
				<aside class="rounded-lg border border-line bg-panel p-4">
					<div class="flex items-start justify-between gap-3">
						<div class="min-w-0">
							<h2 class="truncate text-base font-semibold text-ink">{selectedPrint.name}</h2>
							<p class="mt-1 text-sm text-ink-muted">{formatDateTime(selectedPrint.printedAt)}</p>
						</div>
						<StatusBadge status={selectedPrint.status} />
					</div>

					<div class="mt-4 grid grid-cols-2 gap-3">
						<div class="rounded-md border border-line bg-panel-muted p-3">
							<p class="text-xs font-medium text-ink-muted">Grams</p>
							<p class="mt-1 text-lg font-semibold text-ink">{selectedPrint.totalG} g</p>
						</div>
						<div class="rounded-md border border-line bg-panel-muted p-3">
							<p class="text-xs font-medium text-ink-muted">Cost</p>
							<p class="mt-1 text-lg font-semibold text-ink">{selectedPrint.totalCost}</p>
						</div>
					</div>

					<div class="mt-5 grid gap-3">
						<h3 class="text-sm font-semibold text-ink">Spools used</h3>
						{#each selectedPrint.usages as usage (usage.id)}
							<div class="rounded-md border border-line p-3">
								<div class="flex items-start justify-between gap-3">
									<div class="min-w-0">
										<p class="truncate text-sm font-semibold text-ink">
											{usage.spool?.name ?? 'Unknown spool'}
										</p>
										<p class="text-xs text-ink-muted">
											{usage.materialLabel} / {usage.usedWeightG} g used / {usage.wasteWeightG} g waste
										</p>
									</div>
									<p class="shrink-0 text-sm font-semibold text-ink">{usage.costLabel}</p>
								</div>
							</div>
						{/each}
					</div>

					{#if selectedPrint.notes}
						<div class="mt-5 border-t border-line pt-4">
							<h3 class="text-sm font-semibold text-ink">Notes</h3>
							<p class="mt-2 whitespace-pre-wrap text-sm text-ink-muted">{selectedPrint.notes}</p>
						</div>
					{/if}
				</aside>
			{/if}
		</div>
	{/if}
</div>
