# P60 Implementation Decisions

Running log of decisions made during P60 (Exploration UX) implementation.

---

## D1: Position Button Colors (2025-01-21)

**Question:** What colors for Agree/Disagree/Unsure buttons and badges?

**Options:**
| Option | Agree | Disagree | Unsure | Pros | Cons |
|--------|-------|----------|--------|------|------|
| A) Monochromatic | Blue | Blue | Gray | Design-system compliant, no moral judgment | Less instant recognition |
| B) Semantic | Green | Red | Gray | Instantly recognizable | Violates design system, implies "agree=good" |

**Decision:** Option A — Monochromatic blue

**Rationale:**
1. Design system says: green=SUCCESS only, red=DESTRUCTIVE only
2. Using green/red would imply moral judgment (agree=good, disagree=bad)
3. Product philosophy: all positions are valid for understanding

**Implementation:**
- Active Agree: `blue-500`
- Active Disagree: `blue-500` (was `blue-600`, standardized)
- Active Unsure: `gray-500`
- Inactive: gray outline
- Badges: blue tint for Agrees, gray tint for Disagrees

---

## D2: (next decision goes here)

