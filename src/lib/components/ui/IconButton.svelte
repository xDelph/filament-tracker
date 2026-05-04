<script lang="ts">
  import type { Snippet } from 'svelte';

  type IconButtonVariant = 'secondary' | 'ghost' | 'danger';

  let {
    label,
    icon: Icon,
    variant = 'secondary',
    disabled = false,
    onclick,
    class: className = '',
    children
  }: {
    label: string;
    icon?: any;
    variant?: IconButtonVariant;
    disabled?: boolean;
    onclick?: () => void;
    class?: string;
    children?: Snippet;
  } = $props();

  const variants: Record<IconButtonVariant, string> = {
    secondary: 'border-line bg-panel text-ink hover:bg-panel-muted',
    ghost: 'border-transparent bg-transparent text-ink hover:bg-panel-muted',
    danger: 'border-danger bg-panel text-danger hover:bg-red-50'
  };
</script>

<button
  class={[
    'inline-flex size-9 shrink-0 items-center justify-center rounded-md border transition disabled:pointer-events-none disabled:opacity-50',
    variants[variant],
    className
  ]}
  type="button"
  aria-label={label}
  title={label}
  {disabled}
  {onclick}
>
  {#if Icon}
    <Icon size={18} strokeWidth={2} />
  {:else}
    {@render children?.()}
  {/if}
</button>
