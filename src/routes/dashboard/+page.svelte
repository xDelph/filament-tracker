<script lang="ts">
	import { liveQuery } from 'dexie';
	import { Plus } from 'lucide-svelte';
	import { Button, Modal, SpoolForm, SpoolList } from '$lib/components/ui';
	import type { Spool } from '$lib/domain';
	import { formatMoneyMinor, remainingValueEstimateMinor } from '$lib/domain';
	import { archiveSpool, listActiveInventorySpools, markSpoolEmpty } from '$lib/storage';

	let spools = $state<Spool[]>([]);

	$effect(() => {
		const subscription = liveQuery(() => listActiveInventorySpools()).subscribe((rows) => {
			spools = rows;
		});
		return () => subscription.unsubscribe();
	});

	let modalOpen = $state(false);
	let modalMode = $state<'create' | 'edit'>('create');
	let editingSpool = $state<Spool | null>(null);
	let modalNonce = $state(0);

	const formId = 'dashboard-spool-form';

	function openCreate() {
		modalMode = 'create';
		editingSpool = null;
		modalNonce += 1;
		modalOpen = true;
	}

	function openEdit(spool: Spool) {
		modalMode = 'edit';
		editingSpool = spool;
		modalNonce += 1;
		modalOpen = true;
	}

	function closeModal() {
		modalOpen = false;
		editingSpool = null;
	}

	function materialLabel(s: Spool): string {
		return s.material.kind === 'catalog' ? s.material.code : s.material.label;
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
</script>

<div class="grid gap-6">
	<header class="flex flex-wrap items-center justify-between gap-3">
		<div>
			<h1 class="text-2xl font-semibold tracking-tight">Dashboard</h1>
			<p class="mt-2 text-zinc-600">
				Active spools (stock OK or low). Stored locally in IndexedDB via Dexie.
			</p>
		</div>
		<Button onclick={openCreate}><Plus size={16} /> Add spool</Button>
	</header>

	<SpoolList spools={spools.map(toSummary)} />

	<Modal
		open={modalOpen}
		title={modalMode === 'create' ? 'Add spool' : 'Edit spool'}
		description="Weights, price, material, color, and status are validated before save."
		onClose={closeModal}
	>
		{#key modalNonce}
			<SpoolForm {formId} mode={modalMode} spool={editingSpool} onsaved={closeModal} />
		{/key}
		{#snippet footer()}
			<Button variant="secondary" onclick={closeModal}>Cancel</Button>
			<Button type="submit" form={formId}>Save spool</Button>
		{/snippet}
	</Modal>
</div>
