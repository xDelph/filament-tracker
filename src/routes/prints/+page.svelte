<script lang="ts">
	import { liveQuery } from 'dexie';

	import { resolve } from '$app/paths';
	import { StatusBadge } from '$lib/components/ui';
	import type {
		Print,
		PrintExternalImport,
		PrintFile,
		PrintFilamentUsage,
		PrintObject,
		PrintSettings,
		PrintStatus,
		Printer,
		Spool,
	} from '$lib/domain';
	import { formatMoneyMinor } from '$lib/domain';
	import {
		listPrintExternalImports,
		listPrintFiles,
		listPrintObjects,
		listPrintSettings,
		listPrintUsages,
		listPrinters,
		listPrints,
		listSpools,
	} from '$lib/storage';

	type HistoryRow = Print & {
		totalG: number;
		totalCost: string;
		spoolNames: string;
		materials: string[];
		printer?: Printer;
		printerLabel?: string;
		settings?: PrintSettings;
		files: PrintFile[];
		objects: PrintObject[];
		import?: PrintExternalImport;
		sourceLabel?: string;
		nozzleLabel?: string;
		layerHeightLabel?: string;
		actualDurationLabel?: string;
		estimatedDurationLabel?: string;
		fileSearchText: string;
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

	type SortKey = 'printedAt' | 'actualDuration' | 'estimatedDuration' | 'filament' | 'cost';

	let prints = $state<Print[]>([]);
	let usages = $state<PrintFilamentUsage[]>([]);
	let spools = $state<Spool[]>([]);
	let printers = $state<Printer[]>([]);
	let imports = $state<PrintExternalImport[]>([]);
	let settingsRows = $state<PrintSettings[]>([]);
	let files = $state<PrintFile[]>([]);
	let objects = $state<PrintObject[]>([]);
	let printsLoaded = $state(false);
	let usagesLoaded = $state(false);
	let spoolsLoaded = $state(false);
	let printersLoaded = $state(false);
	let importsLoaded = $state(false);
	let settingsLoaded = $state(false);
	let filesLoaded = $state(false);
	let objectsLoaded = $state(false);

	let startDate = $state('');
	let endDate = $state('');
	let spoolIdFilter = $state('');
	let materialFilter = $state('');
	let statusFilter = $state<PrintStatus | ''>('');
	let printerFilter = $state('');
	let nozzleFilter = $state('');
	let layerHeightFilter = $state('');
	let queryFilter = $state('');
	let sortKey = $state<SortKey>('printedAt');
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

	$effect(() => {
		const subscription = liveQuery(() => listPrinters()).subscribe((rows) => {
			printers = rows;
			printersLoaded = true;
		});
		return () => subscription.unsubscribe();
	});

	$effect(() => {
		const subscription = liveQuery(() => listPrintExternalImports()).subscribe((rows) => {
			imports = rows;
			importsLoaded = true;
		});
		return () => subscription.unsubscribe();
	});

	$effect(() => {
		const subscription = liveQuery(() => listPrintSettings()).subscribe((rows) => {
			settingsRows = rows;
			settingsLoaded = true;
		});
		return () => subscription.unsubscribe();
	});

	$effect(() => {
		const subscription = liveQuery(() => listPrintFiles()).subscribe((rows) => {
			files = rows;
			filesLoaded = true;
		});
		return () => subscription.unsubscribe();
	});

	$effect(() => {
		const subscription = liveQuery(() => listPrintObjects()).subscribe((rows) => {
			objects = rows;
			objectsLoaded = true;
		});
		return () => subscription.unsubscribe();
	});

	let loading = $derived(
		!(
			printsLoaded &&
			usagesLoaded &&
			spoolsLoaded &&
			printersLoaded &&
			importsLoaded &&
			settingsLoaded &&
			filesLoaded &&
			objectsLoaded
		),
	);
	let spoolById = $derived(new Map(spools.map((spool) => [spool.id, spool])));
	let printerById = $derived(new Map(printers.map((printer) => [printer.id, printer])));
	let importByPrintId = $derived(new Map(imports.map((row) => [row.printId, row])));
	let settingsByPrintId = $derived(new Map(settingsRows.map((row) => [row.printId, row])));
	let filesByPrintId = $derived(groupByPrintId(files));
	let objectsByPrintId = $derived(groupByPrintId(objects));

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
			const printer = print.printerId ? printerById.get(print.printerId) : undefined;
			const settings = settingsByPrintId.get(print.id);
			const printFiles = filesByPrintId.get(print.id) ?? [];
			const printObjects = objectsByPrintId.get(print.id) ?? [];
			const externalImport = importByPrintId.get(print.id);
			const fileSearchText = [
				print.name,
				...printFiles.flatMap((file) => [
					file.displayName,
					file.fileName,
					file.displayPath,
					file.path,
				]),
				...printObjects.map((object) => object.name),
			]
				.filter(Boolean)
				.join(' ')
				.toLocaleLowerCase();

			return {
				...print,
				totalG: Number(totalG.toFixed(2)),
				totalCost: formatCostTotal(printUsages),
				spoolNames: enrichedUsages.map((usage) => usage.spool?.name ?? 'Unknown spool').join(', '),
				materials,
				printer,
				printerLabel: printerLabel(printer, settings),
				settings,
				files: printFiles,
				objects: printObjects,
				import: externalImport,
				sourceLabel: externalImport ? sourceLabel(externalImport.source) : undefined,
				nozzleLabel: settings?.nozzleDiameterMm ? `${settings.nozzleDiameterMm} mm` : undefined,
				layerHeightLabel: settings?.layerHeightMm ? `${settings.layerHeightMm} mm` : undefined,
				actualDurationLabel: formatDuration(print.timePrintingSec ?? print.elapsedSec),
				estimatedDurationLabel: formatDuration(print.estimatedPrintTimeSec),
				fileSearchText,
				usages: enrichedUsages,
			};
		}),
	);

	let printerOptions = $derived(
		[
			...new Map(
				historyRows
					.filter((row) => row.printerLabel)
					.map((row) => [row.printerLabel!, { value: row.printerLabel!, label: row.printerLabel! }]),
			).values(),
		].toSorted((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' })),
	);

	let nozzleOptions = $derived(
		[...new Set(historyRows.map((row) => row.nozzleLabel).filter((label) => label))]
			.toSorted((a, b) => a!.localeCompare(b!, undefined, { numeric: true }))
			.map((label) => ({ value: label!, label: label! })),
	);

	let layerHeightOptions = $derived(
		[...new Set(historyRows.map((row) => row.layerHeightLabel).filter((label) => label))]
			.toSorted((a, b) => a!.localeCompare(b!, undefined, { numeric: true }))
			.map((label) => ({ value: label!, label: label! })),
	);

	let filteredRows = $derived(
		historyRows
			.filter((row) => {
				const printDate = localDateKey(row.printedAt);
				const query = queryFilter.trim().toLocaleLowerCase();
				const matchesStart = !startDate || printDate >= startDate;
				const matchesEnd = !endDate || printDate <= endDate;
				const matchesStatus = !statusFilter || row.status === statusFilter;
				const matchesSpool =
					!spoolIdFilter || row.usages.some((usage) => usage.spoolId === spoolIdFilter);
				const matchesMaterial = !materialFilter || row.materials.includes(materialFilter);
				const matchesPrinter = !printerFilter || row.printerLabel === printerFilter;
				const matchesNozzle = !nozzleFilter || row.nozzleLabel === nozzleFilter;
				const matchesLayerHeight = !layerHeightFilter || row.layerHeightLabel === layerHeightFilter;
				const matchesQuery = !query || row.fileSearchText.includes(query);

				return (
					matchesStart &&
					matchesEnd &&
					matchesStatus &&
					matchesSpool &&
					matchesMaterial &&
					matchesPrinter &&
					matchesNozzle &&
					matchesLayerHeight &&
					matchesQuery
				);
			})
			.toSorted(compareRows),
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

	function groupByPrintId<T extends { printId: string }>(rows: T[]): Map<string, T[]> {
		const grouped = new Map<string, T[]>();
		for (const row of rows) {
			const current = grouped.get(row.printId) ?? [];
			current.push(row);
			grouped.set(row.printId, current);
		}
		return grouped;
	}

	function printerLabel(printer: Printer | undefined, settings: PrintSettings | undefined): string | undefined {
		if (!printer && !settings?.printerModelRaw) return undefined;
		return printer?.displayName ?? printer?.model ?? settings?.printerModelRaw ?? printer?.externalPrinterUuid;
	}

	function sourceLabel(source: PrintExternalImport['source']): string {
		return source === 'prusa_connect' ? 'Prusa Connect' : 'Manual';
	}

	function formatDateTime(value: string): string {
		return new Intl.DateTimeFormat('fr-FR', {
			dateStyle: 'medium',
			timeStyle: 'short',
		}).format(new Date(value));
	}

	function formatDuration(value: number | undefined): string | undefined {
		if (value === undefined) return undefined;
		const totalMinutes = Math.round(value / 60);
		const hours = Math.floor(totalMinutes / 60);
		const minutes = totalMinutes % 60;
		if (hours === 0) return `${minutes} min`;
		if (minutes === 0) return `${hours} h`;
		return `${hours} h ${minutes} min`;
	}

	function formatFileSize(value: number | undefined): string | undefined {
		if (value === undefined) return undefined;
		if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
		return `${(value / (1024 * 1024)).toFixed(1)} MB`;
	}

	function compareRows(a: HistoryRow, b: HistoryRow): number {
		switch (sortKey) {
			case 'actualDuration':
				return (b.timePrintingSec ?? b.elapsedSec ?? -1) - (a.timePrintingSec ?? a.elapsedSec ?? -1);
			case 'estimatedDuration':
				return (b.estimatedPrintTimeSec ?? -1) - (a.estimatedPrintTimeSec ?? -1);
			case 'filament':
				return b.totalG - a.totalG;
			case 'cost':
				return costSortValue(b) - costSortValue(a);
			case 'printedAt':
				return new Date(b.printedAt).getTime() - new Date(a.printedAt).getTime();
		}
	}

	function costSortValue(row: HistoryRow): number {
		return row.usages.reduce((sum, usage) => sum + usage.cost.minorUnits, 0);
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
		printerFilter = '';
		nozzleFilter = '';
		layerHeightFilter = '';
		queryFilter = '';
		sortKey = 'printedAt';
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
			<label class="grid gap-1.5 text-sm font-medium text-ink sm:col-span-2 lg:col-span-2" for="query-filter">
				<span>File or object</span>
				<input
					id="query-filter"
					class="h-9 rounded-md border border-line bg-panel px-3 text-sm text-ink shadow-sm"
					type="search"
					bind:value={queryFilter}
				/>
			</label>
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
			<label class="grid gap-1.5 text-sm font-medium text-ink" for="printer-filter">
				<span>Printer</span>
				<select
					id="printer-filter"
					class="h-9 rounded-md border border-line bg-panel px-3 text-sm text-ink shadow-sm"
					bind:value={printerFilter}
				>
					<option value="">All printers</option>
					{#each printerOptions as option}
						<option value={option.value}>{option.label}</option>
					{/each}
				</select>
			</label>
			<label class="grid gap-1.5 text-sm font-medium text-ink" for="nozzle-filter">
				<span>Nozzle</span>
				<select
					id="nozzle-filter"
					class="h-9 rounded-md border border-line bg-panel px-3 text-sm text-ink shadow-sm"
					bind:value={nozzleFilter}
				>
					<option value="">All nozzles</option>
					{#each nozzleOptions as option}
						<option value={option.value}>{option.label}</option>
					{/each}
				</select>
			</label>
			<label class="grid gap-1.5 text-sm font-medium text-ink" for="layer-height-filter">
				<span>Layer height</span>
				<select
					id="layer-height-filter"
					class="h-9 rounded-md border border-line bg-panel px-3 text-sm text-ink shadow-sm"
					bind:value={layerHeightFilter}
				>
					<option value="">All heights</option>
					{#each layerHeightOptions as option}
						<option value={option.value}>{option.label}</option>
					{/each}
				</select>
			</label>
			<label class="grid gap-1.5 text-sm font-medium text-ink" for="sort-key">
				<span>Sort</span>
				<select
					id="sort-key"
					class="h-9 rounded-md border border-line bg-panel px-3 text-sm text-ink shadow-sm"
					bind:value={sortKey}
				>
					<option value="printedAt">Newest first</option>
					<option value="actualDuration">Actual duration</option>
					<option value="estimatedDuration">Estimated duration</option>
					<option value="filament">Filament</option>
					<option value="cost">Cost</option>
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
		<div class="grid gap-6 xl:grid-cols-[minmax(0,1fr)_28rem]">
			<section class="overflow-hidden rounded-lg border border-line bg-panel">
				<div class="hidden grid-cols-[minmax(12rem,1fr)_8rem_8rem_8rem_9rem_7rem] gap-4 border-b border-line bg-panel-muted px-4 py-2 text-xs font-semibold uppercase text-ink-muted lg:grid">
					<span>Print</span>
					<span>Status</span>
					<span>Printer</span>
					<span>Timing</span>
					<span>Filament</span>
					<span class="text-right">Cost</span>
				</div>
				{#each filteredRows as print (print.id)}
					<button
						type="button"
						class={[
							'grid w-full gap-3 border-b border-line px-4 py-3 text-left last:border-b-0 hover:bg-panel-muted lg:grid-cols-[minmax(12rem,1fr)_8rem_8rem_8rem_9rem_7rem] lg:items-center',
							selectedPrint?.id === print.id ? 'bg-emerald-50' : 'bg-panel',
						]}
						onclick={() => (selectedPrintId = print.id)}
					>
						<div class="min-w-0">
							<p class="truncate text-sm font-semibold text-ink">{print.name}</p>
							<p class="truncate text-xs text-ink-muted">
								{formatDateTime(print.printedAt)}
								{#if print.sourceLabel}
									/ {print.sourceLabel}
								{/if}
							</p>
							{#if print.nozzleLabel || print.layerHeightLabel || print.settings?.supportMaterial || print.settings?.nozzleTemperatureC}
								<p class="mt-1 flex flex-wrap gap-1.5 text-xs text-ink-muted">
									{#if print.nozzleLabel}<span>{print.nozzleLabel}</span>{/if}
									{#if print.layerHeightLabel}<span>{print.layerHeightLabel}</span>{/if}
									{#if print.settings?.supportMaterial}<span>supports</span>{/if}
									{#if print.settings?.nozzleTemperatureC}<span>{print.settings.nozzleTemperatureC}°C</span>{/if}
								</p>
							{/if}
							{#if print.objects.length > 0}
								<p class="mt-1 truncate text-xs text-ink-muted">
									{print.objects.map((object) => object.name).join(', ')}
								</p>
							{/if}
						</div>
						<div>
							<StatusBadge status={print.status} />
						</div>
						<p class="truncate text-sm text-ink">{print.printerLabel ?? ''}</p>
						<div class="text-sm text-ink">
							{#if print.actualDurationLabel}
								<p class="font-medium">{print.actualDurationLabel}</p>
							{/if}
							{#if print.estimatedDurationLabel}
								<p class="text-xs text-ink-muted">est. {print.estimatedDurationLabel}</p>
							{/if}
						</div>
						<div>
							<p class="text-sm font-medium text-ink">{print.totalG} g</p>
							<p class="truncate text-xs text-ink-muted">{print.materials.join(', ')}</p>
						</div>
						<p class="text-sm font-semibold text-ink lg:text-right">{print.totalCost}</p>
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
						{#if selectedPrint.actualDurationLabel}
							<div class="rounded-md border border-line bg-panel-muted p-3">
								<p class="text-xs font-medium text-ink-muted">Actual</p>
								<p class="mt-1 text-lg font-semibold text-ink">{selectedPrint.actualDurationLabel}</p>
							</div>
						{/if}
						{#if selectedPrint.estimatedDurationLabel}
							<div class="rounded-md border border-line bg-panel-muted p-3">
								<p class="text-xs font-medium text-ink-muted">Estimated</p>
								<p class="mt-1 text-lg font-semibold text-ink">{selectedPrint.estimatedDurationLabel}</p>
							</div>
						{/if}
					</div>

					{#if selectedPrint.files.length > 0}
						<div class="mt-5 border-t border-line pt-4">
							<h3 class="text-sm font-semibold text-ink">File</h3>
							<div class="mt-2 grid gap-2">
								{#each selectedPrint.files as file (file.id)}
									<div class="rounded-md border border-line p-3">
										<p class="truncate text-sm font-semibold text-ink">
											{file.displayName ?? file.fileName ?? file.displayPath ?? file.path}
										</p>
										<div class="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-ink-muted">
											{#if file.fileType}<span>{file.fileType}</span>{/if}
											{#if formatFileSize(file.sizeBytes)}<span>{formatFileSize(file.sizeBytes)}</span>{/if}
											{#if file.uploadedAt}<span>uploaded {formatDateTime(file.uploadedAt)}</span>{/if}
										</div>
									</div>
								{/each}
							</div>
						</div>
					{/if}

					{#if selectedPrint.objects.length > 0}
						<div class="mt-5 border-t border-line pt-4">
							<h3 class="text-sm font-semibold text-ink">STL objects</h3>
							<div class="mt-2 flex flex-wrap gap-2">
								{#each selectedPrint.objects as object (object.id)}
									<span class="max-w-full truncate rounded-md border border-line bg-panel-muted px-2 py-1 text-xs font-medium text-ink">
										{object.name}{#if object.quantity && object.quantity > 1} ×{object.quantity}{/if}
									</span>
								{/each}
							</div>
						</div>
					{/if}

					{#if selectedPrint.settings}
						<div class="mt-5 border-t border-line pt-4">
							<h3 class="text-sm font-semibold text-ink">Slicer settings</h3>
							<dl class="mt-2 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
								{#if selectedPrint.nozzleLabel}
									<div><dt class="text-xs text-ink-muted">Nozzle</dt><dd class="font-medium text-ink">{selectedPrint.nozzleLabel}{#if selectedPrint.settings.nozzleHighFlow} high flow{/if}</dd></div>
								{/if}
								{#if selectedPrint.layerHeightLabel}
									<div><dt class="text-xs text-ink-muted">Layer</dt><dd class="font-medium text-ink">{selectedPrint.layerHeightLabel}</dd></div>
								{/if}
								{#if selectedPrint.settings.totalHeightMm !== undefined}
									<div><dt class="text-xs text-ink-muted">Height</dt><dd class="font-medium text-ink">{selectedPrint.settings.totalHeightMm} mm</dd></div>
								{/if}
								{#if selectedPrint.settings.fillDensityPercent !== undefined}
									<div><dt class="text-xs text-ink-muted">Infill</dt><dd class="font-medium text-ink">{selectedPrint.settings.fillDensityPercent}%</dd></div>
								{/if}
								{#if selectedPrint.settings.supportMaterial !== undefined}
									<div><dt class="text-xs text-ink-muted">Supports</dt><dd class="font-medium text-ink">{selectedPrint.settings.supportMaterial ? 'Yes' : 'No'}</dd></div>
								{/if}
								{#if selectedPrint.settings.nozzleTemperatureC !== undefined}
									<div><dt class="text-xs text-ink-muted">Nozzle temp</dt><dd class="font-medium text-ink">{selectedPrint.settings.nozzleTemperatureC}°C</dd></div>
								{/if}
								{#if selectedPrint.settings.bedTemperatureC !== undefined}
									<div><dt class="text-xs text-ink-muted">Bed temp</dt><dd class="font-medium text-ink">{selectedPrint.settings.bedTemperatureC}°C</dd></div>
								{/if}
								{#if selectedPrint.settings.connectPrintHeightRaw !== undefined}
									<div class="col-span-2"><dt class="text-xs text-ink-muted">Connect height raw</dt><dd class="font-medium text-ink">{selectedPrint.settings.connectPrintHeightRaw}</dd></div>
								{/if}
							</dl>
						</div>
					{/if}

					{#if selectedPrint.printerLabel || selectedPrint.sourceLabel}
						<div class="mt-5 border-t border-line pt-4">
							<h3 class="text-sm font-semibold text-ink">Import</h3>
							<dl class="mt-2 grid gap-2 text-sm">
								{#if selectedPrint.printerLabel}
									<div><dt class="text-xs text-ink-muted">Printer</dt><dd class="font-medium text-ink">{selectedPrint.printerLabel}</dd></div>
								{/if}
								{#if selectedPrint.sourceLabel}
									<div><dt class="text-xs text-ink-muted">Source</dt><dd class="font-medium text-ink">{selectedPrint.sourceLabel}</dd></div>
								{/if}
							</dl>
						</div>
					{/if}

					<div class="mt-5 grid gap-3 border-t border-line pt-4">
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
										{#if usage.usedLengthMm || usage.usedVolumeCm3 || usage.usedVolumeMm3}
											<p class="mt-1 text-xs text-ink-muted">
												{#if usage.usedLengthMm}{Math.round(usage.usedLengthMm / 1000)} m{/if}
												{#if usage.usedVolumeCm3} / {usage.usedVolumeCm3} cm³{/if}
												{#if usage.usedVolumeMm3} / {usage.usedVolumeMm3} mm³{/if}
							</p>
										{/if}
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
