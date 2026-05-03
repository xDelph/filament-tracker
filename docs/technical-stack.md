# Technical Stack

## Stack Recommendation

The MVP should be built as a local-first SvelteKit web application powered by Vite.

Recommended stack:

- Language: TypeScript.
- App framework: SvelteKit.
- Build tool: Vite.
- Runtime and package manager: Bun.
- Styling: Tailwind CSS.
- Accessible primitives: Bits UI where low-level interactions are needed.
- Icons: lucide-svelte.
- Forms: SvelteKit form actions and client-side form state where needed.
- Validation and domain schemas: Zod.
- Local persistence: IndexedDB through Dexie.
- Reactive local reads: Dexie `liveQuery` wrapped in Svelte stores.
- Unit tests: Vitest.
- Component tests: Svelte Testing Library only where component-level tests add value.
- End-to-end tests: Playwright.

## Rationale

### SvelteKit, TypeScript, and Vite

The product is an interactive CRUD-heavy web app with forms, inventory views, filters, and repeated user actions. SvelteKit keeps the UI layer concise, gives the project a clear file-based routing model, and uses Vite under the hood for fast local development.

This avoids introducing React-specific routing, state, and form libraries while keeping a modern Vite-based developer experience.

The MVP should be configured as a client-first app. Server-side features can stay minimal until the product needs authentication, teams, or sync.

### Bun

Bun should be used as the runtime, package manager, and script runner.

Project commands should be written around Bun:

```text
bun install
bun run dev
bun run test
bun run build
```

Vitest remains the test runner because it is Vite-native and integrates naturally with a SvelteKit/Vite project.

### Local-First Persistence

The first product risk is not backend scale; it is whether the manual spool tracking workflow is useful and reliable.

IndexedDB via Dexie is a good MVP fit because:

- It persists data locally in the browser.
- It supports structured records better than localStorage.
- It keeps the MVP usable without accounts or hosting.
- It can be wrapped behind a repository layer so a future backend can replace or sync it.

Persistence should be isolated behind domain-oriented modules, not called directly from Svelte components.

Suggested boundary:

```text
src/lib/domain       pure types, schemas, calculations
src/lib/storage      Dexie database and repositories
src/lib/features     feature modules and workflow helpers
src/lib/components   shared UI components
src/routes           SvelteKit route files
src/lib/test         fixtures and test helpers
```

### SvelteKit Routing

SvelteKit's file-based router should be used for the MVP.

Expected route structure:

```text
src/routes/+layout.svelte
src/routes/+page.svelte                  inventory dashboard
src/routes/spools/[id]/+page.svelte      spool detail
src/routes/prints/+page.svelte           print history
```

Dashboard and history filters should be represented as URL search params so states can be refreshed, bookmarked, and tested.

### Zod and Forms

Zod should define validation schemas for user-entered data:

- spool creation and edition,
- print creation,
- filament usage rows,
- manual spool adjustments.

The same Zod schemas should be reused by form handling and repository validation. This keeps form validation and domain validation aligned.

For the MVP, form state can stay close to the Svelte components. A larger form abstraction should be introduced only if duplication becomes visible.

### Tailwind CSS and Bits UI

The UI should be dense, practical, and optimized for repeated use. Tailwind CSS is sufficient for the visual layer, while Bits UI can provide accessible Svelte primitives for dialogs, dropdowns, popovers, tabs, and selects when native controls are not enough.

The project should avoid adopting a large styled UI kit before the product patterns are known.

### Testing

Testing should be split by risk:

- Vitest for pure calculations, schemas, and repository behavior.
- Svelte Testing Library for component behavior only when unit-level DOM tests are useful.
- Playwright for the critical end-to-end path: create spool, add print, verify remaining grams and cost, adjust stock.

## Architecture Rules

- Calculation logic must live in `src/lib/domain`, not inside Svelte components.
- Zod schemas should be shared by forms and repository validation.
- Dexie access should stay behind repository functions.
- Svelte components should receive typed data and callbacks rather than importing persistence directly when practical.
- Stored monetary values should use decimal-safe representations. For the MVP, store cents as integers or decimal strings, not binary floating-point values.
- Stored weights should use grams as decimal numbers.
- Print usage rows should store their calculated cost at creation time to preserve historical costs.

## Future Migration Path

If the app later needs accounts or sync, the most likely path is:

1. Keep `src/lib/domain` unchanged.
2. Add SvelteKit server routes or a separate backend API behind the repository interface.
3. Keep Dexie as offline cache or replace it depending on product direction.
4. Add authentication only when multi-device or multi-user usage is required.

This keeps the MVP small while avoiding a dead-end architecture.

## References

- SvelteKit is the recommended application framework for Svelte and is built around Vite: https://svelte.dev/docs/kit/introduction
- Vite supports modern frontend development and framework integrations: https://vite.dev/guide/
- Bun provides a runtime, package manager, script runner, and test tooling for JavaScript and TypeScript projects: https://bun.sh/docs
- Dexie is a wrapper around IndexedDB: https://dexie.org/docs/Dexie.js.html
- Zod is a TypeScript-first schema validation library: https://zod.dev/
- Tailwind CSS documents a Vite integration path: https://tailwindcss.com/docs/installation/using-vite
- Bits UI provides headless accessible components for Svelte: https://bits-ui.com/docs
- Vitest is a Vite-native testing framework: https://vitest.dev/guide/
- Playwright is designed for end-to-end testing across modern browser engines: https://playwright.dev/docs/best-practices
