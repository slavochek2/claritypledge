---
status: in-progress
type: story
rank: 1000689.0
workstream: letters
created_date: '2026-04-11'
tags: [letters, inbox, ui, a11y]
delivery_stage: dev
pipeline_plan: [create-spec, dev, verify]
pipeline_ran: [create-spec, dev]
pipeline_skipped: [challenge-prd -- decisions resolved upstream, ux -- no net-new component, architect -- no schema/auth/structural change, generate-tests -- canary test written inside dev, decompose -- 1 file ~15 LOC, spec-review -- fresh spec, spec-compact -- fresh spec]
flow: dev
---

# P689: Letters Inbox Per-Row Read/Unread Indicators

## Problem

**Situation:** P660 added an unread-count badge on the Letters nav entry, so users know *how many* unread items they have before opening the inbox.
**Complication:** Once inside `/letters?tab=inbox`, the only per-row cue for unread is bold text weight. It's subtle in a short list and fails the Gmail-style "at a glance" expectation the badge sets up.
**Question:** How do we make unread rows unambiguously scannable without shifting layout, breaking dark mode, or regressing a11y?

## Appetite

Low blast radius — one file, `src/app/components/letters/inbox-tab.tsx`, ~15 LOC of JSX. Fully reversible (git revert). Zero decision density — mark-as-read trigger ("inbox click only") and visual treatment ("dot + subtle background") are both resolved in the source plan.

Source plan: `~/.claude/plans/deep-jumping-raven.md` (decisions captured there).

## Solution

Two changes inside the existing row in `inbox-tab.tsx` (verified against `feature/letters-ship` HEAD at spec creation — see **Current Code** below):

1. **Conditional row background** — unread rows use `bg-blue-500/5`, read rows keep `bg-card`. Hover state (`hover:bg-accent/50`) layers on top of both.
2. **Fixed-width dot column** — prepend a `w-2` column to the row's flex layout, containing a `w-2 h-2 rounded-full bg-blue-500` dot shown via `opacity` toggle (not conditional render) so read/unread rows share the same column grid.
3. **SR-only unread label** — first child of the row's inner flex container, before the dot column: `{isUnread && <span className="sr-only">Unread. </span>}`. Trailing space + period so screen reader concatenates it cleanly with the row text.

### Color token choice — read before changing

**Use `bg-blue-500` / `bg-blue-500/5` directly. Do NOT substitute `bg-primary/5`.**

Reason: `tailwind.config.js` maps `primary` to the CSS variable `--primary`, which is a theme token that may not be blue. The existing `inbox-tab.tsx` already uses raw `blue-500` in two places that set the inbox's visual identity:

- The CTA button: `className="bg-blue-500 hover:bg-blue-600 text-white min-h-[44px]"`
- The item icons: `<Mail className="w-5 h-5 text-blue-500" />` (same for `MailOpen`, `LinkIcon`)

A tinted `bg-blue-500/5` row background is therefore **color-consistent with the component's existing palette**, not drift. The global "prefer tokens" rule doesn't apply when the local component has already committed to a raw palette color for its accent — matching it is the less-surprising choice.

**Dark-mode fallback ladder** (try in order if the tint reads wrong during `/verify`):
1. `bg-blue-500/5` — start here
2. `bg-blue-500/10` — if /5 is invisible on dark
3. Stop and ask the founder — do not improvise a third option

### A11y

- Dot stays `aria-hidden="true"` (decorative)
- `data-unread="true"` attribute stays on the outer row `div` — **keep** it; e2e tests use it as a Tailwind-class-stable selector. Add a short inline comment: `/* data-unread: stable e2e selector — do not remove */`
- The SR-only `<span>Unread. </span>` is the semantic unread signal for AT users (bold text alone does not announce state)

## Risks / Non-Goals

### Risks
- **Dark-mode contrast regression.** A 5% tint over dark `bg-background` can look muddy or invisible. Mitigation: verify both themes during `/verify`; escalate to the QA subagent (per `.claude/rules/visual-qa.md`) with screenshots of both.
- **Narrow-viewport layout regression.** Adding `w-2 + gap-3` adds ~20px of left indent on every row. On the smallest mobile width, this could push the CTA button to a new line. Mitigation: `/verify` must screenshot at mobile width, not just desktop.
- **Icon/text column drift between read and unread rows.** Prevented by the opacity-toggle decision (fixed-width column), but easy to break if someone later "optimizes" it to a conditional render. Mitigation: the canary unit test asserts the dot span is always present in the DOM regardless of `read_at`.

### Non-Goals
- Do NOT auto-mark letters as read when the letter detail page opens. Inbox click is the only mark-as-read trigger (explicit P660 decision).
- Do NOT change the `onUnreadCountChange` callback or `useUnreadLetterCount` hook — nav badge sync is pre-existing behavior.
- Do NOT introduce a new visual treatment for replies vs new letters — same dot + background for both (matches current code).
- Do NOT change any file other than `src/app/components/letters/inbox-tab.tsx` and its canary test file. No new components, no new hooks, no styling tokens outside the ones needed for the tint.
- Do NOT touch `e2e/p660-inbox-tab.spec.ts` unless a selector genuinely broke — this is a visual polish, not a behavior change. If it does break, report the breakage before changing it.
- Do NOT add an `onClick` to the outer row `div`. Do NOT wrap the row in a `Link`. Clickability is owned by the `Button` only.
- Do NOT refactor `ItemIcon` or `ItemMessage` helpers. Do NOT touch `handleAction`, `fetchItems`, or any state in `InboxTab`.
- Do NOT change the `bg-blue-500` CTA button color, its `min-h-[44px]`, or the `text-blue-500` icon colors. The tint choice depends on them staying as-is.
- Do NOT substitute `bg-primary/5` for `bg-blue-500/5`. Read the **Color token choice** section for the reason.
- Do NOT invent a new Tailwind token or touch `tailwind.config.js`.

## Done-When

- [ ] Unread row: blue dot visible, tinted background, bold text
- [ ] Read row: dot hidden (opacity 0), `bg-card` background, normal text
- [ ] Icon and text columns horizontally aligned across read and unread rows (no jitter)
- [ ] Screen readers announce an "Unread" signal on unread rows (SR-only label, not relying on bold alone)
- [ ] `data-unread` attribute still present on unread rows (e2e-stable selector)
- [ ] Tint color is `bg-blue-500/5` — consistent with the component's existing raw palette usage (not `bg-primary/5`)
- [ ] Light mode and dark mode both verified via browser screenshot
- [ ] Mobile viewport (narrow) verified — CTA button does not wrap to a second line because of the new dot column
- [ ] Canary unit test: renders `InboxTab` with mixed read/unread items, asserts dot element present on both, asserts `opacity-0`/`opacity-100` or equivalent toggled by `read_at`
- [ ] `./scripts/pre-commit-checks.sh` passes
- [ ] Clicking "Read" on an unread row: dot hides, background normalises (optimistic update, pre-existing)

## UX Notes

**States covered by this change:**
- Happy path (mixed read/unread list)
- All read (no dots visible, all rows `bg-card`)
- All unread (every row dotted and tinted)
- Empty inbox (no rendering concern — row markup not reached)
- Transition state: clicking "Read" on an unread row — dot + tint should disappear via the existing optimistic update path, with `transition-colors` + `transition-opacity` making it feel smooth rather than snapping.

## Acceptance Criteria

- [ ] User can tell at a glance which inbox rows are unread without reading the text
- [ ] Visual treatment survives both themes (light, dark) and both breakpoints (mobile, desktop)
- [ ] Screen reader users receive the same unread signal sighted users do
- [ ] No change to mark-as-read logic, nav badge sync, or any other inbox behavior

## UI Contract

| Element | Unread | Read |
|---------|--------|------|
| Row background | `bg-blue-500/5` (fallback `bg-blue-500/10` if dark-mode invisible) | `bg-card` |
| Row transition | `transition-colors` (already present — keep) | same |
| Hover background | `hover:bg-accent/50` layered over tint | `hover:bg-accent/50` layered over card |
| Dot element | `block w-2 h-2 rounded-full bg-blue-500 transition-opacity opacity-100`, `aria-hidden="true"` | same element, `opacity-0` |
| Dot container | `<div className="flex-shrink-0 w-2 flex items-center justify-center">` — always rendered | same |
| Dot position | First child of the row's inner flex-items-center container, before `ItemIcon` | same |
| Icon column | `<div className="flex-shrink-0">` — unchanged | unchanged |
| Text weight | `font-semibold text-foreground` | `font-normal text-foreground` |
| SR-only "Unread" | `<span className="sr-only">Unread. </span>` rendered conditionally before the dot container | not rendered |
| `data-unread` attribute | `"true"` on outer row `div` | attribute absent (`undefined`) |
| CTA button `min-h-[44px]` | preserved | preserved |

## Current Code (reference — do not re-discover)

This is the row block as it exists on `feature/letters-ship` at spec-creation time. `/dev` must read the file first, confirm the block still matches, and only modify the two spots marked **← change**. Everything else on the surrounding lines stays byte-identical.

```tsx
<div
  key={item.delivery_id}
  className="rounded-lg border bg-card p-4 hover:bg-accent/50 transition-colors"   // ← change: conditional bg
  data-unread={isUnread ? 'true' : undefined}
>
  <div className="flex items-center gap-3">
    {/* ← change: insert SR-only label + dot column here, before ItemIcon */}
    <div className="flex-shrink-0">
      <ItemIcon type={item.type} />
    </div>
    <div className="flex-1 min-w-0">
      <p
        className={`text-sm line-clamp-2 ${
          isUnread ? 'font-semibold text-foreground' : 'font-normal text-foreground'
        }`}
      >
        <ItemMessage item={item} />
      </p>
      <p className="text-xs text-muted-foreground mt-0.5">
        {formatTimeAgo(item.timestamp)} ago
      </p>
    </div>
    <div className="flex-shrink-0">
      <Button
        size="sm"
        className="bg-blue-500 hover:bg-blue-600 text-white min-h-[44px]"
        disabled={isMarking}
        onClick={() => handleAction(item)}
      >
        {item.type === 'received' ? 'Read' : 'Results'}
      </Button>
    </div>
  </div>
</div>
```

**Exact target markup after edit:**

```tsx
<div
  key={item.delivery_id}
  className={`rounded-lg border p-4 hover:bg-accent/50 transition-colors ${
    isUnread ? 'bg-blue-500/5' : 'bg-card'
  }`}
  data-unread={isUnread ? 'true' : undefined} /* stable e2e selector — do not remove */
>
  <div className="flex items-center gap-3">
    {isUnread && <span className="sr-only">Unread. </span>}
    <div className="flex-shrink-0 w-2 flex items-center justify-center">
      <span
        className={`block w-2 h-2 rounded-full bg-blue-500 transition-opacity ${
          isUnread ? 'opacity-100' : 'opacity-0'
        }`}
        aria-hidden="true"
      />
    </div>
    <div className="flex-shrink-0">
      <ItemIcon type={item.type} />
    </div>
    {/* rest of the row: unchanged */}
```

**Clickability note for `/dev`:** Only the `Button` has an `onClick`; the row `div` itself is NOT clickable. `handleAction` runs from the button only. Do not add an `onClick` to the row. Do not wrap the row in a `Link`. "Inbox click" in the source plan means "click the Read button while in the inbox view" — this is the existing `handleAction` path and needs zero changes.

## Files Changed

| File | Change |
|------|--------|
| `src/app/components/letters/inbox-tab.tsx` | Conditional row background + fixed-width dot column + SR-only "Unread" label |
| `src/app/components/letters/inbox-tab.test.tsx` *(new file)* | Canary test — see **Canary Test Spec** below. Pattern-match from `src/app/components/social/pledger-card.test.tsx` (Vitest + RTL, closest peer) |

## Canary Test Spec

Purpose: lock the layout-preserving invariant so a future "optimization" that conditionally renders the dot gets caught.

Match the imports, mock patterns, and assertion style of `src/app/components/social/pledger-card.test.tsx`. If that file uses `vi.mock` for data-service imports, mirror that for `getInboxItems` and `markDeliveryRead` from `@/app/data/letters-service`.

**Assertions (all required):**

1. Render `<InboxTab userId="test-user" />` with `getInboxItems` mocked to return an array of two items — one with `read_at: null`, one with `read_at: '2026-04-10T12:00:00Z'`.
2. After `findByText` for the first item's title (waits for fetch):
   - Both rows have a descendant matching `span[aria-hidden="true"].rounded-full` — the dot element. **Both rows**, not just the unread one. This is the layout-preserving invariant.
   - The unread row's dot span has `opacity-100` in its className.
   - The read row's dot span has `opacity-0` in its className.
3. The unread row has a `<span class="sr-only">` containing "Unread" somewhere inside it. The read row does not.
4. The unread row's outer container has `data-unread="true"`. The read row does not have the attribute (use `not.toHaveAttribute('data-unread')` or equivalent).
5. The unread row's outer container className includes `bg-blue-500/5`. The read row's className includes `bg-card`.

**Do not assert:** exact icon component, text content of `ItemMessage`, button label, or anything else not listed. Tight scope keeps the test stable against unrelated future changes.

If the test needs a router context (because `InboxTab` calls `useNavigate`), wrap with `<MemoryRouter>` — same pattern as other peer tests in `src/app/pages/`.

No DB changes. No new hooks. No new components. No migrations.

## Verification

1. `tsc --noEmit` — no type errors
2. `npm test -- --run inbox-tab` — canary test green
3. `./scripts/pre-commit-checks.sh` — clean
4. `/verify` in browser (Claude in Chrome, authenticated) against `feature/letters-ship` in w2:
   - `/letters?tab=inbox` — mixed read/unread list, light theme, desktop width
   - Same route, dark theme
   - Same route, narrow mobile viewport (≤375px) — CTA does not wrap
   - Click "Read" on an unread row — dot fades out, tint clears, text de-bolds, no layout jump
5. Per `.claude/rules/visual-qa.md`: spawn separate QA subagent with the screenshots + checklist. Implementing agent does not self-certify.
