---
status: in-progress
type: task
rank: 76
workstream: infrastructure
created_date: '2026-10-26'
tags: [git-ops, ship, decisions-log, merge-conflicts]
disclosure: public
delivery_stage: dev
pipeline_ran: [create-spec, dev]
drafted_by: opus
exec_model: opus
exec_effort: high
driver: anomaly
---

# P1575: `/ship` resolves the decisions-log conflict where both sides only added entries at the top

## Problem

**Situation:** `docs/decisions.md` is newest-first, so every entry is written at the top. `git-ops.sh ship` replays a branch's commits onto main one at a time.
**Complication:** Any branch that writes a decision while main also gains decisions conflicts at the top on every such commit. Shipping P1566 (7 commits, 51 behind main) stopped 4 times in a row, each resolved by hand on the shared checkout. The log records the same class at least five times before (2026-08-28, 2026-09-01, 2026-09-03, 2026-09-11, 2026-10-02). Once, a loop that always took the branch's side dropped 59 entries while every gate stayed green (P1236).
**Question:** Can `ship` resolve the one safe shape itself, both sides only adding whole entries at the top, and still stop for a human on everything else?

> Founder, verbatim, the request whose ship surfaced this: *"ok yes lets go with your reocmemdnaiton, then ship , kdd comit and clean afteryourself specs, worktress etc"*
> Founder, verbatim, approving this item when the P1566 `/kdd` proposed it: *"ok lets do it"*

The fix itself was proposed by the agent and accepted by the founder; the design below is the agent's.

## Appetite

Blast radius: high. `ship` is the only path from a feature branch to main, and a wrong resolution loses another session's decision silently. Reversibility: high for the code (git revert). A bad resolution that already landed is repaired by `git merge-file` against the fork point, as P1236 did. Decision density: zero. The design below was accepted by two critics in the P1566 `/kdd` and matches the 2026-09-01 ruling.

## Invariants

- **Never take one side.** No `--ours`, `--theirs` or "keep the branch block" shortcut for this file. Every entry from main and every entry from the branch survives (2026-09-11 [process], P1236).
- **The stop condition is the feature.** Only the pure two-prepend shape resolves. Any other shape stops exactly as today: an entry edited or retitled on either side, a deletion, a change below the first base entry, or no common ancestor (2026-09-01 [technical]: "auto-resolve only those two, abort on anything else").
- **Proven, not assumed.** After resolving, every entry heading present on main's side and on the branch's side is present in the result. If a heading is missing, the arm refuses and leaves the conflict for a human.
- **Tool and canaries land together.** The `git-ops.sh` change and the canaries that gate it go to main in one commit (2026-09-08 [process]).

## Solution

Add a resolver arm to `git-ops.sh ship` beside the existing auto-resolve for an identical spec add/add conflict. It fires only when the unmerged path is `docs/decisions.md` and the conflict is the pure two-prepend shape, judged against the common ancestor (index stage 1):

- main's version = some new whole entries, then the ancestor's text unchanged
- the branch's version = some new whole entries, then the ancestor's text unchanged

The result is main's new entries, then the branch's, then the ancestor's text. The arm stages it, logs one line naming the resolution and the entry counts from each side, runs the heading check above, and lets the pick continue. Anything else falls through to today's diagnostic and stop.

The 4th P1566 conflict is the shape that must stop: a later branch commit retitled an entry the branch itself had added earlier. Whether that case can be safely widened later is out of scope.

## Alternatives Considered

- **`.gitattributes` `merge=union` on the file.** Rejected. It applies to every merge, rebase and cherry-pick, and it silently keeps both versions of an edited or retitled entry, which is the P1236 failure class with no check.
- **Squash a long branch before `/ship`** (2026-10-02 [process], P1347). Related, not a substitute. It cuts N conflicts to one but still needs that one resolved, and today it exists only as a decision, not a gate.
- **Write each `/kdd` entry in one place** (2026-08-28 [process]). Still a discipline, and it does nothing when main gains co-tenant entries, which is the P1566 case.
- **Append-oldest-last ordering.** Rejected in 2026-08-28 [process]: it inverts the reading convention for every reader.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| A shape that looks like two prepends hides an edit to an existing entry | MITIGATE | Compare against stage 1 byte for byte below the new blocks; the heading-set check is a second, independent signal |
| Two sides add an entry with the same heading | MITIGATE | Stops for a human: which copy is right is a judgment call (changed in review from "keep both") |
| The branch's entry is already on main: a stacked branch replays a commit that shipped under another SHA, or main has since restated it (proposed to accepted) | MITIGATE | Stops when any branch entry's title, ignoring a `(Status: ...)` suffix, is already on main (Opus review, reproduced end to end) |
| `--resume` after a human hand-edited the log without staging it | MITIGATE | The arm never runs on the resumed pick; it would rebuild from the index and erase the edit (Opus review) |
| No common ancestor (stage 1 absent) | MITIGATE | Treated as "other shape": stop |
| Entry order inside the day gets main-first even when the branch's decision came earlier | ACCEPT | The log is newest-first by date, not by minute; the 2026-08-28 resolution used the same order |

**Non-Goals**
- Do NOT touch the `deploy-manifest.json` path, which only prints guidance. Its own inbox note tracks it.
- Do NOT add a squash-before-ship gate.
- Do NOT resolve any other file.

**Doc drift to correct in the same change:** decisions.md 2026-08-28 [process] says twice that `git-ops.sh` special-cases the manifest conflict (`git-ops.sh:2763`). That line is now unrelated code, and the manifest path only prints guidance and exits. Correct the claim where it is cited, or note it in the new decision entry.

## Rollback Strategy

Revert the commit. The arm only adds a resolution path; with it gone, every conflict stops for a human as before.

## Done-When

- [x] Canary in `scripts/test-git-ops-ship.sh`: a ship where main and the branch each prepend entries resolves without stopping, and every heading from both sides is in the landed file (AE-a: two branch commits, both picks conflict, both resolve, order main then branch then shared)
- [x] Canary: a branch commit that retitles an existing entry still stops for a human, exit non-zero, conflict left in place (AE-b end to end; `scripts/test-decisions-merge.sh` at the resolver)
- [x] Canary: an edit to an existing entry on both sides still stops (`test-decisions-merge.sh`, plus main deleting an entry, a preamble change, no common ancestor)
- [x] Canary: a conflict in any other file still stops, and a ship with no conflict behaves as before (gate 7c): AE-c (log plus another file) and II-a stop; the whole ship suite passes, 79 PASS lines incl. R2 shell-safety
- [x] Mutant: the heading check disabled, or the stop condition widened to any conflict, turns at least one canary red: heading check off 1 red, shape check widened 4 red, take-the-branch-side 5 red; an empty resolver turns AE-a red (and exposed that the tool trusted its exit code, now it checks the index)
- [x] Replay of the real P1566 history, its 7 commits onto main as it stood at `73325786f`: the first 3 conflicts resolve themselves and the 4th stops (replayed in a shared clone; the auto result differs from the hand resolution only by one `---` divider added by hand)
- [x] Tool and canaries land in one commit (2026-09-08 [process]): one branch commit holds `git-ops.sh`, the resolver, both canaries and the pre-commit trigger

## Related

- P1566 (shipped 2026-10-26): the ship that produced the evidence
- P1236, P1347: the prior incidents named in Problem

## Review Record

`/finish`, 4 of 4 reviewers reported: Gemini, Codex, an Opus adversary, a Sonnet criteria reviewer. Every claim was reproduced before acting. Fixed, each now a canary case:
- A block without a final newline glued the branch's heading onto main's last line, and the heading check (counted before joining) missed it. Found by Gemini, Codex and the criteria reviewer; the check now reads the bytes that would be written.
- The branch's entry already on main (stacked branches, or main restated it): duplicated or brought back a superseded copy. Opus, reproduced end to end.
- `--resume` overwrote a human's unstaged hand edit. Opus, reproduced end to end.
- An unclosed code fence in a new entry would hide the branch's entries when rendered (Codex).
- A resolver crash printed a Python traceback with `<module>` into ship output (criteria reviewer, Opus); `git add` output could leak the same way (Gemini).
- The duplicate-heading count accepted one surviving copy (criteria reviewer).
- New canaries for a commit refused after resolving (pause, no skip, `--resume` lands it once) and for `--resume` over a hand edit (all reviewers named the gap).

**Known limitations, accepted:** the heading check proves no entry heading was lost; body text is guaranteed by construction (the result holds every line of both sides, in order), not by an independent check. A pick that conflicts on the spec file and the log together stops for a human. Same-title entries on both sides stop rather than resolve.

