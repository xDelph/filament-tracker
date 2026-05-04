<script lang="ts">
	import type { PrintStatus } from '$lib/domain';
	import { Plus, Trash2 } from 'lucide-svelte';

	import { Button, Modal, NumberInput, Select, TextInput } from '$lib/components/ui';
	import { PRINT_STATUS_OPTIONS, PrintPersistenceError, createPrintWithUsages } from '$lib/storage';

	type UsageRow = {
		id: string;
		spoolId: string;
		usedWeightG?: number;
		wasteWeightG?: number;
	};

	type Option = { value: string; label: string };

	const DEFAULT_UI_LABELS = {
		modalTitle: 'Add print',
		modalDescription: 'Save consumption and update spool weights.',
		printNameLabel: 'Print name',
		printDateLabel: 'Print date',
		statusLabel: 'Status',
		notesLabel: 'Notes',
		notesPlaceholder: 'Optional',
		filamentUsageHeading: 'Filament usage',
		addSpoolRowButton: 'Spool',
		spoolSelectLabel: 'Spool',
		spoolPlaceholder: 'Choose spool',
		usedLabel: 'Used',
		wasteLabel: 'Waste',
		removeRowAriaPrefix: 'Remove',
		genericSpoolName: 'Spool',
		cancelButton: 'Cancel',
		savePrintButton: 'Save print',
		savingPrintButton: 'Saving...',
		genericSaveError: 'Unable to save this print.',
	};

	type UILabels = typeof DEFAULT_UI_LABELS;

	let {
		open = false,
		idPrefix,
		spoolOptions,
		initialSpoolId = '',
		disableSubmit = false,
		uiLabels,
		onClose,
		onSaved,
	}: {
		open?: boolean;
		idPrefix: string;
		spoolOptions: Option[];
		initialSpoolId?: string;
		disableSubmit?: boolean;
		uiLabels?: Partial<UILabels>;
		onClose?: () => void;
		onSaved?: () => void;
	} = $props();

	let labels = $derived({ ...DEFAULT_UI_LABELS, ...uiLabels });

	let formId = $derived(`${idPrefix}-print-form`);

	let printFormError = $state('');
	let savingPrint = $state(false);
	let printName = $state('');
	let status = $state<PrintStatus>('completed');
	let printedAt = $state('');
	let notes = $state('');
	let usageRows = $state<UsageRow[]>([emptyUsageRow()]);

	function localDateTimeInputValue(date = new Date()): string {
		const offsetMs = date.getTimezoneOffset() * 60_000;
		return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
	}

	function emptyUsageRow(spoolId = ''): UsageRow {
		return {
			id: crypto.randomUUID(),
			spoolId,
			usedWeightG: undefined,
			wasteWeightG: 0,
		};
	}

	function resetForm(spoolId: string): void {
		printFormError = '';
		printName = '';
		status = 'completed';
		printedAt = localDateTimeInputValue();
		notes = '';
		usageRows = [emptyUsageRow(spoolId)];
	}

	$effect(() => {
		if (!open) return;
		resetForm(initialSpoolId);
	});

	function closeModal(): void {
		onClose?.();
	}

	function addUsageRow(): void {
		usageRows = [...usageRows, emptyUsageRow()];
	}

	function removeUsageRow(rowId: string): void {
		if (usageRows.length === 1) return;
		usageRows = usageRows.filter((row) => row.id !== rowId);
	}

	function selectedSpoolLabel(spoolId: string): string {
		const opt = spoolOptions.find((o) => o.value === spoolId);
		if (!opt) return labels.genericSpoolName;
		const cut = opt.label.lastIndexOf(' (');
		return cut === -1 ? opt.label : opt.label.slice(0, cut);
	}

	async function handlePrintSubmit(event: SubmitEvent): Promise<void> {
		event.preventDefault();
		printFormError = '';
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

			onSaved?.();
			closeModal();
		} catch (error) {
			if (error instanceof PrintPersistenceError) {
				printFormError = error.message;
			} else if (error instanceof Error) {
				printFormError = error.message;
			} else {
				printFormError = labels.genericSaveError;
			}
		} finally {
			savingPrint = false;
		}
	}
</script>

<Modal open={open} title={labels.modalTitle} description={labels.modalDescription} onClose={closeModal}>
	<form id={formId} class="grid gap-4" onsubmit={handlePrintSubmit}>
		{#if printFormError}
			<p class="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-danger">
				{printFormError}
			</p>
		{/if}

		<div class="grid gap-3 sm:grid-cols-2">
			<TextInput id={`${idPrefix}-print-name`} label={labels.printNameLabel} bind:value={printName} required />
			<label class="grid gap-1.5 text-sm font-medium text-ink" for={`${idPrefix}-printed-at`}>
				<span>{labels.printDateLabel}</span>
				<input
					id={`${idPrefix}-printed-at`}
					class="h-9 rounded-md border border-line bg-panel px-3 text-sm text-ink shadow-sm"
					type="datetime-local"
					bind:value={printedAt}
					required
				/>
			</label>
			<Select
				id={`${idPrefix}-print-status`}
				label={labels.statusLabel}
				bind:value={status}
				options={PRINT_STATUS_OPTIONS}
				required
			/>
			<TextInput
				id={`${idPrefix}-print-notes`}
				label={labels.notesLabel}
				bind:value={notes}
				placeholder={labels.notesPlaceholder}
			/>
		</div>

		<div class="grid gap-3">
			<div class="flex items-center justify-between gap-3">
				<h3 class="text-sm font-semibold text-ink">{labels.filamentUsageHeading}</h3>
				<Button variant="secondary" size="sm" type="button" onclick={addUsageRow}>
					<Plus size={16} />
					{labels.addSpoolRowButton}
				</Button>
			</div>

			{#each usageRows as row (row.id)}
				<div
					class="grid gap-3 rounded-lg border border-line bg-panel-muted p-3 sm:grid-cols-[1fr_8rem_8rem_auto] sm:items-end"
				>
					<Select
						id={`${idPrefix}-spool-${row.id}`}
						label={labels.spoolSelectLabel}
						bind:value={row.spoolId}
						options={spoolOptions}
						placeholder={labels.spoolPlaceholder}
						required
					/>
					<NumberInput
						id={`${idPrefix}-used-${row.id}`}
						label={labels.usedLabel}
						bind:value={row.usedWeightG}
						min={0.01}
						step="any"
						unit="g"
						required
					/>
					<NumberInput
						id={`${idPrefix}-waste-${row.id}`}
						label={labels.wasteLabel}
						bind:value={row.wasteWeightG}
						min={0}
						step="any"
						unit="g"
					/>
					<Button
						variant="ghost"
						size="sm"
						type="button"
						disabled={usageRows.length === 1}
						onclick={() => removeUsageRow(row.id)}
					>
						<Trash2 size={16} />
						<span class="sr-only">{labels.removeRowAriaPrefix} {selectedSpoolLabel(row.spoolId)}</span>
					</Button>
				</div>
			{/each}
		</div>
	</form>
	{#snippet footer()}
		<Button variant="ghost" type="button" onclick={closeModal}>{labels.cancelButton}</Button>
		<Button type="submit" form={formId} disabled={savingPrint || disableSubmit}>
			{savingPrint ? labels.savingPrintButton : labels.savePrintButton}
		</Button>
	{/snippet}
</Modal>
