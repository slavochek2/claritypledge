---
status: week
type: task
rank: 330
workstream: infrastructure
created_date: '2026-11-12'
tags: [gdpr, privacy, erasure, skill]
disclosure: public
delivery_stage: create-spec
pipeline_ran: [create-spec]
drafted_by: opus
exec_model: opus
exec_effort: high
driver: anomaly
spec_review_hash: cca5ee1835a879520c67e4387bda2e354f66956a246b134b9886777e7621d2ed
spec_review_vendors: [gemini, openrouter]
---

# P1668: GDPR data-subject request procedure (erasure, withdrawal, objection)

## Problem

**Situation:** The product has a tested self-serve erasure path (`erase_my_account()`, Settings → delete
account) and the privacy policy (`src/app/content/privacy.md` § Your Rights) promises a reply to any rights
request sent to the privacy address within 30 days. Two things the policy says are deleted "on request"
sit outside that function: stored audio files, and the profiles held by Mixpanel and Sentry. Ghost
newsletter membership (verified accounts are added to it) is also outside it.

**Complication:** The first formal request arrived by email and invoked Art. 7, 17, 19 and 21 (erase everything, withdraw consent, name recipients, confirm in
writing with retained data + legal basis + retention period). There was no runbook: running
`erase_my_account()` for someone else, which external processors to clear, how to prove completion and
what to write back were all worked out by hand in-session.

**Question:** What is the repeatable, verifiable procedure, packaged as a skill, so the next request is
one command plus founder approvals?

> Founder framing, verbatim: "how we do it and how i acknolwege it - we have procuedure or we need proecure ? lets do it once and then create skill"
> On the reply: "much shoter only necessary to the point legal dry language ? (why would we wnat to be warm? )"

### First case

Done inline on 2026-11-12. Case facts and evidence live only in `.private/docs/gdpr-requests.md`
(reviewers flagged that census detail in this public spec could narrow the requester).

## Appetite

Blast radius: medium. It runs destructive operations on **prod** for one person; a wrong id erases the
wrong person, irreversibly. Reversibility: none for the erasure itself (by design). Decision density:
low. Each run's destructive step needs founder approval, and the reply wording is set below.

## Invariants

- **Never erase on an unverified identity match.** The census must resolve exactly one account whose
  email equals the requester's sending address; a name-only or multi-row match stops for the founder.
- **Every destructive step is founder-approved in the session** (CLAUDE.md ALWAYS-ASK: DELETE on prod).
- **Erasure goes through `erase_my_account()` only.** No hand-written DELETEs: that function holds the
  lock order and survival rules (`supabase/migrations/20261030090000_p1536_p1592_merge_erase_forward.sql`).
- **Completion is proven by a re-run of the same census, with a known-good control** (a real
  existing id/email returning >0 through the identical query), never by the erase call's return value alone.
- **Snapshot before erasure.** Session ids, storage paths, processor ids and `email_send_log` message ids
  are captured into the private log before `erase_my_account()` runs; erasure severs the joins.
- **Request type decides the path.** Objection-only and withdrawal-only never run account erasure.
- **`same_name_sessions` in the audit row must be empty or resolved by hand** (migration line ~431:
  equal-name sessions are recorded, not cleaned).
- **Pending is not done.** An async processor ticket is reported as "requested", never as erased.
- **No requester PII in the public repo.** The case log lives in `.private/docs/gdpr-requests.md`.

## Solution

1. **Skill `/slava:util:gdpr-request <email>`** (cp, `util/` namespace) that walks:
   1. Classify request (erasure / access / objection / withdrawal) and send an acknowledgment draft.
   2. Read-only census on prod (`scripts/supabase-readonly-sql.py --env prod`): auth/profile by email,
      FK census derived from `pg_constraint` (not a hand list, epistemic gate 7e), email-keyed tables,
      `storage.objects`, audio files in Google Cloud Storage for the user's sessions.
   3. Founder approval → `erase_my_account()` as the user (pattern above).
   4. External processors: Ghost member delete; Mixpanel GDPR deletion for the distinct_id + email;
      Sentry user-data deletion; GCS audio objects. Each with a control query.
   5. Re-census + controls; write the case row to `.private/docs/gdpr-requests.md` (date, request type,
      uid, steps, evidence, reply sent date). Retained: that row is the Art. 5(2) accountability record.
   6. Emit the confirmation reply from the template below.
2. **Reply template** (dry, legal, short). Fields: what was erased, recipients notified (Art. 19), what is
   retained + legal basis + period. No warmth, no marketing.

[FOUNDER DECISION: retention period for the private case log, and for the single audit row
`erase_my_account()` keeps. Default proposed: 3 years (Estonian general limitation period for claims).]

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| Wrong person erased (name collision) | MITIGATE | Invariant 1: email-exact single match or stop |
| A processor silently holds data the census can't see (blind probe) | MITIGATE | Known-good control per processor |
| Mixpanel/Sentry deletion is async (days) | ACCEPT | Reply states the request was filed; log the ticket id |
| WhatsApp group membership outside our systems | ACCEPT | Skill prompts founder to remove by hand |
| Policy text says the audit row holds only the id; it also holds `erased_at` and `same_name_sessions`; and it both keeps and deletes consent records | DEFER | Founder decision: correct `privacy.md` in a separate change |
| Database backups keep erased rows until they expire | ACCEPT | Disclosed in the reply; retention period to be confirmed from the Supabase plan |
| Self-serve export (Art. 15/20) not covered | DEFER | Separate spec if an access request arrives |

**Non-Goals**
- Do NOT change `erase_my_account()` or any migration.
- Do NOT build a UI or admin endpoint.
- Do NOT send any email automatically; the skill drafts, the founder sends.

## Done-When

- [ ] First case completed: Mixpanel + Sentry deletion filed (ids logged privately), Ghost control run, re-census 0 with control >0
- [ ] `.private/docs/gdpr-requests.md` holds the first case row
- [ ] Skill file exists and dry-runs the census against a test-DB user end to end (destructive step on test only)
- [ ] Reply template in the skill; first-case confirmation drafted from it
- [ ] Reviewed by Gemini, GLM, Opus (Codex optional); verified findings folded

## Alternatives Considered

- **Admin "erase user" edge function.** Rejected: adds a prod endpoint holding service-role power for a
  yearly-scale event; the Management API + founder approval has no standing attack surface.
- **Hand DELETEs per table.** Rejected: bypasses the erasure function's lock order and survival rules.

## Rollback Strategy

The skill is a markdown file; revert by git. The erasure itself is intentionally irreversible.
