---
status: blocked
type: task
rank: 0.5
tags:
  - points
  - content-quality
  - sifter
blocked_by: p523
created_date: 2026-03-18T00:00:00.000Z
flow: inline
locked_at: '2026-03-18T07:47:12.103Z'
---

# P544: Prod Point Quality Audit

**Blocked by:** P523 (Point-to-Point References) — P523 redesigns point schema and creation flow. Audit changes should land after that migration.

---

## Problem

9 points in prod. Only 2 (Points 3 & 4) pass the sifter-point skill's own criteria. Issues:

| Issue | Points |
|-------|--------|
| Em dashes (skill bans them) | 1, 2, 3, 4, 5, 6 |
| Embedded marketing links (fails stranger test) | 5, 7, 8, 9 |
| Not a point — CTA/marketing | 7 |
| Duplicate (identical text + hashtag in body) | 8 & 9 |
| Mixed type (mechanism + stance conflated) | 5 |
| Near-redundant with another point | 6 ≈ 3 |
| Hedged to unfalsifiability | 2 |

## Scope

### Structural (delete/deduplicate)
- [ ] Delete Point 9 (76f003ef) — duplicate of Point 8 with `#partners` in text body
- [ ] Delete or reclassify Point 7 (b5e70000) — CTA, not a point. Consider a separate content type if needed.

### Content rewrites
- [ ] Point 1: Cut opening assertion ("Most people assume..."), lead with mechanism
- [ ] Point 2: Remove hedge ("Sometimes emotional regulation comes first. But the sequence holds.") — either commit to the claim or split into two points
- [ ] Point 5: Split mechanism (common knowledge) from stance (no valid reason to decline). Remove links.
- [ ] Point 6: Merge into Point 3 or differentiate (currently redundant)
- [ ] Points 1-6: Replace all em dashes with sentence breaks
- [ ] Points 5, 8: Strip claritypledge.com links from statement text. Use `context` column if context needed.

### Process improvement (optional, post-P523)
- [ ] Persist sifter scores (falsifiable, counterfactual, hard-to-vary, user-voice) alongside points
- [ ] Add minimum score threshold to point creation flow
- [ ] Run stranger test as separate-agent check before prod insertion

## Acceptance Criteria

- All surviving points pass: falsifiable, counterfactual, hard-to-vary, stranger test
- No duplicates
- No marketing links in statement text
- No em dashes
- Each point is either clearly mechanism (third-person) or clearly stance (first-person), never mixed

## Notes

This is a content quality pass, not a schema change. P523 goes first because it may change how points are stored/versioned. Rewrites here should use whatever schema P523 lands.
