<script lang="ts">
  let {
    id,
    label,
    value = $bindable(undefined),
    placeholder = '',
    min,
    max,
    step = 'any',
    unit = '',
    required = false,
    disabled = false,
    error = '',
    name,
    class: className = ''
  }: {
    id: string;
    label: string;
    value?: number;
    placeholder?: string;
    min?: number;
    max?: number;
    step?: number | 'any';
    unit?: string;
    required?: boolean;
    disabled?: boolean;
    error?: string;
    name?: string;
    class?: string;
  } = $props();
</script>

<label class={['grid gap-1.5 text-sm font-medium text-ink', className]} for={id}>
  <span>{label}</span>
  <div class="relative">
    <input
      class="h-9 w-full rounded-md border border-line bg-panel px-3 text-sm text-ink shadow-sm placeholder:text-ink-muted/70 disabled:bg-panel-muted"
      class:pr-12={unit}
      bind:value
      type="number"
      inputmode="decimal"
      {id}
      {name}
      {placeholder}
      {min}
      {max}
      {step}
      {required}
      {disabled}
      aria-invalid={error ? 'true' : undefined}
      aria-describedby={error ? `${id}-error` : undefined}
    />
    {#if unit}
      <span class="pointer-events-none absolute inset-y-0 right-3 inline-flex items-center text-xs font-medium text-ink-muted">
        {unit}
      </span>
    {/if}
  </div>
  {#if error}
    <span id={`${id}-error`} class="text-xs font-medium text-danger">{error}</span>
  {/if}
</label>
