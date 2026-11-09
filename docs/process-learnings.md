# Process Learnings

**Next ID:** 311

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

Reviewed 2026-10-16 (weekly): keep — e2e/p272-live-verification.spec.ts:169/219/222 still click 'Does X understand you?'; src renders 'Did X understand you?' (live-mode-view.tsx:1380/1464/1496). Selector repair still missing.

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

Reviewed 2026-10-16 (monthly): keep — no migration adds a per-round/exchange key to story_verifications (grep of supabase/migrations returned nothing).

---

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

Reviewed 2026-10-16 (weekly): keep — unverified. P1260 shipped and weekly SKILL.md:252 defines the REFS: line, but no /weekly output since the merge was available to confirm it printed; gc is not read-only so not re-run here.

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

Reviewed 2026-10-16 (monthly): keep — ship.md:183 says the direct-to-main path refuses without a 'ready for QA' stamp, but still does not tell inline work to write one or show the command.

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

Reviewed 2026-10-16 (monthly): keep — decisions.md shows multi-lens reviews with N-of-N counts but no scored Codex-vs-Opus missed-by-other ratios; benchmark not run.

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

Reviewed 2026-10-16 (weekly): keep — no open spec covers manifest-vs-live drift (P1054 is out-of-band objects, not manifest trust). Still missing: its own spec; recommend inbox-promote.

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

Reviewed 2026-10-16 (weekly): keep — global CLAUDE.md probe rules cover empty/all-pass and coverage/metric, not 'enumerate what a count counted'. Rule edit still needs the claude-md gate; low priority.

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

Reviewed 2026-10-16 (weekly): keep — founder-owned pre-commitment; thresholds still [FOUNDER DECISION]. Not an agent close.

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

Reviewed 2026-10-16 (weekly): keep — data collection at 1 of 3; founder-owned.

---

<!-- Dropped 2026-10-16: "Default to e2e test for verification" — superseded by /reproduce (Playwright multi-context reproducer before /fix, reproduce/SKILL.md:48-57) -->

<!-- Resolved 2026-08-14: "/dev pre-flight doesn't check branch lineage — /ship surprise risk" — see decisions.md 2026-08-14 [process]. /dev half shipped (dev.md:86); /pick-flow half dropped with reasoning. First entry closed through the /weekly step 2.5 path (P1081). -->

<!-- Dropped 2026-10-16: "Dead code not caught by /finish or pre-commit" — duplicate of open spec P1241 (configure knip, then triage) -->

<!-- Dropped 2026-10-16: "Raw ideas processing has no skill" — superseded by global /samsung-voice-review and /samsung-notes-review (raw notes to threads with public/private routing) -->

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

Reviewed 2026-10-16 (weekly): keep — item 1 fixed (P528, src/index.css:47 overscroll-behavior-y: contain, 2fe484e8e). Items 2 (tap targets) and 3 (position-removal feedback on /live) unverified.

---

## Synchronous sales calls as acquisition bottleneck

**ID:** INBOX-17
**Date:** 2026-03-21
**Status:** proposed

Intro calls that don't directly deliver session value get deprioritized under bandwidth constraints. Fix: default to async distribution (booking links, forwardable offers) instead of scheduling exploratory calls. Batch scheduled calls into one day/week.

**Related:** ladischenski.com pricing page needs improvements — comparison anchoring, explicit session length, ROI story, FCO price range. See customer price evaluation conversation 2026-03-20.

Reviewed 2026-10-16 (weekly): keep — GTM/strategy note; founder's call per decisions.md 2026-10-16 (idea-type entries not dropped on model judgement). Unverified whether the pricing page changed.

---

<!-- Resolved 2026-09-15: "A second, undocumented inbox exists at .claude/process-learnings.md" — folded by P1317; see decisions.md 2026-09-15 [process] -->

<!-- Resolved 2026-10-16: "Did the close path actually shrink the queue" — see decisions.md 2026-10-16 [process]: Inbox rotating review -->
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

Reviewed 2026-10-16 (weekly): keep — live_phase_transition still tracks ratingPhase only (clarity-live-page.tsx:749-787); no event on the speaker-deciding skip/good-enough exit (only live_clarify_started/_done).

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

Reviewed 2026-10-16 (monthly): keep — grep -rni 'reset round|watchdog' src returns nothing; no recovery control exists.

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

Reviewed 2026-10-16 (monthly): keep — programme-health/SKILL.md verdict table still has no accommodation-ratio clause that can demote criterion 3.

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

Reviewed 2026-10-16 (weekly): keep — 1bd3a462b repaired the wait call; its own message says the test now fails on a real assertion and leaves (a)/(b) open. No later commit on the spec.

---

<!-- Resolved 2026-10-16: "Retire or rewrite e2e/p674-linear-flow.spec.ts" — see decisions.md 2026-10-16 [process]: Inbox rotating review -->

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

<!-- Resolved 2026-08-27: "Propagate the disproven R₀≈0 figure through the strategy docs" — applied
     directly (a factual correction is a bug fix, not a strategy change). Propagated to hypotheses,
     progress, lean-canvas, theory-of-change, research-programme, goals, the LessWrong blog draft,
     p1028, p948, p1084. See decisions.md 2026-08-27 [product]. -->
Reviewed 2026-10-16 (monthly): keep — unverified; needs a browser reproduction (the entry forbids touching the test first). Test still present at e2e/p617-mode-switcher-lifecycle.spec.ts.

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

Reviewed 2026-10-16 (monthly): keep — no supersession gate in .claude/commands/slava/maintain/kdd/ (grep supersed returned nothing).

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

Reviewed 2026-10-16 (monthly): keep — git-ops.sh ship_rebase_doc_links (04ffa3c5f, P1094) re-bases the moved spec's OWN links; referrers elsewhere are still not rewritten.

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

Reviewed 2026-10-16 (weekly): keep — P1092 closed all-done but retired the anonymous-write AC ('never built'), so the drop condition did not fire; whether the reading page now explains the refusal is unverified.

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

Reviewed 2026-10-16 (monthly): keep — L6 still reuses storyL4 (p1067 integration spec :324-326); per-layer fixture not done.

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

Reviewed 2026-10-16 (monthly): keep — item 2 fixed (detect_cospecs excludes --diff-filter=A adds, git-ops.sh ~2382-2392); item 3 fixed per entry; item 1 (Phase 3 before 2b) unverified.

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
Reviewed 2026-10-16 (monthly): keep — trigger met (per /prioritize 2026-09-15) and no goalify-update spec exists in features/; recommend inbox-promote.

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

Reviewed 2026-10-19 (weekly): keep — goal-gate.yml exists but is not among the required checks in ruleset 17729463 (audit-privacy, disclosure, schema-ready)

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

Reviewed 2026-10-19 (weekly): keep — not checkable from the repo; needs a Mixpanel look at saved reports

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

Reviewed 2026-10-16 (monthly): keep — still conditional on a third paid link; offers-section.tsx still holds the same two. Low priority.

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

Reviewed 2026-10-16 (monthly): keep — privacy. prepare.md:369-377 harvests YouTube comments; neither prepare.md nor positions.md has a commenter-identifier filter (grep). Still needs the end-to-end read + filter.

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

Reviewed 2026-10-16 (monthly): keep — P1151 all-done with a 118-skill conformance check, but no harness-readiness check or tested-combinations table found (grep). Neither drop condition shown.

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

Reviewed 2026-10-19 (weekly): keep — block-banned-git is still referenced by neither settings.json nor settings.local.json (grep count 0)

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

Reviewed 2026-10-19 (weekly): keep — docs/decisions.md and process-learnings.md name .agents/skills; prose docs not yet reviewed

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

Reviewed 2026-10-21 (monthly): keep — not re-measured this run; overflow evidence from 2026-08-23 unchecked

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

Reviewed 2026-10-21 (monthly): keep — git-ops.sh still has no tracked-dirty preflight (grep of diff --name-only hits only unrelated guards)

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

Reviewed 2026-10-21 (monthly): keep — no benchmark spec found under features/ or features/done/

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

Reviewed 2026-10-19 (weekly): keep — scanner redesign not checked this run

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

Reviewed 2026-10-21 (monthly): keep — hand-labelled session still missing; not re-checked

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
Reviewed 2026-10-21 (monthly): keep — needs a Mixpanel query not run here

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
Reviewed 2026-10-19 (weekly): keep — ship.md line 51 still tells the agent to run ship-gates.sh by hand

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
Reviewed 2026-10-21 (monthly): keep — premise changed: claude plugin eval now runs and fails on evals/*/case.yaml missing schema_version, no longer early-access refusal

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

Reviewed 2026-10-19 (weekly): keep — ruleset still lists no closure-gate check

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
Reviewed 2026-10-19 (weekly): keep — useAgentAccountIds still in src/app/contexts/agent-accounts-context.tsx; fix not checked

## Re-run the P1275 integration spec after P1236 ships, and finish P1303's prod join check

**ID:** INBOX-55
**Date:** 2026-09-11
**Status:** proposed
**due:** week

`e2e/integration/p1275-create-transcribe-room-rpc.spec.ts` cannot run green on the shared test DB while unshipped P1236 has changed `create_transcribe_room`'s signature there (PGRST202 on every create), so P1303's re-pointed control in that spec was proven only through the P1303 test's own control assertion. Once P1236 ships, re-run it. Separately, confirm a signed-in user can join an existing room at `/transcribe/:code` on prod — P1303's one post-ship check not yet done. The re-run half is droppable if P1236 is abandoned and its migrations are reverted from test.

Reviewed 2026-10-19 (weekly): keep — P1236 is now all-done, so the P1275 spec re-run is due; not yet run

---

<!-- Resolved 2026-10-19: all three already closed (p1248, p1261 in features/archive; p1274 in features/done); none left in features/ root — founder decision from /day -->

<!-- Resolved 2026-09-22: fixed and shipped as P1342 (features/done). -->

<!-- Resolved 2026-09-22: fixed and shipped as P1345 (features/done). -->

## Decide whether deleting a user who has story verifications should be refused

**ID:** INBOX-59
**Date:** 2026-09-11
**Status:** proposed
**due:** week

`story_verifications_speaker_id_fkey` has no ON DELETE action, so deleting any user who has story verifications fails with 23503 — the dashboard's user delete included; only `erase_my_account` and `deleteTestUser` pre-clean them (measured on test while probing P1292). Decide between cascade, SET NULL (now representable on live rows since P1278 D) and a documented refusal. Droppable once the choice is written down.

Reviewed 2026-10-19 (weekly): keep — no decision recorded in a migration or decisions.md found

---

## Fix the calibration breakdown page's older display issues

**ID:** INBOX-60
**Date:** 2026-09-11
**Status:** proposed
**due:** week

Two independent visual-QA passes during P1278 D found issues older than it: the verdict ("Well calibrated") reads a signed average in which over- and under-estimates cancel, so rounds off by 2–4 read as calibrated; the name column is 70–100 px, so names wrap; tap targets are under 40 px (info icons ~17 px, "Start a Session" 36 px); the result bar looks draggable but is read-only; gap values wrap and render their signs inconsistently. Droppable if the page is taken out of scope.

Reviewed 2026-10-19 (weekly): keep — display issues not rechecked

---

## Keep the override reason in the ship journal so a resumed override close keeps its trailer

**ID:** INBOX-61
**Date:** 2026-09-11
**Status:** proposed
**due:** month

`git-ops.sh` sets `SHIP_GATE_OVERRIDE_REASON` only in the live run and does not store it in the ship journal, so an override ship that crashes after the spec is moved and is finished with `--resume` writes its close commit without the `Gate-Override:` trailer. Since P1309 that trailer matters: `ship-gates.sh` refuses an absorbing spec whose close carries it, and a resumed close would slip through. Read from the code by P1309's round-3 adversarial review, not reproduced (it needs a TTY override that crashes mid-ship). Done when the journal keeps the reason and `--resume` writes the same trailer; droppable if no override close is ever resumed.

Reviewed 2026-10-21 (monthly): keep — journal-stored override reason not confirmed in git-ops.sh; unverified

---

<!-- Resolved 2026-09-22: fixed and shipped as P1343 (features/done). -->

<!-- Resolved 2026-09-15: "Deploy P1236 schema to prod — /transcribe rooms are live without their database functions" — see decisions.md 2026-09-15 [process] -->

## Finish P1304's loose ends: prod Sentry check, stranded UAT file, misplaced and fieldless specs

**ID:** INBOX-64
**Date:** 2026-09-14
**Status:** proposed
**due:** week

(1) Confirm the next real Sentry error from /live shows `/live/[code]` and no `session_code` — the Mixpanel half was verified on prod, the Sentry half has had no error event yet. (2) `features/uat/p1304.md` stayed behind because `block-manual-spec-close.py` refuses any move into `features/done/`, even a UAT companion of an already-closed spec. (3) `features/` root still holds rejected P1248 and P1261 and all-done P1274. (4) P1060, P1141 and P1155 lack `disclosure:` — grandfathered, but `fix-frontmatter.sh` exits 1 on them. Done when each is resolved or explicitly left; drop (1) after one clean Sentry event.

Reviewed 2026-10-19 (weekly): keep — item 3 is done (specs moved), items 1,2,4 not checked; features/uat/p1304.md still exists

---

## The room's Links bottom sheet is announced as a dialog but is not one

**ID:** INBOX-65
**Date:** 2026-09-14
**Status:** proposed
**due:** week

The sheet's trigger declares `aria-haspopup="dialog"`, but the forced-sheet branch in `drawer.tsx` renders a plain fixed `<div>` — no dialog role, no focus trap, no focus transfer on open, no Escape handler, no close control. A keyboard or screen-reader user who opens Links stays focused behind the visual modal and can only dismiss it by tapping the overlay. Pre-existing since P1179 and shared by every consumer of that branch, so it is wider than any one menu. Found by adversarial review during P1310, filed rather than fixed there because a nav-reachability fix is the wrong blast radius for changing a shared primitive. Done when the forced sheet is a real dialog (role, focus trap, Escape, close control) or the trigger stops claiming to be one; droppable if the forced-sheet branch is replaced by the library's own dialog primitive for other reasons.

Reviewed 2026-10-19 (weekly): keep — drawer.tsx has no role=dialog or Escape handler (grep 0)

---

## Duplicate event link tags render duplicate entries in the room menu

**ID:** INBOX-66
**Date:** 2026-09-14
**Status:** proposed
**due:** month

`buildLinksMenu` drops an extra whose tag collides with a standard one, but does not deduplicate repeated custom tags — two configured `tonight` rows produce two identical buttons pointing at one destination, on a sheet that now has a height ceiling and a scroll. Data-dependent: it needs an operator to configure the same tag twice, which has not been observed. Found by adversarial review during P1310. Done when validated extras are deduplicated by tag with a test for the repeated-tag case; droppable if the links column gains a uniqueness constraint at write time instead.

Reviewed 2026-10-21 (monthly): keep — buildLinksMenu still in src/app/data/event-links.ts; dedupe not confirmed

---

## Confirm on a real iPhone whether the phone zoom is actually fixed — the root cause was never proven

**ID:** INBOX-67
**Date:** 2026-09-14
**Status:** proposed
**due:** week

P1310 raised 16 sub-16px text controls to 16px on the reading that iOS Safari's focus auto-zoom was what the founder hit ("sometimes accidentally there is a zoom in and there is a part of this of the page that is cut off"). That diagnosis was read from the code and never reproduced — Chrome's device emulation cannot perform a pinch. A rival explanation was raised in review and not ruled out: `position: fixed` chrome clipping under pinch-zoom (this app stacks a fixed top nav and a fixed bottom nav) and `/live`'s `h-screen overflow-hidden` scaffold clipping at the viewport edge. Neither is addressed by a font-size change. Done when the founder confirms on an iPhone that tapping the join fields no longer rescales the page — and if it still happens, the next step is the fixed-position hypothesis, not more font sizes; droppable if the founder stops seeing the symptom for other reasons.

Reviewed 2026-10-19 (weekly): keep — needs the founder on a real iPhone

---

## Give the room's "Slides" entry a real link, and the signed-out menu group a heading

**ID:** INBOX-68
**Date:** 2026-09-14
**Status:** proposed
**due:** month

Two review findings from P1310, both cosmetic-but-real. (1) "Slides" is the one Links entry that is a true document load, and it runs through `window.open`, so middle-click, cmd-click and copy-link do nothing — an `<a href="/presi" target="_blank" rel="noopener noreferrer">` styled as the other entries would keep the new-tab behaviour and restore the affordances. (2) In the mobile menu the signed-out account actions (Take the Pledge / Log In / Create Account) sit under a bare divider while Use cases, Product, Learn and the signed-in "Your account" group all carry headings — an orphaned group; the label is a founder call. Done when the link is an anchor and the group has an approved heading; droppable if the menu is restructured for other reasons first.

Reviewed 2026-10-21 (monthly): keep — not re-checked

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

Reviewed 2026-10-21 (monthly): drop recommended; the same renewal is covered by the private store entry for the three scoped tokens, same 2026-12-13 expiry

---

## Quarterly terms review: one re-acceptance popup for everything since v1.4

**ID:** INBOX-70
**Date:** 2026-09-14
**Status:** proposed
**due:** month

Around 2026-12-01, batch every Terms of Service and Privacy Policy text change made since the v1.4 bump (2026-09-01), including P1307's event transcription wording (spec D15), into a single `CURRENT_TERMS_VERSION` bump, run through `/tos-review`, so users see one popup per quarter instead of one per small edit. In the same review, decide whether `/tos-review` Stage 7b ("version bump mandatory" on every terms edit) should change to quarterly batching; that is a skill change needing founder approval. Droppable if no terms text has changed since v1.4 when the date arrives.

Reviewed 2026-10-21 (monthly): keep — date-triggered review around 2026-12-01, not yet due

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

Reviewed 2026-10-27 (weekly): keep (verified) — P1307 pushed, but its 22 [post-deploy] clauses carry no measured two-phone prod results

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

Reviewed 2026-10-21 (monthly): keep — not re-run

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

Reviewed 2026-10-21 (monthly): keep — not re-checked

---

## Fix or retire the p506 "existing tags are preserved" assertion — the hashtag trigger makes it impossible

**ID:** INBOX-74
**Date:** 2026-09-15
**Status:** proposed
**due:** week

`e2e/integration/p506-backfill-hashtags.spec.ts` asserts a story inserted with a hand-set tag keeps it after the backfill, but `trg_stories_extract_hashtags` (BEFORE INSERT OR UPDATE OF content) rewrites `tags` from the content on every insert, so the tag is gone before the backfill runs. Surfaced 2026-09-15 once P1214 let the backfill actually run (it had been failing on a 401). Done when the test seeds that row without the trigger overwriting it, or the assertion is removed because the trigger now owns `tags`; droppable if P506's backfill test is retired.

Reviewed 2026-10-27 (weekly): keep (verified) — e2e/integration/p506-backfill-hashtags.spec.ts:170 test still present, unfixed

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

Reviewed 2026-10-21 (monthly): keep — cleanup skill has no registry-to-disk step as of the fold date; not re-checked

---

<!-- Dropped 2026-10-21: "Re-count the task inbox against the 88" (INBOX-76) — founder decision: inbox growth is answered by the rotating reviews in /weekly and /monthly, not intake throttling; see decisions.md 2026-10-21 [process] -->

<!-- Resolved 2026-10-16: "P887 canary copies every scripts/lib entry as a file and fails on any subdirectory" — see decisions.md 2026-10-16 [process] -->
## The Links menu's standing lists are compile-time constants with no founder write path

**ID:** INBOX-78
**Date:** 2026-09-16
**Status:** proposed
**due:** month

Split out of P1323 by founder decision. Two lists in src/app/data/event-links.ts are source constants, so adding an entry needs a code change and a deploy: STANDARD_STAKE_TAGS (six point collections after P1323 adds aisafety1) and the nine public letters st1-st9. The letters list is the larger and the growing one — st10 returns null today, so the next letter hits this first. A spec here must own the **write path**, not just the storage: "editable without a deploy" is not delivered by a migration, because a migration is a deploy, and hand-written SQL against prod puts nothing between the founder's keyboard and P1179's open-redirect invariant (I-4: an entry supplies a tag, never a path or URL — enforced today by isSafeTag plus stakePath being the only tag-to-path constructor). Do NOT auto-derive the list from "tags the founder created": there is no tags table and no author on a tag, so that resolves to every incidental #hashtag ever written (20260327084215_auto_extract_story_hashtags.sql). Precedent for operator-written destination data: the events.links jsonb column, 20260828120000_p1179_event_links.sql.

---

## Confirm P1324 records a full complete pass on the next real /day

**ID:** INBOX-79
**Date:** 2026-09-16
**Status:** proposed
**due:** week

P1324 shipped with one criterion verified only as far as it can be pre-deploy: every step id is
wired and proven recordable (both manifest/skill pairs pass check-sync, all 14 wrapped bodies
parse, the ledger accepts every verb/kind combination), but the live count from a real pass has
not been observed.

On the next /day: confirm the finish gate reports every required step recorded, and that the
count matches the manifest. If it does not, the gate names the missing step rather than hiding
it, and the pass can be released with the ledger abandon verb.

Why this is a note and not an unticked box in the spec: a standalone post-deploy checkbox is
unsatisfiable by construction — the ship gate refuses to merge while any box is unticked, and
the box cannot be ticked before the merge. P1216 deadlocked its own ship that way on 2026-09-03.
The documented pattern is to tick what was verified to the limit checkable pre-deploy and track
the live re-check here, which is what this entry is.

Reviewed 2026-10-27 (weekly): keep (unverified) — P1324 closed; no recorded full /day pass with every step; ledger not checked

---

<!-- Resolved 2026-09-22: fixed and shipped as P1344 (features/done). -->

## Every event needs a post-event debrief written into the repo

**ID:** INBOX-82
**Date:** 2026-09-21
**Status:** proposed
**due:** week

Event #1 (Clarity Night #1, 2026-09-18) ran and its results, attendee frictions and next-event changes existed only in a Claude.ai chat for three days. Every pre-event decision was logged (round rule, consent unit, tap-is-the-answer), but nothing after — so goals.md still read "Event #1 date: not yet set" and several strategy docs still said "zero events run" until the 2026-09-21 conversation sync caught it.

**Fix to test:** add a close-out step to `docs/events/series/clarity-night.md` (§7 Close-out) and `docs/events/process.md`: within 48h of an event, record in goals.md (tactical) the attendance, opt-in count **read from the event-room data, not recollection**, CTA uptake, frictions, and next-event changes; route any hypothesis reading (e.g. H-ChampionYield's pre-registered opt-in prediction) through /docs-strategy-update.

**Done when:** the step exists in the event process and event #2's debrief lands in the repo without a conversation sync having to find it.

Reviewed 2026-10-27 (weekly): keep (verified) — no 48h debrief step in docs/events; may be moot while public nights are paused (decisions 2026-10-07)

---

## Forced-verdict pass on the 42 backlog specs created before 2026-06-23

**ID:** INBOX-83
**Date:** 2026-09-21
**Status:** proposed
**due:** week

The /prioritize run of 2026-09-21 fitted today/week/in-progress but could not age-test backlog: git last-touch reads 2026-09-08 on every spec (the P1255 disclosure backfill), so the 90-day untouched test is blind. Use created_date instead. 42 backlog specs are older than 90 days by created_date; each needs keep or close-with-reason. Also the inbox itself (75 public + 24 private) was not triaged in that run.

Reviewed 2026-10-27 (weekly): keep (unverified) — 175 backlog specs older than 90 days; the keep/close pass has not run

---

## Observe the first migration-carrying /push (P1335 post-deploy)

**ID:** INBOX-84
**Date:** 2026-09-21
**Status:** proposed
**due:** month

The next time /push carries a real migration, watch it and record the result in P1335's done spec:
- step 2.5 applies exactly the pending set before promote
- the manifest stamp rides the push, with no leftover stamp commit
- push-docs waits on schema-ready
- for a coupled migration (`-- requires-frontend:`), step 6 waits for the Vercel Production deploy before applying
Also run one docs-only /push with SUPABASE_READONLY_TOKEN invalid, and confirm it passes with the skip warning.
Not faked on 2026-09-21, because doing so means fabricating a prod migration.

---

## e2e/p1149-consent-gate.spec.ts "declining leaves the room" times out on a click

**ID:** INBOX-86
**Date:** 2026-09-22
**Status:** proposed
**due:** month

`e2e/p1149-consent-gate.spec.ts:52` fails with `locator.click: Test timeout of 30000ms exceeded`. Reproduced identically with and without P1345's helper change on 2026-09-22, so it is pre-existing. Done when the test passes or is rewritten against the current consent UI.

---

<!-- Resolved 2026-10-16: "Observe P1346 on the first worktree commit that stages git-ops.sh after it ships" — see decisions.md 2026-10-16 [process] -->

## Stop deploy-manifest.json conflicting on every /ship of a branch with migrations

**ID:** INBOX-89
**Date:** 2026-09-22
**Status:** proposed
**due:** week

The worktree migration procedure (apply via main's migrate.sh, commit main's manifest with commit-to-main, and also copy it into the worktree) puts the manifest on both main and the feature branch, so /ship's cherry-pick conflicts on it for every commit that touched it — 3 of 5 commits on P1349 (2026-09-22), each resolved by hand with main's copy. Done when a branch with migrations ships with zero manifest conflicts: either the worktree copy is never committed, or git-ops.sh ship auto-resolves the manifest to main's version.

Reviewed 2026-10-27 (weekly): keep (verified) — git-ops.sh manifest-only conflict still prints a manual hint, no auto-resolve

---

<!-- Resolved 2026-10-16: "Fix p887-reproduce.test.ts failing whenever scripts/lib/__pycache__ exists" — see decisions.md 2026-10-16 [process] -->

## Run the Gemini-vs-Opus story-writer benchmark at the first story-draft

**ID:** INBOX-91
**Date:** 2026-09-28
**Status:** proposed
**due:** week

P1358 R3 made Gemini 3.8 the default story writer with the threshold pre-registered and the model labelled on probation; the benchmark itself has not run, because the ikigai run had not reached story-draft. At the next story-draft: for two arguers, have Gemini and Opus each write every story, one Sonnet checker grade both sets blind to authorship, and the founder pick a favourite per pair blind. Keep Gemini only if its checker failure rate is no worse than Opus's by more than one story and the founder prefers Opus in no more than half the pairs; otherwise writers move to Opus. Record the result in P1358 and drop the probation label. Droppable if the story stage stops using per-arguer writers at all.

Reviewed 2026-10-27 (weekly): keep (unverified) — P1358 benchmark pre-registered, no result recorded

---

## Run codex-review on the two P1358 commits (Codex was quota-walled during the review gate)

**ID:** INBOX-92
**Date:** 2026-09-28
**Status:** proposed
**due:** week

P1358 shipped with two of three reviewers delivered: Opus and Gemini both reported and their findings are fixed, but codex-review exited 1 on its usage limit, which its wrapper flags as a failed run rather than a clean review. Run codex-review over the two commits (the implementation, swept into the video-facade commit, and the fix commit) once the limit resets, and file anything real as a follow-up change rather than reopening the spec. Droppable once a later Codex review covers the same disagreement-pipeline files.

Reviewed 2026-10-27 (weekly): keep (unverified) — P1358 spec says Codex NOT DELIVERED; later codex runs not searched

---

## Confirm the Clarity Night page corrections log fills during the next draft (P1367)

**ID:** INBOX-94
**Date:** 2026-09-28
**Status:** proposed
**due:** week

P1367 shipped with this Done-When unobserved: draft mode now creates `.private/events/<run-slug>/improvements.md` before its first founder question and appends every page correction in the same turn. It can only be seen on a real draft. At the next Clarity Night page draft, list the folder before the first question and count lines against corrections given. Droppable once one draft shows the file filled.

Reviewed 2026-10-27 (weekly): keep (unverified) — improvements.md is 0 bytes; may never fire while public nights are paused

---

<!-- Resolved 2026-10-16: "Add the trio pointer to P1337 and P1338 once their co-tenant edits are committed (P1367)" — see decisions.md 2026-10-16 [process] -->

## Check whether share-dropdown's non-modal menu lets a dismissing tap through

**ID:** INBOX-96
**Date:** 2026-09-28
**Status:** proposed
**due:** week

P1366 proved a non-modal Radix DropdownMenu lets the tap that closes it also fire what is underneath (card navigation, a position write); the card menu was switched to modal with actions deferred to onCloseAutoFocus. src/app/components/shared/share-dropdown.tsx still uses modal={false}. Reproduce with an outside-tap test; fix the same way if it leaks, drop this if nothing under it is clickable.

Reviewed 2026-10-27 (weekly): keep (verified) — share-dropdown moved to src/app/components/profile/; still modal={false}; outside-tap repro not run

---

## Own profile Points tab keeps a story after it is edited or deleted in the Stories tab

**ID:** INBOX-97
**Date:** 2026-09-28
**Status:** proposed
**due:** week

Pre-existing on main, found in P1366 review: StoryCardFull's onDelete and onUpdate change only realStories, so after deleting your story the Points tab still shows the Your story expander (and no + Add a story) until reload; after an edit it shows the old text. Fix by updating the points' linked stories and viewerStoryCountMap too, or refetching. Drop if profile-page-v2 is replaced first.

Reviewed 2026-10-27 (weekly): keep (verified) — profile-page-v2.tsx:1332-1333 onDelete/onUpdate still skip viewerStoryCountMap

---

## Triage the 15 e2e tests that already fail on main in the card-footer specs

**ID:** INBOX-98
**Date:** 2026-09-28
**Status:** proposed
**due:** week

Measured in P1366 with a baseline worktree at the base commit: 15 tests fail on main and on the branch alike, across e2e/a11y/p465-accessibility.spec.ts (10), p1296-stake-navigation.spec.ts (2), p456-story-cta-footer.spec.ts, p465-point-card-footer.spec.ts and p699-letter-results-sender.spec.ts. Causes seen: page.waitForLoadState('networkidle') timeouts (p465 uses it 20 times), fetch failed in setup, assertions on the pre-P1366 design (edit/delete icon buttons now inside the card menu). Rewrite, or delete tests the layout spec now covers. Done when the six specs pass twice in a row.

Reviewed 2026-10-27 (weekly): keep (unverified) — named specs still use networkidle (20 and 11 hits); not run

---

## A point listed in the anonymous feed opens Point not found on its page

**ID:** INBOX-99
**Date:** 2026-09-28
**Status:** proposed
**due:** month

Seen on the test DB during P1366 verification, identical on main: a point card in the logged-out /feed opens /point/:id, which renders Point not found. The feed's visibility filter and the point page's disagree for some rows. Find which rows and align the two, or drop if it only affects e2e fixture points.

---

## Stop a host from creating an RSVP row on their own event

**ID:** INBOX-100
**Date:** 2026-09-29
**Status:** proposed
**due:** month

Found in the P1366 review: rsvpToEvent has no host check and the post-signup auto-RSVP (AuthCallbackPage) can RSVP a host who was logged out on their own event page; RLS only checks the caller's own profile. The event card display now tolerates such a row (hostHasRsvp), and prod had 0 host RSVP rows on 2026-09-29. Add the guard in the service and the auto-RSVP path; drop if P844's hidden button is judged enough.

---

<!-- Resolved 2026-10-16: "p887-reproduce test breaks when scripts/lib has a __pycache__ folder" — see decisions.md 2026-10-16 [process] -->

## "Show less" on fully visible stories is confusing (product-wide) (due: month)

**ID:** INBOX-102
**Date:** 2026-10-01
**Status:** proposed
**due:** month

A story card that is already fully visible still offers "Show less". Hide the toggle when there is nothing collapsed. Product-wide, surfaced in the P1336 review.

---

## 0–10 rating buttons too small on phones (letter drawer) (due: month)

**ID:** INBOX-103
**Date:** 2026-10-01
**Status:** proposed
**due:** month

The 0–10 rating buttons in the letter drawer are below a comfortable touch target at phone width. Surfaced in the P1336 review.

---

## Feed VideoThumbnailCard uses 480px thumbnails (due: month)

**ID:** INBOX-104
**Date:** 2026-10-01
**Status:** proposed
**due:** month

The feed's VideoThumbnailCard loads 480px thumbnails, which look soft on high-density screens. Surfaced in the P1336 review.

---

## Pulsating play button on all videos (idea) (due: month)

**ID:** INBOX-105
**Date:** 2026-10-01
**Status:** proposed
**due:** month

Idea: a subtle pulsating play button on every video facade to signal it is playable. Surfaced in the P1336 review; validate before building.

---

## Readable research-programme page with "Copy for AI" (later task) (due: month)

**ID:** INBOX-106
**Date:** 2026-10-01
**Status:** proposed
**due:** month

The research-programme link points at the GitHub doc. A readable product page with a "Copy for AI" action is a later separate task (out of P1336).

---

## Mechanical guard: 'tsc --noEmit -p .' typechecks nothing (tsconfig.json has files: [])

**ID:** INBOX-107
**Date:** 2026-10-01
**Status:** proposed
**due:** month

`npx tsc --noEmit -p .` exits 0 with zero errors in this repo because the root tsconfig.json is a references-only file (`files: []`). The real check is `-p tsconfig.app.json` (baseline ~1100 errors). Agents have reported "tsc clean" from the wrong command 5 times (decisions.md 2026-10-01 [process], item 4); during P1369 it hid 8 real type errors.
Candidate guards: a PreToolUse hook that rejects `tsc ... -p .` / bare `tsc --noEmit` in cp, or an npm script `typecheck` that is the only documented path plus a baseline-count comparison. Fail-first: run the hook against `npx tsc --noEmit -p .` (must block) and `-p tsconfig.app.json` (must pass).

---

## P1369 follow-ups: post-deploy rechecks + accepted LOW review items

**ID:** INBOX-108
**Date:** 2026-10-01
**Status:** proposed
**due:** week

After the P1369 push reaches prod:
- Installed prod PWA: open a visited point/story/stake list offline; strip reads "Offline · saved copy from {age}".
- Screenshot the live transcription bar together with the offline strip.
- Letters offline: the test DB has no letters, so the letter path is only unit-tested; check one real letter on prod.
Accepted, not fixed (decide fix vs. keep):
- A 5xx/429 on an unrelated request during a page read shows the stored copy + Offline strip until the next request succeeds (decisions.md 2026-10-01 [technical] P1369).
- Point, story, profile and letter vote paths do not use saveInOrder (no ordering across surfaces).
- Sign-out cache delete waits while an old-build tab holds the database open.
- /finish LOWs: letter instant read does not kick in behind a captive portal; currentBuildId returns '' silently; removal dialog repeats the offline check instead of the shared guard; viewerId: undefined semantics.
- Earlier known gaps: embedded point card vote revert outside the feed; use-active-session uses the app-wide failure signal; edit/delete/image writes show generic errors offline.

Reviewed 2026-10-27 (weekly): keep (unverified) — Offline strip implemented; post-deploy rechecks and LOW items not checked

---

## transcribe-room-batch: unbounded background concurrency and stale-claim reclaim of running jobs

**ID:** INBOX-110
**Date:** 2026-10-01
**Status:** proposed
**due:** month

Found by the room-sweep cost-leak review 2026-10-01 (Codex Sol executed it; Gemini concurred). Both predate the hourly change. (1) /process starts an unbounded background task per request and returns 202, so Cloud Tasks max 5 / Cloud Run concurrency 5 do not bound work: 20 requests ran 20 jobs at once on one instance. (2) STALE_PROCESSING_MINUTES=30 with no heartbeat, but a 180-min member recording is ~36 sequential 5-min Gemini calls, so /sweep can reset a job that is still running and a second worker re-processes it (double Gemini spend, racing transcript writes, can burn all 3 attempts). Low live risk today (8 jobs ever). Fix needs a service redeploy: semaphore around background work + heartbeat claimed_at (or stale threshold above the service 3600 s timeout).

---

<!-- Resolved 2026-10-02: P1379 applied to prod via migrate.sh --env prod --only (founder-approved); prod smoke 8/8. -->

## Story-1 path for first-time visitors: pinned st1 story -> st1 letter -> verify live

**ID:** INBOX-112
**Date:** 2026-10-02
**Status:** proposed
**due:** month

Founder idea (2026-10-02, during P1392): bring the st1 story forward for first-time visitors (pinned at the top of the Stories tab for signed-out visitors only), connect it to the st1 letter, and from there invite them to verify it live in /live with the founder.
Deferred until P1392 (feed-first homepage) has run long enough to show whether the new "/" alone produces discovery-call bookings, so the two changes can be measured separately.
Before building: write the success signal up front (e.g. N visitors reach the letter, M book or start a /live). Rejected for now: product walkthroughs, letter demo with dummy data, Clarity Organization explainer (explain-before-they-care pattern).

---

<!-- Resolved 2026-10-16: ST1 video switched to the founder clip and verified playing on /feed (1280x720, 84.4 s, currentTime advancing, no media error) -->

## Rework goals.md into weekly measurable goals (P1399 goals review)

**ID:** INBOX-116
**Date:** 2026-10-04
**Status:** proposed
**due:** week

The P1399 goals review found the Next Steps are one-off checkboxes with no pace, so they cannot be plotted, and the champion falsifier has no weekly rate. It proposes five weekly goals: champion talks, pilots held, follow-ups per pilot, events per week, and zero broken sessions; every target is a founder decision. Review text: .private/p1399-day-design/p1399-goals-review.md. Route the edit through /slava:maintain:docs-strategy-update. The Day page Stats tab reads these goals.

Reviewed 2026-11-04 (weekly): keep, not checked against its artifact this run, still open

---

## /prepare statements step can load with 0 points and a dimmed Continue

**ID:** INBOX-117
**Date:** 2026-10-04
**Status:** proposed
**due:** week

Seen once in 4 runs of e2e/p1402-standalone-prepare.spec.ts smoke (2026-10-04, P1412 session): the cmp7 step rendered no cards and "Set your position on all 0 points to continue." The points read returned an empty list (not an error), so PreparePage snapshotted [] as the step's cards. Also flagged by the P1402 round review (LOW: a failed or empty read leaves a statements step with no cards and a misleading hint). Fix direction: treat an empty list as "couldn't load" (retry, or a short message) and never hint "0 points". Cause of the empty read unknown (VPN was on; unproven).

---

- [ ] **Event publish: warn when the meeting venue is closed at the meet time** (due: week). 2026-10-05 hike: meet 9:30 at a cafe that opens 10:00 Sun; research noted it in passing, publish went ahead and the description said "coffee after", against the founder's default of coffee/breakfast first at the meet point. Fix: /publish-event (and select-hike) compare venue opening hours to meet time and STOP with a warning; default copy = coffee first.
- [ ] **P1530/P1538: downgrade the prod Supabase org and pause the old TEST project** (due: week). 2026-10-21. Prod org went to Pro to free a project slot; a paid-plan project cannot be paused. Decide on two signals: Supabase support's reply (ticket sent 21 Oct) and prod-only usage read 24-26 Oct. Then: pause new TEST briefly, downgrade the prod org, pause old TEST, restore new TEST. Do it before the Pro renewal date. Full sequence in P1530 findings.
- [ ] **TEST is missing the storage-signing service-account key** (due: month). 2026-10-21, P1538. `generate-story-image-url` and `explain-back-signed-url` return 500 on TEST until a key for the GCS-writing service account is provided; no local copy exists. Founder decision whether to mint one.
- [ ] **Stale e2e tests found during the P1538 parity run** (due: month). 2026-10-21. Fail on old TEST too, or against main's own code: `03-login-flow` (signup link, email-field focus); `edge-fn-authz-regression` 409 test still sends terms `v1.3` but `create-and-sign` accepts only the current version since P1487; that spec's wrong-Authorization and wrong-webhook-secret tests.
- [ ] **setup-verify-listener/partner check only the first page of listUsers** (due: month). 2026-10-21, P1538. With more than 50 users they miss the existing account and fail with "already registered". Look the account up by email instead.
- [ ] **Drop the old TEST ref from P1532's cleanup guard once old TEST is paused** (due: month). 2026-10-21. `_e2e_purge_allowed` accepts both refs during the move.
Reviewed 2026-11-04 (weekly): keep, not checked against its artifact this run, still open

<!-- Resolved 2026-10-14: shipped as P1198 (ship refuses on drift) — see decisions.md 2026-10-14 -->

## Follow-ups from the 2026-10-05 bug batch (P1415-P1422)

**ID:** INBOX-120
**Date:** 2026-10-05
**Status:** proposed
**due:** week

(1) Server-enforced position write ordering, a client sequence plus conditional upsert/delete, closes the P1420 accepted limits. (2) /feed overflows horizontally at 320px (header and Stories/Points+Sort row; pre-existing, noted in P1415). (3) e2e p1364 "tab or sort change then Back" targets a removed sort button, and search-then-Back sees offline-stake prefetch reads while typing. (4) next-p-number.sh gave the same number to parallel agents whose specs were still only in worktrees (P1420 and P1421 collided); reserve numbers in a ledger. (5) P1417 skill text edits for re-create-event abort and publish-run 8b (drafts in the P1417 spec) and P1419 hike banners on GCS still full size. Drop any item already covered by a spec.

Reviewed 2026-11-04 (weekly): keep, not checked against its artifact this run, still open

---

## Point page embed: 'Expand linked stories' renders no story

**ID:** INBOX-121
**Date:** 2026-10-05
**Status:** proposed
**due:** week

Found 2026-10-06 while writing P1424's e2e guard. On /point/:id?embed=true (no ?from=), clicking 'Expand linked stories' (label '1 story') renders no QuotedStory, even though the point has a linked public story. Reproduced on main at the P1424 base commit (e2e/p1424-nested-details-only.spec.ts, the test.fixme guard). Suspect: PointCardWithLinks's expansion condition (!isDetailView && storiesExpanded && (liveSessionMode || profileOwner || isEmbed)): check whether isEmbed reaches the card. Once fixed, turn the fixme back into a test.

Reviewed 2026-11-04 (weekly): keep, not checked against its artifact this run, still open

---

## Profile e2e specs time out when the owner has points (fails on main too)

**ID:** INBOX-122
**Date:** 2026-10-05
**Status:** proposed
**due:** week

A profile whose owner has points stayed on its loading skeleton ("Stories (0)") on the test DB, so every getByText of a seeded point timed out. Control run on unchanged main (f856dc899): e2e/p154-position-persistence-profile.spec.ts failed 6/6 at the first getByText; the same pattern hit p151-profile-position-loading, p151-regression, point-position-persistence and manual-points. Found during P1423 under heavy machine load, so first rerun p154 on an idle machine: drop this if it passes there, otherwise check console/network on /p/<slug> for an owner with one public point.

Reviewed 2026-11-04 (weekly): keep, not checked against its artifact this run, still open

---

## Horizontal scroll at 320px on the story page footer and the letters header

**ID:** INBOX-123
**Date:** 2026-10-05
**Status:** proposed
**due:** week

At 320px the story page card footer (points count, Add a point, edit, delete, share, open icons) runs past the card and the page scrolls sideways: measured scrollWidth 349 on main, 346 after P1423. The letters page header (three tabs plus New Draft) overflows the same way, and draft metadata wraps mid-phrase. Found by the P1423 visual review; both predate it. Done when /story/<id> and /letters?tab=drafts have scrollWidth equal to 320 at 320px; drop if 320px support is retired.

Reviewed 2026-11-04 (weekly): keep, not checked against its artifact this run, still open

---

## De-flake p1270-profile-story-media under full-suite load

**ID:** INBOX-124
**Date:** 2026-10-05
**Status:** proposed
**due:** week

src/tests/p1270-profile-story-media.test.tsx failed 2 tests under full-suite load on 2026-10-06 (findByRole 'Your story' timed out) but passed 3/3 in isolation; one pre-commit retry went green. Reviewers also saw load flakes at HEAD in p1296-card-footer, p1366-card-footer and p1364-list-return-cache. Done when these pass 5 consecutive full-suite runs; droppable if none recur in the next 10 hook runs.

Reviewed 2026-11-04 (weekly): keep, a different suite test (p1607 loadtest switch) flaked under full-suite load today, so flakes still recur

---

## Browser-verify the PositionButtons menu clamp at 320/375px

**ID:** INBOX-125
**Date:** 2026-10-05
**Status:** proposed
**due:** week

The dropdown clamp in src/app/components/shared/menu-clamp.ts (branch overnight/2026-10-06) is unit-tested and mutation-checked but not browser-verified, because opening the menu needs a logged-in test user who already holds a position (a first click casts a vote). Open the Agree menu at 320 and 375px and confirm its right edge stays at least 8px inside the viewport. Droppable if the overnight branch is not merged.

Reviewed 2026-11-04 (weekly): keep, not checked against its artifact this run, still open

---

<!-- cleared by /day 2026-10-15: "A new browser error: invalid regular expression on an event prepare page [day:0e1b7e7c]", check cp.sentry ran and reported ok -->

<!-- cleared by /day 2026-10-15: "The GPU billed-hours check cannot run from the day script [day:da4cc7eb]", check cp.cost ran and reported ok -->

<!-- cleared by /day 2026-10-16: "The sign-in canary reports Google sign-in may be broken [day:584cdc87]", check cp.ops ran and reported ok -->

<!-- Resolved 2026-10-16: "Stranded signups alert is open and escalated" — see decisions.md 2026-10-16 [process] -->

## P1181 is built and waiting for you [day:8d2338f0]

**ID:** INBOX-131
**Date:** 2026-10-06
**Status:** proposed
**due:** week

Found by /day on 2026-10-06 (check: cp.w1, severity: medium).

features/p1181_community_scoped_visibility.md status qa, filed 2026-08-28 (39 days).

Still open on 2026-10-07 (/day cp.w1).

Reviewed 2026-11-04 (weekly): the spec is now in features/archive/2026-10, no longer in qa; the day board owns this card, nothing to close here

---

<!-- Resolved 2026-10-16: "P1274 is closed but still sits in features" — see decisions.md 2026-10-16 [process] -->

<!-- Resolved 2026-10-16: "A ship of P1389 started and never finished" — see decisions.md 2026-10-16 [process] -->

## Give worktrees tools/kanban/node_modules safely (link helper, nested exemptions, dep opt-out)

**ID:** INBOX-135
**Date:** 2026-10-07
**Status:** proposed
**due:** month

Worktrees lack tools/kanban/node_modules, so kanban tests, scripts/inbox.sh and the gen-thumbnail / video-question-beats / video-brand-pass assets fail in any worktree (test-p1324-day-ledger.sh already works around it). A plain symlink in setup-worktree.sh is NO-GO (Codex review 2026-10-07, verified in code): (1) scripts/lib/worktree-changes.sh exempts only top-level node_modules/test-results, so a nested link, or nested tools/kanban/test-results (hit on the P1432 ship), makes /ship retain the worktree; (2) `ln -sf` over an existing directory symlink creates a link INSIDE the shared install on re-run; (3) a branch that changes tools/kanban/package.json must not share main's install. Separately safe: .gitignore `node_modules/` → `node_modules` (Codex ran 12 matcher assertions), which clears the `?? node_modules` noise in w1/w3/w6. Done when: a small spec ships an idempotent link helper, nested exemptions, a dependency-change opt-out, and a sentinel teardown test.

---

## Drop the ear badge on the host's grouped participant rows (P1430 decision 2)

**ID:** INBOX-136
**Date:** 2026-10-07
**Status:** proposed
**due:** week

Founder-approved: on the event page, the host's grouped participant rows pass showEarBadge false so names stop truncating to three letters at 375px; keep "understood N/10". One-line change in EventDetail plus an assertion in the P1429 A2 e2e (no ear badge inside the host groups, name not cut off). Not landed because the browser test could not run. Droppable if P1430 is built and covers it.

Reviewed 2026-11-04 (weekly): keep, not checked against its artifact this run, still open

---

<!-- cleared by /day 2026-10-15: "A browser abort error was logged on a hike event page [day:3571e5ad]", check cp.sentry ran and reported ok -->

## The deferred-work inbox holds a large backlog with no exit [day:299d2a5b]

**ID:** INBOX-138
**Date:** 2026-10-07
**Status:** proposed
**due:** month

Found by /day on 2026-10-07 (check: cp.weekly, severity: low).

Counts from scripts/inbox.sh: public open 123 (next-id 137), private open 73. Zero unparseable. Entries tagged [day:...] were skipped by the loop guard (already on the board). The skill asks for one finding per entry; with this many that would flood the board, so this is one aggregate finding. Deviation reported to the dispatcher.

---

## Transcript efficiency counts are far above last week's baseline [day:658fd703]

**ID:** INBOX-139
**Date:** 2026-10-07
**Status:** proposed
**due:** month

Found by /day on 2026-10-07 (check: cp.weekly, severity: low).

Report at .private/reports/efficiency/2026-10-07.md. Skill threshold: P3 above 2x baseline and more than 50 percent genuine on spot-check means investigate the top 3 sessions.

---

<!-- Resolved 2026-10-16: "CLAUDE.md is at its 350-line budget" — see decisions.md 2026-10-16 [process] -->

## A CLAUDE.md change since the last run was not run through the claude-md gate [day:3038e55b]

**ID:** INBOX-141
**Date:** 2026-10-07
**Status:** proposed
**due:** month

Found by /day on 2026-10-07 (check: cp.reflect, severity: low).

Wave 1 CLAUDE.MD CHANGES listed a4ee700c5. The CLAUDE.md-gate subagent was not run here.

---

## Header event button: refetch while mounted; hoist StaticNavLinks; p887 flake

**ID:** INBOX-142
**Date:** 2026-10-07
**Status:** proposed
**due:** month

Surfaced by P1434 reviews, pre-existing, not fixed there. (1) useTonightsEvent refetches only when userId changes, so a header left mounted past local midnight keeps yesterday's registered event and a new RSVP stays invisible past the 5-minute cache until a remount (src/app/hooks/useTonightsEvent.ts, since P1351). (2) SimpleNavigation declares StaticNavLinks inside its render body, so the nav-links subtree remounts on every re-render, e.g. crossing the 20px scroll threshold. (3) src/tests/p887-reproduce.test.ts failed once under the full pre-commit run and passed alone 11/11. Droppable if no event-night report shows a stale button and p887 does not fail again by the next /monthly.

---

<!-- Resolved 2026-10-09: "Let a withdrawn spec close without the founder override" — delivered by P1444; P1274 closed on that route -->

## Day page: land on the first open card in the same render; test the no-landing paths

**ID:** INBOX-144
**Date:** 2026-10-07
**Status:** proposed
**due:** month

Follow-ups from P1435. (1) On a run's first load the Day page shows card 1 for a frame before jumping to the first open card, because the landing runs in reload().then after setRun; apply the index in the same render. (2) Add e2e tests that an earlier (read-only) run does not jump, and that a fully rated Reflection reloads on statement 1. Done when both hold; droppable if the flash is never noticed.

---

<!-- cleared by /day 2026-10-15: "An event RSVP was refused by a database security rule [day:641f9da8]", check cp.sentry ran and reported ok -->

## After P1441 deploys, confirm a failed auto-RSVP reaches Sentry

**ID:** INBOX-148
**Date:** 2026-10-08
**Status:** proposed
**due:** week

After P1441 deploys, confirm a failed auto-RSVP appears in Sentry as "DB error in rsvpToEvent" (the post-signup path previously logged to the console only; locally only the unit test proves it). Droppable if no failure occurs within 30 days.

Reviewed 2026-11-04 (weekly): keep, P1441 is in features/done; droppable after 2026-11-07 if no failure appears in Sentry

---

## Repair integration specs that fail at their fixtures before reaching their subject

**ID:** INBOX-150
**Date:** 2026-10-08
**Status:** proposed
**due:** week

Found during P1321 regressions: get_inbox_items(p_user_id) callers in p690, p695 and two 20260412 specs (20260412150407_fix_invitation_token_uuid_cast also fails at its clarity_docs fixture insert); p778 inserts clarity_letters without source_doc_id (23502); p707-db-schema inserts clarity_letters.title, which no longer exists (PGRST204); p511 calls update_last_activity as service role; security-backlog-rls inserts stories.title (PGRST204); p1010 asserts terms_version 4 or 5 but the server writes 6. Done when each either passes or is deleted as superseded; droppable per spec if a newer spec already covers its subject.

Reviewed 2026-11-04 (weekly): keep, not checked against its artifact this run, still open

---

## Stop integration specs signing in on the shared supabaseAdmin client

**ID:** INBOX-151
**Date:** 2026-10-08
**Status:** proposed
**due:** week

p707-db-schema and p778-db-schema call supabaseAdmin.auth.signInWithPassword, which replaces the client's service-role session, so every later admin read and teardown runs as the signed-in user and test fixtures leak. Sign in on a throwaway client instead (pattern in e2e/integration/p1321-letter-delivery-guard.spec.ts) and grep e2e/ for other instances. Droppable if both specs are deleted under the fixture-repair note.

Reviewed 2026-11-04 (weekly): keep, e2e/integration/p707-db-schema.spec.ts and p778-db-schema.spec.ts still exist

---

## /day step refuses a body with a placeholder token instead of the real script

**ID:** INBOX-152
**Date:** 2026-10-09
**Status:** proposed
**due:** week

On 2026-10-09 the report-sections step of /day failed because the agent running it (Sonnet 5.5) sent the literal token PYEOF_PLACEHOLDER instead of the step's python body; the retry was refused as already recorded, and the sections were recorded later via the data command. Fix: the step runner refuses a body containing an obvious placeholder token, so the failure names itself. Droppable if /day is only ever run on Opus and this does not recur within two weeks.

Reviewed 2026-11-04 (weekly): keep, ~/.claude/scripts/day-step.sh contains no placeholder-token check

---

## Day board overflows below about 340px: header, date bar and Daily-report cards

**ID:** INBOX-153
**Date:** 2026-10-09
**Status:** proposed
**due:** week

Measured 2026-10-09: at a 320px viewport the Day page lays out at 337-339px (live board and preview alike); the sidebar does not collapse and the tabs overlap at 375px. Pre-existing, not P1449. Fix the board chrome for phone widths, or record that the board is desktop-only. Droppable if the founder never opens the board on a phone.

Reviewed 2026-11-04 (weekly): keep, not re-measured this run

---

## Reflection answers are keyed by slot id, so a re-recorded reflection shows another statement's answer

**ID:** INBOX-154
**Date:** 2026-10-09
**Status:** proposed
**due:** week

Found 2026-10-09 redoing a run's reflection: the card showed the founder's story and a Done chip from a different statement that had held the same r-id. Normal runs never re-record, so this bites only on a redo or regeneration. Fix: key answers by the statement hash as well as the id. Droppable if reflections are never regenerated.

---

## publish-spec leaves the embargo stub in place, so the duplicate-spec check blocks it

**ID:** INBOX-155
**Date:** 2026-10-09
**Status:** proposed
**due:** week

2026-10-09 (P1448): git-ops publish-spec staged the published spec into done/ but did not remove features/pN_security-review-pending.md, so pre-commit refused the commit; also it could not find migrations named after the spec when the files carry the parent spec's name. Fix: publish-spec removes the stub in the same commit and accepts --migrations naming the files. Droppable if no embargo spec is filed again.

---

## Screenshot re-edit hook treats tool output as founder text

**ID:** INBOX-158
**Date:** 2026-10-09
**Status:** proposed
**due:** week

The hook that blocks UI edits after the founder says a change is not visible scans every transcript entry of type user, and tool results are of that type. So a command that prints its trigger phrases, or a test log, blocks every .tsx edit until a later browser call. Fix: match only entries that are plain user text, with no tool_result blocks. Droppable if the hook is retired. Hit 2026-10-09 by the P1437 v3 builder subagent.

---

<!-- Resolved 2026-10-16: "A ship of P1446 started and never finished" — see decisions.md 2026-10-16 [process] -->

<!-- cleared by /day 2026-10-15: "A new calendar source suggestion waits for review [day:81f2fee1]", check cp.sources ran and reported ok -->

<!-- Resolved 2026-10-16: "Open alert: stranded signups, people started signup and never got in" — see decisions.md 2026-10-16 [process] -->

## Day page: shorten card copy written by /day (P1463 follow-up)

**ID:** INBOX-162
**Date:** 2026-10-12
**Status:** proposed
**due:** month

From the P1463 copy review (2026-10-12). The Day card text is written by the /day run, not the board, so P1463 left it alone. Findings: Point A/Obstacle/Point B repeat the same nouns (~60 words could be ~15); dates show up as an ISO date plus "about 3 days ago" plus the "3 days" pill; option labels and "Main risk" lines run to two lines; agent rows are full sentences, and several agent rows name the same root problem (Beeper token) that already has a founder card. Fix belongs in the /day card-writing step: one short line per field, one date, merge or dedupe agent rows that share a root cause.

---

## Day page: answered cards collapse; Send N names what changed; compact pager (P1463 follow-up)

**ID:** INBOX-163
**Date:** 2026-10-12
**Status:** proposed
**due:** month

Deferred from the P1463 copy and visual review (2026-10-12): (1) an answered card still shows the full Point A/B and four option rows; collapse it to "You chose: X · Change". (2) After sending, "Send N changes" carries a number nothing on screen explains; mark the changed rows or name them. (3) Previous / 1 of N / Next could be one compact "‹ 1/3 ›" control. Board UI only (tools/kanban).

---

## Event prep: in-person sales-practice event

**ID:** INBOX-164
**Date:** 2026-10-13
**Status:** proposed
**due:** week

Prepare the in-person sales-practice event (goals.md 3a) in its own session. Founder confirmed in-person first (2026-10-13). Founder's addition to the format: an attendee brings either one stuck customer conversation OR the conversations they are not having (why they can't reach out), and works on that under the explain-back rule.

---

## Day page feedback (tools/kanban)

**ID:** INBOX-165
**Date:** 2026-10-13
**Status:** proposed
**due:** week

Day page feedback from the founder (2026-10-13, screenshots in ~/Screenshots 14-23 and 14-26), to spec before building (tools/kanban): (1) one left list that stays the same when moving between cards and stories, instead of two layouts; (2) the agent's reading of a story ("AGENT on Slava · Agrees") moves down into the "Their story" block; (3) "Add your story" uses the app's existing components: a button that expands the input, open by default only when it already has text; (4) "Agent: N tasks" appears twice (panel and footer): keep one, and label it as what was sent to the fixing agent; (5) Stats "From this run": drop "shipped since last run" and the cloud spend estimate (Monitoring has it); chat help requests become reply cards, not a reading tile; replace the section with goals and what's next in plain words. Founder rule: no custom components; reuse cards, points and buttons.

## Prod health smoke times out on /cm every run (networkidle never reached)

**ID:** INBOX-166
**Date:** 2026-10-13
**Status:** proposed
**due:** week

The post-deploy smoke fails on /cm on every run: page.goto waits for networkidle and hits the 45s timeout although the page renders (HTTP 200 in under a second, snapshot shows content). Seen 2026-10-12 before the P1453 push and again after it, so it is not a deploy regression. Likely a persistent request on /cm (P1447 surface) keeps the network busy; fix either that request or the smoke's wait condition for the route. Done when smoke:prod passes 8/8; droppable if /cm leaves the smoke route list. It matters because a permanently red step 6 teaches every /ship to wave real failures through.

---

## Flaky under load: P1364 list-return cache test

**ID:** INBOX-167
**Date:** 2026-10-13
**Status:** proposed
**due:** week

src/tests/p1364-list-return-cache.test.tsx ('POP serves the cached list on the same tab with no refetch') failed once inside the pre-commit full suite on 2026-10-13 (P1468 build), then passed 5 of 5 run alone in both a worktree and main. Load-dependent timing. Make it deterministic (fake timers or await the cache read) rather than retrying.

2026-10-13: a second load-flaky test: tools/kanban/e2e-day/day-page.spec.ts:1219 'paging past an issue answered with your own text' failed once in 2 full Day e2e runs ([data-chosen] not found at :1230), passed 8/8 with --repeat-each=8.

---

## Remove day-cp's unread spend estimate after P1468 ships

**ID:** INBOX-168
**Date:** 2026-10-13
**Status:** proposed
**due:** month

P1468 removed the only reader of day-cp Wave 1's spend estimate (the dropped spend line). The EST_PER_DAY computation (day-cp.md Wave 1, ~lines 282-352 on the P1468 branch) still runs every /day and nothing reads it. After P1468 ships: grep for readers again and remove it if none (Monitoring has its own spend source).

/prioritize 2026-10-16: P1468 shipped 2026-10-13; grep for EST_PER_DAY/EST_SINCE_LAST finds only its producer in day-cp.md (lines 303-373), no reader. Ready to remove; needs skill-edit approval.

---

## P1468 post-ship checks after the next /day run

**ID:** INBOX-169
**Date:** 2026-10-13
**Status:** proposed
**due:** week

P1468 Post-ship verification (spec section of the same name). After the first real /day run following the P1468 ship: PS-1, the report has goals with the goal line and none of the four dropped notes, and both pipeline findings are exercised (really or via a fixture). PS-2, a founder-addressed chat item becomes a reply card keyed reply:<chat>:<message key>, and a group ask does not. Tick the boxes in the shipped spec with the run's evidence.

---

## Event page and RSVP confirmation show the same time in two formats (12h+zone vs 24h, no zone)

**ID:** INBOX-170
**Date:** 2026-10-13
**Status:** proposed
**due:** month

Split out of P1476 (which fixes only the DST offset label). The RSVP confirmation page (RsvpConfirm, under src/app/prototypes/events/) shows 24-hour time with no timezone, while the event page shows 12-hour time plus a zone label, so the same event reads differently on two pages. Which format both should use is a product call: [FOUNDER DECISION: 12h vs 24h, and whether the confirmation page shows a zone label]. Done when both pages render one agreed format; droppable if event pages stop showing times this way. Found in P1441 UAT, 2026-10-08.

---

## P907 post-push checks: X-Frame-Options SAMEORIGIN on prod and the /live letter overlay

**ID:** INBOX-171
**Date:** 2026-10-13
**Status:** proposed
**due:** week

P907 changed the global `/(.*)` route in `vercel.json` from `X-Frame-Options: DENY` to
`SAMEORIGIN` to match its CSP `frame-ancestors 'self'`. Neither half is observable locally (Vite
sends no security headers), so after the next `/push` deploys it:

1. `curl -sI https://claritypledge.com/ | grep -i x-frame-options` → expect `SAMEORIGIN`.
2. Open a letter's live overlay on prod and confirm the `/live` iframe renders.

If either fails, reopen via `/change-request` on P907. Delete this note once both pass.

/prioritize 2026-10-16: check 1 passes on prod (curl -sI shows x-frame-options: SAMEORIGIN). Check 2 (letter live overlay iframe renders) not yet observed.

---

## point_config writes are read-modify-write from the client: P1427 residual race and doc-detail-page.tsx

**ID:** INBOX-172
**Date:** 2026-10-13
**Status:** proposed
**due:** week

P1427 (shipped 2026-10-13) made the letter seal re-read `doc_stories.point_config` right before
writing the default `order`, which closes the page-load-snapshot case. Two things it deliberately
left open:

1. **Residual race.** The read and the write are still two round trips, so a `hidden` /
   `lead_count` change landing between them is overwritten. Closing it needs a server-side
   single-key write (`jsonb_set` / `||` inside an RPC) — a migration, out of scope for P1427.
2. **Same class elsewhere.** `src/app/pages/doc-detail-page.tsx` (~L107) writes `point_config`
   from a spread of state loaded earlier — the same lost-update shape P1427 fixed in the composer.
   Sibling of P1426 (`/demo` jsonb lost update) and P1427.

Likely one spec: a `patch_point_config(doc_id, story_id, patch jsonb)` RPC used by every writer.

---

## More unit tests fail only under machine load (measured during P1394)

**ID:** INBOX-173
**Date:** 2026-10-13
**Status:** proposed
**due:** week

P1394 (2026-10-13) fixed the named load flakes (p1364 stake, p1366, p1296, p1270, p1424,
jsx-comment-leak). Its 20+20 full-suite stress runs at load average 100-160 found more, not yet
fixed. Counts are failed runs out of 20 (after-fix run / final run):

- `src/tests/p1364-back-drift-guard.test.ts` "no FocusHeader onBack and no bare history pop…" — 11 / 9; hits the 5s test timeout; likely a file-scan cost like jsx-comment-leak (unmeasured).
- `src/tests/p1337-profile-points-cap.test.tsx` "renders 50 of 60… reveals the rest on Show more" — 6 / 6; 1s findBy expires during the profile render (same cause as p1270).
- `src/tests/p1366-profile-story-menu.test.tsx` "Delete that fails: error toast…" — 5 / 0 (also blocked a real commit tonight).
- `src/tests/p1364-point-filter.test.tsx` "a filter press REPLACES ?filter=…" — 4 / 0.
- `src/tests/p1310-mobile-nav.test.tsx` "keeps Groups marked as the current page…" — 3 / 0.
- `navigation-acceptance-full.test.tsx`, `p1414-event-topic-vote.test.tsx` — 1 each.

Apply P1394's method (measure loaded runtime, then a named per-test bound or wait on the real
condition; never retries/skips). Tonight these blocked several commits when ~10 agents ran suites.

---

## Post-ship checks: the new pre-commit gates from the 2026-10-13 overnight batch fire on a real commit

**ID:** INBOX-174
**Date:** 2026-10-13
**Status:** proposed
**due:** week

Every worktree commit runs the main checkout's `pre-commit-checks.sh` (worktree-setup.md, "The commit
hook is main's"), so the gates added on these branches were proven only by extracting their section
and running it against a real index — never by a real commit. After each ships, from a disposable
worktree, stage a must-fail input and confirm a real `git commit` is refused (then discard the branch):

- P1474 §4.5b kanban typecheck — stage a TS2322 in `tools/kanban/lib/*.ts`.
- P1102 §14.97 grant-order gate — stage a migration re-granting a function an earlier one revoked.
- P1473 client-safety gate — stage a migration with an unannotated `DROP FUNCTION`.
- P1009 §13e SINGLE-VALUE canary — stage a doc with two dated leads under one marker.
- P1472 agent-skills sync gate — (if shipped) move `scripts/sync-agent-skills.sh` aside.

Observed 2026-10-14: a probe commit staging a kanban type error on P1474's own branch was accepted,
exactly as the doc predicts. Delete each line once its real-commit refusal is observed.

---

## Worktree dev origins w9+ are missing from the edge-function CORS regex and the GCS bucket CORS list

**ID:** INBOX-175
**Date:** 2026-10-13
**Status:** proposed
**due:** week

Found by /finish on P1480 (2026-10-14), which made `scripts/lib/worktree-port.mjs` the single source
for worktree dev ports (w10 now 6050). Two hand-typed copies of the port range remain and were left
out of P1480 because both need a deploy/infra step:

1. `supabase/functions/_shared/cors.ts:5` — `DEV_ORIGIN_RE` allows 5001 and 5100–5899 only, so a dev
   server on w9 (5900) or w10 (6050) gets the prod origin back and the browser blocks every edge
   function call. Pre-existing for w9. Fix: cover the real ports (derive from the .mjs in a test if
   Deno cannot import it), add cors.test.ts cases, redeploy the shared functions.
2. `scripts/gcs-cors.json:5-12` — bucket CORS origins cover 5001–5700; w8+ and named worktrees are
   absent, so GCS uploads fail there. Needs the bucket CORS re-applied after editing.

A drift test asserting both lists cover every port `worktree-port.mjs` yields would stop it recurring.

---

## No check runs on migrations after /ship cherry-picks them together (P1102 grant-order gate scope)

**ID:** INBOX-176
**Date:** 2026-10-13
**Status:** proposed
**due:** week

P1102's grant-order gate runs at pre-commit on a branch's own index. `/ship` lands commits with
`git cherry-pick`, which runs no hook, so a contradiction that exists only after two branches
combine (main revokes `f` at T1; a branch grants it at T2) is never checked. Found by an Opus
adversarial review of P1102 (2026-10-14) with a temp-repo probe: the hook ran 0 times; the merged
tree's `--tree` showed an UNACKNOWLEDGED transition ending in grant.

P1102 round 5 adds a whole-tree invariant that fires on the next commit touching
supabase/migrations, which narrows the window but does not close it. Close it by running
`scripts/check-migration-grant-order.py --tree --index` (or the invariant mode) after the cherry-pick
in `git-ops.sh ship`, and in CI on main. Not done in P1102 because P1198 was rewriting `ship` the
same night.

---

## Event page date line on narrow phones: end time splits from AM/PM, calendar icon centres on the wrapped block

**ID:** INBOX-177
**Date:** 2026-10-13
**Status:** proposed
**due:** month

Found by independent visual QA of P1476 (2026-10-14), pre-existing and out of that spec's scope:

1. At 320px the event date line breaks inside a time: "12:47" / "AM (UTC-7 Los Angeles)" and
   "4:00" / "AM". Keep each time token unbroken (non-breaking space before AM/PM, or nowrap per time).
2. On mobile the calendar icon is vertically centred on the 2–3 line wrapped date block, while the
   location icon top-aligns with its single line — the two rows don't match (cosmetic).

Screenshots: P1476's `test-results/p1476/*-r2.png` (local, w1 — gone once the worktree is reclaimed;
recapture via /verify on any in-person event at 320px). Component: `src/app/prototypes/events/components/EventDetail.tsx` (~:900-910).

---

## p1434 tonight's-event tests fail every day 22:00-24:00 UTC and block every commit

**ID:** INBOX-178
**Date:** 2026-10-13
**Status:** proposed
**due:** week

`src/tests/p1434-tonights-event-account-switch.test.tsx` builds its fixture event at `Date.now() + 2h`
with `timezone: 'UTC'`, while the hook's pick (`pickTonightsEvent`) keeps only an event that is
"tonight" in its own timezone. From 22:00 to 24:00 UTC the +2h start lands on tomorrow's UTC date, so
both tests fail deterministically — on main too (verified 2026-10-14 05:17 +07, 2/2 failed on main and
on a branch). Because pre-commit runs the unit suite, EVERY commit in the repo is blocked for two hours
a day (it blocked an overnight-batch commit).

Fix: pin the clock (`vi.useFakeTimers({ toFake: ['Date'] })` + `vi.setSystemTime` at a fixed midday UTC)
or build the fixture at a fixed offset inside the same UTC day; add a case at 23:30 UTC that would
have failed. Test-only; no product change. Same family as INBOX-142 (midnight refetch).

---

<!-- cleared by /day 2026-10-15: "New Sentry issue: SecurityError request denied on /cm [day:e433904b]", check cp.sentry ran and reported ok -->

<!-- cleared by /day 2026-10-15: "New Sentry issue: Minified error kr on /cm [day:e338c2c1]", check cp.sentry ran and reported ok -->

<!-- cleared by /day 2026-10-15: "New Sentry issue: Service worker registration denied on /cm [day:a94d2ce6]", check cp.sentry ran and reported ok -->

<!-- cleared by /day 2026-10-15: "New Sentry issue: Service worker script fetch failed on /events [day:093dfbc7]", check cp.sentry ran and reported ok -->

<!-- Resolved 2026-10-16: "Deploy drift detected on prod" — see decisions.md 2026-10-16 [process] -->

## Fix the screenshot-before-re-edit hook blocking subagents

**ID:** INBOX-184
**Date:** 2026-10-16
**Status:** proposed
**due:** week

Diagnosed 2026-10-15 and confirmed by replaying real transcripts: inside a subagent the PreToolUse hook receives the parent session's transcript, so a founder complaint in the parent arms the block and the subagent's own screenshots (its own subagents transcript) can never clear it. Proposed fix, awaiting the founder's yes: arm only from the parent, also accept screenshot evidence from the subagent's own transcript after the complaint (fall back to today's behaviour if that file is absent), and stop teammate messages from arming it; open founder call: should a complaint inside pasted text still arm it? Droppable if the hook is retired or Claude Code starts passing the subagent transcript itself.

---

## inbox.sh run in a worktree writes to the main checkout's inbox store

**ID:** INBOX-185
**Date:** 2026-10-16
**Status:** proposed
**due:** week

During the first rotating inbox review (2026-10-16), inbox.sh annotate and delete run inside an agent worktree edited the main checkout's docs/process-learnings.md, not the worktree copy; the edits had to be reverted by hand. Suspect tools/kanban/inbox-cli.ts resolves the store via the git common dir despite INBOX_PROJECT_ROOT. Done when a worktree run edits only the worktree copy (with a test); droppable if inbox writes are moved to main-only by design.

---

## Reconcile the use-case landings with /hospitals (norm wording, norm path, shared helpers)

**ID:** INBOX-186
**Date:** 2026-10-16
**Status:** proposed
**due:** week

Founder asked (P1506 redesign round) whether the other landings need updating once /hospitals ships. Decide, via /create-spec: (1) the norm wording, /hospitals says "make it normal to ask how well we understand each other" while /builders says "make it normal to admit I don't understand"; (2) whether the five-step "how revealing gaps becomes a team norm" path should replace or sit beside HowPlatformWorks on /builders and /hiring; (3) extracting the Reveal / CountUpPercent / RefSup helpers now duplicated in three landing files. Done when a spec exists or the founder drops it.

---

## requires-frontend must be repointed by hand after every cherry-pick

**ID:** INBOX-187
**Date:** 2026-10-16
**Status:** proposed
**due:** week

A migration's `-- requires-frontend: <sha>` names the client commit on the feature branch; `/ship` cherry-picks, so main carries a different SHA and the annotation points at a commit main does not contain. It was repointed by hand four times in the 2026-10-14 batch (e.g. `1a0f489fa p1493: repoint requires-frontend ... (P1106)`). Proposed fix: have `git-ops.sh ship` rewrite the annotation to the landed SHA from its own journal (source_sha : landed_sha), in the same close commit, and fail loudly when a named SHA is not in the journal.

---

## A kanban vite run inside a worktree creates a real tools/kanban/node_modules that blocks the dependency symlink

**ID:** INBOX-188
**Date:** 2026-10-16
**Status:** proposed
**due:** week

vite's `cacheDir` is `node_modules/.vite-<port>` (tools/kanban/vite.config.ts). Started from a worktree whose `tools/kanban/node_modules` is absent, it creates a real directory there; a later `ln -s` then lands inside it, and pre-commit's "Kanban typecheck" blocks with "node_modules is missing" (P1507, 2026-10-16). Proposed fix: `setup-worktree.sh` creates the tools/kanban/node_modules symlink the pre-commit check already tells agents to make, or move cacheDir outside node_modules.

---

## Events with a linked transcription room cannot be deleted

**ID:** INBOX-189
**Date:** 2026-10-17
**Status:** proposed
**due:** week

Found in the P1509 v16 seed review, outside its scope. transcribe_rooms.event_id is REFERENCES events ON DELETE SET NULL (migration 20260823190000_p1149_transcribe_room_tables.sql, line 35), but the BEFORE UPDATE trigger transcribe_rooms_guard_immutable_columns (20260824000000_p1149_room_end_policy_column_guard.sql) raises on any event_id change, so the FK's SET NULL action errors and the event delete fails, on every delete path including prod. Fix options: let the trigger accept NEW.event_id IS NULL when pg_trigger_depth() > 1 (a cascade), or choose CASCADE or RESTRICT deliberately. Route: /create-bug then /fix. Droppable if events are never deleted by design (then make the FK RESTRICT and say so).

---

## read-ops-email.mjs marks mail read even without --mark-read

**ID:** INBOX-190
**Date:** 2026-10-19
**Status:** proposed
**due:** week

2026-10-19 (/day follow-up). Every FETCH in `scripts/read-ops-email.mjs` uses `BODY[...]`, not `BODY.PEEK[...]` (lines 86, 90, 108-110). Under IMAP that sets the Seen flag, so a plain `--unread` listing clears the unread state it reports, and `--mark-read` is a no-op distinction. Likely why the 2026-10-19 weekly saw 5 unread and an hour later there were 0. Fix: switch the three fetches to BODY.PEEK and let only `--mark-read` set the flag; add a test that `--unread` twice returns the same count. Done when listing twice in a row shows the same unread set.

---

## Efficiency scanner counts parallel tool calls as sequential, and compares unequal windows

**ID:** INBOX-191
**Date:** 2026-10-19
**Status:** proposed
**due:** month

2026-10-19 (/day follow-up). `scripts/scan-transcript-efficiency.py` builds one event per transcript record (lines 182-197). Claude Code writes each parallel tool_use of a single turn as its own record, so P3 flags already-parallel calls: in 3 hotlist sessions, 54/139, 60/311 and 28/153 consecutive read-only record pairs shared one API message id. Its spot-check sample is dominated by sub-second Read->Read pairs, the same shape. Separately the week-over-week table compared a 7-day/89-session baseline to a 12-day/144-session run; per session P3 was flat (2.94 -> 2.89). Fix: merge records by message.id before P3/P1, and print per-session rates or refuse unequal windows. Done when a re-run shows the merged count and per-session columns.

---

## P1509/P1512 persona test password trips the history secret scan

**ID:** INBOX-192
**Date:** 2026-10-19
**Status:** proposed
**due:** week

2026-10-19 (/day follow-up). `audit-secrets-history.sh` reports 1 leak: hardcoded-password-assignment in `src/app/prototypes/clarity-chat-v16/personas.ts` (commit 4c708057, branch feature/p1509-clarity-chat-v12, not pushed). Classified: deliberate test-only password for `.invalid` persona accounts on the TEST project, same model as the e2e test password; no rotation needed. Fix belongs on that branch before it ships: path-scoped `.gitleaks.toml` allowlist for the personas file (or commit-scoped, as for e8f3e391), so the weekly scan reads clean. Done when the history scan exits 0 or this commit is allowlisted.

---

## verify-prod-p886-auth test A: no navigation landmark on prod

**ID:** INBOX-193
**Date:** 2026-10-19
**Status:** proposed
**due:** week

e2e/verify-prod-p886-auth.spec.ts test A fails against prod: getByRole('navigation') is not found for a signed-in user, though the page renders the story feed. Reproduced 2026-10-19 with main's unmodified spec, so it is UI drift, not an auth failure. Done when the header exposes a navigation landmark again or the test's positive gate targets what the header renders now; droppable if that spec is retired.

---

## Fix pre-existing phone/desktop visual defects on live pages found during P1512 visual QA

**ID:** INBOX-194
**Date:** 2026-10-19
**Status:** proposed
**due:** week

Found by the P1512 screenshot review; not caused by P1512 (its diff touches none of these pages, and its spec forbids changing live pages). (1) /letters at 320px: the New Draft button is cut off at the right edge (the page lays out about 362px wide from a no-wrap button), flush at 375. (2) /story/:id at 320: the footer action row overflows the card (share icon over the border, external-link action missing, "0 points" wraps); author name centered against left-aligned meta. (3) /feed at 320: an orphaned middle dot in the story header, "Points (1)" touching "Newest", search placeholder cut; the Next event widget takes about 300px above the feed on phones. (4) Phone touch targets under 40px: Add a story / Add a point pills, edit/trash/share icons, Back link, topic stars, Details buttons. (5) /agreements/new/create: low-contrast placeholder and blue headings that are not actions. (6) Desktop page titles shift position and width between Events, Groups, Letters and Partners; Partners shows a Back link on a top-level page. (7) /live at 320: End Session overflows by about 5px (p1323 AC-9 fails the same before P1512). Each is its own small proposal per P1512 founder decision 1. Droppable per item once a 320/375 screenshot shows it fixed or the page is redesigned.

---

## deploy-functions.sh --env prod cannot find .env.prod from a worktree

**ID:** INBOX-195
**Date:** 2026-10-20
**Status:** proposed
**due:** week

The script's fallback for a missing .env.prod is dirname of its own scripts directory, but scripts/ is a native checkout in every worktree, so the fallback resolves to the worktree and fails. Seen 2026-10-20 deploying a new function to prod; worked around with a temporary symlink. Done when the fallback resolves the main checkout from git's common dir; droppable if prod deploys move off this script.

---

## Live pages: more pre-existing visual defects found by P1512 round-2 visual QA

**ID:** INBOX-196
**Date:** 2026-10-20
**Status:** proposed
**due:** week

Found by a screenshot-only visual QA pass on P1512 round 2; each predates P1512 (round 2 changed only the title row of these pages) and adds to INBOX-194: (1) /groups at 375 and 320: the "You're a member" pill overlaps the group card title, which breaks one word per line with an orphaned dot at 320; (2) /letters on phone: the letter title, the only unique text in a row, is truncated, and the date reads "Oct 6 ago"; "0 of 1 steps" is not singular; three filled blue buttons per view; (3) /events/list: cancelled events are listed under Upcoming, dimmed to about 3:1 contrast; (4) the "You're Hosting" badge is green but is a status, not a success state; (5) three different tab styles across Feed, Events and Letters; (6) feed card overflow button about 20px, under the 40px target; (7) overlapping avatar stacks clip their initials, and white initials on light-blue avatars are about 3:1. Each fix is a separate small proposal; droppable once each is fixed or rejected.

---

## Give frontend-coupled migrations a marker that survives /ship

**ID:** INBOX-197
**Date:** 2026-10-20
**Status:** proposed
**due:** month

A requires-frontend sha marker points at the branch commit, but /ship cherry-picks onto main, so the commit gets a new sha and the marker can never become an ancestor of origin/main; authors fall back to client-safe plus a checklist (decisions.md 2026 entry on the trust-column accessor, and again 2026-10-20). Done when a coupling marker names something stable across the cherry-pick (a P-number, or a file the frontend must contain) and migrate.sh checks it; droppable if frontend-coupled migrations stay rare.

---

## Decide whether the canvas position spread belongs on /feed and /stake cards

**ID:** INBOX-198
**Date:** 2026-10-20
**Status:** proposed
**due:** month

P1508 round 5 (D11) kept the seven-bar neutral spread and the "Contested" mark to the canvas cards and the point page's position block, because feed cards already show counts on their position buttons. After the canvas event, check whether people used the spread on the canvas and on /point/:id; add it to feed cards only if they did. Drop this if the spread goes unused or the canvas is retired.

---

## Infra changes since the last run have no KDD capture [day:bb605dec]

**ID:** INBOX-199
**Date:** 2026-10-20
**Status:** proposed
**due:** month

Found by /day on 2026-10-20 (check: cp.reflect, severity: low).

79d82b41f (feat login account check via check-login-email) touched docs/technical, scripts/ and supabase/functions. git log --since SINCE -- docs/decisions.md is empty.

---

## Every page polls letter shortcodes and events every few seconds

**ID:** INBOX-200
**Date:** 2026-10-20
**Status:** proposed
**due:** week

Measured on the live site and on localhost (signed out, /feed, 20s after the page settled): resolve_letter_shortcode is called about every 2.5s, events about every 5s, and on the live site get_letter_for_public_reading about every 2.5s too; signed in, the feed also refetches stories, points and point_positions about every 4s. The page therefore never goes network-idle, which costs phone battery and database load and makes every e2e that waits for networkidle time out (found while triaging P1512 e2e). Find the pollers (likely a letter-shortcode resolver and the events widget), switch them to on-focus or Realtime, and drop this once a 20s idle window shows no repeating requests.

---

## Check Supabase org quota before 11 Nov restriction

**ID:** INBOX-201
**Date:** 2026-10-20
**Status:** proposed
**due:** week

Around 5 Nov open the Supabase usage page for the production organisation. If it still shows over quota (grace period from the Sep-Oct cycle), upgrade to Pro (about 35 USD/month with two projects, 25 with one) before 11 Nov, or production requests start returning 402. Droppable once the usage page shows the organisation within its limits.

---

## P1512 follow-up: Clarify in flight while switching chats

**ID:** INBOX-202
**Date:** 2026-10-20
**Status:** proposed
**due:** week

From the third P1512 review round: switching chats while a Clarify is still sending can apply its follow-up (attachment send, reload) to the newly opened chat; a stalled reload keeps Send disabled; a Clarify staged during another's send is cleared when the first lands; a failed send can overwrite a newer draft. Fix with a test per case, guarded by the submitting conversation id. Droppable if P1512 is reworked so ConversationPane remounts per conversation.

---

## Finish and verify the P1522 test-user purge

**ID:** INBOX-204
**Date:** 2026-10-20
**Status:** proposed
**due:** week

P1522 shipped before its test-user purge finished (founder call, so the egress fix reached production sooner). The purge of ~19,400 leftover e2e users on the test project runs in batches. Done when the e2e-namespace user count older than 24h is near zero (dry run of scripts/sweep-e2e-test-users.ts) and one full e2e run leaves the count unchanged within the teardown batch; record both counts in the P1522 spec. Droppable never: without the check, a regression in cleanup goes unseen.

---

## Edge function CORS rejects the w9 and w10 dev servers (ports 5900, 6050)

**ID:** INBOX-205
**Date:** 2026-10-20
**Status:** proposed
**due:** week

supabase/functions/_shared/cors.ts DEV_ORIGIN_RE accepts 5001, 5100-5799 and 5800-5899, but scripts/lib/worktree-port.mjs gives w9 port 5900 and w10 port 6050, so every edge function call from those worktrees' dev servers fails its CORS preflight (found by P1520's e2e from w9: the mirror reads as off locally). Fix: accept every port the worktree scheme can produce, with a test that derives the ports from worktree-port.mjs (gate 7e). Droppable if worktrees stop going past w8.

---

<!-- cleared by /day 2026-10-24: "Sentry: Error invoking postMessage, Java object is gone, on the Social Hike event page [day:d0e2fed3]", check cp.sentry ran and reported ok -->

## /status: end with safe-to-close verdict and continue/compact/fresh recommendation

**ID:** INBOX-208
**Date:** 2026-10-21
**Status:** proposed
**due:** week

Founder approved 2026-10-21. /status ends with one line, "safe to close" or "not safe: <reasons>", computed from git status of this session's worktrees, unanswered questions and unmet ACs. The same block recommends continue, compact, or a fresh session, judged on context size and whether the context is still valuable; for a fresh session it prints a paste-ready hand-off prompt (branch, spec, next step, open decisions). No separate /handoff skill. Droppable if /status already does both.

---

## Delete the 9 old agent-avatar PNGs from Supabase Storage after a clean week (P1528)

**ID:** INBOX-209
**Date:** 2026-10-21
**Status:** proposed
**due:** week

P1528 moved prod agent avatars to the public media host on 2026-10-21 and left the originals in the agent-avatars Supabase bucket as the rollback target. After 2026-10-28, if no rollback was needed, delete them (prod storage delete: ask the founder first). Once deleted, the P1528 script's --rollback refuses by design (old URL no longer an image). Also decide whether the agent-avatars bucket and its P1135 upload policies should be dropped.

---

## Revisit: gate prod one-off scripts' recovery paths before the first prod --apply

**ID:** INBOX-210
**Date:** 2026-10-21
**Status:** proposed
**due:** month

UNTESTED, from the P1528 KDD. P1528's backfill wrote 9 prod rows before /finish found its apply was not resumable and its rollback was unsafe (fixed after). The lesson is recorded only as intent in decisions.md 2026-10-21 (P1528). Falsifier/trigger: if a second prod-write script reaches --apply on prod missing resume, idempotent re-run, or safe rollback, add a dev.md pre-apply step requiring those (stubs ok) reviewed before the first prod write.

---

<!-- Dropped 2026-10-21: not needed, the test project is being rebuilt as a new project (P1530) and the old one paused, so its leftover e2e users stop costing anything. -->

## p402 and p407 e2e specs fail on main (7 tests)

**ID:** INBOX-212
**Date:** 2026-10-21
**Status:** proposed
**due:** week

Found by P1532's regression sample (2026-10-21): e2e/p402-points-tab.spec.ts fails 4 tests (three 30 s timeouts, one missing position badge) and e2e/p407-story-detail-points.spec.ts fails 3 (the Add Point button never becomes visible or enabled). Main with unchanged helpers fails the same 7, and the P1532 branch fails the same set with its user pool on and off, so the cause is not cleanup. Done when both files pass on main or their tests are repaired; droppable if either feature is retired. speak-freely-button.spec.ts failed too (7 tests, waitForDBPresence joiner_name timeouts); that is the selector drift already in this inbox.

---

## /reproduce's vitest canary blocks every commit from the main checkout

**ID:** INBOX-213
**Date:** 2026-10-21
**Status:** proposed
**due:** week

/reproduce leaves the deliberately failing src/tests/pN-*.test.ts canary uncommitted in main's working tree for /fix to pick up. But pre-commit-checks runs npm test against the working tree, so the next commit from main fails on that canary, including /reproduce's own spec commit (hit on P1532; worked around by moving the file out until the fix worktree existed). Proposed fix: /reproduce writes the vitest canary to the session scratchpad and /fix copies it into the claimed worktree. Done when the /reproduce and /fix skill text match that handoff; droppable if vitest canaries move into the fix branch some other way.

---

## App retries organization/events reads several times during a Supabase outage

**ID:** INBOX-214
**Date:** 2026-10-21
**Status:** proposed
**due:** month

Under a simulated outage (scripts/measure-idle-requests.mjs --block /rest/v1/, /feed, 1 minute, 2026-10-21) the page sent GET rest:organization 5 times and rest:events 4 times. Check those retry paths against docs/technical/metered-services.md rule 4 (bounded, with backoff and jitter, and carrying a request-volume assertion). Done when each path is shown bounded, or fixed; droppable if the retries turn out to be distinct callers rather than retries.

---

## Decide which prepare/close recipe a second organizer's events get

**ID:** INBOX-215
**Date:** 2026-10-22
**Status:** proposed
**due:** month

Today (P1542) any event without a series recipe gets the Clarity Night recipe, and the enable-prepare toggle makes that full preparation a required room gate. Fine while the founder is the only host. Do this when another organizer actually hosts; drop it if no second organizer appears.

---

## Revisit branch feature/p1390-letter-review-proto when the mirror agent supports letters

**ID:** INBOX-216
**Date:** 2026-10-22
**Status:** proposed
**due:** month

The branch holds 12 commits of letter-chat and letter-review prototypes. They were committed under the P1390 label, but P1390's spec is about room audio filling /live, so the two are unrelated. The branch has no worktree and is kept. Revisit it when the mirror agent (P1437) is extended to support letters; related to the P1431 letter chat. Droppable if P1437 settles on a different letter surface.

---

## Test project API times out reloading its schema after every migration

**ID:** INBOX-218
**Date:** 2026-10-22
**Status:** proposed
**due:** week

After the P1546 migration the test project's REST API answered 503 (schema cache) for about an hour, and again after a re-apply; its schema-cache queries took up to 6.3 s against an 8 s role timeout. Measure one reload on a quiet project, then choose larger compute or a smaller reload; see decisions.md 2026-10-22 [process] "The test project's API falls over on schema reload". Drop it if the next two migrations apply without an outage. Re-run the p1512 read/write and p1520 canaries once it is healthy (they never reached an assertion during P1546).

---

## Edge-function CORS accepts dev ports for every worktree slot (w11+)

**ID:** INBOX-219
**Date:** 2026-10-22
**Status:** proposed
**due:** week

supabase/functions/_shared/cors.ts DEV_ORIGIN_RE accepts only 5001, 5100-5999 and 6050, but slots w11+ get 5000+N*100 (w14 = 6400), so every function call from those slots is CORS-blocked and e2e/p1300-terms-popup.spec.ts smoke fails on console errors. Extend the regex and src/tests/inbox205-cors-dev-ports.test.ts to every port scripts/lib/worktree-port.mjs hands out, then redeploy. Droppable if slots above w10 are retired. Found in P1544 QA, 2026-10-22.

---

## Fix p1512-chat-live smoke: group General channel missing from the chat list

**ID:** INBOX-220
**Date:** 2026-10-23
**Status:** proposed
**due:** week

e2e/p1512-chat-live.spec.ts fails at line 198 on main: the group's General channel row never appears in user A's chat list, so the 14 serial tests after the smoke never run. Reproduced 2026-10-23 with main's app code (control run during P1554); P1543 (one community, online group hidden) is the first suspect. Fix via /reproduce then /fix; done when the file runs green, droppable if the file is retired. Until then the two P1554 Rename steps in that file (now via the About window) are unexercised.

---

<!-- Resolved 2026-10-25: "Mirror engine fires one request after it unmounts" — fixed in P1564 -->

## Visual nits on the canvas panel at 320px (from P1535 visual QA)

**ID:** INBOX-222
**Date:** 2026-10-23
**Status:** proposed
**due:** month

From the P1535 visual QA, 2026-10-24: the owner name in the panel owner row truncates at 320px ('P1535 ...'); filter tabs Disagree/Unsure/Agree cramped with ~30px tap targets; Next button ~28px tall at 320. Pre-existing except the owner row, which P1535 moved above the card.

---

## create-spec tells authors to put post-merge-only steps in the Pre-deploy Checklist, which ship gate 3.5 then blocks forever

**ID:** INBOX-224
**Date:** 2026-10-26
**Status:** proposed
**due:** week

create-spec SKILL.md (Done-When section, "[post-deploy] is a CLAUSE") says a criterion with no pre-deploy half "is a deploy step: put it in ## Pre-deploy Checklist, which gate 3.5 owns". Gate 3.5 fails on any unticked box there, and a step that needs the merged code (push, redeploy, image rebuild, prod smoke) cannot be ticked before the merge. Hit on 2026-10-26: five such items blocked /ship until moved to a "Post-deploy verification" section, the convention 15 shipped specs already use. Fix: point that sentence at a Post-deploy verification section (not gated by /ship), keep Pre-deploy Checklist for steps applied before the merge. Skill file edit, lands on main.

---

## Alert workflows copied from edge-smoke.yml lack GH_REPO, persist-credentials: false and a concurrency group

**ID:** INBOX-225
**Date:** 2026-10-26
**Status:** proposed
**due:** month

P1567 (2026-10-26) found by Codex probe that an alert step whose gh calls infer the repo from the checkout cannot alert when the checkout failed, and that overlapping runs duplicate issues. edge-smoke.yml has none of GH_REPO, persist-credentials: false, concurrency. Check every .github/workflows file with `issues: write` and apply the P1567 fixes (decisions.md 2026-10-26 [technical]).

---

## Button rule breaks found by the P1568 visual sweep (pre-existing)

**ID:** INBOX-226
**Date:** 2026-10-26
**Status:** proposed
**due:** week

Three button problems already on main, seen in the P1568 screenshot sweep, not caused by it. Settings shows a disabled blue Save Changes with No changes to save in the initial state (dead control, P955 rule), and at 320 the hint wraps under it. The top-bar Tools button is a tinted bordered button that matches no button rule and outweighs the page's real primary on Events and Live. On Live at phone width, Join next to the code input reads as plain gray text, not a button. Done when each follows the Button Decision Rules in docs/design-system.md; droppable if those pages are redesigned.

---

## pre-commit ESLint step re-stages working-tree content after --fix

**ID:** INBOX-227
**Date:** 2026-10-26
**Status:** proposed
**due:** week

scripts/pre-commit-checks.sh section 2 runs `eslint --fix` on staged files and then `git add`s them, which stages the WORKING TREE copy, including any unstaged edit (a co-tenant's or your own) in those files. Same class as P1279. Found while building P1566, deferred there by its spec. Done when the fix runs on index blobs or the re-stage is removed; droppable if commits move entirely to worktrees.

---

## p1512-shell test fails under CPU load

**ID:** INBOX-228
**Date:** 2026-10-26
**Status:** proposed
**due:** week

src/tests/p1512-shell.test.tsx ("signed out, the public menu is exactly as before") failed once in a pre-commit run while the machine was busy with other node jobs, and passed on the run before. Likely a timing-sensitive wait. Done when it is made deterministic; droppable if it does not recur in a month of hook runs.

---

## three different time-ago formats in the UI; the shared helper lives in a mock file

**ID:** INBOX-229
**Date:** 2026-10-26
**Status:** proposed
**due:** month

Relative times render differently by page: formatRelativeTime (src/lib/utils.ts, "5m ago"), formatTimeAgo (src/app/utils/format-time.ts, "5m"), and a "Today / Yesterday / 3d ago" helper copied three times (feed-story-card, StoryCardDetail, and exported from src/app/data/mock-profile-data.ts). Found by the P1566 duplicates trial. Done when one format is chosen (a founder call) and one helper serves it; droppable if the differing formats are intended.

---

## landing-v4.tsx imports two prototype modules that do not exist

**ID:** INBOX-230
**Date:** 2026-10-26
**Status:** proposed
**due:** month

src/app/pages/landing-v4.tsx imports @/app/prototypes/shared/types and @/app/prototypes/linkedin-like/components/shared; neither path exists. Found by the P1566 import-graph trial. Done when the imports are fixed or the page is deleted; droppable if the page is already unreachable dead code and is removed by other cleanup.

---

## Check Gemini's mirror-provider findings (unverified)

**ID:** INBOX-231
**Date:** 2026-10-26
**Status:** proposed
**due:** week

A whole-file Gemini 4 Argon read of src/app/pages/chat/mirror-provider.tsx on 2026-10-26 (an older copy, before P1564) claimed 1 HIGH and 3 MEDIUM. HIGH: switching accounts without a reload can carry the previous user's mirror state and in-flight loads across. MEDIUM: status loads requested before the availability check are dropped; loadStatuses resets the staleness clock of running jobs; New portrait releases its lock while a job is still running. None was verified against current main. Done when each is confirmed with a failing test and filed, or disproved; droppable if the provider is rewritten.

---

## Flaky under load: P1554 jump-down button test in p1512-chat-ui

**ID:** INBOX-232
**Date:** 2026-10-26
**Status:** proposed
**due:** week

`src/tests/p1512-chat-ui.test.tsx` "P1554: a window resized while scrolled up re-decides the jump-down button" times out at `findByTestId('jump-down')` (~line 1271) about 2 in 80 runs under the P1573 stress method (22 CPU burners + 8 concurrent runs). It passes alone. This is unlike P1570/P1573: the failure is inside an async wait, so it is not a synchronous-query race and not the test timeout. Unconfirmed hypothesis: `MessageList.tsx`'s ResizeObserver effect depends on `[status, measure]`, so the stubbed observer's callback list may be empty when the test fires the resize. Next: confirm by logging the stub's registered callbacks at fire time under stress, then fix the wait on the observer registration, not on a timeout. Found by P1573.

## Pre-commit privacy spend scan passes silently in a worktree that is behind main

**ID:** INBOX-234
**Date:** 2026-10-26
**Status:** proposed
**due:** week

The installed hook is main's pre-commit-checks.sh, but it sources scripts/lib/privacy-figure-scan.sh from the committing worktree's toplevel. A worktree behind main lacks privacy_spend_scan, the call fails with "command not found", and `|| true` turns that into a green check (seen 2026-10-26 committing P1566 from a worktree 51 commits behind). Done when the hook sources its libs from its own location or fails closed on a missing function; droppable if hooks stop sourcing worktree-relative libs.

---

## Show a point's author on its details page once owners can supersede via the mirror

**ID:** INBOX-235
**Date:** 2026-10-26
**Status:** proposed
**due:** month

P1536 lets the mirror link a reworded canvas point to its predecessor (supersede) at Publish. Authorship is what grants that right to redirect readers, so readers should be able to see who did it: add "First posted by ..." on the point details page when owner supersede ships. Founder 2026-10-26: not now, later. Not needed while only the founder supersedes.

---

## Run the self-hosted test server's reachability and certificate checks on a schedule

**ID:** INBOX-236
**Date:** 2026-10-27
**Status:** proposed
**due:** week

P1557. scripts/selfhosted/health.sh checks reachability and certificate over public HTTPS, no credentials. Move those two into a scheduled GitHub workflow that opens an issue on failure. Until then /day's cp.selfhosted check reads them, a knowing stopgap per .claude/rules/skills.md (recurring checks). Disk and WAL need a gcloud login no workflow holds, so they stay in /day.

---

## Fix two checks already failing on main: day registry control and decisions.md dead links

**ID:** INBOX-237
**Date:** 2026-10-27
**Status:** proposed
**due:** week

Found during P1557, not caused by it. scripts/test-p1399-day-registry.sh fails on main: "weekly/SKILL.md has no recommending line with --risk". docs/decisions.md on main has 5 dead links to the p1566 and p1575 specs, which now live under features/done/. Any branch that merges main trips the doc-link ratchet on these.

---

## Fix the p964 schema test: it signs in with a password field test users no longer have

**ID:** INBOX-238
**Date:** 2026-10-27
**Status:** proposed
**due:** week

Found during P1557, fails on hosted and self-hosted alike. e2e/integration/p964-db-schema.spec.ts signs in with caller.password, but TestUser (e2e/helpers/test-user.ts) has no password field, so the sign-in silently fails and the RPC runs as anon: "permission denied for function get_letter_position_stories". Grants are correct (authenticated may execute). A test change, so it needs the founder's OK (tests.md). Likely fix: sign in with TEST_PASSWORD and assert the sign-in succeeded.

---

## Spec: keep processed canvas material after Publish, then the talking canvas

**ID:** INBOX-239
**Date:** 2026-10-27
**Status:** proposed
**due:** month

Founder ask from P1536: keep each owner's processed canvas material (text extracted from uploads and links, never the files) privately after Publish, so later canvas versions reason over everything they gave. Later step: the canvas becomes an agent that explains itself to readers and onboards them. P1536 deletes the extracted text at Publish today; its retention hook carries the founder-decision marker. Done when a spec exists via /create-spec; droppable if the founder decides material should never outlive a draft.

---

## Investigate flaky _shared/banner-small.test.ts

**ID:** INBOX-240
**Date:** 2026-10-27
**Status:** proposed
**due:** week

supabase/functions/_shared/banner-small.test.ts failed 4 tests in 1 of 9 full Deno runs during P1576 (2026-10-27); the P1576 branch never touched that file. Done when the flake is reproduced and fixed, or shown to be environment-only and the test made deterministic.

---

## Room shows a false You're offline when the access-check chain is slow

**ID:** INBOX-241
**Date:** 2026-10-27
**Status:** proposed
**due:** week

A cold event room load runs the gate's access reads one after another under a single 4.5s uncached deadline (UNCACHED_DEADLINE_MS in offline-read-cache.ts). On a slow network the whole chain passes the deadline, the page shows You're offline for about 0.4s, then retries with a fresh loader (seen in P1562 frame sampling with REST held 0.7 to 1.5s; an unheld TEST load took about 4.7s to reach /meet). Options: a per-request deadline, or keep the loader up while the chain is still getting answers. Fold into the app-wide loading spec; drop if that spec covers it.

---

## Ship teardown should honour holds and pin a recovery ref before removing a slot

**ID:** INBOX-242
**Date:** 2026-10-27
**Status:** proposed
**due:** week

From the P1450 final review (2026-10-27): the shared teardown used by ship, park and archive-spec ignores a valid hold, writes no recovery record before removing a slot, and a forced removal blocked by ignored output can leave a half-deleted slot with its bookkeeping gone. Align it with the P1450 tidy invariants. Droppable if teardown is replaced by the tidy removal path.

---

## Hosted TEST function deploys refused by a secrets check that names nothing

**ID:** INBOX-243
**Date:** 2026-10-28
**Status:** proposed
**due:** week

Found during P1557. ./scripts/check-edge-function-secrets.sh --env test exits 1 with "FAIL: required edge function secrets missing" and an EMPTY list. The token it uses works (Management API secrets and functions endpoints answer 200), so this is the check, not the credential. Effect: ./scripts/deploy-functions.sh refuses every hosted TEST deploy, and the P1557 two-target deploy stops before the self-hosted half. Workaround: scripts/selfhosted/deploy-functions.sh deploys the self-hosted server directly.

---

## Clear the 20 integration tests that fail on the self-hosted TEST server (P1557 follow-up)

**ID:** INBOX-244
**Date:** 2026-10-28
**Status:** proposed
**due:** week

After Mailgun was restored on 2026-10-28, 20 integration tests still fail on the self-hosted TEST server; none is a server defect (evidence: .private/archive/p1557/rerun-mailgun.json). (a) 9 needed the storage or AI key then kept off the test server (reversed: decisions.md 2026-10-29, "Self-hosted TEST now holds AI and storage credentials"; those keys are on it now, so re-run these): the edge-fn-authz-regression banner, upload and playback 403 cases, the p1223 participant forward step, and the p1544 mirror-reply case; those functions check config before auth, so decide whether such tests skip when the key is absent or the functions authorize first. (b) 6 in p1275-create-transcribe-room-rpc call create_transcribe_room without p_consent, a signature migration 20260909100000 dropped; they pass on hosted only through a stale overload there (hosted schema drift). (c) the p1178-reproduce canary expects create-and-sign to seal and send the accepted email, which it no longer does. (d) p630-system-tags-migration scans every point and trips on rows other tests left. (e) 2 edge-fn-authz cases get the right 401 with the self-hosted router's body rather than the hosted gateway's, and enqueue-transcription sent with only the anon header (no Authorization) is refused by the router where hosted lets it through; decide whether supabase/selfhosted/functions-main/index.ts should mirror hosted's fallback to that header. Droppable once each group is fixed or deliberately skipped, or if TEST goes back to hosted.

---

## Review WhatsApp-only hike transport after the next 15+ hike

**ID:** INBOX-245
**Date:** 2026-10-28
**Status:** proposed
**due:** month

After the next social hike with more than 15 people, review whether WhatsApp-only transport (a transport lead per hike plus the private driver list) worked. If people still got stuck, reconsider an in-app ride question next to the recording question on the prepare page (it would overturn P1542 decision 1).

Parked hike ideas from the same 2026-10-28 conversation, unchanged: buddy matching, fun roles growing into Clarity champions, mirroring WhatsApp into Clarity Chat, multi-day hikes and exporting the format to other cities, an agent running hike coordination. Context: P1571.

---

## Migration-applied pre-commit gate never checks the self-hosted TEST server

**ID:** INBOX-246
**Date:** 2026-10-28
**Status:** proposed
**due:** week

The pre-commit check that blocks a migration not yet on TEST reads only the hosted section of deploy-manifest.json, while e2e now runs against the self-hosted server (P1557): a migration applied only to hosted passes while self-hosted lags. The stamp script also builds its list from main's migration files, so a migration still on its feature branch cannot be stamped without a hand edit (P1583 needed one). Done when the gate checks the self-hosted ledger, or drop if the hosted server is retired.

---

## stamp-deploy-manifest.sh --help runs a real stamp

**ID:** INBOX-247
**Date:** 2026-10-28
**Status:** proposed
**due:** week

Passing --help to scripts/stamp-deploy-manifest.sh rewrote main's deploy-manifest.json (test function hashes and timestamp) instead of printing usage (2026-10-28). It should print help and touch nothing. Done when --help exits 0 with usage and leaves the manifest untouched.

---

## P1584: run the self-hosted health failure drill after the push

**ID:** INBOX-248
**Date:** 2026-10-28
**Status:** proposed
**due:** week

After P1584 is pushed, run the "Self-hosted TEST health" workflow by hand with the host input set to an unreachable name, confirm a "(drill)" issue opens, close it by hand, and confirm the next scheduled run is green. Done when both are seen; droppable if the workflow has since opened and closed a real alert on its own.

---

## Pre-commit on an older worktree fails: main's hook calls scripts the branch lacks

**ID:** INBOX-249
**Date:** 2026-10-28
**Status:** proposed
**due:** week

2026-10-28, seen committing in w9 (feature/p1559-ledger-prototype, branched before P1566). The pre-commit run is main's pre-commit-checks.sh, but it resolves scripts/quality-ratchet.cjs and scripts/check-nested-guides.cjs against the worktree root, where the older branch has neither. Result: MODULE_NOT_FOUND, two "errors", commit blocked, for a one-file prototype change. Every worktree branched before P1566 hits this until rebased. Fix idea: skip a check whose script is absent in the worktree with a visible warning, or have the hook run the worktree's own pre-commit-checks.sh. Workaround today: rebase the branch onto main (needs a clean tree, so commit first, which is what is blocked).

2026-10-29, /kdd review: the same stale base (w9 was 319 commits behind main, merge-base 2026-10-24) also explains the three earlier load-sensitive test failures in that worktree: their fixes (P1573 325a3e226, P1570 e41ab95b1) are on main, not on the branch. Prefer the second fix idea (run the worktree's own pre-commit-checks.sh): skipping an absent blocking check with a warning fails open. A "base far behind main" warning was considered and deferred; revisit on a second incident.
---

## Pre-commit: explain a missing helper as 'branch predates check — merge main'

**ID:** INBOX-250
**Date:** 2026-10-29
**Status:** proposed
**due:** month

When pre-commit-checks.sh invokes a helper missing from the committing worktree (branch cut before that check landed on main), it fails with a bare "No such file"; print "this branch predates check NAME (SCRIPT); run git merge main" instead, still failing loud (never skip). Seen 2026-10-29 with P1591's check-hosted-test-readers.sh during P1593, where the opaque failure tempted a banned hook bypass. Loading helpers from main's checkout was rejected the same day: helpers such as check-hosted-test-readers.sh derive their scan root from their own location, so they would check main's tree. Drop if new checks stop landing while branches are open.

---

## Chat list at 320px clips the Channels tab and crowds the time

**ID:** INBOX-251
**Date:** 2026-10-29
**Status:** proposed
**due:** month

At 320px the "Channels" tab is clipped to "Channel" at the right edge (the tab row neither wraps nor scrolls), and a long event title leaves about 6px before the "Now" time. Seen by visual QA during P1592 (chat-list-preview-320); it was already on main, since P1592 only changed the preview text. Done when the tab row fits or scrolls with a visible cue at 320px and the time keeps its gap; drop if the chat list tabs are redesigned first.

---

## p1512 chat UI grouping test fails between 00:00 and 01:00 local time

**ID:** INBOX-252
**Date:** 2026-10-29
**Status:** proposed
**due:** week

src/tests/p1512-chat-ui.test.tsx "renders messages with author, grouping..." dates its fixture messages about 60 minutes before Date.now(), so a run that starts just after midnight puts them across a day boundary, a date divider splits Ada's two messages, and the grouping assertion sees 3 name headers instead of 2 (seen in a full run that started at 00:58; passes alone at other hours). Fix: pin NOW to a fixed midday time (or use fake timers) so the fixtures never cross midnight. Droppable if the grouping test is rewritten without wall-clock dates.

---

## p1114 room e2e 'a rating save that fails offers the one way off the card' fails on main against the self-hosted TEST

**ID:** INBOX-253
**Date:** 2026-10-30
**Status:** proposed
**due:** week

Fails identically on main 2e946349a and on the P1542 quote-consent branch: after a forced set_room_rating 500 the re-read succeeds but reports the person as not opted in, so the "That didn't save. Try again." message never shows. Passed earlier the same day. Suspect a change to the self-hosted TEST room functions or data; confirm by capturing the get_my_room_status response. Droppable if it passes again on a fresh TEST run.

---

## Boot splash should start where the in-shell loader sits (desktop sidebar)

**ID:** INBOX-254
**Date:** 2026-10-30
**Status:** proposed
**due:** month

P1595 centred the in-shell loader on the content column, so on a signed-in desktop cold load the mark slides sideways once from the viewport-centred boot splash (about 124px with the sidebar open, 32px collapsed; phones unaffected). Make the index.html splash read the remembered sidebar state so it starts in the same place. Droppable if nobody notices the slide.

---

## Make /day stories aware of in-flight worktree work before proposing

**ID:** INBOX-255
**Date:** 2026-10-30
**Status:** proposed
**due:** week

/day story generation ignores what neighbouring worktree sessions are building or have planned, so it proposes things the founder already decided against or already has in progress (2026-10-30 story r3, "run the event room with two outside people this week"; founder: "you are not taking into account what current neighbouring sessions work on... I don't want to re-explain"). Fix: feed the story generator the live worktree branches with their spec titles, status and open Done-When, and have each story name the in-flight spec it does not contradict. Done when a /day run's stories cite in-flight specs and none of them repeats an already-decided direction.

---

## Spec: mirror agent reachable from any page (Intercom-style launcher)

**ID:** INBOX-256
**Date:** 2026-11-01
**Status:** proposed
**due:** month

Founder idea 2026-11-01 (P1536 walkthrough, W2): a launcher that opens the mirror agent from any page, built on the P1536 W1 thread panel. Needs /create-spec once W1 ships, covering mobile placement and which pages carry it. Droppable if the W1 panel plus the mirror chat prove enough in event use.

---

## Spec: event gallery serves small previews, full size only on tap

**ID:** INBOX-257
**Date:** 2026-11-01
**Status:** proposed
**due:** month

The hike gallery loads full photos into 224 px tiles. On 2026-11-01 the six largest were shrunk by hand (6.0 MB to 2.9 MB), which does not cover future uploads or the rest. Build small copies at upload, as event banners already do (P1417). A cold first load on a phone has still not been timed: measure before and after. Needs /create-spec.

---

## Spec: regenerating a profile banner can destroy a custom one with no undo

**ID:** INBOX-258
**Date:** 2026-11-01
**Status:** proposed
**due:** week

On 2026-11-01 three regenerations in about 80 seconds replaced the founder's hand-set Communication Activism banner; it was restored by hand from public/banners. Who or what triggered them is unknown. Older generated files from 14, 16 and 21 October exist, so it may have happened before. Add confirmation or undo, and find the trigger. Needs /reproduce or /create-spec.

---

## Fix three gaps in the canvas eval checker before the real-model S2 eval runs

**ID:** INBOX-259
**Date:** 2026-11-01
**Status:** proposed
**due:** week

P1536 review found three LOW gaps in the canvas eval rules: the banned-opening check does not strip the sale-role label (Pays:, Uses:, Approves:); the demographics pattern is case-sensitive, so a sentence starting with Women, Seniors or Aged is missed; the number check does not normalise thousands separators (1000 vs 1,000). Done when each has a labelled fixture and passes. Droppable if the real-model eval is retired.

---

## Run the P1536 Q1 real-model eval for Customer Segments once

**ID:** INBOX-260
**Date:** 2026-11-01
**Status:** proposed
**due:** week

The Q1 rule (a role plus two other dimensions) is proven only on labelled fixtures; the keyword checker has never judged real model output, and it can miss forms. Run the eval once on hosted TEST and read a sample by hand. Done when the result is recorded in the spec. Droppable if Q1 is rewritten.

---

## Remove the unreachable carry path from useStartCanvas

**ID:** INBOX-261
**Date:** 2026-11-01
**Status:** proposed
**due:** month

carryIntoThread in use-start-canvas.tsx and its toast copy have no caller that passes carry since New version became Clone. Grep the callers, then delete it. Droppable if a caller appears.

---

## Generalise the walk-before-UAT step in the /dev UAT gate

**ID:** INBOX-262
**Date:** 2026-11-01
**Status:** proposed
**due:** month

On P1536, walking the journeys in a real browser with a separate visual-QA subagent caught defects that every reviewer and unit test had missed, including a page stuck on skeletons until a reload and a regression that refused ordinary chat replies. Propose making the walk a default step for user-facing journeys, through the claude-md gate. Droppable if the founder prefers it per spec.

---

## Check get_canvas cost before P1536 reaches prod

**ID:** INBOX-263
**Date:** 2026-11-01
**Status:** proposed
**due:** week

During the final P1536 walk the page's canvas read hit database statement timeouts (57014) on hosted TEST under load, showing "Could not load this canvas" until a re-run. TEST is the smallest size and was busy, and the P1536 migration restates get_canvas, so it is unknown whether the read got slower. Compare the read's plan or timing before and after the migration on a canvas with several versions. Droppable if the plan is unchanged.

---

## Schedule the event group checks and prove the email audience script

**ID:** INBOX-264
**Date:** 2026-11-02
**Status:** proposed
**due:** month

Run scripts/events/group-check.py on the Mac (it needs local Beeper, so not GitHub Actions): recheck a few hours after each group send and preflight before a timed send, alerting only on failure. Run scripts/events/email-audience.sh live on the next hike, because its prod path is untested. Droppable if event group sends stop or a later run shows manual checks cost nothing.

---

## Reviewer lists founder asks that have no acceptance criterion

**ID:** INBOX-265
**Date:** 2026-11-02
**Status:** proposed
**due:** week

After each spec amendment, as a /finish specs step, one reviewer reads the founder's messages since the last spec commit and lists asks with no acceptance criterion. Advisory: the builder answers one line per ask (criterion added, declined, or escalated). Prove it first: the 2026-10-29 voice agreement against P1536's spec before S3c must be flagged, with a known-good control through the same probe. Awaiting the founder's yes from the 2026-11-02 KDD; droppable if declined there.

---

## Fixture standing in for a product path must show that path is unreachable

**ID:** INBOX-266
**Date:** 2026-11-02
**Status:** proposed
**due:** month

UNTESTED, one instance. A P1536 walkthrough fixture labelled a draft opener legacy and tagged points with the service role, while users could still reach that opener through the paperclip, so a real bug stayed hidden. Idea: a /finish reviewer asks that a FALLBACK or service-role note cite the grep showing the path is unreachable. Falsifier: a second fixture-masked reachable path, then promote to a rule; droppable if none appears by the next monthly.

---

## Ship gate 2.5 reads main's spec copy for a fix/pN branch

**ID:** INBOX-267
**Date:** 2026-11-02
**Status:** proposed
**due:** month

`scripts/ship-gates.sh` sets `feature_branch` from `feature/pN-*` only, while gate 3.8 and `git-ops.sh ship` also accept `fix/pN-*`. A `fix/` branch with a fully ticked spec is refused from the main checkout, yet passes when the gates run inside its worktree. P1599 got past this by renaming its branch. Fix: resolve the spec branch with the same patterns as `resolve_ship_branch`. Rare, since only 1 of 11 local spec branches was `fix/`.

---

## Renumber P1592's colliding migration and bring hosted TEST level

**ID:** INBOX-268
**Date:** 2026-11-02
**Status:** proposed
**due:** week

Main's 20261029180000_p1592_event_transcripts_round_threads.sql shares its version with p1542_quote_ok_click_order in hosted TEST's ledger, so P1592 never applied there and migrate.sh aborts for every session. P1536 needed P1592's three empty tables and _erase_lock_canvas_owners on hosted, added by hand; 20261030090000 is unapplied there. Done when the file is renumbered, hosted matches self-hosted, and migrate.sh runs clean. Droppable if hosted TEST is retired.

---

## p1434's tonight test fails two hours a day on main until P1536 ships

**ID:** INBOX-269
**Date:** 2026-11-02
**Status:** proposed
**due:** week

p1434-tonights-event-account-switch places an event two hours ahead, which crosses into tomorrow late in the event's zone, so it fails then and blocks commits. Its clock is pinned on the P1536 branch (1cc49ac30). If P1536 ships within the week this closes itself; otherwise pin it on main as well.

---

## Hosted TEST ran out of I/O under one night of walks and integration runs

**ID:** INBOX-270
**Date:** 2026-11-02
**Status:** proposed
**due:** week

On 2026-11-03 trivial cron jobs took a minute and REST returned 503 PGRST002 for hours after long parallel walks and integration suites. Decide between a larger compute and a load budget for overnight builds (one walk at a time, a pause between groups). Droppable if self-hosted becomes the only walk target.

---

## Subagents waiting on background runs stall silently

**ID:** INBOX-271
**Date:** 2026-11-02
**Status:** proposed
**due:** week

Agents that wait on run_in_background runs or a Monitor were not always woken, and a stale idle message read as progress: on P1536 the main session reported work running for an hour while nothing ran. Decide whether /dev and the shared brief should say foreground only, and whether an orchestrator checks liveness before reporting progress. Droppable if the harness starts waking them reliably.

---

## Three moved integration tests fail for reasons shared with hosted TEST

**ID:** INBOX-272
**Date:** 2026-11-03
**Status:** proposed
**due:** week

P1606 moved the raw-SQL specs onto self-hosted, which surfaced failures the skip had hidden. p506 "existing non-empty tags are not overwritten" conflicts with the hashtag trigger from 2026-03-27, which rewrites tags on insert. p1515 AC1 and AC2 expect a superseded point hidden, while P1536's deliberate rule shows a version's own points; P1536 should update them when it ships, and most of p1515 cannot run until then. p520's census is filed separately. Done when these specs pass. Droppable when each is rewritten or removed.

---

## Small leftovers from switching hosted TEST off

**ID:** INBOX-273
**Date:** 2026-11-03
**Status:** proposed
**due:** month

From P1606's reviews. test-p1584's "a run older than 3 h is unknown" also fails on main. overnight-e2e.sh labels a self-hosted fallback as the throttled hosted project and excuses failures with it. Self-hosted function deploys never stamp the manifest, so a plain check-deploy-manifest.sh compares test against stale data. agent-banner and event-banner-small refuse --env test instead of following the active server. Type generation now names prod's project. Done when each is fixed or dropped with a reason.

---

## Before P1604 ships: rebuild its _mirror_limits() on the P1536 body, and fix the policy's 100-reply line

**ID:** INBOX-274
**Date:** 2026-11-04
**Status:** closed — limits kept in 20261105100000; privacy line live, checked on the prod bundle 2026-11-05 (P1619)
**due:** week

The P1604 draft migration for Clarified session threads, as read on 2026-11-04 before its rebase, redefines _mirror_limits() from the P1547 body: no canvas_max_usd, extract_max_usd or canvas caps, and global_total_daily_usd 10.00 where main has 50.00. Sorted after P1536 it would replace them, and canvas reads those keys. Its drift test checks only the two reply reservations. privacy.md also says a Clarify copy holds "up to 100 replies", and the draft stores 720 lines. Done when the shipped migration keeps every P1536 key and the policy matches. Drop if the rebase already fixed both. Related: P1615.

---

## Add a promote-only path to push-docs for an already-green staging branch

**ID:** INBOX-275
**Date:** 2026-11-05
**Status:** proposed
**due:** week

Plain and resume runs both delete staging and rescan, so a green result is never reused. Reuse an exact successful privacy-scan run only when it proves the same SHA, event=push, before=zeros and full-range coverage, and keep the lock, the schema checks and the compare-and-swap. Re-measure after the scanner rewrite: droppable if a full rescan is cheap enough not to matter.

---

## Stop repeating the local privacy scan on promote when CI already scanned that SHA

**ID:** INBOX-276
**Date:** 2026-11-05
**Status:** proposed
**due:** week

A big push scans four times, not three: local hook on staging, CI on staging, local hook on main, and CI again on the main push (seen 2026-11-05, privacy-scan on main in progress for the same SHA). Keep the scan before first publication to staging, since CI runs too late to prevent disclosure. Tie any skip to range, scanner and allowlist versions. Re-measure after the scanner rewrite: droppable if the repeat costs little.

---

## Warn when an unpushed stack grows too large, at authoring time

**ID:** INBOX-277
**Date:** 2026-11-05
**Status:** proposed
**due:** month

A 93-commit stack took about a day to land, and slicing failed because quality-ratchet fails on intermediate prefixes (cuts at 11, 26, 49, 66 failed; about 88 to 90 passed). Warn on patch volume and age, and run the ratchet at intended publish points rather than forcing arbitrary prefixes through it. Droppable if pushes stay cheap after the scanner rewrite and no stack passes 30 commits for a quarter.

---

## Make a push report and offer what it did not deploy (functions, secrets, flags)

**ID:** INBOX-278
**Date:** 2026-11-05
**Status:** proposed
**due:** week

A push lands the site and migrations, but prod edge functions, secrets and flags stay separate, and the push output does not list them. On 2026-11-05 the drift check showed stale prod functions while the founder's working assumption was that a push brings everything up to date. After promote, /push should run the prod drift check, deploy changed functions behind the normal key dialog, and end with one line saying what is live and what is not. Droppable if a different release flow replaces /push.

---

## Event room Back should return where you came from

**ID:** INBOX-279
**Date:** 2026-11-05
**Status:** proposed
**due:** week

From a chat, Back in the event room goes to the event, so people cannot return to the chat. Recommended: Back returns to the origin, and the event name at the top opens the event page. Founder agreed it is worth fixing.

---

## Forward of a transcript sends one line only

**ID:** INBOX-280
**Date:** 2026-11-05
**Status:** proposed
**due:** week

Forward carries one message by design; Clarify now carries the thread. Forwarding a whole transcript raises a privacy question, since speakers agreed to their chat reading it. Founder decision.

---

## Older transcripts keep a deleted person's text and name

**ID:** INBOX-281
**Date:** 2026-11-05
**Status:** proposed
**due:** week

transcribe_room_transcripts from the older per-person pass is not touched by account erasure (found in P1604). Predates P1604. Fix or retire with the older pass after the friends test.

---

## p1275 create-transcribe-room spec is stale

**ID:** INBOX-282
**Date:** 2026-11-05
**Status:** proposed
**due:** week

It calls create_transcribe_room without p_consent, so 6 tests fail. Update the spec.

---

## Clean text on TEST needs a scheduled worker sweep

**ID:** INBOX-283
**Date:** 2026-11-05
**Status:** proposed
**due:** week

Self-hosted TEST has no schedule for the clean worker and no dispatch config, so clean jobs wait unless someone runs its sweep. Founder decision on adding a job.

---

## Diagnose four script tests that fail the same way on clean main

**ID:** INBOX-284
**Date:** 2026-11-05
**Status:** proposed
**due:** week

Found during P1620, unrelated to it, not diagnosed: test-p1042-version-collision.sh (8 failures), test-p1168-noop-stamp.sh (test-env-fallback-noop-also-clean), test-p1173-manifest-stamp-concurrency.sh (primary-path-guarded), test-p1174-pending-set-integrity.sh (test-env-unaffected). A shared cause in the TEST fallback path is possible but unverified. Done when each passes or is retired; droppable if they already pass on current main.

---

## Clean job hand-off is not retried after a failure

**ID:** INBOX-285
**Date:** 2026-11-05
**Status:** proposed
**due:** week

transcribe_round_clean_tick dispatches a job once (dispatched_at IS NULL). If the hand-off fails, the job waits for the hourly sweep and the chat shows Cleaning up meanwhile. Retry after a minute or two. Found in P1604.

---

## git-ops tidy reads a maintenance-refreshed reflog time as recent branch activity

**ID:** INBOX-286
**Date:** 2026-11-05
**Status:** proposed
**due:** week

On 2026-11-05 tidy marked every slot-less branch KEEP as moved in the last 12 hours, including branches untouched for weeks. Every reflog carried the same mtime, 03:24:57. Hypothesis, unproven: git maintenance rewrites reflogs. Disproof: compare reflog mtimes after a known gc run. Fix would read the newest reflog entry's own timestamp, not the file mtime. Same concern for a worktree's logs/HEAD idle test.

---

## A hold on a closed spec outlives it and cannot be cleared once the slot lock is gone

**ID:** INBOX-287
**Date:** 2026-11-05
**Status:** proposed
**due:** week

P1608 (w4) and P1611 (w8) closed with founder holds still present, both have no .lock, and hold --clear needs the lock's nonce. Tidy will not REMOVE a held slot. Follow-up: drop the hold at close, or let tidy offer it as ASK. Once tidy can see them idle, run tidy --apply --confirm w4 --confirm w8 if they appear as ASK. The founder approved removing both on 2026-11-05. Also owed from P1608: the rule-off control was never confirmed run.

---

## supabase/.temp/cli-latest is tracked though ignored, so it keeps showing as modified

**ID:** INBOX-288
**Date:** 2026-11-05
**Status:** proposed
**due:** month

Tool stamp, tracked before the ignore rule. Untrack with git rm --cached through the locked commit path.

---

## P1630: read ten /finish runs and decide whether GLM stays

**ID:** INBOX-289
**Date:** 2026-11-05
**Status:** proposed
**due:** month

Read ten /finish runs from the 30 days after P1630 merged. If GLM produced no verified defect the other reviewers missed, fall back to Alternative B in the spec (GLM only when Codex does not run), or remove GLM if it is no better there. Done when that call is recorded.

---

## Point model-watch at OPENROUTER_MODEL so a newer GLM is noticed

**ID:** INBOX-290
**Date:** 2026-11-05
**Status:** proposed
**due:** month

model-watch reads the OpenRouter catalog, but its bump plan checks google ids and nothing points it at the OPENROUTER_MODEL key (P1630 risk, deferred). Done when a newer GLM version is surfaced, or this is dropped because GLM left /finish.

---
- 2026-11-05 due: week. Kanban shell overflows at 375px and 320px (page measures 446px wide, header select clipped), seen during P1629. Fix or file a bug.
- 2026-11-05 due: week. `tools/kanban/scripts/day-mutation-controls.sh` exits 1 on main: 3 controls drifted, 1 missed, 2 unmodified-copy reds, and the P1468 live goals test fails because `docs/goals.md` has no `**Goal:**` line under Next Steps. Repair so the gate means something again.
- 2026-11-05 due: month. Two flakes seen during P1629: `src/tests/p1607-e2e-slot-lock.test.ts` (serialized admission) and kanban `opportunities.test.ts` under a parallel run. Each passed on rerun.

## P1630: one real /finish on a throwaway change after merge

**ID:** INBOX-291
**Date:** 2026-11-05
**Status:** proposed
**due:** week

Moved out of P1630's Done-When by the founder so the spec can close at ship. After /ship p1630, run one real /finish on a throwaway change and confirm the report line, the receipt's vendors field and a refused GLM-only write. Done when that output is recorded here.

---

## P1630: confirm Codex completes on an embargoed one-file change

**ID:** INBOX-292
**Date:** 2026-11-05
**Status:** proposed
**due:** week

At ship, Codex was launched on the embargoed one-file case but hit its usage limit, so only the routing was proven. Re-run that case once with the limit reset, on throwaway code. Done when a Codex run with exit 0 is recorded here.

---

## Guard the ship canary suite against a duplicate scenario P-number

**ID:** INBOX-293
**Date:** 2026-11-05
**Status:** proposed
**due:** month

A new scenario in scripts/test-git-ops-ship.sh that reuses a P-number a later scenario owns kills the whole suite with exit 1 and no FAIL line, after the last PASS. Add a check that fails loudly on a duplicate scenario P-number or fixture branch. Seen once, in P1637 on 2026-11-05, where a new fixture collided with scenario S. Drop it if the suite is split or stops using P-number fixtures.

---

## P1634: re-run the typed-asks count after slice 3 ships

**ID:** INBOX-294
**Date:** 2026-11-05
**Status:** proposed
**due:** month

Re-run the keyword count of founder-typed review and build-roster asks for the 30 days after P1634 ships. Below 2 a day confirms it; otherwise read which asks remain and say why. Also record the result against P1505's falsifier, whose own 30-day window ends first. Done when the number and the reading are recorded here.

---

<!-- Resolved 2026-11-06: privacy scan refused branch deletes, fixed by P1641, see decisions.md 2026-11-06 -->

## Spec quick WhatsApp-style groups created with a QR code

**ID:** INBOX-296
**Date:** 2026-11-05
**Status:** proposed
**due:** month

Future placeholder: create a new multi-person chat on the spot, show a QR code, everyone scans and is in, then transcribe together. Today a group chat exists only as the channel of a Clarity Group (joining needs learning and terms), a 1:1 holds exactly two people, and adding people inside a chat is only placeholder P1461. Agreed 2026-11-05 as a future spec, separate from the /transcribe QR invite. Drop it if table tests show people do not scan and sign up, or if P1461 covers it.

---

## Re-check TEST edge-function drift after P1529 ships

**ID:** INBOX-297
**Date:** 2026-11-05
**Status:** proposed
**due:** week

On 2026-11-05 deploy-drift.sh reported the shared TEST server differs from main for _shared, dispatch-event-emails and send-event-emails (branch-only). Likely a P1529 branch deploy from w13 (its commit 25a0864b0 adds a series block to its emails), but no content comparison was run, so this is unverified. Do not redeploy main over it while P1529 is in flight. Done when main's functions are redeployed to TEST after P1529 ships and deploy-drift.sh prints in sync. Drop if the P1529 owner says the deploy was unintended and it is already cleared.

---

## test-hook-sha-gate.sh fails 4 of 10 cases

**ID:** INBOX-298
**Date:** 2026-11-05
**Status:** proposed
**due:** week

On 2026-11-05 deploy-drift.sh reported the shared TEST server differs from main for _shared, dispatch-event-emails and send-event-emails (branch-only). Likely a P1529 branch deploy from w13 (its commit 25a0864b0 adds a series block to its emails), but no content comparison was run, so this is unverified. Do not redeploy main over it while P1529 is in flight. Done when main's functions are redeployed to TEST after P1529 ships and deploy-drift.sh prints in sync. Drop if the P1529 owner says the deploy was unintended and it is already cleared.
scripts/test-hook-sha-gate.sh reports 6 passed, 4 failed (AC2, AC5, AC6-nonwatched, AC6 stamp update: expected exit 0, got 1). The result is the same with and without P1641's hook change, so it predates it. Done when the cause is known and the suite is green or retired.

---

## Revisit a QR invite for plain /transcribe only if a real table needs it

**ID:** INBOX-300
**Date:** 2026-11-05
**Status:** proposed
**due:** month

Parked 2026-11-05, not built. A QR adds little in chats: people in a chat already have Join, a 1:1 holds two people, a group needs learning and terms, an event needs an RSVP. Its one real use is a plain /transcribe session, where a second person has no way to get the room code today. Build it if a real session has people with their own phones and no shared chat. Drop it if P1601 (one phone, several speakers) covers those sessions.

---


## p1607 slot-lock test fails under the full pre-commit suite and passes alone

**ID:** INBOX-302
**Date:** 2026-11-06
**Status:** proposed
**due:** week

On 2026-11-06 the pre-commit full suite failed src/tests/p1607-e2e-slot-lock.test.ts ("admission is serialized ... failing control", expected '' to be 'HELD') while committing unrelated P1556 work; the same file passed alone (40 of 40). It looks timing-sensitive under 3-worker load. Done when the control waits on a condition instead of a fixed time, or drop it if it does not recur in a week of commits.
## P1641 checks that need the fix live

**ID:** INBOX-299
**Date:** 2026-11-05
**Status:** proposed
**due:** week

Confirm a real /push runs staging push, promote and cleanup on the fixed hook, leaving no staging branch. Delete the leftovers on origin in one push: staging/doc-20f511708, staging/doc-4af0e39e4, staging/doc-f37654208, staging/doc-9c7514044, after re-listing them and checking their commits are on origin/main. Check --resume at its next real use, since only its delete step was tested. Done when the first two are done and --resume is confirmed or has failed visibly.

---

## Stop agent multi-step shell commands at the first failed step

**ID:** INBOX-303
**Date:** 2026-11-06
**Status:** proposed
**due:** week

In the zsh agent shell, a failed step inside a multi-line Bash call did not stop the rest: in P1641 this caused five no-op push probes (an unbraced $S:refs applied a zsh modifier), two partial commits after failed python assertions, and an inbox Next ID reset below IDs in use. The zsh modifier trap is already recorded in docs/decisions.md and still recurred, so the fix is a mechanical guard (a PreToolUse check for unbraced $var: and for multi-line blocks with no stop-on-failure, or a standard preamble), not another note. Rules and hooks need the founder's claude-md gate. Drop if two weeks of sessions show no recurrence.

---

## Decide on /cm prod-health false alarm from Google Calendar report-only CSP

**ID:** INBOX-304
**Date:** 2026-11-06
**Status:** proposed
**due:** week

prod-health-smoke on /cm intermittently fails on a console error from the embedded Google Calendar iframe: Framing calendar.google.com violates a report-only frame-ancestors 'self' directive (Google's own report-only policy, not ours). Seen during P1648 verification; the same route passed 8 of 8 earlier that day. Decide whether to add a narrow PROD_HEALTH_ALLOWLIST.consolePatterns entry (exact substring including "report-only" and calendar.google.com, reviewed per that file's rule) or leave it. Droppable if no /cm prod-health failure of this shape recurs within two weeks.

---

## Check whether Enter stops sending in the canvas thread after a hand edit

**ID:** INBOX-305
**Date:** 2026-11-06
**Status:** proposed
**due:** week

Found by the P1646 real-model e2e on TEST (2026-11-06, case 3c, run 2): on the owner's canvas draft, after editing a point with the pencil and Save, pressing Enter in the thread composer did not send the typed "A" (text stayed in the active textbox, Send enabled, no toast, no reply in 180 s). Evidence: e2e failure screenshot and error-context for case 3c in the P1646 worktree's test-results. Not reproduced by hand. Cheapest disproof: same flow, press Enter vs click Send; drop this if Enter sends.

---

## Plan how agent replies are laid out in chat (paragraphs, lists, emphasis), like Claude and ChatGPT

**ID:** INBOX-306
**Date:** 2026-11-06
**Status:** proposed
**due:** week

Founder ask (2026-11-06, P1646 test): agent replies in canvas and chat threads render as plain text, so longer answers like the P1646 choice read as one block. Decide a formatting contract for every agent reply: blank-line paragraphs, lists, bold, maybe safe markdown rendering in the thread, and motion where it helps. Start with /create-spec. Droppable if the founder decides plain text with blank lines is enough.

---

## Canvas agent: a message about a different business should offer a separate canvas, not a conflict choice

**ID:** INBOX-307
**Date:** 2026-11-06
**Status:** proposed
**due:** week

Seen in the founder's P1646 test (2026-11-06): a message describing a different offer was treated as a Customer Segments conflict, while the agent's own reason said it "belongs on a separate canvas". The engine already has other_canvases offers; the choice prompt should route a different business there instead of offering a replace. Start with /create-spec. Droppable if offers already cover it after a prompt tweak in a later spec.

---

## P1649 post-push: confirm series short links on prod

**ID:** INBOX-308
**Date:** 2026-11-06
**Status:** proposed
**due:** week

After /push applies 20261106164500_p1649_series_alias_resolution.sql to prod (it must land before the redirect deploys), curl -sI claritypledge.com/sales, /drum, /next and /hike and record which event each one 307s to. Under public-wins, /sales should reach the hidden sales mastermind test while no public session exists, and /drum the hidden 24 Nov drum circle. Also re-run scripts/function-grant-drift-check.py so resolve_series_alias no longer reads as test-only. Droppable once all four resolve as expected on prod.

---

## P1646 follow-up: a message that both contradicts a point and adds a new fact loses the new fact

**ID:** INBOX-309
**Date:** 2026-11-09
**Status:** proposed
**due:** week

The canvas agent offers the choice and writes neither, so the owner must repeat the new fact. Decide after real use: write the non-conflicting facts in the same run, or accept it. Droppable if no owner hits this within a month of P1646 reaching prod.

---

## P1646 before prod: read the log-ingestion figure and accept the Gemini spend

**ID:** INBOX-310
**Date:** 2026-11-09
**Status:** proposed
**due:** week

The P1646 Cost Budget cannot compare its log row because the registry has no log-ingestion limit; read it from the Supabase usage page and record it. Gemini is about $0.012 per offer and needs the founder's acceptance. Done when both are recorded; droppable if P1646 is reverted.

---
