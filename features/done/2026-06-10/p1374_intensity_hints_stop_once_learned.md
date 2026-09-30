---
status: all-done
type: story
rank: 13
created_date: '2026-09-30'
tags: [position-buttons, onboarding, intensity, letters]
disclosure: public
pipeline_ran: [create-spec, dev, ship]
drafted_by: opus
exec_model: opus
exec_effort: medium
driver: heuristic
completed_at: 2026-09-30
---

# P1374: Intensity hints follow one rule on every page and stop once the reader has learned

## Problem

Letters teach the intensity gesture (tap the selected button again, then pick Somewhat or Strongly) in two places, and each runs its own rule:

| | When it shows | When it stops |
|---|---|---|
| Forced tutorial modal | first letter engage phase, once per browser | after Continue |
| Inline tip line under the buttons | after every selection, every question | never |

The two also disagree in wording. The modal still says *"Double-click to pick 'somewhat disagree'"*. The tip line was changed on 2026-09-29 to *"Tap again if you disagree only Somewhat, or Strongly"*.

Nothing notices when a reader has already learned. A reader who picks "Somewhat disagree" on question 1 still sees the tip on every later question.

> Founder framing, verbatim: "we need to look at it as a whole, holistically. When do we show this text? When do we show the pop-up? … We cannot show this text all the time, right? But if we have the heuristic, then it needs to take into account both or not."

**Scope widened 2026-09-30 (founder):** most people meet points on /stake, the feed or profiles first, and P1336 onboarding asks for positions too. None of those taught the gesture.

> "what about when … they are on let's say slash stake or slash feed or on some profile … and they discover for the first time or on onboarding"

## Appetite

- **Blast radius:** every `PositionButtons` surface (shared component) plus letter engage phases.
- **Reversibility:** git revert. The new state is one browser storage key.
- **Decision density:** zero. The founder approved the rule and the wording on 2026-09-30.

## Solution

One question governs both hints: **has this reader ever picked Somewhat or Strongly in a letter?** This is stored per browser, like the existing tutorial-seen key.

1. Not learned and tutorial not seen → the modal auto-opens once (unchanged trigger).
2. Not learned and tutorial seen → the tip line shows after an Agree or Disagree selection.
3. Learned → neither shows. The "?" replay stays available after any selection.

"Learned" is set the moment a reader picks **any row from the level menu** (the default level included: opening the menu and choosing proves they found the gesture), on any page, or when a `somewhat_*`/`strongly_*` position arrives in a letter. The tutorial demo's buttons cannot set it: its `onPositionClick` is a no-op.

The modal title uses the same sentence as the tip: *"Tap again if you disagree only Somewhat, or Strongly"*.

**Every other page:** the shared `PositionButtons` shows the same one-line hint under the buttons, only on the instance just tapped, right after a plain Agree/Disagree pick. It also shows in icon-only mode on phones. It disappears when the menu opens. A reader's own Somewhat/Strongly pick on any page sets the same site-wide flag (`intensity_learned_at_v1`), and it is never set from the controlled tutorial demo. Letter engage phases pass `intensityHint={false}`, because they keep their own tip row with the "?" replay. The hint line is left-aligned with the card's other helper lines and starts with a "?" that plays the tutorial pop-up. The pop-up does not auto-open on first contact outside letters, because on /stake people are browsing. Instead it opens **once** after 5 plain Agree/Disagree picks (counted across letters and every other page) with no level ever chosen. It never opens if the pop-up was already seen anywhere, since there is one seen flag for both triggers (founder, 2026-09-30). Outside letters the pop-up has a close X and honours ESC or an outside click, because it interrupts browsing. Letters keep the forced form. Only one hint shows on a page at a time, and a pick anywhere hides every hint at once. Analytics: `intensity_tutorial_shown`/`_dismissed` carry a `trigger` (`letter-first-run`, `letter-replay`, `hint-help`, `plain-picks`), and `intensity_level_picked_first` fires on a reader's first menu pick. The story composer opts out of the hint (`intensityHint={false}`).

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| Per-browser state: a new device shows hints again | ACCEPT | Same as today's tutorial gate; account-level state is P1371 Phase 3 |
| Hint line adds height under a just-tapped card (feed/stake) | ACCEPT | One line, only on the tapped card, only until learned; checked at 375px on /stake and /feed |

**Non-Goals**
- Do NOT auto-open the tutorial pop-up on first contact outside letters. Its only triggers there are the hint's "?" and the one-time 5-plain-picks rule.
- Do NOT add re-show schedules beyond the one plain-picks counter (P1371 Phase 3).
- Do NOT change `counts={ZERO_COUNTS}` on engage-phase calls.

## Invariants

- Any copy describing the gesture matches the real sequence click-for-click (decisions.md 2026-06-01, P867).

## Acceptance Criteria

- [x] With no stored state, the modal opens on the first engage phase. Its title reads "Tap again if you disagree only Somewhat, or Strongly". — unit test `p1374-intensity-hints-learned` (no stored state, both engage phases) + e2e `p1231` cleared-state case (dialog title), 2026-09-30.
- [x] After the modal is dismissed, selecting Agree or Disagree shows the tip line (Agree variant swaps the verb). Selecting Unsure shows no tip text. — unit tests (Agree/Unsure, both phases); founder browser UAT on the letter 2026-09-30 ("that works").
- [x] After the reader picks any Somewhat or Strongly level, the tip text disappears immediately. It stays gone on later questions and on reload in the same browser, and the modal does not auto-open. — unit tests (immediate hide, persisted flag, no auto-open when learned); founder UAT. Reload persistence = stored flag, covered by the learned-state test.
- [x] The "?" replay still opens the modal after any selection, learned or not. — unit test (learned → "?" still opens the dialog).
- [x] On /stake, feed, point, story and profile pages, a plain Agree/Disagree tap shows the hint under that point only (also at 375px, icon-only). Unsure shows none. It hides when the menu opens. — headless browser at 375px on /stake and /feed: one hint, under the tapped point only (2 cards → 1 hint); unit tests for Unsure and menu-open hide. Point/story/profile pages share the same component and are unit-covered, not browser-checked.
- [x] Outside letters, the hint's "?" opens the tutorial pop-up. After 5 plain picks with no level chosen, the pop-up opens once, and never if it was already seen (in a letter or earlier). — unit tests (4th pick no dialog, 5th opens, never twice, not if seen) + headless browser on /stake: dialog on the 5th pick, close button present, Escape closes, no re-open.
- [x] A Somewhat/Strongly pick on any page stops the hint everywhere, letters included (and the letter pop-up no longer auto-opens). — unit tests (two cards; letter tip hides on a pick elsewhere; blocked storage).
- [x] Unit tests cover all three states and the shared hint. The existing P862 and P1231 tests pass. — 5,036 unit tests pass (JSON reporter, 0 failed); `p1231` e2e 2/2 pass.

## Related

P1371 (umbrella: intensity discoverability) · P852 / P867 (modal) · P862 (tip row `inert`) · P1231 (tutorial-gate e2e)
