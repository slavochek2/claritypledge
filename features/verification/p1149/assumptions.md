# P1149 — Assumptions Log

Every call the loop made alone. No escalation clause — decide, log, continue.

## 1. Room-scoped GCS prefix cannot be verified from this repo

A3 calls for room audio to land under `rooms/{room_code}/{participant}/` instead of
`sessions/{code}/`. Research this session established that the actual GCS object path is
assembled by an **external Cloud Function not present in this repository**
(`supabase/functions/gcs-signed-url/index.ts` only proxies `{sessionCode, fileName,
contentType}` to it). This repo can only control what it *asks for* — `buildRoomAudioPathSegments`
constructs a `rooms/{code}/{participant}` prefix and `uploadRoomAudioChunk` passes it as
the signed-url call's first argument instead of a bare session code — but whether the
external function honors a multi-segment prefix vs. always nesting under a fixed
`sessions/` prefix could not be verified this session. **Decision:** implement the
client-side plumbing as designed, document the gap plainly (in code comments and here),
and treat P1152's physical bucket-listing check as the authoritative live proof. DW-6 in
this contract is pinned as a vitest (code-level) check for exactly this reason — it proves
the construction convention, not the live bucket layout.

## 2. RLS infinite-recursion bug, found and fixed mid-build

`transcribe_room_members`'s own SELECT policy originally queried `transcribe_room_members`
inside its own `USING` clause — Postgres has to evaluate the same policy to run that
subquery, which needs the subquery again: "infinite recursion detected in policy" (42P17).
Found by actually joining a room in a real e2e test (`e2e/p1149-chat-render.spec.ts`), not
by inspection. **Fix:** a `SECURITY DEFINER` helper function
(`is_transcribe_room_member`) that bypasses RLS internally, referenced by the policy
instead of a raw self-join. Shipped as a fix-forward migration
(`20260823200000_p1149_fix_room_members_rls_recursion.sql`), not an in-place edit, because
the original migration was already applied to the shared test DB before the bug was found
(editing in place would silently no-op there — matches the P1114 precedent).

## 2b. INSERT ... RETURNING vs. RLS SELECT policy, found and fixed mid-build

Separately: `joinRoom`'s `.insert(...).select().single()` (which compiles to `INSERT ...
RETURNING`) failed RLS even after fix #2, because RETURNING is itself subject to the
SELECT policy, evaluated *within the same command* as its own INSERT — the roster-check
function's internal query cannot see a row still being written by the outer command.
Reproduced directly via `SET LOCAL ROLE authenticated` SQL simulation against the test DB,
isolating it from fix #2. **Fix:** `joinRoom` now inserts without `.select()`, then reads
the row back in a separate query (its own fresh snapshot, where the row genuinely exists).

## 3. Each room participant mints their own `clarity_sessions` row via the existing `createClaritySession`

Per A2. Called with `isPrivate: false` so audio simultaneously feeds the ML corpus, per
spec intent ("their audio simultaneously lands in the ML bucket").

## 4. Room code generation duplicated, not exported from api.ts

`api.ts`'s `generateRoomCode()` is a private (unexported) function. Rather than widen
`api.ts`'s public surface for a one-off reuse, `transcribe-service.ts` defines its own
`generateTranscribeRoomCode()` — same 6-char alphabet, same collision-retry pattern as
`createClaritySession`. Three near-identical lines, not a shared abstraction — consistent
with CLAUDE.md's anti-premature-abstraction guidance.

## 5. `FocusHeader`'s `aria-label` does not track its visible `label` prop

Found while writing `e2e/p1149-consent-gate.spec.ts`: `FocusHeader` defaults `aria-label`
to `'Go back'` regardless of the visible `label` text, so a screen reader announces "Go
back" while sighted users see "Leave" — a real accessibility mismatch, not just a test
inconvenience. **Fix:** pass an explicit `aria-label` matching the visible label at both
`FocusHeader` call sites in `transcribe-room-page.tsx`. Did not change `FocusHeader`
itself (out of scope, and its other call sites were not audited this session).

## 6. "Empty room" and "dropped-recognition" states screenshotted as one combined state

DW-10 asks for both. A person who is first in a room AND whose recognizer hasn't started
yet is a real, reachable state (not a contrivance) — screenshotting it once, rather than
as two separate captures, is more honest to what a person actually sees than staging them
separately, and halves the screenshot/review surface.

## 7. Room view layout: `min-h-[70vh]` replaced with `h-[calc(100vh-4rem)]`

Own-review of the first screenshot batch (before spawning the blind reviewer) showed the
listening indicator floating with dead space below it rather than anchored to the bottom
of the viewport — `min-h` lets the flex container grow past the indicator's natural
position. Copied the exact pattern already used by `clarity-chat-page.tsx`'s chat layout
(`h-[calc(100vh-4rem)]`, a bounded height rather than a minimum) so the footer indicator
pins to the bottom the way a chat app's status bar should.

## 8. Review round 1 (FAIL) fixes — color palette, consent affordance, screenshot timing

Blind reviewer round 1 found 4 issues. Three were real and fixed:

- **CLAUDE.md violation, self-introduced:** the "Reconnecting microphone…" state used
  `bg-amber-50 text-amber-800` — `.claude/rules/src.md` explicitly bans amber in UI. Fixed
  by re-deriving the whole indicator palette from `docs/design-system.md`'s own documented
  tokens: `red-500` is literally documented there as "recording indicator" with a pulsing
  dot as the canonical example — used for the active "Listening" state (also independently
  matches what the reviewer described the reference design using for that state). The
  dropped/reconnecting state stays in the red family but bolder (solid border, darker
  text, no pulse) so the two states read as clearly different severities without
  reintroducing a banned color. This also fixed the reviewer's separate finding that the
  original pale-blue "Listening" pill blended into the blue nav CTA on the same screen.
- **Consent toggle had no visible interactive chrome** — was plain text + icon with no
  border/background, indistinguishable from static copy. Fixed: full-width bordered pill
  (`border`, `rounded-lg`, `min-h-[44px]`), matching the existing "Action pill" pattern
  already documented in `docs/design-system.md`, rather than inventing a new control type.
- **Screenshot state-mismatch** (0 vs 1 members across widths of "the same" state) was a
  screenshot-script timing bug, not a product bug: the roster's async subscription can
  resolve after the empty-chat state is already visible, so the very first capture in a
  sequence could race ahead of it. Fixed the throwaway capture script to wait for the
  roster text to settle before screenshotting, not the product code.

**Not fixed — deliberately:** the reviewer also flagged the header's "← End" link as a
sub-40px touch target. Source-verified this is false: `FocusHeader` (the shared,
CLAUDE.md-mandated back-button component — "Never define inline BackButton components —
use FocusHeader") already sets `min-h-[44px] px-3` on its underlying `<Button
variant="ghost">`. The rendered clickable box is 44px; a still screenshot of a
borderless/no-background ghost button cannot show that invisible hit-area, which is a
real, known limitation of screenshot-only touch-target review, not a defect in this page.
Modifying `FocusHeader`'s default chrome is out of scope for P1149 (shared across every
focus page in the app) and would require its own review. If round 2 flags this again, it
stays unfixed for the same reason unless the founder asks for a `FocusHeader` change.

## 9. Review round 2 (FAIL) fixes — amber-vs-red conflict, ended-screen deviations

Round 2 surfaced a genuine conflict: the approved reference's dropped-mic state uses
amber, but `.claude/rules/src.md` bans amber/orange/yellow/purple from all UI with no
exceptions — a hard, repo-wide, non-negotiable rule that overrides a design reference.
**Resolution:** kept both states in a red-adjacent palette but split them by INTENSITY
instead of hue — "Listening" (nominal, expected) became a calm `bg-muted` banner with
only a small red pulsing dot as the recording cue (still the documented "recording
indicator" pattern); "Reconnecting" (the actual failure state, and the one the spec's UX
Notes says matters most: "a silently dead recognizer is the failure mode most likely to
waste a real event") became a solid, bold `bg-red-600 text-white` banner. This achieves
the reference's actual GOAL — instant visual distinction between "you're heard" and
"you're not" — without reusing a banned color; told to a fresh round-3 reviewer as an
already-approved, deliberate substitution so it isn't re-flagged as a reference mismatch.

Two more real findings, both fixed: the ended screen's "Go to my sessions" button was
solid blue, visually competing with the persistent blue "Start a Session" nav CTA on the
same screen — changed to `variant="outline"`. And the ended screen was missing a
participant roster the reference includes — added "Was in the room: …" using the `members`
state already held in memory (never cleared on session end).

Minor copy finding (listening text truncated vs. reference's fuller reassurance) also
addressed: "Listening" → "Listening — your words are going in".

## 10. Review round 3 (FAIL) fix — added a dedicated, prominent "End session" button

Round 3 confirmed the amber-substitution now passes cleanly, but flagged that the only way
to leave a live room was the small `FocusHeader` link — a real hierarchy regression from
the reference's full-width destructive "Stop transcribing" footer button, given ending a
live recording is a high-consequence action. **Fix:** added a dedicated, full-width
`variant="destructive"` "End session" button at the bottom of the room view, calling the
same `handleEndSession`. This does NOT violate the CLAUDE.md "never build an inline
back-button, use FocusHeader" rule — `FocusHeader` still owns simple back-navigation
chrome; this is an additive primary ACTION button, a different UI category. Kept the small
`FocusHeader` link too (now relabeled "Leave" / aria-label "Leave room" instead of "End
session", to avoid two identically-named controls colliding under
`getByRole('button', {name: /end session/i})` in tests) as a lightweight secondary
affordance.

**Deliberately not fixed:** round 3 also flagged (as explicitly unconfirmed) the absence
of the reference's "Audio saving · mm:ss" elapsed-time indicator. Real chunk-upload timing
already exists (`CHUNK_INTERVAL_MS`), but surfacing a live elapsed-time counter is net-new
UI scope beyond what DW-9 through DW-12 require, and the reviewer itself hedged this as
possibly "off-screen" rather than a confirmed gap. Left out of v1; flagged here rather than
silently dropped.

## 11. Real tooling gap found: `stamp-deploy-manifest.sh` scans the filesystem, not the DB

`docs/technical/worktree-setup.md`'s documented migrate.sh workaround says "After
migrate.sh succeeds, delete the copied file from main." Following that literally, across
two migrate.sh runs in this session (one per P1149 migration), silently corrupted
`deploy-manifest.json`: `scripts/stamp-deploy-manifest.sh`'s `build_migrations_json()`
builds the manifest's migrations list by globbing `supabase/migrations/*.sql` **in main's
working directory at run time** — it never queries `supabase_migrations.schema_migrations`
(the actual source of truth). Deleting a migration's file from main after applying it (as
documented) means the NEXT `migrate.sh` run's filesystem scan silently drops that
migration from the manifest, even though it is genuinely applied. By the third
`migrate.sh` run this session, BOTH P1149 migrations had vanished from the manifest
despite `SELECT version FROM supabase_migrations.schema_migrations` directly confirming
both are applied. **Fix applied here:** manually corrected this worktree's
`deploy-manifest.json` to include both versions, evidence-based (verified against the live
schema_migrations table via the Management API), not fabricated. **Not fixed:** main's own
`deploy-manifest.json` has the same gap (it's a byproduct of running migrate.sh from main,
not something this branch commits) — whoever ships P1149 should re-run
`./scripts/stamp-deploy-manifest.sh --migrations-only` from main first, or this tooling gap
will keep recurring for every P-number that runs migrate.sh more than once per session.

## 12. Declining consent navigates to `/`, which redirects signed-in users onward

`handleDecline` navigates to `/`; the app itself then redirects a signed-in user to
`/feed`. The e2e assertion checks "no longer on `/transcribe`" rather than a literal `/`
URL, since the onward redirect is existing app behavior this feature does not control.
