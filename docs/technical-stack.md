# Technical Stack

## Stack Recommendation

The MVP should be built as a local-first single-page web application.

Recommended stack:

- Language: TypeScript.
- UI runtime: React.
- Build tool: Vite.
- Routing: TanStack Router.
- Styling: Tailwind CSS.
- Accessible primitives: Radix UI where low-level interactions are needed.
- Icons: lucide-react.
- Forms: React Hook Form.
- Validation and domain schemas: Zod.
- Local persistence: IndexedDB through Dexie.
- Reactive local reads: dexie-react-hooks.
- Unit tests: Vitest.
- Component and DOM tests: Testing Library.
- End-to-end tests: Playwright.
- Package manager: pnpm.

## Rationale

### React, TypeScript, and Vite

The product is an interactive CRUD-heavy web app with forms, inventory views, filters, and repeated user actions. React and TypeScript fit that workflow well, while Vite keeps the project lightweight and fast to start.

This avoids introducing a server framework before the MVP needs authentication, teams, or sync.

### Local-First Persistence

The first product risk is not backend scale; it is whether the manual spool tracking workflow is useful and reliable.

IndexedDB via Dexie is a good MVP fit because:

- It persists data locally in the browser.
- It supports structured records better than localStorage.
- It keeps the MVP usable without accounts or hosting.
- It can be wrapped behind a repository layer so a future backend can replace or sync it.

Persistence should be isolated behind domain-oriented modules, not called directly from UI components.

Suggested boundary:

```text
src/domain       pure types, schemas, calculations
src/storage      Dexie database and repositories
src/features     feature screens and workflows
src/components   shared UI components
src/routes       TanStack Router route definitions
src/test         fixtures and test helpers
```

### TanStack Router

TanStack Router gives type-safe routing and typed search params, which is useful for dashboard filters such as material, status, low-stock, sort order, and print history filters.

It should be used for client-side routing only in the MVP. Server-side rendering is not required.

### Zod and React Hook Form

Zod should define validation schemas for user-entered data:

- spool creation and edition,
- print creation,
- filament usage rows,
- manual spool adjustments.

React Hook Form should handle form state and submit lifecycle. Zod should be the validation resolver so the form rules and domain validation stay aligned.

### Tailwind CSS and Radix UI

The UI should be dense, practical, and optimized for repeated use. Tailwind CSS is sufficient for the visual layer, while Radix UI can provide accessible primitives for dialogs, dropdowns, popovers, tabs, and selects when native controls are not enough.

The project should avoid adopting a large UI kit before the product patterns are known.

### Testing

Testing should be split by risk:

- Vitest for pure calculations, schemas, and repository behavior.
- Testing Library for form and component behavior.
- Playwright for the critical end-to-end path: create spool, add print, verify remaining grams and cost, adjust stock.

## Architecture Rules

- Calculation logic must live in `src/domain`, not inside React components.
- Zod schemas should be shared by forms and repository validation.
- Dexie access should stay behind repository functions.
- UI components should receive typed data and callbacks rather than importing persistence directly.
- Stored monetary values should use decimal-safe representations. For the MVP, store cents as integers or decimal strings, not binary floating-point values.
- Stored weights should use grams as decimal numbers.
- Print usage rows should store their calculated cost at creation time to preserve historical costs.

## Future Migration Path

If the app later needs accounts or sync, the most likely path is:

1. Keep `src/domain` unchanged.
2. Add a backend API or sync service behind the repository interface.
3. Keep Dexie as offline cache or replace it depending on product direction.
4. Add authentication only when multi-device or multi-user usage is required.

This keeps the MVP small while avoiding a dead-end architecture.

## References

- Vite supports React TypeScript templates and is designed for fast modern web development: https://vite.dev/guide/
- React documents TypeScript support as a standard way to type React applications: https://react.dev/learn/typescript
- Dexie is a wrapper around IndexedDB: https://dexie.org/docs/Dexie.js.html
- TanStack Router provides React routing with type-safe route and search-param patterns: https://tanstack.com/router/router/docs
- Zod is a TypeScript-first schema validation library: https://zod.dev/
- Tailwind CSS documents a Vite integration path: https://tailwindcss.com/docs/installation/using-vite
- Vitest is a Vite-native testing framework: https://vitest.dev/guide/
- Playwright is designed for end-to-end testing across modern browser engines: https://playwright.dev/docs/best-practices
