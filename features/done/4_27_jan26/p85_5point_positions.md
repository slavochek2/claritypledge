# P85: 7-Point Position Scale with 3-Button UI

## Context

Currently, Points show simple Agree/Disagree/Unsure buttons. This doesn't capture nuanced positions needed for the **Asymmetric Conversion Hypothesis** (v7 vision), which requires tracking position *magnitude* changes before/after verified understanding.

**V7 vision requirement:** 7-point Likert scale (-3 to +3) to distinguish "moved a little" from "completely changed mind."

**UX constraint:** 5+ buttons don't fit on mobile (375px width).

## Problem

1. 3-point scale lacks granularity for measuring conversion magnitude
2. 5+ buttons break mobile layout (discovered during implementation)
3. No way to flag "false premise" (the Point itself is flawed)

## Solution: 3 Buttons + Intensity Dropdowns

Keep clean 3-button UI, expose 7-point granularity via dropdowns.

### Card View (Compact)

```
┌─────────────────────────────────────────────────────────┐
│ ⚲ Point                                                 │
│ Code reviews are more valuable than automated tests     │
│                                                         │
│ [Disagree ▾ 8]  [Unsure ▾ 2]  [Agree ▾ 15]             │
│       ↑ selected                                        │
└─────────────────────────────────────────────────────────┘
```

### Interaction Model

| Button | Click (default) | Dropdown options |
|--------|-----------------|------------------|
| **Disagree ▾** | -2 (Disagree) | Strongly Disagree (-3), Disagree (-2), Somewhat Disagree (-1) |
| **Unsure ▾** | 0 (Unsure) | Unsure / Undecided (0), False Premise (flag) |
| **Agree ▾** | +2 (Agree) | Somewhat Agree (+1), Agree (+2), Strongly Agree (+3) |

**Quick path:** Click button → done (uses default value)
**Refined path:** Click dropdown → select intensity

### Detail View (Full Distribution)

```
┌─────────────────────────────────────────────────────────┐
│ ⚲ Point                                                 │
│ Code reviews are more valuable than automated tests     │
│                                                         │
│ Your position: [Disagree ▾]  (dropdown to change)       │
│                                                         │
│ Distribution (25 positions):                            │
│ Strongly Disagree  ███ 3                                │
│ Disagree           █████ 5                              │
│ Somewhat Disagree  ██ 2                                 │
│ Unsure             ██ 2                                 │
│ Somewhat Agree     ███ 3                                │
│ Agree              █████ 5                              │
│ Strongly Agree     █████ 5                              │
│ False Premise      █ 1                                  │
└─────────────────────────────────────────────────────────┘
```

## Scale Values (7-Point + Flag)

| Value | Label | When shown |
|-------|-------|------------|
| -3 | Strongly Disagree | Disagree dropdown |
| -2 | Disagree | Disagree dropdown (default) |
| -1 | Somewhat Disagree | Disagree dropdown |
| 0 | Unsure / Undecided | Unsure dropdown (default) |
| +1 | Somewhat Agree | Agree dropdown |
| +2 | Agree | Agree dropdown (default) |
| +3 | Strongly Agree | Agree dropdown |
| flag | False Premise | Unsure dropdown |

### Why Not "Depends"?

"Depends" = "I lean one way with conditions" = just use -1 or +1.

The conditions/context belong in the user's **Story**, not the position itself.

### False Premise

A meta-critique: "The Point itself is flawed, I reject the framing."

Example:
> Point: "Remote work is more productive than office work"
> - Disagree = "Office work is more productive"
> - False Premise = "This comparison is meaningless without specifying work type"

## Data Model

```typescript
type PositionValue = -3 | -2 | -1 | 0 | 1 | 2 | 3;

interface PositionEntry {
  position: PositionValue;
  isFalsePremise: boolean;  // true = user flagged as false premise
  timestamp: string;
}
```

**Counts for display:**
- Disagree button count = sum of -3, -2, -1
- Unsure button count = sum of 0 + false premise flags
- Agree button count = sum of +1, +2, +3

## Key Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Scale | 7-point (-3 to +3) | V7 vision requires conversion magnitude tracking |
| UI buttons | 3 (Disagree/Unsure/Agree) | Mobile-friendly, clean |
| Granularity access | Dropdowns | Progressive disclosure |
| Default click values | -2, 0, +2 (moderate) | Most common case, quick interaction |
| False Premise | Under Unsure dropdown | Meta-critique, not a position on the spectrum |
| "Depends" option | Not included | Use ±1 + Story for conditional positions |

## Components Affected

1. **PositionButtons** - Add dropdown menus to each button
2. **PositionButton** - Handle dropdown state and selection
3. **PointCard** - Show aggregated counts per button group
4. **PointDetail** - Show full 7-point distribution breakdown
5. **Types** - Update PositionType to support -3 to +3

## Success Criteria

- [ ] 3 buttons fit on mobile (375px) in one row
- [ ] Click button = quick position (default value)
- [ ] Dropdown = refined position selection
- [ ] False Premise available under Unsure
- [ ] Detail view shows full 7-point breakdown
- [ ] Counts aggregate correctly (button shows sum of its range)
- [ ] Existing positions migrate to moderate values (-2/0/+2)

## Migration

Existing 3-point data maps to 7-point moderate values:
- `agree` → +2
- `disagree` → -2
- `dont_know` → 0

This preserves meaning: old "Agree" wasn't "Strongly Agree", just regular agree.

## Future Considerations

- Position change tracking for H-Core (compare before/after verification)
- AI flagging of Points with high "False Premise" rate
- Tooltip hints on dropdown options ("Somewhat = leaning but not certain")
