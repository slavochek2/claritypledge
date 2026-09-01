---
status: week
type: story
rank: 0.5
tags:
  - gdpr
  - account
  - off-boarding
delivery_stage: challenge-prd
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
- No personally identifiable data remains after deletion
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
- Zero PII remains after deletion
- Zero orphaned data that blocks future operations

---

## Acceptance Criteria

- [x] Settings page shows "Delete my account" option in a danger zone section — `settings-page.tsx` "Account" section; screenshots `01-closed-{375,1440}.png`
- [x] Confirmation dialog lists what will be deleted and what will be orphaned (points, events) — "Erased:" / "Kept, without your name:" copy; unit test "opens a confirmation panel…"; screenshots `02-open-*.png`
- [x] User must type their name to confirm deletion — unit tests "refuses to delete when the typed name does not match" + "erases … when the typed name matches"; screenshot `03-mismatch-*.png`
- [x] Deletion removes: profile, stories, story versions, positions, witnesses, RSVPs, terms_acceptances, session_consents, auth.users record — integration test (a), 12 per-table zero-count assertions + `admin.getUserById → null`
- [x] Deletion orphans: points (first_validator_id → NULL), events (host_id → NULL) — integration test (b): both rows load through the app's own joins with a null actor
- [x] Active agreements are terminated (status: terminated) before profile deletion — integration test (b): partner-side agreement `status = terminated`, `terminated_at` set, partner tombstoned
- [ ] Deleted user's profile slug shows "This profile no longer exists" (not 404, not broken page) — existing "Profile Not Found" page renders (graceful, not 404); exact copy is a `[FOUNDER DECISION]`, see Technical Notes
- [x] Deleted user can re-register with the same email — integration test (a): `admin.createUser` with the erased email succeeds
- [x] No guilt language in the flow — copy reviewed by the independent visual-QA pass ("neutral/factual, no reason-for-leaving prompt"); unit test asserts no "sorry to see you go / feedback" text
- [x] Featured profiles / pledgers page correctly excludes deleted users (already handled by existing queries) — the `profiles` row is gone, so there is nothing to exclude; no query change needed

**Also verified (integration test, test project):** (c) a different signed-in user cannot reach the leaver — the RPC has no target parameter and PostgREST rejects an invented one (`PGRST202`); (d) anon gets `42501`; the RPC's returned counts match the seeded fixture exactly (`stories_deleted: 2, points_orphaned: 1, events_orphaned: 1, agreements_deleted: 1, agreements_anonymised: 1, sessions_anonymised: 1, positions_deleted: 2, verifications_deleted: 3`).

**Not done / open:**
- GCS objects behind `story_explain_backs.audio_storage_path` and any transcription audio are not deleted — the RPC cannot reach GCS. `[FOUNDER DECISION: lifecycle rule vs. a cleanup job keyed on the orphaned paths]`
- `profiles.avatar_url` points at a Google-hosted image, nothing is stored; `banner_url` (P504) may point at a generated asset — not deleted.
- Mixpanel / Sentry identities are reset client-side (`analytics.reset()`); server-side analytics profiles are not purged.
- P524 pledge withdrawal was already shipped (the `Pledge` section above the new one) — nothing to do here.
- Worktree slot `w10` maps to dev port 6000, which Chromium refuses as an unsafe port (`ERR_UNSAFE_PORT`); screenshots were captured with `--explicitly-allowed-ports=6000`. Worth a note in `worktree-setup.md`.

---

## Technical Notes (for /architect)

- ~~**Edge function required:** Supabase doesn't allow client-side `auth.users` deletion.~~ **Superseded in /dev:** client-side deletion is indeed impossible, but a `SECURITY DEFINER` function owned by the migration role can `DELETE FROM auth.users` — verified on the test project (`e2e/integration/p520-account-deletion.spec.ts` asserts `admin.getUserById → null` and same-email re-registration). `public.erase_my_account()` does steps (1)–(4) in ONE transaction: an error anywhere erases nothing. Recommended over an edge function on correctness (atomic) and runtime complexity (no second hop, no service-role key in Deno).
- **Migration:** `20260901213000_p520_erase_my_account.sql` — `points.first_validator_id`, `events.host_id`, `badge_points.verified_by` → nullable + `ON DELETE SET NULL` (constraint names kept: the client embeds `points_first_validator_id_fkey` in PostgREST joins). Added `NOT VALID` because the test DB already held orphaned `first_validator_id` values — the prior FK was not enforcing. Null creator/host renders as the existing client fallback "Unknown" (`mapPointFromDb`, `mapEventWithHostFromDb`).
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
