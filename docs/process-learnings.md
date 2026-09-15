# Process Learnings

**Next ID:** 77

**This repo's deferred-work inbox.** Open friction items and proposed fixes not yet implemented.
Any agent, in any session, can file here with `/note` — file it, don't ask the founder to
remember it. Surfaced *and closed* in `/weekly` step 2.5; `due: month` entries surface in
`/monthly` instead.

Entries naming infrastructure, credentials, security mechanics, or absolute user paths go to
`.private/docs/process-learnings.md` instead — this file is public. `/note` routes automatically.

**Format (literal — readers count it mechanically).** Every open entry carries a bold status
line starting at column 1: `Status:` in bold, then a space, then `proposed`. The canonical count is:

```bash
grep -c '^\*\*Status:\*\* proposed' docs/process-learnings.md
```

The `^` anchor is what keeps this header — and any other prose mentioning the field — out of the
count. Do not write the field unbolded or indented: a semantic reader will still find the entry,
the count will not.

**Optional `due:` field — bold, same as the status line.** Written `due:` in bold, then the value.
`week` (the default when absent) surfaces in `/weekly`; `month` surfaces in `/monthly` only.
`/monthly` selects with `awk '/^\*\*due:\*\* month/'`, so an unbolded or indented `due:` line is
invisible to it and the entry silently stays weekly.

**`ID:` field — bold, one per entry, never reused (P1317).** Written `ID:` in bold, then
`INBOX-<n>` (`INBOX-P<n>` in the private store). The number is written into the entry, never
derived from its position, so deleting one entry renumbers nothing. The `Next ID:` line in bold
above holds the store's counter. **Never hand-write either** — `./scripts/inbox.sh add` (which
`/note` calls) takes a lock, re-reads the file, raises the counter past any hand-written ID,
appends, and verifies the ID occurs exactly once. Refer to an entry by its full token
(`INBOX-12`), never a bare number. An entry with a missing, malformed or duplicate ID, or any
`Status` other than exactly `proposed`, shows on the kanban's Inbox column as **unparseable**: fix
it at the source; `./scripts/inbox.sh check --store public` lists every such section.

**Closing an entry** — the graduation rule (`docs/decisions.md` 2026-02-26): delete it from this
file and add a `[process]` entry to `docs/decisions.md`. Entries are never marked done in place;
an empty file is the healthy state. Delete with `./scripts/inbox.sh delete --store public <ID>`.

---

## P272's live-verification suite drives buttons the /live page no longer renders

**ID:** INBOX-1
**Status:** proposed
**due:** week

`e2e/p272-live-verification.spec.ts` clicks `Does {partner} understand you?` and expects both
participants to see the rating question at once. Neither matches the page: the button reads
**Speak** with `Did {partner} understand you?` beneath it (`live-mode-view.tsx`, three call
sites), the scale's buttons are labelled `Rate N`, and the listener's drawer opens only after
the speaker submits (`getViewState` branch 4a). Measured 2026-09-12 while building
`e2e/p1278-real-browser-round.spec.ts`, which hit all three in turn: `grep -F "Does "` over
`src/` returns only the prototype page. The same shape as P1232 — a selector that outlives the
UI it names fails as a bare timeout, with no assertion error to read.

Worth checking whether the other specs that share those selectors (`speak-freely-button`,
`p400-story-card-rendering`, `live-rating-drawer`) are affected before fixing them one by one.

---

## A /live round has no identity in its row, so a client cannot tell whether it already recorded one

**ID:** INBOX-2
**Status:** proposed
**due:** month

`story_verifications` carries no per-round key — only the session, the two participants and the
ratings. Two consequences, both raised by the Codex review of P1278 E (2026-09-12) and both real:
a guest round is lost if the creator's client reloads before it observes the round completing
(the client must not write what it cannot prove it has not written), and the database would admit
a duplicate row if any client ever wrote twice — today the only thing preventing that is one
tab's memory.

One remedy covers both: an exchange index on the row beside `session_id`, with a partial unique
index, so the creator's client can write a round it may already have written and let the database
ignore the duplicate. Schema change: its own migration and integration spec (P270). Not needed
for the guest path to work, which is why P1278 shipped without it.

---

## The agent-skills gate fails OPEN when its script is missing or a dangling symlink

**ID:** INBOX-3
**Status:** proposed
**due:** week

`pre-commit-checks.sh` guards the skills-sync gate with `[ -f "./scripts/sync-agent-skills.sh" ]`.
If the file is absent, or is a symlink whose target is gone, the test is false, the hook prints
"skipping agent-skills sync gate", and **the commit proceeds**. A gate that cannot run reports the
same outcome as a gate that ran and passed.

Raised independently by the P1284 and P1283 agents on 2026-09-09 while both were working on the
`--staged-only` probe next to it. Pre-existing — it predates that probe and both of its hotfixes,
and neither fixed it. P1293's canary covers the probe's flag handling, not this branch.

Why it matters here specifically: worktrees hydrate `scripts/` as a native checkout, so a slot
whose checkout is incomplete, or mid-`git checkout`, hits exactly this path — and the commit that
lands is one nobody verified.

Fix direction: distinguish "cannot run" from "ran and passed". A missing callee should FAIL the
hook with a message naming the path it looked for, not skip. If a genuine skip is needed (a branch
that predates the script existing at all), gate it on something explicit rather than on the file
being absent — the current shape cannot tell the two apart, which is the whole defect.

Epistemic gate 7 applies to the fix: move the script aside, confirm the hook exits non-zero, put it
back. That is the proof, not the reasoning.

## `goal-gate.sh` CHECK 3 soft-resets HEAD in a worktree — a killed run strands the branch ref

**ID:** INBOX-4
**Status:** proposed
**due:** week

`goal-gate.sh` CHECK 3 soft-resets `HEAD` to the merge-base while running, inside the worktree it
is invoked from, and restores afterwards. If the run is killed between those two points the
**branch ref is left at the merge-base**, so the branch appears to have lost every commit — and a
later run then "restores" to that wrong sha, making the loss look deliberate.

Observed 2026-09-09 during the P1284 review: `feature/p1284-script-inbox-batch` showed 0 commits
ahead of `main` with its seven commits' content sitting as uncommitted changes. The orchestrator
read this as possible data loss and spent tool calls confirming otherwise. Nothing was lost —
`git reflog` showed the ref bouncing between the merge-base and the real tip across repeated gate
runs. Repaired with `git reset <absolute-sha>` (never `HEAD~1` — the shared-HEAD rule in
`.claude/rules/git.md`), verified by all seven commits back on the branch and byte-identical
checksums for all nine working-tree files.

Two things to fix, and the second is the one that matters:

1. Make the restore crash-safe — record the pre-reset sha somewhere durable (a file next to the
   lock, not a shell variable) and restore from it on the next invocation, so a killed run
   self-heals instead of stranding the ref.
2. Never soft-reset the ref at all if the check can be done another way. Reading a diff against
   the merge-base does not require moving `HEAD`; `git diff <merge-base>...HEAD` answers the same
   question without touching any ref, which removes the failure mode rather than recovering from
   it.

Until then: a branch that suddenly reads "0 commits ahead" right after a gate run is almost
certainly this, not lost work. Check `git reflog <branch>` before doing anything else.

## Confirm the P1260 branch-and-remote-refs step on the first post-merge `/weekly`

**ID:** INBOX-5
**Status:** proposed
**due:** week

P1260 added step 2.4.6 to `/weekly` (it runs `git-ops.sh gc` and prints every local branch and
every head on `origin` with a merge verdict). The step was committed to `main`; the rewritten `gc`
it calls shipped with `feature/p1260-ref-class-publication`. Before that merge the two halves were
never in one tree, so the step could not produce its report — a `/weekly` on 2026-09-08 ran the old
`gc` and printed `no stale branches` instead.

**To close:** on the next `/weekly` after the merge, confirm the Evidence Picture shows a `REFS:`
line and per-ref verdicts. If it does, delete this entry and add a one-line `[process]` note to
`docs/decisions.md`. If it does not, the step's command path is wrong and needs a fix.



---


## /ship's direct-to-main path needs a stamp that only /dev and /fix write (due: month)

**ID:** INBOX-6
**Status:** proposed
**due:** month

`/ship` says "Run `/ship pN` anyway" when there is no feature branch, and `git-ops.sh` requires
**two** things for that path: `status` in {qa, in-progress} **and** a `pN ready for QA` stamp commit
on main. Verified 2026-08-31: `grep -rn "ready for QA"` across the build skills returns only
`dev.md` and `fix.md` as writers.

So work done genuinely inline — no `/dev`, no `/fix`, no branch — cannot close its own spec, and
nothing says why. P1187 hit this: the stamp had to be hand-written before `/ship` would proceed.
That took a minute and the gate was *right* to demand proof the work landed, which is why this is
an inbox note and not a decision — but the next session will lose the same minute to the same
surprise, and `/ship`'s own text implies the on-main path just works.

Two candidate fixes, unassessed: `/ship` writes the stamp itself when the spec is at `qa` and the
user confirms the work landed; or `/ship`'s docs simply say "inline work must write the stamp
first" and show the one command. The second is smaller and does not weaken the gate.

Falsifier: on a spec at `status: qa` on main with no branch and no `ready for QA` commit, run
`./scripts/git-ops.sh ship pN` — it refuses on the code-presence gate.

---

## The Codex-vs-Opus review bake-off is unresolved — n=1, and the control lens never reported

**ID:** INBOX-7
**Status:** proposed

**due:** month

2026-08-28 (P1187). A spec was handed blind to two hostile reviewers on an identical prompt. Codex
GPT-5.6-Sol (max) returned 9 findings, **8 confirmed by command**, and found a root cause that the
Opus author and an earlier Opus-side review had both missed. The Opus control returned **nothing,
twice**, then was stopped. So the comparison did not happen: we know Codex did well on one infra
spec; we do not know it did better than Opus on anything.

**What would settle it:** on the next 2-3 adversarial reviews, run both lenses blind on the same
prompt and score *findings the other lens missed, confirmed by command* — not by reading quality,
and never by the spec author's judgement (the author is not independent of the artifact). Record
the ratio each time. After three, the answer is either obvious or the difference is noise.

**Why this is debt and not just a nice-to-have:** a provisional default is already in force
(decisions.md 2026-08-28 [process] adopted Codex as the default *second* lens). If the benchmark
never runs, that provisional default silently becomes permanent policy on n=1 evidence — which is
the exact failure the entry warns about.

Falsifier: three reviews from now, `grep -c "reports received" docs/decisions.md` shows no new
ratios recorded — the benchmark was adopted in writing and never executed.

---

<!-- Resolved 2026-09-15: "goal-gate CHECK 5 is unreachable for any feature that needs more than a few review rounds" — see decisions.md 2026-09-15 [process] -->

## The deploy record can say a fix shipped when it did not — the manifest itself needs a trust check

**ID:** INBOX-9
**Date:** 2026-08-21
**Status:** proposed
**due:** week

`deploy-manifest.json` lists a migration as applied in both the test and prod arrays. Test reflects
its effects; prod does not. Either it never executed against prod, or the objects it changed were
altered out-of-band afterwards. Detail (which migration, what it touches) is in the private security
log — unpatched status, not for the public repo. Still unaddressed.

The consequence is not the one migration. **Every audit that treats the manifest as evidence of live
state inherits this**, and this repo has a documented habit of doing exactly that. It is strictly
worse than the migration-files-can-lie finding, because the manifest is the repo's *own record of
what shipped* — the thing you consult precisely when the files are in doubt.

Twice in one session on 2026-08-20 an agent nearly told the founder "that's already fixed" on the
strength of the manifest. `scripts/rls-drift-check.py` (P1048) already does live-vs-file diffing for
the policy slice; the open question is whether that generalises into a manifest-vs-live check, and
what it should do when they disagree.

Deferred deliberately 2026-08-21: important, not urgent. Filed here rather than left in the founder's
memory. Needs its own spec — do NOT fold it into the spec that closes the security hole, or it gets
closed when the hole closes and the systemic problem walks away untracked.

Promote recommended by /prioritize 2026-09-15: the entry itself says it needs its own spec, and no open spec covers manifest-vs-live drift.

---

## A probe that returns a loud wrong number is not covered by the run-a-control rule

**ID:** INBOX-10
**Date:** 2026-08-21
**Status:** proposed
**due:** week

The global rule fires when a probe returns **emptiness** for every candidate: run a known-good control
through the identical probe, and if the control is also empty, the probe is blind. It works — it caught
two blind probes on 2026-08-20.

It does not fire when the probe returns *plenty and wrong*. Same session: `ps aux | grep -c playwright`
returned **46**, reported to the founder as 46 competing test processes. Listing the actual command
lines showed 39 of 41 matches were idle MCP browser servers and **exactly one** real test runner. A
valid experiment was stood down on that number, and the subagent running it adopted the wrong framing
and reported its own healthy 3m53s run as "not converging."

Candidate rule: a count used to justify a decision must be re-run in a form that enumerates the items
it counted, before the decision. Three occurrences in one four-hour session (the count above, a grep
whose five file arguments collapsed into one filename and printed "NONE", and a TSV parsed on the
wrong column returning empty).

Presented at `/kdd` 2026-08-21; founder deferred. Needs the `/slava:maintain:claude-md` gate before any
edit to the global rules.

---

## An objection is a conjecture, not a refutation — pre-commit the falsifier before the conversation

**ID:** INBOX-11
**Date:** 2026-07-27
**Status:** proposed

In a single 2026-07-26 conversation the buyer moved four times — co-founder pairs → a COO buying an interdepartmental handoff protocol → an acquirer in due diligence → citizens in an online assembly. Each step was a defensible answer to a real objection, and **not one objection was a test.** No pitch failed, no letter went unanswered, no founder said no. Each was a *conjecture about the market*, paid for with scope. The direction was monotone: every move raised the stakes and diffused the payer, because objections dissolve at sufficient altitude.

Secondary signature, same session: eight further messages designing a funnel (15 min or 30 · questionnaire or interview · report or session · €199 / €299 / €2k) that **changed every single message.** That instability wasn't indecision — it was the absence of a constraint. Conjecture against conjecture with zero data about what a founding pair does when asked to pay. In that condition a design *cannot* converge, because there is nothing to converge on.

This is the project's own Popper gap running in reverse: falsification requires a test, and "this might fail" is not evidence that it did.

**Fix to test — write the falsifier down *before* any conversation that could relocate the buyer, wedge, or positioning** (with an AI, an advisor, or a peer). One line, in the form:

> *I move off this only if [N attempts] produce [result].*

Then no argument in that conversation can move the position — only the number can.

**Standing pre-commitment for the current wedge `[FOUNDER DECISION: thresholds]`** — proposed defaults, drawn from the funnel walk-back in [goals.md](goals.md) (~7% book, ~20% close); overwrite with your own:
- 50 warm messages → fewer than 3 conversations booked ⇒ the message is wrong (change the message, not the segment).
- 5 free sessions run → nobody asks about anything paid ⇒ the wedge is wrong.

Until a number exists, every strategy conversation can relocate the buyer, and in the week of 2026-07-26 four did.

**Track:** over the next 4 weeks, did a written pre-commitment prevent (or correctly permit) a relocation? Once 2–3 data points exist, promote the rule to [decisions.md](decisions.md) `[process]` and remove this entry.

**Data point 1 of 2–3 (2026-08-01) — a NEAR-MISS, and it names a second vehicle the fix above does not cover.**

The thresholds below were still unfilled (`[FOUNDER DECISION]`), so no pre-commitment was in force. In the following week the buyer was relocated **in copy, not in argument** — across four pitch-iteration conversations (2026-07-30 → 2026-08-01) the audience widened from the documented wedge (a growing seed–A team — [hypotheses.md](hypotheses.md) H-BuildRightThing) to *"a partner, a parent, someone you work with"*, the founder story was deliberately de-specified to "a colleague" so non-founders would not feel excluded, and the offer became a €50 public evening. Same monotone direction this entry names: widening scope, diffusing the payer.

**It did not land.** Asked directly, the founder declined the event and chose a campaign instead — so the relocation was *drafted and not adopted*. That is what makes this a near-miss rather than a failure, and the distinction matters: this entry cannot yet claim the guard was defeated, only that a route around it exists.

Two things it adds:

1. **Copy iteration is a second vehicle, and it does not announce itself.** The fix above triggers on "any conversation that could relocate the buyer, wedge, or positioning" — which reads as a *strategy* conversation. Every individual edit here was arguable on craft grounds (one instance carries all the illustrative load, so readers infer the audience from it; founder vocabulary makes a reader file it as a founder thing). None was framed as a segment decision. Together they were one. **Extend the pre-commitment to cover audience and price, not only the named buyer segment.**
2. **The same signature ran at the price layer inside a single conversation.** €300 → €100 with a money-back guarantee (~€25/hour), in the founder's own head, no prospect present, nobody objecting — the second unforced downward move. No market signal was in the room at all; there was only reasoning.

**Still unfilled — and a campaign is imminent, which is exactly what these were written for.** A threshold set after the campaign is worth nothing. Proposed defaults remain below, awaiting `[FOUNDER DECISION]`.

Narrative: `content/articles/a55_the-refutation-that-never-ran.md` (enriched 2026-08-01 with this vehicle).

**Related:** CLAUDE.md "Working Style Patterns" (overintellectualization — this is the testable form of it) · narrative `content/articles/a55_the-refutation-that-never-ran.md` · [hypotheses.md](hypotheses.md) "do not move the wedge on n=1" ([decisions.md](decisions.md) 2026-07-07).

---

## Spotting the illusion of recursive understanding in the wild

**ID:** INBOX-12
**Date:** 2026-05-19
**Status:** proposed

When the founder spots the illusion in an unscheduled context (casual conversation, business meeting, family setting), in-the-moment correction often triggers the defensive response that the workshop frame is designed to prevent. Opt-in is what makes the framework safe in workshops; reactive deployment loses opt-in by default.

**Open default to test:** notice early → pause (do not correct mid-conversation) → if the relationship has standing, ask permission for an async follow-up ("I noticed something about how we just talked — want me to send a short note?") → send the artifact (letter excerpt, paraphrase, story) async with the reader's consent → only verify in /live if they engage.

**Fix:** Test this default in 3 unscheduled-context encounters over the next 4 weeks. Track: did pausing-then-asking-permission produce a different outcome than in-the-moment correction? Once 3 data points exist, promote the better-performing default to facilitator-guide.md and remove this entry.

**Data point 1 of 3 (2026-07-16) — the anti-default was run, and it went the way this entry predicts.** Unscheduled social context, recent acquaintance, no stakes and no opt-in. The protocol was deployed *in the moment and unannounced*: "I understand you at 5/10," plus a request that she grade his understanding of her. She declined to give a number, then said she didn't want to think right now; that self-report was overridden ("how can you talk without thinking"), and she disengaged entirely.

This is **not** a test of the pause-then-ask default — it is a control observation of the reactive branch, and it reproduces the predicted failure. Three things it adds beyond confirming the hazard:
1. **The protocol has no consent layer and no ambient-context guard** — neither is written down anywhere in `docs/`. The distinguishing rule (why running this unannounced on a close friend at dinner is a different act) does not exist. That rule is the missing artifact, not the encounter.
2. **The self-report sovereignty gap fired live, in the observer's favour** — a first-person report about her own cognitive state was overridden by the observer's model of it, by the person who named the gap. This is the framework's open axiom being resolved unremarked, against the framework's own commitment.
3. **A score being available does not imply the gap is articulable.** Giving a number is cheap; articulating the delta to 10 is expensive theory-of-mind work — same operation, opposite valence (reward for the asker, tax for the other party). Candidate design fix, untested: the burden of articulating the gap belongs to the party who wants the comprehension — the asker produces the candidate delta, the other party only says warmer or colder.

**Guard on the interpretation:** "it's probably just how I said it" is unfalsifiable — every refusal becomes a delivery bug and the trait explanation can never lose. Do not settle this by introspection. The falsifier is the asymmetric variant run on ~10 strangers with stated stakes: refusal persists → trait boundary; refusal dissolves → delivery. Not yet run.

**Related:** [lean-canvas.md](lean-canvas.md) "Reactive-deployment hazard" note. Behavioral assay against repeating the 2026-05-09 escalation pattern. Narrative: `content/articles/a49_the-stranger-who-broke-it.md`. Source: 2026-07-16 conversation (other party is a private individual — kept unidentifiable).

---

## Default to e2e test for verification — never delegate manual testing to user

**ID:** INBOX-13
**Date:** 2026-03-23
**Status:** proposed

Agent asked user to manually test /live session flow 4+ times instead of writing an e2e test. Playwright two-party infrastructure exists (`e2e/helpers/test-user.ts`, `test-realtime.ts`) and can reproduce any session scenario. When writing a reproducer, extract exact conditions from screenshots/bug reports — don't assume the happy path (this session: the bug was same-name users, but the first e2e test used different names and got a false green).

**Fix:** (A) When investigating a /live bug, write the e2e reproducer FIRST before theorizing. (B) Always extract the exact user conditions from evidence (screenshot names, console output) into test parameters. (C) After CSS changes on /live, run `npx playwright test e2e/live-rating-drawer.spec.ts` before reporting success.

---

<!-- Resolved 2026-08-14: "/dev pre-flight doesn't check branch lineage — /ship surprise risk" — see decisions.md 2026-08-14 [process]. /dev half shipped (dev.md:86); /pick-flow half dropped with reasoning. First entry closed through the /weekly step 2.5 path (P1081). -->

## Dead code not caught by /finish or pre-commit

**ID:** INBOX-14
**Date:** 2026-03-02
**Status:** proposed

`PointCardDetail.tsx` had zero production callers and lived in `src/app/components/` undetected — caught only by an ad-hoc consistency audit, not by `/finish` or any automated check. `/finish` checks correctness and patterns; it does not detect zero-caller exports.

**Fix:** Add dead-code detection (`knip` or `ts-prune`) to `scripts/pre-commit-checks.sh` or as a step in `/maintain:cleanup`. Zero-caller components accumulate silently across feature merges.

---

## Raw ideas processing has no skill (`/process-raw-ideas`)

**ID:** INBOX-15
**Date:** 2026-03-01
**Status:** proposed

Two separate sessions involved processing voice notes into structured product/philosophical content (extract ideas → classify → file spec / doc update / private content). Each session reinvented the intake flow with no template: what gets filed where, what stays private, what becomes a spec vs doc update.

**Fix:** Create `/process-raw-ideas` skill. Steps: (1) read raw transcript, (2) extract distinct ideas, (3) classify each: spec / doc update / private / drop, (4) file or draft in the right place, (5) surface open questions and dropped threads. Should handle the "some content is private, some public" split explicitly.

---

---

<!-- Removed 2026-03-16: "Session goal alignment needed at start" — see P518 -->
<!-- Removed 2026-03-16: "Listener needs exactly two choices" — see P517 -->
<!-- Removed 2026-03-16: "Future event formats to test (parked)" — no longer relevant -->
<!-- Moved 2026-03-16: "Framework iteration without execution progress", "Gap reveal not yet reliable", "Externality claim unproven" — moved to pp/docs/decisions.md -->

## Mobile UX bugs are session-killers

**ID:** INBOX-16
**Date:** 2026-03-14
**Status:** proposed

Observed during Pair C session. Three bugs that break the session flow:
1. **Scroll bounce → accidental refresh:** On mobile, scrolling up causes the page to refresh, kicking the user out of the active /live session. Session state lost.
2. **Tap targets too small:** Users with long nails miss the intended button and accidentally hit "speak freely" instead. Not clear what mode they're in afterward.
3. **Position removal on click unclear:** Clicking on an already-taken position removes it, but there's no visual feedback or confirmation. Users don't realize they've un-positioned.

**Fix:** These should be fixed before the next facilitated session — each one causes visible confusion and breaks the experience for channel partners evaluating the tool.

---

## Synchronous sales calls as acquisition bottleneck

**ID:** INBOX-17
**Date:** 2026-03-21
**Status:** proposed

Intro calls that don't directly deliver session value get deprioritized under bandwidth constraints. Fix: default to async distribution (booking links, forwardable offers) instead of scheduling exploratory calls. Batch scheduled calls into one day/week.

**Related:** ladischenski.com pricing page needs improvements — comparison anchoring, explicit session length, ROI story, FCO price range. See customer price evaluation conversation 2026-03-20.

---

<!-- Resolved 2026-09-15: "A second, undocumented inbox exists at .claude/process-learnings.md" — folded by P1317; see decisions.md 2026-09-15 [process] -->

## Did the close path actually shrink the queue, or does intake still outrun it?

**ID:** INBOX-18
**Date:** 2026-08-14
**Status:** proposed
**due:** month

P1081 accepted a known risk rather than mitigating it: **intake is not throttled.** Automated
writers (`/claude-conversations-to-cp`) can keep filing faster than the weekly close retires. The
spec's stated trigger for revisiting is *"only if the count rises after step 1 ships."*

Baseline at ship: **9 open public / 2 open private** (2026-08-14).

**Resolved when** a month of counts shows the total flat or falling — the close path works, record
it and drop this. **If the total has risen**, the accepted risk has fired: the fallback the spec
already names is throttling intake (stop automated runs filing proposals nobody intends to act on),
*not* closing harder.

---
## Instrument the `/live` clarify sub-loop so P1080's bug class is visible in prod

**ID:** INBOX-19
**Date:** 2026-08-14
**Status:** proposed
**due:** week

P1080 fixed a deadlock that stranded both participants from round 2 of every guided session. The
fix is proven by test, but **not observable in production**, because the two instruments that would
show it are missing:

1. `live_phase_transition` watches `ratingPhase` only (`clarity-live-page.tsx:718-740`). The entire
   round-2+ machine lives in `clarificationPhase` and emits nothing. The rounds users got stuck in
   were the unlogged ones.
2. The good-enough / skip exit from `speaker-deciding` fires no event — only `live_clarify_started`
   does. A deliberate exit and a stall are therefore indistinguishable: of 40 sub-perfect re-ratings
   in the last 180 days, 27 clicked through and **13 are unattributable**.

**Resolved when** a phase-transition event covers `clarificationPhase` and the skip exit is tracked,
so the post-fix round-2→3 continuation rate can be read directly.

**Droppable if** a decision is taken that `/live` telemetry is not worth extending — but then say so
explicitly, because the current state means no future fix in this area can be verified against real
sessions either.

---

## Recovery net for stuck `/live` sessions — the never-filed "P525b"

**ID:** INBOX-20
**Date:** 2026-08-14
**Status:** proposed
**due:** month

P525 (2026-03-16) explicitly deferred "Recovery UI (watchdog timer, 'Reset round' button),
celebration auto-complete timeout, stale-phase detection" to a follow-up it called P525b. That spec
was never filed — grep finds the name only inside P525 itself. Five months later P1080 hit a
deadlock in the same subsystem that the watchdog would have bounded regardless of cause.

**Do:** surface a "Reset round" control when a session sits in one phase past a threshold. Purely
additive — no change to the state machine, bounds user harm whatever the next root cause turns out
to be.

**Resolved when** a stuck session has a user-reachable way out that is not "abandon the round".

**Droppable if** telemetry (entry above) shows zero stuck sessions over a meaningful sample after
P1080 — the net is insurance against the *next* bug, so absence of the last one is weak evidence.

---

## Patch the programme-health verdict criteria — the pivots-vs-corroboration blind spot

**ID:** INBOX-21
**Date:** 2026-08-14
**Status:** proposed
**due:** month

Nothing in the verdict table weighs pivots-without-novelty against a single weak corroboration, so
a period can score PROGRESSIVE via criterion 3 while accommodating almost everything. Recorded
2026-08-07 with the instruction to "apply on a later run, not the run that surfaced it."

The 2026-08-14 run **is** that later run, and it reproduced the case: 5 of 6-7 pivots graded
accommodation against one n=1 corroboration whose source datum is separately flagged as too
confounded to move a related sub-bet. The verdict shipped as PROGRESSIVE/LOW-confidence because the
criteria are fixed in advance and were not tuned to the result.

**Resolved when** the criteria carry a clause that can demote a period on the accommodation ratio
(a `/kdd` or `/docs-strategy-update` job — never inside a run whose verdict it would flip).
**Droppable if** the next two runs show the ratio inverting on its own, which would mean the
criteria were reading a one-off period rather than a structural gap.

---
## P976's stale-echo canary has never run its own assertions — and now that it does, it fails

**ID:** INBOX-22
**Date:** 2026-08-14
**Status:** proposed
**due:** week

`e2e/p976-boolean-flag-stale-echo.spec.ts:61` called `waitFor({ state: 'enabled' })`. That is not a
valid Playwright wait state (only attached/detached/visible/hidden), so the call **threw** and the
test never reached a single assertion. The line was fixed 2026-08-14 — the test now runs, and its
real assertion fails.

The failure screenshot shows the host's rating drawer **reopened with no rating selected**, which is
exactly the FAIL signature the test's own comments document: *"Pre-fix: checkerSubmitted reverts to
false → host sees rating drawer (FAIL)."*

**What this means:** the P976 monotonic boolean-flag guard has been shipped and treated as protective
while its only end-to-end canary was inert. Its unit tests pass (8/8), but those exercise
`isStateRegression` as a pure function — they cannot show whether the guard actually holds across a
real two-party Realtime + drift-poll round trip. Epistemic gate 7: a gate never observed passing *or*
failing is unproven.

**Do:** determine whether this is (a) a real hole in the guard on the delivery path, or (b) a fixture
artifact — e.g. the host's submit never landed, so there was nothing for the echo to revert. Check
whether step 4's `waitForUIUpdate` can pass spuriously before concluding either way.

**Resolved when** the test passes for a understood reason, or the guard is fixed and the test proves
it. **Do not** adjust the assertion to match current behaviour without establishing which of (a)/(b)
is true — that is how the P1080 assertion pinned a deadlock for five months.

---

## Retire or rewrite `e2e/p674-linear-flow.spec.ts` — 7 permanently-red tests for a REJECTED spec

**ID:** INBOX-23
**Date:** 2026-08-14
**Status:** proposed
**due:** week

`features/archive/p674_simplify_live_free_mode_only.md` is `status: rejected` — the "merge guided and
open into a single linear flow" design was decided against. Its 521-line e2e spec was never removed
and contributes **7 of the 11 pre-existing failures** in the /live suite.

The tests assert the rejected design directly: `p674-linear-flow.spec.ts:424` requires the
Guided/Open toggle to be **absent**, while `p562-free-mode.spec.ts` passes asserting it is
**present** — two tests in one suite asserting opposite things, with the rejected one red. Several
also call `advanceSessionState(code, { phase: 'celebration' })`, writing a key (`phase`) that is not
a live_state field at all, on top of a phase value that does not exist.

**Decision needed (founder):** delete the file, or salvage the 1–2 tests that cover still-valid
behaviour and delete the rest. Deleting tests is normally forbidden — the exception here is that the
spec they encode was explicitly rejected, so they are not protecting anything.

**Why it matters beyond tidiness:** 7 always-red tests train everyone to read a red /live suite as
normal, which is how P1080 survived — nobody could tell signal from the standing noise.

---

## `/live` mode switcher may stay disabled after a completed round (p617 UAT-6)

**ID:** INBOX-24
**Date:** 2026-08-14
**Status:** proposed
**due:** month

`e2e/p617-mode-switcher-lifecycle.spec.ts:177` ("mode switcher reappears after full round") fails on
`main`: it asserts the disabled styling (`opacity-50` + `cursor-not-allowed`) is gone once a round
completes, and the styling is still there. Pre-existing, unrelated to P1080.

Per P643 the switcher is deliberately *disabled rather than hidden* while a partner is rating. The
open question is whether it correctly re-enables afterwards.

**Do:** decide whether this is a real stuck-control bug (user-visible: mode can never be changed
again after round 1) or a stale assertion. **Reproduce in a browser before touching the test** — a
permanently disabled control is a plausible real defect, and the p617 suite's other tests pass.

---

---

<!-- Resolved 2026-08-27: "Propagate the disproven R₀≈0 figure through the strategy docs" — applied
     directly (a factual correction is a bug fix, not a strategy change). Propagated to hypotheses,
     progress, lean-canvas, theory-of-change, research-programme, goals, the LessWrong blog draft,
     p1028, p948, p1084. See decisions.md 2026-08-27 [product]. -->

<!-- Resolved 2026-09-15: "Reap zombie vite/playwright processes between e2e runs" — see decisions.md 2026-09-15 [process] -->

## Extend the supersession gate to cover docs/decisions.md

**ID:** INBOX-26
**Date:** 2026-08-15
**Status:** proposed
**due:** month

`/docs-strategy-update` runs nine anti-drift gates, including a deterministic single-valued-slot
reconciliation, but they cover only the six strategy docs. `docs/decisions.md` is owned by `/kdd`,
which has no supersession gate at all — measured: 202 lines contain "supersede" against 2 marked
entry headings, and 64 `Status: proposed` entries with nothing relating them to a resolution. A
grep hit therefore carries no currency signal. Must be mechanical, not a marking convention: this
repo has already measured a routing line firing 0 times out of 30. Drop if a resolved-`proposed`
back-reference lands some other way, or if a currency signal turns out to be cheaper to add at
read time than at write time.

---

## Rewrite referrers when git-ops.sh ship moves a spec

**ID:** INBOX-27
**Date:** 2026-08-15
**Status:** proposed
**due:** month

`fix-doc-links.cjs` repaired 473 dead links caused by specs moving into `features/done/` without
their referrers being updated, but that is cleanup, not prevention — the move happens in
`git-ops.sh` ship (the `git mv` at the spec-close step) and still rewrites nothing, so the debt
regrows every ship. The commit-time gate only sees files staged in that commit, which a referrer
elsewhere is not. Prevention belongs at the move. Deliberately not done inline: ship is the
delivery-critical path with locking and a cherry-pick sequencer, and it deserves its own change
rather than riding along with a docs fix. Drop if the periodic `fix-doc-links.cjs --apply` run
proves to keep the count flat on its own.

---

## Tell a not-signed-in reader their rating will not be saved

**ID:** INBOX-28
**Date:** 2026-08-17
**Status:** proposed
**due:** week

Surfaced three times during P1067 and never filed until now. On the public reading path a reader who
is not signed in can rate, but the write is refused server-side and the reader sees only a generic
failure toast — nothing says the rating was not kept, or that signing in is what keeps it. The
refusal itself is correct and deliberate (P1067 confirmed the anonymous write surface does not
exist); this is purely the missing explanation at the moment it happens. Small copy-and-state change,
no schema. Related but distinct from P1092, which builds server-side reader state so those ratings
*can* be kept — if P1092 ships first this note is obsolete, so drop it then rather than doing both.

---

## 2026-08-18 — P1067's integration spec is not serial-safe (test hygiene, not a product bug)

**ID:** INBOX-29
**Status:** proposed
**due:** week

`e2e/integration/20260817120000_p1067_anon_rating_gates.spec.ts` passes at default parallelism (6/6)
and fails at `--workers=1` (1 failed): its L6 catalog layer inserts a `(delivery, story)` rating row
that L4 has already created when the two run in the same worker sequentially, so the P1067 unique
index correctly rejects it — `duplicate key value violates unique constraint
"story_verifications_letter_delivery_story_unique"`.

Harmless today because normal runs are parallel, but it means the file cannot be used to reproduce
anything serially, which is exactly what you want during an incident. Found while running the P1093
canary at `--workers=1` to remove doubt about a flake. Fix is per-layer fixtures in L6 (the file's
own header already notes layers get one story each — L6 reuses L4's).

**due:** month

---

## /ship strands a worktree from ~15 more sites, and auto-closes specs it never implemented

**ID:** INBOX-30
**Status:** proposed
**due:** week

Two follow-ups from the P1057/w1 stranded-worktree fix (`a70f9e18`). Both were found by the
adversarial review of that fix and deliberately left out of it.

**1. Phase 2b runs before Phase 3, and it is not load-bearing.** `cmd_ship`'s branch+worktree
cleanup is last, so roughly fifteen constructs between the first cherry-pick and Phase 3 still
abort and strand: `sprint_dir="$(resolve_ship_sprint_dir)"` (that function calls `exit 1`, which
in a command substitution becomes status 1 on an unguarded assignment — and `features/done/CURRENT_SPRINT`
holding garbage is a case its own comment says to expect), the PRIMARY spec's `ship_rewrite_frontmatter`,
`title="$(ship_extract_title …)"` (decodes without an explicit encoding, unlike its sibling
`ship_rebase_doc_links`, whose comment says a locale-dependent decode is a real hazard in spec
bodies), and both `git add` calls (exit 128 when a co-tenant holds `.git/index.lock`).

Guarding them one at a time is whack-a-mole. Phase 2b reads only `$cospecs` (captured back in
Phase 1) and working-tree paths — no `$branch`, no branch ref — so Phase 3 could run BEFORE it.
Caveat: swapping alone trades one leak for another, because `branch_deleted: true` makes the new
abort trap return silently and the final `rm -f "$journal"` never runs; the journal cleanup has to
move with it. Mitigated meanwhile: the trap reports the strand and `git-ops reconcile` now detects
it durably.

**2. `detect_cospecs` closes specs that were merely CREATED on the branch.** It greps
`git log --name-only main..branch` with no `--diff-filter` for adds, so a follow-up spec split out
mid-branch is auto-closed as `all-done` without ever being implemented. History: `fix: reopen p1057
— auto-closed by /ship without being implemented`, `fix: reopen P1045/P1047/P1048`, `fix: reopen
P1044`, `Revert "chore: close p929 (co-located with p928)"`. `docs/decisions.md` already names the
fix ("exclude specs created by the branch's own commits"). Note `a70f9e18` makes this marginally
worse: the loop now `continue`s past a failed co-spec instead of aborting, so later co-specs that
a crash used to spare are now closed too. Worth a spec, not a note-sized fix.

**3. Canary R had zero coverage of the new ship output — FIXED in `6c959d17`.** R greps
`$R_SCOPED_LOG` early in the file while `capture_r` appends, so it could never see any canary added
after it. `SAFETY_LOG` collected the whole run and was never read. R2 now runs last, scoped to
git-ops's own lines, and fails if its filter captures nothing so a blind pass is impossible. Left
here because the shape recurs: an append-only log checked from the middle of the file silently
stops covering everything added below it.

**due:** month

---

## `/goalify-update` — build the improver once the runs exist (2026-08-19)

**ID:** INBOX-31
**Status:** proposed
**due:** week

`/goalify` (planned, not built) leaves one `feedback.md` per feature carrying two numbers: corrections
the founder gave, and turns consumed. **After 3–5 goalify runs, read those files and create the
`/goalify-update` spec.** Not before — a spec written today would be empty of the only thing that
matters: which pattern the improver should look for.

What it should do: read the accumulated feedback, find the repeated correction ("four of the last five
runs, the same class of thing got fixed by hand"), and **propose** changes — a new question for the
decision sheet, a tightened gate check, a skill worth retiring or rewriting.

**Propose, never apply.** CLAUDE.md already requires approval before creating, modifying or deleting
any skill; a goalify that silently rewrites its own instructions is the agent grading and then editing
its own homework. Manual invocation, not an automatic step at the end of each run — automatic
self-modification means the system drifts between the founder's looks at it.

This is also when skill retirement becomes answerable: accumulated feedback plus a working gate turns
"is `/ux` any good?" into "run the same spec with and without it, count the rounds."

**First data point, logged 2026-08-20 (P1114) — and it answers the `/ux` question from the wrong
direction.** `/pick-flow` dropped `/ux` from the flow on the argument that the spec already carried
the eight UI states and that the ten `[FOUNDER DECISION]` copy strings needed the founder anyway, so
`/ux` could not produce them. Both premises were true; the conclusion was wrong. **Listing the states
a screen can be in is not the same as deciding what it looks like** — and `/ux`'s real deliverable
here was neither states nor copy, it was the *reuse/extend/extract/new* classification per element.
With that step gone, every element defaulted to **new**: the room hand-rolled an eleven-button 0–10
ladder while `SliderTrack` — already extracted, already imported by `ready-page.tsx` — sat unused in
the same repo. The founder rejected the page on sight; cost was a full page rebuild plus a component
extraction that should have been decided before any code was written. The spec had *said* layout was
"a `/ux` question, not settled here"; the flow overrode the spec's own deferral.

Two things worth measuring when the improver exists: (a) `/pick-flow`'s skip reasons are currently
free prose and nothing checks a skip against what the spec explicitly deferred — a mechanical
cross-check is cheap; (b) this is a **skip-quality** failure, not a skill-quality one, so
"is `/ux` any good?" was never the right question here — `/ux` was never run. The improver needs to
distinguish *the step was bad* from *the step was skipped*, or it will retire skills that were never
given a turn.

A durable guard shipped alongside the fix — `src/tests/p1114-shared-component-reuse.test.tsx` fails
if the room grows its own copy of a shared control again. Note the asymmetry: that catches the
*second* instance, never the first. Only the flow step catches the first.

Plan: `~/.claude/plans/btw-maybe-view-or-gentle-fern.md` · decisions.md 2026-08-19 (three entries).

**due:** month
Promote recommended by /prioritize 2026-09-15: its trigger is met — 7 goalify feedback.md files exist and no goalify-update spec does.


## Activate the goal-gate boundary — push, prove it red, then mark it required

**ID:** INBOX-32
**Date:** 2026-08-20
**Status:** proposed
**due:** week

The `goal-gate` CI check exists and is proven locally (28-case canary, red-first) but has
never run on GitHub, so it is currently **advisory at the boundary** — a red gate does not
block a merge. Do these in order, because each step unblocks the next: (1) push, so the
workflow runs once and GitHub learns the check name — it does not appear in the ruleset
picker until then; (2) push a branch that deliberately fails one check and confirm CI goes
red, since the gate has been watched failing 22× locally and 0× in CI; (3) run
`/slava:think:adversarial-review` with **one** reviewer on the single lens "can this gate be
made to pass without the work being done" — cheap, and a broken-green finding would
invalidate everything downstream; (4) add `goal-gate` to the `main-privacy-gate` ruleset's
required checks (founder-only, ALWAYS-ASK).

Done when a red gate demonstrably blocks a merge. Droppable if `/goalify` is abandoned — the
gate protects nothing until a spec is goalified, and no spec is today.

---

## Check whether the P1087 analytics tier rename broke live Mixpanel funnels

**ID:** INBOX-33
**Date:** 2026-08-21
**Status:** proposed
**due:** week

P1087 renamed the `offers_cta_clicked` tier values (`program` / `premium` →
`membership` / `partnership` / `custom`) and added a `placement` prop. Nothing in the
repo defines dashboards, so an adversarial reviewer could confirm neither breakage nor
safety — any live funnel or saved report keyed on the old strings is silently broken,
and a silently broken funnel reads as "nobody clicked" rather than as an error.

Open Mixpanel (or use the Mixpanel MCP in a `c`/`ce`/`cf` session), find reports filtering
`offers_cta_clicked` on the old tier values, and either repoint them or note that none
exist. Done when the answer is written down either way. Droppable if no such report exists.

---

## No test binds the hardcoded Stripe link IDs to the prices they claim

**ID:** INBOX-34
**Date:** 2026-08-21
**Status:** proposed
**due:** month

`offers-section.tsx` hardcodes two live Payment Links and documents in comments what each
one costs (€295/month; €1,450 one-off). `isStripeLink` validates the URL *shape* only —
nothing proves link → price → product correspondence, so a copy-paste of the wrong link
would ship a page that charges the wrong amount while every test stays green. This is an
infra fact, not a component-testable one (adversarial review, P1087, gate 7b).

Possible shape: a script hitting the Stripe API to assert each link's price matches the
displayed figure, run in `/day` or pre-deploy rather than in the unit suite. Worth doing
only if a third paid link appears — with two, the blast radius is small and the comments
are accurate today. Droppable if the links move to a CMS or env config with its own check.

---

## Harvested YouTube comments may carry private individuals' identifiers onto a public page — unverified

**ID:** INBOX-35
**Status:** proposed

**due:** month · surfaced by the P1141 security review, 2026-08-21

`/slava:disagreement:prepare` harvests comment sections as opposition material. The subjects being
quoted are public figures cited from public recordings, which `.claude/rules/pii.md` explicitly does
not treat as a violation. **Commenters are not.** They are arbitrary private individuals, and if a
comment carrying a third party's name or handle is selected as quote material, an agent account
publishes that identifier on a public page under a real person's name.

The public-figure exemption does not reach this, and neither does the pre-commit gate — that gate is
allowlist/pattern-based and will not flag an arbitrary name (`.claude/rules/pii.md` says so
directly). Nor does the roles-not-names authoring rule, which governs prose an agent *writes*, not
third-party text it *quotes*.

**Explicitly unverified.** The security agent flagged it without reading the skill's selection logic
end to end, so it is a question, not a confirmed defect. Two outcomes are both fine: the selection
logic already excludes comment text from quotes (then record that and close this), or it does not
(then it needs a filter before the next run that harvests comments).

Recorded as a build-sequence item in `features/p1141_story_carries_a_video_with_jumpable_quotes.md`
under the skill-updates step — answer or scope out, do not let it pass silently. Noted here too so
it survives if P1141 is descoped or parked.

**Resolves at:** read `/slava:disagreement:prepare`'s opposition-selection section end to end and
state whether harvested comment text can reach `stories.content` or a quote. If it can, filter it.

---

## Harness-readiness check + tested-combinations table

**ID:** INBOX-36
**Date:** 2026-08-23
**Status:** proposed
**due:** month

P1151 projects slash commands to other harnesses, but hooks, auto-loading path-scoped rules,
permission settings and MCP config have no equivalent to project into — so a new harness gets
the commands with none of the guardrails underneath them, silently. Build (a) a short check
runnable inside any new harness that proves it can see the commands and the root instructions
and reports what is missing, to run on day one with a new tool, and (b) a dated table of which
harness/model combinations have actually been tested versus assumed. Drop this if P1151's
research finds an existing tool that already reports harness conformance, or if the other
harnesses stay read-only scratchpads where guardrails do not matter.

---

## Audit the hooks — one safety hook is not wired

**ID:** INBOX-37
**Date:** 2026-08-23
**Status:** proposed
**due:** week

`.claude/hooks/block-banned-git.py` exists but nothing references it in `settings.json` or
`settings.local.json`, so it does not run — a banned-git blocker that has been inert for an
unknown period. Determine whether that is deliberate or a regression, and while there, audit
all 13 hook files: which are wired, what each blocks, and classify each as catching a bad
OUTCOME (movable to a repo-level check that works from any harness) or a bad MOVE mid-session
(assistant-only by nature). Drop the audit half if the hooks get reviewed by other means;
the block-banned-git question should be answered either way.

---

## Check architecture docs against the projected-skills tree (P1151)

**ID:** INBOX-38
**Date:** 2026-08-23
**Status:** proposed
**due:** week

P1151 added a generated `.agents/skills/` tree and a root `AGENTS.md`. Link and command-ref
validators both pass, so nothing is mechanically broken — but prose docs that describe where
skills live and what reads them were not reviewed and may now describe a structure that no
longer matches. Scope: docs that name `.claude/commands/` as the only skill location, or
`CLAUDE.md` as the only instruction entry point. Drop if P1151 is reverted or never shipped.

---

## Pre-existing 320px horizontal overflow on the story detail page

**ID:** INBOX-39
<!-- filed 2026-08-23, during P1141 -->

**Status:** proposed

**due:** month — **Not caused by P1141.** A control probe during P1141's e2e work measured the
overflow at 320px on a story with NO video and on a story WITH one, and got an *identical* set of
offending elements both times:

```
DIV.flex items-center gap-1        right=339 w=172
SPAN.inline-flex                   right=339 w=44
BUTTON.min-w-[44px] min-h-[44px]   right=339 w=44
```

A 44px-min toolbar button row inside a `flex items-center gap-1` container spills ~19px past a
320px viewport. P1141's own subtree is clean at every viewport; its e2e overflow assertion is
therefore scoped to that subtree, with the reason recorded inline in
`e2e/p1141-story-video.spec.ts`, rather than asserting on `documentElement` and either failing for
someone else's defect or quietly fixing out-of-scope UI.

Falsifier: set a 320px viewport on any `/story/:id` route on `main` and check
`document.documentElement.scrollWidth > clientWidth`.

---

<!-- Resolved 2026-09-15: "False >> marker claim in disagreement:prepare Stage 2 attribution instruction" — see decisions.md 2026-09-15 [process] -->

<!-- Resolved 2026-09-15: "Agent-skills sync gate (P1151) compares the whole tree in the working tree" — see decisions.md 2026-09-15 [process] -->

## `git-ops.sh ship` has no tracked-and-dirty preflight before the cherry-pick — second instance of "the lock serializes committers, not editors"

**ID:** INBOX-42
**Date:** 2026-08-28
**Status:** proposed
**due:** month

Shipping P1174 halted after 1 of 4 commits: `error: Your local changes to the following files would
be overwritten by merge: docs/decisions.md`. The main checkout had been verified clean four minutes
earlier and the branch was already rebased onto current main with that file's collision resolved by
hand; a co-tenant session wrote `decisions.md` again in the gap.

Not a missing lock. `cmd_ship` **does** acquire the main lock before the cherry-pick, and it already
refuses when an **untracked** spec file in main's working tree would block the pick (naming the exact
`rm`). The gap is that every `git diff --quiet` in `cmd_ship` is scoped to the spec pattern — there
is no equivalent check for **tracked, modified** files the pick will touch. And the lock cannot help:
this is the same mechanism as the agent-skills-sync entry above (2026-08-27) — a co-tenant's
Edit-tool write takes no git lock, so `main.lock` serializes *committers*, not *editors*. Two
different tools, one mechanism; worth treating as a class rather than patching twice.

**Real fix:** before the first pick, intersect `git diff --name-only main..<branch>` with main's dirty
set and refuse up front, naming the files — mirroring the existing untracked-spec guard, so the
operator learns the whole blocking set at once instead of discovering it commit-by-commit partway
through a sequence. **Stopgap today:** same as the entry above — poll `git status --short` until quiet,
then run `git-ops.sh ship pN --resume`.

Worth keeping in proportion: the failure was safe and fully recoverable. Git refused before applying
(no `CHERRY_PICK_HEAD`, no sequencer state), the ship journal recorded `landed_sha` for the commit
that landed and `null` for the rest, and `--resume` converged cleanly once the tree settled. The
residual cost is a window where main carries a fix without its KDD entry or a closed spec.

Falsifier: with a second session holding an unstaged edit to a file the branch also modifies, run
`git-ops.sh ship pN` — it starts the sequence and halts partway rather than refusing up front.

---

<!-- Resolved 2026-09-15: "check-deploy-manifest.sh --env prod prints the wrong fix command for the unpushed-stamp case" — see decisions.md 2026-09-15 [process] -->

## Benchmark `/create-spec` against an unskilled baseline (due: month)

**ID:** INBOX-44
**Status:** proposed
**due:** month

**Deferred from P1202 Done-When, recorded rather than left in anyone's memory. Still needs a
P-number** — verified 2026-08-31 that no such spec exists in `features/`.

The design is already settled and should not be re-derived: two fresh agents that have never seen the
originating conversation, both handed the same context package, one given the skill and one not, with
scoring criteria **pre-registered by a third party before either spec exists**.

**Why it was separated from P1202 rather than run inside it: contaminated control.** The agent that
would have run the unskilled arm had read the pipeline's skill files all session and would have
reproduced the skill's sections from memory — the null result would have been false.

Pairs with the existing Kanban item on `/change-request` creation; file them together or as one spec.

Promote recommended by /prioritize 2026-09-15: the entry says it still needs a P-number, and no open benchmark spec exists.

---

<!-- Resolved 2026-09-15: "The story quote block renders twice on the detail page" — delivered by P1212 §1 (all-done); see decisions.md 2026-09-15 [process] -->

<!-- Resolved 2026-09-15: "next-rank.sh still ratchets" — see decisions.md 2026-09-15 [process] -->

## Redesign the two points scanners that bite on one phrasing, and close three latent gaps

**ID:** INBOX-46
**Date:** 2026-09-03
**Status:** proposed
**due:** week

Five findings from the /finish code review at the P1210 ship, all deferred deliberately.
**The scanners (a design change, not a regex tune):** `scripts/points/store-inspection-scan.mjs`
matches only `ls|find|cat|stat|test -f`, so `grep`/`head`/`tail`/`wc`/`du`/`file`/`tree`/`less`/`readlink`
all evade it, and it requires the verb and the store name on the **same line** — a two-line
instruction slips past, and neither fixture covers the split. `scripts/points/input-block-scan.mjs`
anchors `INPUT_ASK` on the literal word "ask", so *"confirm the event tag with the founder"* or
*"get the filing identity from the operator"* bypass the very pattern DW-16 exists to catch.
**Widening was attempted at the ship and reverted:** the widened gate produced three false
positives on already-correct files, one of them a line describing `grep -F` against a transcript
read as a store inspection. P1210 §12's non-goal forbids tuning these predicates, so this needs a
different detection shape, not a longer verb list.
**Latent, no current failure:** `two-callers.mjs`'s "invoked by a skill file" is a raw substring
test that cannot tell a runnable stanza from a prose mention (a future predicate that is only ever
*mentioned* would read as wired); `redact-run.mjs`'s `codeForPerson()` matches on surname alone, so
two arguers sharing a surname would be misattributed in the cast codes, with no fixture covering it.
**Also carried from the same ship:** DW-21 (`no-vacuous-tests.mjs`) and DW-23 (`verify-fixture.mjs`)
are manual-only gates by deliberate decision — run both by hand before any change under
`scripts/points/`.
**Droppable if:** the disagreement pipeline stops being run, or the six skill files are replaced by
something that is not agent-read markdown — at which point the scanners have no surface to guard.
Sources: `docs/decisions.md` 2026-09-03 [process] ×2 + [technical]; `features/uat/p1210.md`.

---

## Produce hand-labelled audio for a well-separated session, then re-run P1237's three-way comparison

**ID:** INBOX-47
**Date:** 2026-09-04
**Status:** proposed
**due:** month

P1237's headline decision ("keep the current pipeline, adopt neither") rests on n=1 — the single
hand-labelled session in the corpus, which also sits at the shared-mic floor and is the least
favourable case for the separate-channel path; the spec states this limit itself. Its corpus-wide
findings are solid and unaffected (the 44-session dB scan with 3dB/19dB controls, the `_merge_wavs`
t=0 alignment defect, the four never-committed artifacts, the Gemini silent-truncation result) —
it is specifically the per-speaker accuracy table that carries the decision. Done when a
well-separated session has hand labels and the three paths are re-scored on it; **droppable** if
the conditional design in P1237 consequence 4 (measure the per-session margin and branch on it) is
specced and adopted instead, since that removes the need for an unconditional winner.

---
<!-- Moved 2026-09-15: "P1250 audit of the 17 auto-closed specs" — now in features/done/2026-06-10/p1250_colocated_autoclose_closes_specs_nobody_did.md, §Audit -->

## 2026-09-07 — open question: does anyone read session transcripts? (P1252 ranking depends on it)

**ID:** INBOX-48
**Status:** proposed

**due:** month

**The gap.** `my-sessions-page.tsx` shows each transcript segment under a speaker's name, and 52 of
the 60 transcripts on prod carry more than one speaker — so 52 records can display a name above
words the other person said. The affected set is measured. **Whether anyone opens them is not**, and
it cannot be without Mixpanel (prod-only).

**Why it matters.** It is the single fact that moves [P1252](../features/p1252_merged_multiphone_audio_is_never_time_aligned.md)
between two rankings, and the two are far apart:

- **Nobody reads them** → the defect harms nobody, the 52 are static (no transcript produced since
  2026-07-05), and P1252 stays backlog until P1236 restores recording.
- **Participants read them routinely** → 52 wrong session records are a live credibility problem in
  a product about who understood whom, and the ranking changes today.

**The check.** One Mixpanel query for views of the transcript surface on `/my-sessions`, over the
life of the feature. If the event was never instrumented, that is itself the answer for now and the
instrumentation is the smaller task.

**Caveat that survives either answer.** Fixing P1252 alone would not correct what a reader sees.
P1237 measured attribution at 59.5% against physics on correctly-aligned, well-separated audio,
below the 75.0% naive rate, and 0 of 10 on the minority speaker. Alignment is necessary, not
sufficient — so a "yes, they read them" answer argues for attacking attribution, not only alignment.

## 2026-09-08 — `ship.md` still tells the agent to run a gate that now runs itself (P1246)

**ID:** INBOX-49
**Status:** proposed

**due:** week

**What changed.** [P1246](../features/p1246_pipeline_controls_are_advisory.md) wired
`ship-gates.sh` into `git-ops.sh`'s closing code on both close routes. `ship.md:51`
still instructs the agent to run `./scripts/ship-gates.sh pN` by hand, and steps
3.5 / 3.65 describe the gate report as something the agent assembles.

**Why it was not fixed in the same run.** P1246's own Non-Goals say *"Do NOT edit
`.claude/commands/slava/build/*.md` while the concurrent session holds them.
Sequence or coordinate."* Skill files must also be committed on `main`
(`.claude/rules/skills.md` Branch Guard), so they cannot ride the feature branch
this work lives on. No Done-When required the edit.

**Severity: low, and stated so it is not over-read.** Running `ship-gates.sh` by
hand is read-only and idempotent, so the stale instruction costs a redundant
invocation, not a wrong outcome. The real cost is that the prose now describes a
control as advisory when it is deterministic, which is the exact confusion P1246
exists to remove.

**The edit.** In `ship.md`: say the gate runs from the closing path and that the
agent relays its output; keep the manual invocation only as a pre-flight
convenience; document `--override` as founder-only (it prompts on `/dev/tty`,
which an agent session does not have). Land it on `main` as its own commit.

## 2026-09-08 — the skill-eval merge check is authored but inert (P1246 retired criterion)

**ID:** INBOX-50
**Status:** proposed

**due:** month

**State.** `evals/` holds three real cases (closure gate respected, intent gate
respected, override not reached for) and `.github/workflows/plugin-eval.yml` is
committed and wired: `--ablation with-without` for the no-plugin baseline arm,
threshold 1.0, and an assertion that results were actually written so a silent
no-op cannot report a vacuous pass.

**Why it does nothing today.** `claude plugin eval` is gated behind early access
on this account and refuses every invocation. Measured 2026-09-08 on CLI 2.1.263,
exit code read directly rather than through a pipe:

```
$ claude plugin eval . ; echo $?
`plugin eval` is currently in early access
1
```

It fails closed, which is the right direction, but it means a naive merge check
would be red on every skill change for a reason unrelated to the change.

**What flips it on.** Enable early access for the account, then add the Anthropic
credential as a repository secret. No edit to the workflow is required — it
distinguishes "capability unavailable" (warn, pass) from "eval ran and scored
low" (fail) and starts enforcing by itself.

**Why it is worth returning to.** P1246's Risks table defers "are these pipeline
steps earning their place?" to evals rather than to opinion, after one benchmarked
skill showed no measurable advantage and another was void. That question is still
open and nothing else answers it.

## 2026-09-08 — turn the closure backstop into a required check (P1246), once it has a REAL green

**ID:** INBOX-51
**Status:** proposed

**due:** week

**State.** `.github/workflows/closure-gate.yml` is on `origin/main` and runs. It is
**not** a required status check — `gh api repos/slavochek2/claritypledge/rulesets/17729463`
shows `audit-privacy` as the only one. Until it is added, the local closure gate and
its hook are accident prevention with nothing behind them.

**Do not enable it on any green.** Three defects shipped in this one workflow on
2026-09-08, all the same shape — a check reporting success without having looked:

1. The trusted gate copy ran from `/tmp`, where `ship-gates.sh` resolves its repo root
   to `/`; every spec scored "not found" (run 34209536521).
2. The self-check added to catch (1) asserted only that a `GATE 2.5` line appeared —
   which the broken configuration also prints. Blind probe; would have passed it.
3. The selection range was `origin/main...HEAD`, which is **empty by construction**
   once a push to main lands, so the gating step was skipped and the job went green
   having examined nothing (run 34211142337). The single run that ever selected a spec
   did so through a fetch-timing race.

**The enabling condition — check this, not "is it green":**

```bash
# 1. Find a run whose commit ACTUALLY closed a spec, then confirm the work happened:
gh run view <run-id> --json jobs \
  --jq '.jobs[].steps[] | select(.name|startswith("Gate each closure")) | .conclusion'
# Must print "success". "skipped" means it examined nothing — NOT an enabling green.
```

A closure lands naturally on the next `/ship`.

**Then, and only then:**

```bash
gh api repos/slavochek2/claritypledge/rulesets/17729463 > /tmp/ruleset.json   # READ FIRST
# add "closure-gate" alongside audit-privacy in required_status_checks, then PATCH.
```

Never replace the array — `audit-privacy` is the privacy boundary (P919) and dropping
it would be a worse regression than the one being fixed.

---

## Agent accounts render as HUMANS while the agent registry is loading

**ID:** INBOX-52
**Status:** proposed
**due:** week
**Found:** 2026-09-08, adversarial (Codex) review of the P1270 diff. Pre-existing, product-wide —
NOT introduced by P1270, but P1270 raises what it costs.

An agent account is a machine's reading of a real named person who never consented. The whole
disclosure rests on two channels: a SQUARE avatar and the word `AGENT` in the byline. Both are
gated on `isAgent`, which is computed from `useAgentAccountIds()`.

**While that registry is unresolved, `isAgent` is `false`, so every agent row renders the HUMAN
path** — round avatar, plain name, no `AGENT` word. `agent-accounts-context.tsx:20-24` is explicit
that this must not happen:

> FAIL-CLOSED. `isLoading` is not a convenience. An unresolved or failed fetch leaves the Set
> empty, and an empty Set read as "no agents" renders every agent account as a person. Consumers
> MUST hold their render until `isLoading` is false. On fetch failure `isLoading` stays true
> forever by design.

**No page actually holds.** `profile-page-v2.tsx:484` guards an *effect*, not the render; no other
page gates on it at all. What consumers do instead is suppress human-only chrome
(`!isAgent && !identityPending && <EarBadge>`) — so the row loses its ear badge and pledge ring but
keeps a round avatar and an unmarked name. It reads as a human with no reputation, not as a machine.

On fetch failure this is not transient. `isLoading` staying true forever means the mis-render is
permanent for that session.

**Why it was invisible.** Every agent test in the repo mocks `useAgentAccountIds` with
`isLoading: false`, including the render-branch census that exists specifically to enumerate
branches — so the pending branch is unreachable by the fixture (epistemic gate 7b). P1270 added an
embed branch to that census and still could not have seen this.

**Why it is not fixed in P1270.** It spans at least six components (`feed-story-card`,
`story-card-with-links`, `StoryCardDetail`, `quoted-point-card`, `point-card-with-links`,
`point-detail-page`) and the fix is a founder-facing UX decision, not a mechanical edit: hold the
row, render a skeleton, or render a neutral placeholder. Deciding that inside P1270 would have been
unrequested scope on a spec already covering six sections.

**Suggested shape:** a `pN` bug spec. The census gains an `isLoading: true` fixture arm — that arm
is the actual deliverable, since without it any fix is unverifiable by the same blindness that hid
the defect.
Promote recommended by /prioritize 2026-09-15: it proposes a bug spec, and the loading-state fixture arm is still missing from src/tests.

## Teach the migration client-safety gate to see a changed RPC signature

**ID:** INBOX-53
**Date:** 2026-09-08
**Status:** proposed
**due:** week

`scripts/check-migration-client-safety.sh`'s `BREAKING_SHAPES` covers `REVOKE … FROM
(anon|authenticated)`, `DROP POLICY`, `ALTER TABLE … DROP COLUMN` and `ALTER COLUMN … TYPE`, but
has no `DROP FUNCTION` and no notion of an RPC signature change — and a migration whose only
revoke is `FROM PUBLIC` matches none of it. Found during P1058: three migrations that dropped and
recreated `release_joiner_seat` under a changed signature passed the gate with no annotation
required, so their `requires-frontend` markers were purely voluntary. A signature change is
precisely what breaks a deployed client (PGRST202, or 42501 on every call), which is the P886
incident class the gate exists for. Fix: add a `DROP FUNCTION` shape and broaden the revoke arm to
include `FROM PUBLIC`. **Done when** the gate refuses a signature-changing migration that carries
no marker — and, per epistemic gate 7c, when it has been run against the existing migration corpus
to measure how many legitimate files it newly flags. **Drop it** if that run shows the false-positive
rate makes the gate unusable and no narrower shape separates the two.

---

## Make the P1151 skills-mirror hint name the exact file and the --files path

**ID:** INBOX-54
**Date:** 2026-09-11
**Status:** proposed
**due:** week

The agent-skills sync failure hint in `scripts/pre-commit-checks.sh` (P1151 block) tells you to regenerate the whole mirror and re-stage the bare `.agents/skills/` directory, a staging form `.claude/rules/git.md` bans that can also sweep in another session's mirror edits. It never says the mirror file must also be passed to `git-ops.sh commit-to-main --files`, whose exact-set check then refuses the commit (hit in the P1300 session). Change it to name the drifted `.agents/skills/<name>/SKILL.md` from the `--check` output and say to add that path to `--files`; drop this if `commit-to-main` or the gate starts handling the mirror path itself.

---

## Re-run the P1275 integration spec after P1236 ships, and finish P1303's prod join check

**ID:** INBOX-55
**Date:** 2026-09-11
**Status:** proposed
**due:** week

`e2e/integration/p1275-create-transcribe-room-rpc.spec.ts` cannot run green on the shared test DB while unshipped P1236 has changed `create_transcribe_room`'s signature there (PGRST202 on every create), so P1303's re-pointed control in that spec was proven only through the P1303 test's own control assertion. Once P1236 ships, re-run it. Separately, confirm a signed-in user can join an existing room at `/transcribe/:code` on prod — P1303's one post-ship check not yet done. The re-run half is droppable if P1236 is abandoned and its migrations are reverted from test.

---

## Close three terminal-status specs still sitting in features/ root

**ID:** INBOX-56
**Date:** 2026-09-11
**Status:** proposed
**due:** week

`p1248` and `p1261` (status: rejected) and `p1274` (status: all-done) are in `features/` root rather than `features/archive/` or `features/done/`. Found by `/ship`'s fix-kanban step and deliberately not moved there, because a hand move bypasses the closure gate (P1246). Close each through its own gated path after checking its gate. Done when none of the three is in root; droppable per spec if its owning session is already closing it.

---

## Make commit-to-main fail when it records fewer files than requested

**ID:** INBOX-57
**Date:** 2026-09-11
**Status:** proposed
**due:** week

`git-ops.sh commit-to-main` exited 0 after recording zero of seven requested files (empty commit `2ca583efd`): a concurrent session reset the shared index during the pre-commit window, and the tool printed "WARNING -- requested and recorded counts differ" yet returned success. The comment beside that warning says it "CANNOT FIRE TODAY", and `.claude/rules/git.md` says the recorded-set check "exits non-zero on any difference"; both were falsified by this run. Done when the mismatch exits non-zero and the comment and the git.md sentence match the behaviour; droppable if P1279 already changed this path.

---

## Make deleteTestUser fail loudly when the profile delete fails

**ID:** INBOX-58
**Date:** 2026-09-11
**Status:** proposed
**due:** week

`e2e/helpers/test-user.ts` `deleteTestUser` logs a failed profile delete as a warning and moves on, so test users accumulate silently: 38 "Feed Author" users stranded on the test project by P1292's trigger defect went unnoticed for two days and now break eight hashtag-feed tests. Make the failure throw, or return a result the caller must read. Droppable if two weeks of runs strand no test user.

---

## Decide whether deleting a user who has story verifications should be refused

**ID:** INBOX-59
**Date:** 2026-09-11
**Status:** proposed
**due:** week

`story_verifications_speaker_id_fkey` has no ON DELETE action, so deleting any user who has story verifications fails with 23503 — the dashboard's user delete included; only `erase_my_account` and `deleteTestUser` pre-clean them (measured on test while probing P1292). Decide between cascade, SET NULL (now representable on live rows since P1278 D) and a documented refusal. Droppable once the choice is written down.

---

## Fix the calibration breakdown page's older display issues

**ID:** INBOX-60
**Date:** 2026-09-11
**Status:** proposed
**due:** week

Two independent visual-QA passes during P1278 D found issues older than it: the verdict ("Well calibrated") reads a signed average in which over- and under-estimates cancel, so rounds off by 2–4 read as calibrated; the name column is 70–100 px, so names wrap; tap targets are under 40 px (info icons ~17 px, "Start a Session" 36 px); the result bar looks draggable but is read-only; gap values wrap and render their signs inconsistently. Droppable if the page is taken out of scope.

---

## Keep the override reason in the ship journal so a resumed override close keeps its trailer

**ID:** INBOX-61
**Date:** 2026-09-11
**Status:** proposed
**due:** month

`git-ops.sh` sets `SHIP_GATE_OVERRIDE_REASON` only in the live run and does not store it in the ship journal, so an override ship that crashes after the spec is moved and is finished with `--resume` writes its close commit without the `Gate-Override:` trailer. Since P1309 that trailer matters: `ship-gates.sh` refuses an absorbing spec whose close carries it, and a resumed close would slip through. Read from the code by P1309's round-3 adversarial review, not reproduced (it needs a TTY override that crashes mid-ship). Done when the journal keeps the reason and `--resume` writes the same trailer; droppable if no override close is ever resumed.

---

## The manual-spec-close hook blocks git-ops' own documented recovery command

**ID:** INBOX-62
**Date:** 2026-09-14
**Status:** proposed
**due:** week

When `git-ops.sh ship pN` fails at the close commit (P1279 index race), it prints the recovery `git mv features/done/<sprint>/pN_x.md features/pN_x.md` — moving the spec back OUT of the done tree so the gated close can be re-run. `.claude/hooks/block-manual-spec-close.py` refuses that command: `is_close_shaped` fires whenever any spec path in the command is not already closed, and the destination (the open path) is exactly that. Hit on 2026-09-14 closing P500; worked around by doing the same move in Python, which the hook's MOVE_RE does not match — a bypass that should not be the documented path. Done when a move whose DESTINATION is outside `features/done/` is allowed (or git-ops prints a recovery the hook accepts), with a canary for both directions; droppable if the P1279 race stops stranding half-renames.

<!-- Resolved 2026-09-15: "Deploy P1236 schema to prod — /transcribe rooms are live without their database functions" — see decisions.md 2026-09-15 [process] -->

## Finish P1304's loose ends: prod Sentry check, stranded UAT file, misplaced and fieldless specs

**ID:** INBOX-64
**Date:** 2026-09-14
**Status:** proposed
**due:** week

(1) Confirm the next real Sentry error from /live shows `/live/[code]` and no `session_code` — the Mixpanel half was verified on prod, the Sentry half has had no error event yet. (2) `features/uat/p1304.md` stayed behind because `block-manual-spec-close.py` refuses any move into `features/done/`, even a UAT companion of an already-closed spec. (3) `features/` root still holds rejected P1248 and P1261 and all-done P1274. (4) P1060, P1141 and P1155 lack `disclosure:` — grandfathered, but `fix-frontmatter.sh` exits 1 on them. Done when each is resolved or explicitly left; drop (1) after one clean Sentry event.

---

## The room's Links bottom sheet is announced as a dialog but is not one

**ID:** INBOX-65
**Date:** 2026-09-14
**Status:** proposed
**due:** week

The sheet's trigger declares `aria-haspopup="dialog"`, but the forced-sheet branch in `drawer.tsx` renders a plain fixed `<div>` — no dialog role, no focus trap, no focus transfer on open, no Escape handler, no close control. A keyboard or screen-reader user who opens Links stays focused behind the visual modal and can only dismiss it by tapping the overlay. Pre-existing since P1179 and shared by every consumer of that branch, so it is wider than any one menu. Found by adversarial review during P1310, filed rather than fixed there because a nav-reachability fix is the wrong blast radius for changing a shared primitive. Done when the forced sheet is a real dialog (role, focus trap, Escape, close control) or the trigger stops claiming to be one; droppable if the forced-sheet branch is replaced by the library's own dialog primitive for other reasons.

---

## Duplicate event link tags render duplicate entries in the room menu

**ID:** INBOX-66
**Date:** 2026-09-14
**Status:** proposed
**due:** month

`buildLinksMenu` drops an extra whose tag collides with a standard one, but does not deduplicate repeated custom tags — two configured `tonight` rows produce two identical buttons pointing at one destination, on a sheet that now has a height ceiling and a scroll. Data-dependent: it needs an operator to configure the same tag twice, which has not been observed. Found by adversarial review during P1310. Done when validated extras are deduplicated by tag with a test for the repeated-tag case; droppable if the links column gains a uniqueness constraint at write time instead.

---

## Confirm on a real iPhone whether the phone zoom is actually fixed — the root cause was never proven

**ID:** INBOX-67
**Date:** 2026-09-14
**Status:** proposed
**due:** week

P1310 raised 16 sub-16px text controls to 16px on the reading that iOS Safari's focus auto-zoom was what the founder hit ("sometimes accidentally there is a zoom in and there is a part of this of the page that is cut off"). That diagnosis was read from the code and never reproduced — Chrome's device emulation cannot perform a pinch. A rival explanation was raised in review and not ruled out: `position: fixed` chrome clipping under pinch-zoom (this app stacks a fixed top nav and a fixed bottom nav) and `/live`'s `h-screen overflow-hidden` scaffold clipping at the viewport edge. Neither is addressed by a font-size change. Done when the founder confirms on an iPhone that tapping the join fields no longer rescales the page — and if it still happens, the next step is the fixed-position hypothesis, not more font sizes; droppable if the founder stops seeing the symptom for other reasons.

---

## Give the room's "Slides" entry a real link, and the signed-out menu group a heading

**ID:** INBOX-68
**Date:** 2026-09-14
**Status:** proposed
**due:** month

Two review findings from P1310, both cosmetic-but-real. (1) "Slides" is the one Links entry that is a true document load, and it runs through `window.open`, so middle-click, cmd-click and copy-link do nothing — an `<a href="/presi" target="_blank" rel="noopener noreferrer">` styled as the other entries would keep the new-tab behaviour and restore the affordances. (2) In the mobile menu the signed-out account actions (Take the Pledge / Log In / Create Account) sit under a bare divider while Use cases, Product, Learn and the signed-in "Your account" group all carry headings — an orphaned group; the label is a founder call. Done when the link is an anchor and the group has an approved heading; droppable if the menu is restructured for other reasons first.

---
## Re-issue the scoped read-only Supabase token before it expires (~2026-12-13)

**ID:** INBOX-69
**Date:** 2026-09-15
**Status:** proposed
**due:** month

P1313 moved the three daily drift checks onto a scoped `Database: Read` token (project-scoped to
the two projects, everything else `None`). Supabase offers no non-expiring option for scoped
tokens — 24h / 7d / 30d / 90d / Custom — and **90 days** was chosen deliberately: longer expiry is
strictly worse security, and the consuming checks now fail **loudly** (exit 2, "could not run")
rather than reporting all-clear, so a lapse is visible rather than silent. That makes this a
renewal, not a risk.

Two things make it worth a tracked item anyway. It is the first credential in this repo with a real
expiry, so nothing in the rotation tooling watches dates yet (P1148 owns that and is unbuilt). And
the hand-off itself is the failure-prone step: the 2026-09-15 issuance corrupted both env files
because the agent paired "copy this value" with "now copy this command" — read
`.claude/rules/credentials.md` on secret hand-off before doing it again.

Done when a fresh scoped token is in `SUPABASE_READONLY_TOKEN` in **both** `.env.local` and
`.env.prod` and all three checks report `credential: scoped read-only token` and pass. Droppable if
P1214 retires the daily checks' need for a platform token entirely, or if P1148 lands date-aware
rotation first.

---

## Quarterly terms review: one re-acceptance popup for everything since v1.4

**ID:** INBOX-70
**Date:** 2026-09-14
**Status:** proposed
**due:** month

Around 2026-12-01, batch every Terms of Service and Privacy Policy text change made since the v1.4 bump (2026-09-01), including P1307's event transcription wording (spec D15), into a single `CURRENT_TERMS_VERSION` bump, run through `/tos-review`, so users see one popup per quarter instead of one per small edit. In the same review, decide whether `/tos-review` Stage 7b ("version bump mandatory" on every terms edit) should change to quarterly batching; that is a skill change needing founder approval. Droppable if no terms text has changed since v1.4 when the date arrives.

---

## P1307 post-deploy: push, two-phone room, and the [post-deploy] checks

**ID:** INBOX-71
**Date:** 2026-09-15
**Status:** proposed
**due:** week

P1307 is merged on local `main` (HEAD `3bd30746c` at the time of writing) with its migrations,
vault entries, three edge functions and the `transcribe-room-batch` Cloud Run service already live on
prod; the app itself goes live only when `main` is pushed through the P919 staging hop. After the
push: run a two-phone event room on prod (switch on, speak, navigate away and back, a `/live` round
pauses and resumes it, close every tab and confirm the transcript reaches Session History within
~10 minutes), check Sentry for 10 minutes, and write the results into the `[post-deploy]` clauses of
`features/done/2026-06-10/p1307_event_transcription_from_ready_across_pages_into_sessions.md`
(the 20-minute overlap measure, the whole-recording vs live comparison, and the de-duplication
ratio are all owed there). Done when those clauses carry measured results. Anything that fails
becomes a `/create-bug`, not an edit to the closed spec.

---

## The P160 /live E2E suite fails 13 tests for a reason unrelated to its subject

**ID:** INBOX-72
**Date:** 2026-09-15
**Status:** proposed
**due:** month

`e2e/p160-private-session.spec.ts` visits `/live` as an anonymous user, but the P66.1 auth gate
(`clarity-live-page.tsx`, "redirect guests without join code to signup") sends that visitor to
`/signup`, so 13 of 17 tests fail on `<h1>Create Account</h1>` before reaching the switch they test.
Several also assert a consent checkbox and "recorded for AI Insights" label that no longer exist
anywhere in `src/`. Found while flipping `/live`'s default to off in P1307 (2026-09-15). Done when the
suite signs in with `setTestSession()` where it means a host, drops or rewrites the assertions on the
removed checkbox, and passes. Droppable if the suite is retired in favour of an equivalent one.

---

## Transcribe room polish the P1307 design reviews found (pre-existing)

**ID:** INBOX-73
**Date:** 2026-09-15
**Status:** proposed
**due:** month

Two design reviews of `/transcribe` during P1307 flagged issues that predate it: the chat's top and
bottom edges are hard cuts with no fade; the round "jump to newest" arrow sits over transcript words;
the room header says "End Session" while the capture bar below says "End session"; the join screen
renders a disabled full-width "Join room" before consent (P955 dead-control rule); and the roster
line truncates one short name even at 1280 px. Screenshots: `~/Screenshots/2026-09-15/p1307-room-v3/`.
Done when each is fixed or explicitly accepted, with a visual QA pass at 320 / 390 / 1280 px.

---

## Fix or retire the p506 "existing tags are preserved" assertion — the hashtag trigger makes it impossible

**ID:** INBOX-74
**Date:** 2026-09-15
**Status:** proposed
**due:** week

`e2e/integration/p506-backfill-hashtags.spec.ts` asserts a story inserted with a hand-set tag keeps it after the backfill, but `trg_stories_extract_hashtags` (BEFORE INSERT OR UPDATE OF content) rewrites `tags` from the content on every insert, so the tag is gone before the backfill runs. Surfaced 2026-09-15 once P1214 let the backfill actually run (it had been failing on a 401). Done when the test seeds that row without the trigger overwriting it, or the assertion is removed because the trigger now owns `tags`; droppable if P506's backfill test is retired.

---

## Registry-to-disk drift for skill files

**ID:** INBOX-75
**Date:** 2026-02-28
**Status:** proposed
**due:** month
**Observed:** 2026-02-28 — `/ss` skill was in the global skill registry but `.claude/commands/slava/ss.md` didn't exist on disk. Caused "Unknown skill" error. Required `git log --all` + `git show` to diagnose and restore.
**Root cause:** File was deleted from git at some point (possibly during a branch clean-up or rebase) while the registry entry survived.
**Problem:** No mechanism detects registry entries that have no corresponding file. Drift is invisible until the skill is invoked.
**Potential fixes to explore:**
- A `/maintain:cleanup` step that validates all registry skill entries have matching files
- Pre-commit check: if a `.claude/commands/slava/*.md` file is staged for deletion, warn if it appears in skill registry
**Blocking:** No obvious mechanical fix yet — needs design.

> Folded 2026-09-15 by P1317 from `.claude/process-learnings.md`, a third store no reader consumed. `/slava:maintain:cleanup` was checked first and has no registry-to-disk step, so the entry is still open.

---

## Re-count the task inbox against the 88 recorded at the first /prioritize pass

**ID:** INBOX-76
**Date:** 2026-09-15
**Status:** proposed
**due:** month

The first /prioritize pass over the inbox (2026-09-15, P1317) left 88 open entries: 68 public and 20 private. On or after 2026-10-15, add up both stores with `./scripts/inbox.sh count`. If the total is not below 88, file intake throttling (P1081's standing fallback) as a spec that week. Do not re-debate it; the pass pre-committed to this. Droppable once that spec exists or the count is below 88.

---
