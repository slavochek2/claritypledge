---
status: week
type: story
rank: 15
created_date: '2026-09-30'
tags: [letters, one-to-many, predictions, calibration]
disclosure: public
delivery_stage: create-spec
pipeline_ran: [create-spec, hostile-review]
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
2026-09-30. **Slice A ships now. Slice C is deferred** (kept below as a follow-up design, N=5; it is
not in scope for `/dev` on this spec).

> Founder framing, verbatim (2026-09-30): *"public/one-to-many letters skip the author prediction step in preparation entirely. Readers of a public letter still rate their own understanding, but the reveal must not show an author prediction/gap framing."*
>
> *"One-to-one letters are UNCHANGED: prediction step, personal reveal, gap framing all stay."*

## Appetite

- **Blast radius: medium-high.** It touches the compose flow, every reading path (anonymous local,
  anonymous token, signed-in public, email-invite token), the reader AND author results pages, the
  author overview, the author preview, the letter-sourced /live baseline, four read RPCs, and one RLS
  policy. The
  one-to-one flow shares every one of these components, so a wrong `mode` branch breaks the core
  product loop.
- **Reversibility: high.** No data is deleted. The migration is `CREATE OR REPLACE` on four read RPCs
  plus a `DROP/CREATE POLICY` on `letter_predictions` SELECT; all revertible. Each RPC must be
  re-created from its **latest** definition (see A3 table) so earlier fixes (P1066 null-identity
  guards, P1067 anon rating gates, P1071 redaction) are not silently dropped — the P975/P977
  "restore dropped guard" regressions are the precedent. Grants/REVOKEs must be restated exactly as in
  the latest definition (anon allowlist: `scripts/anon-execute-allowlist.txt`).
- **Decision density: low.** All founder decisions resolved 2026-09-30 (see "Founder resolutions").

## Solution

### Slice A: must ship

**A1. Compose (public letters): no prediction step.** On a public doc the compose page already sets
`mode = 'one-to-many'` and skips the receiver modal (`letter-compose-page.tsx` L122–130). Today it
then goes `predict → seal-confirm` (`handlePredictionComplete`, L240–247). After this change it goes
straight to `seal-confirm` (`LetterSealConfirmCard`, where the author chooses "Just read" or
explain-back). The seal call sends `predictions = []`. The client guard "Please predict all N stories
before sealing" (L163–166) must apply only when `mode === 'one-to-one'`.
- **Branch on `mode`, not on `doc.visibility`.** Today the two coincide in compose (public docs always
  auto-select one-to-many; the receiver modal is only opened for private docs from
  `doc-detail-page.tsx` L538–542), but the existing code keys phase transitions on
  `doc.visibility` (L126, L241). Use `mode === 'one-to-many'` for every new branch (skip predict,
  guard, back target) so a future public-doc one-to-one letter still gets the prediction walk.
- `LetterSealConfirmCard` currently has no back affordance and no `onBack` prop (compose L306–317);
  its only exit is Seal. Add nothing that routes back to `predict` for one-to-many. The author's
  existing way out is the browser back / close to `/d/{docId}`; confirm it lands on the doc, not on
  an empty prediction walk.
- `clarity-preview-predictions-{docId}` is written to **localStorage** (not sessionStorage as the
  comment at L150 says) whenever `predictions.size > 0`. For one-to-many no predictions are
  collected, so nothing is written — but a **stale** key from an earlier one-to-many compose of the
  same doc can survive (it is only removed when a preview completes). The one-to-many compose path
  must `removeItem` that key on entry so the preview never shows an old author number. Verified: `seal_and_send_letter` (latest definition
`20260904120000_p1212_seal_rpc_story_author_name.sql`) has no guard that requires predictions. It
loops over `p_predictions` and accepts an empty array, so **the seal RPC needs no change.**

- **Preview (RESOLVED 2026-09-30: keep the preview link).** Correction to the earlier draft: the
  preview route is `/letter/:docId/preview` (`App.tsx` L931), and its entry points are
  `letter-review-screen.tsx` L128 (private/one-to-one compose only — public compose never reaches the
  review screen) and `sent-tab.tsx` L205 (after sealing, any letter). So public compose has **no**
  preview entry today, and this spec does not add one. What must change: `letter-preview-page.tsx`
  hardcodes `mode="one-to-one"` (L160) and reads author numbers from localStorage (L183–200). For a
  public doc the preview must render the **public reveal** (A2), not the calibration verdict and not
  "Calibration data unavailable.", and must ignore any stored predictions. Derive public-ness from the
  doc's visibility (the preview has no letter row).
- `analytics.track('letter_sealed')` sends `prediction_count: 0` for public letters. Keep the field
  so dashboards do not break.

**A2. Reading (public letters): the reveal has no author number.** The rule depends on
**`letter.mode === 'one-to-many'`, not on which reading path is used.** A one-to-many letter is
reached by these paths, and all must behave the same (verified in `letter-reading-page.tsx` and
`useLetterReadingState.ts`):
1. anonymous public link → `ready_public`, local mode, `publicPredictions` from
   `get_letter_for_public_reading` (reading page L420–440; hook L632);
2. signed-in reader on the public link → `ready_public`, also fed `publicPredictions` (L251–287);
3. anonymous email invitee of a public letter (token, no session) → **local/buffer mode**, and
   `publicPredictions` is fetched from `get_letter_for_public_reading` (L401–406, P705) — it does
   NOT go through `reveal_prediction_by_token`;
4. signed-in email invitee (token or delivery) → remote mode → `reveal_prediction_by_token`
   (hook L658) or `reveal_prediction` (hook L673). Verified: both return shared
   `delivery_id IS NULL` predictions (`20260817120000_p1067_anon_rating_gates.sql` L343–349;
   `20260813170000_p1066_null_identity_authz_guards.sql` L343–348);
5. **after completion, the reader's results page** `/letter/:id/results` →
   `get_letter_results` with `perspective = 'receiver'` → `StoryWalk` "{senderName}'s belief" vs
   "Your confidence" plus gap (`letter-results-page.tsx` L37–97, `story-walk.tsx` L127–139). The
   receiver branch returns shared predictions once the reader has rated
   (`20260417100200_p725_results_profile_slug.sql` L151–166). The earlier draft missed this path;
6. **letter-sourced /live** (`clarity-live-page.tsx` L2020, L3111 → `getLetterBaselineRatings`,
   `api.ts` ~L4476) reads `letter_predictions` **directly from the table** under RLS, from either
   participant's browser, and seeds the speaker baseline from it;
7. **direct table read under RLS**: policy "Predictions readable with sealed-bid"
   (`20260403224331_p581_clarity_letters.sql` L247–262) lets any `_is_letter_receiver` who has rated
   the story `SELECT` the prediction rows with the anon key — no RPC needed.

Not affected (checked): `get_letter_for_reading` (P1071, returns no predictions),
`LetterCompletionSummary` (no prediction), `send-letter-emails` / other edge functions (no prediction
field), `letter-response-confirm-page.tsx` (reads only `sender_display_name` from the public RPC).
`getLetterForSender` / `getCompletionSummary` in `letters-service.ts` read the table directly but have
no callers outside the service; the RLS change (A3) covers them anyway.

In `letter-flow-content.tsx`, phase `story-revealed` (L848–869), a one-to-many letter renders a
**reader-only reveal**: the reader's own rating with no author marker, no gap, and no
"{Author} thinks…" sentence. It must **not** fall through to the existing
`"Calibration data unavailable."` branch (L869), which fires whenever `prediction === null`. That
text would read as a bug. The branch must key on the letter's mode (pass `mode` into the flow; the
preview passes it from doc visibility), **not** on `prediction === null` — otherwise a one-to-one
letter with a genuinely missing prediction would silently show the public reveal and hide a real
bug. The gap-derived values at L442–443 and L485–486 must not be computed for one-to-many. The
`story-rate` auth gate copy at `letter-reading-page.tsx` L1227 ("…and see {senderName}'s
prediction.") must be conditional on mode. Final strings: see UI Contract.

`letter-results-page.tsx` receiver perspective for one-to-many: `mapToStoryWalkItems` produces no
`prediction`/`gap`/`isOverconfident`, and `StoryWalk` hides the "{senderName}'s belief" row and any
gap line, showing only "Your rating" (and positions, unchanged).

**Position (point) reveals are not changed.** "Where the author stands on this point vs where you
stand" compares two real stated positions. It is not a guess about the reader, so it stays for
public letters.

**A3. Existing sealed public letters that already store predictions: stop showing them, keep the
data.** (Adopted.) Enforce this **on the server**, not only in the UI. One migration, re-creating each
object from its latest definition:

| Object | Latest definition | Change for `letters.mode = 'one-to-many'` |
|---|---|---|
| `get_letter_for_public_reading` | `20260530161011_p852_public_reading_sender_avatar.sql` L27–78 | `predictions` = `'[]'` |
| `reveal_prediction_by_token` | `20260817120000_p1067_anon_rating_gates.sql` | return NULL |
| `reveal_prediction` | `20260813170000_p1066_null_identity_authz_guards.sql` L307–351 | return NULL |
| `get_letter_results` | `20260417100200_p725_results_profile_slug.sql` L136–166 | **both** perspectives: `predictions` = `'[]'` (receiver: no leak; sender: founder ruled no gap column for public letters) |
| `get_letter_overview` | `20260813170000_p1066_null_identity_authz_guards.sql` L37–240 | leave as is (author-only, `_is_letter_sender`-gated); the UI drops the column. Returning data to the author is not a reader leak |
| RLS "Predictions readable with sealed-bid" on `letter_predictions` | `20260403224331_p581_clarity_letters.sql` L247–262 | receiver branch additionally requires the letter's mode = `'one-to-one'`; sender branch unchanged |

Before writing the migration, the implementer re-greps `supabase/migrations/` for the newest
`CREATE OR REPLACE FUNCTION` of each name (latest-file wins) — this table was correct on 2026-09-30.
- The client ignores any prediction for a one-to-many letter (defence in depth): `publicPredictions`
  is not built for one-to-many, and `getLetterBaselineRatings` returns null when the source letter is
  one-to-many (so /live starts without a letter baseline, exactly as it does today when a row is
  missing).
- **No rows are deleted from `letter_predictions`.**

Server-side is required because the 2026-08-13 [product] ruling makes the sealed-bid
guarantee load-bearing, and P1092 is still open because this exact RPC sends predictions to
anonymous browsers before they rate. Once public letters have no author number to reveal, P1092's
leak is gone for every public letter, old and new. (P1092 gets a note; it is not closed from this
spec. See Risks.)

**A4. Author results for public letters: aggregate ratings, no gaps.** For one-to-many letters:
- `CohortTable` (`src/app/components/letters/cohort-table.tsx`, rendered by
  `letter-overview-page.tsx`) drops the "You → Them" column (header L80, cell L146–148, where a
  missing prediction currently renders `?`) and, **above the per-reader rows**, shows a per-story
  summary: count of ratings, median, and range (min–max). No gap figure. **Per-reader rows stay**
  (RESOLVED 2026-09-30): name + that reader's own rating + positions + status link, as today, minus
  the prediction. A one-to-many overview must render with an empty `predictions` array (new letters)
  and must ignore a non-empty one (old letters).
- `letter-results-page.tsx` sender perspective for one-to-many: same as the receiver rule in A2 — no
  prediction, gap, or `isOverconfident`; the reader's rating alone.
- `getLetterBaselineRatings`: see A3 — returns null for one-to-many letters regardless of stored
  rows. /live from a public letter must still start (no crash, no fake baseline).

### Slice C: DEFERRED follow-up ("where you sit among other readers") — not in this spec's scope

Founder 2026-09-30: design kept here; not implemented under P1379. Move to its own spec when picked
up. N = 5 (RESOLVED).

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
- N = 5 (resolved). Still open **for the follow-up spec, not for this one**: exact copy, and whether
  the comparison appears after sign-in on the completion screen for readers who started
  anonymously.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| A `mode` check lands in only some of the seven one-to-many reading paths (A2), e.g. the reader's results page or /live baseline still shows the author number | MITIGATE | Invariant 1; server-side A3 covers every RPC and the table RLS, so a missed client branch receives no number; integration test asserts each RPC and a direct anon-key `SELECT` on `letter_predictions` return nothing for a one-to-many letter |
| Migration re-creates an RPC from a stale definition and drops a later guard (P1066/P1067/P1071) | MITIGATE | Re-create from the latest file per A3 table; diff old vs new function body in review; run the existing guard tests (P1066/P1067 integration specs) |
| RLS policy change breaks one-to-one receivers' direct reads (live baseline, `getCompletionSummary`) | MITIGATE | Policy change only adds `AND mode = 'one-to-one'` to the receiver branch; `p703-letter-sourced-live` and a one-to-one direct-select integration test stay green |
| The one-to-one flow regresses (shared components) | MITIGATE | Existing e2e (`p581-letter-1to1-flow`, `p705-sender-prediction-after-rating`, `p699-letter-results-*`) must stay green; add a one-to-one reveal assertion that still sees the gap |
| The public reveal falls into "Calibration data unavailable." | MITIGATE | An explicit public branch and a test that asserts the string is absent |
| `/letter/ck` (demo letter, one-to-many) loses the story-level "measured gap" the 2026-06-13 [product] decision builds P918's diagnostic on | ACCEPT | That decision relies on a visitor predicting the author's **positions**, which remain. The story-level gap goes away by the founder's 2026-09-30 decision. Flag it in the KDD entry so P918 is re-read |
| Tests and helpers that drive the public compose flow through the prediction walk break (`e2e/helpers/test-letter.ts`, `p688-seal-confirmation-invite`, `p952-responses-mode`, `p684-*`, `p661-letter-preview`, `p700-letter-overview`, `p843-letter-overview-filter-and-avatars`, `p699-letter-results-*`; also `scripts/points/seal.mjs` and `scripts/video/captures/test/01-letter.capture.ts` which seed predictions) | MITIGATE | `grep -rln predict e2e scripts` before starting; update each public-letter case to the new flow. Old-behaviour assertions are a spec change, not a code bug. One-to-one cases must not be edited |
| Preview shows "Calibration data unavailable." or a stale author number for a public doc | MITIGATE | A1 (clear stale localStorage key) + preview renders the public reveal for public docs; covered by an updated `p661-letter-preview` case |
| Past calibration analyses that pooled one-to-many gaps | ACCEPT | Rows are kept. Analysts filter on `mode`. The 2026-08-13 ruling already treats pre-P1092 public ratings as anchored |
| P1092 left open while its leak is dissolved | DEFER | After A3 ships, re-check P1092: no public prediction reaches an anonymous browser. If that holds, close it via `/ship` on P1092 with evidence. Slice C's anonymous gating is the new form of the same question |

**Non-Goals**
- Do NOT change one-to-one letters in any way: prediction walk, review screen, reveal, gap framing,
  results.
- Do NOT delete or rewrite `letter_predictions` rows, or change its schema.
- Do NOT change `seal_and_send_letter`.
- Do NOT build slice C (deferred).
- Do NOT add a new preview entry point to public compose.
- Do NOT change `get_letter_overview` (author-only; UI change suffices).
- Do NOT change point/position reveals.
- Do NOT touch `responses_mode` semantics or its default (2026-09-30 [product]: new letters default
  to "Just read").
- Do NOT touch `gap-banner.tsx` / /live's story-walk gap. They are live-session surfaces, not
  letters. (The only /live change is the letter-sourced baseline returning null for one-to-many, A3.)

## Invariants

1. For any letter with `mode = 'one-to-many'`, no author prediction reaches a reader, whether in the
   UI, in an RPC response to a reader, in a direct table read under RLS, or through any reading path
   (A2 paths 1–7).
2. One-to-one letters behave exactly as before this spec.
3. (Slice C, deferred) Any cohort aggregate is released only to a caller whose own rating is persisted
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
- [ ] The same holds for a signed-in reader on the public link, for an anonymous email invitee of a
      public letter, and for a signed-in email invitee.
- [ ] After completing a public letter, the reader's results page shows their own ratings with no
      "{Author}'s belief" row and no gap.
- [ ] A direct `SELECT` on `letter_predictions` for a one-to-many letter, as a receiver who has rated,
      returns 0 rows (integration test with the anon key + that user's JWT). The same query for a
      one-to-one letter still returns the row (control).
- [ ] Opening an **existing** public letter that was sealed with predictions shows no author number
      in any of the A2 paths. The network response of the public reading RPC contains no
      prediction values. `letter_predictions` row count for that letter is unchanged.
- [ ] A reader of a private letter still sees the calibration verdict, the two-marker scale, and
      the "{Author} thinks you understand less/more than you think" line.
- [ ] The author's overview for a public letter shows, per story, the summary line (count, median,
      range) above the per-reader rows; rows show each reader's own rating and no "You → Them"
      column or gap. Same for an old public letter that has stored predictions. The author's
      overview and results for a private letter are unchanged.
- [ ] The author's preview (`/letter/:docId/preview`, from the Sent tab) of a public doc shows the
      public reveal, never an author number or "Calibration data unavailable."
- [ ] Starting a /live session from a public letter (old one with predictions, and new one without)
      works and seeds no letter baseline.

Slice C: deferred — acceptance criteria belong to its own spec (carry over: ≥5 persisted ratings;
nothing for anonymous callers, verified by curl with the anon key; N−1 control returns nothing; no
identifiers or single ratings).

## Done-When

- [ ] New/updated tests cover: public compose skips prediction (and the guard still blocks a
      one-to-one seal with missing predictions); the public reveal in every A2 path has no author
      number and never shows "Calibration data unavailable."; one-to-one reveal still shows the
      verdict and gap; the four RPCs and the RLS policy return no prediction for one-to-many and
      still return it for one-to-one (integration spec against test DB, with a one-to-many letter
      **seeded with predictions** as the known-bad input and a one-to-one letter as the control)
- [ ] `e2e/helpers/test-letter.ts` and the public-compose e2e specs updated to the new flow, and
      the full letters e2e suite is green
- [ ] Migration applied on test. `[post-deploy]` re-verify on prod that `/letter/ck`'s public
      reading response carries no predictions.
- [ ] P1092 annotated with the outcome of A3 (dissolved or not, with evidence)
- [x] Founder decisions recorded in this spec (2026-09-30, see "Founder resolutions")

## UX Notes

- Public reveal state: the reader's rating is shown as a single marker on the 0–10 scale. The
  author's avatar does not appear on the scale. Loading and error states are unchanged.
- Author compose on a public doc: one step fewer. Nothing may route back to a prediction walk for a
  one-to-many letter (A1).
- Empty state for the author's aggregate: "No ratings yet" when count = 0.

## UI Contract

RESOLVED 2026-09-30 (founder: short and plain, no author number). Final strings:

| Surface | One-to-many string |
|---|---|
| Reader reveal (story-revealed), replaces verdict + numeric line | **"You said {n} out of 10."** — no sub-line; single marker on the 0–10 scale, no author avatar |
| Reverse story variant (`isReverseStory`) | same string — no author framing either way |
| Story-rate auth gate (`letter-reading-page.tsx` L1227) | **"Sign in to rate how well you understood this story."** |
| Reader results page, per story | **"You said {n} out of 10."** (no "{Author}'s belief" row) |
| Author overview summary line, per story | **"{count} readers · median {m} · range {min}–{max}"**; count = 1 → "1 reader · {n}"; count = 0 → **"No ratings yet"** |
| Author per-reader row, rating cell | **"{n}"** (the reader's rating only; column header "Their rating") |

One-to-one strings are unchanged.

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
- [ ] After sealing, Sent tab → Preview on the public letter → reveal shows "You said N out of 10."
      with no author number and no "Calibration data unavailable."
- [ ] Browser back from the seal-confirm card lands on the doc page, not an empty prediction walk

**3. Receiving a private letter**
- [ ] Open the email link → rate a story → the verdict ("N-point gap" / "Perfectly calibrated") and
      the two-marker scale with "{Author} thinks…" appear, as before
- [ ] Letter sealed with "Just read": no explain-back prompts. With explain-back: prompts appear
      for the signed-in reader
- [ ] Results page after completion still shows prediction vs rating
- [ ] Author overview + author results of the private letter still show the "You → Them" column/gap

**4. Receiving a public letter**
- [ ] Anonymous, incognito, public link → rate → own rating only, no author number or gap, no
      "Calibration data unavailable." → position reveals still show author vs reader positions
- [ ] Signed in, public link → same
- [ ] Invited by email to a public letter (add recipient after sealing), opened **signed out** → same
- [ ] Same invite opened **signed in** → same
- [ ] After finishing (signed in), open the results page → own ratings only, no "{Author}'s belief",
      no gap
- [ ] "Just read" letter: no explain-back prompts. Explain-back letter: prompts appear for signed-in
      readers only
- [ ] An **old** public letter sealed with predictions (e.g. `/letter/ck`) → no author number in any
      of the paths above, including its results page. DevTools network tab: the public reading and
      results responses have an empty `predictions`, and `reveal_prediction*` responses are null
- [ ] Author opens the overview of the public letter → per-story "{count} readers · median · range",
      per-reader rows with their rating, no "You → Them" column; a letter with no ratings shows
      "No ratings yet"
- [ ] Start /live from the public letter → session starts, no letter baseline shown

## Founder resolutions (2026-09-30)

1. Scope: **slice A only** now. Slice C stays in this file as a deferred design with **N = 5**.
2. Preview: **keep the preview link** (existing Sent-tab entry; preview must render the public reveal).
3. Author view: **keep per-reader rows**, drop the prediction/gap column for public letters.
4. Copy: **short and plain**, e.g. "You said 7 out of 10.", no author number. Final strings in UI
   Contract.

## Related

- **RELATED: P1092** (public-letter reveal gated in the browser). A3 removes the thing it leaks for
  one-to-many letters; slice C inherits its anonymous-gating constraint.
- P684 (one-to-many public reading), P705 (predictions for anonymous token path), P952
  (responses_mode + seal-confirm card), P968 (prediction walk), P700 (letter overview aggregate),
  P915 (CalibrationVerdict), P918 (demo letter as diagnostic).
- decisions.md 2026-08-13 [product] (sealed-bid is load-bearing), 2026-09-30 [product] (Just read
  default), 2026-06-13 [product] (demo letter gap), 2026-04 entries on
  `get_letter_for_public_reading` including predictions (this spec reverses that for display).
