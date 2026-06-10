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
delivery_stage: spec-review
pipeline_ran:
  - create-spec
  - challenge-prd
  - ux
  - architect
  - ui
  - generate-tests
  - spec-review
uat_file: features/uat/p904.md
test_files:
  - e2e/integration/p904-explain-back-migration.spec.ts
  - e2e/p904-explain-back.spec.ts
  - e2e/a11y/p904-explain-back-accessibility.spec.ts
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
- `src/app/data/api.ts: getSignedUploadUrl()` (private, line ~2863) + `uploadToGCS()` (~2910) — the signed-URL + GCS PUT path. **Constraint:** `getSignedUploadUrl` is scoped to `sessions/` paths and uses the external `gcs-signed-url` Cloud Function (which cannot sign `x-goog-content-length-range` — P812). Explain-backs go to a different, private **GCS** bucket via a **new in-process V4-signing edge function** `explain-back-signed-url` modeled on `generate-story-image-url` (see Decision 1) — a new upload function is needed.
- `supabase/functions/generate-story-image-url/index.ts` — the **in-process V4 signer** to model the new `explain-back-signed-url` function on (controls `SignedHeaders`, can include the size-range header).

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

- **Chosen:** Store explain-back audio in a **new private GCS bucket** `claritypledge-explain-backs` (separate from the ML-training corpus). Upload and playback go through a **new in-process V4-signing edge function `explain-back-signed-url`**, modeled on `generate-story-image-url` (which signs in-process with the service-account key), NOT the external `gcs-signed-url` Cloud Function. The new function does a **pair-membership check** (verify `auth.uid()` is a participant of the delivery before signing) and signs the upload URL **with `x-goog-content-length-range`** for the size cap.
- **Rationale (revised per spec-review BLOCK-2):** Three reasons over Supabase Storage. (1) **Policy alignment** — `privacy-policy-page.tsx:112` already states audio is "stored securely in Google Cloud"; Supabase Storage would contradict the published policy. (2) **Cost** — GCS uses existing Google credits; Supabase Storage bills against the Supabase plan. (3) **Consistency** — one audio store + one retention/backup regime. **Why a new in-process signer, not the existing `gcs-signed-url`:** P812 (decisions.md 2026-04-25) established that the external GCP Cloud Function behind `gcs-signed-url` does **not** sign `x-goog-content-length-range` — adding it to the PUT makes GCS reject with `400 MalformedSecurityHeader`. The size cap (a Security requirement) is therefore impossible on that path. `generate-story-image-url` signs V4 URLs **in-process** in the edge function, so we control the `SignedHeaders` list and can include the size-range header AND the per-pair membership check in one place we own.
- **Trade-off:** A new edge function + the service-account signing key available to it (already the `generate-story-image-url` pattern — no new secret class). One membership query at sign time.
- **Alternative rejected:** Extend the external `gcs-signed-url` Cloud Function to sign the size-range header — touches the signer shared with ml-training audio; rejected to keep blast radius off the live-session path. New Supabase Storage bucket — fragments audio across two providers, bills Supabase, contradicts the published policy. Reusing the **ML-training** bucket — wrong corpus governance.

**Decision 2: Explain-back entity — new `story_explain_backs` table**

- **Chosen:** New table `story_explain_backs` with columns:
  ```
  id                 UUID PK DEFAULT gen_random_uuid()
  letter_id          UUID NOT NULL
  story_id           UUID NOT NULL
  delivery_id        UUID NOT NULL REFERENCES letter_deliveries(id) ON DELETE CASCADE
  recorder_id        UUID NOT NULL REFERENCES profiles(id)
  medium             TEXT NOT NULL CHECK (medium IN ('audio', 'text')) DEFAULT 'audio'
  audio_storage_path TEXT   -- GCS path 'gs://claritypledge-explain-backs/{delivery_id}/{story_id}.webm' (private bucket, separate from ML corpus)
  text_fallback      TEXT    -- populated only when medium='text'
  author_read_at     TIMESTAMPTZ  -- NULL = unread; set ONLY via mark_explain_back_read() RPC (sender-only), never a client UPDATE (Security)
  deleted_at         TIMESTAMPTZ  -- soft-delete for retention [FOUNDER DECISION]; NULL = retained (Security)
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
  FOREIGN KEY (letter_id, story_id) REFERENCES letter_story_snapshots(letter_id, story_id) ON DELETE CASCADE
  UNIQUE(delivery_id, story_id)  -- one explain-back per (story × delivery)
  ```
  Indexes: `(delivery_id)`, `(delivery_id, author_read_at)` — the second drives the "N new from Jamie" count query.
- **Rationale (revised per spec-review BLOCK-1):** `letter_story_snapshots` has a **composite PK `(letter_id, story_id)`** and no `id` column (`20260403224331_p581_clarity_letters.sql:62`), so a single-UUID FK to it is invalid SQL. The explain-back therefore stores `letter_id` + `story_id` (the composite FK to the snapshot) plus `delivery_id` (the receiver axis). `letter_id` is functionally determined by `delivery_id` but is required to satisfy the composite FK. The business key is `UNIQUE(delivery_id, story_id)` — one explain-back per story per receiver in v0. The surrogate `id` PK remains — it is the `/explain-back/:id` route param. `author_read_at` is the lightest possible read-state — a single nullable timestamp. `medium` logs the experiment variable (audio vs text) per Done-When.
- **Trade-off:** `letter_id` is denormalized (derivable from `delivery_id`) but is required to satisfy the composite FK — accepted; it is immutable after seal. `ON DELETE CASCADE` from the snapshot is safe (snapshots are immutable post-seal). The `UNIQUE(delivery_id, story_id)` constraint blocks a second explain-back attempt (re-record updates the existing row, matching the single-shot v0 intent).
- **Alternative rejected:** Add a surrogate `id UUID PK` to the shipped `letter_story_snapshots` table, then keep a single-UUID `story_snapshot_id` FK — rejected: it alters a shipped table that letters/results code already reads, for no benefit over the composite FK. Also rejected: Supabase Storage / ML-bucket reuse (see Decision 1).

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
- ⚠️ **`story_explain_backs` is greenfield — author RLS from scratch.** Participant identity derives via a two-hop join: `delivery_id → letter_deliveries.receiver_profile_id` and `→ clarity_letters.sender_id`. Compose the existing `_is_letter_sender()` / `_is_letter_receiver()` SECURITY DEFINER helpers (do NOT inline the join — RLS recursion risk, decisions.md 2026-04-04); add `_is_letter_participant(p_delivery_id)` (sender OR receiver) for SELECT. **Note (WARN-4):** the new helper is single-arg (`delivery_id`, uses `auth.uid()`), unlike the two-arg existing helpers — see Step 1. **Both new SECURITY DEFINER functions need `SET search_path = ''` + explicit `GRANT EXECUTE … TO authenticated` / `REVOKE … FROM public, anon` (BLOCK-3, Step 1).**
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
- ✅ MIME restricted at the edge function before signing; object key server-derived + UUID-only (`{delivery_id}/{story_id}.webm`) — no PII, no traversal.
- ⚠️ Text-fallback XSS (future): React escapes text by default; sanitize when the transcript view renders HTML. Not a v0 blocker.

**Data Protection:**
- ✅ **Audio is personal data — private bucket only, never the ML-training corpus.** Decision 1 (revised) stores it in a new **private GCS bucket** `claritypledge-explain-backs`, separate from the ML corpus, with membership-checked signed URLs (≤1 h) — aligned with the published privacy policy ("stored in Google Cloud"). Highest-severity risk closed.
- ⚠️ **Retention is `[FOUNDER DECISION]` — `deleted_at` column added** → Build, so a future retention job needs no schema change; default = retained until the founder decides.
- ⚠️ **Consent — clause exists, but no reusable dialog component does (WARN-3).** `tos.md:23-38` already covers recording consent ("your voice recorded," "other participants… hear your voice," "consent from anyone in your environment") + privacy policy (GDPR Art 6(1)(a)/9(2)(a), "stored in Google Cloud") — so this is NOT a new legal clause. **But** P50 removed `ConsentNotice` and replaced it with an **inline consent checkbox** in `/live` (`clarity-live-page.tsx:15`) — there is no reusable `ConsentDialog` to "wire." → Build: add an **inline consent checkbox in the `ExplainBackCapture` panel, shown before recording can start** (mirror the /live inline pattern). **[FOUNDER DECISION: consent copy]** — the existing text frames recording as live "understanding exercises"; confirm wording reads correctly for an async letter author before /ship. Existing consent permits "anonymized for AI/ML" — explain-backs are pair-private, NOT ML training in v0, reinforcing keeping them out of the ML bucket.
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
  - Creates `story_explain_backs` table (columns per Decision 2, including the composite FK `(letter_id, story_id)` and `deleted_at`)
  - Add `_is_letter_participant(p_delivery_id UUID)` SECURITY DEFINER helper (sender OR receiver). **WARN-4 — signature differs from existing helpers:** the existing `_is_letter_sender(letter_id, user_id)` / `_is_letter_receiver(letter_id, user_id)` take two args; the new helper takes only `delivery_id` and uses `auth.uid()` directly. Implementation: `SELECT letter_id FROM letter_deliveries WHERE id = p_delivery_id` (SECURITY DEFINER bypasses RLS), then `RETURN _is_letter_sender(v_letter_id, auth.uid()) OR _is_letter_receiver(v_letter_id, auth.uid())`. Do NOT inline the join (RLS recursion risk — decisions.md 2026-04-04). Do NOT copy the old two-arg signature.
  - **BLOCK-3 — both functions are SECURITY DEFINER and MUST (per decisions.md 2026-05-31 + P651/P850):** declare `SET search_path = ''` with **schema-qualified** references (`public.letter_deliveries`, `public.story_explain_backs`, …) — do NOT copy the deprecated `SET search_path = public` pattern from P660's `mark_inbox_item_read`; and set grants explicitly: `REVOKE ALL ON FUNCTION … FROM public, anon; GRANT EXECUTE ON FUNCTION mark_explain_back_read(uuid) TO authenticated;` (and the same revoke + `GRANT EXECUTE … TO authenticated` for `_is_letter_participant`). Without the GRANT, callers hit "permission denied for function" (the P850 signal).
  - Table RLS (Security): **INSERT** `WITH CHECK (auth.uid() = delivery's receiver_profile_id)`; **SELECT** `USING (public._is_letter_participant(delivery_id))`; **UPDATE** receiver-only, content columns only (NOT `author_read_at`); **DELETE** `USING (false)` (retention via RPC only)
  - `mark_explain_back_read(p_id UUID)` SECURITY DEFINER RPC — asserts `auth.uid() = sender_id` (looked up via the delivery → letter), sets `author_read_at = now()` (Security: sender-only; do NOT reuse `mark_inbox_item_read` — it authorizes both parties)
- Run `./scripts/migrate.sh`

**Step 1b — GCS storage + in-process membership-checked signed URLs** (Decision 1; audio stays on GCS — privacy policy + credits)
- Provision a **new private GCS bucket** `claritypledge-explain-backs`, separate from the ML-training corpus (infra/gcloud — see Pre-deploy Checklist), and apply its **own CORS config** (new bucket needs its own allowlist — `scripts/gcs-cors.json` + `scripts/set-gcs-cors.sh`; without it browser PUTs fail preflight, P805-class).
- Create a **new edge function** `supabase/functions/explain-back-signed-url/index.ts`, modeled on `generate-story-image-url` (**in-process V4 signing** — NOT the external `gcs-signed-url` Cloud Function, which cannot sign the size-range header per P812). It performs a **pair-membership check** for explain-back paths: look up `letter_id` from `letter_deliveries` by `delivery_id`, then `_is_letter_sender`/`_is_letter_receiver` — verify `auth.uid()` is the receiver (upload) or a participant (playback) before signing.
- **Size cap** included in the in-process V4 `SignedHeaders` as `x-goog-content-length-range`, sized to the audio-length `[FOUNDER DECISION]` (~5 MB for 3 min opus). **MIME** restricted to `audio/webm`, `audio/webm;codecs=opus`, `audio/mp4`. Signed-URL TTL ≤ 1 h.

**Step 2 — Service layer**
- In `src/app/data/letters-service.ts`:
  - `uploadExplainBack(deliveryId, storyId, blob, medium)` — requests a size-bounded signed UPLOAD url from the new `explain-back-signed-url` edge function (GCS path `gs://claritypledge-explain-backs/{deliveryId}/{storyId}.webm`), PUTs the blob, inserts the row into `story_explain_backs` (deriving `letter_id` from the delivery for the composite FK)
  - `getExplainBacksForDelivery(deliveryId)` — returns `story_explain_backs` rows for all stories in this delivery, including `author_read_at`
  - `markExplainBackRead(explainBackId)` — calls the `mark_explain_back_read(id)` SECURITY DEFINER RPC (asserts `auth.uid() = sender_id`); never a raw client UPDATE (Security)
  - `getExplainBackSignedUrl(explainBackId)` — requests a short-TTL signed PLAYBACK url from the `gcs-signed-url` edge function; the edge function enforces the pair-membership check before signing (Security)
  - Extend `getUnreadLetterCount()` with Branch 3 (WARN-1 — `story_explain_backs` is keyed by `delivery_id`, not `letter_id`, so there is no direct sender filter; use the existing two-sequential-query pattern, NOT a PostgREST nested filter): (1) fetch the sender's own letter IDs → their `letter_deliveries` IDs; (2) `count` `story_explain_backs WHERE delivery_id IN (<those>) AND author_read_at IS NULL`. The current `getUnreadLetterCount` does not fetch delivery IDs for the sender's letters — add that fetch.

**Step 3 — Audio capture component**
- Create `src/app/components/letters/explain-back-capture.tsx` — the `FixedBottomBar`-based capture panel:
  - Props: `storyTitle`, `onSubmit(blob: Blob, medium: 'audio' | 'text')`, `onCancel`
  - States: idle (CTA row + **inline consent checkbox — recording disabled until checked**, WARN-3) → recording (waveform, elapsed time, Stop + Cancel) → preview (playback, Re-record, Send) → text fallback (textarea + Submit)
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
- In `src/app/components/letters/inbox-tab.tsx`: surface the per-letter explain-back unread count as `• N new from [Name]` below each letter list item when count > 0. **WARN-2 — default to a client-side join in v0** (one parallel fetch of unread explain-back counts grouped by `delivery_id`, joined to the inbox list in the component): extending the `get_inbox_items` RPC would require a new migration NOT in Files to Create, and this count is UAT-2 only. If the client-side join proves too chatty at scale, extend the RPC in a follow-up (add that migration then).
- [FOUNDER DECISION: where author reviews threads — letter overview page vs new inbox surface] — technical default: letter overview page (`/letter/:id/overview`) is the author's results entry point; add a badge/count there rather than a new page.

**Step 8 — Pre-commit checks + regression test**
- Run `./scripts/pre-commit-checks.sh`
- Verify letters and readers without responses render exactly as today (no regressions on `StoryWalk` / `letter-results-page`)

#### Files to Create

| Path | Purpose |
|------|---------|
| `supabase/migrations/20260611120000_p904_story_explain_backs.sql` | DB table + composite FK + RLS + `_is_letter_participant` helper + `mark_explain_back_read` RPC (both SECURITY DEFINER with GRANT/REVOKE + `SET search_path = ''`) |
| `supabase/functions/explain-back-signed-url/index.ts` | New in-process V4 signer (modeled on `generate-story-image-url`); pair-membership check + `x-goog-content-length-range` size cap + MIME allowlist |
| `src/app/components/letters/explain-back-capture.tsx` | FixedBottomBar capture panel (incl. inline pre-recording consent checkbox) |
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
| `src/app/components/letters/inbox-tab.tsx` | Surface per-letter explain-back unread count (client-side join in v0 — see Step 7) |
| `src/app/data/api.ts` | Add `uploadToGCSWithRange()` helper (PUT with `x-goog-content-length-range`) if `uploadToGCS` doesn't already set it — used by `uploadExplainBack` |

---

### Pre-deploy Checklist

The GCS storage path (Decision 1) adds infra + deploy steps. The new `explain-back-signed-url` edge function needs the **same service-account signing secret** that `generate-story-image-url` already uses — confirm it is set for the new function (no new secret class, but a per-function env binding).

### Infra to provision
- [ ] Create private GCS bucket `claritypledge-explain-backs` (gcloud; uniform bucket-level access, no public read), separate from `claritypledge-ml-training`
- [ ] **Apply CORS to the new bucket** (`scripts/gcs-cors.json` + `scripts/set-gcs-cors.sh`) — allowlist the prod origin × `PUT`/`GET` × required response headers. Without this, browser PUTs fail on preflight (P805-class). Verify with the four-layer P812 preflight check.
- [ ] Confirm the GCS service account available to the `explain-back-signed-url` edge function can sign V4 URLs for the new bucket (same key class as `generate-story-image-url`)

### Deploy commands
- [ ] Deploy the new edge function: `supabase functions deploy explain-back-signed-url --project-ref <ref>`
- [ ] Confirm the signing secret env binding is set for `explain-back-signed-url` (mirror `generate-story-image-url`)
- [ ] `./scripts/migrate.sh --env prod` — applies the `story_explain_backs` table + RLS + RPCs

### Post-deploy verification
- [ ] A non-participant requesting a signed URL for an explain-back path gets 403 (membership check fires — exercise the failure path, not just the happy path)
- [ ] Oversized upload (> cap) is rejected by `x-goog-content-length-range` (confirm the signed URL actually carries the header — the failure P812 caught)
- [ ] A real audio PUT from the prod origin succeeds (CORS preflight passes)
- [ ] Check Sentry for new errors in the first 10 minutes

---

## Component Strategy

### Reuse Audit — Key Findings

**No dedicated audio playback component exists.** Search confirms the codebase has no `AudioPlayer`, `PlaybackPanel`, or similar reusable component. `clarity-chat-page.tsx` has an inline `<audio ref={audioRef}>` + play/pause state that is not extracted. The view page will use a plain `<audio controls>` element with a signed-URL `src` — not a raw `<audio>` per se, but the native controls element styled to match the surface. This is a deliberate **New** element; see justification below.

**No standalone recording UI panel exists tied to `use-audio-recorder.ts`.** `clarity-live-page.tsx` uses `useAudioRecorder` inside a ~4000-line page with no extracted recording panel component. `clarity-chat-page.tsx` uses raw `MediaRecorder` refs (bypasses the hook). There is no `RecordingPanel`, `WaveformBar`, or timer component to reuse. The capture panel is therefore **New**, not Extend.

**`FixedBottomBar` is directly reusable** (exact pattern: `letter-flow-content.tsx` + `story-walk.tsx` already import it for bottom-action docking). Decision 3 in the architect layer is confirmed.

**`FocusHeader`** is directly reusable — identical pattern to `story-detail-page.tsx`, `point-detail-page.tsx`, `agreement-page.tsx`. Props are minimal: `onBack`, optional `label`.

**`useAudioRecorder`** is directly reusable in single-file mode (no `onChunkProduced`, no chunked mode). `stopRecording()` returns `Blob | null` — exactly the blob the capture panel needs. `maxDurationMs` prop already supports the `[FOUNDER DECISION]` length cap.

**`useMicrophonePermission`** is directly reusable. The hook's `MicrophonePermissionDialog` (a Dialog overlay, not a FixedBottomBar panel) is **not** used here — permission errors surface inline in the FixedBottomBar panel as a text message + fallback link, consistent with the recording surface pattern (no modal-on-top-of-panel).

**`MicrophonePermissionDialog`** — do NOT use. The dialog pattern is for standalone permission prompts before a session; inside a FixedBottomBar recording panel, inline error text + "Prefer to type?" fallback is the correct degradation. Avoids z-index conflict (dialog over fixed bar) and matches the calm/utilitarian register.

**`TranscriptionInput`** — do NOT use for recording. Its purpose is Web Speech API dictation → text output (discards audio). Use only for the text fallback state inside the capture panel, where the user explicitly chooses "Prefer to type?" — but as a plain `<Textarea>` + submit, not `TranscriptionInput` (which re-introduces dictation). `TranscriptionInput` is unrelated to the felt-channel recording path.

**`GravatarAvatar` / `PersonAvatar`** — reused on the view page to display the recorder's identity alongside the playback. `GravatarAvatar` requires `name` + `photoUrl` + `avatarColor` + `isPledger` (all four — per `.claude/rules/src.md`). The results-page `StoryWalk` already carries `receiverProfile` data, so all props are available.

---

### Component Inventory Summary

| Component | Classification | Location | Justification |
|-----------|---------------|----------|---------------|
| `FixedBottomBar` | **Reuse** | `src/app/components/shared/fixed-bottom-bar.tsx` | Identical fixed-bottom docking pattern; forwardRef; already used in `story-walk.tsx` |
| `FocusHeader` | **Reuse** | `src/app/components/layout/focus-header.tsx` | Exact pattern for all focus pages (`/story/:id`, `/point/:id`, `/agreement/:id`) |
| `useAudioRecorder` | **Reuse** | `src/hooks/use-audio-recorder.ts` | Single-file mode; `maxDurationMs` supports cap; already handles Safari mp4 fallback |
| `useMicrophonePermission` | **Reuse** | `src/hooks/useMicrophonePermission.ts` | Permission state + request; same pattern as `/live` |
| `GravatarAvatar` | **Reuse** | `src/components/ui/gravatar-avatar.tsx` | View page recorder identity row |
| `Button` (shadcn/ui) | **Reuse** | `@/components/ui/button` | All CTAs; `variant="default"` for primary, `variant="ghost"` or `variant="outline"` for secondary |
| `Textarea` | **Reuse** | `@/components/ui/textarea` | Text-fallback input in capture panel |
| `MicrophonePermissionDialog` | **Not used** | — | Dialog-on-FixedBottomBar creates z-index conflict; inline error + fallback is correct here |
| `TranscriptionInput` | **Not used** | — | Discards audio; wrong path. Text fallback uses raw `<Textarea>` |
| `ExplainBackCapturePanel` | **New** | `src/app/components/letters/explain-back-capture.tsx` | No existing recording panel tied to `useAudioRecorder`; 4-state machine (idle/recording/preview/text-fallback) is novel to this surface |
| `ExplainBackViewPage` | **New** | `src/app/pages/explain-back-view-page.tsx` | No existing playback focus page; `/story/:id` shape but content is audio + transcript placeholder |
| `ExplainBackAffordanceRow` (inline, ~30 lines) | **New** (inline in `story-walk.tsx`) | wired at `StoryWalk` level | Story-level CTA row (receiver: capture; author: view link + unread dot); too tightly coupled to `StoryWalkItem` to extract |
| `ExplainPositionAffordanceRow` (inline, ~20 lines) | **New** (inline in `PointRow.children`) | wired in `story-walk.tsx` via `PointRow.children` slot | Point-level "Explain your position" / "Edit your story" / "[Name]'s story" — uses UNIQUE-constraint-aware edit-vs-create logic |

**Architect's "new component" assumptions confirmed for `explain-back-capture.tsx` and `explain-back-view-page.tsx`.** The affordance rows are wired inline rather than as named components — they are 20-30 line conditional renders, not reusable across pages, and extracting them would add a file without reducing duplication.

---

### Component Map

| # | Component | Classification | Reason |
|---|-----------|---------------|--------|
| 1 | `FixedBottomBar` | Reuse | Letter-flow canonical bottom bar |
| 2 | `FocusHeader` | Reuse | Focus-page back button (identical to `/story/:id` usage) |
| 3 | `useAudioRecorder` (hook) | Reuse | Single-file mode; `maxDurationMs` prop; Safari fallback |
| 4 | `useMicrophonePermission` (hook) | Reuse | Permission flow identical to /live |
| 5 | `GravatarAvatar` | Reuse | Recorder identity on view page |
| 6 | `Button` | Reuse | All CTAs |
| 7 | `Textarea` | Reuse | Text fallback path |
| 8 | `ExplainBackCapturePanel` | New | No extraction candidate found |
| 9 | `ExplainBackViewPage` | New | No extraction candidate found |
| 10 | `ExplainBackAffordanceRow` | New (inline) | Story-level CTA; not cross-page |
| 11 | `ExplainPositionAffordanceRow` | New (inline) | Point-level CTA; not cross-page |

---

### Composition Trees

#### A. Capture Panel — `ExplainBackCapturePanel` inside `FixedBottomBar`

Rendered by `story-walk.tsx` below `LiveStoryCardExpanded` when viewer is the authenticated receiver and no explain-back exists yet.

```
StoryWalk (story-walk.tsx)
└── [captureOpen state: boolean]
    ├── LiveStoryCardExpanded
    │   └── PointRow.children  ← ExplainPositionAffordanceRow (inline)
    │       • receiver: "Explain your position" → /create?pointId=<id>
    │       • receiver (has story): "Edit your story →" → /story/:id?edit=true
    │       • author: "[Name]'s story →" → /story/:id (read-only)
    │
    ├── ExplainBackAffordanceRow (inline, story level)
    │   • receiver, no explain-back: <Button variant="default"> Explain back what you understood </Button>
    │                                → onClick: setCaptureOpen(true)
    │   • receiver, explain-back exists: "What you understood →" → /explain-back/:id
    │   • author, explain-back exists: "What [Name] understood →" <UnreadDot> → /explain-back/:id
    │                                  onClick: navigate + markExplainBackRead
    │   • author, no explain-back: nothing rendered
    │
    └── [captureOpen && isReceiver]:
        ExplainBackCapturePanel (explain-back-capture.tsx)
        └── FixedBottomBar (fixed-bottom-bar.tsx)
            └── [captureState: 'idle' | 'recording' | 'preview' | 'text-fallback']
                ├── idle:
                │   ├── <p class="text-sm text-muted-foreground"> {storyTitle} · Open → </p>
                │   ├── <Button variant="default" class="w-full max-w-sm"> Explain back what you understood </Button>
                │   │   onClick: requestPermission → startRecording → state='recording'
                │   └── <button class="text-sm text-muted-foreground"> Prefer to type? </button>
                │       onClick: state='text-fallback'
                │
                ├── recording:
                │   ├── <div class="flex items-center gap-2">
                │   │   ├── <span class="w-2 h-2 rounded-full bg-destructive animate-pulse" />  ← recording dot
                │   │   ├── <span class="text-sm text-foreground font-medium"> Recording… </span>
                │   │   └── <span class="text-sm tabular-nums text-muted-foreground"> {elapsed} </span>  e.g. 0:42
                │   ├── <div class="h-1.5 w-full max-w-sm bg-muted rounded-full overflow-hidden">  ← progress rail
                │   │   └── <div class="h-full bg-foreground/20 rounded-full animate-pulse" style="width:XX%" />
                │   ├── <Button variant="default" class="w-full max-w-sm"> Stop </Button>
                │   │   onClick: stopRecording → blob → state='preview'
                │   └── <Button variant="ghost" class="w-full max-w-sm text-muted-foreground"> Cancel </Button>
                │       onClick: stopRecording (discard blob) → state='idle'
                │
                ├── preview:
                │   ├── <audio controls src={blobUrl} class="w-full max-w-sm h-10" />
                │   ├── <Button variant="default" class="w-full max-w-sm"> Send to {authorName} </Button>
                │   │   onClick: onSubmit(blob, 'audio') → loading → onDone
                │   └── <Button variant="ghost" class="text-sm text-muted-foreground"> Re-record </Button>
                │       onClick: revoke blobUrl → state='idle'
                │
                └── text-fallback:
                    ├── <Textarea placeholder="Explain back what you understood…" class="w-full max-w-sm" />
                    ├── <Button variant="default"> Send </Button>
                    │   onClick: onSubmit(text, 'text') → loading → onDone
                    └── <Button variant="ghost" class="text-sm text-muted-foreground"> Record instead </Button>
                        onClick: state='idle'
```

#### B. View Focus Page — `ExplainBackViewPage` at `/explain-back/:id`

```
ExplainBackViewPage (explain-back-view-page.tsx)
├── FocusHeader onBack={→ results page}
├── [loading]: <ClarityPageLoader />
├── [error / no access]: redirect /letters
└── [ready]:
    <div class="px-4 py-6 max-w-lg mx-auto space-y-6">
    ├── <p class="text-sm text-muted-foreground">
    │   What {recorderName} understood
    │   </p>
    ├── <p class="text-sm text-foreground">
    │   On your story:
    │   <Link to="/story/:storyId" class="text-blue-600 hover:underline"> {storyTitle} </Link>
    │   <ExternalLink size={12} class="inline ml-0.5 text-blue-600" />
    │   </p>
    ├── <div class="flex items-center gap-2">
    │   <GravatarAvatar name={recorderName} photoUrl={…} avatarColor={…} isPledger={…} size="sm" />
    │   <span class="text-sm text-foreground"> {recorderName} </span>
    │   <span class="text-xs text-muted-foreground"> {formatTimeAgo(createdAt)} ago </span>
    │   </div>
    ├── [medium === 'audio']:
    │   <audio controls src={signedUrl}
    │          class="w-full rounded-md border border-border bg-muted h-12" />
    ├── [medium === 'text']:
    │   <div class="rounded-md border border-border bg-muted/50 p-4 text-sm text-foreground whitespace-pre-wrap">
    │   {textFallback}
    │   </div>
    └── <p class="text-xs text-muted-foreground italic">
        (Transcript coming soon)
        </p>  ← rendered only when medium === 'audio'
```

#### C. InboxTab — letter-level return signal

```
InboxTab (inbox-tab.tsx)  ← Extend
└── {items.map(item):
    ├── [existing unread dot + icon row]
    └── [explainBackCount > 0]:
        <p class="text-xs text-muted-foreground mt-0.5">
        • {explainBackCount} new from {item.actor_name}
        </p>
```

---

### Visual Specification

#### Register
Calm / neutral / utilitarian — a sibling to the results page and story-walk. No ceremony, no celebratory language, no badge iconography. The recording indicator is a muted pulse, not a prominent red icon.

#### Hierarchy (capture panel)

1. Primary action: "Explain back what you understood" button — `bg-blue-500 hover:bg-blue-600 text-white w-full max-w-sm min-h-[44px]`
2. Story context: story title in `text-sm text-muted-foreground` above the CTA row — passive, de-emphasized
3. Recording state: elapsed timer in `text-sm tabular-nums text-muted-foreground`; dot in `bg-destructive animate-pulse`
4. Secondary action ("Prefer to type?" / "Cancel" / "Re-record"): `text-sm text-muted-foreground` bare button — deliberately low-weight; never the same visual level as the primary

#### Hierarchy (view page)

1. Context ("On your story: [title]") — `text-sm text-foreground` with blue linked title
2. Recorder identity row — `GravatarAvatar` sm + name + timestamp
3. Playback element — `<audio controls>` full-width, `h-12`, `bg-muted` background
4. Transcript placeholder — `text-xs text-muted-foreground italic` — lowest weight

#### Token set (semantic only, from `index.css` / `tailwind.config.js`)

| Element | Classes |
|---------|---------|
| Background (panels, cards) | `bg-background`, `bg-muted`, `bg-muted/50` |
| Text: primary | `text-foreground` |
| Text: secondary / supporting | `text-muted-foreground` |
| Text: label | `text-sm` |
| Text: timestamp / legal | `text-xs` |
| Action primary | `bg-blue-500 hover:bg-blue-600 text-white` |
| Action ghost / secondary | `variant="ghost"` (resolves to `text-foreground hover:bg-accent`) |
| Action outline | `variant="outline"` |
| Recording dot | `w-2 h-2 rounded-full bg-destructive animate-pulse` |
| Capture panel border | `border border-border rounded-t-[10px]` (inherits from `FixedBottomBar`) |
| Progress rail | `h-1.5 bg-muted rounded-full`; fill `bg-foreground/20` |
| Unread dot (results) | `w-2 h-2 rounded-full bg-blue-500` (same pattern as `inbox-tab.tsx:183`) |
| Touch targets | `min-h-[44px]` on all interactive elements |
| Max width | `max-w-sm` for all panel content (consistent with `story-walk.tsx` `w-full max-w-sm`) |
| Spacing within panel | `space-y-3` between rows; `gap-2` between inline elements |
| View page outer padding | `px-4 py-6 max-w-lg mx-auto space-y-6` |

#### Negative constraints (NOT this)

- NOT a certificate frame, NOT rounded full-bleed card with shadow — flush bottom bar only
- NOT a green button for "Send" — send is an action, not a success state; use `bg-blue-500`
- NOT `bg-red-500` for the stop button — use `variant="default"` (dark/primary); the destructive tone belongs to the recording dot indicator, not the button
- NOT a waveform visualisation (canvas, SVG bars) — a simple CSS progress rail + pulse dot carries the "live" signal without complexity
- NOT a modal overlay during recording — the FixedBottomBar is always full-width, no backdrop
- NOT amber / orange / yellow / purple anywhere — design-system prohibited

#### Spacing per zone

| Zone | Spacing |
|------|---------|
| FixedBottomBar inner content | `p-4 pb-[max(env(safe-area-inset-bottom),1rem)]` (inherited from component) |
| Between CTA rows in panel | `space-y-3` |
| Between story context + CTA | `mb-1` on context line |
| View page sections | `space-y-6` |
| Identity row internal | `gap-2` |

#### Animation

- Recording dot: `animate-pulse` (Tailwind built-in, 2 s ease-in-out infinite) — muted visual signal
- Panel open/close: `FixedBottomBar` is always-mounted with conditional render of `ExplainBackCapturePanel` (`captureOpen` boolean); no slide animation — consistent with existing `story-walk.tsx` bottom bar behavior (no enter/exit animation there either)
- View page mount: `animate-fade-in` (keyframe defined in `tailwind.config.js`) — consistent with `story-walk.tsx:115`
- No other animation — calm register

---

### Extraction Plan

**None warranted.** The two new components (`ExplainBackCapturePanel`, `ExplainBackViewPage`) are single-site. The affordance rows are inline renders in `story-walk.tsx` (20-30 lines each), not duplicated across files. If a second recording-capture surface appears (e.g., the re-paraphrase loop UI in a future spec), `ExplainBackCapturePanel` becomes the extraction candidate at that point — not preemptively.

---

### Challenge Notes

**Challenge: native `<audio controls>` on the view page.** The architect specified `<audio>` with `src` = signed URL. The native controls element is functional but its appearance is browser-defined and inconsistent across platforms (Chrome mobile, Safari iOS, Firefox). For v0 this is acceptable — the register is utilitarian and the transcript is the eventual primary content. If the visual inconsistency is flagged at UAT, a minimal custom control (play/pause button + elapsed time from `HTMLAudioElement.currentTime`) requires ~30 lines and no new dependencies. Do not build it preemptively.

**Challenge: `animate-pulse` on the progress rail fill vs. the recording dot.** Two simultaneous `animate-pulse` elements on the same panel can look busy. Recommendation: use `animate-pulse` only on the dot; apply a `transition-all duration-1000` on the progress bar width update instead (width is driven by elapsed/maxDuration ratio, updated in state every second). This gives a smooth crawl that reads as "in progress" rather than a flashing bar. Validate at visual QA.

**Challenge: auth gate for the capture affordance.** The reading flow supports anonymous token readers (`clarity_live_page.tsx` + token-gated letter reading). The spec (Security section) requires the "Explain back" CTA to render only for the authenticated receiver, checked in the component — not inherited from the route layout. The `ExplainBackAffordanceRow` must receive `isAuthenticatedReceiver: boolean` from `story-walk.tsx` (derived from `user.id === delivery.receiver_id` at the results page level). Do not derive it inside the affordance row — keep the row a pure render, the check at the page level.

---

## Test Coverage Strategy

### What is tested and why

| Test | File | Coverage |
|------|------|----------|
| DB table + all columns exist | `e2e/integration/p904-explain-back-migration.spec.ts` | Prevents P160-class "column not found in schema cache" bugs |
| `medium` default = 'audio', `author_read_at` default = NULL | Integration | Schema defaults applied |
| UNIQUE(delivery_id, story_id) enforced | Integration | Prevents duplicate explain-backs per story |
| Receiver can INSERT own explain-back | Integration | RLS INSERT WITH CHECK correct |
| Sender (other participant) can SELECT | Integration | Pair-private SELECT passes for both participants |
| **PRIVACY INVARIANT**: Third party gets 0 rows (pair-private RLS) | Integration | Core data-exposure risk |
| Receiver CANNOT directly write `author_read_at` | Integration | Sender-only read-state security invariant |
| `mark_explain_back_read` RPC exists | Integration | Function deployed |
| Sender CAN call `mark_explain_back_read` | Integration | Sets author_read_at correctly |
| Non-sender CANNOT call `mark_explain_back_read` | Integration | Sender-only guard enforced |
| `_is_letter_participant` helper exists | Integration | Required by SELECT RLS |
| Smoke: results page loads without errors (both perspectives) | `e2e/p904-explain-back.spec.ts` | No regression on existing page |
| "Explain back what you understood" CTA visible (empty state) | E2E | v0 AC: receiver can file an explain-back |
| "Explain your position" CTA visible (empty state) | E2E | v0 AC: receiver can explain position |
| Author does NOT see capture CTA | E2E | Auth gate: author side is read-only |
| Anon token reader sees no capture CTA | E2E (security) | Security review: explicit auth gate |
| Text fallback: submit → DB row medium='text' | E2E | End-to-end text path verifiable headless |
| After submission: filled state label changes | E2E | UI state machine (post-submit) |
| "paraphrase" never in user-facing copy | E2E | Copy rule enforcement |
| "Explain your position" routes to /create?pointId=… | E2E | Phase 0 routing |
| Sender navigates to /explain-back/:id | E2E | View page reachable |
| View page shows "What Jamie understood" (name-attributed) | E2E | Copy rule for bilateral surface |
| View page has back button | E2E | FocusHeader present |
| View page sets author_read_at on mount | E2E | Read-state updated on open |
| Third party redirected from /explain-back/:id | E2E (security) | Access gate |
| Sender sees "What Jamie understood →" + unread dot | E2E | Return signal (per-card) |
| Letter without explain-backs renders unchanged | E2E | Regression gate |
| Both affordances keyboard reachable (Tab) | `e2e/a11y/p904-explain-back-accessibility.spec.ts` | WCAG 2.1 keyboard access |
| CTA button ≥ 44px touch target | A11y | WCAG 2.5.8 |
| "Prefer to type?" keyboard accessible | A11y | Fallback path keyboard |
| No "paraphrase" in ARIA labels | A11y | Copy rule + screen reader safety |
| Back button first in tab order on view page | A11y | Focus management on focus pages |
| Audio player has accessible controls | A11y | `<audio controls>` native a11y |

### What is NOT tested and why

| Gap | Reason |
|-----|--------|
| Real audio recording (MediaRecorder → blob) | MediaRecorder not available headless; blob upload requires real GCS credentials. Test for UI state presence only; audio path tested manually via UAT-5. |
| GCS signed URL validity / content-length-range enforcement | Requires live GCS bucket (`claritypledge-explain-backs`); infrastructure test, not unit/E2E. Tested via Pre-deploy Checklist: "Oversized upload rejected by content-length-range". |
| `uploadExplainBack()` service function internals | Service layer is thin integration — covered end-to-end by the text fallback submission test. No pure logic to unit-test. |
| `getExplainBacksForDelivery()` return signal (letter-level count in InboxTab) | InboxTab return signal (Branch 3 of `getUnreadLetterCount`) not in scope until `/dev` builds it. The unread dot per-card is tested; the letter-list count is UAT-2. |
| `deleted_at` soft-delete retention RPC | Retention policy is `[FOUNDER DECISION]` — not wired in v0. Schema column existence is verified in the migration test. |
| Video explain-back path | Deferred to v1 explicitly. Not in scope. |
| `verdict`/`question`/`answer` typed items | Deferred. Not in scope. |
| Re-paraphrase loop UI | Deferred. Not in scope. |
| Audio transcription | Deferred. Not in scope. |
| Sealed-ordering invariant (receiver cannot see author accuracy rating before submitting their own) | Not applicable to v0 — async grading moved to /live. |

### Test pyramid

```
              A11y (6 tests)
           E2E feature (18 tests)
      Integration / migration (10 tests)
            Unit: 0 (no isolated pure logic)
```

### File list

| File | Type | Status |
|------|------|--------|
| `e2e/integration/p904-explain-back-migration.spec.ts` | Integration/migration | Green after migration applied |
| `e2e/p904-explain-back.spec.ts` | E2E feature | Tests marked `[EXPECTED-FAIL until /dev]` will fail until components built |
| `e2e/a11y/p904-explain-back-accessibility.spec.ts` | Accessibility | Tests marked `[EXPECTED-FAIL until /dev]` will fail until components built |
| `features/uat/p904.md` | UAT scenarios | Manual + E2E-driven |

### AC-to-test traceability

| v0 Acceptance Criterion | Test(s) |
|-------------------------|---------|
| AC-1: On at least one story of a real letter, a receiver records an audio explain-back without a meeting, and the author listens to it async | UAT-1 (text path E2E-proven), UAT-5 (audio manual), UAT-2 (author side) |
| AC-2: The receiver files a position-explanation Story on a point, and it inherits the point's privacy (private point → private story) | E2E: "Explain your position" routes to /create?pointId, UAT-3 (story inheritance verified via existing P607 coverage) |
| AC-3: The explain-back is reachable only by the two participants (verified — no third party can load it) | Integration: PRIVACY INVARIANT test; E2E: third-party redirect test; UAT-4 |
| AC-4: Founder-approved copy for all receiver- and author-facing prompts `[FOUNDER DECISION]` | E2E: copy rule tests ("paraphrase" absent); A11y: ARIA label copy check; UAT-7. NOTE: actual copy approval is `[FOUNDER DECISION]` — tests verify the spec-mandated strings and exclusions but cannot verify founder approval. Flag this AC for explicit founder sign-off before /ship. |
