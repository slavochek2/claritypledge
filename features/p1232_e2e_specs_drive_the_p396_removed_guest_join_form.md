---
status: in-progress
type: task
rank: 1000068
workstream: infrastructure
created_date: '2026-09-01'
tags: [e2e, testing, live, p1043]
delivery_stage: dev
pipeline_ran: [create-spec, dev]
drafted_by: opus
exec_model: opus
exec_effort: high
driver: anomaly
---

# P1232: E2E specs still drive the guest-join form P396 removed

## Problem

**Situation:** P396 removed the guest email input and the consent checkbox from the join-via-link
form (`features/done/5_feb_26/p396_eliminate-unverified-user-state.md`: "Remove email `<Input>` and
consent checkbox from join-via-link guest form JSX"). What remains is a name field plus a
"Join as Guest" button (`guest-or-account-join.tsx:91,108`). Verified by grep: the placeholder
`your@email.com` appears **0 times** in `src/`.

**Complication:** Spec files still call `.fill()` on that removed input. `fill()` **auto-waits** —
it does not fail fast, it blocks until the whole test times out, producing a bare timeout with no
assertion error. That is why 58 failures in the 2026-08-31 overnight run were classified as an
unexplained environmental category rather than as one dead selector.

**Question:** How many sites are actually affected, and what is the correct interaction now — given
that the button these tests click has not simply been renamed?

## Appetite

Blast radius: medium — 10 live-session spec files, no product code. Reversibility: high.
Decision density: zero.

## Solution

`e2e/helpers/live-join.ts` — `completeLiveJoinIfPrompted(page, {name})`, one correct way to get past
the /live join step, handling the three states a page can actually be in:

- `guest-form` — not signed in: fill the name field if empty, click "Join as Guest".
- `retry-button` — auto-join failed and offered the fallback "Join Session".
- `no-join-ui` — neither control appeared. Usually an authenticated auto-join, but deliberately
  NOT named as proof of one; callers assert their own post-join state.

Applied at **34 sites across 14 files** — 31 helper call sites in 13 files, plus 3 dead blocks
removed in `live-meeting-mic-permission.spec.ts`. Three distinct failure modes, all tracing to the
same removed form:

1. **Unguarded `.fill()` on the removed input** (20 sites) — hangs until the test times out.
2. **Unconditional click on "Join Session"** (8 sites) — hangs on every run where auto-join
   *succeeds*, because that label only renders on the error path.
3. **A guard keyed on the removed input** (3 sites) — `formVisible` is now permanently false, so the
   whole join block is skipped and the test never joins at all. This one does not hang; it fails
   later, somewhere else, for a reason that looks unrelated.

The three `live-meeting-mic-permission` sites keep their own `/join/i` click (which already matches
the new label) and lose only the dead email+checkbox lines, because that test deliberately logs
immediately before clicking and the helper would swallow that step.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| The helper silently passes when the join never happened | ACCEPT | It returns which of the three states it resolved, so a caller that cares can assert on it. Every call site here follows with its own assertion on the live view |
| `auto-joined` masks a genuinely broken join | ACCEPT | The following assertion in each test fails instead — this helper is not the gate for whether joining works |
| Files not in the measured set carry the same pattern | MITIGATE | Denominator was measured, not inherited: `grep` now returns zero inline `.fill()` calls against `your@email.com` across all of `e2e/` |

**Non-Goals**
- Do NOT change the /live join product behaviour or copy.
- Do NOT fix unrelated failures in these 10 files. Removing the hang exposes whatever was underneath;
  that belongs to P1043.
- Do NOT touch the "Updated Terms" dialog handling — different surface, different lifetime.

## Invariants

- No test may click "Join Session" unconditionally. The label exists only on the auto-join **error**
  path (`clarity-live-page.tsx:4002`); on the normal path the page renders a "Joining session..."
  spinner and the click hangs. Go through the helper, which clicks it only when present.

## Done-When

- [x] `grep -rn "your@email.com" e2e/ | grep "\.fill("` returns nothing
- [x] No spec file clicks `'Join Session'` outside the helper
- [x] All 34 sites across 14 files either call the helper or have the dead lines removed
- [x] Comments that contradicted the new code removed (17 stale lines)
- [x] `npx tsc --noEmit` and `npx eslint` clean on every touched file
- [ ] A representative touched file runs without a bare timeout at the join step — **BLOCKED by an
      unrelated defect, see below**. Not satisfiable until the creator flow works.

## Findings

**The triage's file count was low and its "0 guarded" figure was an artifact — both corrected here.**
The triage named 7 files and flagged its own denominator as unmeasured. Measuring it properly found
**10 files with unguarded sites, and 3 files already fully guarded**. Two distinct guard styles exist
in the repo: `waitFor({state:'visible'}).catch(()=>false)` (`p272-live-verification.spec.ts:110`) and
a plain `isVisible()` check. My first detector recognised only the former and mislabelled 8
`isVisible()`-guarded sites as unguarded; reading the context rather than trusting the script caught
it. `isVisible()` returns immediately, so those sites never hung.

**"Join Session" was NOT simply renamed, and treating it as a rename would have been wrong.** The
label still exists at `clarity-live-page.tsx:4002` — but only inside the error branch. While
auto-join is in flight the page shows a spinner; the button appears only if the join failed. So an
unconditional click hangs on every run where auto-join *works*, which is the normal path. This is a
second, independent hang mechanism that the triage's "renamed button" framing would have missed.

**A third mode, and the quietest: a guard that can never be true.** `live-rating-drawer.spec.ts:79`,
`p272-live-verification.spec.ts:110` and `p412-reviewer-position-removal-hides-point.spec.ts:45`
were the *correctly guarded* files — the pattern the triage held up as the fix others had missed.
But the guard waits on `your@email.com`, which no longer renders, so `formVisible` is permanently
false and the entire join block is skipped. These three never hang and never join; they fail later
at an assertion that looks unrelated to joining. **The known-good control was itself broken**, which
is why "copy the guarded pattern" would have been the wrong fix.

**My own detector was wrong twice, in the same way, and reading the code caught it both times.**
First it flagged 8 `isVisible()`-guarded sites as unguarded because its regex only recognised the
`waitFor().catch()` form. Then it scored 8 unconditional `'Join Session'` clicks as *guarded*,
because an `if (...isVisible...)` appeared within the preceding lines — guarding the **checkbox**,
not the button. Both times the script's verdict was plausible and wrong. The measured counts in this
spec come from reading every site, not from the script.

## Blocked on a separate, larger defect: the two-party creator flow cannot start a session

The behavioural check could not run, and the reason is worth more than this spec.

Every two-party `/live` test dies **before** reaching any join step. The speaker clicks `New session`
and `Invite Your Partner` never appears (`clarity-live-page.tsx:4386`; the button itself is live at
`:4197`, so the click lands and the session simply never gets created). 16 of 16 tests failed across
the four files sampled, all at that assertion.

**This is not caused by P1232 or P1231, and both were ruled out by control rather than by argument:**

- `p-story-persistence-fixes.spec.ts` — a file **neither** change touches — fails at the *identical*
  locator and line. So the defect is repo-wide, not in the edited files.
- Re-running that same control with the P1231 storageState seed **disabled** produced the identical
  failure. So the global config change is not the cause either.

**It also means the 2026-08-31 triage mis-attributed this class.** The triage recorded
`a11y/p398-accessibility.spec.ts:46` and `p275-live-positions.spec.ts:54` as guest-join fill
failures. Those lines are unreachable — both files die at the creator's `Invite Your Partner` check
on lines 41 and 48 respectively. The guest-join defect at :46/:54 is real and is fixed here, but it
was never what those particular runs were failing on.

Needs its own spec. Filing it is out of scope for this one; recorded here so the next agent does not
re-derive it.

## Adversarial review (codex, 2026-09-03) — 2 findings, both checked by command

**[MEDIUM, ACCEPTED AND FIXED] The helper reported success it had not observed.** It used
`Promise.race` over the two join controls. `race` settles on the first *settled* promise, including
a **rejection** — and both waiters carried the same timeout, so whichever rejected first decided the
outcome and the `.catch()` reported "joined" even when the other control was about to appear. Fixed
by switching to `Promise.any`, which resolves on the first *fulfilment* and rejects only when both
reject; it also aggregates both rejections, so the losing waiter cannot surface as an unhandled
rejection. The outcome `auto-joined` was additionally renamed to **`no-join-ui`**, because absence of
join controls is not evidence of a join — a stalled auto-join or an unrecognised gate looks identical.

**[HIGH, DISPUTED — real hazard, but pre-existing and not introduced here.]** Codex reported that
saved manual auth contaminates guest and multi-user tests, attributing it to this change. Checked
against history rather than accepted: `git show 3ba55ff0^:playwright.config.ts:134` already applied
`storageState` to every context whenever `.private/test-auth/local.json` existed. The merge is new;
the every-context application is not, and the precondition is unchanged. The file also **does not
currently exist**, so the path is inert today. The hazard is genuine and worth its own spec — a
developer running `npm run test:save-auth` would give two supposedly independent participants the
same identity, and the suite would behave differently on that machine than in CI. Not a reason to
revert P1231, and not fixed here.

## Alternatives Considered

- **Find-and-replace `'Join Session'` → `'Join as Guest'`** — rejected on the finding above: both
  labels are live, on different branches, and the mapping is conditional rather than 1:1.
- **Add the `waitFor().catch()` guard at each of the 21 sites** — rejected: it makes each site
  tolerate the removed element rather than interact with the element that replaced it, so the tests
  would stop hanging while still not exercising the real join.

## Related

- **P1043** — owns the remaining undiagnosed failures; this removes one mechanical class from them.
- **P1231** — the sibling mechanical class (first-run tutorial modal), same session.
- **P396** — the shipped change these tests never caught up with.
