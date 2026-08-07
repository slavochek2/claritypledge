---
status: backlog
type: task
rank: 0
created_date: '2026-06-26'
tags:
  - pledge
  - cpa
  - oath-versioning
  - copy
delivery_stage: create-spec
pipeline_ran:
  - create-spec
locked_at: '2026-07-04T10:50:42.239Z'
---

# P965: Pledge/CPA v6 — Cost-Acknowledging Exception Clause + Judgment-Language Tightening

## Problem

**Situation:** The shared protocol oath (`VERIFIED_UNDERSTANDING_OATH` in `src/app/content/verified-understanding-oath.ts`, rendered by `pledge-text.tsx` and `agreement-versions.ts`) is at v5 (P928, "intention" → "intended meaning"). Three wording weaknesses surfaced under adversarial pressure in the 2026-06-26 "Survivorship bias" conversation, and the founder approved fixes for all three (via inline `[/cp]` markers).

**Complication:** The most important one — the **exception clause** ("If I can't give you an honest number in the moment, I'll explain why") — is where a person actually *declines* the protocol, and it goes silent on cost precisely there. That undoes the document's own thesis: the whole point is that an unbridged comprehension gap carries a real, growing cost. The clause lets the speaker off the hook with no acknowledgment of the bill.

**Question:** Bump the versioned oath to v6 with the three approved wording changes, keeping the version lineage and covering tests intact.

## Appetite

Low blast radius (copy in three content files + version bump; no flow/logic change). Medium reversibility — it's a versioned artifact, so v5 stays valid and certificates already minted reference their issued version; rolling back means not pointing new issuances at v6. Low decision density — wording is founder-approved; one open question (CPA singular-vs-plural framing) is explicitly deferred.

## Solution

Add `VERIFIED_UNDERSTANDING_OATH[6]` (and propagate to `pledge-text.tsx` / `agreement-versions.ts` current-version pointers) with these three changes:

1. **Subtitle / tagline.**
   - Old: tagline "We all crave being understood. Let's commit to listen." (`pledge-text.tsx:48`) and CPA subtitle "A mutual commitment to clarity" (`agreement-versions.ts:35`).
   - New: **"Surface the gap while it's still a minute wide."**
   - Reason: states the operating thesis — value lives in the narrow window where the gap is fresh and the bridge is still one paraphrase wide; makes the cheap-fix urgency legible.

2. **Judgment-language tightening (YOUR RIGHT line).**
   - Old: "how well I assume I cognitively understand the intention behind what you say" (`verified-understanding-oath.ts:33`).
   - New: **"how well I currently believe I cognitively understand your intended meaning."**
   - Reason: "assume" → "currently believe" makes it a time-indexed, fallible judgment, not a fixed assumption; "intention behind what you say" → "your intended meaning" continues the P928 intention→intended-meaning shift (rate the message, not the motive).

3. **THE EXCEPTION clause (highest-leverage).**
   - Old: "If I can't give you an honest number in the moment, I'll explain why." (`verified-understanding-oath.ts:43`, `pledge-text.tsx:61/80`).
   - New: **"If I can't give you an honest number, or can't explain back, in the moment, I'll tell you why. And I'm aware that even so, the gap between us carries a real cost to our understanding now, one that grows if we never return to it."**
   - Reason: old clause covered only inability-to-give-a-number; new covers inability-to-**explain-back** too (the capacity-depleted case), preserves the freedom to decline, and adds the cost-acknowledgment that was the thesis of the whole thread — "I won't pretend there is no bill." This is exactly where the ledger went silent; closing it is the point.

## Risks / Non-Goals

### Risks
- **Version-pointer drift:** `pledge-text.tsx` and `agreement-versions.ts` both reference the oath version; if only one is bumped, the Pledge and CPA render different text. Mitigation: update both pointers in the same change; assert equality in a test.
- **Stale certificates:** already-issued certificates/agreements reference their issued version. Mitigation: do NOT mutate v5 entries — add v6 as a new entry; existing artifacts keep rendering v5.
- **Longer exception clause overflows certificate layout** (`agreement-certificate.tsx`, export variant). Mitigation: visual check at 320/375/desktop before done.

### Non-Goals
- Do NOT mutate or delete the v5 oath entry — v6 is additive.
- Do NOT redesign the oath structure, the number-first flow (P855), or the points list.
- Do NOT resolve the Pledge↔CPA singular-"I"-vs-mutual-"we" framing in this spec (see Open Question) — wording only.
- Do NOT change `/pricing`, offers copy, or any text outside the three oath/agreement files.

## Open Question

`[FOUNDER DECISION]` The CPA is titled a *mutual* agreement, but its body is first-person singular ("I", "MY"). The 2026-06-26 conversation flagged that two reciprocal promises should either go plural in the body or make the mirrored-"I" framing visually explicit. **Should v6 also address this, or leave it for a follow-up spec?** Default: leave for follow-up (out of scope here).

## Done-When

- [ ] `VERIFIED_UNDERSTANDING_OATH[6]` exists; v5 entry unchanged
- [ ] Pledge and CPA both render v6 text (subtitle, YOUR RIGHT line, exception clause) — verified equal where shared
- [ ] Subtitle reads "Surface the gap while it's still a minute wide." in both Pledge and CPA surfaces
- [ ] Exception clause renders the full cost-acknowledging sentence on certificate + export at 320px, 375px, desktop without clipping
- [ ] Covering tests updated and green: `p857-agreement-versions`, `p461-agreement-certificate-text`, `p857-oath-emphasis`, and the P928 family that assert oath text
- [ ] A test asserts existing (v5-issued) certificates still render v5 wording (no retroactive mutation)

## Source

2026-06-26 "Survivorship bias in founder success stories" conversation; three founder-approved `[/cp]` markers. Surfaced via `/claude-conversations-to-cp`. Continues the oath-versioning lineage: P855 (v4, number-first) → P857 (versioning infra) → P928 (v5, intended meaning) → **P965 (v6)**.
