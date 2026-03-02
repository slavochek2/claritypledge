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

## Raw ideas processing has no skill (`/process-raw-ideas`)

**Date:** 2026-03-01
**Status:** proposed

Two separate sessions involved processing voice notes into structured product/philosophical content (extract ideas → classify → file spec / doc update / private content). Each session reinvented the intake flow with no template: what gets filed where, what stays private, what becomes a spec vs doc update.

**Fix:** Create `/process-raw-ideas` skill. Steps: (1) read raw transcript, (2) extract distinct ideas, (3) classify each: spec / doc update / private / drop, (4) file or draft in the right place, (5) surface open questions and dropped threads. Should handle the "some content is private, some public" split explicitly.
---

