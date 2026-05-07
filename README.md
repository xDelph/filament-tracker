# Filament Tracker

Filament Tracker is a web app specification for tracking 3D-printing filament usage by spool.

The current project scope is documented in [docs/specifications.md](docs/specifications.md).

The technical stack decision is documented in [docs/technical-stack.md](docs/technical-stack.md).

The proposed MVP implementation split is documented in [docs/mvp-issue-breakdown.md](docs/mvp-issue-breakdown.md).

Technical notes on importing print history from PrusaLink / Prusa Connect (APIs, limits, mapping to domain types) live in [docs/prusa-history-import.md](docs/prusa-history-import.md).

To capture **live API responses** into a JSON file (LAN + Connect), use the Bun tool in [tools/prusa-api-snapshot/README.md](tools/prusa-api-snapshot/README.md).

Si tu récupères plutôt l’export riche **`jobs`** (avec `file.meta` Prusa Connect), tu peux le convertir en **sauvegarde locale importable** (`schemaVersion: 1`, même format que la route `PUT /api/local-db`) avec :

```sh
bun run import:prusa-jobs -- path/to/prusa_connect_jobs.json path/to/out.snapshot.json
```

Variable optionnelle : `FILAMENT_IMPORT_CURRENCY` (défaut `EUR`) pour convertir `filament_cost` en `MoneyMinor`.

The MVP UI is a [SvelteKit](https://kit.svelte.dev/) application: TypeScript, Vite, Tailwind CSS, Vitest, and Playwright. Use [Bun](https://bun.sh/) as the package manager.

Install dependencies:

```sh
bun install
```

Install Playwright browsers once (needed for end-to-end tests):

```sh
bunx playwright install
```

| Command | Description |
| --- | --- |
| `bun run dev` | Development server (`vite dev`) |
| `bun run build` | Production build |
| `bun run preview` | Serve the production build locally |
| `bun run test` | Unit tests (Vitest) and e2e tests (Playwright) |
| `bun run test:unit` | Vitest only |
| `bun run test:e2e` | Playwright only |

The reusable UI component preview is available at `/design-system` while the MVP screens are assembled.

To recreate this scaffold with the same add-ons:

```sh
bun x sv@0.15.2 create --template minimal --types ts --add vitest="usages:unit" playwright tailwindcss="plugins:none" --install bun .
```
