---
status: all-done
type: task
rank: 74.0
workstream: infrastructure
created_date: '2026-08-27'
tags: [skills, naming, disagreement-pipeline, refactor]
pipeline_ran: [create-spec, dev, ship]
drafted_by: opus
exec_model: sonnet
exec_effort: medium
driver: heuristic
completed_at: 2026-08-27
---

# P1165: Disagreement Pipeline stages live in one namespace

## Problem

The five stages of the Disagreement Pipeline are scattered across `content/` under three
different naming shapes — `points-select`, `points-prepare`, `points-publish`,
`positions-create`, `story-create` — so nothing in the name says they are one chain, and
`content/` holds fourteen unrelated siblings that a prefix search cannot distinguish from
pipeline stages.

> Founder framing, verbatim: *"the stages are one pipeline and must read as one pipeline"* —
> splitting the naming *"doesn't make sense."*

Approved as **P1161 D4, founder decision 2026-08-27**, reordered to run **first** — before the
event and before the first topic run — with nothing else in flight. An earlier draft of P1161
made deferral a Non-Goal; that was the spec author's judgement, never a founder decision, and it
is reversed.

## Appetite

**Blast radius:** medium — five live skill files plus every reference to them; a missed reference
breaks a stage at invocation time, not at commit time. **Reversibility:** high — `git revert`, no
data touched (see Non-Goals). **Decision density:** two scope calls, both taken 2026-08-27 (see
Alternatives Considered); zero remaining.

## Solution

Move the five stages into a new `disagreement/` namespace, every stage carrying the prefix.
Target shape `/slava:disagreement:<stage>`:

| From | To |
|---|---|
| `content/points-select.md` | `disagreement/select.md` |
| `content/points-prepare.md` | `disagreement/prepare.md` |
| `content/positions-create.md` | `disagreement/positions.md` |
| `content/story-create.md` | `disagreement/story-draft.md` |
| `content/points-publish.md` | `disagreement/publish.md` |

The deliberately-unbuilt `/points-run` orchestrator is renamed **in reference only** to
`/slava:disagreement:run`, so its name matches the family when it is eventually built. It stays
deferred (P1156 decision 2d).

The skill-namespace list gains `disagreement/` in **both** places it is duplicated —
`CLAUDE.md:272` and `.claude/rules/skills.md:54`. Both go through `/slava:maintain:claude-md`;
the gate is mandatory and neither file is edited directly.

**FOUNDER DECISION 2026-08-27 — the story stage is `story-draft`, not `story`.** `.agents/skills/`
is a **flat, name-keyed** projection (`derive_name()` uses the filename; duplicate names are a hard
fail), and `/slava:content:story` — an unrelated session-capture skill — already owns `story`.
`disagreement/story.md` therefore could not be projected at all. Options put to the founder: rename
the leaf to `story-draft`, free the name by moving `content/story`, or keep `story-create`. Chosen:
`story-draft` — every stage still carries the namespace prefix and nothing outside the pipeline is
touched.

## Invariants

- **`.agents/skills/` is a generated, committed projection of `.claude/commands/slava/`**
  (`scripts/sync-agent-skills.sh`; its own header: *"NEVER hand-edit anything under
  `.agents/skills/` — regenerate"*). The eight affected `SKILL.md` files are produced by running
  the sync script, never by `git mv`. `pre-commit-checks.sh` check 22 fails the commit if the
  projection drifts from source.
- **Renames are staged with `git mv`, and verified with `--no-renames`.** `git status --short`
  and `git diff --cached --name-only` both collapse a staged rename into one line by default,
  which hides a half-staged move (`.claude/rules/git.md`).

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| `points-*` matches only three of the five stages | MITIGATE | `positions-create` and `story-create` are named explicitly in every sweep; never derived from a `points-*` glob |
| `story*` over-matches five unrelated siblings | MITIGATE | `story-gate`, `story-to-image`, `sifter-story`, `story.md` and `story-create` all match. Never glob `story*` — match `story-create` and `/slava:content:story-create` as whole tokens |
| A missed reference breaks a stage at invocation | MITIGATE | `src/tests/p1156-points-chain-contract.test.ts` hardcodes all five paths and the `/slava:content:` prefix; updating it and watching it pass is the proof. Plus a repo-wide grep for zero survivors |
| The rename lands mid-preparation for the Chiang Mai event | ACCEPT | Founder decision 2026-08-27 — reordered to run first, alone, so the first end-to-end pipeline run is also the rename's proof |
| Closed specs keep the old command names | ACCEPT | Founder decision 2026-08-27 — they record what was true when shipped |

**Non-Goals**
- Do NOT rename `.points-run-seals/` or `.private/points-runs/`. Founder decision 2026-08-27:
  these are on-disk artifact paths, not command names. `.points-run-seals/` holds a live seal
  (`ea-pair-chiangmai-2026-08-21.sha256`) that `select` and `prepare` verify by literal path;
  `.private/points-runs/` holds three real run files. 58 of the 62 `points-run` occurrences are
  these two paths.
- Do NOT rewrite `features/done/` (8 files) or `features/archive/` (2 files). Founder decision
  2026-08-27.
- Do NOT touch anything else in P1161 — no topic sourcing, no pipeline run, no goals amendment.
- Do NOT build `/points-run` / `/slava:disagreement:run`. Rename the reference; leave it deferred.
- Do NOT change any stage's content beyond its own name, its siblings' names, and the namespace
  prefix. No content edits, no restructuring, no fixing things noticed in passing.
- Do NOT edit `CLAUDE.md` directly — run `/slava:maintain:claude-md` first.

## Migration Plan

1. `git-ops.sh claim p1165` — branch + worktree, created atomically.
2. `git mv` the five files into `.claude/commands/slava/disagreement/`. Verify both halves of
   every rename with `git status --short --no-renames` (expect 10 lines, not 5).
3. Sweep references in live surfaces only: `.claude/commands/` (8 files), 6 open specs,
   `src/tests/` (2), `docs/points-process.md`, `docs/decisions.md`,
   `docs/story-point-model-consumers.md`, `docs/process-learnings.md`, `features/uat/p1141.md`.
   **`docs/decisions.md` is excluded** — founder ruling 2026-08-27 applied to its sibling category:
   dated entries record what was true then, exactly as closed specs do.
   Both the bare name (`points-prepare`) and the qualified form (`/slava:content:points-prepare`).
4. Rename the 4 `/points-run` command references; leave the 58 data-path occurrences untouched.
5. `./scripts/sync-agent-skills.sh` (no flag) to regenerate `.agents/skills/`; re-stage it.
6. `/slava:maintain:claude-md "add disagreement/ to the skill-namespace list"`, then apply.
7. `npm test -- p1156` and `./scripts/pre-commit-checks.sh`.

## Scope addition — taken during implementation

**FOUNDER DECISION 2026-08-27: fix `scripts/validate-doc-links.cjs`.** The gate blocked this
commit on 6 links in the generated `.agents/` projection. Root cause is an inconsistency in the
validator itself, not in this rename: report mode (`allMarkdownFiles`) filters to
`SCAN_DIRS = ['docs','features','.claude','content']` and never sees `.agents/`, while commit mode
(`stagedMarkdownFiles`) applies no `SCAN_DIRS` filter at all. The projection is a byte-identical
copy at a shallower depth, so its root-relative links are correct in the source and structurally
unresolvable in the copy — any commit staging a new `.agents/` skill file hits this. Fix: add
`.agents` to `SKIP_DIR_RE`, matching the script's own comment (*"vendored or generated markdown"*)
and `sync-agent-skills.sh`'s *"NEVER hand-edit anything under `.agents/skills/`"*. Failure path
exercised per epistemic gate 7 — exit 1 on a planted dead link, exit 0 clean.

## Rollback Strategy

`git revert` of the single commit. Nothing is written outside the repo; no data path, seal, run
file, database row or deployed surface is touched, so revert is complete by construction.

## Alternatives Considered

- **Defer the rename until after the first pipeline run** — the position P1161 originally held as
  a Non-Goal. Rejected by founder decision 2026-08-27: renaming first means the first end-to-end
  run doubles as the rename's proof, instead of the rename landing on top of a run already in
  progress.
- **Rename the data paths too** (`.points-run-seals/`, `.private/points-runs/`). Rejected
  2026-08-27: orphans a live seal that two stages verify by literal path, and turns a
  reference-only edit into a state migration on the run immediately before the event.
- **Rewrite closed specs for a zero-survivor repo.** Rejected 2026-08-27: a closed spec that
  names `disagreement/` would claim a namespace that did not exist when it shipped.
- **Keep `points-` as the family prefix** (`points-positions`, `points-story`). Rejected: it
  keeps colliding with `.points-run-seals/` and `.private/points-runs/`, and names the artifact
  (points) rather than the pipeline.

## Done-When

- [x] All five stages resolve at `/slava:disagreement:{select,prepare,positions,story-draft,publish}`
- [x] `grep -rn "points-select\|points-prepare\|points-publish\|positions-create\|story-create"`
      over live surfaces returns only self-referential hits — this spec, and P1161's own
      line-anchored citations of the pre-rename files. Closed specs, `docs/decisions.md` and data
      paths excluded by Non-Goals. **Five open specs are updated on main immediately after the
      merge, in one `git-ops.sh commit-to-main`** — P1161, P1089, P1141, P1145, P1164. P1161
      carried uncommitted founder edits while this branch was open (landed since, as `373bb1ee`).
      The other four are held off the branch deliberately: `git-ops.sh detect_cospecs` reads
      *"spec existed on main and was touched by a branch commit"* as *"delivered by this branch"*
      and would have auto-closed all four (statuses `backlog`/`qa`/`week`/`week`) into
      `features/done/` on merge. All their references are prose, not markdown links, so the
      window between the two commits breaks no link gate.
- [x] `grep -rn "/points-run\b"` returns only P1161 lines 104 and 200 — closed by the same
      post-merge commit-to-main as above; `.points-run-seals/` and `.private/points-runs/` are
      byte-identical to before
- [x] `src/tests/p1156-points-chain-contract.test.ts` updated to the new paths and prefix, and
      passing — 2 files, 42 tests passed, pasted output; failure path exercised (repointing
      `select.md` at `points-select.md` gives ENOENT + 1 failed)
- [x] `git status --short --no-renames` showed both halves of all five renames before commit
- [x] `.agents/skills/` regenerated by `sync-agent-skills.sh` (123 skills, 0 collisions, 5 orphans
      pruned), and `pre-commit-checks.sh` check 22 passes
- [x] `validate-doc-links.cjs` skips `.agents/`, and still exits 1 on a planted dead link
- [x] `CLAUDE.md:272` **and** `.claude/rules/skills.md:54` namespace lists include `disagreement/`,
      applied via `/slava:maintain:claude-md`
- [x] `story-gate`, `story-to-image`, `sifter-story`, `content/story/` and the unrelated
      `e2e/p400-guest-story-create.spec.ts` are unmodified — verified by `git status --no-renames`

## Related

- [p1161](../../p1161_first_physical_event_chiang_mai.md) — D4, the parent decision; this is its step 0
- [p1156](p1156_points_pipeline_selector_and_chain_contract.md) — chain contract
  and the `/points-run` deferral (decision 2d)
- [p1157](p1157_make_multi_harness_projection_runtime_correct.md) — the
  `.agents/skills/` projection this rename must regenerate