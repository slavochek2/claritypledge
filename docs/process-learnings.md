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

## Post-compaction: pending doc writes auto-executed without re-confirming decisions

**Date:** 2026-03-03
**Status:** proposed

After context compaction, Claude resumed at "Step 4: proposing doc edits" and applied strategy doc changes without first surfacing what decisions were being encoded or asking if pre-compaction positions still held. The compaction summary treated falsify output (Option B) as a committed direction, even though the user had nuanced it after falsify ran (walked back AI positioning, shifted to content-led inbound). MEMORY.md rule states: "After context compaction, pending tasks are NOT pre-approved. Report what was done, then stop and ask what's next."

**Proposed fix:** Before executing any doc writes after compaction, output a 2-3 sentence summary: "Based on the pre-compaction discussion, I'm about to encode these decisions: [list]. Does this still reflect your intent?" Then wait for confirmation before writing.

---

## Filing friction is downstream of session value — don't optimize filing before proving gap reveal

**Date:** 2026-03-06
**Status:** proposed

Multiple sessions explored AI-assisted filing, transcription pipelines, mirror agents, and in-session 3-phase structures — all solving "how do we get content filed easily." But the prior question remains unanswered: does the gap reveal land hard enough that pairs return at all? Filing optimization is premature until H-PairsReturn is validated. If pairs don't return even with Slava present, no amount of filing UX will save the loop.

**Decision:** Park P419 (add story to position), P428 (post-session filing), and transcription pipeline. Run First Pairs sessions manually. File content FOR them as Slava-the-scribe. Test whether content triggers return (H-Stories-ColdStart step 2) only after confirming session value.

---

## Sessions end without filed material — propagation chain breaks

**Date:** 2026-03-03 (confirmed across multiple Feb 28 sessions)
**Status:** proposed

People leave calibration sessions without filed stories or points. When nothing is filed, there is no material for the mirror agent briefing protocol, no input for the filing loop propagation hypothesis (H-FilingLoop-Propagation), and no record of the session's insights. The propagation chain requires filing to work — a session that produces nothing filed generates nothing next. Slava's presence remains the only mechanism to initiate the next session.

Confirmed via: sessions run Feb 28 — participants reported insights during session but nothing was filed after.

**Proposed fix:** File capture must happen IN session, not as homework. Either: (a) Slava files stories/points live during the session using the filing chat, or (b) end-of-session ritual includes explicit 5-min filing moment before closing. The filing chat UI is the tool; building the habit of using it in-session is the intervention.
---

## Externality claim unproven despite 30+ sessions

**Date:** 2026-03-13
**Status:** proposed

Core value proposition — closing the comprehension gap reduces downstream misalignment cost — has zero empirical evidence. 30+ facilitated sessions exist that could be retrospectively analyzed: did teams where the gap was surfaced make different decisions? Did they report fewer costly misalignments afterward? Neither question has been asked.

**Fix:** After first 3 C1 paid sessions, run a structured follow-up (2-4 weeks post-session): "Did you make a different decision because of what we surfaced? Can you estimate what that saved?" Even anecdotal evidence from 2-3 pairs is stronger than the current zero.

---

