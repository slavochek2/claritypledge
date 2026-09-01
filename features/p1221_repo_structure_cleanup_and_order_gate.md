---
status: week
type: task
rank: 1000066
workstream: infrastructure
created_date: '2026-09-01'
tags: [cleanup, repo-hygiene, pre-commit, file-locations]
delivery_stage: create-spec
pipeline_ran: [create-spec]
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
2. Gate (done): pre-commit checks 14b–14d — new top-level entry not in HEAD, new `docs/**.md` with no inbound reference in the staged tree, any staged file >500KB (`package-lock.json` excluded). Allowlists derive from HEAD; overrides `P1221_ALLOW_NEW_ROOT|ORPHAN_DOC|LARGE=1`.

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

## Founder decisions

1. Delete the 4 STALE docs above? `agent-file-creation-prevention.md` is an analysis output whose content became check 14 + file-locations.md (CHARTER: one fact, one home); `mcp-scripts-reference.md` duplicates `mcp-backup-recovery.md`.
2. `docs/bmad/` (37 files, last touched 2026-02-17, only historical refs) — delete or move to `docs/archive/`?
3. `tests/acceptance/` (P50–P64 manual UAT, 0 refs) — move to `features/uat/` per file-locations, or delete?
4. Root `kanban` symlink — `~/.zshrc` already aliases `kanban` to `scripts/kanban.sh`; remove the symlink?
5. `cloud-functions/gcs-signed-url/` — still the source of the deployed GCP function behind `supabase/functions/gcs-signed-url`; keep at root, or move under `services/`?
6. Scripts: archive `resend-feedback.sh` (markdown-linked from decisions.md), `probe-gcs-upload*.mjs` (cited by `src/tests/p812-reproduce.test.ts`), `setup-verify-*.ts` (`.gitleaks.toml` allowlist), `browse-sessions.sh` (personal, → `~/.agents/bin`?), `setup-cloud-*.sh`? Wire `test-browser-evidence-hooks.sh` / `test-multi-harness-routing.sh` into pre-commit or archive them?
7. Fonts: dedupe `inter-latin.woff2` (3×224KB) — decks must self-host under CSP, so a single `/fonts/` path needs each deck's HTML updated.
8. Apply the remaining 137 repairable links in active specs + `docs/decisions.md`/`goals.md` once no co-tenant session holds them.
9. Stale facts in file-locations.md: claims `sweep-done.sh` runs on pre-commit (it does not), names a `/done` skill that does not exist, lists 7 of 35 technical docs.

## Done-When

- [x] Mandated moves committed with both rename halves staged (`git status --no-renames`).
- [x] Gate fails on a staged violation (exit 1, three errors) and passes on the clean tree (exit 0).
- [ ] Founder decisions 1–9 answered; each either becomes its own task or is closed here.
