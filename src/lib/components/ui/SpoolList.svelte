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
    remainingValue?: string;
    status: SpoolStatus;
    onEdit?: () => void;
    onArchive?: () => void;
    onMarkEmpty?: () => void;
  };

  let {
    spools = [],
    class: className = ''
  }: {
    spools?: SpoolSummary[];
    class?: string;
  } = $props();
</script>

<div class={['grid gap-3 sm:grid-cols-2 xl:grid-cols-3', className]}>
  {#each spools as spool}
    <SpoolCard {spool} />
  {:else}
    <div class="rounded-lg border border-dashed border-line bg-panel p-6 text-sm text-ink-muted">
      No spools to display.
    </div>
  {/each}
</div>
