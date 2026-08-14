---
status: backlog
type: task
rank: 93
date_reported: '2026-08-13'
created_date: '2026-08-13'
tags: [docs, process, rules]
delivery_stage: create-bug
pipeline_ran: [create-bug]
---

# P1073: two documentation gaps that made P1066's reviewers re-derive facts from git history

## Problem

Two unrelated gaps, both surfaced by review of P1066, both cheap, both costing the next reader real
time. Filed together because each is a few lines and neither justifies its own branch.

### Gap 1 — `database.md` records no grant state for the letter RPCs

`docs/technical/database.md` documents grant and RLS state for some RPCs but has no entry for the
anon-EXECUTE position of the letter-reading and agreement functions, several of which changed in
P1063 and P1066.

`.claude/rules/db-access.md` tells agents to answer schema and access questions from local files
and never to query a live database for them. For "can an unauthenticated caller invoke this RPC"
that instruction currently has no local answer, so the honest options are to query prod — which the
rule forbids — or to guess. A reviewer on P1066 hit exactly this.

Worth recording alongside: the live catalog is the authority, and the migration ledger is not
evidence in **either** direction. P1066 found a migration recorded as applied on prod whose `DROP`
had not taken effect, *and* a migration recorded as not-deployed whose revokes were live. Any doc
written here should say that rather than implying the corpus can be read as state.

### Gap 2 — the `qa` gate names a checklist section that most specs do not have

`.claude/rules/features.md` says that before `status: qa`, all `## Acceptance Criteria` **and**
`## Done-When` checkboxes must be `[x]`, with no stated exception.

`/fix`'s Feature QA Gate (step 0.5) defines the `[post-deploy]` escape for structurally
unverifiable criteria — but its text and its grep only ever mention `## Acceptance Criteria`.
`## Done-When` is the only checklist section the 5-field skeleton produces, so for a skeleton spec
the documented exception does not textually apply to the section it needs to apply to.

The convention is real and already in use — P1053 closed with a `[~]` item, and P1066 closed with
two `[post-deploy]` items and one `[~]`. But a reviewer has to reconstruct its legitimacy from git
history, which is how a real convention gets mistaken for drift and "corrected" away.

## Appetite

Blast radius: documentation only for Gap 1. Gap 2 edits `.claude/rules/features.md` and the `/fix`
skill, which are shared agent-facing config — small text, wide reach, so wording matters more than
size. Reversible. Decision density: low; both are recording decisions already made.

## Approach

**Gap 1** — add a section to `docs/technical/database.md` covering, per RPC, whether `anon` holds
EXECUTE and why. Generate it from the live catalog rather than by reading migrations, and state the
generation method so the next person can refresh it. Reference
`scripts/anon-execute-allowlist.txt` as the companion rather than duplicating it.

**Gap 2** — extend the `[post-deploy]` exception to name `## Done-When` alongside
`## Acceptance Criteria` in `/fix` step 0.5, and add the exception to `.claude/rules/features.md`
so the gate and its carve-out live in the same sentence. Include `[~]` (partially met, with the
residue stated) as an explicit disposition, since it is in use and currently undocumented.

**Run `/slava:maintain:claude-md` before touching `.claude/rules/features.md`** — that gate is
mandatory for rules files and this task must not skip it.

## Risks / Non-Goals

- **A generated grant table goes stale silently.** MITIGATE: P1065 already builds a live-catalog
  grant check; make that the refresh mechanism rather than adding a second one. Do not hand-maintain
  the table.
- **Widening the `[post-deploy]` carve-out invites it as a loophole.** MITIGATE: keep the existing
  requirement that each annotated item names the prod-only condition that makes it unverifiable.
  ACCEPT: this is a documentation change, not a new permission.
- Do **NOT** re-litigate whether `[post-deploy]` should exist — it is established practice; this
  records it.
- Do **NOT** duplicate the allowlist's contents into `database.md`.

## Done-When

- [ ] `docs/technical/database.md` answers "can anon execute this RPC" for the letter and agreement
      functions, without a live query, and names how the table is regenerated
- [ ] That section states that the migration ledger is not evidence of live state in either
      direction, with the two P1066 instances cited
- [ ] `/fix` step 0.5 and `.claude/rules/features.md` both name `## Done-When` in the
      `[post-deploy]` exception, and both document `[~]`
- [ ] `/slava:maintain:claude-md` was run before the `.claude/rules/features.md` edit
- [ ] A reviewer can determine a spec's `qa` legitimacy from the rules files alone, without
      consulting git history
