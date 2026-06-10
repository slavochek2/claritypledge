---
status: today
type: story
rank: 3909.317
workstream: letters
created_date: '2026-06-05'
tags:
  - letters
  - verification
  - async-live
  - video
  - experiment
delivery_stage: challenge-prd
pipeline_ran:
  - create-spec
  - challenge-prd
locked_at: '2026-06-05T10:36:31.641Z'
---

# P904: Async Letter Verification Threads — /live, async, via letters

## Problem

**Situation:** The Clarity Letter makes a dyad verification-*ready* (positions, sealed-bid ratings, per-story comprehension self-ratings), but verification itself — paraphrase + author confirm/correct — exists only inside a synchronous /live meeting. Field data (2026-04-24): a 20-min letter still required ~3 hours of /live for 5 of 9 stories.

**Complication:** The meeting is the program's biggest delivery friction (scheduling two people), and inside it the on-the-spot "paraphrase now" moment is the biggest friction. Beyond scheduling, the synchronous moment is **emotionally reactive**: paraphrasing accurately under live affect is hard, and one party can absorb most of the regulation cost in real time. Async composition lets each party produce a clear paraphrase without that real-time load — a second axis of friction /live confounds with synchrony. (Note: async is expected to converge *understanding* reliably — the paraphrase→grade→correct loop runs until certified regardless of medium; what is genuinely untested is whether async high-bandwidth presence carries the *felt* channel that synchrony was assumed to require.) Whether *synchrony* is load-bearing or only the *medium's bandwidth* (voice/face = the felt channel) has never been tested — /live confounds both, and the R₀≈0 data (hypotheses.md H-LetterAsProduct) showed async letters going uncompleted, not async verification failing. A receiver currently has no way to return a paraphrase at all: verification cannot happen without a meeting, and no verification corpus accumulates for the long-horizon agent-assisted scoring path (lean-canvas §Revenue "AI facilitation engineering").

**Question:** Can letter verification converge asynchronously — receiver records a recorded paraphrase per story (audio v0; video v1), author reviews (transcript → cognitive coverage; voice/face → felt channel) and certifies or corrects — without a live meeting? ("/live, async, via letters")

## Appetite

**Larger than additive** (corrected by /challenge-prd codebase check): the transcription pipeline is session-scoped today (p874 unshipped; `transcription_jobs` keyed by `session_id` — letter-scoped jobs are an extension, not a reuse), there is no thread entity, no post-certification position re-capture hook, and the sealed-bid pair for the thread is a new entity. Audio capture/storage does reuse the existing audio-blob path. Existing letters and readers who never respond are untouched. Reversible (remove the affordance; recorded threads remain as data). Decision density now low — medium, thread model, verdict form, Q&A scope, status visibility, gating, and phasing resolved (see Resolved Decisions); audio cap/retention and review-surface placement remain `[FOUNDER DECISION]`.

## Solution

Transplant /live's existing step sequence into the letter as an async exchange — including /live's probing-question turns, not only the paraphrase (definitions.md Verification Protocol: explain-back + examples/hypotheticals + probe reasoning).

### Thread model (resolved 2026-06-05, conversation 2)

One **thread** per (story × delivery), shared view, visible to both participants. The original story is never modified — thread items are responses *about* it (like /live turns made explicit), not versions of it. A thread is an **append-only list of typed items** plus a status (`open` / `certified` / `abandoned`). This data model is loop-ready from day one; the v0 UI ships first-shot only (see Phasing).

| Item type | Who | Content |
|---|---|---|
| `paraphrase` | receiver | text or audio (+ auto-transcript) + sealed self-rating (0-10 confidence) |
| `verdict` | author | accuracy rating (0-10, sealed) + certify OR correction note |
| `question` | either | comprehension probe (author tests receiver) or info request (receiver checks own understanding) `[user-stated: paraphrase alone doesn't cover comprehension testing in both directions]` |
| `answer` | either | typed reply bound to one specific question — not a free comment |

**Answers are NOT stories by default.** A thread answer gets a **"promote to story"** action that routes through the existing story-creation flow (where story/point extraction assistance already lives), with the answer text/transcript as the draft. Promotion preserves reuse (send for verification, inverse-letter material) without forcing story weight (visibility, versioning, feed) onto every reply.

### Phasing

**Phase 0 — story-after-position (build first):**
1. Receiver can revisit a completed letter in a **fixed engagement view** — content immutable as sent; their positions stay live (changeable).
2. After taking/holding a position, an **"add story" button enables** — type or speak (transcribed) — filing via the existing respond-to-point→story mechanism. Same affordance in-flow right after the position step.
3. `/architect` must verify first whether a receiver post-completion letter view exists today — if not, Phase 0 is larger than assumed.

**Phase 1 — verification threads:**
1. **Receiver responds:** after the story's rating step, the receiver records an **audio paraphrase** ("explain back what you understood"); text fallback exists; **medium is logged as an experiment variable**. Recording is auto-transcribed. **Video is deferred to v1** — capture is browser-native (MediaRecorder) and cheap, but camera shyness confounds the convergence read and playback/consent/transcoding add infra; audio carries most of the felt channel and reuses the existing audio-blob + transcription path.
2. **Sealed two-sided rating (reuse existing 0-10 comprehension assessment):** receiver self-rates confidence at submission, without seeing any author rating. Author reviews recording + transcript and counter-rates accuracy. Gap becomes visible to both only after both ratings exist — the /live sealed-bid ordering, preserved async.
3. **Certify or correct:** author **certifies** (story verified between these two people) or **corrects** (correction note — just another thread item; thread stays `open` until certified or abandoned). v0 UI ships the first shot (paraphrase → verdict); the re-paraphrase loop UI follows once a first real certification exists — no schema change needed.
4. **Flip measurement:** after certification, the receiver's position on the story's linked point(s) is re-captured — the before/after delta is the flip detector (the listener's-own-delta diagnostic, decisions trail 2026-04-26, which survives the seller-as-judge critique).
5. **Felt-channel observation:** author records a felt-vs-recited read per thread (diagnostic, not a score), paired with the receiver's own post-thread one-line report.
6. **Corpus by design:** every thread persists as a labeled datapoint — recording, transcript, both ratings, verdict, rounds — the substrate the future agent pre-screener trains against.

**Scope decisions (resolved 2026-06-05):** audio-first with text fallback, video deferred to v1 · verdict = two-sided 0-10 + certify/correct (async /live model) · verified state **internal-only** (participants see thread state; no public marker, no badge linkage) · any authenticated receiver can respond (open gating is zero build) — but **convergence is read only from incentivized-cohort threads**; silence from unincentivized receivers does not count against the experiment.

**Crux this tests — candidate hypothesis H-SynchronyVsBandwidth:** H-LetterAsProduct's clarification says "author-presence-in-/live is structural." P904 isolates *what* is structural — synchrony, or high-bandwidth presence. The candidate bet: **async high-bandwidth presence (recorded video paraphrase) satisfies the verification requirement that /live's synchrony was assumed to carry.** If async threads converge to certification and flips, the meeting becomes an escalation path (P570's bridge) for stalled threads, not the default delivery unit. (Hypothesis is named here but **not yet filed** in hypotheses.md — file it via `/docs-strategy-update` only if/when first real threads show convergence; until then it lives in this spec as the crux under test.)

## Risks / Non-Goals

### Risks
- **Async convergence may not happen — that is the experiment.** `MITIGATE` Instrument rounds-to-convergence and abandonment per thread; founder defines interpretation thresholds before the first real thread (see Open Questions). A stalled thread is a datapoint, not a bug.
- **Video = personal data.** Recording consent, storage location, retention. `MITIGATE` Resolve at `/architect` with the existing letter TOS/consent machinery (P683/P715 precedent); no public exposure of recordings — participant-visible only.
- **Felt-vs-recited is a seller-as-judge read.** `MITIGATE` Keep it a diagnostic annotation, never a displayed score; always pair with the receiver's own post-thread report.
- **Unincentivized receivers may simply not respond (R₀≈0 precedent).** `ACCEPT` for v0 — gating is open to all authenticated receivers, but first real usage will be interview-funnel invitees who carry an admission incentive. Do not interpret silence from unincentivized receivers as mechanism failure.
- **Camera shyness suppresses response rate independent of the mechanism.** `MITIGATE` Resolved structurally: v0 is audio-first (video deferred to v1), removing the confound from the convergence read; the medium variable (audio/text) still logs what remains.

### Non-Goals
- Do NOT build agent scoring of paraphrases — the corpus accrues for it, but the agent enters later as a *pre-screener*, never as the judge; speaker confirmation stays the ground truth (st3).
- Do NOT link certification to badge issuance or any public "verified" marker — badge doctrine still requires /live (definitions.md); v0 thread state is participant-visible only.
- Do NOT modify p851's pre-registered minimum-letter design — separate instrument, separate spec.
- Do NOT build threading beyond paraphrase → verdict → re-paraphrase — no general comments/discussion system on letters.
- Do NOT build live synchronous video — that is p876's territory; this is recorded async messages.
- Do NOT change the letter compose flow — the affordance is reader-side; the author side is review-only.

## Resolved Decisions

| # | Source | Finding | Resolution | Rationale |
|---|--------|---------|-----------|-----------|
| 1 | /challenge-prd | [BLOCK] Crux contradicts H-LetterAsProduct transform without acknowledgment | Spec names candidate H-SynchronyVsBandwidth, not-yet-filed | Test isolates *what* is structural (synchrony vs bandwidth); files to hypotheses.md only on first convergence evidence |
| 2 | /challenge-prd | [BLOCK] Receiver willingness unvalidated (R₀≈0 population, higher ask) | Founder rejected off-platform proxy; build with open gating, **pre-committed reading: only incentivized-cohort threads count** | Founder call; interpretation pre-commit prevents rationalizing silence either way |
| 3 | /challenge-prd | Video vs audio | **Audio-first, video deferred to v1** | Camera shyness confounds the convergence read; audio reuses existing blob+transcription path and carries most of the felt channel |
| 4 | /challenge-prd | Gating | **Open to all authenticated receivers** | Open gating is zero build (founder overruled scoping; interpretation handled by #2) |
| 5 | /challenge-prd | Full loop vs single-shot | **Loop-ready data model (append-only typed items), first-shot UI** | Loop comes free structurally; re-paraphrase UI ships after first real certification |
| 6 | conversation | Reply-as-new-letter / paraphrase-as-block / diff-on-diff | **Rejected** — thread of typed items attached to (story × delivery) | Reply-letters conflict with compose non-goal; block system is a platform redesign; "diff" framing wrongly implies story versioning |
| 7 | conversation | Q&A in threads | **In scope** — `question`/`answer` typed items, both directions | `[user-stated]` need: paraphrase alone can't test comprehension both ways; mirrors /live's probe turns |
| 8 | conversation | Are answers stories? | **No by default; "promote to story" action** routes through existing story-creation flow | Preserves reuse (verification, inverse letters) without story weight on every reply |
| 9 | conversation | Story-after-position | **In scope as Phase 0, built first** | Founder call: first easy step of "receiver responds with reasoning"; reuses existing respond-to-point→story mechanism |
| 10 | /challenge-prd | [BLOCK] Appetite misclassified as "medium/additive" | Appetite section corrected | Transcription is session-scoped today; thread entity + re-capture are greenfield |

## Done-When

**Phase 0:**
- [ ] A receiver can revisit a completed letter in a fixed engagement view (content immutable, own positions live/changeable)
- [ ] After taking/holding a position, the receiver can add a story (typed or audio-transcribed) via the existing respond-to-point→story mechanism — both in-flow and from the revisit view

**Phase 1:**
- [ ] An authenticated letter receiver can record an audio paraphrase on a story (text fallback available); the recording is transcribed automatically
- [ ] Receiver self-rates confidence (0-10) at submission without seeing any author rating
- [ ] Author has a per-story thread view: recording + transcript + receiver confidence; counter-rates accuracy (0-10); certifies or sends a correction note (a thread item; thread stays open)
- [ ] Either participant can add a `question` item; the other can add an `answer` item bound to that question
- [ ] A thread answer has a "promote to story" action that opens the existing story-creation flow pre-filled with the answer text/transcript
- [ ] Thread is append-only typed items with status open/certified/abandoned; both participants see thread state (re-paraphrase loop UI deferred until first real certification — schema supports it)
- [ ] After certification, the receiver's position on linked point(s) is re-captured (mechanism: `/architect` decides update-in-place vs before/after rows); delta retrievable via a defined query named in the spec by `/architect`
- [ ] Medium (audio/text), rounds-to-convergence, and abandonment are queryable per thread
- [ ] Author felt-vs-recited annotation (form decided at `/ux`) and receiver post-thread one-line report are captured per thread
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

- `[FOUNDER DECISION]` Audio length cap per paraphrase (suggestion: 2-3 min — long enough for one story, short enough to review at scale).
- `[FOUNDER DECISION]` Interpretation thresholds before first real thread: what convergence rate / rounds-to-certify counts as "async works"? (Pre-commit the reading, p851-style, so a null result can't be rationalized.) **Must be answered before Phase 1 build starts, not after.**
- `[FOUNDER DECISION]` Where the author reviews threads — letter overview page (P700) vs. a new inbox surface.
- `[FOUNDER DECISION]` Retention policy for recordings (keep indefinitely as corpus vs. delete after transcription + certification).

## Deferred Ideas (not in P904)

- **Video paraphrase** — v1, once audio convergence data exists; capture is browser-native, costs are playback/consent/transcoding + camera-shyness confound.
- **Reply letters / Gmail-like letter threads** — receiver composing a letter back already possible via existing compose; thread-of-letters UX is a future spec if threads converge.
- **In-thread agent assistance (story/point distinction)** — lives in the existing story-creation flow reached via "promote to story"; no in-thread sifting in v0.
- **Re-paraphrase loop UI** — schema supports it from day one; build after the first real certification.

## Related

- **P570** (mini-/live on stories) — the async→sync bridge; P904 tests whether sync is needed at all. If P904 converges, P570 becomes the escalation path for stalled threads.
- **p876** (WebRTC 2-person video spike) — live video infra; distinct from recorded messages but findings on capture/permissions transfer.
- **p874** (transcription observability) — transcription pipeline this reuses.
- **p851** (minimum clarity letter) — separate pre-registered instrument; do not couple.
- **p547** (AI post-session coach) — the future agent layer this spec's corpus feeds; explicitly out of scope here.
- **Strategy:** hypotheses.md H-LetterAsProduct (clarification + 2026-06-02 transform), lean-canvas §Solution "verification-ready vs verified" + §Revenue "AI facilitation engineering", goals.md Dos ("document what a trained partner or AI could do").
