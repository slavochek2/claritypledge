# Process Learnings

Open friction items — proposed fixes not yet implemented. Surfaced in `/weekly` step 2.5.

**Format:** Each entry has a `Status: proposed` field. Once resolved → remove from here, add to `docs/decisions.md` as `[process]` tag entry.

---

## /dev pre-flight doesn't check branch lineage — /ship surprise risk

**Friction:** Ran `/dev` while on `p422-p425-uat` (40+ commits ahead of main). `/dev` silently branched from it. After implementation + `/verify` pass, user asked about `/ship` — and only then discovered it would ship all 40+ commits, not just the new work. Fix was written to `dev.md` (warn when > 5 commits ahead of main, offer A/B/C) but the file was reverted before the session ended.

**Proposed fix:** Re-apply the branch lineage check to `/dev` pre-flight step 0:
- Run `git rev-list --count main..HEAD` before branching
- If > 5 commits ahead: stop, explain, offer A) branch from main / B) cherry-pick after / C) proceed knowingly
- Add same check to `/pick-flow` scope scoring table

**Status:** proposed

---

## Never invent specific thresholds in permanent docs

**Date:** 2026-02-28
**Status:** proposed

When writing a principle to CLAUDE.md, a specific threshold ("30 minutes") was fabricated rather than derived from the actual incident. The user had to correct it. Invented specifics in permanent docs become authoritative in future sessions.

**Fix:** When a threshold is needed, derive it from the actual incident — or omit the number and describe the condition instead.

---

## Dead code not caught by /review-all or pre-commit

**Date:** 2026-03-02
**Status:** proposed

`PointCardDetail.tsx` had zero production callers and lived in `src/app/components/` undetected — caught only by an ad-hoc consistency audit, not by `/review-all` or any automated check. `/review-all` checks correctness and patterns; it does not detect zero-caller exports.

**Fix:** Add dead-code detection (`knip` or `ts-prune`) to `scripts/pre-commit-checks.sh` or as a step in `/maintain:cleanup`. Zero-caller components accumulate silently across feature merges.

---

## Raw ideas processing has no skill (`/process-raw-ideas`)

**Date:** 2026-03-01
**Status:** proposed

Two separate sessions involved processing voice notes into structured product/philosophical content (extract ideas → classify → file spec / doc update / private content). Each session reinvented the intake flow with no template: what gets filed where, what stays private, what becomes a spec vs doc update.

**Fix:** Create `/process-raw-ideas` skill. Steps: (1) read raw transcript, (2) extract distinct ideas, (3) classify each: spec / doc update / private / drop, (4) file or draft in the right place, (5) surface open questions and dropped threads. Should handle the "some content is private, some public" split explicitly.

---

## Sessions end without filed material — propagation chain breaks

**Date:** 2026-03-03 (confirmed across multiple Feb 28 sessions)
**Status:** proposed

People leave calibration sessions without filed stories or points. When nothing is filed, there is no material for the mirror agent briefing protocol, no input for the filing loop propagation hypothesis (H-FilingLoop-Propagation), and no record of the session's insights. The propagation chain requires filing to work — a session that produces nothing filed generates nothing next. Slava's presence remains the only mechanism to initiate the next session.

Confirmed via: sessions run Feb 28 — participants reported insights during session but nothing was filed after.

**Proposed fix:** File capture must happen IN session, not as homework. Either: (a) Slava files stories/points live during the session using the filing chat, or (b) end-of-session ritual includes explicit 5-min filing moment before closing. The filing chat UI is the tool; building the habit of using it in-session is the intervention.
---

