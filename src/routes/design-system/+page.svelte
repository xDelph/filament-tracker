<script lang="ts">
	import { Archive, Edit3, Plus } from 'lucide-svelte';
	import {
		Button,
		ColorSwatch,
		IconButton,
		Modal,
		NumberInput,
		Select,
		SpoolList,
		StatusBadge,
		TextInput
	} from '$lib/components/ui';

	const materialOptions = [
		{ label: 'PLA', value: 'pla' },
		{ label: 'PETG', value: 'petg' },
		{ label: 'ABS', value: 'abs' },
		{ label: 'TPU', value: 'tpu' }
	];

	const spools = [
		{
			name: 'Matte Graphite',
			brand: 'Prusament',
			material: 'PLA',
			colorName: 'Graphite',
			colorHex: '#343942',
			remainingWeightG: 742,
			initialWeightG: 1000,
			remainingValue: '18.55 EUR',
			status: 'active' as const
		},
		{
			name: 'Signal Orange',
			brand: 'Polymaker',
			material: 'PETG',
			colorName: 'Orange',
			colorHex: '#f97316',
			remainingWeightG: 118,
			initialWeightG: 1000,
			remainingValue: '3.42 EUR',
			status: 'low' as const
		},
		{
			name: 'Support White',
			material: 'PLA',
			colorName: 'White',
			colorHex: '#f8fafc',
			remainingWeightG: 0,
			initialWeightG: 750,
			status: 'empty' as const
		}
	];

	let modalOpen = $state(false);
</script>

<div class="grid gap-6">
	<header class="flex flex-wrap items-center justify-between gap-3">
		<div>
			<h1 class="text-xl font-semibold text-ink">UI Kit</h1>
			<p class="mt-1 text-sm text-ink-muted">Reusable components for dense inventory workflows.</p>
		</div>
		<div class="flex items-center gap-2">
			<IconButton label="Edit selected spool" icon={Edit3} />
			<IconButton label="Archive selected spool" icon={Archive} variant="ghost" />
			<Button onclick={() => (modalOpen = true)}><Plus size={16} /> Add spool</Button>
		</div>
	</header>

	<section class="grid gap-4 rounded-lg border border-line bg-panel p-4 shadow-sm">
		<div class="grid gap-3 md:grid-cols-4">
			<TextInput id="spool-name" label="Name" placeholder="Matte Graphite" />
			<Select id="material" label="Material" placeholder="Choose material" options={materialOptions} />
			<NumberInput id="remaining" label="Remaining" unit="g" min={0} placeholder="1000" />
			<NumberInput id="price" label="Price" unit="EUR" min={0} step={0.01} placeholder="24.90" />
		</div>
		<div class="flex flex-wrap items-center gap-2">
			<StatusBadge status="active" />
			<StatusBadge status="low" label="low stock" />
			<StatusBadge status="empty" />
			<StatusBadge status="archived" />
			<ColorSwatch color="#126b5c" label="Sample green filament" size="lg" />
		</div>
	</section>

	<SpoolList {spools} />

	<Modal
		open={modalOpen}
		title="Add spool"
		description="Reusable modal shell for form workflows."
		onClose={() => (modalOpen = false)}
	>
		<div class="grid gap-3 sm:grid-cols-2">
			<TextInput id="modal-name" label="Name" placeholder="Translucent PETG" />
			<NumberInput id="modal-weight" label="Initial weight" unit="g" min={0} placeholder="1000" />
		</div>
		{#snippet footer()}
			<Button variant="secondary" onclick={() => (modalOpen = false)}>Cancel</Button>
			<Button>Save spool</Button>
		{/snippet}
	</Modal>
</div>
