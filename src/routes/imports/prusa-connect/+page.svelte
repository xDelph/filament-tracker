<script lang="ts">
	import { liveQuery } from 'dexie';

	import { resolve } from '$app/paths';
	import { Button, Select, TextInput } from '$lib/components/ui';
	import type { PrusaConnectCostBasis, PrusaConnectObjectsMode } from '$lib/storage';
	import type { Spool } from '$lib/domain';
	import { db } from '$lib/storage/db';
	import { listSpools } from '$lib/storage/spools';
	import {
		buildLocalJsonSnapshotFromPrusaConnectJobsExport,
		collectLocalJsonDbSnapshot,
		mergePrusaConnectDeltaIntoBase,
		persistIndexedDbToLocalJson,
		previewPrusaConnectJobsExport,
		replaceIndexedDbFromLocalJsonSnapshot,
	} from '$lib/storage';

	let rawJson = $state<unknown | null>(null);
	let fileLabel = $state('');
	let parseError = $state('');

	let costBasis = $state<PrusaConnectCostBasis>('slicer');
	let stoppedConsumeStr = $state('true');
	let objectsMode = $state<PrusaConnectObjectsMode>('per_stl');
	let defaultCurrency = $state('EUR');

	let spools = $state<Spool[]>([]);
	$effect(() => {
		const sub = liveQuery(() => listSpools()).subscribe((rows) => {
			spools = rows;
		});
		return () => sub.unsubscribe();
	});

	let existingPrusaJobIds = $state<Set<string>>(new Set());
	$effect(() => {
		const sub = liveQuery(() =>
			db.printExternalImports.where('source').equals('prusa_connect').toArray(),
		).subscribe((rows) => {
			existingPrusaJobIds = new Set(rows.map((r) => r.externalJobId));
		});
		return () => sub.unsubscribe();
	});

	let filamentMapping = $state<Record<string, string>>({});

	let preview = $derived.by(() => {
		if (rawJson === null) return null;
		try {
			return previewPrusaConnectJobsExport(rawJson, {
				stoppedJobsConsumeFilament: stoppedConsumeStr === 'true',
				objectsMode,
			});
		} catch {
			return null;
		}
	});

	let distinctFilamentKeys = $derived.by(() => {
		if (!preview) return [];
		const s = new Set<string>();
		for (const j of preview.jobs) {
			if (j.filamentUsedG !== undefined && j.filamentUsedG > 0) {
				s.add(j.filamentTypeKey);
			}
		}
		return [...s].sort((a, b) => a.localeCompare(b, 'fr'));
	});

	$effect(() => {
		const next: Record<string, string> = { ...filamentMapping };
		let changed = false;
		for (const k of distinctFilamentKeys) {
			if (next[k] === undefined) {
				next[k] = 'synthetic';
				changed = true;
			}
		}
		for (const k of Object.keys(next)) {
			if (!distinctFilamentKeys.includes(k)) {
				delete next[k];
				changed = true;
			}
		}
		if (changed) filamentMapping = next;
	});

	let duplicateJobs = $derived(
		preview
			? preview.jobs.filter((j) => existingPrusaJobIds.has(j.externalJobId)).length
			: 0,
	);

	let importError = $state('');
	let importBusy = $state(false);
	let importOk = $state('');

	$effect(() => {
		if (!importOk) return;
		const t = setTimeout(() => {
			importOk = '';
		}, 5000);
		return () => clearTimeout(t);
	});

	function fmtDuration(sec: number): string {
		if (!Number.isFinite(sec) || sec <= 0) return '—';
		const h = Math.floor(sec / 3600);
		const m = Math.floor((sec % 3600) / 60);
		if (h > 0) return `${h}\u00a0h\u00a0${m}\u00a0min`;
		return `${m}\u00a0min`;
	}

	function fmtDateRange(minSec?: number, maxSec?: number): string {
		if (minSec === undefined || maxSec === undefined) return '—';
		const fmt = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' });
		return `${fmt.format(new Date(minSec * 1000))} → ${fmt.format(new Date(maxSec * 1000))}`;
	}

	async function onPickFile(e: Event): Promise<void> {
		parseError = '';
		rawJson = null;
		fileLabel = '';
		const input = e.target as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;
		fileLabel = file.name;
		try {
			const text = await file.text();
			rawJson = JSON.parse(text) as unknown;
		} catch {
			parseError = 'Fichier JSON illisible ou invalide.';
		}
		input.value = '';
	}

	function spoolOptionsForMapping(): Array<{ value: string; label: string }> {
		return [
			{ value: 'synthetic', label: 'Bobine synthétique (nouvelle)' },
			...spools.map((s) => ({
				value: s.id,
				label: `${s.name} (${s.remainingWeightG}\u00a0g restants)`,
			})),
		];
	}

	async function runImport(): Promise<void> {
		importError = '';
		importOk = '';
		if (rawJson === null) {
			importError = 'Choisis d’abord un fichier JSON.';
			return;
		}
		for (const k of distinctFilamentKeys) {
			const v = filamentMapping[k];
			if (!v) {
				importError = `Choisis un cible bobine pour le type « ${k} ».`;
				return;
			}
		}
		importBusy = true;
		try {
			const base = await collectLocalJsonDbSnapshot();
			const skipExternalJobIds = new Set(
				base.tables.printExternalImports
					.filter((e) => e.source === 'prusa_connect')
					.map((e) => e.externalJobId),
			);
			const existingPrinterIdByUuid = new Map(
				base.tables.printers
					.filter((p) => p.source === 'prusa_connect' && p.externalPrinterUuid)
					.map((p) => [p.externalPrinterUuid!, p.id]),
			);
			const knownSpoolsById = new Map(base.tables.spools.map((s) => [s.id, s]));

			const filamentTypeToSpoolId: Record<string, string> = {};
			let needsSynthetic = false;
			for (const k of distinctFilamentKeys) {
				const choice = filamentMapping[k] ?? 'synthetic';
				if (choice === 'synthetic') {
					needsSynthetic = true;
				} else {
					filamentTypeToSpoolId[k] = choice;
				}
			}

			const delta = buildLocalJsonSnapshotFromPrusaConnectJobsExport(rawJson, {
				defaultCurrency: defaultCurrency.trim().toUpperCase() || 'EUR',
				costBasis,
				stoppedJobsConsumeFilament: stoppedConsumeStr === 'true',
				objectsMode,
				filamentTypeToSpoolId,
				createSyntheticSpools: needsSynthetic,
				skipExternalJobIds,
				existingPrinterIdByUuid,
				knownSpoolsById,
			});

			const merged = mergePrusaConnectDeltaIntoBase(base, delta);
			await replaceIndexedDbFromLocalJsonSnapshot(merged);
			await persistIndexedDbToLocalJson();
			const n = delta.tables.prints.length;
			importOk =
				n === 0
					? 'Aucun nouveau job importé (tous étaient déjà présents ou filtrés).'
					: `${n} impression(s) importée(s).`;
		} catch (e) {
			importError = e instanceof Error ? e.message : 'Import impossible.';
		} finally {
			importBusy = false;
		}
	}
</script>

<div class="grid gap-8">
	<header class="grid gap-2">
		<p class="text-sm font-medium text-emerald-800">
			<a href={resolve('/dashboard')} class="underline-offset-4 hover:underline">Tableau de bord</a>
			<span class="text-zinc-400" aria-hidden="true">/</span>
			Import Prusa Connect
		</p>
		<h1 class="text-2xl font-semibold tracking-tight">Import jobs Prusa Connect (JSON enrichi)</h1>
		<p class="max-w-prose text-zinc-600">
			Sélectionne l’export JSON, vérifie le résumé, règle le mapping bobines et les options (coût, jobs
			arrêtés, objets STL). Les métadonnées personnelles Prusa (<code class="text-xs">source_info</code>,
			<code class="text-xs">owner</code>) ne sont ni lues ni stockées.
		</p>
	</header>

	<section class="grid gap-4 rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
		<h2 class="text-base font-semibold text-ink">1. Fichier</h2>
		<label class="grid gap-2 text-sm font-medium text-ink">
			<span>Export JSON</span>
			<input
				type="file"
				accept="application/json,.json"
				class="text-sm text-ink file:mr-3 file:rounded-md file:border file:border-line file:bg-panel file:px-3 file:py-1.5 file:text-sm"
				onchange={onPickFile}
			/>
		</label>
		{#if fileLabel}
			<p class="text-sm text-ink-muted">Fichier : {fileLabel}</p>
		{/if}
		{#if parseError}
			<p class="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900" role="alert">
				{parseError}
			</p>
		{/if}
	</section>

	{#if preview}
		<section class="grid gap-4 rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
			<h2 class="text-base font-semibold text-ink">2. Résumé</h2>
			<dl class="grid gap-3 sm:grid-cols-2">
				<div>
					<dt class="text-xs font-medium uppercase tracking-wide text-ink-muted">Jobs dans le fichier</dt>
					<dd class="text-sm font-semibold text-ink">{preview.summary.jobCount}</dd>
				</div>
				<div>
					<dt class="text-xs font-medium uppercase tracking-wide text-ink-muted">Importables (grammes méta)</dt>
					<dd class="text-sm font-semibold text-ink">{preview.summary.jobsWithMetaGrams}</dd>
				</div>
				<div>
					<dt class="text-xs font-medium uppercase tracking-wide text-ink-muted">Statuts</dt>
					<dd class="text-sm text-ink">
						{Object.entries(preview.summary.statusCounts)
							.map(([k, v]) => `${k}: ${v}`)
							.join(' · ') || '—'}
					</dd>
				</div>
				<div>
					<dt class="text-xs font-medium uppercase tracking-wide text-ink-muted">Période (start/end)</dt>
					<dd class="text-sm text-ink">
						{fmtDateRange(preview.summary.dateMinSec, preview.summary.dateMaxSec)}
					</dd>
				</div>
				<div>
					<dt class="text-xs font-medium uppercase tracking-wide text-ink-muted">Imprimantes (UUID)</dt>
					<dd class="text-sm text-ink">{preview.summary.printerUuids.length}</dd>
				</div>
				<div>
					<dt class="text-xs font-medium uppercase tracking-wide text-ink-muted">Filament total (aperçu)</dt>
					<dd class="text-sm font-semibold text-ink">
						{preview.summary.totalFilamentGConsume.toFixed(1)}\u00a0g
					</dd>
				</div>
				<div>
					<dt class="text-xs font-medium uppercase tracking-wide text-ink-muted">Durée totale (approx.)</dt>
					<dd class="text-sm text-ink">{fmtDuration(preview.summary.totalDurationSec)}</dd>
				</div>
				<div>
					<dt class="text-xs font-medium uppercase tracking-wide text-ink-muted">Champs méta manquants</dt>
					<dd class="text-sm text-ink">
						type:{preview.summary.missingCounts.filamentType} · coût:{preview.summary.missingCounts
							.filamentCost} · durée estimée:{preview.summary.missingCounts.estimatedPrintTime}
					</dd>
				</div>
			</dl>
			{#if duplicateJobs > 0}
				<p class="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
					{duplicateJobs} job(s) sont déjà importés (même identifiant Prusa). Ils seront ignorés pour éviter les
					doublons.
				</p>
			{/if}
		</section>

		<section class="grid gap-4 rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
			<h2 class="text-base font-semibold text-ink">3. Décisions d’import</h2>
			<div class="grid gap-4 sm:grid-cols-2">
				<Select
					id="cost-basis"
					label="Coût matière sur la ligne"
					bind:value={costBasis}
					options={[
						{ value: 'slicer', label: 'Estimation slicer (filament_cost)' },
						{ value: 'spool_inventory', label: 'Tarif moyen bobine (poids / prix d’achat)' },
					]}
				/>
				<TextInput
					id="currency"
					label="Devise (ISO 4217, slicer)"
					bind:value={defaultCurrency}
					placeholder="EUR"
				/>
				<Select
					id="stopped"
					label="Jobs FIN_STOPPED"
					bind:value={stoppedConsumeStr}
					options={[
						{ value: 'true', label: 'Consomment du filament (ligne de conso + statut annulé)' },
						{
							value: 'false',
							label: 'Sans consommation (impression enregistrée, pas de ligne bobine)',
						},
					]}
				/>
				<Select
					id="objects"
					label="Objets dans le fichier G-code"
					bind:value={objectsMode}
					options={[
						{ value: 'per_stl', label: 'Un objet par STL (objects_info)' },
						{ value: 'aggregated', label: 'Une ligne agrégée par job' },
					]}
				/>
			</div>
			<p class="text-xs leading-relaxed text-ink-muted">
				Coût slicer vs bobine : le champ <code class="text-[0.75rem]">slicerCost</code> conserve l’estimation
				Prusa lorsque le coût matière utilise le tarif bobine.
			</p>
		</section>

		{#if distinctFilamentKeys.length > 0}
			<section class="grid gap-4 rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
				<h2 class="text-base font-semibold text-ink">4. Mapping type filament → bobine</h2>
				<p class="text-sm text-ink-muted">
					Chaque type détecté doit pointer vers une bobine existante ou une bobine synthétique dédiée à cet
					import.
				</p>
				<div class="grid gap-3">
					{#each distinctFilamentKeys as key}
						<Select
							id={`map-${key}`}
							label={`Type « ${key} »`}
							bind:value={filamentMapping[key]}
							options={spoolOptionsForMapping()}
							placeholder="Choisir"
						/>
					{/each}
				</div>
			</section>
		{/if}

		<section class="grid gap-2 rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
			<h2 class="text-base font-semibold text-ink">Validation par job</h2>
			<p class="text-sm text-ink-muted">
				Les avertissements n’empêchent pas l’import des jobs valides.
			</p>
			<div class="max-h-64 overflow-y-auto rounded-md border border-line">
				<table class="w-full text-left text-sm">
					<thead class="sticky top-0 bg-panel-muted text-xs uppercase text-ink-muted">
						<tr>
							<th class="px-3 py-2 font-medium">#</th>
							<th class="px-3 py-2 font-medium">Nom</th>
							<th class="px-3 py-2 font-medium">État</th>
							<th class="px-3 py-2 font-medium">Type</th>
							<th class="px-3 py-2 font-medium">Alertes</th>
						</tr>
					</thead>
					<tbody>
						{#each preview.jobs as j}
							<tr class="border-t border-line odd:bg-white even:bg-zinc-50/80">
								<td class="px-3 py-2 align-top text-ink-muted">{j.index}</td>
								<td class="px-3 py-2 align-top font-medium text-ink">{j.displayName}</td>
								<td class="px-3 py-2 align-top">{j.state ?? '—'}</td>
								<td class="px-3 py-2 align-top">{j.filamentTypeKey}</td>
								<td class="px-3 py-2 align-top text-xs text-amber-900">
									{#if j.issues.length === 0}
										—
									{:else}
										<ul class="list-inside list-disc">
											{#each j.issues as iss}
												<li>{iss}</li>
											{/each}
										</ul>
									{/if}
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</section>

		<section class="flex flex-wrap items-center gap-3 rounded-lg border border-emerald-100 bg-emerald-50/50 p-5">
			<Button type="button" onclick={runImport} disabled={importBusy}>
				{importBusy ? 'Import…' : 'Lancer l’import'}
			</Button>
			{#if importError}
				<p class="text-sm text-red-800" role="alert">{importError}</p>
			{/if}
			{#if importOk}
				<p class="text-sm font-medium text-emerald-900">{importOk}</p>
			{/if}
		</section>
	{/if}
</div>
