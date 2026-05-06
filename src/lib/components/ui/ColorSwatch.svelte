<script lang="ts">
  let {
    color = '',
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

  const swatchStyle = $derived.by(() => {
    const solid = color?.trim();
    if (solid) {
      return `background-color: ${solid};`;
    }
    return `background: repeating-conic-gradient(#e2e8f0 0% 25%, #f8fafc 0% 50%) 50% / 8px 8px;`;
  });
</script>

<span
  class={['inline-flex shrink-0 rounded-full border border-line shadow-sm', sizes[size], className]}
  style={swatchStyle}
  aria-label={label}
  title={label}
  role="img"
></span>
