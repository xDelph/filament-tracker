<script lang="ts">
  let {
    color = '#d7dde5',
    label = 'Filament color',
    size = 'md',
    class: className = ''
  }: {
    color?: string;
    label?: string;
    size?: 'sm' | 'md' | 'lg';
    class?: string;
  } = $props();

  const sizes = {
    sm: 'size-4',
    md: 'size-5',
    lg: 'size-7'
  };
</script>

<span
  class={['inline-flex shrink-0 rounded-full border border-line shadow-sm', sizes[size], className]}
  style={`background-color: ${color};`}
  aria-label={label}
  title={label}
  role="img"
></span>
