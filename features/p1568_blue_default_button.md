---
status: qa
type: task
rank: 73.0
workstream: design-system
created_date: '2026-10-26'
tags: [design-system, buttons, lint]
disclosure: public
delivery_stage: dev
pipeline_ran: [create-spec, dev]
drafted_by: opus
exec_model: opus
exec_effort: high
driver: anomaly
---

# P1568: Blue is the default button, and a hand-coloured button cannot be committed

## Problem

**Situation:** `<Button>` with no variant renders near-black: `button.tsx` `default` is `bg-primary`, and `--primary` in `src/index.css` is `240 5.9% 10%`. The one interactive blue (`#2563eb`, P1396) only appears when an author hand-types `bg-blue-600 hover:bg-blue-700` onto the button.

**Complication:** every new button starts wrong unless its author remembers a convention nothing checks. The rules are written in four places that disagree:
- `docs/design-system.md` § Button Decision Rules (founder-approved, 7 rules).
- The same file's § Button Hierarchy table.
- The same file's colour table, near line 475, where "Secondary button" is a gray border.
- `.claude/commands/slava/build/finish/criteria/code.md:23`, which says Primary is `bg-blue-500`. P1396 settled on blue-600, so this line is wrong.

None of them covers one action inside a chat message, which is how the mirror greeting's "Give me a name" shipped gray-outlined on 2026-10-26.

> Founder (2026-10-26, paraphrased): the same button gets fixed by hand over and over; something is broken in the design system or in review.

**Question:** make the correct button the default, and make a hand-coloured one fail before commit.

## Appetite

- **Blast radius:** high. About 405 `<Button>` call sites; every button with no variant changes colour.
- **Reversibility:** git revert.
- **Decision density:** low. [FOUNDER DECISION: option A, blue becomes the default, 2026-10-26: "you do it"]

## Solution

1. **Default variant.** It becomes brand blue: `bg-blue-600 text-white hover:bg-blue-700`. Add a `dark` variant carrying the old `bg-primary` look, for buttons that must stay dark. Do not change the `--primary` token: shadcn components and form elements rely on it (ruling 2026-03-17).
2. **Sweep.**
   - Remove now-redundant hand-typed blue (`bg-blue-6xx`/`hover:bg-blue-7xx`/`text-white`) from Button call sites, including shared class constants such as `PRIMARY_CLASS`.
   - Review each Button that has no variant today. A forward step stays on the new default. A deliberately dark button gets `variant="dark"`. A real alternative gets `outline` and a back-out gets `ghost`, per the rules.
   - Record the count per outcome in the spec.
3. **One rules table** in `docs/design-system.md`:
   - Keep § Button Decision Rules and delete § Button Hierarchy and the "Secondary button" row of the colour table.
   - Add rule 8: *one action inside a message or inline content: filled blue (the default), auto width, not full width.*
   - Add example 8 to `/tree/design-buttons`.
   - `finish/criteria/code.md` links to the table instead of restating colours. Run `/slava:maintain:claude-md` first if any `.claude/rules/` file is touched.
4. **Guard.**
   - An ESLint `no-restricted-syntax` rule (no new dependency) rejects `bg-blue-*`, `bg-primary` and `bg-[#…]` in a `<Button>` `className`. The message points to the variant.
   - A unit test fails if the default variant stops rendering `bg-blue-600`.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| A button that was deliberately dark turns blue | MITIGATE | Per-site review in the sweep; screenshot sweep of main flows |
| Two blue full-width buttons on one screen (rule 1: only one) | MITIGATE | Sweep checks siblings; the p955 one-primary gate stays |
| Lint rule blocks a legitimate colour (destructive red, a tinted chip-button) | MITIGATE | Rule targets blue/primary/arbitrary-hex only; red goes through `variant="destructive"` |
| Gray `variant="secondary"` remains available | ACCEPT | Rules already say not to use it; one call site |

**Non-Goals**
- Do NOT change the `--primary` CSS token or any non-Button component's colours.
- Do NOT restyle sizes, radius or layout beyond what rule 8 or the sweep requires.
- Do NOT add `eslint-plugin-react` (held for a founder decision, decisions.md).

## Invariants

- One interactive blue: `#2563eb` (`blue-600`), hover `blue-700` (P1396). No new blues.
- At most one full-width primary per view (P955).

## Done-When

- [x] `<Button>` with no variant renders `#2563eb`. A unit test asserts it, and is shown to fail when the variant is reverted.
- [x] The lint rule fails on a known-bad `<Button className="bg-blue-600">` and passes on the whole repo.
- [x] `docs/design-system.md` has one button table with rule 8. `/tree/design-buttons` shows example 8. `criteria/code.md` no longer names a colour.
- [x] Sweep counts are recorded: hand-blue removed, buttons kept on default, moved to dark, outline or ghost.
      407 Buttons (AST parse). Hand-blue removed ~125 (incl. shared constants). Previously black, now blue: 30, each the only forward action in its view or paired with an outline/ghost sibling. To outline 0, ghost 0, dark 0 in app (dark used once on /tree/design-buttons). Left with other colour: landing-v4 "Get started" (`bg-foreground`), `ANSWER_BUTTON_CLASS` outlined-blue (3 sites), letter-primary-cta outline/link branches. `src/app/prototypes/**` (lint-ignored) keeps ~19 hand-typed blue. Lint carve-out: pale tints `bg-blue-50`/`bg-blue-100` allowed on outline/ghost hover.
- [x] Screenshots at 375, 320 and desktop of the main flows show no unintended colour change: feed, a point, chat with the mirror greeting, events, settings, letters, the live session start. A separate visual-QA subagent reviews them. Done 2026-10-26: `e2e/p1568-button-sweep.spec.ts` 7/7 (10 pages × 3 widths, plus a check that no Button keeps the old black fill, with a control on /tree/design-buttons). Two visual-QA passes (2 of 2 reported): no new rule break from this change; pre-existing breaks filed to the task inbox. The point page at 320 was re-captured alone after the sweep caught the app's offline screen under machine load.
- [x] Unit suite and pre-commit green (commit 2114bc93d passed the full pre-commit run).

## Cost Budget

Registry: the Supabase Free plan row (test has its own organisation, P1538). No Gemini call; no app code adds a request (a variant change is CSS only).

- **`e2e/p1568-button-sweep.spec.ts`, one run:** setup 1 user × ~6 (create ≈3, sign-in 1, chat list 1, mirror 1) + 1 point = **~7**. Page opens: public 3 pages × 3 widths = 9 × ~3 anon requests = **~27**; signed-in 7 pages × 3 widths = 21 × ~12 app requests (session, profile, feed or chat list, messages) = **~252**; the black-fill check opens 10 pages × ~12 = **~120**. Mirror availability edge calls ≤ 4 (one per mirror open), Realtime connections ≤ 11. Cleanup: point delete 1 + user delete ~10 = **~11**. Total **~417 requests**, ≤ 4 edge calls, 0 Gemini.
- **Fits today:** 100 runs a month ≈ 41,700 requests and ≤ 400 edge invocations, well inside the Free plan (500,000 edge invocations / month, 5 GB egress; requests themselves are unmetered). **At 10×** (1,000 runs): ≤ 4,000 edge invocations, under 1% of the limit. No upgrade needed.

## Known limitations

- The lint rule reads literals: a Button colour carried by a local variable, a function return or a prop (`className={fn()}`) is not flagged. Shared upper-case constants (`*CLASS*`) are flagged. The unit test and the reviewer checklist (`finish/criteria/code.md`) cover the rest.
- `src/app/prototypes/**` is lint-ignored and keeps hand-typed blue.
- Pre-existing button-rule breaks the sweep found on pages this change does not touch (Settings disabled Save, top-bar Tools, Live Join) are filed in the task inbox, not fixed here.

## Related

- Rulings: 2026-03-17 "CTA color is bg-blue-500, not bg-primary" (superseded for Button by this spec; blue-600 per P1396) · 2026-10-02 P1396 one interactive blue `#2563eb` · P955 one primary per view · P551 (assumed `variant="default"` was blue).
