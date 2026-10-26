# src/app/pages — routed pages

**Owns:** one component per route, wired in `src/App.tsx`. A page composes components and
hooks; it should not hold data access (that is `src/app/data/`) or reusable UI (that is
`src/app/components/`).

**Feature folders:** a page with several parts gets its own folder (`chat/` is the
model: a provider, a view model, hooks, one file per visible part).

**When a file hits the size limit** (the quality ratchet blocks the commit and prints the
limit; see any file's numbers with `node scripts/quality-ratchet.cjs --measure <file>`):
- An over-limit page may not grow. Put the new behaviour in a new component or hook and
  render or call it from the page.
- Split by **responsibility**, in this order of preference:
  1. State and effects into a hook (`use-<thing>.ts`), returning what the page renders.
  2. A visible region into a component file next to the page (`<Page>Header.tsx`).
  3. Pure helpers (formatting, mapping) into a `.ts` file; `.tsx` files export
     components only (react-refresh rule, docs/technical/architecture.md).
- A long `useEffect` or handler: name the steps as functions outside the component and
  call them in order. Each branch you extract lowers the complexity number too.
- Never cut a component in half at an arbitrary line to get under the limit: the second
  half then needs every prop of the first.

**Testing:** component tests are in `src/tests/` (vitest + Testing Library); routed flows
are in `e2e/` (Playwright). Visual changes also need a browser check (`/verify`).
