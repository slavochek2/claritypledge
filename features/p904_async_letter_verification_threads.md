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
delivery_stage: architect
pipeline_ran:
  - create-spec
  - challenge-prd
  - ux
  - architect
locked_at: '2026-06-05T10:36:31.641Z'
---

# P904: Async Letter Verification Threads — /live, async, via letters

## Problem

**Situation:** The Clarity Letter makes a dyad verification-*ready* (positions, sealed-bid ratings, per-story comprehension self-ratings), but verification itself — paraphrase + author confirm/correct — exists only inside a synchronous /live meeting. Field data (2026-04-24): a 20-min letter still required ~3 hours of /live for 5 of 9 stories.

**Complication:** The meeting is the program's biggest delivery friction (scheduling two people), and inside it the on-the-spot "paraphrase now" moment is the biggest friction. Beyond scheduling, the synchronous moment is **emotionally reactive**: paraphrasing accurately under live affect is hard, and one party can absorb most of the regulation cost in real time. Async composition lets each party produce a clear paraphrase without that real-time load — a second axis of friction /live confounds with synchrony. (Note: async is expected to converge *understanding* reliably — the paraphrase→grade→correct loop runs until certified regardless of medium; what is genuinely untested is whether async high-bandwidth presence carries the *felt* channel that synchrony was assumed to require.) Whether *synchrony* is load-bearing or only the *medium's bandwidth* (voice/face = the felt channel) has never been tested — /live confounds both, and the R₀≈0 data (hypotheses.md H-LetterAsProduct) showed async letters going uncompleted, not async verification failing. A receiver currently has no way to return a paraphrase at all: verification cannot happen without a meeting, and no verification corpus accumulates for the long-horizon agent-assisted scoring path (lean-canvas §Revenue "AI facilitation engineering").

**Question:** Can letter verification converge asynchronously — receiver records a recorded paraphrase per story (audio v0; video v1), author reviews (transcript → cognitive coverage; voice/face → felt channel) and certifies or corrects — without a live meeting? ("/live, async, via letters")

## Appetite

**Larger than additive** (corrected by /challenge-prd codebase check): the transcription pipeline is session-scoped today (p874 unshipped; `transcription_jobs` keyed by `session_id` — letter-scoped jobs are an extension, not a reuse), there is no thread entity, no post-certification position re-capture hook, and the sealed-bid pair for the thread is a new entity. Audio capture reuses the existing GCS path + `gcs-signed-url` edge function (extended for pair-membership; new private bucket) — not the transcription pipeline. Existing letters and readers who never respond are untouched. Reversible (remove the affordance; recorded threads remain as data). Decision density now low — medium, thread model, verdict form, Q&A scope, status visibility, gating, and phasing resolved (see Resolved Decisions); audio cap/retention and review-surface placement remain `[FOUNDER DECISION]`.

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

> **v0 narrowed (2026-06-06, see `## UX Design`):** async = **capture + delivery only**. v0 ships steps 1 + 4-style position re-capture via the existing Create Story flow; the **author just listens**. The two-sided sealed rating (step 2), certify/correct (step 3), felt-vs-recited (step 5), and the typed `verdict`/`question`/`answer` items move to **/live** or a later spec (see Deferred Ideas). The loop-ready data model is unchanged. The numbered steps below remain the full target; `## UX Design` is the authoritative v0 build scope.

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

> **Stale external record:** the `docs/decisions.md` 2026-06-05 P904 entry still reads "video-first"; this table (#3) supersedes it with audio-first. Reconcile via `/kdd` when decisions.md is next touched.

## Done-When

**Phase 0:**
- [ ] A receiver can revisit a completed letter in a fixed engagement view (content immutable, own positions live/changeable)
- [ ] After taking/holding a position, the receiver can add a story (typed or audio-transcribed) via the existing respond-to-point→story mechanism — both in-flow and from the revisit view

**Phase 1 — v0 (build now; per `## UX Design` = capture + delivery, grading stays /live):**
- [ ] An authenticated letter receiver can record an **audio explain-back** on a story; text is a de-emphasized fallback; the recording is **stored as a blob** (NOT transcribed in v0); the **medium (audio/text) is logged**
- [ ] The receiver can **explain their position** on a point — files a Story linked to the point, inheriting the point's privacy (P607)
- [ ] The author can **open and listen** to the explain-back async (no rating, no certify — that is the whole author-side interaction in v0)
- [ ] The explain-back is **pair-private** — only the two participants can access it (new RLS)
- [ ] **Return signal:** a letter-level count on the Letters list ("N new from Jamie") opens the results page; the results card shows per-story unread → read state
- [ ] No public surface shows any verification state — visible to the two participants only
- [ ] Letters and readers without responses render exactly as today (regression-verified)

**Phase 1 — full target (deferred; see `## Deferred Ideas`, NOT v0):**
- [ ] Receiver self-rates confidence (0-10) at submission without seeing any author rating
- [ ] Author counter-rates accuracy (0-10); certifies or sends a correction note (thread item; thread stays open) — **moves to /live in v0**
- [ ] `question` / `answer` typed items; "promote to story" action
- [ ] Append-only typed-item thread with status open/certified/abandoned; re-paraphrase loop UI
- [ ] After certification, the receiver's position on linked point(s) is re-captured (position mutability already exists via P705; the discrete re-capture step is deferred)
- [ ] Rounds-to-convergence and abandonment queryable per thread
- [ ] Author felt-vs-recited annotation + receiver post-thread one-line report — **moves to /live in v0**
- [ ] Audio transcription (separate later feature; single speaker → plain Whisper)

## Acceptance Criteria

**v0 (this build):**
- [ ] On at least one story of a real letter, a receiver records an audio explain-back without a meeting, and the author listens to it async
- [ ] The receiver files a position-explanation Story on a point, and it inherits the point's privacy (private point → private story)
- [ ] The explain-back is reachable only by the two participants (verified — no third party can load it)
- [ ] Founder-approved copy for all receiver- and author-facing prompts `[FOUNDER DECISION]`

**Full target (deferred — NOT required for v0 sign-off):**
- [ ] A receiver completes a full async verification loop end-to-end (record → sealed ratings → gap → certify) without a meeting
- [ ] The founder can judge felt-vs-recited from the recording, with the receiver's own report alongside
- [ ] Convergence data (rounds, medium, position delta) is queryable well enough to decide the synchrony-vs-medium crux

## UX Notes

> **Narrowed for v0 by `## UX Design` (2026-06-06):** these are full-target notes. In v0 there is no async author rating, so the **sealed-ordering** note below does not apply yet (confidence is already captured at the letter's rating step; async author accuracy moves to /live). The neutral-phrasing and no-dead-end notes still hold.

- **Affordance placement:** the response invitation appears after the story's existing rating step — exact placement and prominence is `/ux` territory. The felt channel is why video leads: fallback order video → audio → text, with friction in that order (text must not be the path of least resistance). `[FOUNDER DECISION: fallback prominence]`
- **Thread states:** no response yet · awaiting author · corrected (reopened) · certified · abandoned. Recording-failure and camera/mic-permission-denied paths route to the next fallback medium, never to a dead end.
- **Sealed ordering is load-bearing:** receiver must never see the author's accuracy rating (or any author reaction) before submitting their own confidence rating — same invariant as the letter's sealed-bid mechanics.
- **Neutral prompt phrasing** (per p852/p851 precedent): "Explain back what you understood" — no "should/right/appropriate" language.

## UX Design

**Source:** converged via `/ascii-flows` + design iteration (2026-06-06). Authoritative v0 surface design. Supersedes `## UX Notes` where they conflict; narrows `## Solution` Phase 1 (see v0 scope).

### v0 scope — async = capture + delivery (verification stays /live)

**In v0:**
- Receiver records an **audio explain-back** per story ("explain back what you understood"); text is a logged fallback.
- Receiver can **explain their position** on a point — files a real Story linked to that point.
- Author **listens** to the explain-back, async. That is the entire author-side interaction.
- A **return signal** tells each party there is something new.

**Deferred to /live or a later spec (NOT in v0):**
- Author accuracy rating, the sealed two-sided gap, the reveal moment → grading happens in **/live** with the slider.
- Felt-vs-recited judgment → /live (it is verification).
- `verdict` / `question` / `answer` typed items, re-paraphrase loop, promote-to-story → deferred (see Deferred Ideas).
- Transcription of the audio → separate later feature; v0 stores and plays the blob only.

**Consequence for the crux:** v0 tests **willingness to record async**, builds the **audio corpus**, and **delivers the voice** to the author async. It does not measure async *convergence* (that needs async grading). Deliberate first step — prove receivers record before building async grading.

### Two affordances, two levels

| Level | Action (empty) | Filled (either party) | What it is |
|---|---|---|---|
| **Point** | `Explain your position` | `Jamie's story →` | Receiver's own reasoning — a real Story linked to the point |
| **Story** | `Explain back what you understood` | `What Jamie understood →` (`What you understood →` for self) | Receiver's audio explain-back of the author's story |

### Surfaces — input is a Drawer, content is a page

| Artifact | Capture | View | Back |
|---|---|---|---|
| Explain-back (audio) | bottom **Drawer** (reading flow's action-phase pattern, T13) | **focus page** + `FocusHeader` back (like `/story/:id`) | back → results |
| Position story (text) | **Create Story page** `/create?pointId=<id>` | `/story/:id` | back → results |

Rationale: Drawer is the app's input/action pattern; focus pages are how content is viewed (`/story/:id`, `/point/:id`). The explain-back **view** is a focus page so it is linkable (future inbox deep-link) and has room for the transcript when that ships. The only Drawer is the moment of recording.

### Copy rules
- **User-facing verb is "explain back" / "explanation," never "paraphrase"** (jargon; also honors the neutral-phrasing rule in `## UX Notes`). The CTA is the full **"Explain back what you understood"** — it answers the reader's implicit "back, what?".
- **Results-page labels are always name-attributed** (`Jamie's story →`, `What Jamie understood →`). The profile point card gets away with a bare "1 story" because its data is pre-filtered to the profile owner (`point-card-with-links.tsx:208`); the results page is bilateral with no implicit-authorship context, so the responder's name is required.
- **Reading-flow CTA hierarchy:** after the gap reveal, `Explain back what you understood` is the **primary** CTA; `Next story` drops to a visible **secondary** (never a hard gate — skip always available). Promote only this one action per story; keep point-level `Explain your position` a quiet inline affordance.

### Privacy
- **`Explain your position` files a Story → inherits the point's privacy** (already implemented — P607, `create-story-page.tsx:74/92`). Point private → story private; point public → story public.
- **Explain-back is NOT a Story → always private, pair-only, by definition,** regardless of any other setting. Different object, different storage.

### Audio (path A — record + store, no transcription in v0)
- Use the **/live recorder path** (`use-audio-recorder.ts` + `useMicrophonePermission.ts` + audio-blob storage), **NOT** the Web Speech dictation component (`transcription-input.tsx` / `useSpeechToText.ts`) — dictation produces text and discards the audio, which IS the felt channel.
- **Audio-first; text ("Prefer to type?") is a de-emphasized fallback** (no-mic / Firefox / a11y), never the easy default. **Log the medium** (`audio` / `text`) per Solution Phase 1.1; read the felt-channel signal only from audio threads.
- **No transcription in v0** — store and play the blob. Transcription is a later feature (single speaker → plain Whisper, no diarization). `TranscriptionInput` may serve as the text fallback only.

### Return signal
- **Letters list (the inbox):** letter-level count — `2 new from Jamie` → opens that letter's results page. No separate inbox in v0.
- **Results card, per story:** `What Jamie understood →` — unread = bold + dot; after open → normal weight, still openable. Deep-link to a single understanding is deferred (results already supports `?story=<id>` seeking).

### Screens (audio-first, no async grading)

```
CAPTURE — explain back (Drawer, input only)        VIEW — focus page (back button, like /story/:id)
   (story visible above the drawer)               ┌─[← Back]──────────────────────────────────┐
├═══════════════════════════════════════┤         │ What Jamie understood                      │
│ Explain back what you understood       │         │ On your story "The timeline risk"   Open → │
│ Alex's story: "Timeline risk"   Open → │         │                                            │
│      ●  Recording…  0:42               │         │   ▶ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓  0:42                  │
│      ▓▓▓▓▓▓▓░░░░░                      │         │   (later: transcript renders here)         │
│  [ ■ Stop ]            [ Cancel ]      │         └──────────────────────────────────────────────┘
│  Prefer to type?  [ Type instead ]     │            (listen only — no rating; back → results)
└─────────────────────────────────────────┘
   stop ↓                                          POSITION STORY — capture & view (pages)
├═══════════════════════════════════════┤           capture → /create?pointId=<id>  (text, bottom
│ ▶ ▓▓▓▓▓▓▓▓▓▓ 0:42       [ Re-record ]  │                    actions, inherit point privacy)
│            [ Send to Alex ]            │           view    → /story/:id           (back → results)
└─────────────────────────────────────────┘

READING-FLOW CTA (after gap reveal)              RETURN SIGNAL
   [ Explain back what you understood ]  primary  ┌── Letters list (inbox) ──┐
              Next story               secondary  │ Letter to Jamie          │  open → results
                                                  │ • 2 new from Jamie       │
                                                  └──────────────────────────┘
```

### /architect handoff
- **Create Story page privacy — already done, do NOT rebuild.** `/create?pointId=` **already inherits the point's visibility** via P607 (`create-story-page.tsx:74` derives `visibility` from `pointVisibility`, set from `point.visibility` at `:92`). The `:396` "always public" comment refers to the removed user-facing *selector* (P586), not inheritance. No new privacy work — verify the existing path carries a private point end-to-end. (`points.visibility` column exists, P586 migration.)
- **Phase 0 revisit view already exists** — the receiver sees the letter at `/letter/:id/results?delivery=` (`letter-results-page.tsx`) with live-mutable positions (P705). Phase 0 = **add the `Explain your position` affordance to that page**, not build a revisit view. (Corrects Solution Phase 0 step 3's "verify whether it exists.")
- **`Explain your position` is capped at 1 story per point per user** — DB enforces `UNIQUE (author_id, point_id)` on `story_points` (`20260301120000_story_points_author_unique.sql`). Filled state for the receiver's own must be **view/edit the existing story**, never "create a second": `Jamie's story →` for the other party, `Edit your story →` for self.
- **Capture surface component is undecided** — the letter flow's bottom bar is `FixedBottomBar` (custom static), **not** the vaul `Drawer` (`src/components/ui/drawer.tsx`, swipe-to-dismiss). Pick deliberately: a swipeable drawer can cancel a recording mid-take. "Drawer" in this spec means the pattern, not a specific component.
- **Explain-back view** = a new **focus page route** (none exists today; `/story/:id`, `/point/:id` are the focus-page precedents). Reachable from the results story card; linkable for the future inbox deep-link.
- **Explain-back capture** reuses `use-audio-recorder.ts` (MediaRecorder → `Blob`) + `useMicrophonePermission.ts` + the audio-blob storage path. NOT `useSpeechToText.ts` / `transcription-input.tsx` (Web Speech dictation discards the audio = the felt channel).
- **Explain-back is a new pair-private entity** — author its RLS from scratch: only the two participants may SELECT (no precedent; principle is pair-only). Name any columns that must stay hidden from the receiver if the deferred `verdict` layer is added later.
- **`PointRow`** (`live-story-card-expanded.tsx:232`) has no story CTA today (stripped — P451 / `letterMode`). Inject both affordances via its existing **`children` slot** (`:276`); port empty/filled copy logic from `PointCardWithLinks` (`:357-403`).
- **`JourneyToUnderstanding`** already accepts an `explainBackRatings` prop (passed `[]` at `story-walk.tsx:132`) — a pre-existing hook from /live.
- **Return signal** = letter-level count on the Letters list (`letters-page.tsx`) + per-card unread state on the results StoryWalk; "Drawer reopen on results" if `Open →` navigates to the full story.

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
- **Async grading (v0 cut, 2026-06-06)** — author accuracy rating, sealed two-sided gap, reveal moment, certify/correct, felt-vs-recited. Verification stays in **/live** (slider) for v0; async only captures + delivers. Revisit once response-rate data shows receivers actually record.
- **Typed thread items** (`verdict` / `question` / `answer`) and **promote-to-story** — the append-only thread model is built data-side but only the `paraphrase` (audio explain-back) and the position-Story surface in v0.
- **Audio transcription** — store + play the blob in v0; transcription is a separate later feature (single speaker → plain Whisper, no diarization). Its UI lands on the explain-back **view** focus page.

## Related

- **P570** (mini-/live on stories) — the async→sync bridge; P904 tests whether sync is needed at all. If P904 converges, P570 becomes the escalation path for stalled threads.
- **p876** (WebRTC 2-person video spike) — live video infra; distinct from recorded messages but findings on capture/permissions transfer.
- **p874** (transcription observability) — transcription pipeline this reuses.
- **p851** (minimum clarity letter) — separate pre-registered instrument; do not couple.
- **p547** (AI post-session coach) — the future agent layer this spec's corpus feeds; explicitly out of scope here.
- **Strategy:** hypotheses.md H-LetterAsProduct (clarification + 2026-06-02 transform), lean-canvas §Solution "verification-ready vs verified" + §Revenue "AI facilitation engineering", goals.md Dos ("document what a trained partner or AI could do").

---

## Technical Architecture

### Technical Analysis

#### Reuse Inventory

**Audio recording path (reused directly):**
- `src/hooks/use-audio-recorder.ts` — MediaRecorder → Blob, single-file mode (no chunks needed for short explain-backs). Call `startRecording()` / `stopRecording()` → returns `Blob | null`. Already handles mic permission errors and Safari fallback to `audio/mp4`.
- `src/hooks/useMicrophonePermission.ts` — permission state + request helper. Reused exactly as in `/live`.
- `src/app/data/api.ts: getSignedUploadUrl()` (private, line ~2863) + `uploadToGCS()` (~2910) — the signed-URL + GCS PUT path. **Constraint:** `getSignedUploadUrl` is scoped to `sessions/` paths in the GCS bucket today (takes `sessionCode` as a positional arg). Explain-backs go to a different, private **GCS** bucket via the extended `gcs-signed-url` edge function — a new upload function is needed (see Decision 1).

**UX structure (reused / adapted):**
- `src/app/components/shared/fixed-bottom-bar.tsx` — the static fixed bottom bar used in `story-walk.tsx`; the capture surface will be built on top of this component (capture surface decision below).
- `src/app/components/layout/focus-header.tsx` — `<FocusHeader onBack={...} />` for the explain-back view focus page. Pattern is `/story/:id`, `/point/:id` — new route `/explain-back/:id` follows the same shape.
- `src/app/components/letters/story-walk.tsx:132` — `explainBackRatings={[]}` prop already passed to `JourneyToUnderstanding`. The `StoryWalkItem` type will need two new optional fields: `explainBack` (explain-back row or null) and `explainBackUnread` (boolean). The `StoryWalk` component will pass these into `PointRow`'s `children` slot.
- `src/app/components/partners/live-story-card-expanded.tsx:251 (PointRow)` — `children?: React.ReactNode` slot at line :276 is the injection point for both "Explain your position" and "Explain back what you understood" affordances.
- `src/app/pages/letter-results-page.tsx` — Phase 0's receiver revisit view is THIS page (`/letter/:id/results?delivery=`), confirmed by the `/architect handoff`. No new revisit page to build.
- `src/app/components/letters/inbox-tab.tsx` + `src/app/data/letters-service.ts: getUnreadLetterCount()` — the existing unread count RPC pattern. A new explain-back count field will be added alongside the delivery `read_at` query.
- `src/app/pages/letters-page.tsx:88` — `inboxLabel` already incorporates `unreadCount`; the letter-level "N new from Jamie" copy will be added to `InboxTab` list items.
- `src/app/pages/create-story-page.tsx:74, :92` — `pointVisibility` → `visibility` inheritance already implemented by P607. No new privacy work.

**Existing constraints from DB:**
- `story_points.UNIQUE(author_id, point_id)` — enforced since P465. Explain-your-position CTA must check for an existing row and render "Edit your story →" / "Jamie's story →" instead of a second-create affordance.
- `letter_deliveries.read_at` — added by P660 migration `20260406080000_p660_read_at_and_rpcs.sql`. The `getUnreadLetterCount` function queries this column. The explain-back `author_read_at` is a separate field on the new `story_explain_backs` table (not on `letter_deliveries`), because explain-backs are per-story, not per-delivery.
- `transcription_jobs` (P495 migration) — keyed by `session_id UUID NOT NULL REFERENCES clarity_sessions(id)`. Confirm: explain-backs do NOT enqueue transcription in v0 — the table cannot be reused without schema changes. Nothing to do.

**GCS / Supabase Storage audit:**
- The /live audio path uses GCS (`gs://claritypledge-ml-training/`) via the `gcs-signed-url` edge function. That bucket is for ML training data; explain-backs are pair-private and must NOT land there.
- Supabase Storage is used for the `banners` bucket (P504) — but it's public, bills against the Supabase plan, and audio already lives in GCS. Decision 1 keeps explain-back audio in GCS (credits + privacy-policy alignment), so the Supabase Storage pattern is **not** used here.

---

### Architecture Decisions

**Decision 1: Audio storage — GCS (new private bucket) with membership-checked signed URLs** *(revised 2026-06-06: was Supabase Storage)*

- **Chosen:** Store explain-back audio in a **new private GCS bucket** `claritypledge-explain-backs` (separate from the ML-training corpus), reusing the existing `gcs-signed-url` edge-function pattern. Upload and playback both go through the edge function, which is **extended with a pair-membership check** (verify `auth.uid()` is a participant of the delivery before signing). Size cap enforced via `x-goog-content-length-range` on the signed upload URL.
- **Rationale:** Three reasons over Supabase Storage. (1) **Policy alignment** — `privacy-policy-page.tsx:112` already states audio is "stored securely in Google Cloud"; Supabase Storage would contradict the published policy. (2) **Cost** — GCS uses existing Google credits; Supabase Storage bills against the Supabase plan (storage + egress), no credits. (3) **Consistency** — one audio store + one retention/backup regime; session audio already lives in GCS. The security concern (the existing `gcs-signed-url` checks JWT only, not membership; the ML bucket is the wrong corpus) is met by a separate private bucket + a membership check at signing — the same check Supabase RLS would do, in one place.
- **Trade-off:** The edge function gains a membership query (one extra hop at sign time — already the pattern for session audio). New bucket provisioning is an infra step (see Pre-deploy Checklist).
- **Alternative rejected:** New Supabase Storage bucket (`storage.objects` RLS) — fragments audio across two providers, bills Supabase instead of GCS credits, and contradicts the published privacy policy. Also rejected: reusing the **ML-training** bucket — wrong corpus governance + the current edge function has no per-pair access control.

**Decision 2: Explain-back entity — new `story_explain_backs` table**

- **Chosen:** New table `story_explain_backs` with columns:
  ```
  id                UUID PK DEFAULT gen_random_uuid()
  story_snapshot_id UUID NOT NULL REFERENCES letter_story_snapshots(id) ON DELETE CASCADE
  delivery_id       UUID NOT NULL REFERENCES letter_deliveries(id) ON DELETE CASCADE
  recorder_id       UUID NOT NULL REFERENCES profiles(id)
  medium            TEXT NOT NULL CHECK (medium IN ('audio', 'text')) DEFAULT 'audio'
  audio_storage_path TEXT   -- GCS path 'gs://claritypledge-explain-backs/{delivery_id}/{story_snapshot_id}.webm' (private bucket, separate from ML corpus)
  text_fallback     TEXT    -- populated only when medium='text'
  author_read_at    TIMESTAMPTZ  -- NULL = unread; set ONLY via mark_explain_back_read() RPC (sender-only), never a client UPDATE (Security)
  deleted_at        TIMESTAMPTZ  -- soft-delete for retention [FOUNDER DECISION]; NULL = retained (Security)
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
  UNIQUE(story_snapshot_id, delivery_id)  -- one explain-back per (story × delivery)
  ```
  Indexes: `(delivery_id)`, `(delivery_id, author_read_at)` — the second drives the "N new from Jamie" count query.
- **Rationale:** Binds explain-back to a (story × delivery) pair. `story_snapshot_id` is the natural key for "which story in this letter" — it identifies both the story and the letter. `delivery_id` is the receiver axis. Together they are the unique key (one explain-back per story per receiver in v0). `author_read_at` is the lightest possible read-state — a single nullable timestamp, no separate `read_state` enum needed in v0. `medium` logs the experiment variable (audio vs text) per Done-When.
- **Trade-off:** `ON DELETE CASCADE` from `letter_story_snapshots` means if a snapshot is deleted, explains-backs go too. Snapshots are immutable after seal — this is safe. The `UNIQUE` constraint blocks a second explain-back attempt (must update existing row, not insert a new one — matches the spec's single-shot v0 intent).
- **Alternative rejected:** `letter_id + story_id` as keys — `story_id` is nullable on `letter_story_snapshots` (P413 added nullable FKs for sessions without a story). Using `story_snapshot_id` is precise and already carries both dimensions.

**Decision 3: Capture surface — FixedBottomBar (NOT vaul Drawer)**

- **Chosen:** The explain-back capture UI is built directly on `FixedBottomBar` (the same static fixed-bottom component used in `story-walk.tsx`). The drawer pattern is visually present (panels sliding up from the bottom) but implemented as a conditionally-rendered `FixedBottomBar`, not the vaul `<Drawer>` component from `src/components/ui/drawer.tsx`.
- **Rationale (correctness):** vaul's `Drawer` component has `dismissible: true` by default (confirmed in `drawer.tsx:43`) — a swipe-down gesture on mobile dismisses the drawer and calls `onOpenChange(false)`. If the user swipes mid-recording, the recording continues in the background (the hook runs until `stopRecording()` is called) but the UI is gone and there is no recovery path. `FixedBottomBar` has no swipe-dismiss behavior; all dismissal is explicit (Cancel button → `stopRecording()` + clear state). This is the correct choice for a recording surface.
- **Trade-off:** No "half-open" snap point, no built-in swipe-to-full animation. Acceptable for v0 — the capture surface only needs two states: idle (CTA row) and recording (waveform + stop/cancel).
- **Alternative rejected:** vaul Drawer with `dismissible={false}` — blocks the swipe-dismiss bug, but vaul still mounts a backdrop overlay and portal, adding z-index complexity with the story content visible behind. The vaul Drawer is the right pattern for the `## UX Design`'s "content view" cases (future: re-paraphrase loop), not for this single-action capture panel.

**Decision 4: Explain-back view — new focus page route `/explain-back/:id`**

- **Chosen:** New route `/explain-back/:id` where `:id` is the `story_explain_backs.id`. Page: `ExplainBackViewPage`. Uses `FocusHeader` (`onBack` → results page) and hides BottomNav via the `focusRoutes` array in `bottom-nav.tsx`.
- **Rationale:** The `/architect handoff` explicitly states "explain-back view = a new focus page route (none exists today)." The `/story/:id`, `/point/:id` pattern is the established focus-page model. Making it independently routable enables future deep-linking from an inbox notification without requiring the full results page to load first.
- **Trade-off:** One new route + one new page component. This is the minimum viable approach given the "linkable for the future inbox deep-link" requirement in the spec.
- **Alternative rejected:** Rendering the explain-back view as a modal or drawer on the results page — not linkable, breaks the future inbox deep-link requirement.

**Decision 5: Return signal — extend `getUnreadLetterCount` + per-delivery query on results**

- **Chosen (Letters list level):** Add a Branch 3 to `getUnreadLetterCount` that counts deliveries where `auth.uid()` is the sender AND a matching `story_explain_backs` row exists with `author_read_at IS NULL`. This count is additive to the existing delivery-level unread count. The display label in `InboxTab` adds `• N new from [Name]` below the letter line item when the count > 0.
- **Chosen (results card level):** `StoryWalkItem` gets two new optional fields: `explainBack: ExplainBackRow | null` and `explainBackUnread: boolean`. `letter-results-page.tsx` fetches explain-backs for the delivery on mount (new `getExplainBacksForDelivery(deliveryId)` function in `letters-service.ts`) and injects them into each `StoryWalkItem`. The `PointRow` children slot renders the "What Jamie understood →" row with unread dot when `explainBackUnread` is true.
- **Rationale:** Reuses the existing `useUnreadLetterCount` hook pattern and the `letter_deliveries.(receiver_profile_id, read_at)` index pattern. The explain-back count is a separate axis from the delivery `read_at` (which marks "have I seen this letter's results"). Keeps the query count low: one extra count query in `getUnreadLetterCount` + one per-delivery fetch on results load.
- **Trade-off:** No real-time subscription — polling on `visibilitychange` (already the pattern in `useUnreadLetterCount`) is sufficient for async use. If real-time is needed later, Supabase Realtime on `story_explain_backs` WHERE `recorder_id != auth.uid()` is a drop-in addition.
- **Alternative rejected:** Putting unread state on `letter_deliveries` (e.g., a `explain_back_unread_count` denormalized column) — denormalized counts drift; the `author_read_at` approach on the explain-back row itself is self-consistent and doesn't require a trigger to maintain.

**Decision 6: Explain-position CTA — edit-if-exists via UNIQUE constraint awareness**

- **Chosen:** When rendering the "Explain your position" affordance in `PointRow.children`, the results page pre-fetches the receiver's `story_points` row for each point via the existing `getStoriesForPoints()` or a targeted lookup. If a row exists for `(auth.uid(), point.id)`, render "Edit your story →" linking to `/story/:id`. If absent, render "Explain your position" linking to `/create?pointId=<id>`. The author always sees "Jamie's story →" (if Jamie has a story on that point) or nothing.
- **Rationale:** `story_points.UNIQUE(author_id, point_id)` (P465) enforces at DB level that a second INSERT would fail. The UI must reflect this constraint by routing to edit vs. create. The `/architect handoff` explicitly calls this out.
- **Trade-off:** Requires the results page to know whether a story exists per point for the viewer. `letter-results-page.tsx` already fetches `viewerPositions` (P705); adding a `viewerStoryIds: Record<pointId, storyId>` map is a marginal fetch overhead. Alternatively, the `/create?pointId=<id>` page itself already does an upsert-style check (P607) — but relying on the page to redirect is a worse UX (user starts the create flow, then gets redirected to edit).
- **Alternative rejected:** Ignoring the UNIQUE constraint and letting DB error surface — silent fail / 409 confusion.

---

### Security Review

Reviewed for v0 scope (capture + delivery; no LLM, no transcription). Four ⚠️ findings are reconciled into the Build Sequence / schema below (marked "→ Build").

**RLS Policies:**
- ⚠️ **`story_explain_backs` is greenfield — author RLS from scratch.** Participant identity derives via a two-hop join: `delivery_id → letter_deliveries.receiver_profile_id` and `→ clarity_letters.sender_id`. Reuse/extend the existing `_is_letter_sender()` / `_is_letter_receiver()` SECURITY DEFINER helpers (do NOT inline the join — RLS recursion risk, decisions.md 2026-04-04); add `_is_letter_participant(delivery_id)` (sender OR receiver) for SELECT.
  - **INSERT:** `WITH CHECK (auth.uid() = the delivery's receiver_profile_id)` — only the receiver records.
  - **SELECT:** `USING (_is_letter_participant(delivery_id))` — pair-only. **This RLS is the real server-side gate for the view page; the client redirect (Step 4) is cosmetic.**
  - **UPDATE:** receiver-only, **scoped to content columns (re-record) — must NOT permit writing `author_read_at`** (see read-state).
  - **DELETE:** blocked for clients (`USING (false)`); retention deletion only via a SECURITY DEFINER RPC.
- ⚠️ **Read-state must be a sender-only SECURITY DEFINER RPC, not a client UPDATE** → Build. If `markExplainBackRead` were a plain UPDATE, the receiver (who holds UPDATE on their own row for re-record) could set `author_read_at` and fake "author heard it." Mark-read goes through `mark_explain_back_read(id)` asserting `auth.uid() = sender_id`. Do NOT reuse `mark_inbox_item_read` (P660) — it authorizes both parties.
- ✅ Position-explanation Story RLS already correct — P607 inheritance + `stories` visibility RLS (private point → private story).

**Authentication:**
- ⚠️ **Capture affordance needs an explicit auth gate** → Build. The reading flow supports anonymous token readers; "Explain back" must render only for the authenticated receiver of the delivery, checked in the component — not inherited from the route layout.
- ✅ View focus page sits under the auth-gated `/letter` tree pattern; carry the same `!user → /login` guard.

**Authorization:**
- ⚠️ Participant-membership is enforced by the SELECT RLS (pair-only), not the client redirect. Anyone hitting `/explain-back/:id` with a guessed UUID gets no row → nothing renders, no signed URL issued.
- ✅ Position story author identity enforced by `story_points.UNIQUE(author_id, point_id)`.

**Input Validation:**
- ⚠️ **Server-enforced audio size cap — the `[FOUNDER DECISION]` length cap sets the GCS `x-goog-content-length-range`** on the signed upload URL → Build. Client `maxDurationMs` is bypassable. At ~128 kbps opus, 3 min ≈ 2.9 MB → cap ≈ 5 MB. The duration decision must be answered before build because it sets this limit.
- ✅ MIME restricted at the edge function before signing; object key server-derived + UUID-only (`{delivery_id}/{story_snapshot_id}.webm`) — no PII, no traversal.
- ⚠️ Text-fallback XSS (future): React escapes text by default; sanitize when the transcript view renders HTML. Not a v0 blocker.

**Data Protection:**
- ✅ **Audio is personal data — private bucket only, never the ML-training corpus.** Decision 1 (revised) stores it in a new **private GCS bucket** `claritypledge-explain-backs`, separate from the ML corpus, with membership-checked signed URLs (≤1 h) — aligned with the published privacy policy ("stored in Google Cloud"). Highest-severity risk closed.
- ⚠️ **Retention is `[FOUNDER DECISION]` — `deleted_at` column added** → Build, so a future retention job needs no schema change; default = retained until the founder decides.
- ✅ **Consent already covered** — `tos.md:23-38` (separate pre-recording consent dialog, "your voice recorded," "other participants… hear your voice," "consent from anyone in your environment") + privacy policy (GDPR Art 6(1)(a)/9(2)(a), "stored in Google Cloud"). v0 task is to **wire the existing consent dialog into the explain-back capture** + a copy check (current text frames it as live "understanding exercises" — confirm it reads right for an async letter author). NOT a new clause. Note: existing consent permits "anonymized for AI/ML" — explain-backs are pair-private, NOT ML training in v0, reinforcing keeping them out of the ML bucket.
- ✅ No public surface; UUID PK prevents enumeration.

**AI Prompt Security:** N/A for v0 (no LLM, no transcription). Forward note: when transcription ships, treat the transcript as untrusted if ever fed to an LLM (a receiver could record adversarial text).

---

### Implementation Approach

**Worktree recommended:** 11+ files to create/modify across DB migrations, service layer, hooks, components, pages, and routes. Claim a worktree slot before starting.

#### Build Sequence

**Step 0 — Branch setup**
- Claim worktree: `./scripts/git-ops.sh claim 904`

**Step 1 — DB migration: `story_explain_backs` table (no Storage bucket — audio lives in GCS, Step 1b)**
- Write `supabase/migrations/20260611120000_p904_story_explain_backs.sql`:
  - Creates `story_explain_backs` table (columns per Decision 2, including `deleted_at`)
  - Add `_is_letter_participant(delivery_id)` SECURITY DEFINER helper (sender OR receiver), reusing the `_is_letter_sender()` / `_is_letter_receiver()` pattern (no inlined join — RLS recursion risk)
  - Table RLS (Security): **INSERT** `WITH CHECK (auth.uid() = delivery's receiver_profile_id)`; **SELECT** `USING (_is_letter_participant(delivery_id))`; **UPDATE** receiver-only, content columns only (NOT `author_read_at`); **DELETE** `USING (false)` (retention via RPC only)
  - `mark_explain_back_read(p_id)` SECURITY DEFINER RPC — asserts `auth.uid() = sender_id`, sets `author_read_at = now()` (Security: sender-only; do NOT reuse `mark_inbox_item_read`)
- Run `./scripts/migrate.sh`

**Step 1b — GCS storage + membership-checked signed URLs** (Decision 1; audio stays on GCS — privacy policy + credits)
- Provision a **new private GCS bucket** `claritypledge-explain-backs`, separate from the ML-training corpus (infra/gcloud — see Pre-deploy Checklist).
- Extend the `gcs-signed-url` edge function (`supabase/functions/gcs-signed-url/index.ts`) with a **pair-membership check** for explain-back paths: join `story_explain_backs → letter_deliveries → clarity_letters` and verify `auth.uid()` is the receiver (upload) or a participant (playback) before signing. Today it checks JWT only.
- **Size cap** via `x-goog-content-length-range` on the signed upload URL, sized to the audio-length `[FOUNDER DECISION]` (~5 MB for 3 min opus). **MIME** restricted to `audio/webm`, `audio/webm;codecs=opus`, `audio/mp4`.

**Step 2 — Service layer**
- In `src/app/data/letters-service.ts`:
  - `uploadExplainBack(deliveryId, storySnapshotId, blob, medium)` — requests a size-bounded signed UPLOAD url from the extended `gcs-signed-url` edge function (GCS path `gs://claritypledge-explain-backs/{deliveryId}/{storySnapshotId}.webm`), PUTs the blob, inserts the row into `story_explain_backs`
  - `getExplainBacksForDelivery(deliveryId)` — returns `story_explain_backs` rows for all stories in this delivery, including `author_read_at`
  - `markExplainBackRead(explainBackId)` — calls the `mark_explain_back_read(id)` SECURITY DEFINER RPC (asserts `auth.uid() = sender_id`); never a raw client UPDATE (Security)
  - `getExplainBackSignedUrl(explainBackId)` — requests a short-TTL signed PLAYBACK url from the `gcs-signed-url` edge function; the edge function enforces the pair-membership check before signing (Security)
  - Extend `getUnreadLetterCount()` with Branch 3: count `story_explain_backs` where `author_read_at IS NULL` AND delivery's sender is `auth.uid()`

**Step 3 — Audio capture component**
- Create `src/app/components/letters/explain-back-capture.tsx` — the `FixedBottomBar`-based capture panel:
  - Props: `storyTitle`, `onSubmit(blob: Blob, medium: 'audio' | 'text')`, `onCancel`
  - States: idle (CTA row) → recording (waveform, elapsed time, Stop + Cancel) → preview (playback, Re-record, Send) → text fallback (textarea + Submit)
  - Hooks: `useAudioRecorder` (single-file mode, no `onChunkProduced`) + `useMicrophonePermission`
  - [FOUNDER DECISION: audio length cap] — technical default proposal: `maxDurationMs: 3 * 60 * 1000` (3 minutes); the hook already supports this prop.

**Step 4 — Explain-back view focus page**
- Create `src/app/pages/explain-back-view-page.tsx`:
  - Route param: `id` = `story_explain_backs.id`
  - Fetches the explain-back row + signed URL via service layer
  - Calls `markExplainBackRead(id)` on mount (when `author_read_at` is null and viewer is the author)
  - Renders: `FocusHeader` (back → results) + story context (`"On your story: [title]"` link to `/story/:id`) + audio player (`<audio>` with `src` = signed URL) + transcript placeholder copy (`"(Transcript coming soon)"`)
  - Access gate: if viewer is neither sender nor receiver, redirect to `/letters`

**Step 5 — Wire affordances into results page**
- In `src/app/types/index.ts` or `src/app/types/letters.ts`: add `explainBack` and `explainBackUnread` to `StoryWalkItem`
- In `src/app/pages/letter-results-page.tsx`: call `getExplainBacksForDelivery(deliveryId)` on mount; inject results into `StoryWalkItem` array
- In `src/app/components/letters/story-walk.tsx`: pass `explainBack` / `explainBackUnread` down to `LiveStoryCardExpanded` and into `PointRow.children`
- In `PointRow.children` (wired at the story level in `story-walk.tsx`, not inside `PointRow` itself): render the two affordances:
  - **Story-level (after PointRow list):** "Explain back what you understood" CTA **renders only for the authenticated receiver of this delivery** (explicit component check — the reading flow allows anonymous token readers; Security) or "What [Name] understood →" (unread dot if unread) → opens `ExplainBackCapture` (receiver) / navigates to `/explain-back/:id` (author or after submission)
  - **Point-level (inside PointRow.children slot):** "Explain your position" → `/create?pointId=<id>`, or "Edit your story →" / "[Name]'s story →" per Decision 6

**Step 6 — Route registration + bottom-nav**
- In `src/App.tsx`: add `<Route path="/explain-back/:id" element={<LazyRoute><ExplainBackViewPage /></LazyRoute>} />`
- In `src/app/components/layout/bottom-nav.tsx`: add `'/explain-back/'` to the `focusRoutes` array

**Step 7 — Return signal: inbox label**
- In `src/app/components/letters/inbox-tab.tsx`: surface the per-letter explain-back unread count as `• N new from [Name]` below each letter list item when count > 0. This requires `getInboxItems()` or a parallel fetch to include explain-back counts per letter — extend `get_inbox_items` RPC or do a client-side join.
- [FOUNDER DECISION: where author reviews threads — letter overview page vs new inbox surface] — technical default: letter overview page (`/letter/:id/overview`) is the author's results entry point; add a badge/count there rather than a new page.

**Step 8 — Pre-commit checks + regression test**
- Run `./scripts/pre-commit-checks.sh`
- Verify letters and readers without responses render exactly as today (no regressions on `StoryWalk` / `letter-results-page`)

#### Files to Create

| Path | Purpose |
|------|---------|
| `supabase/migrations/20260611120000_p904_story_explain_backs.sql` | DB table + RLS + `_is_letter_participant` helper + `mark_explain_back_read` RPC |
| `src/app/components/letters/explain-back-capture.tsx` | FixedBottomBar capture panel |
| `src/app/pages/explain-back-view-page.tsx` | Focus page for author playback |

#### Files to Modify

| Path | Change |
|------|--------|
| `src/app/data/letters-service.ts` | Add `uploadExplainBack`, `getExplainBacksForDelivery`, `markExplainBackRead`, `getExplainBackSignedUrl`; extend `getUnreadLetterCount` Branch 3 |
| `src/app/types/index.ts` (or `letters.ts`) | Add `explainBack` + `explainBackUnread` to `StoryWalkItem`; add `ExplainBackRow` type |
| `src/app/pages/letter-results-page.tsx` | Fetch + inject explain-backs into `StoryWalkItem`; pass explain-back capture/view handlers |
| `src/app/components/letters/story-walk.tsx` | Accept + pass explain-back props; wire affordances |
| `src/app/components/partners/live-story-card-expanded.tsx` (PointRow children wiring) | Inject point-level "Explain your position" affordance via existing `children` slot |
| `src/App.tsx` | Register `/explain-back/:id` route |
| `src/app/components/layout/bottom-nav.tsx` | Add `'/explain-back/'` to `focusRoutes` |
| `src/app/components/letters/inbox-tab.tsx` | Surface per-letter explain-back unread count |
| `supabase/functions/gcs-signed-url/index.ts` | Add pair-membership check + `x-goog-content-length-range` size cap for explain-back paths (today: JWT-only) |

---

### Pre-deploy Checklist

No new env vars or third-party secrets. But the GCS storage path (Decision 1) adds two non-migration deploy steps:

### Infra to provision
- [ ] Create private GCS bucket `claritypledge-explain-backs` (gcloud; uniform bucket-level access, no public read), separate from `claritypledge-ml-training`
- [ ] Confirm the GCS service account used by the `gcs-signed-url` Cloud Function can sign for the new bucket

### Deploy commands
- [ ] Deploy the edited edge function: `supabase functions deploy gcs-signed-url --project-ref <ref>` (now does the pair-membership check + content-length-range) — **and** the backing Google Cloud Function at `gcs-signed-url` if the signing logic lives there
- [ ] `./scripts/migrate.sh --env prod` — applies the `story_explain_backs` table + RLS + RPC

### Post-deploy verification
- [ ] A non-participant requesting a signed URL for an explain-back path gets 403 (membership check fires — exercise the failure path, not just the happy path)
- [ ] Oversized upload (> cap) is rejected by `x-goog-content-length-range`
- [ ] Check Sentry for new errors in the first 10 minutes
