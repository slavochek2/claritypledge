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
| **Points** | **Orphan** (`SET NULL` on `first_validator_id`) | Community data — other users have positions on these. Deleting would destroy their contributions. Point shows "deleted user" as creator. |
| **Point positions** (as user) | Delete (CASCADE via `user_id`) | User's own positions |
| **Witnesses** | Delete (CASCADE) | Endorsements of the deleted user |
| **Agreements** | Terminate silently (`status: terminated`), then delete rows | Partner sees "terminated" on next visit. No email notification. Agreement record doesn't survive (FK would block deletion). |
| **Events** (as host) | **Orphan** (`SET NULL` on `host_id`) | Events with RSVPs are community data. Past events are historical record. |
| **Event RSVPs** (as attendee) | Delete (CASCADE) | User's own RSVPs |
| **terms_acceptances** | Delete explicitly (no FK constraint) | Contains user_id, IP hash, user agent — PII |
| **session_consents** | Delete explicitly (no FK constraint) | Contains user_id — PII |
| **auth.users** record | Delete via service-role edge function | Required for email re-registration |

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

- [ ] Settings page shows "Delete my account" option in a danger zone section
- [ ] Confirmation dialog lists what will be deleted and what will be orphaned (points, events)
- [ ] User must type their name to confirm deletion
- [ ] Deletion removes: profile, stories, story versions, positions, witnesses, RSVPs, terms_acceptances, session_consents, auth.users record
- [ ] Deletion orphans: points (first_validator_id → NULL), events (host_id → NULL)
- [ ] Active agreements are terminated (status: terminated) before profile deletion
- [ ] Deleted user's profile slug shows "This profile no longer exists" (not 404, not broken page)
- [ ] Deleted user can re-register with the same email
- [ ] No guilt language in the flow
- [ ] Featured profiles / pledgers page correctly excludes deleted users (already handled by existing queries)

---

## Technical Notes (for /architect)

- **Edge function required:** Supabase doesn't allow client-side `auth.users` deletion. Need a `delete-account` edge function using service role key that: (1) terminates agreements, (2) cleans up non-FK'd tables, (3) deletes profile (triggers CASCADE), (4) deletes auth.users record.
- **Migration:** `ALTER TABLE points ALTER COLUMN first_validator_id SET ON DELETE SET NULL` (and same for `events.host_id`). Points/events with NULL creator show "[Deleted user]" in UI.
- **PII tables without FK:** `terms_acceptances`, `session_consents` need explicit `DELETE FROM ... WHERE user_id = $1` in the edge function.

---

## Next Steps

1. Run `/ux` to design the settings danger zone + confirmation dialog
2. Run `/architect` for edge function design, migration, PII inventory verification
3. Run `/dev` to implement

---

## Related

- **P524** — Withdraw pledge toggle (inline fix, separate from this spec)
- **Gosha conversation** — `claude-conversations/2026-03/2026-03-13-Отзыв карточки clarity pledge.md`
