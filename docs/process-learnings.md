# Process Learnings

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

**Closing an entry** — the graduation rule (`docs/decisions.md` 2026-02-26): delete it from this
file and add a `[process]` entry to `docs/decisions.md`. Entries are never marked done in place;
an empty file is the healthy state.

---

## goal-gate CHECK 5 is unreachable for any feature that needs more than a few review rounds

**Date:** 2026-08-24
**Status:** proposed
**due:** week

P1141 shipped its code to main and its migrations to prod, verified end to end, and still could not
close its spec: `goal-gate` is red and pre-commit hard-blocks closing a goalified spec on a red gate.
Neither cause is about the feature's quality.

**1. The artifact-hash check punishes a correct workflow.** A round records fingerprints for the
render set it judged. A later round finds a real defect, the fix changes the UI, the renders are
regenerated — and the earlier round is now reported as a hash mismatch. On P1141, rounds 1–4 all
report mismatches because round 5 legitimately replaced the images. Doing the right thing breaks the
check.

**2. The round arithmetic is unsatisfiable.** CHECK 5 wants the last two rounds to be PASS, with a
hard ceiling of five. After four rounds that each found real defects, a fifth PASS gives a trailing
`FAIL, PASS` — not two consecutive — and a sixth breaches the ceiling. Both branches fail. Observed
output: `need 2 CONSECUTIVE trailing PASS rounds; got: FAIL FAIL FAIL FAIL FAIL`.

The two ways to make it green are the two the gate exists to prevent (delete a failing round, or edit
a FAIL to PASS), so the honest outcome is a card parked at `qa` — and that will now recur for every
long-review feature, silently, since nothing surfaces "shipped but never closed" except someone
noticing the slot later.

**Fix to consider:** (a) hash each round against the renders *as of that round's commit* rather than
the current working tree, so supersession is not corruption; (b) replace the fixed ceiling with a
"last two rounds PASS, no cap" rule, or raise the cap and require the trailing pair only among rounds
that actually ran. Both are changes to `scripts/goal-gate.sh` CHECK 5 and want a failure-path test
(`scripts/test-goal-gate.sh`) proving the new rule goes red for the cases it should.

**Falsifier:** construct a fixture with rounds FAIL FAIL PASS PASS and confirm the gate exits 0; then
regenerate one render after the last round and confirm it does NOT go red for supersession alone.

## The deploy record can say a fix shipped when it did not — the manifest itself needs a trust check

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

---

## A probe that returns a loud wrong number is not covered by the run-a-control rule

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

**Date:** 2026-03-23
**Status:** proposed

Agent asked user to manually test /live session flow 4+ times instead of writing an e2e test. Playwright two-party infrastructure exists (`e2e/helpers/test-user.ts`, `test-realtime.ts`) and can reproduce any session scenario. When writing a reproducer, extract exact conditions from screenshots/bug reports — don't assume the happy path (this session: the bug was same-name users, but the first e2e test used different names and got a false green).

**Fix:** (A) When investigating a /live bug, write the e2e reproducer FIRST before theorizing. (B) Always extract the exact user conditions from evidence (screenshot names, console output) into test parameters. (C) After CSS changes on /live, run `npx playwright test e2e/live-rating-drawer.spec.ts` before reporting success.

---

<!-- Resolved 2026-08-14: "/dev pre-flight doesn't check branch lineage — /ship surprise risk" — see decisions.md 2026-08-14 [process]. /dev half shipped (dev.md:86); /pick-flow half dropped with reasoning. First entry closed through the /weekly step 2.5 path (P1081). -->

## Dead code not caught by /finish or pre-commit

**Date:** 2026-03-02
**Status:** proposed

`PointCardDetail.tsx` had zero production callers and lived in `src/app/components/` undetected — caught only by an ad-hoc consistency audit, not by `/finish` or any automated check. `/finish` checks correctness and patterns; it does not detect zero-caller exports.

**Fix:** Add dead-code detection (`knip` or `ts-prune`) to `scripts/pre-commit-checks.sh` or as a step in `/maintain:cleanup`. Zero-caller components accumulate silently across feature merges.

---

## Raw ideas processing has no skill (`/process-raw-ideas`)

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

**Date:** 2026-03-14
**Status:** proposed

Observed during Pair C session. Three bugs that break the session flow:
1. **Scroll bounce → accidental refresh:** On mobile, scrolling up causes the page to refresh, kicking the user out of the active /live session. Session state lost.
2. **Tap targets too small:** Users with long nails miss the intended button and accidentally hit "speak freely" instead. Not clear what mode they're in afterward.
3. **Position removal on click unclear:** Clicking on an already-taken position removes it, but there's no visual feedback or confirmation. Users don't realize they've un-positioned.

**Fix:** These should be fixed before the next facilitated session — each one causes visible confusion and breaks the experience for channel partners evaluating the tool.

---

## Synchronous sales calls as acquisition bottleneck

**Date:** 2026-03-21
**Status:** proposed

Intro calls that don't directly deliver session value get deprioritized under bandwidth constraints. Fix: default to async distribution (booking links, forwardable offers) instead of scheduling exploratory calls. Batch scheduled calls into one day/week.

**Related:** ladischenski.com pricing page needs improvements — comparison anchoring, explicit session length, ROI story, FCO price range. See customer price evaluation conversation 2026-03-20.

---

## A second, undocumented inbox exists at `.claude/process-learnings.md`

**Date:** 2026-08-14
**Status:** proposed
**due:** week

`.claude/process-learnings.md` holds 1 open entry (registry-to-disk drift for skill files,
2026-02-28) in the same format as this file. Neither `/weekly` nor `/monthly` reads it — P1081
wired both readers to `docs/` and `.private/docs/` only, so this store is written-but-never-read,
the same class of defect P1081 was filed to fix.

**Decide:** fold its entry into this file and delete it, or make it a third store the readers know
about. Two stores was a deliberate split (public/private); three needs a reason.

**Droppable if** the drift entry turns out to be already resolved — check whether a registry/disk
validation step now exists in `/slava:maintain:cleanup` before doing anything else.

---

## Did the close path actually shrink the queue, or does intake still outrun it?

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

## Reap zombie vite/playwright processes between e2e runs

**Date:** 2026-08-14
**Status:** proposed
**due:** week

Identical p683 runs took 4.5m then 57.5m, and a test that had passed twice failed in the slow
run — 8 vite servers (oldest 11 days) and 59 playwright processes (oldest 2 days) were alive at
once. `pre-commit-checks.sh` has a "zombie Vite dev servers" check that reported clean during
this, so it is not detecting the condition. Needs a reaper plus a fix to that check. Drop if the
check turns out to be scoped deliberately to the current port only and a reaper already exists
elsewhere.

---

## Extend the supersession gate to cover docs/decisions.md

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

## Activate the goal-gate boundary — push, prove it red, then mark it required

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
<!-- filed 2026-08-23, during P1141 -->

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

## False `>>` marker claim in disagreement:prepare Stage 2 attribution instruction
<!-- filed 2026-08-25, during P1156; deliberately NOT fixed there -->

**due:** week — **Measured 2026-08-24 (P1156 D2): auto-captions carry zero speaker labels of any
kind.** A control pair — a one-speaker TEDx talk (`lJR-7_Dcess`) and a two-speaker interview clip
(`sRv-ETHskXI`) — was probed identically: `>>` turn markers **0 and 0**, dash-dialogue markers
**0 and 0**, bracketed speaker labels **0 and 0**. The two-speaker control is textually
indistinguishable from the one-speaker control at the markup level.

Shipped `/slava:disagreement:prepare` v0.6.1 (now v0.7.0) Stage 2 still instructs attribution
"by content and by the `>>` turn markers" — **a method claim that measurement falsified.** Harmless
for new runs under the P1156 selector's Gate 0 (every source single-speaker by construction), but
any run on a pre-Gate-0 multi-speaker source inherits a wrong instruction.

**Why it was not fixed during P1156:** the spec's rule was "stages 1–5 move/remain byte-identical —
a 'move' that quietly rewrites a rule loses the run that bought it." Folding a one-line fix into
Stage 2 would have widened P1156's blast radius past what its spec sanctioned. Raise it as its own
one-line fix with its own evidence.

Falsifier: fetch captions for any two-speaker YouTube video and count `>>` lines in the raw `.vtt`.

**Correction — 2026-08-27 (P1164), kept in place rather than graduated so the over-generalized claim
above stays on record.** "Auto-captions carry zero speaker labels of any kind" is over-generalized
from n=2. Re-measured against this entry's own control pair plus a third source (`_V_ed5fuexA`,
Harari two-speaker interview, 2886s, auto-captions only): literal `>>` **0**, HTML-escaped
`&gt;&gt;` **106**. The original two-video result is confirmed correct on both spellings — not a
probe artifact — but YouTube's auto-captioner does emit escaped turn markers on some videos and not
others, so "no markers of any kind" is false as a general claim; a literal-only probe also misses
them where they exist, since a `.vtt` stores them escaped.

`/slava:disagreement:prepare` v0.7.1 (`features/p1164_points_prepare_false_turn_marker_instruction.md`)
now instructs a probe for both spellings instead of asserting presence or absence; a marker found
means the speaker *changed*, never *who* it changed to. Fixed.

---

## Agent-skills sync gate (P1151) compares the whole tree in the working tree — no git lock protects against a co-tenant's unstaged edit

**Date:** 2026-08-27
**Status:** proposed
**due:** month

`sync-agent-skills.sh --check` (run by `pre-commit-checks.sh` / the `.git/hooks/pre-commit` hook,
which is byte-identical to it) diffs **every** source file under `.claude/commands/slava/**`
against `.agents/skills/` with `cmp -s` against the **working tree** — not the git index, not HEAD.
It is not scoped to the staged diff.

On a shared main checkout with many concurrent sessions, any co-tenant's in-progress, unstaged edit
anywhere in that tree fails **every** session's unrelated commit, including the p1164 commit this
entry accompanies (blocked 3 times by concurrent drift in `select.md`, `kdd/SKILL.md`,
`positions.md`, `publish.md`, `run-pipeline.md`, `story-draft.md`, `day.md`,
`docs/points-process.md`, resolved only by polling `git status --short` until quiet). Critically,
`git-ops.sh commit-to-main`'s `main.lock` does **not** protect against this: the lock serializes
*committers*, not *editors* — a concurrent Claude session's Edit-tool write takes no git lock at
all, so retrying under the lock does not help.

**Real fix:** scope `sync-agent-skills.sh --check` to `git diff --cached --name-only` intersected
with the source tree, instead of a whole-working-tree `cmp`. **Stopgap today:** if blocked, don't
busy-retry — poll `git status --short` until it goes quiet (no bystander diff), then retry.

Falsifier: with a second session holding an unstaged edit to any `.claude/commands/slava/**` file,
attempt an unrelated commit via `git-ops.sh commit-to-main` — it fails on that file's drift
regardless of the lock.

---

## `git-ops.sh ship` has no tracked-and-dirty preflight before the cherry-pick — second instance of "the lock serializes committers, not editors"

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

## `check-deploy-manifest.sh --env prod` prints the wrong fix command for the unpushed-stamp case (3rd recurrence)

**Date:** 2026-08-28
**Status:** proposed
**due:** month

`--env prod` reads the manifest from `origin/main` (P820). When local main is ahead of origin, an
unpushed stamp reads as `MIGRATION_MISSING: … not deployed to prod`, and the script's `Fix commands:`
block names `./scripts/migrate.sh --env prod` — the wrong action, at the moment the operator is
deciding. This has now misled three times (2026-08-18; an earlier `migrate.sh`-disagreement incident;
2026-08-28), with two decisions.md entries prescribing a manual two-command check that nobody runs,
because the tool sounds authoritative and the manual check is not where the decision happens.

**Real fix:** in the drift branch, compare the `origin/main` manifest against the working-tree
manifest. If the missing version is present locally, emit `MIGRATION_UNPUSHED_STAMP: <file> (applied
and stamped locally; the stamp has not reached origin/main)` and name pushing main as the remedy.
Emit `MIGRATION_MISSING` only when the version is absent from both.

Falsifier: commit a manifest stamp locally without pushing, then run
`./scripts/check-deploy-manifest.sh --env prod` — it reports MIGRATION_MISSING and tells you to
migrate prod.

---

<!-- Resolved 2026-08-27: "/slava:disagreement:select has no person-level fallback from Gate 1" — closed by P1171 (Gate 1 runners-up carried as per-position `alternates:`); see decisions.md 2026-08-27 [process] -->

<!-- Resolved 2026-08-28: "Spec dependency fields are five undefined spellings" — promoted to a
     tracked spec rather than left as month-debt; see features/p1186_spec_dependency_vocabulary.md (filed same day). -->

