---
status: today
type: task
rank: 250231.25
created_date: '2026-06-22'
tags:
  - infrastructure
  - process
  - ui
  - design-system
  - dev-loop
  - enforcement
  - harness
delivery_stage: create-spec
pipeline_ran:
  - create-spec
locked_at: '2026-06-24T09:36:31.342Z'
---

# P955: Fast-state harness + a blocking UI gate that cannot decay

> **Attempt #4 — read this first.** This problem has been worked three times: P657 (design-system foundation, Wave 1, **backlog/unbuilt**), P655 (pipeline skills, Wave 2, **shipped** — added the `/dev` visual critic), P656 (rendering loop, Wave 3, **parked**). Each fixed one cause and declared done; ugly UI keeps shipping (P952). This spec is grounded in a verified Stage-0 autopsy + two adversarial-review passes (2026-06-22/23). The primary cause is the one the P952 KDD already named and a prior rewrite of this spec wrongly dismissed: **state-reach cost.** Enforcement is the necessary second half. The novelty over all prior attempts is the third half: **mechanisms that stop the gate from decaying** (committed canary, forgery-proof boundary, mechanical choke-point) — which is *why* P655's gate softened to advisory and let P952 through.

## Problem

**Situation (SCQ).** Agents ship UI that is ugly and design-system-inconsistent, declaring "done" from passing tests without walking the rendered screen. P655 already shipped a `/dev` visual QA gate (screenshot 3 viewports → blind `sonnet` critic) to catch this.

**Complication — the verified multi-causal reality (not a single cause; that's how the prior three attempts failed):**

1. **State-reach cost is primary** (`decisions.md` 2026-06-22 `[process]`). The gate "[doesn't] fire because reaching the state is expensive… the bottleneck is state-reach cost, not awareness." A gated screen costs ~5 min (auth + seed + click through phases) to reach, so the per-iteration screenshot/critique loop never runs. The KDD's named fix: **a fast-state harness**, "the actual fix, not more rules."
2. **The gate is advisory and skippable — by deliberate choice.** P655 softened it in its *own* adversarial review (`p655:136`: "design issues advisory not blocking — adversarial review capped from 3 to 1"). Its text: "screenshot **OR** subagent" (`dev.md:166`), design-quality fails "**advisory — don't block**" (`dev.md:744`), Chrome-unavailable → "**proceed**" (`dev.md:745`). `/fix` has the identical hole (`fix.md:465,641`: "screenshot **OR** `N/A`").
3. **The gate lives only in `/dev`'s end-of-run UAT step.** P952's breakage came from a **late inline addition mid-`/dev`** (`f98742cd`, whose own message says the visual gate was "pending") that never reached the gate. UI also ships via `/fix`, inline edits, and direct-to-main — none gated.
4. **Two checks are genuinely missing** from `visual-qa.md`: a one-primary-action **count** rule and a "no dead/disabled control as decoration" rule — the two exact P952 defects. (So this is *partly* a knowledge gap; the honest framing is "state-reach + enforcement + two missing checks," never a single cause.)
5. **Test-validity, not test-absence.** A persistence test existed (`e2e/p904-explain-back.spec.ts:326`) but shipped **red/unrun** with the inline work — "tests pass" was true for green tests and silent about the red one.
6. **Gates here decay** unless built to stick. The ones that survived (branch-guard, privacy stamp) share three properties every decayed gate (P655's, the `/finish` stamp that went 17 days stale under routine "proceed anyway") lacked: a committed canary, a forgery-proof boundary, and a mechanical choke-point.

**Question:** What makes seeing the real screen cheap, the gate blocking-but-satisfiable, broad enough to cover every UI path, and structurally unable to silently soften back to advisory?

## Appetite

**Blast radius:** Medium-high. Adds a dev-only harness route + changes the build-gate for all UI work across `/dev`, `/fix`, and the commit boundary. No product runtime, no schema, no prod surface.

**Reversibility:** High per piece — harness is one dev route + fixtures; gate/canary changes are git-reverts.

**Decision density:** Low. The autopsy + reviews collapsed the open questions. **"Blocking on deterministic checks" is now a non-negotiable invariant, not a founder toggle** (advisory is the verified failure mode). The one real architecture call is the choke-point mechanism (pre-commit hook vs `/ship`-gate) — deferred to `/architect`.

## Solution

Two phases. Phase 2 is an indivisible bundle — shipping the gate without its anti-decay mechanisms is exactly what failed before.

### Phase 1 — Fast-state harness (the precondition; the KDD's "actual fix")

A dev-only `/tree/*` route (existing convention, `import.meta.env.DEV`-gated) that renders the **real** gated component with **mock** fixtures and a URL state switch — e.g. `/tree/letter-reveal?phase=story-revealed` renders the real `LetterFlowContent` with a mock snapshot, no auth, no DB seed. Reaching any gated state drops from ~5 min to ~1s. Scoped to the letter flow first (the live pain); generalize only when a second surface needs it. **Standalone-useful and the unblocker for the loop** — without it the gate never runs per-iteration.

*Boundary:* the harness proves *visual/interaction* usability with mock data; it does **not** prove the real persistence path. Functional/persistence proof stays in e2e (see Phase 2 test-validity).

### Phase 2 — A blocking gate that cannot decay (indivisible bundle)

**(a) Blocking on DETERMINISTIC checks only; perceptual critic stays advisory.** The gate splits its verdict:
- **Deterministic (DOM-decidable → BLOCK):** `count(full-width primary buttons) ≤ 1`; no `disabled` submit rendered in an empty/initial state; no overflow past container at 320px; touch target ≥ 44px. These are facts; blocking is safe and **Chrome-independent** (computable via Playwright/DOM without the flaky visual path).
- **Perceptual (critic judgment → SURFACE, never block):** hierarchy, density, visual-weight-vs-neighbors. The blind critic is ~26–39% reliable on these; blocking on them produces false-FAILs that train override. Surface to the founder; never gate on them.

**(b) Add the two missing checks as DOM assertions** (not rubric prose): one-primary-count and no-dead-disabled. Also add the lines to `visual-qa.md` for the perceptual/surfaced layer.

**(c) Cover every UI path, at a mechanical choke-point.** The gate fires on any change to a **route's render path** — `.tsx`/style **and** `.ts` files (hooks/services/stores/config) transitively imported by a routed component; when unsure, fire (fail toward firing). It triggers across `/dev`, `/fix`, **and inline/direct commits** via a commit/merge-boundary hook, diffing the **whole branch** (`merge-base main HEAD`..HEAD), never `HEAD~1`. Choke-point mechanism (pre-commit vs `/ship`) `[FOUNDER DECISION → /architect]`.

**(d) Chrome-independent pass path.** Deterministic checks run without Chrome. On Chrome-unavailable, the deterministic block still applies; only the perceptual pass is *deferred* with a logged `chrome-unavailable: deferred` marker (never a silent skip, never a hard block-with-no-exit that pushes the operator to `--no-verify`).

**(e) Test-validity, not presence.** The gate FAILS when a changed view's primary action has no covering test, **or a covering test is red/unrun**, **or the test asserts only render/invocation rather than the post-action effect** (persisted row / surfaced error). Mirrors the AbortError-canary lesson: assert the effect, not the no-op.

**(f) Forgery-proof override.** The throwaway exemption is a **founder filesystem action** (a sentinel the agent never creates), scoped so it is **non-overridable whenever UI files are in the diff** — the P952 case can never be waived. Agent may request + state why; never self-grant.

**(g) Committed strictness canary (the anti-decay core).** A checked-in test wired to `pre-commit-checks.sh` asserts the gate's strictness tokens are present and the softening phrases ("advisory — don't block", "screenshot OR", Chrome "proceed") are **absent** from `dev.md`/`fix.md`. Per epistemic gate 7, **demonstrate it failing red against the current (pre-fix) files** before committing. This is what stops the next well-meaning reviewer from re-softening the gate the way P655's review did.

**(h) Exercise the gate's failure path.** Before trusting it, run the gate against a **P952 fixture** (two competing pills + dead disabled submit + red persistence test) and confirm each deterministic check FAILs in isolation, blocking with a non-zero verdict + per-defect + viewport. Paste the failing output. Record the perceptual critic's verdict on the same fixture (to document its ceiling) — but it is non-blocking.

## Risks / Non-Goals

### Risks
- **Mock harness proves usability, not persistence.** — ACCEPT/MITIGATE: explicit boundary; e2e owns the real data path; the gate's test-validity check (2e) ties to real persistence tests.
- **Blocking on a flaky deterministic check stalls work.** — MITIGATE: deterministic checks are DOM/Playwright, Chrome-independent (2d); only the *perceptual* layer depends on the flaky visual path, and it never blocks.
- **The override becomes the new bypass.** — MITIGATE: forgery-proof + non-overridable when UI files changed (2f); the documented "proceed anyway" erosion is the exact thing this prevents.
- **DOM checks need stable component classes/tokens — P657 (the design-system foundation) is unbuilt.** — ACCEPT: the core checks (count full-width primaries, disabled-in-empty-state, overflow, target size) work without P657; the "reuse existing tokens/components" check is weaker until P657 lands. Flagged, not blocking (per founder scope decision). Track P657 as the substrate that would strengthen check (b).

### Non-Goals
- Do NOT run "learn good UI" research or adopt SuperDesign/open-design.ai — the standard exists; SuperDesign is the KDD's *complementary* design-in-isolation half, out of scope here.
- Do NOT build a generic cross-product harness in Phase 1 — scope to the letter flow.
- Do NOT make the perceptual critic blocking — it self-destructs at its reliability (verified).
- Do NOT ship Phase 2 partially (gate without canary/forgery-proof/choke-point) — partial shipping is the documented decay path.
- Do NOT depend on finishing P657 (founder scope decision 2026-06-24) — note the coupling, don't gate on it.
- Do NOT re-attempt the P952 reveal-moment redesign (`decisions.md` 2026-06-22 `[product]`).

### Alternatives Considered
- **"Enforcement, not knowledge" (a prior rewrite of this spec).** Rejected: over-corrected — it killed the harness and added rules, the two things the cited KDD explicitly rejects, and rested on four factual errors (P657 "shipped", persistence test "missing", citation "phantom", `/fix` ignored). State-reach cost is primary.
- **Original P955 (research → SuperDesign → harness → 3-phase rubric).** Rejected: over-scoped; the harness instinct was right, the research/divergence-tool scope was not.
- **Finish P657 first.** Deferred by founder scope decision; the core checks don't need it.

### Rollback Strategy
Phase 1: delete the `/tree/*` route + fixtures. Phase 2: git-revert the gate/canary/hook edits. No runtime or schema surface.

## Done-When

- [ ] **Phase 1:** `/tree/letter-reveal?phase=…` renders the real reveal component on any phase in ~1s, no auth/seed, screenshot-able at 320/375/desktop in empty/typed/error states.
- [ ] **Phase 2(a/b):** The gate BLOCKS on deterministic checks (one-primary-count, no-dead-disabled, no-320px-overflow, ≥44px) authored as DOM assertions; the perceptual critic is surfaced, never blocking; the two new lines exist in `visual-qa.md`.
- [ ] **Phase 2(c):** The gate fires on render-path `.ts` changes (not just `.tsx`), across `/dev` + `/fix` + inline commits, diffing the whole branch. Shown: a `.ts`-only hook change to a routed view fires the gate.
- [ ] **Phase 2(d):** Deterministic checks pass/fail without Chrome; Chrome-unavailable defers only the perceptual pass with a logged marker. Verified by forcing Chrome unavailable.
- [ ] **Phase 2(e):** The gate FAILS on a red/unrun covering test and on a test that asserts only render/invocation rather than the persisted effect.
- [ ] **Phase 2(f):** The override is a founder filesystem action, non-overridable when UI files are in the diff; the agent cannot self-grant. Shown failing to self-grant.
- [ ] **Phase 2(g):** A committed strictness canary in `pre-commit-checks.sh` is **demonstrated failing red against the current pre-fix `dev.md`/`fix.md`** (epistemic gate 7).
- [ ] **Phase 2(h):** The gate is shown BLOCKING red on the P952 fixture, each deterministic defect caught in isolation, output pasted. A green run alone does not close this.
- [ ] On the next real UI task, the founder's first showing is "confirm taste," not "discover breakage" — and at least one observed correct-BLOCK on real work is recorded before the gate is declared trusted.

## Notes

Operationalizes `decisions.md` 2026-06-22 `[process]` (state-reach cost → harness; the citation is real, in that commit) and `[product]` (drop premature reveal optimization). Predecessors: **P657** (Wave 1, design-system foundation — backlog/unbuilt; the substrate that strengthens DOM check (b)), **P655** (Wave 2 — shipped the critic this spec hardens), **P656** (Wave 3, rendering loop — parked; its golden-screenshot scope stays parked). `/architect` resolves only the choke-point mechanism; everything else is mechanical. This spec was itself rewritten after an adversarial pass caught a flawed "enforcement-only" draft — the multi-causal framing above is deliberate.
