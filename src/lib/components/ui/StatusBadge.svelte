<script lang="ts">
  type StatusTone = 'active' | 'low' | 'empty' | 'archived' | 'completed' | 'failed' | 'cancelled';

  let {
    status,
    label = status,
    class: className = ''
  }: {
    status: StatusTone;
    label?: string;
    class?: string;
  } = $props();

  const tones: Record<StatusTone, string> = {
    active: 'border-emerald-200 bg-emerald-50 text-success',
    low: 'border-amber-200 bg-amber-50 text-warning',
    empty: 'border-red-200 bg-red-50 text-danger',
    archived: 'border-slate-200 bg-slate-100 text-ink-muted',
    completed: 'border-emerald-200 bg-emerald-50 text-success',
    failed: 'border-red-200 bg-red-50 text-danger',
    cancelled: 'border-slate-200 bg-slate-100 text-ink-muted'
  };
</script>

<span class={['inline-flex h-6 items-center rounded-md border px-2 text-xs font-semibold capitalize', tones[status], className]}>
  {label}
</span>
