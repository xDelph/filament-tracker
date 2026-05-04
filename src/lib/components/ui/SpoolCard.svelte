<script lang="ts">
  import { Plus } from 'lucide-svelte';
  import Button from './Button.svelte';
  import ColorSwatch from './ColorSwatch.svelte';
  import StatusBadge from './StatusBadge.svelte';

  type SpoolStatus = 'active' | 'low' | 'empty' | 'archived';

  type SpoolSummary = {
    id?: string;
    name: string;
    material: string;
    brand?: string;
    colorName: string;
    colorHex?: string;
    remainingWeightG: number;
    initialWeightG: number;
    remainingValue?: string;
    status: SpoolStatus;
    onEdit?: () => void;
    onArchive?: () => void;
    onMarkEmpty?: () => void;
  };

  let {
    spool,
    compact = false,
    class: className = ''
  }: {
    spool: SpoolSummary;
    compact?: boolean;
    class?: string;
  } = $props();

  let remainingPercent = $derived(
    spool.initialWeightG > 0
      ? Math.max(0, Math.min(100, Math.round((spool.remainingWeightG / spool.initialWeightG) * 100)))
      : 0
  );
</script>

<article class={['rounded-lg border border-line bg-panel p-4 shadow-sm', className]}>
  <div class="flex items-start justify-between gap-3">
    <div class="min-w-0">
      <div class="flex items-center gap-2">
        <ColorSwatch color={spool.colorHex} label={spool.colorName} />
        <h2 class="truncate text-sm font-semibold text-ink">{spool.name}</h2>
      </div>
      <p class="mt-1 truncate text-xs text-ink-muted">
        {[spool.brand, spool.material, spool.colorName].filter(Boolean).join(' / ')}
      </p>
    </div>
    <StatusBadge status={spool.status} />
  </div>

  <div class="mt-4 grid gap-2">
    <div class="flex items-end justify-between gap-3">
      <div>
        <p class="text-xs font-medium text-ink-muted">Remaining</p>
        <p class="text-lg font-semibold text-ink">{spool.remainingWeightG} g</p>
      </div>
      <p class="text-sm font-semibold text-ink-muted">{remainingPercent}%</p>
    </div>
    <div class="h-2 overflow-hidden rounded-full bg-panel-muted">
      <div
        class="h-full rounded-full bg-brand"
        class:bg-warning={spool.status === 'low'}
        class:bg-danger={spool.status === 'empty'}
        style={`width: ${remainingPercent}%`}
      ></div>
    </div>
  </div>

  {#if !compact}
    <div
      class="mt-4 flex flex-col gap-3 border-t border-line pt-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between"
    >
      <p class="text-xs text-ink-muted">
        {#if spool.remainingValue}
          Value left <span class="font-semibold text-ink">{spool.remainingValue}</span>
        {:else}
          Initial weight <span class="font-semibold text-ink">{spool.initialWeightG} g</span>
        {/if}
      </p>
      {#if spool.onEdit || spool.onArchive || spool.onMarkEmpty}
        <div class="flex flex-wrap gap-2 sm:justify-end">
          {#if spool.onEdit}
            <Button size="sm" variant="secondary" onclick={spool.onEdit}>Edit</Button>
          {/if}
          {#if spool.onMarkEmpty}
            <Button size="sm" variant="secondary" onclick={spool.onMarkEmpty}>Mark empty</Button>
          {/if}
          {#if spool.onArchive}
            <Button size="sm" variant="danger" onclick={spool.onArchive}>Archive</Button>
          {/if}
        </div>
      {:else}
        <Button size="sm" variant="secondary">
          <Plus size={16} />
          Print
        </Button>
      {/if}
    </div>
  {/if}
</article>
