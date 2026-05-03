<script lang="ts">
  let {
    id,
    label,
    value = $bindable(''),
    placeholder = '',
    required = false,
    disabled = false,
    error = '',
    hint = '',
    name,
    autocomplete,
    class: className = ''
  }: {
    id: string;
    label: string;
    value?: string;
    placeholder?: string;
    required?: boolean;
    disabled?: boolean;
    error?: string;
    hint?: string;
    name?: string;
    autocomplete?: any;
    class?: string;
  } = $props();

  let describedBy = $derived(error ? `${id}-error` : hint ? `${id}-hint` : undefined);
</script>

<label class={['grid gap-1.5 text-sm font-medium text-ink', className]} for={id}>
  <span>{label}</span>
  <input
    class="h-9 rounded-md border border-line bg-panel px-3 text-sm text-ink shadow-sm placeholder:text-ink-muted/70 disabled:bg-panel-muted"
    bind:value
    {id}
    {name}
    {placeholder}
    {required}
    {disabled}
    {autocomplete}
    aria-invalid={error ? 'true' : undefined}
    aria-describedby={describedBy}
  />
  {#if error}
    <span id={`${id}-error`} class="text-xs font-medium text-danger">{error}</span>
  {:else if hint}
    <span id={`${id}-hint`} class="text-xs font-normal text-ink-muted">{hint}</span>
  {/if}
</label>
