<script lang="ts">
	import { liveQuery } from 'dexie';
	import { ZodError } from 'zod';
	import { ArrowLeft, Plus } from 'lucide-svelte';

	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { Button, Modal, AddPrintModal, NumberInput, SpoolForm, TextInput } from '$lib/components/ui';
	import { DISPLAY_LOCALE } from '$lib/display';
	import {
		consumptionTotalGrams,
		formatMoneyMinor,
		remainingPercentOfInitial,
		remainingValueEstimateMinor,
		spoolCostPerGramMinorUnits,
		type Spool,
		type SpoolAdjustment,
	} from '$lib/domain';
	import {
		SpoolAdjustmentPersistenceError,
		type SpoolUsageWithPrint,
		archiveSpool,
		createSpoolAdjustment,
		db,
		listPrintableSpools,
		loadSpoolAuditData,
		markSpoolEmpty,
	} from '$lib/storage';

	type AuditBundle = {
		spool: Spool | undefined;
		usages: SpoolUsageWithPrint[];
		adjustments: SpoolAdjustment[];
	};

	let audit = $state<AuditBundle>({ spool: undefined, usages: [], adjustments: [] });
	let printableSpools = $state<Spool[]>([]);

	let spoolId = $derived(page.params.id ?? '');

	let spoolModalOpen = $state(false);
	let spoolModalNonce = $state(0);
	const spoolFormId = 'spool-detail-form';

	let printModalOpen = $state(false);
	let printModalInitialSpoolId = $state('');

	let adjustModalOpen = $state(false);
	let savingAdjust = $state(false);
	let adjustError = $state('');
	let adjustNewRemainingG = $state<number | undefined>(undefined);
	let adjustNote = $state('');

	let bannerMessage = $state('');

	$effect(() => {
		void spoolId;
		bannerMessage = '';
	});

	$effect(() => {
		if (!bannerMessage) return;
		const timer = setTimeout(() => {
			bannerMessage = '';
		}, 4500);
		return () => clearTimeout(timer);
	});

	$effect(() => {
		const id = spoolId;
		const subscription = liveQuery(() => loadSpoolAuditData(id, db)).subscribe((data) => {
			audit = data;
		});
		return () => subscription.unsubscribe();
	});

	$effect(() => {
		const subscription = liveQuery(() => listPrintableSpools()).subscribe((rows) => {
			printableSpools = rows;
		});
		return () => subscription.unsubscribe();
	});

	let printSpoolOptions = $derived.by(() => {
		const map = new Map(printableSpools.map((s) => [s.id, s]));
		const s = audit.spool;
		if (s && (s.status === 'active' || s.status === 'low')) {
			map.set(s.id, s);
		}
		return [...map.values()]
			.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
			.map((sp) => ({
				value: sp.id,
				label: `${sp.name} (${sp.remainingWeightG} g)`,
			}));
	});

	let usedWeightG = $derived.by(() => {
		const s = audit.spool;
		if (!s) return 0;
		return Number(Math.max(0, s.initialWeightG - s.remainingWeightG).toFixed(2));
	});

	let remainingPercent = $derived.by(() => {
		const s = audit.spool;
		if (!s) return Number.NaN;
		return remainingPercentOfInitial(s.remainingWeightG, s.initialWeightG);
	});

	let costPerGramLabel = $derived.by(() => {
		const s = audit.spool;
		if (!s) return '—';
		const rate = spoolCostPerGramMinorUnits(s);
		if (!Number.isFinite(rate)) return '—';
		const majorPerGram = rate / 100;
		return new Intl.NumberFormat(DISPLAY_LOCALE, {
			style: 'currency',
			currency: s.purchasePrice.currency,
			minimumFractionDigits: 3,
			maximumFractionDigits: 5,
		}).format(majorPerGram);
	});

	let canPrint = $derived(
		audit.spool ? audit.spool.status === 'active' || audit.spool.status === 'low' : false,
	);

	function formatTs(iso: string): string {
		return new Date(iso).toLocaleString(DISPLAY_LOCALE, {
			dateStyle: 'short',
			timeStyle: 'short',
		});
	}

	function materialLabel(s: Spool): string {
		return s.material.kind === 'catalog' ? s.material.code : s.material.label;
	}

	function openPrintModal(preselectSpoolId = ''): void {
		printModalInitialSpoolId = preselectSpoolId || audit.spool?.id || '';
		printModalOpen = true;
	}

	function closePrintModal(): void {
		printModalOpen = false;
	}

	function openAdjustModal(): void {
		adjustError = '';
		adjustNote = '';
		adjustNewRemainingG = audit.spool?.remainingWeightG;
		adjustModalOpen = true;
	}

	function closeAdjustModal(): void {
		adjustModalOpen = false;
	}

	function closeSpoolModal(): void {
		spoolModalOpen = false;
	}

	async function handleAdjustSubmit(event: SubmitEvent): Promise<void> {
		event.preventDefault();
		adjustError = '';
		savingAdjust = true;

		try {
			if (!audit.spool) throw new Error('Missing spool.');
			await createSpoolAdjustment({
				spoolId: audit.spool.id,
				newRemainingWeightG: Number(adjustNewRemainingG),
				note: adjustNote.trim(),
			});
			bannerMessage = 'Manual adjustment recorded.';
			closeAdjustModal();
		} catch (error) {
			if (error instanceof SpoolAdjustmentPersistenceError) {
				adjustError = error.message;
			} else if (error instanceof ZodError) {
				adjustError = error.issues.map((e) => e.message).join(' ');
			} else if (error instanceof Error) {
				adjustError = error.message;
			} else {
				adjustError = 'Unable to save adjustment.';
			}
		} finally {
			savingAdjust = false;
		}
	}
</script>

<div class="grid gap-8">
	{#if bannerMessage}
		<p
			class="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-success"
		>
			{bannerMessage}
		</p>
	{/if}

	{#if !audit.spool}
		<div class="rounded-lg border border-dashed border-line bg-panel p-8 text-center">
			<p class="text-sm font-medium text-ink">Spool not found.</p>
			<p class="mt-2 text-sm text-ink-muted">It may have been removed or the link is invalid.</p>
			<a
				href={resolve('/dashboard')}
				class="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-brand hover:underline"
			>
				<ArrowLeft size={16} /> Back to dashboard
			</a>
		</div>
	{:else}
		{@const s = audit.spool}
		<header class="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
			<div class="min-w-0">
				<a
					href={resolve('/dashboard')}
					class="inline-flex items-center gap-1 text-sm font-medium text-ink-muted hover:text-ink"
				>
					<ArrowLeft size={16} /> Dashboard
				</a>
				<h1 class="mt-2 truncate text-2xl font-semibold tracking-tight text-ink">{s.name}</h1>
				<p class="mt-1 text-sm text-ink-muted">{materialLabel(s)} · {s.colorName}</p>
			</div>
			<div class="flex flex-wrap gap-2">
				<Button variant="secondary" disabled={!canPrint} onclick={() => openPrintModal(s.id)}>
					<Plus size={16} /> Add print
				</Button>
				<Button
					variant="secondary"
					onclick={() => {
						spoolModalNonce += 1;
						spoolModalOpen = true;
					}}
				>
					Edit
				</Button>
				<Button variant="secondary" onclick={openAdjustModal}>Adjust weight</Button>
				<Button
					variant="secondary"
					onclick={async () => {
						if (!confirm(`Mark “${s.name}” empty (0 g remaining)?`)) return;
						await markSpoolEmpty(s.id);
						bannerMessage = 'Marked empty.';
					}}
				>
					Mark empty
				</Button>
				<Button
					variant="danger"
					onclick={async () => {
						if (!confirm(`Archive “${s.name}”? It stays in history but leaves active inventory.`)) return;
						await archiveSpool(s.id);
						bannerMessage = 'Archived.';
					}}
				>
					Archive
				</Button>
			</div>
		</header>

		<section class="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
			<div class="grid gap-6">
				<div class="rounded-lg border border-line bg-panel p-5 shadow-sm">
					<h2 class="text-base font-semibold text-ink">Inventory</h2>
					<dl class="mt-4 grid gap-4 sm:grid-cols-2">
						<div>
							<dt class="text-xs font-medium uppercase tracking-wide text-ink-muted">Remaining</dt>
							<dd class="mt-1 text-lg font-semibold text-ink">{s.remainingWeightG} g</dd>
						</div>
						<div>
							<dt class="text-xs font-medium uppercase tracking-wide text-ink-muted">Used (est.)</dt>
							<dd class="mt-1">
								<p class="text-lg font-semibold text-ink">{usedWeightG} g</p>
								<p class="mt-0.5 text-xs text-ink-muted">
									Initial minus current remainder; not summed from print lines.
								</p>
							</dd>
						</div>
						<div>
							<dt class="text-xs font-medium uppercase tracking-wide text-ink-muted">
								Remaining %
							</dt>
							<dd class="mt-1 text-lg font-semibold text-ink">
								{#if Number.isFinite(remainingPercent)}
									{remainingPercent.toFixed(1)}%
								{:else}
									—
								{/if}
							</dd>
						</div>
						<div>
							<dt class="text-xs font-medium uppercase tracking-wide text-ink-muted">
								Cost / gram (avg.)
							</dt>
							<dd class="mt-1 text-lg font-semibold text-ink">{costPerGramLabel}</dd>
						</div>
						<div>
							<dt class="text-xs font-medium uppercase tracking-wide text-ink-muted">
								Residual value (est.)
							</dt>
							<dd class="mt-1 text-lg font-semibold text-ink">
								{formatMoneyMinor(remainingValueEstimateMinor(s))}
							</dd>
						</div>
						<div>
							<dt class="text-xs font-medium uppercase tracking-wide text-ink-muted">Status</dt>
							<dd class="mt-1 text-lg font-semibold capitalize text-ink">{s.status}</dd>
						</div>
					</dl>
				</div>

				<div class="rounded-lg border border-line bg-panel p-5 shadow-sm">
					<h2 class="text-base font-semibold text-ink">Print history</h2>
					<div class="mt-4 divide-y divide-line rounded-md border border-line">
						{#each audit.usages as row}
							{@const total = consumptionTotalGrams(row.usage)}
							<div class="grid gap-2 px-4 py-3 sm:grid-cols-[1fr_auto_auto] sm:items-center">
								<div class="min-w-0">
									<p class="truncate text-sm font-semibold text-ink">
										{row.print?.name ?? 'Unknown print'}
									</p>
									<p class="truncate text-xs text-ink-muted">
										{row.print ? formatTs(row.print.printedAt) : formatTs(row.usage.createdAt)} · {row.print?.status ?? '—'}
									</p>
								</div>
								<p class="text-sm font-medium text-ink">{Number(total.toFixed(2))} g</p>
								<p class="text-sm font-semibold text-ink">
									{formatMoneyMinor(row.usage.cost)}
								</p>
							</div>
						{:else}
							<p class="p-6 text-sm text-ink-muted">No prints recorded for this spool.</p>
						{/each}
					</div>
				</div>

				<div class="rounded-lg border border-line bg-panel p-5 shadow-sm">
					<h2 class="text-base font-semibold text-ink">Manual adjustments</h2>
					<div class="mt-4 divide-y divide-line rounded-md border border-line">
						{#each audit.adjustments as adj}
							{@const delta = adj.newRemainingWeightG - adj.previousRemainingWeightG}
							<div class="grid gap-2 px-4 py-3">
								<div class="flex flex-wrap items-baseline justify-between gap-2">
									<p class="text-sm font-semibold text-ink">
										{adj.previousRemainingWeightG} g → {adj.newRemainingWeightG} g
										<span class="font-normal text-ink-muted">
											({delta > 0 ? '+' : ''}{Number(delta.toFixed(2))} g)
										</span>
									</p>
									<p class="text-xs text-ink-muted">{formatTs(adj.createdAt)}</p>
								</div>
								<p class="text-sm text-ink-muted">{adj.note}</p>
							</div>
						{:else}
							<p class="p-6 text-sm text-ink-muted">No manual adjustments yet.</p>
						{/each}
					</div>
				</div>
			</div>

			<div class="rounded-lg border border-line bg-panel p-5 shadow-sm lg:self-start">
				<h2 class="text-base font-semibold text-ink">Metadata</h2>
				<dl class="mt-4 grid gap-3 text-sm">
					<div class="flex justify-between gap-4 border-b border-line pb-3">
						<dt class="text-ink-muted">Material</dt>
						<dd class="text-right font-medium text-ink">{materialLabel(s)}</dd>
					</div>
					{#if s.brand}
						<div class="flex justify-between gap-4 border-b border-line pb-3">
							<dt class="text-ink-muted">Brand</dt>
							<dd class="text-right font-medium text-ink">{s.brand}</dd>
						</div>
					{/if}
					<div class="flex justify-between gap-4 border-b border-line pb-3">
						<dt class="text-ink-muted">Diameter</dt>
						<dd class="text-right font-medium text-ink">{s.diameterMm} mm</dd>
					</div>
					{#if s.densityGCm3 !== undefined}
						<div class="flex justify-between gap-4 border-b border-line pb-3">
							<dt class="text-ink-muted">Density</dt>
							<dd class="text-right font-medium text-ink">{s.densityGCm3} g/cm³</dd>
						</div>
					{/if}
					<div class="flex justify-between gap-4 border-b border-line pb-3">
						<dt class="text-ink-muted">Initial weight</dt>
						<dd class="text-right font-medium text-ink">{s.initialWeightG} g</dd>
					</div>
					<div class="flex justify-between gap-4 border-b border-line pb-3">
						<dt class="text-ink-muted">Purchase price</dt>
						<dd class="text-right font-medium text-ink">{formatMoneyMinor(s.purchasePrice)}</dd>
					</div>
					{#if s.purchaseDate}
						<div class="flex justify-between gap-4 border-b border-line pb-3">
							<dt class="text-ink-muted">Purchase date</dt>
							<dd class="text-right font-medium text-ink">{formatTs(s.purchaseDate)}</dd>
						</div>
					{/if}
					{#if s.supplier}
						<div class="flex justify-between gap-4 border-b border-line pb-3">
							<dt class="text-ink-muted">Supplier</dt>
							<dd class="text-right font-medium text-ink">{s.supplier}</dd>
						</div>
					{/if}
					<div class="flex justify-between gap-4 border-b border-line pb-3">
						<dt class="text-ink-muted">Created</dt>
						<dd class="text-right font-medium text-ink">{formatTs(s.createdAt)}</dd>
					</div>
					<div class="flex justify-between gap-4 pb-1">
						<dt class="text-ink-muted">Updated</dt>
						<dd class="text-right font-medium text-ink">{formatTs(s.updatedAt)}</dd>
					</div>
					{#if s.notes}
						<div class="border-t border-line pt-3">
							<dt class="text-ink-muted">Notes</dt>
							<dd class="mt-2 whitespace-pre-wrap text-ink">{s.notes}</dd>
						</div>
					{/if}
				</dl>
			</div>
		</section>

		<Modal
			open={spoolModalOpen}
			title="Edit spool"
			description="Weights, price, material, color, and status are validated before save."
			onClose={closeSpoolModal}
		>
			{#key spoolModalNonce}
				<SpoolForm
					formId={spoolFormId}
					mode="edit"
					spool={s}
					liveRemainingWeightG={s.remainingWeightG}
					onsaved={closeSpoolModal}
				/>
			{/key}
			{#snippet footer()}
				<Button variant="secondary" onclick={closeSpoolModal}>Cancel</Button>
				<Button type="submit" form={spoolFormId}>Save spool</Button>
			{/snippet}
		</Modal>

		<AddPrintModal
			idPrefix="spool-detail-print"
			open={printModalOpen}
			spoolOptions={printSpoolOptions}
			initialSpoolId={printModalInitialSpoolId}
			disableSubmit={printSpoolOptions.length === 0}
			onClose={closePrintModal}
			onSaved={() => {
				bannerMessage = 'Print saved and inventory updated.';
			}}
		/>

		<Modal
			open={adjustModalOpen}
			title="Adjust remaining weight"
			description="Records an audited correction; previous prints stay unchanged."
			onClose={closeAdjustModal}
		>
			<form id="spool-adjust-form" class="grid gap-4" onsubmit={handleAdjustSubmit}>
				{#if adjustError}
					<p
						class="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-danger"
					>
						{adjustError}
					</p>
				{/if}
				<NumberInput
					id="adjust-new-remaining"
					label="New remaining (g)"
					bind:value={adjustNewRemainingG}
					min={0}
					max={s.initialWeightG}
					step="any"
					unit="g"
					required
				/>
				<TextInput id="adjust-note" label="Reason / note" bind:value={adjustNote} required />
			</form>
			{#snippet footer()}
				<Button variant="secondary" onclick={closeAdjustModal}>Cancel</Button>
				<Button type="submit" form="spool-adjust-form" disabled={savingAdjust}>
					{savingAdjust ? 'Saving...' : 'Save adjustment'}
				</Button>
			{/snippet}
		</Modal>
	{/if}
</div>
