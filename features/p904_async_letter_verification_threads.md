---
status: week
type: story
rank: 1000793.0
workstream: letters
created_date: '2026-06-05'
tags: [letters, verification, async-live, video, experiment]
delivery_stage: challenge-prd
pipeline_ran: [create-spec, challenge-prd]
---

# P904: Async Letter Verification Threads — /live, async, via letters

## Problem

**Situation:** The Clarity Letter makes a dyad verification-*ready* (positions, sealed-bid ratings, per-story comprehension self-ratings), but verification itself — paraphrase + author confirm/correct — exists only inside a synchronous /live meeting. Field data (2026-04-24): a 20-min letter still required ~3 hours of /live for 5 of 9 stories.

**Complication:** The meeting is the program's biggest delivery friction (scheduling two people), and inside it the on-the-spot "paraphrase now" moment is the biggest friction. Beyond scheduling, the synchronous moment is **emotionally reactive**: paraphrasing accurately under live affect is hard, and one party can absorb most of the regulation cost in real time. Async composition lets each party produce a clear paraphrase without that real-time load — a second axis of friction /live confounds with synchrony. (Note: async is expected to converge *understanding* reliably — the paraphrase→grade→correct loop runs until certified regardless of medium; what is genuinely untested is whether async high-bandwidth presence carries the *felt* channel that synchrony was assumed to require.) Whether *synchrony* is load-bearing or only the *medium's bandwidth* (voice/face = the felt channel) has never been tested — /live confounds both, and the R₀≈0 data (hypotheses.md H-LetterAsProduct) showed async letters going uncompleted, not async verification failing. A receiver currently has no way to return a paraphrase at all: verification cannot happen without a meeting, and no verification corpus accumulates for the long-horizon agent-assisted scoring path (lean-canvas §Revenue "AI facilitation engineering").

**Question:** Can letter verification converge asynchronously — receiver records a video paraphrase per story, author reviews (transcript → cognitive coverage; face/voice → felt channel) and certifies or corrects — without a live meeting? ("/live, async, via letters")

## Appetite

Medium blast radius — additive affordance on the letter reading flow + a new response entity with video recording/storage + an author-side review surface; existing letters and readers who never respond are untouched. Reversible (remove the affordance; recorded threads remain as data). Medium decision density — medium choice, verdict form, status visibility, and gating were resolved in conversation (below); copy, video caps/retention, and review-surface placement remain `[FOUNDER DECISION]`.

## Solution

Transplant /live's existing step sequence into the letter as an async exchange. Per story, inside the existing delivery context:

1. **Receiver responds:** after the story's rating step, the receiver can record a **video paraphrase** ("explain back what you understood"). Audio and text fallbacks exist; **medium is logged as an experiment variable**. Recording is auto-transcribed.
2. **Sealed two-sided rating (reuse existing 0-10 comprehension assessment):** receiver self-rates confidence at submission, without seeing any author rating. Author reviews recording + transcript and counter-rates accuracy. Gap becomes visible to both only after both ratings exist — the /live sealed-bid ordering, preserved async.
3. **Certify or correct:** author **certifies** (story verified between these two people) or **corrects** (short note that reopens the story for re-paraphrase). Loop until certified or abandoned.
4. **Flip measurement:** after certification, the receiver's position on the story's linked point(s) is re-captured — the before/after delta is the flip detector (the listener's-own-delta diagnostic, decisions trail 2026-04-26, which survives the seller-as-judge critique).
5. **Felt-channel observation:** author records a felt-vs-recited read per thread (diagnostic, not a score), paired with the receiver's own post-thread one-line report.
6. **Corpus by design:** every thread persists as a labeled datapoint — recording, transcript, both ratings, verdict, rounds — the substrate the future agent pre-screener trains against.

**Scope decisions (resolved 2026-06-05):** video-first with audio/text fallback · verdict = two-sided 0-10 + certify/correct (async /live model) · verified state **internal-only** (participants see thread state; no public marker, no badge linkage) · any authenticated receiver can respond.

**Crux this tests — candidate hypothesis H-SynchronyVsBandwidth:** H-LetterAsProduct's clarification says "author-presence-in-/live is structural." P904 isolates *what* is structural — synchrony, or high-bandwidth presence. The candidate bet: **async high-bandwidth presence (recorded video paraphrase) satisfies the verification requirement that /live's synchrony was assumed to carry.** If async threads converge to certification and flips, the meeting becomes an escalation path (P570's bridge) for stalled threads, not the default delivery unit. (Hypothesis is named here but **not yet filed** in hypotheses.md — file it via `/docs-strategy-update` only if/when first real threads show convergence; until then it lives in this spec as the crux under test.)

## Risks / Non-Goals

### Risks
- **Async convergence may not happen — that is the experiment.** `MITIGATE` Instrument rounds-to-convergence and abandonment per thread; founder defines interpretation thresholds before the first real thread (see Open Questions). A stalled thread is a datapoint, not a bug.
- **Video = personal data.** Recording consent, storage location, retention. `MITIGATE` Resolve at `/architect` with the existing letter TOS/consent machinery (P683/P715 precedent); no public exposure of recordings — participant-visible only.
- **Felt-vs-recited is a seller-as-judge read.** `MITIGATE` Keep it a diagnostic annotation, never a displayed score; always pair with the receiver's own post-thread report.
- **Unincentivized receivers may simply not respond (R₀≈0 precedent).** `ACCEPT` for v0 — gating is open to all authenticated receivers, but first real usage will be interview-funnel invitees who carry an admission incentive. Do not interpret silence from unincentivized receivers as mechanism failure.
- **Camera shyness suppresses response rate independent of the mechanism.** `MITIGATE` Audio/text fallbacks exist and the medium variable lets the data show the effect rather than hide it.

### Non-Goals
- Do NOT build agent scoring of paraphrases — the corpus accrues for it, but the agent enters later as a *pre-screener*, never as the judge; speaker confirmation stays the ground truth (st3).
- Do NOT link certification to badge issuance or any public "verified" marker — badge doctrine still requires /live (definitions.md); v0 thread state is participant-visible only.
- Do NOT modify p851's pre-registered minimum-letter design — separate instrument, separate spec.
- Do NOT build threading beyond paraphrase → verdict → re-paraphrase — no general comments/discussion system on letters.
- Do NOT build live synchronous video — that is p876's territory; this is recorded async messages.
- Do NOT change the letter compose flow — the affordance is reader-side; the author side is review-only.

## Done-When

- [ ] An authenticated letter receiver can record a video paraphrase on a story (audio and text fallbacks available); the recording is transcribed automatically
- [ ] Receiver self-rates confidence (0-10) at submission without seeing any author rating
- [ ] Author has a per-story thread view: recording + transcript + receiver confidence; counter-rates accuracy (0-10); certifies or sends a correction note
- [ ] Correction reopens the story for re-paraphrase; the loop continues until certified or abandoned; both participants see thread state
- [ ] After certification, the receiver's position on linked point(s) is re-captured; before/after delta queryable
- [ ] Medium (video/audio/text), rounds-to-convergence, and abandonment are queryable per thread
- [ ] Author felt-vs-recited annotation and receiver post-thread report are captured per thread
- [ ] No public surface shows verification state — visible to the two participants only
- [ ] Letters and readers without responses render exactly as today (regression-verified)

## Acceptance Criteria

- [ ] A receiver completes a full async verification loop on at least one story of a real letter end-to-end (record → sealed ratings → gap → certify) without a meeting
- [ ] The founder can review a thread and judge felt-vs-recited from the recording, with the receiver's own report captured alongside
- [ ] Convergence data (rounds, medium, position delta) is queryable well enough to decide the synchrony-vs-medium crux
- [ ] Founder-approved copy for all receiver- and author-facing prompts `[FOUNDER DECISION]`

## UX Notes

- **Affordance placement:** the response invitation appears after the story's existing rating step — exact placement and prominence is `/ux` territory. The felt channel is why video leads: fallback order video → audio → text, with friction in that order (text must not be the path of least resistance). `[FOUNDER DECISION: fallback prominence]`
- **Thread states:** no response yet · awaiting author · corrected (reopened) · certified · abandoned. Recording-failure and camera/mic-permission-denied paths route to the next fallback medium, never to a dead end.
- **Sealed ordering is load-bearing:** receiver must never see the author's accuracy rating (or any author reaction) before submitting their own confidence rating — same invariant as the letter's sealed-bid mechanics.
- **Neutral prompt phrasing** (per p852/p851 precedent): "Explain back what you understood" — no "should/right/appropriate" language.

## Open Questions (Founder Decisions)

- `[FOUNDER DECISION]` Video length cap per paraphrase (suggestion: 2-3 min — long enough for one story, short enough to review at scale).
- `[FOUNDER DECISION]` Interpretation thresholds before first real thread: what convergence rate / rounds-to-certify counts as "async works"? (Pre-commit the reading, p851-style, so a null result can't be rationalized.)
- `[FOUNDER DECISION]` Where the author reviews threads — letter overview page (P700) vs. a new inbox surface.
- `[FOUNDER DECISION]` Retention policy for recordings (keep indefinitely as corpus vs. delete after transcription + certification).

## Related

- **P570** (mini-/live on stories) — the async→sync bridge; P904 tests whether sync is needed at all. If P904 converges, P570 becomes the escalation path for stalled threads.
- **p876** (WebRTC 2-person video spike) — live video infra; distinct from recorded messages but findings on capture/permissions transfer.
- **p874** (transcription observability) — transcription pipeline this reuses.
- **p851** (minimum clarity letter) — separate pre-registered instrument; do not couple.
- **p547** (AI post-session coach) — the future agent layer this spec's corpus feeds; explicitly out of scope here.
- **Strategy:** hypotheses.md H-LetterAsProduct (clarification + 2026-06-02 transform), lean-canvas §Solution "verification-ready vs verified" + §Revenue "AI facilitation engineering", goals.md Dos ("document what a trained partner or AI could do").
