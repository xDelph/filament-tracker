<script lang="ts">
  import SpoolCard from './SpoolCard.svelte';

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
    remainingPercentLabel?: string;
    remainingValue?: string;
    lastUsedText?: string;
    status: SpoolStatus;
    detailHref?: string;
    onPrint?: () => void;
    onEdit?: () => void;
    onArchive?: () => void;
    onMarkEmpty?: () => void;
  };

  let {
    spools = [],
    emptyMessage = 'Aucune bobine à afficher.',
    class: className = ''
  }: {
    spools?: SpoolSummary[];
    emptyMessage?: string;
    class?: string;
  } = $props();
</script>

<div class={['grid gap-3 sm:grid-cols-2 xl:grid-cols-3', className]}>
  {#each spools as spool}
    <SpoolCard {spool} />
  {:else}
    <div class="rounded-lg border border-dashed border-line bg-panel p-6 text-sm text-ink-muted">
      {emptyMessage}
    </div>
  {/each}
</div>
