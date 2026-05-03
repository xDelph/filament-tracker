<script lang="ts">
  import { X } from 'lucide-svelte';
  import type { Snippet } from 'svelte';
  import IconButton from './IconButton.svelte';

  let {
    open = false,
    title,
    description = '',
    children,
    footer,
    onClose = () => {}
  }: {
    open?: boolean;
    title: string;
    description?: string;
    children?: Snippet;
    footer?: Snippet;
    onClose?: () => void;
  } = $props();
</script>

{#if open}
  <div class="fixed inset-0 z-50 grid place-items-center bg-slate-950/30 p-4" role="presentation">
    <div
      class="w-full max-w-xl rounded-lg border border-line bg-panel shadow-xl"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
      aria-describedby={description ? 'modal-description' : undefined}
    >
      <header class="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
        <div class="min-w-0">
          <h2 id="modal-title" class="text-base font-semibold text-ink">{title}</h2>
          {#if description}
            <p id="modal-description" class="mt-1 text-sm text-ink-muted">{description}</p>
          {/if}
        </div>
        <IconButton label="Close" icon={X} variant="ghost" onclick={onClose} />
      </header>
      <div class="px-5 py-4">
        {@render children?.()}
      </div>
      {#if footer}
        <footer class="flex items-center justify-end gap-2 border-t border-line px-5 py-4">
          {@render footer()}
        </footer>
      {/if}
    </div>
  </div>
{/if}
