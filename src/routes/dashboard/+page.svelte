<script lang="ts">
	import { liveQuery } from 'dexie';
	import { Plus, Trash2 } from 'lucide-svelte';

	import { Button, Modal, NumberInput, Select, SpoolForm, SpoolList, TextInput } from '$lib/components/ui';
	import type { Print, PrintFilamentUsage, PrintStatus, Spool } from '$lib/domain';
	import { formatMoneyMinor, remainingValueEstimateMinor } from '$lib/domain';
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

	let spoolModalOpen = $state(false);
	let spoolModalMode = $state<'create' | 'edit'>('create');
	let editingSpoolId = $state<string | null>(null);
	/** Snapshot when opening edit so the form still mounts if the row drops out of the filtered list briefly. */
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

	function toSummary(s: Spool) {
		const remainingMinor = remainingValueEstimateMinor(s);
		return {
			id: s.id,
			name: s.name,
			material: materialLabel(s),
			brand: s.brand,
			colorName: s.colorName,
			colorHex: s.colorHex,
			remainingWeightG: s.remainingWeightG,
			initialWeightG: s.initialWeightG,
			remainingValue: formatMoneyMinor(remainingMinor),
			status: s.status,
			onPrint: () => openPrintModal(s.id),
			onEdit: () => openEdit(s),
			onArchive: async () => {
				if (!confirm(`Archive “${s.name}”? It stays in history but leaves this list.`)) return;
				await archiveSpool(s.id);
			},
			onMarkEmpty: async () => {
				if (!confirm(`Mark “${s.name}” empty (0 g remaining)?`)) return;
				await markSpoolEmpty(s.id);
			},
		};
	}

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

			successMessage = 'Print saved and spool inventory updated.';
			closePrintModal();
		} catch (error) {
			if (error instanceof PrintPersistenceError) {
				printFormError = error.message;
			} else if (error instanceof Error) {
				printFormError = error.message;
			} else {
				printFormError = 'Unable to save this print.';
			}
		} finally {
			savingPrint = false;
		}
	}
</script>

<div class="grid gap-6">
	<header class="flex flex-wrap items-center justify-between gap-3">
		<div>
			<h1 class="text-2xl font-semibold tracking-tight">Dashboard</h1>
			<p class="mt-2 text-zinc-600">
				Active spools (stock OK or low). Stored locally in IndexedDB via Dexie.
			</p>
		</div>
		<div class="flex flex-wrap gap-2">
			<Button variant="secondary" onclick={() => openPrintModal()} disabled={spools.length === 0}>
				<Plus size={16} />
				Add print
			</Button>
			<Button onclick={openCreate}><Plus size={16} /> Add spool</Button>
		</div>
	</header>

	{#if successMessage}
		<p class="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-success">
			{successMessage}
		</p>
	{/if}

	<SpoolList spools={spools.map(toSummary)} />

	<section>
		<div class="mb-3 flex items-center justify-between gap-3">
			<h2 class="text-base font-semibold text-ink">Recent prints</h2>
			<p class="text-sm text-ink-muted">{prints.length} saved</p>
		</div>
		<div class="overflow-hidden rounded-lg border border-line bg-panel">
			{#each recentPrints as print}
				<div class="grid gap-2 border-b border-line px-4 py-3 last:border-b-0 sm:grid-cols-[1fr_auto_auto] sm:items-center">
					<div class="min-w-0">
						<p class="truncate text-sm font-semibold text-ink">{print.name}</p>
						<p class="truncate text-xs text-ink-muted">{print.spoolNames || 'No spool'} / {print.status}</p>
					</div>
					<p class="text-sm font-medium text-ink">{print.totalG} g</p>
					<p class="text-sm font-semibold text-ink">{print.totalCost}</p>
				</div>
			{:else}
				<p class="p-6 text-sm text-ink-muted">No prints saved yet.</p>
			{/each}
		</div>
	</section>

	<Modal
		open={spoolModalOpen}
		title={spoolModalMode === 'create' ? 'Add spool' : 'Edit spool'}
		description="Weights, price, material, color, and status are validated before save."
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
			<Button variant="secondary" onclick={closeSpoolModal}>Cancel</Button>
			<Button type="submit" form={spoolFormId}>Save spool</Button>
		{/snippet}
	</Modal>

	<Modal
		open={printModalOpen}
		title="Add print"
		description="Save consumption and update spool weights."
		onClose={closePrintModal}
	>
		<form id={printFormId} class="grid gap-4" onsubmit={handlePrintSubmit}>
			{#if printFormError}
				<p class="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-danger">
					{printFormError}
				</p>
			{/if}

			<div class="grid gap-3 sm:grid-cols-2">
				<TextInput id="print-name" label="Print name" bind:value={printName} required />
				<label class="grid gap-1.5 text-sm font-medium text-ink" for="printed-at">
					<span>Print date</span>
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
					label="Status"
					bind:value={status}
					options={PRINT_STATUS_OPTIONS}
					required
				/>
				<TextInput id="print-notes" label="Notes" bind:value={notes} placeholder="Optional" />
			</div>

			<div class="grid gap-3">
				<div class="flex items-center justify-between gap-3">
					<h3 class="text-sm font-semibold text-ink">Filament usage</h3>
					<Button variant="secondary" size="sm" onclick={addUsageRow}>
						<Plus size={16} />
						Spool
					</Button>
				</div>

				{#each usageRows as row (row.id)}
					<div class="grid gap-3 rounded-lg border border-line bg-panel-muted p-3 sm:grid-cols-[1fr_8rem_8rem_auto] sm:items-end">
						<Select
							id={`spool-${row.id}`}
							label="Spool"
							bind:value={row.spoolId}
							options={spoolOptions}
							placeholder="Choose spool"
							required
						/>
						<NumberInput
							id={`used-${row.id}`}
							label="Used"
							bind:value={row.usedWeightG}
							min={0.01}
							step="any"
							unit="g"
							required
						/>
						<NumberInput
							id={`waste-${row.id}`}
							label="Waste"
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
							<span class="sr-only">Remove {selectedSpoolName(row.spoolId)}</span>
						</Button>
					</div>
				{/each}
			</div>
		</form>
		{#snippet footer()}
			<Button variant="ghost" onclick={closePrintModal}>Cancel</Button>
			<Button type="submit" form={printFormId} disabled={savingPrint || spools.length === 0}>
				{savingPrint ? 'Saving...' : 'Save print'}
			</Button>
		{/snippet}
	</Modal>
</div>
