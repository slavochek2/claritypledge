# P85: 5-Point Position Scale for Points

## Context

Currently, Points show simple Agree/Disagree/Unsure buttons with counts inside the buttons. This doesn't capture nuanced positions ("I somewhat agree") or show engagement distribution visually.

Related to H2 (Visibility changes behavior) and future H-Core (Asymmetric Conversion) which requires before/after position tracking.

## Problem

1. 3-point scale (Agree/Disagree/Unsure) lacks granularity for "leaning" positions
2. No visual representation of position distribution
3. "Engaged" label is unclear (sounds like general engagement, not position-taking)
4. Inconsistent with Story engagement displays ("Accepted By", "Inspired")

## Solution

Implement 5-point position scale with visual distribution bar:

### Scale Values (-2 to +2)

| Value | Button Label | Hover Tooltip |
|-------|--------------|---------------|
| -2 | `Strongly Disagree` | (none needed) |
| -1 | `Disagree` | Somewhat disagree |
| 0 | `Unsure` | Unsure / Undecided |
| +1 | `Agree` | Somewhat agree |
| +2 | `Strongly Agree` | (none needed) |

### UI Layout

**Option A: Counts inside buttons (simpler, keep current architecture)**
```
┌─────────────────────────────────────────────────────────┐
│ ⚲ Point                                                 │
│ Code reviews are more valuable than automated tests     │
│                                                         │
│ [Strongly Disagree 3] [Disagree 5] [Unsure 8] [Agree 15] [Strongly Agree 23] │
│                                                            ↑ You selected     │
└─────────────────────────────────────────────────────────┘
```

- Minimal changes to existing code
- Counts directly visible per position
- No distribution bar needed
- Total can be computed (3+5+8+15+23 = 54)

**Option B: Distribution bar + buttons (more visual)**
```
┌─────────────────────────────────────────────────────────┐
│ ⚲ Point                                                 │
│ 👤👤👤 54 stances                                        │
│                                                         │
│ Code reviews are more valuable than automated tests     │
│                                                         │
│ ▓▓░░░░░░░████░░░░░░░░░░░░░░██████████████████████████  │
│                                                         │
│ [Strongly Disagree] [Disagree] [Unsure] [Agree] [Strongly Agree] │
│                                                    ↑ You │
└─────────────────────────────────────────────────────────┘
```

- Distribution bar shows proportions visually
- **Hover on bar segment** → tooltip shows count (e.g., "23 strongly agree")
- Cleaner buttons without numbers
- Requires more UI work

**Recommendation: Option A** — Keep counts in buttons, just expand from 3 to 5 buttons. Simpler implementation, still shows all data.

## Key Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Scale granularity | 5-point (-2 to +2) | Captures "leaning" positions, maps to future 7-point if needed |
| UI approach | **Option A: Counts in buttons** | Simpler implementation, keeps existing architecture |
| Button labels | Standard Likert (Strongly Disagree...Strongly Agree) | Unambiguous, familiar from surveys |
| Count display | Inside each button (e.g., "Agree 15") | Users see breakdown at a glance |
| Total count | Computed sum of all positions | No separate "stances" label needed |

## Components Affected

Update these locations for consistency:

1. **PointCard** component (main Point display)
2. **QuotedPoint** component (Points referenced in Stories)
3. Feed view (all Points in feed)
4. Profile Points section (user's Points)
5. Event Points section (Points within events)

## Database Schema

Assuming we already track positions. If not, need:

```sql
-- Position values: -2, -1, 0, +1, +2
-- Existing schema likely supports this already
```

## Implementation Notes

**For Option A (recommended):**
- Expand existing button group from 3 to 5 buttons
- Each button shows: `[Label Count]` (e.g., "Agree 15")
- Selected button uses blue highlight (existing pattern)
- Unselected buttons use gray (existing pattern)
- User's selection persists and is highlighted
- Color palette: Use design system colors (blue for selected, gray for unselected)
- Accessibility: Ensure keyboard navigation works, ARIA labels for screen readers

**For Option B (if distribution bar desired later):**
- Distribution bar uses proportional widths based on position counts
- Hover state on bar segments shows tooltip: "{count} {position label}"
- User's current position marked with "↑ You" indicator

## Success Criteria

- [ ] All Point cards consistently show 5-point scale
- [ ] Distribution bar accurately reflects position breakdown
- [ ] "stances" label appears consistently across all views
- [ ] Hover tooltips work on distribution bar segments
- [ ] Expanded view shows numbers above bar
- [ ] No visual regressions in existing layouts
- [ ] Mobile: buttons are tappable, layout doesn't break

## Future Considerations

- If H-Core testing requires 7-point scale, add ±3 "Extremely Agree/Disagree" options
- Consider animating distribution bar changes when new positions added
- Could add "position change" indicator for users who change their stance after verification

## Migration from 3-point

Current 3-point positions map to 5-point:
- Agree → +2 (Strongly Agree)
- Disagree → -2 (Strongly Disagree)
- Unsure → 0 (Unsure)

Or treat existing data as "moderate" positions:
- Agree → +1 (Agree)
- Disagree → -1 (Disagree)
- Unsure → 0 (Unsure)

**Decision needed:** Which mapping strategy? Recommend treating old votes as moderate (+1/-1) since they didn't express "strongly."
