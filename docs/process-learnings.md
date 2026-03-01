# Process Learnings

Open friction items — proposed fixes not yet implemented. Surfaced in `/weekly` step 2.5.

**Format:** Each entry has a `Status: proposed` field. Once resolved → remove from here, add to `docs/decisions.md` as `[process]` tag entry.

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

