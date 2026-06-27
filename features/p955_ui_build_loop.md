---
status: in-progress
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
delivery_stage: dev
flow: dev
pipeline_plan: [create-spec, architect, generate-tests, decompose, dev]
pipeline_skipped: [challenge-prd -- adversarially reviewed twice already, ux -- dev-only harness no net-new user surface, ui -- no net-new component, view -- machine tool not user surface, spec-review -- spec fresh and tight, verify -- gate failure-path exercise is the verification]
pipeline_ran: [create-spec, architect, generate-tests, decompose, dev]
uat_file: features/uat/p955.md
test_files:
  - src/tests/p955-gate.test.ts
  - src/tests/p955-fixture.tsx
  - src/tests/p955-strictness-canary.test.ts
  - scripts/test-p955-ui-gate.sh
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

A dev-only `/tree/_gate/*` route (existing `/tree/*` convention, `import.meta.env.DEV`-gated) that renders the **real** gated component with **mock** fixtures and a URL state switch — e.g. `/tree/_gate/<surface>?phase=story-revealed` renders the real routed component with a mock snapshot, no auth, no DB seed. Reaching any gated state drops from ~5 min to ~1s. **Standalone-useful and the unblocker for the loop** — without it the gate never runs per-iteration.

**Anchor the first fixture to the next real UI work that enters the pipeline — NOT to the already-fixed letter-reveal.** The harness is a *pattern*, not a one-surface fix; building its first fixture against live work does double duty (establishes the pattern + serves a real spec). Each new UI surface adds its own fixture as it reaches the pipeline; do not pre-build a generic cross-product harness.

**Fixture lifecycle (two distinct kinds under `/tree/`, do not conflate):**
- **Gate fixtures (`/tree/_gate/*`) — permanent render substrate, machine-owned.** They are NOT throwaway prototypes. The gate's deterministic checks re-render these states on every future change to the component, so deleting one re-introduces the 5-min state-reach problem. Agents **never** prune them. They accumulate by design (like e2e fixtures / Storybook stories) and live under the reserved `/tree/_gate/` prefix, kept out of the founder's hand-built design explorations in `/tree/` root.
- **Design explorations (`/tree/*` root, e.g. `landing-v2`) — founder-curated, throwaway.** Existing behavior, unchanged; pruned by hand when dead.

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
- Do NOT build a generic cross-product harness in Phase 1 — build one fixture against the next real UI surface, generalize per-surface as each reaches the pipeline.
- Do NOT scatter gate fixtures into `/tree/` root or treat them as throwaway — they are permanent, machine-owned render substrate under `/tree/_gate/`.
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

- [ ] **Phase 1:** `/tree/_gate/<next-ui-surface>?phase=…` renders the real component on any phase in ~1s, no auth/seed, screenshot-able at 320/375/desktop in empty/typed/error states. Fixture lives under the reserved `/tree/_gate/` prefix (not `/tree/` root), and is documented as permanent render substrate the agent must not prune.
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

---

## Technical Architecture

### Technical Analysis

**Canary pattern (the template for P955's gate):** `scripts/pre-commit-checks.sh` runs on every commit via `.git/hooks/pre-commit` (symlink). Its structure is consistent across eight canaries:

```bash
STAGED_XYZ=$(echo "$STAGED_FILES" | grep -E '<pattern>' || true)
if [ -n "$STAGED_XYZ" ]; then
    if ! run_quiet "Label (PNnn)" bash scripts/test-xyz.sh; then
        ERRORS=$((ERRORS + 1))
    fi
else
    echo ">>> Label skipped (no xyz files staged)"
fi
```

`run_quiet` (line 62) suppresses stdout on success; shows last 30 lines on failure. `STAGED_FILES` is captured once via `git diff --cached --name-only --diff-filter=d` (line 119). Existing canaries: worktree-setup (P783), git-ops extensions (P787), git-ops ship (P788), SIGTERM orphan reap (P924), lib-datetime UTC (P787b), migrate.sh prod-gates (P887, uses `npx vitest run`), typecheck gate (P861), Playwright tail-pipe hook (P911), edge-function secrets parser (P834). BUILD_AFFECTING gating (line 88) skips typecheck/build/unit-tests for docs-only commits via a whitelist `grep -E '.ts|.tsx|...'`.

**`/tree/*` convention (current state, `src/App.tsx` lines 783–815):** All prototype routes are `{import.meta.env.DEV && <Route path="/tree/..." .../>}`, lazy-loaded via `import()`. Comment at line 794: "One prefix: `/tree/*`. Never invent another." Existing routes: `design-audit`, `landing-v2..v4`, `position-buttons`, `loading-demo`, `usp-contrast`, `new-live`, `old-landing`, `404-drift`, `404-glitch`, `404-compass`. Gate fixtures go under `/tree/_gate/` — the reserved sub-prefix keeps them separate from founder-curated explorations.

**Advisory gate (current state — the decay that P955 fixes):**
- `dev.md:744`: "design-quality fails **advisory — don't block**, but recommend `/verify`"
- `dev.md:745`: Chrome MCP unavailable → "**proceed** to step 4"
- `fix.md:465`: browser verification requires "screenshot path **OR** explicit `N/A: [reason]`" — the OR clause is the softening
- `fix.md:641`: Chrome unavailable → "state: 'browser check blocked — run `/verify` before `/ship`'" and advance to step 6

These four phrases are the exact targets for the strictness canary (Phase 2g). They pass vacuously today; the canary will fail red against these files when committed.

**Visual-QA checklist:** `.claude/rules/visual-qa.md` — 13-item checklist including overflow, clipping, touch targets (≥40px noted, spec raises to ≥44px), contrast. Two checks missing: one-primary-action count and no-dead/disabled-in-empty-state — to be added by Phase 2(b).

---

### Architecture Decisions

#### AD-1: Choke-point mechanism — RECOMMENDATION PENDING FOUNDER DECISION

**Two options; recommendation is pre-commit hook.**

**Option A: Pre-commit hook (recommended)**
- **Chosen rationale (ranked):** Correctness — fires on ALL commit paths: `/dev`, `/fix`, inline edits, direct-to-branch. The P952 breakage was a late inline commit (`f98742cd`) that never reached the `/dev` UAT step. A pre-commit hook would have caught it.
- **How it fires:** Staged-file grep detects UI render-path changes → runs `scripts/test-p955-ui-gate.sh` via `run_quiet`. Gate diffs the whole branch (`git merge-base main HEAD`..HEAD) for the full component surface; checks deterministic DOM assertions against `src/tests/p955-gate.test.ts` via `npx vitest run`.
- **Coverage:** `/dev` (every commit), `/fix` (every commit), inline/direct-to-main (every commit) — spec 2(c) fully satisfied.
- **Latency:** Vitest + jsdom render: ~2–4s. Acceptable; matches existing migrate.sh canary pattern.
- **Bypass risk:** `--no-verify` is banned in `.claude/rules/git.md` and blocked by `block-prod-deploy.sh`. Agent cannot self-grant.
- **Trade-off:** Cannot fire on a `git push` that skips a local commit (remote push without local pre-commit). Mitigated: CI reruns pre-commit-checks.sh as a required step (P919 server-side check on `main`).

**Option B: `/ship`-gate (not recommended)**
- **Coverage gap:** `/ship` fires only at merge time. Inline commits, mid-`/dev` partial commits, `/fix` commits, and direct-to-branch work all ship without triggering it. This is the documented P952 failure mode.
- **Acceptable use:** Perceptual critic (Chrome, heavier, advisory) fits here — it's already advisory and not time-sensitive. This is already `/dev`'s UAT step.
- **Verdict:** Does NOT satisfy spec 2(c) ("fires across `/dev` + `/fix` + inline/direct commits"). Rejected for the blocking deterministic checks.

**[FOUNDER DECISION]:** Option A (pre-commit hook) is recommended. If you prefer the lighter touch of Option B knowing its coverage gap, the perceptual-only gate can live there; but the deterministic blocking check must be at the pre-commit boundary to satisfy 2(c). These are not mutually exclusive: A handles deterministic blocking; B hosts the advisory perceptual pass after merge.

**Security reconciliation — a SECOND founder decision (raised by the security pass, see Security Review):** Option A is a *local* hook. The spec's own "forgery-proof boundary" / "cannot decay" requirement is **not satisfiable by a local hook alone** — `--no-verify` skips it and the `.ui-gate-override` sentinel is forgeable by any agent with Write access. The proven non-decayable boundary is a **server-side required CI check on `main`** (the P919 `audit-privacy`/`privacy-scan` pattern: a GitHub Actions workflow re-running the deterministic checks, `bypass_actors: []`). Two scope levels:
- **A1 (local hook only):** matches existing canary infra; fast to build; "cannot decay" holds for the cooperative/accidental case only. The adversarial/`--no-verify` path stays open.
- **A2 (local hook + server-side required check):** honors the spec's literal "forgery-proof boundary" invariant; adds one GitHub Actions workflow + a branch-protection required check (mirrors P919). Larger surface, but it is the only level that makes the gate's headline claim true.

**✅ FOUNDER DECISION (2026-06-27): A2 — local hook + server-side required CI check.** The deterministic checks run both as a pre-commit hook (fast local feedback) AND as a GitHub Actions required status check on `main` (`bypass_actors: []`, mirroring P919). This is the only level at which the spec's "forgery-proof boundary / cannot decay" language is literally true. Phase 2i is now a required build step, not conditional.

---

#### AD-2: DOM check execution mechanism — vitest + React Testing Library

**Chosen:** vitest + React Testing Library (jsdom).

**Rationale:**
- Chrome-independent (spec 2d non-negotiable): jsdom renders the React component tree without a browser process. Deterministic checks (button count, disabled state, overflow, touch target size via computed style) all work in jsdom.
- Speed: ~2–4s for a component render suite. Matches existing `npx vitest run src/tests/p887-reproduce.test.ts` pattern in the migrate.sh canary. Compatible with `run_quiet`.
- CI reproducibility: no browser binary dependency. Consistent across local, cloud worktrees, and CI.
- No server needed: RTL renders the component tree directly via import — no `vite dev` process required at commit time.

**Alternative rejected — Playwright against `/tree/_gate/*`:**
- Requires either a running dev server or a `vite preview` step before the check — adds 10–20s and a process-management dependency to the pre-commit hook.
- Browser-dependent: contradicts spec 2(d) Chrome-independent requirement for deterministic checks.
- `/tree/_gate/*` route still gets built (Phase 1) for the human preview loop — the route is the manual inspection surface; vitest is the automated check surface. These are complementary, not competing.

**Implementation shape:**
```
src/tests/p955-gate.test.ts   ← vitest suite: imports the target component, 
                                 renders with mock fixture props (same state as 
                                 /tree/_gate/?phase=…), asserts DOM invariants.
```
Each DOM check is a separate `it()` so failures are per-defect and per-viewport.

---

#### AD-3: Render-path dependency detection (spec 2c)

**Chosen:** Static manifest + "when unsure, fire" fallback.

A script `scripts/gen-ui-gate-manifest.sh` generates `scripts/ui-gate-manifest.json` mapping each routed component to its transitive `.ts`/`.tsx`/`.css` imports (via `grep -r "^import"` or `vite-plugin-inspect` output). Committed to the repo and regenerated whenever a new route is added.

The pre-commit staged-file check:
```bash
UI_GATE_STAGED=$(python3 scripts/check-ui-render-path.py "$(git diff --cached --name-only)" || echo "UNSURE")
```
If `UNSURE` (manifest stale, file not found, script error) → fire the gate ("when unsure, fire"). If the staged file appears in the manifest for any routed component → fire. If `.tsx` of a routed component is staged → always fire (no manifest needed).

**Trade-off:** Manifest can go stale. The "when unsure, fire" rule means a stale manifest fires MORE, not less — this is the safe direction. Manifest regeneration is a natural `/dev` step when adding a new route.

---

#### AD-4: Forgery-proof override (spec 2f)

**Chosen:** Founder filesystem sentinel at `.ui-gate-override` (gitignored), with a hard non-overridability condition when UI files are in the diff.

Mechanics:
- `.ui-gate-override` added to `.gitignore` — never committed, never staged, never visible to CI.
- Pre-commit hook checks: if `UI_GATE_STAGED` is non-empty AND `.ui-gate-override` exists → read its expiry line (format: `expires: YYYY-MM-DD`). If expired or missing expiry → BLOCK regardless. If UI `.tsx` files are in the staged diff → BLOCK regardless (non-overridable for the P952 case: the exact invariant from spec 2f).
- Agent may print "Override available: `echo 'expires: YYYY-MM-DD' > .ui-gate-override` — requires founder action." Agent cannot create this file itself (it is outside the ALWAYS-ACT list; creating it is an infrastructure change requiring judgment/confirmation).
- Override for `.ts`-only changes (hooks/services, no `.tsx` in diff) is allowed with expiry ≤ 1 day.

**Mirrors:** The `~/.push-enabled` flag pattern from CLAUDE.md global rules.

---

#### AD-5: Strictness canary (spec 2g)

**Chosen:** Vitest test `src/tests/p955-strictness-canary.test.ts` wired into pre-commit behind a `dev.md`/`fix.md` staged-file gate.

The test reads `dev.md` and `fix.md` and asserts these strings are ABSENT. **Phrases verified against the live files 2026-06-27** (the spec's earlier shorthand differed from the real text — the canary targets the REAL strings):
- `"advisory — don't block"` (dev.md:744)
- `"take a screenshot or run visual QA subagent"` (dev.md:166 — real text; spec shorthand was "screenshot OR subagent")
- `"proceed to step 4"` (dev.md:745, Chrome-unavailable context)
- `` "OR write explicit `N/A:" `` (fix.md:465)

And asserts these tokens are PRESENT (the gate's strictness tokens):
- `"BLOCK"` in the context of deterministic UI checks
- `"p955-gate"` (confirming the gate reference exists)

**Per epistemic gate 7:** This canary must be demonstrated FAILING RED against the current (pre-fix) `dev.md`/`fix.md` before committing. Current `dev.md:744` contains "advisory — don't block" → canary will fail red. This is required evidence before the canary is trusted. The `/dev` implementation task must paste the failing output.

Pre-commit wiring:
```bash
DEVFIX_STAGED=$(echo "$STAGED_FILES" | grep -E '^\.claude/commands/slava/build/(dev|fix)\.md$' || true)
if [ -n "$DEVFIX_STAGED" ]; then
    if ! run_quiet "UI gate strictness canary (P955)" npx vitest run src/tests/p955-strictness-canary.test.ts; then
        ERRORS=$((ERRORS + 1))
    fi
else
    echo ">>> UI gate strictness canary skipped (no dev.md/fix.md staged)"
fi
```

---

### Security Review

This feature is dev/build infrastructure — no Supabase table, RLS, prod runtime, or LLM prompt. The standard RLS/auth/injection review is N/A. The security-relevant concerns are gate-integrity specific.

**Override Forgeability (primary):**
- ⚠️ **A purely-local sentinel is forgeable.** The override (`.ui-gate-override`, spec 2f) is a behavioral rule ("the agent never creates it"), not a structural barrier. Any agent with Write/shell access can create the sentinel, pass `--no-verify`, or rewrite `pre-commit-checks.sh` itself. This is the exact failure mode in `docs/decisions.md` 2026-06-10 `[technical]`: local hooks are accident-prevention, not a security boundary.
- ✅ **The real boundary is a server-side required check on `main`** (the proven P919 `audit-privacy`/`privacy-scan` pattern in `git.md`). For the gate to be genuinely non-decayable, the deterministic checks must also run as a **required CI check** (a GitHub Actions workflow, like `privacy-scan.yml`) with `bypass_actors: []`. The local sentinel/hook is cooperative-case accident-prevention; CI is the actual boundary.

**Bypass Surface (local hook vs server-side gate):**
- ⚠️ `git commit --no-verify` bypasses the pre-commit hook entirely (banned in `git.md`, but behavioral). A gate living only in `pre-commit-checks.sh` is silently skippable — the same decay class as P655's softening. The strictness canary (2g) guards the gate's *text*, not the hook *invocation*.
- ✅ Closure = the server-side required check. Until it lands, "cannot decay" holds only for the cooperative/accidental case, not adversarial or `--no-verify`.

**Harness Prod-Reachability:**
- ✅ `import.meta.env.DEV`-gating required, same-line form load-bearing (the existing P872 "ungated prototype route guard" in `pre-commit-checks.sh` + `.claude/rules/src.md`). A prod Vite build strips `/tree/_gate/*` and its fixture modules via tree-shaking.
- ⚠️ **Mock fixtures must use obviously-fake values** (`user-id-1234`, `test@example.com`), never realistic production shapes — fixtures live in the public repo. `audit-privacy.sh` catches some patterns but realistic mock data is a persistent authoring risk. Add a fixture-authoring rule.

**Canary Integrity:**
- ⚠️ **Defeatable by semantic rephrasing.** The strictness canary matches exact softening *phrases*; novel wording with the same meaning ("design issues are surfaced, not gated") passes. It raises the cost of *accidental* re-softening (the P655 copy-the-phrasing case) but is not semantically complete. Treat as tripwire, not complete gate.
- ✅ The epistemic-gate-7 requirement (demonstrate it failing red against current pre-fix `dev.md`/`fix.md`) is correct and load-bearing — it proves the grep pattern actually fires.

**Overall:** The "cannot decay" claim holds for the cooperative/accidental case at the local-hook layer. The structural gap — a forgeable local sentinel and a `--no-verify`-skippable hook — closes only with a **server-side required CI check on `main`**. This is a security finding that should be reconciled into the choke-point decision (AD-1) and the Build Sequence, not deferred.

---

### Implementation Approach

**Worktree recommended:** This feature touches `.claude/commands/slava/build/dev.md`, `.claude/commands/slava/build/fix.md`, `.claude/rules/visual-qa.md`, `scripts/pre-commit-checks.sh`, `src/App.tsx`, and new test/script files — 8+ files across skill, rule, script, and source directories. Co-tenant session collisions are likely during a multi-day build. Use a worktree.

#### Build Sequence

1. **Phase 1 — Harness route + first fixture** (prerequisite, standalone-useful)
   - Add `/tree/_gate/<next-ui-surface>` route to `src/App.tsx` (DEV-gated, lazy-loaded)
   - Create fixture component at `src/app/tree/_gate/<surface>/GateFixture.tsx` — renders real component with mock props, URL-driven phase switch
   - Verify: `npm run dev` → navigate to `/tree/_gate/<surface>?phase=story-revealed` renders in ~1s, no auth

2. **Phase 2a/b — DOM assertions + visual-qa.md additions**
   - Write `src/tests/p955-gate.test.ts`: four `it()` blocks for each deterministic check, rendered against the mock fixture component (not the harness route)
   - Add two lines to `.claude/rules/visual-qa.md`: one-primary-action count rule, no-dead-disabled-in-empty-state rule
   - Demonstrate FAILING red against a P952 fixture (Phase 2h)

3. **Phase 2c — Pre-commit wiring + render-path detection**
   - Add `scripts/check-ui-render-path.py` (manifest lookup)
   - Run `scripts/gen-ui-gate-manifest.sh` to generate `scripts/ui-gate-manifest.json`
   - Add the UI gate block to `scripts/pre-commit-checks.sh` (after existing canaries, before secrets scan)

4. **Phase 2d — Chrome-independent pass path verification**
   - Force Chrome unavailable: `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1` or rename binary
   - Confirm deterministic checks still pass/fail; perceptual pass logged as `chrome-unavailable: deferred`

5. **Phase 2e — Test-validity check**
   - Extend `src/tests/p955-gate.test.ts`: assert covering test exists for changed view's primary action; assert it is not render/invocation-only

6. **Phase 2f — Override sentinel**
   - Add `.ui-gate-override` to `.gitignore`
   - Add override-check logic to the UI gate block in `pre-commit-checks.sh`

7. **Phase 2g — Strictness canary**
   - Write `src/tests/p955-strictness-canary.test.ts`
   - **Paste failing red output** against current `dev.md`/`fix.md` before committing
   - Update `dev.md` and `fix.md` to replace softening phrases with blocking language
   - Wire canary into `pre-commit-checks.sh` behind dev.md/fix.md staged-file gate
   - Commit dev.md/fix.md changes; canary now passes green

8. **Phase 2h — Gate failure-path exercise**
   - Create P952 fixture (two competing primary-action buttons + disabled submit in empty state)
   - Run gate; paste per-defect FAIL output for each deterministic check
   - Record perceptual critic verdict (non-blocking, ceiling documentation)

9. **Phase 2i — Server-side required check (A2, founder-confirmed 2026-06-27)**
   - Add `.github/workflows/ui-gate.yml` re-running the deterministic checks on PRs/pushes to `main` (mirror `privacy-scan.yml` / P919)
   - Configure branch protection: `ui-gate` as a required status check, `bypass_actors: []`
   - Add fixture-authoring rule (mock data must use obviously-fake values, per Security Review) to `.claude/rules/src.md` or the fixture doc

#### Files to Create

| Path | Purpose |
|------|---------|
| `src/app/tree/_gate/<surface>/GateFixture.tsx` | First harness fixture (Phase 1) |
| `src/tests/p955-gate.test.ts` | DOM assertion suite for deterministic checks (Phase 2a/b/e) |
| `src/tests/p955-strictness-canary.test.ts` | Anti-decay canary: asserts softening phrases absent from dev.md/fix.md (Phase 2g) |
| `scripts/check-ui-render-path.py` | Render-path detection: manifest lookup + "when unsure, fire" (Phase 2c) |
| `scripts/gen-ui-gate-manifest.sh` | Generates ui-gate-manifest.json from transitive imports (Phase 2c) |
| `scripts/ui-gate-manifest.json` | Committed manifest: route → transitive dep paths (Phase 2c) |
| `.github/workflows/ui-gate.yml` | Server-side required check (Phase 2i, A2 — founder-confirmed) |

#### Files to Modify

| Path | Change |
|------|--------|
| `src/App.tsx` | Add `/tree/_gate/<surface>` DEV-gated lazy route (Phase 1) |
| `scripts/pre-commit-checks.sh` | Add UI gate block + strictness canary block (Phases 2c, 2f, 2g) |
| `.claude/commands/slava/build/dev.md` | Replace advisory/proceed softening with blocking language; add p955-gate reference (Phase 2g) |
| `.claude/commands/slava/build/fix.md` | Replace OR-N/A softening at lines 465/641 with hard gate language (Phase 2g) |
| `.claude/rules/visual-qa.md` | Add one-primary-count and no-dead-disabled rules (Phase 2b) |
| `.gitignore` | Add `.ui-gate-override` (Phase 2f) |

## Test Coverage Strategy

**This is gate/build infrastructure — the tests ARE largely the deliverable.** No generic E2E/a11y/DB-migration tests (no product user surface, no schema). Coverage centers on the gate's own assertion suite + the anti-decay canary + the failure-path proof.

**What's tested (and why):**
- ✅ **`src/tests/p955-gate.test.ts`** — the four deterministic DOM checks (one-primary, no-dead-disabled, no-overflow-320, ≥44px touch) as exported reusable assertions, PLUS the spec-2e test-validity shape check. Includes the **failure-path proof** (spec 2h / epistemic gate 7): each assertion is run against the P952 fixture and asserted to `.toThrow()` — proving the check fires, not just that the happy path is green.
- ✅ **`src/tests/p955-strictness-canary.test.ts`** — anti-decay guard (AD-5). **RED by design until Phase 2g** edits `dev.md`/`fix.md`; that red state is the epistemic-gate-7 proof. Turns green after the softening phrases are replaced; permanent regression guard thereafter.
- ✅ **`src/tests/p955-fixture.tsx`** — P952 defect component (two competing full-width primaries + disabled submit in empty state). Mock data uses obviously-fake values (`test@example.com`, `user-id-1234`) per Security Review.
- ✅ **`scripts/test-p955-ui-gate.sh`** — shell entry point exercising the pre-commit failure path (non-zero exit on defect), mirroring `scripts/test-typecheck-gate.sh`.
- ✅ **`features/uat/p955.md`** — 7 founder UAT scenarios: gate blocks P952 defect (A), passes clean commit (B), `.ts`-only render-path change fires (C), Chrome-unavailable defers perceptual only (D), canary goes red on re-softening (E), override non-overridable with `.tsx` in diff (F), server-side `ui-gate` required on main with empty bypass_actors (G).

**What's NOT tested (and why):**
- ❌ Phase 1 harness route rendering — verified by `npm run dev` + manual nav, not automated (it's the substrate, not the unit under test).
- ❌ Playwright/browser tests — vitest+jsdom is the Chrome-independent automated path (AD-2); real 320px overflow + touch-target layout is confirmed manually in UAT-D.
- ❌ E2E / a11y / DB-migration — no product surface, no schema.

**Important red-state note for `/dev`:** Two suites (`p955-gate.test.ts` failure-path block, `p955-strictness-canary.test.ts`) are intentionally authored to PROVE failure. The canary stays red until Phase 2g; do not "fix" it by weakening assertions — fix it by editing `dev.md`/`fix.md`. Paste the red output before the 2g edit as required evidence.

---

## Consistency Check Results

**Done-When → Build Step coverage (all 8 checkboxes mapped):**

| Done-When checkbox | Build step | Status |
|--------------------|------------|--------|
| Phase 1: harness route renders real component ~1s, no auth, at 320/375/desktop | Build step 1 (Phase 1 route + fixture) | COVERED |
| Phase 2(a/b): gate BLOCKs on deterministic checks; perceptual surfaced not blocking; two new visual-qa.md lines | Build step 2 (DOM assertions + visual-qa.md) | COVERED |
| Phase 2(c): gate fires on `.ts` render-path changes across /dev + /fix + inline, diffing whole branch | Build step 3 (pre-commit wiring + render-path detection) | COVERED |
| Phase 2(d): deterministic checks pass/fail without Chrome; Chrome-unavailable defers only perceptual with logged marker | Build step 4 (Chrome-independent pass-path) | COVERED |
| Phase 2(e): gate FAILs on red/unrun test and on render/invocation-only assertion | Build step 5 (test-validity check) | COVERED |
| Phase 2(f): override is founder filesystem action, non-overridable with UI files in diff, agent cannot self-grant | Build step 6 (override sentinel) | COVERED |
| Phase 2(g): strictness canary committed, demonstrated FAILING RED against current pre-fix dev.md/fix.md | Build step 7 (canary + dev.md/fix.md edits) | COVERED |
| Phase 2(h): gate shown BLOCKING on P952 fixture, per-defect output pasted; green alone does not close | Build step 8 (gate failure-path exercise) | COVERED |

**Security blocker check (AD-1 A2 founder-confirmed 2026-06-27):**
Phase 2i (`.github/workflows/ui-gate.yml` + branch protection) is present as Build step 9 and maps to a required task below. The security finding from the Security Review section ("the real boundary is a server-side required check on main") is elevated to a mandatory deliverable, not a conditional. CONFIRMED COVERED.

**UX-drift check:** N/A — `type: task` infrastructure spec, no UX layer, no `## UX Design` section. Explicitly in `pipeline_skipped`.

---

## Implementation Tasks

**Total: 9 tasks. Sequential chain: T1 → T2 → T3 → T5 → T6 → T7 → T9. Parallel within phase: T4 (after T3), T8 (after T2). T9 is the final required CI task.**

---

### T1 — Phase 1: Harness route + placeholder fixture

**Scope:** Add the `/tree/_gate/` route infrastructure to `src/App.tsx` and create a placeholder `GateFixture.tsx` that demonstrates the pattern. The first real surface-specific fixture attaches when the next UI feature enters the pipeline — this task establishes the harness pattern only. Document the fixture as permanent render substrate (not throwaway) in a comment.

**Files:**
- MODIFY `src/App.tsx` — add `{import.meta.env.DEV && <Route path="/tree/_gate/*" .../>}` lazy route under the existing `/tree/*` block (lines 783–815)
- CREATE `src/app/tree/_gate/example/GateFixture.tsx` — placeholder fixture rendering a mock component with URL-driven phase switch (`?phase=` param), using obviously-fake values (`test@example.com`, `user-id-1234`) per Security Review

**Spec refs:** `### Phase 1` (lines 59–68), `#### Build Sequence step 1` (lines 311–314), `#### Files to Create row 1` (line 356), Security Review harness prod-reachability (lines 293–295)

**Tests:** None automated — verified by `npm run dev` + manual nav to `/tree/_gate/example?phase=default`. Covered by UAT scenario A (gate blocks P952 defect) indirectly.

**Depends on:** None — first task.

**Verify:** `npm run dev` → navigate to `/tree/_gate/example` → component renders in ~1s with no auth prompt.

- [ ] Complete

---

### T2 — Phase 2(a/b): DOM assertion suite + visual-qa.md additions

**Scope:** Verify the already-written test files pass (p955-gate.test.ts, p955-fixture.tsx). Add two missing check lines to `visual-qa.md`. The fixture and gate test are ALREADY WRITTEN by /generate-tests — this task verifies they pass (or fail in the expected places), not rewrites them.

**Files:**
- VERIFY `src/tests/p955-gate.test.ts` — already exists; run `npx vitest run src/tests/p955-gate.test.ts` and confirm the `.toThrow()` failure-path blocks pass (they assert the P952 fixture triggers each check)
- VERIFY `src/tests/p955-fixture.tsx` — already exists; confirm it uses obviously-fake values and has the two competing primary buttons + disabled submit shape
- MODIFY `.claude/rules/visual-qa.md` — add two lines to the checklist: (1) one-primary-action count rule (`count(full-width primary buttons) ≤ 1`); (2) no `disabled` submit rendered in an empty/initial state

**Note:** `src/tests/p955-gate.test.ts` and `src/tests/p955-fixture.tsx` — verify-only. Files already exist from /generate-tests. Do NOT regenerate.

**Spec refs:** `### Phase 2(a/b)` (lines 73–77), `#### Build Sequence step 2` (lines 316–320), `## Test Coverage Strategy` (lines 381–384)

**Tests:** `src/tests/p955-gate.test.ts`, `src/tests/p955-fixture.tsx`

**Depends on:** T1 (confirms harness pattern is established before assertion suite is wired)

**Verify:** `npx vitest run src/tests/p955-gate.test.ts` exits 0; `.toThrow()` blocks confirm the P952 fixture triggers each deterministic check. visual-qa.md has both new lines.

- [ ] Complete

---

### T3 — Phase 2(c): Pre-commit wiring + render-path detection

**Scope:** Create the render-path detection script, generate the manifest, and wire the UI gate block into `pre-commit-checks.sh`. Three new files + one modified file.

**Files:**
- CREATE `scripts/check-ui-render-path.py` — manifest lookup + "when unsure, fire" fallback (returns `UNSURE` on any error/stale manifest)
- CREATE `scripts/gen-ui-gate-manifest.sh` — generates `scripts/ui-gate-manifest.json` via grep of transitive imports from routed components
- CREATE `scripts/ui-gate-manifest.json` — committed manifest (route → transitive dep paths), generated by running `gen-ui-gate-manifest.sh`
- MODIFY `scripts/pre-commit-checks.sh` — add UI gate block after existing canaries, before secrets scan: staged-file grep → `check-ui-render-path.py` → run `scripts/test-p955-ui-gate.sh` via `run_quiet`

**Spec refs:** `#### AD-3` (lines 224–233), `#### Build Sequence step 3` (lines 322–325), `#### Files to Create rows 4–6` (lines 361–363), `#### Files to Modify row 2` (lines 369)

**Tests:** `scripts/test-p955-ui-gate.sh` (already written by /generate-tests — verify-only), `src/tests/p955-gate.test.ts`

**Depends on:** T2 (gate test suite must be verified passing before wiring it into pre-commit)

**Verify:** Modify a `.tsx` file in a routed component path → `./scripts/pre-commit-checks.sh` fires the UI gate block (verify via `run_quiet` output in pre-commit log).

- [ ] Complete

---

### T4 — Phase 2(d): Chrome-independent pass-path verification

**Scope:** Demonstrate deterministic checks pass/fail without Chrome. Force Chrome unavailable and confirm the gate still blocks/passes on deterministic checks while logging `chrome-unavailable: deferred` for the perceptual pass. This is a verification task, not new code.

**Files:**
- No new files — this task verifies existing behavior of `src/tests/p955-gate.test.ts` + `scripts/test-p955-ui-gate.sh` under a Chrome-unavailable condition
- Paste the output as evidence in this task's verification note

**Spec refs:** `### Phase 2(d)` (lines 80–81), `#### Build Sequence step 4` (lines 327–329), `#### AD-2` (lines 198–217), Done-When Phase 2(d) (line 121)

**Tests:** `src/tests/p955-gate.test.ts` (verify-only), `scripts/test-p955-ui-gate.sh` (verify-only)

**Depends on:** T3 (pre-commit block must exist before Chrome-unavailable path can be exercised end-to-end)

**Verify:** `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npx vitest run src/tests/p955-gate.test.ts` exits with deterministic checks still pass/fail as expected; perceptual pass logs `chrome-unavailable: deferred`.

- [ ] Complete

---

### T5 — Phase 2(e): Test-validity check

**Scope:** Extend `src/tests/p955-gate.test.ts` with the test-validity shape check — assert a changed view's primary action has a covering test, that it is not render/invocation-only, and that no covering test is red/unrun.

**Files:**
- MODIFY `src/tests/p955-gate.test.ts` — add test-validity `it()` blocks (spec 2e shape: red/unrun test → gate FAILs; render/invocation-only assertion → gate FAILs)

**Spec refs:** `### Phase 2(e)` (line 83), `#### Build Sequence step 5` (lines 331–332), Done-When Phase 2(e) (line 122)

**Tests:** `src/tests/p955-gate.test.ts`

**Depends on:** T3 (wired gate must exist before test-validity extension is meaningful)

**Verify:** A mock test that only calls `render()` + `screen.getByRole()` without asserting a post-action effect triggers the test-validity check FAIL.

- [ ] Complete

---

### T6 — Phase 2(f): Override sentinel

**Scope:** Add `.ui-gate-override` to `.gitignore` and wire the override-check logic into the UI gate block in `pre-commit-checks.sh`. The sentinel is a founder filesystem action — the agent never creates it.

**Files:**
- MODIFY `.gitignore` — add `.ui-gate-override` entry
- MODIFY `scripts/pre-commit-checks.sh` — add override-check logic: if `.ui-gate-override` exists AND `.tsx` files in staged diff → BLOCK regardless; if `.ui-gate-override` exists with valid unexpired `expires:` line AND only `.ts` changes (no `.tsx`) → allow with log

**Spec refs:** `#### AD-4` (lines 239–247), `#### Build Sequence step 6` (lines 334–336), `#### Files to Modify rows 5–6` (lines 373, 375), Done-When Phase 2(f) (line 123)

**Tests:** `src/tests/p955-gate.test.ts` (the non-overridable invariant is covered by the `.toThrow()` blocks on `.tsx`-in-diff scenarios)

**Depends on:** T3 (override logic lives inside the UI gate block added in T3)

**Verify:** Create `.ui-gate-override` locally → stage a `.tsx` file → `./scripts/pre-commit-checks.sh` → gate still BLOCKS (non-overridable for `.tsx` in diff).

- [ ] Complete

---

### T7 — Phase 2(g): Strictness canary + dev.md/fix.md edits

**Scope:** Verify the already-written strictness canary file (`src/tests/p955-strictness-canary.test.ts`) fails RED against the current pre-fix `dev.md`/`fix.md`. Paste the failing output. Then edit `dev.md` and `fix.md` to replace softening phrases with blocking language. Wire the canary into `pre-commit-checks.sh` behind a `dev.md`/`fix.md` staged-file gate. Commit; canary now passes green.

**Files:**
- VERIFY `src/tests/p955-strictness-canary.test.ts` — already exists from /generate-tests; confirm it fails RED against current files (required evidence per epistemic gate 7)
- MODIFY `.claude/commands/slava/build/dev.md` — replace `"advisory — don't block"` (line 744), `"take a screenshot or run visual QA subagent"` (line 166), `"proceed to step 4"` (line 745) with blocking-gate language; add `p955-gate` reference
- MODIFY `.claude/commands/slava/build/fix.md` — replace `OR write explicit \`N/A:` (line 465) and Chrome-unavailable advance-to-step-6 (line 641) with hard gate language
- MODIFY `scripts/pre-commit-checks.sh` — add canary block (behind `DEVFIX_STAGED` gate, as in AD-5 template, lines 268–276)

**Note:** `src/tests/p955-strictness-canary.test.ts` — verify-only. File already exists from /generate-tests. Do NOT regenerate.

**Spec refs:** `#### AD-5` (lines 253–277), `#### Build Sequence step 7` (lines 338–343), `#### Files to Modify rows 3–4` (lines 370–371), Done-When Phase 2(g) (line 124)

**Tests:** `src/tests/p955-strictness-canary.test.ts` (verify-only — must be shown failing RED before dev.md/fix.md edits, then green after)

**Depends on:** T6 (pre-commit-checks.sh block must be stable before adding the canary wire)

**Verify:** (1) Paste `npx vitest run src/tests/p955-strictness-canary.test.ts` output showing RED before edits. (2) After dev.md/fix.md edits, same command exits 0.

- [ ] Complete

---

### T8 — Phase 2(h): Gate failure-path exercise (evidence paste)

**Scope:** Run the gate against the P952 fixture (already written: `src/tests/p955-fixture.tsx`) and paste the per-defect FAIL output confirming each deterministic check blocks with a non-zero verdict. Record the perceptual critic's verdict on the same fixture (ceiling documentation). This task produces evidence, not code.

**Files:**
- No new files — this task runs `npx vitest run src/tests/p955-gate.test.ts` against the P952 fixture and pastes output
- `src/tests/p955-fixture.tsx` — verify-only. File already exists from /generate-tests.

**Spec refs:** `### Phase 2(h)` (lines 89–89), `#### Build Sequence step 8` (lines 345–348), Done-When Phase 2(h) (line 125), `## Test Coverage Strategy` line 382 (`.toThrow()` blocks)

**Tests:** `src/tests/p955-gate.test.ts`, `src/tests/p955-fixture.tsx` (both verify-only)

**Depends on:** T2 (fixture and gate suite must be verified before the failure-path evidence run)

**Verify:** Paste the `npx vitest run` output showing each of the four deterministic checks FAIL against the P952 fixture. A green run alone does not close this task.

- [ ] Complete

---

### T9 — Phase 2(i): Server-side required CI check (A2, founder-confirmed)

**Scope:** Add the GitHub Actions workflow re-running the deterministic checks as a required status check on `main`. Add the fixture-authoring rule about obviously-fake mock data. This is required (A2 founder decision 2026-06-27) — not conditional.

**Files:**
- CREATE `.github/workflows/ui-gate.yml` — mirrors `privacy-scan.yml` / P919 pattern; runs `npx vitest run src/tests/p955-gate.test.ts` on PRs and pushes to `main`; `bypass_actors: []`
- MODIFY `.claude/rules/src.md` OR a new fixture-authoring doc — add rule: gate fixture mock data must use obviously-fake values (`test@example.com`, `user-id-1234`), never realistic production shapes

**Spec refs:** `#### Build Sequence step 9` (lines 349–352), `#### Files to Create row 7` (line 364), `#### AD-1 A2 founder decision` (lines 188–192), Security Review harness prod-reachability (lines 293–295), Done-When last bullet (line 126)

**Tests:** UAT scenario G (server-side `ui-gate` required on main with empty bypass_actors)

**Depends on:** T7 (canary and dev.md/fix.md edits must be committed before CI workflow is set up, so CI runs against the post-fix files)

**Verify:** GitHub Actions workflow file exists; branch protection note in the spec/PR confirms `ui-gate` is set as required check with `bypass_actors: []`. (Branch protection itself is a GitHub console action — document in the PR, do not automate.)

- [ ] Complete

---

**Summary:** 9 tasks total. Sequential chain: T1 → T2 → T3 → T5 → T6 → T7 → T9. Can run in parallel after their dependencies: T4 (after T3, independent of T5), T8 (after T2, independent of T3). Tasks T2, T7, T8 include verify-only artifacts already written by /generate-tests — /dev must NOT regenerate those files, only verify and extend where noted.
