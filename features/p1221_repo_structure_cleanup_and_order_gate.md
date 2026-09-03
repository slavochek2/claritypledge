---
status: week
type: task
rank: 1000066
workstream: infrastructure
created_date: '2026-09-01'
tags: [cleanup, repo-hygiene, pre-commit, file-locations]
delivery_stage: ship
pipeline_ran: [create-spec, inline, ship]
drafted_by: fable
exec_model: sonnet
exec_effort: medium
driver: heuristic
---

# P1221: Repo structure cleanup and an order gate that keeps it

## Problem

The tree has drifted from [file-locations.md](../docs/technical/file-locations.md): one-off scripts sat in `scripts/` root, a typo directory (`.claire/`) was tracked since April, four `docs/technical/` pages have zero inbound references, `features/done/` mixes three folder conventions, and 443 relative doc links are dead. Pre-commit check 14 only watches `*.md`/`*.json`/images in the root — nothing gated a new top-level directory, an unreferenced `docs/` page, or a multi-MB asset, so each of these could recur the day after a cleanup.

## Appetite

Blast radius: low — `git mv` of five scripts, one placeholder deleted, 29 mechanical link repairs in closed specs, one additive pre-commit section. Reversibility: high (all on one branch). Decision density: medium — the moves below were mandated; everything else is listed under Founder decisions and was **not** done.

## Solution

1. Moves mandated by file-locations.md (done on this branch): `pre-/post-migration-validation.sh` (P141), `copy-prod-to-test.mjs` (P800), `number-webinar-titles.ts` → `scripts/archive/migrations/YYYYMMDD-*`; `test-edge-fn.mjs` (0 refs) → `scripts/archive/`; `.claire/` removed (0 refs, content `// placeholder`); `fix-doc-links.cjs --apply` on 19 cold files (done/archive/uat/two skills) — active specs and `docs/decisions.md` left to their owners.
2. Gate (done): pre-commit checks 14b–14d — new top-level entry not in HEAD, new `docs/**.md` with no inbound reference in the staged tree, any staged file >500KB (`package-lock.json` excluded). Rename-aware (`--diff-filter=ACMR`), NUL-safe, fail-closed on git probe errors; allowlists derive from HEAD; path-specific overrides `P1221_ALLOW_NEW_ROOT|ORPHAN_DOC|LARGE=<name:name>` are always printed as a warning.

## Phase A verdicts (2026-09-01)

| Area | KEEP | MOVE (done) | REMOVE (done) | DECISION |
|---|---|---|---|---|
| Root entries (19 inspected) | 14 | — | `.claire/` | `kanban` symlink, `tests/acceptance/`, `cloud-functions/` |
| `docs/` + `docs/technical/` (59 md) | 55 | — | — | 4 STALE (0 refs, >90d): `agent-file-creation-prevention`, `implementation-patterns`, `mcp-scripts-reference`, `navigation-review-findings`; `docs/bmad/` (37 files, dead tool) |
| `scripts/` (121) | 109 | 5 | — | `resend-feedback.sh`, `probe-gcs-upload*.mjs`, `setup-verify-*.ts`, `browse-sessions.sh`, `setup-cloud-*.sh`, 2 unwired canaries |
| `features/done/` folders (33) | all | — | — | P1199 owns; root cause noted below |
| `public/` (>200KB: 7) | 7 | — | — | 3 copies of `inter-latin.woff2`; `presi/st1-understand.jpg` 0 refs |
| Dead doc links (443) | — | 29 repaired | — | 137 repairable in 10 active files; 86 ambiguous; 191 missing |

## Risks / Non-Goals

- Non-goal: renaming `features/done/*` folders — P1199 territory. Root cause recorded here for it: `sweep-done.sh` creates `N_mon_yy` folders while `git-ops.sh` spec-close resolves `YYYY-MM-DD` from `features/done/CURRENT_SPRINT` (still `2026-06-10/`, unrotated since June); `sweep-done.sh` is no longer called by pre-commit, so 15 flat specs sit at `done/` root.
- Non-goal: skill orphans (P1163 lane). `.claude/commands/slava/archive/` does not exist — the archive is `.claude/_archive/slava/`.
- MITIGATE: the orphan-doc check reads the *staged* tree, so a doc and its link must land in the same commit or use the override.

## Founder decisions — answered 2026-09-03

Answered by the founder, applied on this branch. Every removal and move was preceded by a
reference grep; where a reference contradicted the decision, the reference won and it is recorded
below.

1. **Delete the 4 STALE docs — DONE** (`9c69f730`). Re-verified: zero inbound references, the only
   hits being this spec's inventory table and one self-reference inside
   `navigation-review-findings.md`. All four deleted.
2. **`docs/bmad/` → `docs/archive/bmad/` — DONE** (`ec1add95`). The spec's "only historical refs"
   claim was wrong: 14 files mention BMAD and several name real paths. Repointed in the same
   commit — `docs/technical/feature-specs.md` (routing row; the `bmad/artifacts/` row dropped, that
   dir is gitignored and has never existed), `docs/design-system.md:7,747` (both pointers were
   already stale — P61 moved the file under `bmad/archive/` in January), eight cold specs and the
   archived `design-audit` skill. Prose mentions naming no path were left alone. Three follow-on
   fixes the move forced: two links gained a directory of depth and were re-rooted; six links whose
   targets exist nowhere were de-linked with the path kept inline (pre-existing rot, surfaced
   because a rename resets the doc-link ratchet); `.gitignore`'s `.bmad/`/`bmad/` were root-anchored
   because unanchored they also matched the new tracked archive and made `git add` refuse.
   `docs/archive/bmad/README.md` indexes the folder — without it eight archived pages trip P1221's
   own orphan-doc gate, and an index is the honest answer rather than `P1221_ALLOW_ORPHAN_DOC`.
3. **`tests/acceptance/` → `features/uat/` — DONE** (`39153408`). Destination confirmed against
   `file-locations.md` (UAT documentation lives at `features/uat/`). Not deleted — the P50–P64
   checklists encode product intent for OAuth and authenticated flows no scripted test covers. Zero
   inbound references, so nothing needed repointing. The top-level `tests/` directory is now gone;
   its README was rescoped to describe the two manual checklists rather than all of `features/uat/`.
4. **Root `kanban` symlink — REMOVED** (`0b4ff11d`). Added 2026-02-02 for a `./kanban w1` form that
   nothing uses any more: the only `./kanban` hit in the tree is a relative markdown link to
   `kanban-embedding.md`. The two supported forms are untouched — the shell alias to
   `scripts/kanban.sh` and `npm run kanban`.
5. **`cloud-functions/gcs-signed-url/` — KEPT, no change.** Verified live: `index.js` is the source
   of the deployed GCP function at `us-central1-…cloudfunctions.net/gcs-signed-url`
   (`features/done/27_mar_27/p623…:432`), and P526's deploy command passes
   `--source cloud-functions/gcs-signed-url`. Moving it would break that command.
6. **Scripts — split by reference** (`933c7642` for the canary half).
   - `resend-feedback.sh`, `probe-gcs-upload*.mjs`, `setup-verify-*.ts` — **KEPT**, each reference
     verified to exist. `probe-gcs-upload*.mjs` turned out to be cited from live source as well
     (`src/app/data/api.ts:3089`), not only from the P812 test; `setup-verify-listener.ts` is named
     by `docs/technical/live-session-testing.md:171` as well as the gitleaks allowlist.
   - `setup-cloud-worktrees.sh` — **KEPT, contradicts the candidate list.** It is wired into
     `scripts/pre-commit-checks.sh:214`, which runs the worktree-setup canary when it stages.
     Archiving it would have removed a live trigger.
   - `setup-cloud-mcp.sh` — **KEPT.** Zero inbound references, but it is re-runnable VM
     provisioning ("run this once after VM is created or reset") last modified 2026-07-15 as part of
     the IAP firewall lock-down. Recent maintenance is stronger evidence of intent than a missing
     doc link. Open follow-up: it has no home in `docs/technical/cloud-agent.md`, so the next
     inventory will flag it again.
   - `browse-sessions.sh` — **KEPT in place**, personal tooling, not moved outside the repo.
   - `test-browser-evidence-hooks.sh` — **REAL CHECK, now gated.** Hermetic (two hooks, python3, a
     mktemp dir), 11/11 green. New pre-commit section 4.7e runs it whenever either hook, their
     shared `_transcript_lib.py` (where `BROWSER_TOOL_PREFIXES` actually lives), or the canary
     itself is staged. Failure path exercised: dropping `mcp__playwright__` from the allowlist gives
     canary exit 1 ("9 passed, 2 failed") and pre-commit exit 1 with "1 error(s) - commit blocked";
     hook restored byte-identical. Existing workflows re-run through it: clean tree passes (0
     errors), unrelated staging skips the section.
   - `test-multi-harness-routing.sh` — **REAL CHECK, NOT wired, NOT archived — deliberate.** It
     guards two repo files (`.codex/config.toml`, `.codex/hooks/route-brief.sh`), so archiving it
     would delete real coverage. But it cannot go on the commit path: it makes a live `dsh` call
     (`env -u GEMINI_API_KEY dsh --profile headless 'provider canary'`) — network and spend on every
     commit — and most of its 31 assertions read per-machine adapter files under `$HOME` that no CI
     runner or second machine has. P1157's own carried-gaps list already records this. Wiring it
     needs a decision about splitting the repo-only assertions from the live ones; that is not
     inside this spec's appetite.
7. **Font deduplication — DEFERRED, do not do.** Three copies of `inter-latin.woff2` (224KB each).
   Deduplicating means editing each deck's HTML under CSP, and a wrong path means a deck renders in
   a fallback font during a live presentation. Recorded here rather than filed as its own spec:
   P-number allocation and `/create-spec` touch shared state while other sessions are active.
8. **Remaining 137 doc-link repairs — DEFERRED.** Not touched. The repairable links live in active
   specs and `docs/decisions.md`, which other sessions are editing right now; concurrent edits to
   those exact files have caused a real incident in this repo before. Includes the `decisions.md`
   P800 line still citing `scripts/copy-prod-to-test.mjs` (now under
   `scripts/archive/migrations/20260425-`).
9. **Stale facts in `file-locations.md` — DONE** (`251abffb`). All three verified against the code
   first: `sweep-done.sh` has no caller anywhere (the doc now says so and names the real
   `CURRENT_SPRINT` mechanism); `/done` does not exist (replaced with `/ship`); the "existing docs"
   block listed 7 of 28 and one of the 7 (`testing.md`) is gone — replaced with the live count plus
   the command that regenerates it, since a copied list is what went stale.

### Not done — blocked, needs the founder

- **`CONTRIBUTING.md:149–154` still points at `docs/bmad/`.** The edit is written and correct, but
  every commit touching that file is blocked by a **pre-existing false positive** in pre-commit
  check 2a: line 112 (`Create .env.test.local with SUPABASE_SERVICE_ROLE_KEY`, unchanged since the
  file was created) matches the `SUPABASE_SERVICE` secret pattern. The line is an env-var *name*,
  which is the exact FP class the check's own comment says it filters for — but the filter only
  exempts `process.env.` / `import.meta.env.`, not a bare backticked name in prose. gitleaks
  (layer 1, no path exclusions) passes the file. CONTRIBUTING.md has not been committed since the
  check gained that pattern, so this has never fired before. Not worked around: widening a secret
  scanner is not a change to make unasked.

## Done-When

- [x] Mandated moves committed with both rename halves staged (`git status --no-renames`).
- [x] Gate fails on a staged violation (exit 1, three errors) and passes on the clean tree (exit 0).
- [x] Founder decisions 1–9 answered; each either becomes its own task or is closed here — see
      "Founder decisions — answered 2026-09-03" above: 1, 2, 3, 4, 6, 9 applied; 5 closed as
      no-change; 7 and 8 deferred with reasons. One item is blocked and named under
      "Not done — blocked, needs the founder".
