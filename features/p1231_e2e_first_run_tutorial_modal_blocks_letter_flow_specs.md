---
status: qa
type: task
rank: 1000067
workstream: infrastructure
created_date: '2026-09-01'
tags: [e2e, testing, letters, p1043]
delivery_stage: dev
pipeline_ran: [create-spec, dev]
drafted_by: opus
exec_model: opus
exec_effort: high
driver: anomaly
---

# P1231: A first-run tutorial modal blocks every letter-flow E2E spec

## Problem

**Situation:** `IntensityTutorialModal` (`src/app/components/letters/intensity-tutorial-modal.tsx`)
is a hard-mandatory first-run dialog — its own docblock states "ESC + backdrop blocked, no close X.
Continue is the only exit." It opens whenever the letter flow enters `point-engage` or
`remaining-point-engage` and the localStorage key `letter_intensity_preview_seen_at_v2` is unset
(`letter-flow-content.tsx:218-224` via `src/hooks/use-intensity-preview-seen.tsx:14`).

**Complication:** Every fresh Playwright context starts with empty localStorage, so the dialog fires
on **every** test that reaches an engage phase, and as a Radix dialog it makes the page beneath it
inert. Measured in the 2026-08-31 overnight run: **~155 failures across ~19 letter-flow spec files**,
including `p852-verify.spec.ts` — the verification spec for the feature that introduced the modal.
Verified by grep, not inferred: the key is read in exactly **one** source file and seeded or
dismissed by **zero** spec files.

**Question:** How does the suite express "returning user" as its default persona without also
suppressing the product's genuine first-run gate?

## Appetite

Blast radius: high — the mechanism applies to every browser context in the suite. Reversibility:
high (one config line plus one helper file; no product code changes). Decision density: zero —
no founder call; the modal's product behaviour is unchanged.

## Solution

Seed the gate for every context at the Playwright config level, so no spec file has to remember to.

- `e2e/helpers/storage-state.ts` — builds the storageState Playwright hands to every context:
  the saved auth state when one exists, merged with the tutorial key for the dev-server origin.
  Upserts rather than appends, and writes via write-then-rename because the config is evaluated
  once per worker.
- `playwright.config.ts` — `use.storageState` now always set. Previously it was `undefined`
  whenever no auth file existed, which is behaviourally identical to a storageState carrying no
  cookies and one localStorage key.
- `clearTutorialSeen(page)` — the opt-back-in for any test that wants the first-run dialog.

Deliberately **not** a per-file helper call. A helper each of ~19 files must remember to invoke is
future discipline that decays; every new letter-flow spec would have to know the rule. The config
is the one place a new spec cannot forget.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| A global seed hides a real regression in the modal | MITIGATE | `p1231-intensity-tutorial-gate.spec.ts` asserts the modal DOES appear when the key is cleared — so a modal that stopped working fails that test rather than passing silently |
| Contexts built with `browser.newContext()` might not inherit `use.storageState` | MITIGATE | Measured, not assumed: a probe read the identical config-generated timestamp from a default `page` and from a manual context on Playwright 1.57. An earlier draft shipped a helper for manual contexts on the opposite assumption; the probe disproved it and the helper was deleted |
| Blast radius across all 443 spec files | ACCEPT | Bounded by grep: the key is read by one source file and asserted by no test, so the only observable effect is that the dialog does not auto-open |
| The key name could drift from the hook's `SEEN_KEY` | ACCEPT | Both sides carry a keep-in-sync comment; a drift makes the gate test fail, which is the detection |

**Non-Goals**
- Do NOT change the modal's product behaviour, copy, or gating logic. First-run users still get it.
- Do NOT seed anything else into the shared storageState — this is one key, for one dialog.
- Do NOT modify the ~19 blocked spec files. If they still fail after the seed, they fail for their
  own reasons and belong to P1043.

## Invariants

- The suite's default persona is a RETURNING user. Any test asserting genuine first-run behaviour
  must opt in explicitly with `clearTutorialSeen`, never by relying on an empty storage default.
- A suppression ships only alongside a test that proves its counterpart still fires. Deleting
  `p1231-intensity-tutorial-gate.spec.ts`'s "cleared" case turns the seed into an unfalsifiable
  claim (epistemic gate 7c).

## Done-When

- [x] `letter_intensity_preview_seen_at_v2` is present in localStorage for a default `page` fixture
      and for a hand-built `browser.newContext()` — both measured
- [x] A test reaching `point-engage` with the seed sees no dialog and can interact with the engage
      controls beneath it
- [x] A test that calls `clearTutorialSeen` at the same phase DOES see the dialog — proving the
      first-run gate still works and that the case above passes for the right reason
- [x] Both directions run green: `p1231-intensity-tutorial-gate.spec.ts` — 2 passed
- [x] Measured A/B on a spec the triage named as modal-blocked (`p852-verify`): 3 failed / 1 passed
      without the seed → 1 failed / 3 passed with it

## Findings

**`browser.newContext()` inherits `use.storageState`** on Playwright 1.57 — Playwright applies the
config's context options to contexts built inside a test. This was assumed to be false, a helper was
written for it, the probe disproved it, and the helper was deleted before commit. The three
letter-adjacent specs that build their own contexts (`p745`, `p412`, `p272`) are where a future
Playwright change would surface.

**The rating buttons' accessible name is `Rate N`, not `N`** (`partners/shared.tsx:42`). A locator
matching bare `'7'` silently resolves elsewhere and leaves the Continue button disabled, which reads
as a hang. Worth knowing for the P1043 rewrite pass — it is a plausible cause of other bare timeouts.

**`p676-visual-corrections.spec.ts` writes to a table called `letters`**, while the maintained
helpers use `clarity_letters`. Its fixture cannot succeed. That is a second, independent reason that
file fails, on top of the stale `/continue/i` selectors recorded in P1217 — noted, not fixed here.

## Alternatives Considered

- **Per-file helper called from ~19 spec files** — rejected: it is a rule every future letter-flow
  spec must remember, and nothing enforces it. The failure mode is silent and recurring.
- **Suppressing the modal in product code under a test flag** — rejected: puts test concerns in
  `src/`, and makes the shipped component behave differently from the tested one.
- **`globalSetup` + `storageState`** — a 2026-03-12 ruling in `docs/decisions.md` rejected this
  pattern **for auth injection**, on the grounds that the per-test `setTestSession()` helper already
  existed and needed no shared state file. That ruling does not bind here: this adds no `globalSetup`
  and no auth project, and does not touch auth injection. It is also superseded on its own terms —
  P498 later shipped exactly a config-loaded storageState file (`e2e/save-auth.ts`,
  `npm run test:save-auth`), which `playwright.config.ts` already auto-loads.

## Rollback Strategy

Revert the `use.storageState` line in `playwright.config.ts`; the helper and gate spec become inert
but harmless. No product code and no database state is involved.

## Related

- **P1043** — records this diagnosis (line 337) as part of the undiagnosed remainder; this spec is
  the separable mechanical half, same carve-out as P1217.
- **P1217** — the dead-test retirement half. Its findings note `p852-verify` as "blocked by the
  P852 modal, not by staleness."
- **P498** (archived, rejected-as-delivered) — introduced the config-loaded storageState mechanism
  this extends.
