---
status: week
type: story
rank: 15
created_date: '2026-09-30'
tags: [letters, one-to-many, predictions, calibration]
disclosure: public
delivery_stage: create-spec
pipeline_ran: [create-spec]
drafted_by: opus
exec_model: opus
exec_effort: high
driver: anomaly
---

# P1379: Public letters stop asking the author to guess each reader's understanding

## Problem

**Situation:** When an author prepares a letter, they rate each story 0–10 for how well they think
the reader will understand it (`LetterPredictionWalk`). After the reader rates their own
understanding, the reveal compares the two: `CalibrationVerdict` ("N-point gap") plus
`LetterRevealNumeric` ("{Author} thinks you understand less than you think."). This works for a
one-to-one letter, where the author is guessing about a specific person they know.

**Complication:** A public letter (`mode: 'one-to-many'`) goes to anyone with the link. The author
is guessing about an anonymous average reader, but the reveal presents the number to each stranger
as a personal judgment. Readers repeatedly ask where the number came from. For a stranger it is a
verdict with no basis.

**Question:** How should public letters handle the understanding rating? The founder decided on
2026-09-30. Option A ships in this spec. Option C is a separate follow-up slice.

> Founder framing, verbatim (2026-09-30): *"public/one-to-many letters skip the author prediction step in preparation entirely. Readers of a public letter still rate their own understanding, but the reveal must not show an author prediction/gap framing."*
>
> *"One-to-one letters are UNCHANGED: prediction step, personal reveal, gap framing all stay."*

## Appetite

- **Blast radius: medium-high.** It touches the compose flow, both reading paths (anonymous local
  and token/authenticated remote), the author's overview and results pages, and one read RPC. The
  one-to-one flow shares every one of these components, so a wrong `mode` branch breaks the core
  product loop.
- **Reversibility: high.** No data is deleted. The only migration is a `CREATE OR REPLACE` on a read
  RPC, and it can be reverted.
- **Decision density: low for slice A** (decided). **Medium for slice C:** threshold N and copy are
  still open.

## Solution

### Slice A: must ship

**A1. Compose (public letters): no prediction step.** On a public doc the compose page already sets
`mode = 'one-to-many'` and skips the receiver modal (`letter-compose-page.tsx` ~L122–130). Today it
then goes `predict → seal-confirm`. After this change it goes straight to `seal-confirm`
(`LetterSealConfirmCard`, where the author chooses "Just read" or explain-back). The seal call sends
`predictions = []`. The client guard "Please predict all N stories before sealing" must apply only
when `mode === 'one-to-one'`. Verified: `seal_and_send_letter` (latest definition
`20260904120000_p1212_seal_rpc_story_author_name.sql`) has no guard that requires predictions. It
loops over `p_predictions` and accepts an empty array, so **the seal RPC needs no change.**

- The prediction walk is currently also the only place the author sees the story cards before
  sealing. The preview link (`/letter-preview`, which reads `clarity-preview-predictions-*` from
  storage) is how a public-letter author can still see what readers will see.
  [FOUNDER DECISION: should the public seal-confirm card link to the reader preview, or is a direct
  "seal" acceptable? Recommend: keep the existing preview entry point, add nothing new.]
- `analytics.track('letter_sealed')` sends `prediction_count: 0` for public letters. Keep the field
  so dashboards do not break.

**A2. Reading (public letters): the reveal has no author number.** The rule depends on
**`letter.mode === 'one-to-many'`, not on which reading path is used.** A one-to-many letter is
reached three ways, and all three must behave the same:
1. anonymous public link → `LetterReadingFlowPublic` (local mode, `publicPredictions`);
2. signed-in reader on the public link (`ready_public`, also fed `publicPredictions`);
3. an email invitation added to a sealed public letter (`add_recipient_to_sealed_letter`) → token
   path → `reveal_prediction_by_token`. Verified: this RPC returns shared
   `delivery_id IS NULL` predictions (`20260817120000_p1067_anon_rating_gates.sql` L348), so today
   these invitees also see the gap.

In `letter-flow-content.tsx`, phase `story-revealed`, a one-to-many letter renders a
**reader-only reveal**: the reader's own rating with no author marker, no gap, and no
"{Author} thinks…" sentence. It must **not** fall through to the existing
`"Calibration data unavailable."` branch, which fires whenever `prediction === null`. That text
would read as a bug. Wording is a founder call (see UI Contract). The `story-rate` card copy that
mentions the author's prediction must also be conditional; for example, `letter-reading-page.tsx`
~L1227 says "…and see {senderName}'s prediction."

**Position (point) reveals are not changed.** "Where the author stands on this point vs where you
stand" compares two real stated positions. It is not a guess about the reader, so it stays for
public letters.

**A3. Existing sealed public letters that already store predictions: stop showing them, keep the
data.** (Recommended option, adopted.) Enforce this **on the server**, not only in the UI:
- `get_letter_for_public_reading` stops returning `predictions` for one-to-many letters. It returns
  an empty array so the client contract still holds.
- `reveal_prediction` / `reveal_prediction_by_token` return NULL when the letter is `one-to-many`.
- The client ignores any prediction for a one-to-many letter (defence in depth).
- **No rows are deleted from `letter_predictions`.**

Server-side is the recommendation because the 2026-08-13 [product] ruling makes the sealed-bid
guarantee load-bearing, and P1092 is still open because this exact RPC sends predictions to
anonymous browsers before they rate. Once public letters have no author number to reveal, P1092's
leak is gone for every public letter, old and new. (P1092 gets a note; it is not closed from this
spec. See Risks.)

**A4. Author results for public letters: aggregate ratings, no gaps.** For one-to-many letters:
- `CohortTable` (`letter-overview-page.tsx`) drops the "You → Them" prediction→rating column and
  shows a per-story summary instead: **count of ratings, distribution (0–10 histogram or
  min/median/max), and median**. No gap figure.
- `letter-results-page.tsx` (per-delivery results) computes `gap` / `isOverconfident` from the
  prediction. For one-to-many these are omitted and the view shows the reader's rating alone.
- `getLetterBaselineRatings` (`src/app/data/api.ts`, used when a /live session starts from a letter)
  uses `letter_predictions.prediction` as the speaker's baseline and returns null when no row
  exists. For a public letter without predictions it therefore returns null. The spec requires only
  that the /live start still works (no crash, no fake baseline).
- [FOUNDER DECISION: keep the per-reader rows (name + that reader's own rating) under the
  aggregate, or show only the aggregate? Today the author already sees named rows for signed-in
  readers. Recommend: keep the rows, remove only the prediction column. The founder's wording
  "in aggregate" leaves this open.]

### Slice C: follow-up, separable ("where you sit among other readers")

Only once a story in a public letter has **≥ N reader ratings**: after the reader rates, the reveal
adds one line, e.g. "You said 4. Most readers said 7."
- **Data source:** persisted `story_verifications` (`source = 'letter'`) for this letter's
  snapshot stories. Returned **only as an aggregate** (count, median, and histogram buckets) by a
  `SECURITY DEFINER` RPC that returns **nothing** below N. No reader ids, names, or single-row
  values are ever returned. Buckets with small counts must not let anyone deduce one person's rating
  when combined with their own; the implementer states the bucketing rule and tests it.
- **Sealed-bid applies to the aggregate too.** Seeing "most readers said 7" before rating anchors
  the reader just as the author's number did (2026-08-13 ruling). So the aggregate is released only
  to a caller whose own rating is **persisted**: signed-in readers, and token readers after they
  rate. An anonymous public-link reader's rating lives only in the browser until sign-in (P1092), so
  the server cannot check it. **Anonymous public readers get no comparison until they sign in.**
  Showing it to them behind a client-only gate would repeat the defect the founder ruled out.
- [FOUNDER DECISION: N (recommend 5), the exact copy, and whether the comparison should also appear
  after sign-in on the completion screen for readers who started anonymously.]
- C may be deferred by `/challenge-prd` or `/spec-review` without blocking A. If it is deferred, move
  it to its own spec rather than leaving unticked boxes here.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| A `mode` check lands in only one of the three one-to-many reading paths, so email invitees of a public letter still see a gap | MITIGATE | Invariant 1; the UAT covers the invite path explicitly; the server returns NULL (A3) so a missed client branch shows no number |
| The one-to-one flow regresses (shared components) | MITIGATE | Existing e2e (`p581-letter-1to1-flow`, `p705-sender-prediction-after-rating`, `p699-letter-results-*`) must stay green; add a one-to-one reveal assertion that still sees the gap |
| The public reveal falls into "Calibration data unavailable." | MITIGATE | An explicit public branch and a test that asserts the string is absent |
| `/letter/ck` (demo letter, one-to-many) loses the story-level "measured gap" the 2026-06-13 [product] decision builds P918's diagnostic on | ACCEPT | That decision relies on a visitor predicting the author's **positions**, which remain. The story-level gap goes away by the founder's 2026-09-30 decision. Flag it in the KDD entry so P918 is re-read |
| Tests and helpers that drive the public compose flow through the prediction walk break (`e2e/helpers/test-letter.ts`, `p688-seal-confirmation-invite`, the decisions.md 2026-era "drive the real compose flow" rule) | MITIGATE | Update the helpers to the new public path. The tests describe the old behaviour, so this is a spec change, not a code bug |
| Past calibration analyses that pooled one-to-many gaps | ACCEPT | Rows are kept. Analysts filter on `mode`. The 2026-08-13 ruling already treats pre-P1092 public ratings as anchored |
| P1092 left open while its leak is dissolved | DEFER | After A3 ships, re-check P1092: no public prediction reaches an anonymous browser. If that holds, close it via `/ship` on P1092 with evidence. Slice C's anonymous gating is the new form of the same question |
| Slice C re-identification from small buckets | MITIGATE | Threshold N, no rows below N, bucketing rule tested with a control |

**Non-Goals**
- Do NOT change one-to-one letters in any way: prediction walk, review screen, reveal, gap framing,
  results.
- Do NOT delete or rewrite `letter_predictions` rows, or change its schema.
- Do NOT change `seal_and_send_letter`.
- Do NOT change point/position reveals.
- Do NOT touch `responses_mode` semantics or its default (2026-09-30 [product]: new letters default
  to "Just read").
- Do NOT touch `gap-banner.tsx` / /live's story-walk gap. They are live-session surfaces, not
  letters.

## Invariants

1. For any letter with `mode = 'one-to-many'`, no author prediction reaches a reader, whether in the
   UI, in an RPC response to a reader, or through any reading path (anonymous link, signed-in link,
   email invitation token).
2. One-to-one letters behave exactly as before this spec.
3. Any cohort aggregate (slice C) is released only to a caller whose own rating is persisted
   server-side, and never below N ratings (2026-08-13 [product], sealed-bid is load-bearing).

## Acceptance Criteria

Slice A:
- [ ] Preparing a public letter goes from opening compose straight to the "Should readers explain
      your stories back to you?" card. No 0–10 prediction screen appears, and sealing succeeds.
- [ ] Preparing a private (one-to-one) letter still shows the prediction screen for every story and
      the review screen with "Your prediction: N". Sealing still requires all predictions.
- [ ] A reader of a public letter (anonymous link) rates a story and sees their own rating with no
      author number, no "gap", and no "{Author} thinks…" sentence. "Calibration data unavailable."
      never appears.
- [ ] The same holds for a signed-in reader on the public link and for someone invited by email to
      a public letter.
- [ ] Opening an **existing** public letter that was sealed with predictions shows no author number
      in any of the three paths. The network response of the public reading RPC contains no
      prediction values. `letter_predictions` row count for that letter is unchanged.
- [ ] A reader of a private letter still sees the calibration verdict, the two-marker scale, and
      the "{Author} thinks you understand less/more than you think" line.
- [ ] The author's overview for a public letter shows, per story, the number of ratings and their
      distribution, and no prediction→rating column or gap. The author's overview for a private
      letter is unchanged.
- [ ] Starting a /live session from a public letter without predictions works (no error).

Slice C (may be split out):
- [ ] With ≥ N persisted ratings on a public story, a signed-in reader who has rated sees one line
      comparing their rating to other readers. With < N ratings, nothing is shown.
- [ ] An anonymous public-link reader does not see the comparison before sign-in, and the aggregate
      RPC returns nothing to an anonymous caller (verified by curl with the anon key).
- [ ] The aggregate RPC never returns reader identifiers or single ratings. Checked with a known-bad
      control: a story with exactly N−1 ratings returns nothing.

## Done-When

- [ ] New/updated tests cover: public compose skips prediction; the public reveal in all three paths
      has no author number; one-to-one reveal unchanged; RPCs return no prediction for one-to-many
      (integration spec against test DB, including a pre-existing letter seeded with predictions)
- [ ] `e2e/helpers/test-letter.ts` and the public-compose e2e specs updated to the new flow, and
      the full letters e2e suite is green
- [ ] Migration applied on test. `[post-deploy]` re-verify on prod that `/letter/ck`'s public
      reading response carries no predictions.
- [ ] P1092 annotated with the outcome of A3 (dissolved or not, with evidence)
- [ ] Founder decisions below recorded in this spec before `/dev` starts on the affected piece

## UX Notes

- Public reveal state: the reader's rating is shown as a single marker on the 0–10 scale. The
  author's avatar does not appear on the scale. Loading and error states are unchanged.
- Author compose on a public doc: one step fewer. The back affordance on the seal-confirm card must
  no longer return to a prediction walk that no longer exists.
- Empty state for the author's aggregate: "No ratings yet" when count = 0.

## UI Contract

- [FOUNDER DECISION: public reveal copy. Draft: headline "You rated your understanding {n}/10",
  no sub-line. Must not mention the author's opinion.]
- [FOUNDER DECISION: story-rate prompt for public letters. It must drop "and see {senderName}'s
  prediction". Draft: "Sign in to rate how well you understood this story."]
- [FOUNDER DECISION: author aggregate label. Draft: "{count} readers · median {m} · range {min}–{max}".]

## UAT Checklist

Run on test with a public doc (one with points, one without) and a private doc.

**1. Preparing a private (one-to-one) letter**
- [ ] Private doc → Compose → recipient modal → prediction screen for each story → review screen
      shows each prediction and the "Just read" / explain-back question (default "Just read") →
      Seal & Send works
- [ ] Try to seal with a missing prediction: blocked as before

**2. Preparing a public letter**
- [ ] Public doc → Compose → no recipient modal, **no prediction screen** → seal-confirm question,
      "Just read the letter" selected by default → Seal → confirmation with share link
- [ ] Repeat, choosing "Ask them to explain your stories back" → seals with explain-back on
- [ ] Preview link (if kept) shows the reader view without an author number

**3. Receiving a private letter**
- [ ] Open the email link → rate a story → the verdict ("N-point gap" / "Perfectly calibrated") and
      the two-marker scale with "{Author} thinks…" appear, as before
- [ ] Letter sealed with "Just read": no explain-back prompts. With explain-back: prompts appear
      for the signed-in reader
- [ ] Results page after completion still shows prediction vs rating

**4. Receiving a public letter**
- [ ] Anonymous, incognito, public link → rate → own rating only, no author number or gap, no
      "Calibration data unavailable." → position reveals still show author vs reader positions
- [ ] Signed in, public link → same
- [ ] Invited by email to a public letter (add recipient after sealing) → same
- [ ] "Just read" letter: no explain-back prompts. Explain-back letter: prompts appear for signed-in
      readers only
- [ ] An **old** public letter sealed with predictions (e.g. `/letter/ck`) → no author number in any
      of the three paths above. DevTools network tab: the public reading response has an empty
      `predictions`
- [ ] Author opens the overview of the public letter → per-story count + distribution, no
      prediction column
- [ ] (Slice C, if built) with ≥ N ratings the signed-in reader sees "You said X, most readers said
      Y". Below N, or anonymous, nothing

## Related

- **RELATED: P1092** (public-letter reveal gated in the browser). A3 removes the thing it leaks for
  one-to-many letters; slice C inherits its anonymous-gating constraint.
- P684 (one-to-many public reading), P705 (predictions for anonymous token path), P952
  (responses_mode + seal-confirm card), P968 (prediction walk), P700 (letter overview aggregate),
  P915 (CalibrationVerdict), P918 (demo letter as diagnostic).
- decisions.md 2026-08-13 [product] (sealed-bid is load-bearing), 2026-09-30 [product] (Just read
  default), 2026-06-13 [product] (demo letter gap), 2026-04 entries on
  `get_letter_for_public_reading` including predictions (this spec reverses that for display).
