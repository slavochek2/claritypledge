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

# P1371: Find out why readers miss the intensity gesture, then teach it when they need it

## Problem

**Situation:** Position buttons have a hidden second gesture (P847 Model C′):
1. A click selects the default position.
2. A second click on the same button opens a menu with three levels (plus a Clear row when the consumer passes `onClear`).
3. A third click picks a level.

Letters teach this on two surfaces. Both are gated by a per-browser `localStorage` key (`use-intensity-preview-seen.tsx`, `letter_intensity_preview_seen_at_v2`):
- **The forced modal** (`IntensityTutorialModal`, P852/P867) auto-opens on the first letter engage phase, loops a demo and exits only via Continue.
- **An always-on inline tip row**: after the first selection, both engage phases show a "?" replay button and the text *"Double-click to adjust position level"* (`letter-flow-content.tsx`, "Round-H rev3"). It stays visible on every later selection.

No other surface teaches it. That covers feed, point, story, profile, partner and live, where the same `PositionButtons` renders and the menu opens.

**Complication:** Readers still don't find the gesture, and both teaching surfaces were on screen when that was observed.

> Founder framing, verbatim: "some people never discover the double click on buttons.. some people see animation but dont pay attention - animation we developed so far comes only on letter.. and only in CK … should we consider a more intelligent approach when to show it and when to re-show it?"

What we know and don't:
- **Timing is only one suspect.** A post-selection hint already exists and also failed, so "show it at the moment of need" is not self-evidently the fix. Other suspects: the tip is low-salience (12px, 55% opacity), and its copy is the standalone "double-click" string that P867 rejected ("reads as rapid same-spot clicks and mis-counts").
- **We cannot measure learning today.** Mixpanel records only `intensity_tutorial_shown` / `_dismissed`, and `_shown` fires on "?" replays too. Nothing records the menu opening on any surface. `position_recorded` carries the 7-point value on story and doc pages only. Tutorial exposure exists only in `localStorage` and Mixpanel, never in the DB.
- **A live bug makes the gesture dangerous to promote.** On feed and point detail, picking the already-selected row in the menu (the natural "close it" tap) toggles the position to `null` and removes it (`feed-point-card.tsx` and `point-detail-page.tsx` `handlePositionClick`: `effectivePosition === position ? null : position`). P847 says Clear is the only destructive path. Promoting a gesture that leads to this row would increase accidental removals.

**Question:** Why does the current teaching fail, what is the cheapest change that fixes it, and what measurement tells us it worked?

## Appetite

- **Blast radius:** medium. Phases 0–1 touch the letter flow only. Phase 2 may touch the shared `PositionButton`, which renders on every position surface.
- **Reversibility:** high. The UI is flag-able and the events are additive.
- **Decision density:** several founder calls (marked below), including one that supersedes P867.

## Solution

Phases in strict order. Each phase's evidence decides whether the next runs.

### Phase 0 — Prerequisites (no teaching changes)

1. **Fix the same-row removal bug** on every consumer that toggles on `position === current` (at least feed and point detail; enumerate all by grep). Picking the current level from the menu must be a no-op. File it as its own bug spec; it is live today independent of this spec.
   Filed as [P1372](p1372_same_row_intensity_pick_removes_position.md).
2. **Baseline, SQL only, no code.** For signed-in people whose first stored position falls after 2026-04-09 (earlier history is undercounted per the P677 trigger fix), compute the share who store a non-default intensity **within their first N positions** (fixed exposure window, the same for every cohort). Stratify by surface (letter via `letter_point_responses` joined through `letter_deliveries.receiver_profile_id`, vs `point_positions`) and by letter. Record the query and numbers in this spec. Call the outcome **"non-default use"**, not "learning": a person who opens the menu and keeps the default is invisible to it.

### Phase 1 — Cheapest intervention: fix the tip that already exists (letters only)

**Copy shipped to main 2026-09-29 (founder-approved):** *"Tap again if you disagree only Somewhat, or Strongly"* (Agree variant swaps the verb; no text after Unsure). Salience and the learning-signal instrumentation below are still open.

- Replace the inline tip copy with wording that names the real sequence without the rejected "double-click" string, e.g. *"Tap Disagree again for Somewhat or Strongly"* [FOUNDER DECISION: copy], and raise its salience.
- Instrument learning with one signal, used both for measurement and any later stop rule: **picked a row in the intensity menu (any row)**, emitted from `handleIntensityClick` only. It fires only for groups with more than one level (not the Unsure clear-only menu) and never when `isControlled`, so the tutorial demo's puppet cannot emit it.
- Re-measure against the Phase 0 baseline on the same window definition. If non-default use moves past the pre-registered threshold (below), stop here; Phases 2–3 are unnecessary.

### Phase 2 — Contextual one-shot nudge (only if Phase 1 falls short)

Replace the always-on tip with a nudge anchored to the selected button after a plain first click.
- **Placement contract:** above the button group or in place of the tip row, never below it (the menu portal, the Radix tooltip and the fixed advance CTA already occupy that space). Suppress the tooltip while the nudge is visible, and remove the nudge before the menu takes focus.
- **Interaction contract:**
  - no focus theft;
  - `aria-describedby` on the selected button plus one polite announcement;
  - input-neutral copy;
  - no hit-target interception;
  - suppress on `iconOnly`/compact renders (under 270px there is no label to point at);
  - an impression counts only if visible for ≥1s.
- **Forced modal:** [FOUNDER DECISION: supersede P867?] P867 kept the forced first-time modal as settled and warned that pure opt-in recreates the discovery gap. Removing it, or keeping it only for the CK letter, is a new decision that must be logged as superseding P867.
- **Surfaces:** letters first. [FOUNDER DECISION: scope] Extending to non-letter surfaces is a first-time decision, not a Round-G supersession. Round-G is a code comment in `PositionButton.tsx` with no `decisions.md` entry, and it is stale: it names a "Show me" overlay that no longer exists. Live sessions stay out until two-party E2E covers them (P852 requirement).

### Phase 3 — Re-show and stop rules (ships with Phase 2 as one state machine)

- **State:** `plain_selections`, `impressions`, `learned` (from the Phase 1 signal).
- **Show** on plain selections 1, 3 and 8 [FOUNDER DECISION: schedule].
- **Plain Disagree** may pull the next scheduled impression forward once, with a cooldown of at least 1 selection. It never spends more than one extra impression, so a Disagree-heavy reader cannot burn the cap on consecutive clicks.
- **Stop** permanently on `learned`, or after 3 counted impressions.
- **Storage** [FOUNDER DECISION]: profile field for signed-in users, with a `localStorage` fallback for anon readers merged on signup. Positions-derived state is rejected because it cannot observe menu opens.
- **Measurement design** [FOUNDER DECISION]: either a contemporaneous randomized holdout at the eligible click (causal), or an accepted before/after on the fixed window (confounded by cohort mix and letter content). At current traffic a holdout may not reach the minimum N in a useful window. If so, say so and treat the result as directional.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| Promoting the menu increases accidental position removal | MITIGATE | Phase 0.1 fixes same-row toggle-off before any teaching change |
| Demo puppet emits fake "learned" events | MITIGATE | Events fire from user handlers only, never when `isControlled`; tested |
| Mixpanel undercounts (tracker blockers) | ACCEPT | Mixpanel is supporting evidence; primary oracle is the DB window query |
| DB oracle misses anon readers who never sign in (pending responses expire after 24h) | ACCEPT | Population is explicitly signed-in/converted readers; stated in every result |
| Deliberate default choosers look like non-learners | ACCEPT | Learning signal is "picked any menu row"; DB metric is labeled "non-default use" |
| Before/after confounded by cohort and letter content | MITIGATE | Fixed window, stratify by letter; holdout if traffic allows |
| Removing the forced modal breaks e2e fixtures | MITIGATE | Update `playwright.config.ts` storage seed, `e2e/p1231-intensity-tutorial-gate.spec.ts` and all gate consumers in the same change |
| Letter engage `counts` priming invariant broken | MITIGATE | Do not touch `counts={ZERO_COUNTS}` on engage-phase calls |

**Non-Goals**
- Do NOT change Model C′ click semantics, beyond making same-row pick a no-op (Phase 0.1).
- Do NOT add a tiny chevron (P521: undiscoverable). A labeled text cue is not ruled out by P521.
- Do NOT delete `IntensityTutorialModal`; it remains the "?" replay.
- Do NOT teach intensity on the Unsure group.

## Invariants

- Any demo, hint or copy describing the gesture matches `handleGroupClick`'s real sequence click-for-click (decisions.md 2026-06-01, P867).
- Engage-phase `PositionButtons` calls in the letter flow keep `counts={ZERO_COUNTS}`.
- Clear is the only path that removes a position (P847).

## Acceptance Criteria

**Phase 0**
- [ ] Picking the currently selected level from the menu leaves the position unchanged on every consumer, including anon and signed-in paths. There is an integration test per consumer.
- [ ] The baseline query and its numbers are recorded here, with the population, window N, date floor and strata stated.

**Phase 1**
- [ ] The letter tip shows the new copy. It no longer contains the standalone "double-click" string.
- [ ] Picking a menu row emits exactly one event with a whitelisted property set (group, level, surface). A dedicated contract test rejects any extra key; the P1304 scan is not relied on, since it permits `session_id`.
- [ ] The tutorial demo loop emits zero learning events (test with the modal open for 3 loops).
- [ ] Opening the Unsure clear-only menu emits no learning event.

**Phases 2–3** (only if Phase 1 falls short)
- [ ] A first-time reader's plain first click shows the nudge. It does not overlap the menu, the tooltip, the "?" or the advance CTA, verified by screenshots at 320, 375 and desktop.
- [ ] After any menu-row pick, the nudge never appears again on any in-scope surface or signed-in device.
- [ ] A reader who ignores it sees at most 3 counted impressions. Consecutive plain Disagrees do not exhaust the cap early.
- [ ] Screen readers get one polite announcement. Focus is never moved by the nudge.
- [ ] The forced-modal behavior matches the founder's P867 decision, and e2e fixtures are updated accordingly.
- [ ] The pre-registered comparison is run and recorded here. `[post-deploy]` The re-measure runs once N post-release people exist.

## Decision Criteria

Pre-register before Phase 1 ships, with the founder's numbers filled in:
- **Window:** first N positions per person [FOUNDER DECISION: N].
- **Threshold:** Phase 1 counts as fixed if non-default use rises by ≥X percentage points over baseline [FOUNDER DECISION: X], with at least M people in the post-release cohort [FOUNDER DECISION: M].
- **Otherwise:** if M is not reached within the window [FOUNDER DECISION: how long], report the result as directional and decide on qualitative evidence (session replays).
- **Escalation:** if Phase 2 also fails to move the number, revert to the tip plus "?" replay rather than escalating visual weight.

## Alternatives Considered

- **Randomize/instrument only the existing tip.** Adopted as Phase 1. It needs no new component and touches no shared-button blast radius.
- **Auto-open the menu on the first selection (letters only, once).** It is not refuted by P847's conflation finding, because P847 deleted the destructive branch. The live objection is decisions.md 2026-05-20 alt (b), "the dropdown becomes friction in the common path". Keep this as a Phase 2 variant if the nudge is rejected.
- **Time-based re-show (every N days).** Rejected: elapsed time says nothing about whether the person learned.

## Open Questions

1. Is intensity wanted on non-letter surfaces at all? This is a first-time decision; there is no prior ruling.
2. Is signed-in-only measurement acceptable, given that anon CK readers are likely the population the founder observed?

## Related

P521 (auto-dropdown) · P847 (Model C′; Clear as the only destructive path) · P852 (forced tutorial; Round-G code comment) · P862 (`inert` tip row) · P867 (3-click ruling; forced modal preserved) · P1231 (tutorial-gate e2e) · P1304 (analytics property scan) · P677 (position-history trigger fix) · P684 (anon pending responses)

## Review log

2026-09-29: adversarial review by two independent reviewers (Opus, Codex Sol). Both returned "rethink". Findings adopted:
- the existing inline tip;
- the missing tutorial-exposure split;
- the tenure-biased "ever used" metric;
- a single learning signal;
- demo-puppet instrumentation;
- the same-row removal bug;
- the P867 supersession;
- the Disagree cap interaction;
- placement and a11y contracts;
- e2e fixture fallout;
- the P1304 blind probe.
