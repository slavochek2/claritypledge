---
paths:
  - "features/**/*.md"
---

# Feature Spec Rules

## Frontmatter (Required on all feature files)

```yaml
---
status: week          # REQUIRED: kanban column
type: story           # REQUIRED: story | bug | task | comment
rank: 7               # REQUIRED: sort order within column
tags: []              # REQUIRED: can be empty array
# completed_at: "2026-02-19"  # Add when status transitions to done
---
```

## Status Values

`backlog` → `week` → `today` → `in-progress` → `blocked` → `qa` → `done` → `all-done`

- When `status: qa` → feature is implemented, awaiting user review before shipping. Run `/ship pN` to merge and close — **whether the work is on a feature branch or on `main` with no branch** (`/dev` step 0 routes skill-file specs to main deliberately; `git-ops.sh`'s P920 arm closes those in place). **Hard gate:** before setting `qa`, all `## Acceptance Criteria` **and** `## Done-When` checkboxes must be `[x]` and `pipeline_ran` must contain `dev` or `fix`. If any `[ ]` remain (or neither `dev` nor `fix` has run), do not set `qa` — report the unchecked items. Written by `/dev` (UAT gate), `/fix` (Feature QA Gate) and `/verify` (a PASS may not transition a feature to `qa` while these are unmet — return BLOCKED-by-state and list the gaps instead of PASS).

- **`status:` is advisory — it drives the kanban's display and nothing else.** Since P1169, `ship-gates.sh` gate 2.5 asserts the hard-gate conditions above directly against the spec's own text at merge time, and does not read `status:`. The gate is authoritative; the three skills above are convenience. **No skill, script or hook may gate a merge, a close or a deploy on this field** — the previous arrangement made a self-reported label load-bearing, which let a spec ship with three criteria unticked (P1141) while blocking every `/dev`-flow spec that never had the label written (P1164). Terminal statuses inherit the same rule, closing the forward-routed consequence of [decisions.md](../../docs/decisions.md) 2026-04-22.
- When `status: done` → move file to `features/done/`, add `completed_at`
- When `status: all-done` → move file to `features/done/` (same as `done`), `completed_at` not required. Use for permanently closed features that should remain visually prominent on the kanban.
- When rejected → move to `features/archive/`, set `status: rejected`
- UAT file (`features/uat/pN.md`) → always moves with its spec into `features/done/{sprint}/uat/`

## Spec Location — Worktree-First Resolution

Specs are created on main but evolve on feature branches. The feature branch copy is always >= main in freshness.

**Write rules:**
- Creation (`/create-spec`, `/create-bug`, `/change-request`): always on main
- Modification during implementation (`/dev`, `/fix`, pipeline skills): on the feature branch
- Reconciliation: `/ship` merges branch to main

**Read rule (all skills):**
When resolving a spec by P-number for implementation:
1. Check if any existing worktree contains `features/p{N}_*.md`
2. If found → enter that worktree, read the spec there
3. If not found → read from main, create new worktree as usual

**Why worktree wins:** A feature branch is ahead of main by definition. Specs get rewritten, ACs get checked, invariants get added — all on the branch. Main's copy is frozen at creation time.

## Manual Status Lock (`locked_at`)

When the kanban UI sets a status manually, it writes `locked_at: <ISO timestamp>` to frontmatter.

**CRITICAL RULE: If a feature file has `locked_at`, DO NOT change its `status` unless the user has explicitly instructed you to do so for that specific feature in this conversation.** Automated status transitions (e.g. auto-closing on `/dev` success) must be skipped for locked features. If you need to close a feature that has `locked_at`, ask the user first.

**`in-progress` is exclusively agent-set.** Only `/dev` or `/fix` may set `status: in-progress` — at the moment the run actually starts. Users should not manually drag a feature to `in-progress` on the kanban: doing so writes `locked_at`, which suppresses all automated status transitions for that feature. The correct user signal for "I want this next" is `status: today`. The agent sets `in-progress` when it picks up the work.

## Before Drafting — Grep decisions.md for the SUBJECT, not the P-number

Before writing a new spec, `grep docs/decisions.md` for the **subject matter** the spec covers —
the nouns of the problem, not its P-number.

**Why the subject and not the number:** decisions are routinely routed *forward* to a step that
does not exist yet, naming it in prose — *"belongs in the selection step above"*, *"routed to
`/architect` on P1104"*, *"the selection step owns this"*. The spec that inherits such a ruling has
no P-number at the time the decision is written, so a grep on the number returns nothing while the
ruling sits there waiting. Grep what the spec is *about*.

**Incident 2026-08-25.** The 2026-08-21 entry ends *"Rights clearance is a **selection criterion**,
not a provisioning detail, and belongs in the selection step above."* P1088 **is** that selection
step, and the ruling was not found while writing it — it surfaced four days later only because the
founder's own instinct prompted a check. Its absence had already cost a run: five of six points
shipped with nobody arguing the other half.

**Distinct from [CLAUDE.md](../../CLAUDE.md) §Before Starting Work item 5**, which scopes the
decisions.md grep to *answering questions about existing behavior*. Spec **authoring** falls outside
that scope, and that gap is what this rule closes.

## P-Number Assignment

ALWAYS run `./scripts/next-p-number.sh` — never compute manually (`ls`, `find`, or manual inspection miss `features/done/` and cause duplicate P-numbers). Script excludes `uat/` companions (share their spec's number); it scans `archive/` because rejected specs permanently own their P-number (P996). If script unavailable, warn user and halt.

## Type Classification

- `story` — user-facing functionality (new capability or enhancement)
- `bug` — something broken that needs fixing
- `task` — technical work (refactor, infra, tools, docs)
- `comment` — notes, decisions (not actionable)
- `change-request` — redesign of a shipped feature whose design was wrong; use `/change-request` to file

## Bug Spec Rewrites

When rewriting a `type: bug` spec (scope expanded, layers peeled), preserve the `## Invariants` section. It contains architectural constraints discovered during investigation that future layers must respect. Use `/create-bug` rewrite mode for structured rewrites; this rule catches ad-hoc edits.

## Optional Frontmatter: `flow`

```yaml
flow: fix    # fix | dev | inline | quick-feature
```

Records which implementation flow was chosen. Set by `/pick-flow` or the agent/human choosing the approach. `fix` = single-concern bug with confirmed root cause; `dev` = full pipeline; `inline` = too small for a skill; `quick-feature` = spec skeleton only, minimal pipeline — **legacy, read-only**: `/quick-feature` was absorbed into `/create-spec`, so `/pick-flow` no longer offers this value on new specs; it stays valid only to read/resume the 4 closed specs in `features/done/` that already carry `flow: quick-feature` as history (`grep -rl 'flow: quick-feature' features/done/`).

**When `flow:` is set, the implementing agent must validate the chosen flow still matches actual scope before starting work.** If `flow: fix` is set but the scope has grown (multiple concerns, DB migration, 5+ files), flag the mismatch and confirm before proceeding.

## Optional Frontmatter: `driver` (P1026)

```yaml
driver: heuristic    # heuristic | anomaly
```

Records **why this spec exists**: `heuristic` = planned work following the programme's pre-planned model sequence ([research-programme.md](../../docs/research-programme.md) — Positive heuristic); `anomaly` = reactive work after something broke or was refuted.

Set optionally by `/slava:build:create-spec`. Read by `/slava:maintain:programme-health` as a **ratio** — a programme working mostly off its own agenda looks different from one only ever patching.

**Never enforced.** No gate, no check, no prompt when absent — and no skill may add one. **Omit it rather than guessing**: the field's only consumer reports coverage alongside the ratio, so a thin honest sample is usable and a fabricated one silently corrupts the single signal it feeds.

## Pipeline Tracking Fields (P659)

Set by skills automatically, not manually. All use inline YAML list format `[a, b, c]`.

```yaml
delivery_stage: architect       # last skill that started on this spec
pipeline_plan: [create-spec, challenge-prd, ux, architect, generate-tests, dev, verify]
pipeline_ran: [create-spec, challenge-prd, ux, architect]
pipeline_skipped: [research-arch -- no novel tech, decompose -- under 5 files]
drafted_by: opus                # model that wrote the FIRST draft; never updated
exec_model: sonnet              # recommended model to EXECUTE the work; snapshot, never enforced
exec_effort: medium             # recommended reasoning effort
```

- **`delivery_stage:`** — name of last skill that started running. Valid values: `create-spec`, `create-bug`, `change-request`, `challenge-prd`, `ux`, `research-arch`, `architect`, `ui`, `view`, `generate-tests`, `spec-review`, `decompose`, `dev`, `fix`, `verify`, `park`, `ship`. Legacy numbered values (`1-prd`, `2-ux-review`, `3-arch-review`, `3.5-ui-review`, `4-tests-ready`, `5-decomposed`, `uat`) accepted but deprecated. `research-arch` is a **deliberately reserved placeholder** — no skill exists yet. `features/archive/p659_pipeline_delivery_tracking.md:83` recorded it as an optional pre-`architect` step at design time; the current `pick-flow/SKILL.md` carries no reference to it as of this writing. The stamp pattern gets added if a `research-arch` skill is ever built.
- **`pipeline_plan:`** — ordered skill list for this spec's flow. Set by `/pick-flow` when user confirms. Never deleted.
- **`pipeline_ran:`** — skills that started, in order. Each tracked skill appends on entry. Re-runs get `.2` suffix (`.3` for third, etc.). Matching is exact string only. Means "started" not "completed" — downstream skills verify upstream output sections exist.
- **`pipeline_skipped:`** — skills intentionally skipped, each with `--` separator and reason. Set by `/pick-flow`. Never deleted.
- **`drafted_by:`** — which model wrote this spec's **first draft**: `opus`, `sonnet`, `gemini`, `human`. Written once at creation by `/create-spec`, `/create-bug`, `/change-request`; **never updated** when another model edits or rewrites the spec — the field answers "was this draft any good", not "who touched this last". Per-edit authorship already lives in git commit trailers (`Co-Authored-By:`), so this deliberately does not log edits or reviews. Optional; absent means unrecorded, never `human`. **It is instrumentation, not a control** — it prevents nothing on its own. The control is `/challenge-prd`'s Phase 2.5 claim verification; this field only lets its false-claim count be grouped by drafter. Drop the field if that grouping stops being counted.

- **`exec_model:` / `exec_effort:`** — the recommended model and reasoning effort to **execute** this work. Distinct from `drafted_by`, which records who *wrote* the draft; these say who should *do it*. Values: `opus | sonnet | haiku | gemini` and `low | medium | high | xhigh`. Written at creation by `/create-spec`, `/create-bug` and `/change-request`, which stamp the call at the moment they classify the work type. Optional — omit rather than guess when the work shape is unclear.

  **Never enforced.** No gate, no check, no prompt when absent, and no downstream skill is obliged to obey the stamp. It is a **snapshot, not a contract**: quota, roster and the work's own shape all move, so re-run the call rather than trust a stamp on a spec that has sat in `backlog` for weeks.

  **The routing logic is NOT here.** `~/.claude/commands/recommend-model-effort.md` is the single source of truth for lanes, thresholds and delegation; `.claude/rules/model-effort.md` is the cp trigger. Do not restate their tables in this file or in any spec — a stale routing table is invisible until it has been wrong for weeks.

**Status transitions (skill-managed):**

| Event | Sets `status` to |
|-------|-----------------|
| `/dev` or `/fix` starts | `in-progress` |
| `/fix` completes (QA gate) | `qa` |
| `/verify` passes | `qa` |
| `/ship` completes | `all-done` |

**On spec close (`/ship`):** `delivery_stage` removed. `pipeline_plan`, `pipeline_ran`, `pipeline_skipped` kept as audit trail.

**Validation:** Each tracked skill checks its predecessor in `pipeline_plan` is in `pipeline_ran` before proceeding. First skill in plan skips check. If `pipeline_plan` absent (old spec), skip validation.

## Change Requests

A change request is a redesign spec for a **shipped feature whose design was wrong** (wrong visual ordering, actor confusion, duplication, hierarchy issues). Use `/change-request` to file one.

Change requests use `type: change-request` with extra frontmatter:

```yaml
changes: p422        # immediate predecessor (original or another CR)
chain_root: p400     # OPTIONAL: original non-CR spec. Omit when changes == root.
tags:
  - redesign
  - p422
```

On the predecessor (set by `/change-request` at filing time):
```yaml
superseded_by: p450  # the CR that replaces this redesign
```

**When filed from `/sim`**, also include:
```yaml
source: sim
persona: solo-founder  # which persona surfaced it
```

Use `type: change-request` (first-class kanban type, shown in purple). The `changes:` + `redesign` tag are additional distinguishers for traceability.

**When to use `/change-request` vs other skills:**
- Code is broken → `/fix`
- New capability, new user value → `/create-spec`
- Shipped feature, design was wrong → `/change-request`

### CR Chaining (CR-on-CR)

When a change-request targets another change-request (not the original spec):

**Frontmatter conventions:**
- `changes:` — always the **immediate predecessor** being redesigned
- `chain_root:` — the **original non-CR spec** at the start of the chain. Omit when `changes:` already points to the original.
- `superseded_by:` — set on the predecessor by `/change-request` at filing time. Only tracks sequential CR-on-CR redesigns of the same surface, not sibling CRs or bug fixes that also reference the predecessor via `changes:`.

**Example chain:** P400 (original) → P422 (CR of P400) → P450 (CR of P422)
- P450: `changes: p422`, `chain_root: p400`
- P422: `changes: p400`, `superseded_by: p450`
- P400: `superseded_by: p422`

**Conventions (enforced by `/change-request` skill, not automated validation):**
- `chain_root` is always a non-CR spec (`type: story`, `task`, or `bug`)
- A spec with `superseded_by` should not be implemented — the superseding CR is the active one
- Chains deeper than 4 should be consolidated into a fresh spec before implementation

**Only `type: change-request` specs trigger chain walking.** A non-CR spec with `changes:` (e.g., a `type: story` that references a predecessor) does not invoke the CR Processing Contract.

## Change-Request Processing Contract

**When processing a spec with `type: change-request` and `changes: pN`:**

1. **Walk the chain to root** — if `chain_root:` exists, read from root forward. If absent, `changes:` IS the root. Read each spec in order (root → CR1 → … → current) as read-only historical context. **Cycle guard:** track visited P-numbers; if any spec appears twice, stop and report the cycle as an error.
2. **Identify codebase state** — the codebase reflects what is **merged to main**, not what any unshipped spec describes. If a predecessor was never shipped (not in `features/done/`, or no `completed_at`), the codebase state matches the ancestor before it.
3. **Implement the delta** — this spec describes what to change relative to codebase state. Do not re-examine or re-propose settled decisions from any ancestor.
4. **Never edit ancestors** — all specs in the chain are shipped or abandoned records. Do not recommend changes to them, rewrite their sections, or suggest "going back to fix an earlier spec."

This contract applies to every pipeline skill (`/challenge-prd`, `/ux`, `/architect`, `/dev`, `/fix`, `/generate-tests`, `/spec-review`, etc.) — not just `/dev`.

## Risks ≠ Requirements for Instrumentation

A spec's `## Risks / Non-Goals` section lists POSSIBLE failure modes — NOT required mitigations. For measurement / instrumentation / baseline-collection specs, default to the minimum viable implementation (10-30 lines): one `useEffect`, no defensive listeners. Add complexity only when collected data shows a specific noise pattern blocking interpretation. Prefer dashboard-side filtering over instrumentation-side gating.

When writing a Risks section, mark each entry as `MITIGATE | ACCEPT | DEFER`. Without that label, the next agent treats all of them as requirements. Especially flag: "ACCEPT — noise tolerable for baseline."

## PII in Specs — Anonymize, Reference Private

Roles, not names for private individuals — and the pre-commit gate does not catch names. Full rule, including what it does *not* forbid: [.claude/rules/pii.md](pii.md).

## Re-read After Editing Feature Files

**Rule:** If you make more than one Edit to the same feature file in a single task, re-read the file before each subsequent Edit. The frontmatter fixer (`scripts/fix-frontmatter.py`) may run between edits (via pre-commit or manual invocation), altering the file on disk and making your previous copy stale. Skipping the re-read causes Edit to fail with an `old_string` mismatch.

## Secrets & External Services in Specs

When a spec introduces a new external API key, edge function, or third-party service secret, the spec **MUST** include a **Pre-deploy Checklist** section.

**Trigger conditions (any one is sufficient):**
- New `VITE_*` or server-side env var not yet in Vercel prod
- New Supabase edge function that calls an external API
- New third-party integration (OAuth provider, payment processor, webhook, etc.)

**Required section format:**

```markdown
## Pre-deploy Checklist

### Secrets to provision
- [ ] `VITE_EXAMPLE_KEY` — `vercel env add VITE_EXAMPLE_KEY production --token "$VERCEL_TOKEN"`

### Deploy commands
- [ ] `supabase functions deploy <name> --project-ref <ref>` (if edge function)
- [ ] Trigger Vercel redeploy (VITE_* vars baked at build time — redeploy required)

### Post-deploy verification
- [ ] Smoke test the new endpoint/function on prod
- [ ] Check Sentry for new errors in first 10 minutes
```

**Why:** VITE_* env vars are baked at build time. A secret that works in `.env.local` is silently absent in prod until explicitly provisioned AND a redeploy is triggered.
