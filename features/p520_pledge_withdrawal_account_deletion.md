---
status: week
type: story
rank: 0.5
tags:
  - gdpr
  - account
  - off-boarding
delivery_stage: ship
pipeline_ran: [challenge-prd, inline, ship]
created_date: '2026-03-15'
reviews:
  ux: null
  architect: null
  alignment: null
locked_at: '2026-08-17T07:29:20.408Z'
---

# P520: Self-Serve Account Deletion

> **Promoted 2026-08-14.** Prod is at **60 registered users**; P42's own trigger for building this was *"deploy at 10-20 active users"* — 3x past it. Mail routing verified working (privacy@ -> slava@, founder-confirmed 2026-08-14), so this is a capacity question, not an exposure one.

Pledge withdrawal is handled separately in P524 (inline toggle, ~30 min). This spec covers full account deletion only.

## Problem Statement

**Current state:** Users who want to delete their account and data must contact Slava via WhatsApp. No self-serve mechanism exists. ClarityPledge is an Estonian OÜ subject to GDPR — users have a right to data erasure that the current manual process doesn't adequately serve.

**Precipitating event:** Gosha (first exit request, March 2026) had to negotiate his way out over three days on WhatsApp. The exit was harder than joining.

**Who's affected:** Any user wanting data removal (GDPR right), the founder (bottleneck on every exit).

---

## Intention (Why This Matters)

**Strategic importance:** A product that traps users isn't trustworthy. Self-serve deletion strengthens the pledge for those who stay — staying becomes an active choice, not inertia. Also: GDPR compliance is a legal requirement, not optional.

**Why now:** First exit request happened. GDPR gap is a legal risk. Manual process doesn't survive growth beyond single-digit users.

---

## Business Requirements

**Must-haves:**
- User can delete their account and all personal data from the settings page
- Deletion requires explicit confirmation (type name to confirm)
- Deletion is immediate — no waiting period, no approval queue
- No personally identifiable data remains after deletion — **as scoped in § Erasure scope below**: what is erased, what is anonymised, and what this mechanism cannot reach are listed explicitly; "all" is not a claim the RPC can make
- Exit experience is clean and dignified — no guilt, no feedback requirement
- Deleted user can create a new account with the same email later (clean slate)

**Data handling decisions (from /challenge-prd analysis):**

| Data type | On deletion | Rationale |
|-----------|------------|-----------|
| **Stories** (author's content) | Delete (CASCADE) | Author's personal content |
| **Story versions** | Delete (CASCADE) | Tied to author's stories |
| **Story verifications** | Delete (CASCADE) | Tied to author's stories |
| **Points** | **Orphan** (`SET NULL` on `first_validator_id`) | Community data — other users have positions on these. Deleting would destroy their contributions. Point shows "Unknown" as creator (existing client fallback for a null creator join). |
| **Point positions** (as user) | Delete (CASCADE via `user_id`) | User's own positions |
| **Witnesses** | Delete (CASCADE) | Endorsements of the deleted user |
| **Agreements** | Terminate silently (`status: terminated`), then delete rows | Partner sees "terminated" on next visit. No email notification. Agreement record doesn't survive (FK would block deletion). |
| **Events** (as host) | **Orphan** (`SET NULL` on `host_id`) | Events with RSVPs are community data. Past events are historical record. |
| **Event RSVPs** (as attendee) | Delete (CASCADE) | User's own RSVPs |
| **terms_acceptances** | Delete explicitly (no FK constraint) | Contains user_id, IP hash, user agent — PII |
| **session_consents** | Delete explicitly (no FK constraint) | Contains user_id — PII |
| **auth.users** record | Delete inside the same `SECURITY DEFINER` RPC (owner = migration role) | Required for email re-registration. No edge function: one transaction, one hop, no service-role key in a runtime — see Technical Notes. |

**Tables the table above is silent on** — each resolved by the rule *own content → delete; rows a counterparty depends on → anonymise (profile FK → NULL, name/email → "Deleted user")*, implemented in `supabase/migrations/20260901213000_p520_erase_my_account.sql`:

| Data type | On deletion | `[FOUNDER DECISION]` |
|-----------|------------|------|
| **Witnesses I gave** to others (`witness_profile_id`, carries my name) | Anonymise: FK → NULL, name → "Deleted user", LinkedIn → NULL. The endorsement still counts for them. | [FOUNDER DECISION: keep the endorsement count vs. remove the endorsement entirely] |
| **Story verifications** (both sides) | Delete; counterparties' `ears_count` / `verification_session_count` / `understood_count` recomputed from what remains (triggers only increment). | Follows the spec's CASCADE row; the recompute is decisions.md 2026-06-01 |
| **Letters I sent** + my docs | Delete (deliveries, snapshots, predictions, receivers' responses cascade). A letter is the author's content, like a story. | [FOUNDER DECISION: receivers lose access to letters I sent them — alternative is a nullable `sender_id` tombstone, which would need every letter-reading RPC to tolerate a null sender] |
| **Letters delivered to me** by others | Anonymise the delivery (profile/email/name → tombstone) and delete my point responses; the sender keeps their letter and their predictions. | — |
| **My explain-back recordings** on others' letters | Delete rows (my voice = my data). The GCS audio object is NOT removed — see "Not done". | [FOUNDER DECISION: GCS object lifecycle] |
| **Shared live sessions** | Session stays for the counterparty; my profile refs → NULL, my display names → "Deleted user" in `clarity_sessions`, chat, turns, demo rounds, ideas, and `live_state`. A session nobody else joined is deleted outright. | — |
| **Session transcripts / transcription jobs** of sessions I was in | Delete — they hold my verbatim speech. The counterparty loses that transcript too. | [FOUNDER DECISION: erase vs. keep the counterparty's copy] |
| **Agreements where I am partner** | Terminate (`status = terminated`, `terminated_at`), partner → tombstone; the creator sees "terminated" (spec user story). Agreements I created are deleted (creator FK is NOT NULL). | — |
| **Badges I certified** (`badge_points.verified_by`) | SET NULL (FK changed) — the holder keeps their badge. | [FOUNDER DECISION: previously CASCADE, which would have revoked other people's badges] |
| **Event room memberships** (`event_room_members`) | Profile → NULL, display name → tombstone; the room's answers survive. | — |
| **Email send log** | `profile_id` → NULL (no email column in the table). | — |
| **Org memberships, RSVPs, invites, practice/sub rooms, transcribe-room membership + messages, rate limits, voice profile, pending letter responses** | CASCADE with the profile / auth row. If I was a group's only organizer the group is left without one (P1193 explicitly prefers that to stranding the profile). | — |

**Migration required:** Change `points.first_validator_id` from `ON DELETE CASCADE` to `ON DELETE SET NULL`. Change `events.host_id` from `ON DELETE CASCADE` to `ON DELETE SET NULL`.

---

## User Stories

**As a user who wants to delete their account:**
- I want to delete my account and all my data from settings, so I can exercise my GDPR right to erasure
- I want a clear confirmation step, so I don't accidentally destroy my data
- I want to see what will be deleted before confirming, so I understand the consequences
- I want deletion to be final and complete, so I know nothing of mine remains

**As a user viewing content from a deleted user:**
- I want points from deleted users to still show their positions, so community data isn't lost
- I want past events from deleted users to remain visible, so event history isn't erased

**As the deleted user's clarity partner:**
- I want to see that the agreement was terminated, so I understand what happened

---

## Jobs to Be Done

**When I want complete data removal:**
- I want one action that removes everything personal, so I have confidence nothing persists (motivation: privacy and control)

**When I see content from a deleted user:**
- I want community contributions to survive, so the platform doesn't lose value when individuals leave (motivation: community integrity)

---

## Outcomes (Success Metrics)

- Founder time on deletion requests: 0 (vs ~30min/request currently)
- Self-serve deletion completion rate: 100% without support contact
- GDPR deletion requests handled within seconds (vs current: days)
- Zero PII remains in the tables the RPC covers (§ Erasure scope); the unreachable set is named, not implied away
- Zero orphaned data that blocks future operations

---

## Acceptance Criteria

- [x] Settings page shows "Delete my account" option in a danger zone section — `settings-page.tsx` "Account" section; screenshots `01-closed-{375,1440}.png`
- [x] Confirmation dialog lists what will be deleted and what will be orphaned (points, events) — "Erased:" / "Kept, without your name:" copy; unit test "opens a confirmation panel…"; screenshots `02-open-*.png`
- [x] User must type their name to confirm deletion — unit tests "refuses to delete when the typed name does not match" + "erases … when the typed name matches"; screenshot `03-mismatch-*.png`
- [x] Deletion removes: profile, stories, story versions, positions, witnesses, RSVPs, terms_acceptances, session_consents, auth.users record — integration test (a), 12 per-table zero-count assertions + `admin.getUserById → null`
- [x] Deletion orphans: points (first_validator_id → NULL), events (host_id → NULL) — integration test (b): both rows load through the app's own joins with a null actor
- [x] Active agreements are terminated (status: terminated) before profile deletion — integration test (b): partner-side agreement `status = terminated`, `terminated_at` set, partner tombstoned
- [x] Deleted user's profile slug shows a graceful page (not 404, not broken page) — proven in two halves, data and render; exact copy remains a `[FOUNDER DECISION]`, see Technical Notes and Evidence below
- [x] Deleted user can re-register with the same email — integration test (a): `admin.createUser` with the erased email succeeds
- [x] No guilt language in the flow — copy reviewed by the independent visual-QA pass ("neutral/factual, no reason-for-leaving prompt"); unit test asserts no "sorry to see you go / feedback" text
- [x] Featured profiles / pledgers page correctly excludes deleted users (already handled by existing queries) — the `profiles` row is gone, so there is nothing to exclude; no query change needed

**Also verified (integration test, test project — `npx playwright test --project=integration e2e/integration/p520-account-deletion.spec.ts` → 14 passed, exit 0; `npx vitest run` → 3489 passed / 19 skipped, 304 files, exit 0):** (c) a different signed-in user cannot reach the leaver — the RPC has no target parameter and PostgREST rejects an invented one (`PGRST202`); (d) anon gets `42501`; the RPC's returned counts match the seeded fixture exactly (`stories_deleted: 2, points_orphaned: 1, events_orphaned: 1, agreements_deleted: 1, agreements_anonymised: 1, sessions_anonymised: 1, positions_deleted: 2, verifications_deleted: 3`).

### Evidence — the erased profile slug (last AC)

The AC has two halves. Both were run 2026-09-03; neither was inferred from reading the code.

**Data half — the slug really stops resolving, without raising.** `ProfilePageV2` calls
`getProfileBySlug(id)` → `get_profile_by_slug`, falls back to `getProfile(id)` →
`get_profile_by_id`, and only renders the graceful branch when both return null *without*
setting `error`. Run on the TEST project against a real erasure (anon key, the same call
the page makes), with a live-slug control on both sides:

```
[PROBE] control: slug resolves BEFORE erasure -> probe-leaver-…  (assertion passed)
[PROBE] erased slug -> {"data":null,"error":null}
[PROBE] erased id   -> {"data":null,"error":null}
[PROBE] live slug   -> {"slug":"probe-stayer-mtl7bzq5-1788420405066-8707","error":null}
  1 passed (7.5s)   exit 0
```

The assertion is now committed as `the erased slug resolves to "not found", not an error,
through the app's own accessor` in `e2e/integration/p520-account-deletion.spec.ts`. It could
not be executed inside that file today — see "Not done / open" — so it was executed as a
standalone Playwright spec with the same helpers and the same fixture minus the point/event
seeding, then that temporary file was deleted. What is committed and what was run are the
same three calls plus the same control.

**Render half — given that null pair, the page is graceful, not the error page.**
`src/tests/p520-erased-profile-slug.test.tsx`:

```
npx vitest run src/tests/p520-erased-profile-slug.test.tsx
 ✓ src/tests/p520-erased-profile-slug.test.tsx (2 tests) 259ms
 Test Files  1 passed (1)      Tests  2 passed (2)
```

It asserts the property the AC is about — a heading, no "Something went wrong", no "Try
Again", a working way onward, and no `Failed to load profile` on the console — and pins the
current copy only as a change-detector. The second test is the control: a live slug renders
the profile through the identical harness, so the not-found branch is the erasure and not
the test setup.

**The gate was watched fail** (epistemic gate 7). With both accessors made to reject instead
of returning null — the page's error branch — the same file reports:

```
× renders a graceful not-found page, not the error page and not a crash
TestingLibraryElementError: Unable to find role="heading" and name `/profile not found/i`
 Test Files  1 failed (1)      Tests  1 failed | 1 passed (2)
```

**Still a `[FOUNDER DECISION]`:** the page says "Profile Not Found" / "This profile doesn't
exist or has been removed", copy it shares with slugs that never existed. The AC's original
wording "This profile no longer exists" would need a separate branch (the page cannot tell an
erased slug from a typo — the row is gone either way). Keep the shared copy, or add a
distinct erased-slug message and the tombstone lookup it would require?

### Codex review — where each finding landed

The review (9 findings, verdict FIX FIRST) was answered in two migrations. Findings 1–5 by
`20260902090000_p520_erasure_hardening.sql`, findings 6–8 by
`20260903090000_p520_erasure_hardening_2.sql`; finding 9 (test coverage) by both, and by the
three catalogue-derived census tests described below.

| # | Finding | Closed by | Proof |
|---|---------|-----------|-------|
| 1 | Stale access JWT still authorises writes | six INSERT policies now also require the caller's `profiles` row to exist; `patch_live_state` + the sessions UPDATE policy refuse `status = 'cancelled'` | test `stale JWT: no new tokens, no writes through the uid-only tables, no live_state patch` — refresh fails, `terms_acceptances` insert → `42501`, `stories` insert refused, `patch_live_state` touches zero rows. Residual (read for ≤1 h) stated below. |
| 2 | `live_state` scrub skipped for names with a quote/backslash | `_p520_scrub_live_state()` rewrites 9 scalar keys, re-keys 4 name-keyed maps, matches `selectedStoryData` by author **slug** — no textual replace, no skip | test `every name-bearing key is tombstoned, the partner's untouched, JSON intact`, fixture name `O"Bri\en 100% _x Ñandú` |
| 3 | Concurrent live-session write can re-introduce PII | the RPC row-locks the user's sessions `FOR UPDATE` first, then sets shared ones to `cancelled`; every live writer refuses that state | test `race: the counterparty can no longer write into the cancelled session` — with **controls**: the identical insert/update into a LIVE session is accepted, so the refusal is the predicate and not a malformed row |
| 4 | Name equality tombstones the wrong person | every identity column is matched on the **id**; the five name-only tables use the SESSION-TIME name and only when the counterparty's name differs; same-name sessions are recorded in `erased_subjects.same_name_sessions` and left untouched | test `ambiguous name-only rows are left alone and the session is recorded for the founder` |
| 5 | The census is an FK census, not a personal-data census | `ml_training_sessions` erased by (session code, name); the unreachable set named below | tests `census: no column in public that references an identity still holds the erased id` and `census: the name-bearing tables with no link to an account are exactly the documented set` — both enumerate from `pg_catalog`, so a table added later is covered without anyone editing the test |
| 6 | All three replacement FKs left permanently `NOT VALID` | orphans copied into `public.p520_legacy_fk_orphans` (nothing discarded), column nulled, all three constraints `VALIDATE`d (920 rows recorded on test: 913 points, 5 events, 2 badge_points) | test `the three replacement FKs are validated, and the orphans that blocked them are recorded` |
| 7 | Definer function not hardened to Supabase's shape | `SET search_path = ''` + full schema qualification on `erase_my_account()` and `_p520_scrub_live_state()`; deploy-time assertion of exactly one overload, the expected owner, and no `anon`/`PUBLIC` EXECUTE | migration § 4 raises on violation; `pg_proc.proconfig` on test reads `search_path=""` for both |
| 8 | GoTrue cleanup assumed, never verified | catalogue introspection found two auth tables that do **not** cascade — `auth.refresh_tokens` (varchar `user_id`, no FK) and `auth.flow_state` (no FK); both now deleted explicitly by the RPC | test `census: no auth-schema table still carries the erased subject id` — enumerates every `auth.*` table with a `user_id` column from the catalogue and asserts zero rows |
| 9 | Tests do not prove the inventory or the failure properties | the four census/validation tests above, plus the stale-token, race, same-name and hostile-name cases | 14 integration tests pass; the two new census gates were each **watched fail** (exit 1) before being trusted — one pointed at a still-existing user (14 offending columns reported), one with a documented entry removed (`+ "organization.name"`) |

**Still open after the review (not closed, deliberately):** the ≤1 h stale-token READ window,
GCS/Storage objects, Mixpanel/Sentry server-side profiles, the anonymous-localStorage idea
tables, same-name sessions, and the legacy `clarity_sessions.state` jsonb — all enumerated
under "NOT reachable by this mechanism" below. Finding 7's suggested **event trigger** against
future overloads was not built; the migration-time assertion catches an overload at the next
deploy, not at the moment one is created.

### Erasure scope (accurate statement — replaces "all personal data")

**Erased (rows deleted):** profile, auth user (+ GoTrue sessions/refresh tokens), stories/versions/story-point links, positions + position history, story verifications (both sides, counterparties' counters recomputed), letters I sent (+ deliveries, snapshots, predictions, receivers' responses), my docs, my explain-back rows, agreements I created, my letter responses on letters sent to me, solo sessions, session transcripts + transcription jobs of my sessions, my rows in the name-only live tables (chat, verifications, ideas, live turns as actor) and `ml_training_sessions` — both by session-time name, only where the counterparty's name differs — terms acceptances, session consents, RSVPs, endorsements of me, memberships, invites, rooms, rate limits, voice profile, pending letter responses.

**Anonymised (row kept, identity removed, matched on the ID column):** points I created, events I hosted, badges I certified, endorsements I gave, agreements where I was partner (terminated), shared live sessions (creator/joiner/target ids → NULL, names → tombstone, `status = 'cancelled'`, `live_state` scrubbed per key: 9 scalar name keys, 4 name-keyed maps, `selectedStoryData` by author slug), my name on the counterparty's turns/demo rounds, deliveries to me, event-room membership, email log.

**NOT reachable by this mechanism (documented, not erased):**
- GCS objects: explain-back audio (`story_explain_backs.audio_storage_path`), transcription audio, `ml_training_sessions.audio_path` — only the DB rows go. `[FOUNDER DECISION: lifecycle rule vs. cleanup job keyed on orphaned paths]`
- Storage/CDN assets: `profiles.banner_url` (P504-generated), event banners I generated.
- Mixpanel and Sentry: client identity is reset (`analytics.reset()`), server-side profiles/events are not purged.
- Name-only rows with an anonymous localStorage session id and no account link: `clarity_feed_ideas.originator_name`, `clarity_idea_comments.author_name`, `clarity_idea_votes` / `clarity_idea_vote_history.voter_name` — not locatable from an account.
- Same-name sessions: where my counterparty shared my display name, the name-only rows in that session are left untouched (neither row can be attributed) and the session id is recorded in `erased_subjects.same_name_sessions`. `[FOUNDER DECISION: same-name counterparty — tombstone both or leave]`
- The legacy `clarity_sessions.state` jsonb (demo-flow state, free-form keys) is not scrubbed.
- A still-open tab's access JWT stays valid for its lifetime (≤ 1 h). (`auth.refresh_tokens` and `auth.flow_state` do not cascade from `auth.users` and are now deleted explicitly by the RPC — codex finding 8; every other `auth.*` table carrying the subject id cascades, asserted from the catalogue by the auth census test.) Accepted: refresh tokens die with `auth.users` (proven: refresh fails), every write policy that lacked a profile FK now requires the profile to exist (proven: `42501`), `patch_live_state` and the session UPDATE policy refuse the cancelled session (proven: zero rows). What remains is read access to what any signed-in user can read, for at most an hour. Doing a global sign-out *before* the RPC was considered and rejected: it would strip the client's session before the erase call, forcing the call through a hand-carried token, and on an RPC failure would leave the user signed out with the account intact — the RPC-first order fails closed (nothing erased, session intact).

**Not done / open:**
- GCS objects behind `story_explain_backs.audio_storage_path` and any transcription audio are not deleted — the RPC cannot reach GCS. `[FOUNDER DECISION: lifecycle rule vs. a cleanup job keyed on the orphaned paths]`
- `profiles.avatar_url` points at a Google-hosted image, nothing is stored; `banner_url` (P504) may point at a generated asset — not deleted.
- Mixpanel / Sentry identities are reset client-side (`analytics.reset()`); server-side analytics profiles are not purged.
- P524 pledge withdrawal was already shipped (the `Pledge` section above the new one) — nothing to do here.
- P1053 seat-claim RPCs are not gated on `status = 'cancelled'` (a late seat claim re-pins joiner fields, carries no third-party name) — residual, see migration header § 4.
- Worktree slot `w10` maps to dev port 6000, which Chromium refuses as an unsafe port (`ERR_UNSAFE_PORT`); screenshots were captured with `--explicitly-allowed-ports=6000`. Worth a note in `worktree-setup.md`.
- **`e2e/integration/p520-account-deletion.spec.ts` cannot currently run end-to-end, for a reason outside this branch.** Its `beforeAll` fails at `createTestPoint` with `PGRST204: Could not find the 'context' column of 'points' in the schema cache` (2026-09-03 run: 1 failed, 2 passed of 15). Cause, verified rather than guessed: migration `20260902003000_p1095_drop_points_context` is applied on the shared TEST project (`supabase_migrations.schema_migrations`) while P1095 is still unmerged — `git ls-tree main supabase/migrations/` has no P1095 file, and `main`'s `e2e/helpers/test-point.ts` still inserts `context` whereas `feature/p1095-retire-point-context`'s copy does not. So the shared test database is ahead of `main`, and every branch whose integration fixture creates a point fails there until P1095 lands. Not fixed here: the helper fix belongs to P1095, which already contains it; patching the shared helper on this branch would collide with it. **The p520 assertions themselves are unaffected** — the added slug test was executed standalone (see Evidence above) and the other 14 passed against these same migrations before P1095 was applied to test. Re-run the full file after P1095 merges.

---

## Technical Notes (for /architect)

- ~~**Edge function required:** Supabase doesn't allow client-side `auth.users` deletion.~~ **Superseded in /dev:** client-side deletion is indeed impossible, but a `SECURITY DEFINER` function owned by the migration role can `DELETE FROM auth.users` — verified on the test project (`e2e/integration/p520-account-deletion.spec.ts` asserts `admin.getUserById → null` and same-email re-registration). `public.erase_my_account()` does steps (1)–(4) in ONE transaction: an error anywhere erases nothing. Recommended over an edge function on correctness (atomic) and runtime complexity (no second hop, no service-role key in Deno).
- **Migration:** `20260901213000_p520_erase_my_account.sql` — `points.first_validator_id`, `events.host_id`, `badge_points.verified_by` → nullable + `ON DELETE SET NULL` (constraint names kept: the client embeds `points_first_validator_id_fkey` in PostgREST joins). Added `NOT VALID` because the test DB already held orphaned `first_validator_id` values — the prior FK was not enforcing. **Superseded by `20260903090000_p520_erasure_hardening_2.sql`:** the orphans are copied to `public.p520_legacy_fk_orphans`, nulled, and all three constraints `VALIDATE`d, so the invalid state is repaired rather than inherited (codex finding 6). Null creator/host renders as the existing client fallback "Unknown" (`mapPointFromDb`, `mapEventWithHostFromDb`).
- **PII tables without FK:** `terms_acceptances`, `session_consents` — explicit `DELETE ... WHERE user_id = auth.uid()` inside the RPC.
- **Client:** `eraseMyAccount()` in `src/app/data/api.ts`; `SettingsPage` "Account" section; `signOut({ scope: 'local' })` after success (a global sign-out would round-trip to GoTrue for a user that no longer exists).
- **No profile-page change:** an erased slug already renders the existing graceful "Profile Not Found" page (`profile-page-v2.tsx:665`), not a 404 or a broken page. The AC's exact wording "This profile no longer exists" is copy — `[FOUNDER DECISION: keep "Profile Not Found" or change the copy (it is shared with never-existed slugs)]`.

---

## Next Steps

1. Run `/ux` to design the settings danger zone + confirmation dialog
2. Run `/architect` for edge function design, migration, PII inventory verification
3. Run `/dev` to implement

---

## Related

- **P524** — Withdraw pledge toggle (inline fix, separate from this spec)
- **Gosha conversation** — `claude-conversations/2026-03/2026-03-13-Отзыв карточки clarity pledge.md`
