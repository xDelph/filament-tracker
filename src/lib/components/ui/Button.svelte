<script lang="ts">
  import type { Snippet } from 'svelte';

  type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
  type ButtonSize = 'sm' | 'md';
  type ButtonType = 'button' | 'submit' | 'reset';

  let {
    variant = 'primary',
    size = 'md',
    type = 'button',
    disabled = false,
    pressed,
    form,
    onclick,
    class: className = '',
    children
  }: {
    variant?: ButtonVariant;
    size?: ButtonSize;
    type?: ButtonType;
    disabled?: boolean;
    pressed?: boolean;
    form?: string;
    onclick?: () => void;
    class?: string;
    children?: Snippet;
  } = $props();

  const variants: Record<ButtonVariant, string> = {
    primary: 'border-brand bg-brand text-white hover:bg-brand-strong',
    secondary: 'border-line bg-panel text-ink hover:bg-panel-muted',
    ghost: 'border-transparent bg-transparent text-ink hover:bg-panel-muted',
    danger: 'border-danger bg-danger text-white hover:bg-red-800'
  };

  const sizes: Record<ButtonSize, string> = {
    sm: 'h-8 px-3 text-sm',
    md: 'h-9 px-4 text-sm'
  };
</script>

<button
  class={[
    'inline-flex shrink-0 items-center justify-center gap-2 rounded-md border font-medium transition disabled:pointer-events-none disabled:opacity-50',
    variants[variant],
    sizes[size],
    className
  ]}
  {type}
  {disabled}
  {form}
  {onclick}
  aria-pressed={pressed}
>
  {@render children?.()}
</button>
