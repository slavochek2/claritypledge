---
status: backlog
type: story
rank: 308
created_date: '2026-09-29'
tags: [position-buttons, onboarding, intensity, analytics]
disclosure: public
delivery_stage: create-spec
pipeline_ran: [create-spec]
drafted_by: opus
exec_model: opus
exec_effort: high
driver: anomaly
---

# P1371: Show the intensity hint when someone needs it, not once per browser

## Problem

**Situation:** Position buttons have a hidden second gesture (P847 Model C′). The first click selects the default position. A second click on the same button opens the intensity menu, and a third picks "somewhat" or "strongly". The only teaching surface is the P852/P867 forced modal (`IntensityTutorialModal`). It auto-opens the first time a reader reaches a letter engage phase, plays a looping demo and has one exit: Continue. It is gated by a browser `localStorage` key (`use-intensity-preview-seen.tsx`, `letter_intensity_preview_seen_at_v2`). After dismissal a "?" button below the position buttons replays it.

**Complication:** Readers still don't find the gesture.

> Founder framing, verbatim: "some people never discover the double click on buttons.. some people see animation but dont pay attention - animation we developed so far comes only on letter.. and only in CK … should we consider a more intelligent approach when to show it and when to re-show it?"

Verified mechanics behind that observation:
- **Shown before it's needed.** The modal opens on phase entry, before the reader has a position in mind. Continue is the goal and the demo is background noise.
- **One surface.** Only letter engage phases trigger it. In practice that means the CK letter. The same `PositionButtons` component appears on feed, point, story, profile, partner and live surfaces with no teaching at all. The shared button's own comment (`PositionButton.tsx`, "P852 Round-G") says the inline chevron was pulled from those surfaces on purpose.
- **Per browser, not per person.** A new device shows it again, and a reader who never opens a letter never sees it.
- **Nothing tells us if it worked.** Mixpanel records `intensity_tutorial_shown` / `intensity_tutorial_dismissed` only. Nothing records the intensity menu opening. So we can't tell learners from non-learners and can't aim a reminder.

**Question:** What rule decides when the intensity hint appears, reappears and stops, and what measurement tells us the rule works?

## Appetite

- **Blast radius:** medium. It touches the shared `PositionButton` or its letter-flow wrapper, which render on every position surface. A clumsy nudge becomes noise everywhere at once.
- **Reversibility:** high. The UI is flag-able and the events are additive. The only lasting change would be a seen/used state on the profile, if we choose that.
- **Decision density:** several founder calls (marked below).

## Solution

Three parts, in order. Part A ships first and stands alone. B and C both depend on A's signal.

### A. Measure whether people learned the gesture (ships first)

- Add Mixpanel events on the shared button: `intensity_menu_opened` (group, surface) and `intensity_selected` (group, intensity, surface, `was_default_before`). Surface is a coarse enum passed by the consumer (`letter`, `feed`, `point`, `story`, `profile`, `live`, `other`). It never carries ids or codes, per the P1304 property scan.
- **Primary oracle is the database, not Mixpanel.** `analytics.track` no-ops behind tracker blockers, so Mixpanel counts are a floor, not a rate (decisions.md, `session_lost_unexplained` entry). Stored positions already carry intensity (`somewhat_*` / `strongly_*` in the position enum; history in `point_position_history`). "Has this person ever used intensity" is readable server-side without new instrumentation. Before relying on letter responses, verify which table they write to. UNVERIFIED: P718's backfill suggests `letter_point_responses.position`.
- Write one baseline query: the share of people with ≥1 position who have ever stored a non-default intensity, split by whether they saw the tutorial. This is the number B and C must move.

### B. Hint at the moment of relevance

Replace "auto-open on phase entry" with a contextual one-shot nudge. It fires **right after a plain first click** selects the default position, anchored to the selected button: e.g. *"Tap again to fine-tune"* [FOUNDER DECISION: copy]. The reader is looking at that spot and has just done half the gesture.

- The forced modal stops being the first-run path. It remains the "?" replay [FOUNDER DECISION: keep a one-time modal on the CK letter too, or replay-only].
- The nudge must describe the real mechanic (select → same button again → pick). Per the P867 ruling it must not compress the count.
- **Surfaces:** [FOUNDER DECISION: scope]. Options:
  (a) letter engage phases only;
  (b) every surface where the intensity menu is live;
  (c) letters + feed/point pages, not live sessions.
  The founder's framing is general ("never discover the double click on buttons"), but P852 Round-G removed an inline intensity cue from the 12 non-letter consumers, stating intensity "is not the mechanic" there. Yet `handleGroupClick` opens the menu on every surface. Pick a scope, and record whether it supersedes Round-G.

### C. Re-show and stop rules, driven by behaviour

State per person: `plain_selection_count`, `nudges_shown`, `has_used_intensity`.

- **Show** the nudge on plain-only selections number 1, 3 and 8 (spaced) [FOUNDER DECISION: schedule].
- **Weight toward Disagree:** a plain Disagree is always eligible, even between schedule points (calibrated disagreement is the high-value case, per P867). The global stop rules still apply.
- **Stop permanently** the first time the person opens the intensity menu (learned). Also stop after 3 nudges shown with no menu open (ignored); never nag.
- **Where the state lives:** [FOUNDER DECISION: storage]. Options:
  `localStorage` only (cheap, per-device, resets on a new phone);
  profile column for signed-in users with a `localStorage` fallback for anon readers;
  or derive `has_used_intensity` from stored positions (free, and follows the person).
  Anon CK readers have no profile, so any choice needs the fallback.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| Nudge on every surface becomes noise and slows plain positioning | MITIGATE | Hard cap of 3 nudges per person, permanent stop on first menu open; scope is a founder call |
| Mixpanel undercounts (blockers) and we misread success | MITIGATE | DB-derived oracle is primary; Mixpanel is supporting evidence only |
| DB "used intensity" is not independent of the change under test if the nudge also pre-selects an intensity | MITIGATE | The nudge never selects or changes a position; only the reader's own click does |
| Legitimate "default" choosers look like non-learners forever | ACCEPT | The 3-nudge cap bounds the cost; not every reader needs intensity |
| Nudge overlaps the open dropdown or the P862 `inert` "?" container | MITIGATE | Nudge dismisses when the menu opens; reuse the `inert` pattern for any hidden focusable |
| Letter engage `counts` priming invariant broken | MITIGATE | Do not touch `counts={ZERO_COUNTS}` on engage-phase calls (decisions.md P852 priming gate) |

**Non-Goals**
- Do NOT change the Model C′ interaction itself (click counts, menu contents, the Clear row).
- Do NOT reintroduce a permanent inline chevron. P521 showed a static cue goes unseen.
- Do NOT delete `IntensityTutorialModal`; it remains the replay surface.
- Do NOT add intensity hints to the Unsure group (it has one intensity).

## Invariants

- Any demo or hint describing the intensity gesture must match `handleGroupClick`'s real sequence click-for-click (decisions.md 2026-06-01, P867).
- Engage-phase `PositionButtons` calls in the letter flow keep `counts={ZERO_COUNTS}`.

## Acceptance Criteria

- [ ] Opening the intensity menu and picking an intensity each produce a Mixpanel event carrying group, intensity (for picks) and a coarse surface, and no id-shaped property. Verified in Mixpanel live view on a preview deploy, plus the P1304 scan test passing.
- [ ] A baseline query returns the share of positioned people who have ever stored a non-default intensity. The number and query are recorded in this spec before B/C ship.
- [ ] On an in-scope surface, a first-time reader who clicks a position once sees the nudge anchored to that button. A reader who then opens the menu never sees it again, on that surface or any other in scope.
- [ ] A reader who ignores it sees it at most 3 times in total, on the schedule decided above.
- [ ] Plain Disagree triggers the nudge between schedule points while the cap is unspent.
- [ ] Letter engage phases no longer force-open the modal on first entry, unless the founder keeps it for CK. The "?" replay still opens it.
- [ ] Reduced-motion users get a static nudge (no animation) with the same show/stop rules.
- [ ] 375px and desktop: nudge doesn't overlap the dropdown, the "?" button or the Continue/advance controls. Screenshot evidence.
- [ ] Follow-up read: the baseline share is re-measured after release, with the before/after recorded here. `[post-deploy]` re-measure once enough post-release positions exist.

## Decision Criteria

**Did it work?** Compare against the Part A baseline, using only people who took their first position after release. Worked if their share of non-default intensities is clearly higher than the pre-release share. [FOUNDER DECISION: the margin and the minimum sample that counts as "clearly"]. If it doesn't move, the nudge is noise: revert to replay-only rather than escalating its visual weight.

## Alternatives Considered

- **Keep the forced modal, add a replay-reminder later.** Rejected: the failure mode is timing (before need), and a second modal repeats it.
- **Permanent chevron / "adjust" affordance on the selected button.** Rejected in P521 (nobody discovered it) and P852 Round-G (leaked onto surfaces where intensity is not the focus).
- **Open the menu automatically on first selection.** Rejected in P847: P521's auto-open conflated "close menu" with "remove position" and users lost selections.
- **Time-based re-show (every N days).** Rejected: time is unrelated to whether the person learned. Behaviour is the only signal that is.

## Open Questions

1. Is intensity actually wanted on non-letter surfaces, or did Round-G mean it should stay letter-only? This decides scope for B.
2. Do anon CK readers matter enough to justify the `localStorage` fallback, or is signed-in-only acceptable?

## Related

P521 (auto-dropdown, superseded) · P847 (Model C′ interaction) · P852 (forced tutorial, Round-G chevron removal) · P862 (`inert` on the "?" container) · P867 (3-click demo ruling) · P1304 (analytics property scan) · P718 (letter response positions)
