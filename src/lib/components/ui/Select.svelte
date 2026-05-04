<script lang="ts">
  type SelectOption = {
    label: string;
    value: string;
    disabled?: boolean;
  };

  let {
    id,
    label,
    value = $bindable(''),
    options = [],
    placeholder = '',
    required = false,
    disabled = false,
    error = '',
    name,
    class: className = ''
  }: {
    id: string;
    label: string;
    value?: string;
    options?: SelectOption[];
    placeholder?: string;
    required?: boolean;
    disabled?: boolean;
    error?: string;
    name?: string;
    class?: string;
  } = $props();
</script>

<label class={['grid gap-1.5 text-sm font-medium text-ink', className]} for={id}>
  <span>{label}</span>
  <select
    class="h-9 rounded-md border border-line bg-panel px-3 text-sm text-ink shadow-sm disabled:bg-panel-muted"
    bind:value
    {id}
    {name}
    {required}
    {disabled}
    aria-invalid={error ? 'true' : undefined}
    aria-describedby={error ? `${id}-error` : undefined}
  >
    {#if placeholder}
      <option value="" disabled={required}>{placeholder}</option>
    {/if}
    {#each options as option}
      <option value={option.value} disabled={option.disabled}>{option.label}</option>
    {/each}
  </select>
  {#if error}
    <span id={`${id}-error`} class="text-xs font-medium text-danger">{error}</span>
  {/if}
</label>
