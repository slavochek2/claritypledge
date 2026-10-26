# src/app/components — reusable UI

**Owns:** components used by more than one page, grouped by domain folder (`letters/`,
`feed/`, `canvas/`, ...); `shared/` is cross-domain. shadcn/ui lives in `src/components/ui/`. Design rules:
docs/design-system.md.

**When a file hits the size limit** (the quality ratchet blocks the commit and prints the
limit; see any file's numbers with `node scripts/quality-ratchet.cjs --measure <file>`):
- An over-limit component may not grow. Add a child component or a hook and use it.
- Split by **what the user sees**: a card's header, body and actions become three
  components in the same domain folder, the parent passing only what each needs.
- Conditional rendering is what usually drives complexity up (`a && <X/>`, `?:`, `?.`).
  Move a cluster of conditions into a small component that takes the condition's inputs
  as props, or compute a view model in a `.ts` helper and render from it.
- Non-component exports (types, helpers, constants) go in a sibling `.ts` file; a `.tsx`
  file exports components only (react-refresh rule, docs/technical/architecture.md).

**Testing:** `src/tests/` holds component tests (vitest + Testing Library). P955 gate
fixtures under `src/app/tree/_gate/` render real components and must keep working.
