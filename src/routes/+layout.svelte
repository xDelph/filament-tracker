<script lang="ts">
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';
	import { resolve } from '$app/paths';

	let { children } = $props();
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>

<div class="min-h-dvh bg-zinc-50 text-zinc-900 flex flex-col">
	<header class="border-b border-zinc-200 bg-white">
		<div class="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3">
			<a href={resolve('/dashboard')} class="text-sm font-semibold tracking-tight"> Filament Tracker </a>
			<nav class="flex gap-4 text-sm">
				<a href={resolve('/dashboard')} class="text-zinc-600 hover:text-zinc-900"> Tableau de bord </a>
				<a href={resolve('/design-system')} class="text-zinc-600 hover:text-zinc-900"> UI Kit </a>
			</nav>
		</div>
	</header>
	<main class="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
		{@render children()}
	</main>
</div>
