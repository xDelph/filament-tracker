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

  /** Même teinte que l’ancien défaut : pas d’hex stocké (ex. transparent / anciennes bobines). */
  const neutralFill = '#d7dde5';

  const swatchStyle = $derived.by(() => {
    const solid = color?.trim();
    return `background-color: ${solid || neutralFill};`;
  });
</script>

<span
  class={['inline-flex shrink-0 rounded-full border border-line shadow-sm', sizes[size], className]}
  style={swatchStyle}
  aria-label={label}
  title={label}
  role="img"
></span>
