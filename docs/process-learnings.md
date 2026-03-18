# Process Learnings

Open friction items — proposed fixes not yet implemented. Surfaced in `/weekly` step 2.5.

**Format:** Each entry has a `Status: proposed` field. Once resolved → remove from here, add to `docs/decisions.md` as `[process]` tag entry.

---

## Optional-param handler as onClick — TypeScript silent, runtime crash

**Date:** 2026-03-05
**Status:** proposed

`onClick={handlerFn}` where `handlerFn(param?: string)` — React passes the MouseEvent as `param`. TypeScript allows it (MouseEvent satisfies the optional position). Runtime: `param.trim()` throws TypeError. No compile error, no lint warning, no pre-commit catch. P472: "I Accept & Co-Sign" button silently broken; passed /verify's full 7-scenario run.

Pattern is documented in decisions.md [2026-03-05 technical]. No mechanical enforcement exists.

**Fix options:** (A) Custom ESLint rule: flag any event prop where the handler function has a non-event first parameter type. Complex to write. (B) Code review pattern: check if optional-param functions are assigned directly to event props when reviewing handlers. Low overhead, relies on discipline. (C) Investigate `typescript-eslint` strict plugins (e.g., `no-unsafe-argument`) — may surface this class of error.

---

## /dev pre-flight doesn't check branch lineage — /ship surprise risk

**Friction:** Ran `/dev` while on `p422-p425-uat` (40+ commits ahead of main). `/dev` silently branched from it. After implementation + `/verify` pass, user asked about `/ship` — and only then discovered it would ship all 40+ commits, not just the new work. Fix was written to `dev.md` (warn when > 5 commits ahead of main, offer A/B/C) but the file was reverted before the session ended.

**Proposed fix:** Re-apply the branch lineage check to `/dev` pre-flight step 0:
- Run `git rev-list --count main..HEAD` before branching
- If > 5 commits ahead: stop, explain, offer A) branch from main / B) cherry-pick after / C) proceed knowingly
- Add same check to `/pick-flow` scope scoring table

**Status:** proposed

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

---

<!-- Removed 2026-03-16: "Session goal alignment needed at start" — see P518 -->
<!-- Removed 2026-03-16: "Listener needs exactly two choices" — see P517 -->
<!-- Removed 2026-03-16: "Future event formats to test (parked)" — no longer relevant -->
<!-- Moved 2026-03-16: "Framework iteration without execution progress", "Gap reveal not yet reliable", "Externality claim unproven" — moved to pp/docs/decisions.md -->

## Mobile UX bugs are session-killers

**Date:** 2026-03-14
**Status:** proposed

Observed during Pair C session. Three bugs that break the session flow:
1. **Scroll bounce → accidental refresh:** On mobile, scrolling up causes the page to refresh, kicking the user out of the active /live session. Session state lost.
2. **Tap targets too small:** Users with long nails miss the intended button and accidentally hit "speak freely" instead. Not clear what mode they're in afterward.
3. **Position removal on click unclear:** Clicking on an already-taken position removes it, but there's no visual feedback or confirmation. Users don't realize they've un-positioned.

**Fix:** These should be fixed before the next facilitated session — each one causes visible confusion and breaks the experience for channel partners evaluating the tool.

---
