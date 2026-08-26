---
name: clean-test-users
description: Delete the founder's own test-user profiles (namespaces loaded from .private/docs/founder-accounts.md) from the Supabase prod/test DB after listing them and getting explicit confirmation. Clears blocking child rows in FK order, reassigns first-validated points to the founder (never deletes points), then deletes the auth user.
when_to_use: When the founder's personal test accounts have accumulated in prod (after /live testing, letter/doc experiments, demos). Run periodically, not on a schedule.
version: 2.0.0
---

# /clean-test-users

Delete the **founder's own** test profiles. Identification is an **allowlist, not a heuristic** — the only accounts this skill ever touches are the founder's known test namespaces, so it can never mis-target a real user. The single residual risk (a real user on the *other side* of a shared session/verification) is caught by the Phase 2 counterparty scan.

**Default env:** `prod`. Say `test` to target the test DB.

> **Hard rule:** List candidates → founder confirms → delete. A bare "yes" is not approval — show the table first.

> **NEVER delete points — but stories are fair game.** Profile deletion cascades into content the user first-validated (`points.first_validator_id ON DELETE CASCADE`) and authored (`stories.author_id`). Treat them differently:
> - **Points are shared, reusable content** (one point lives across many stories/users). Never delete here — **reassign `first_validator` to the founder** (UUID from `.private/docs/founder-accounts.md`) so the point survives, and **remove the test user's own positions** on points (`point_positions`, `letter_point_responses`). Point removal is the point-graveyard skill's job, never this one.
> - **Stories belong to their author.** A test user's story is test content — **delete it** (its `story_points` links + versions cascade; the points themselves survive). *Exception:* if the story is frozen into a sealed letter (`letter_story_snapshots`/`letter_predictions` reference it → cascade-delete is blocked), real users received it — `UPDATE stories SET author_id = <founder>` instead.

---

## Allowlist — the only accounts ever eligible

**Load the actual patterns fresh from `.private/docs/founder-accounts.md`** (gitignored — never hardcode personal addresses in this public file). That file defines, under "Test-account namespaces":

- **Test accounts (delete candidates):** the founder's own test namespaces — a work-email address plus a personal-Gmail `+alias` pattern. The aliases deliver to the founder's real inbox and each is a separate `auth.users` row, so deleting the *profile* never touches a real login.
- **Never candidates:** the founder profiles listed in founder-accounts.md (the bare personal account in every spelling — no `+alias` — plus the secondary account) + agent fixtures (`@claritypledge.com` service accounts referenced in active e2e code; keep them).

Anything outside the loaded namespaces (other aliases, `ops@` profiles) is **not** auto-matched — clean those by explicit UUID. Never widen the allowlist.

---

## Phase 0 — State env

Say "Running on **prod** DB" or "**test** DB." Source connection details:

| Env | URL var | Service key (in `.env.local`) |
|---|---|---|
| prod | `VITE_SUPABASE_URL` (`.env.prod`) | `PROD_SUPABASE_SERVICE_ROLE_KEY` |
| test | `NEXT_PUBLIC_SUPABASE_URL` (`.env.local`) | `TEST_SUPABASE_SERVICE_ROLE_KEY` |

Source order for prod: `source .env.local && source .env.prod` (so the prod URL wins). Verify auth with a `select=id&limit=1` returning HTTP 200 before any mutation.

## Phase 1 — List candidates

```bash
curl -s "${URL}/rest/v1/profiles?select=id,email,name,slug,created_at" \
  -H "apikey: ${SK}" -H "Authorization: Bearer ${SK}"
```

Filter to the allowlist, minus exclusions. Typically 0–3 rows.

## Phase 2 — Footprint + counterparty scan (the one check that matters)

For each candidate, resolve **who is on the other side** of every shared row. Scan ALL of:
- `clarity_sessions` (creator/joiner/target) and `story_verifications` (speaker/listener) — the *other* participant.
- `clarity_letters WHERE source_doc_id IN (candidate's docs)` — a **real** `sender_id` means a real user authored a letter from the test user's doc; deleting that doc would be blocked / destroys their letter.
- `letter_deliveries` the candidate received — the `sender_id` of those letters (reporting completeness).
- `clarity_agreements` (creator/partner) — RESTRICT FK; a real counterparty here blocks the delete.
- `badge_points WHERE verified_by = candidate` — CASCADE, so it won't block, but a real user **silently loses a badge** the test user verified. Warn if nonzero.
- **Content cascade (critical):** `points WHERE first_validator_id = candidate` → **reassign to founder** in Phase 4 (never delete); for each, check `letter_point_responses`/`story_points` by *other* users to confirm no real user co-owns it. `stories WHERE author_id = candidate` → **delete** in Phase 4 (their `story_points` links cascade; the points survive), *unless* `letter_story_snapshots`/`letter_predictions` reference the story (frozen in a sealed letter real users received) → reassign `author_id` to founder instead.
- **If any counterparty is NOT a founder or another test account → STOP.** A real user co-owns that row. Surface and wait.
- Read `live_state->>'status'`. If any session is `live`/`active`/`in_progress` → **abort that candidate** (mid-session).

This scan is what replaces the old heuristic/critic machinery: an allowlist can't mis-target a real user, so the only thing left to verify is the counterparty.

## Phase 3 — Show + confirm

```
Running on prod. Candidates (allowlist-matched):
| # | email | name | created | child rows | counterparties |
Real users on the other side: none   (else: STOP — list them)
Live sessions among candidates: none (else: list them)
```

Ask for an explicit go (per-row, or "all listed"). No go → stop.

## Phase 4 — Delete (per approved candidate)

**Pre-delete snapshot (mandatory):** before any mutation, dump each candidate's affected rows (ids + the FK values about to be NULLed/deleted) to `.private/reports/test-user-cleanup/YYYY-MM-DD-pre-<uid>.json` — one `SELECT` per affected table. Once `auth.users` is gone this is the only forensic record; if a mis-scoped `UPDATE` clears the wrong column, this is how you reconstruct it.

Phase 2 has proven no real user is affected. Clear the candidate's rows so the `auth.users` delete isn't rejected by `NO ACTION`/`RESTRICT` FKs **or by the position-history trigger**. Prefer the **least-destructive** action — NULL when the FK is nullable, DELETE only rows the candidate solely owns. Two non-obvious steps go FIRST:

**A. Handle content — points reassigned, stories deletable:** `UPDATE points SET first_validator_id = <founder> WHERE first_validator_id = <candidate>` — preserve every point. The candidate's authored stories cascade-delete with the profile (fine — their points survive); but for any story frozen in a sealed letter (`letter_story_snapshots`/`letter_predictions` reference it → cascade blocked), `UPDATE stories SET author_id = <founder>` instead.

**B. Clear position history BEFORE the profile:** `DELETE point_position_history WHERE user_id = <candidate>` then `DELETE point_positions WHERE user_id = <candidate>`. A trigger inserts into `point_position_history` when a `point_positions` row is deleted — if the profile is already gone (via cascade), that INSERT FK-fails (`point_position_history_user_id_fkey`) and the whole delete 500s. Pre-deleting them while the profile still exists avoids it.

| Table.column | FK | Action |
|---|---|---|
| `points.first_validator_id` | CASCADE | **REASSIGN to founder** (never delete the point) — step A |
| `point_position_history.user_id` / `point_positions.user_id` | CASCADE + trigger | DELETE **before** profile — step B |
| `letter_point_responses` / `letter_predictions` (on candidate's deliveries) | via delivery | DELETE — the candidate's letter *positions* |
| `clarity_sessions.source_letter_id` (→ candidate's letters) | NO ACTION | UPDATE … SET NULL **before** deleting letters |
| `story_verifications.speaker_id` / `listener_id` | NOT NULL | DELETE row |
| `clarity_letters.sender_id` | NOT NULL | DELETE letter (deliveries cascade) |
| `clarity_docs.owner_id` | NOT NULL | DELETE doc (**after** its letters) |
| `clarity_agreements.creator_profile_id` | RESTRICT NOT NULL | DELETE agreement |
| `clarity_sessions` (candidate is creator/joiner/target) | nullable FK | **DELETE the session** — Phase-2-cleared as founder/test-only, so no real data lost; leaves no null-partner shell. Verifications cleared first (`session_id` is NO ACTION) |
| `letter_deliveries.receiver_profile_id` | nullable | UPDATE … SET NULL (scan by **profile_id**, not email — same-day rows reappear) |
| `witnesses.witness_profile_id` | nullable, NO ACTION | UPDATE … SET NULL |
| `clarity_agreements.partner_profile_id` | nullable | UPDATE … SET NULL |
| `email_send_log.profile_id` | nullable | UPDATE … SET NULL |
| CASCADE tables (`stories`*, `events`, `event_rsvps`, `badge_points`, …) | CASCADE | auto — *stories cascade-delete; reassign only if frozen in a sealed letter |

Order: snapshot → **reassign points (A)** → **history+positions (B)** → letter positions → verifications → **DELETE the candidate's sessions** → NULL `source_letter_id` (remaining) → letters → docs → agreements → NULL deliveries/witnesses/log → user. Re-scan all profile FKs (by `profile_id`) immediately before the delete — same-day app activity can re-create rows. Then:

```bash
curl -s -o /tmp/del -w "%{http_code}" -X DELETE \
  "${URL}/auth/v1/admin/users/${uid}" \
  -H "apikey: ${SK}" -H "Authorization: Bearer ${SK}"
```

**Fail-loud fallback:** if the DELETE returns 4xx/5xx naming a table NOT in the list above, a newer migration added a blocking FK. Grep `supabase/migrations/` for `REFERENCES (public\.)?profiles`, handle the new table (NULL if nullable, DELETE if not), re-run. Never force-continue past a failed delete.

## Phase 5 — Verify + audit

- Re-query `profiles?id=eq.<uid>` for each uid → confirm `[]`.
- **Recompute cached counters** for every counterparty founder whose verifications were deleted (the trigger only increments, never decrements). For each affected profile P:
  - `ears_count` = `COUNT(DISTINCT speaker_id)` from `story_verifications WHERE listener_id = P AND accuracy_achieved = true`
  - `verification_session_count` = (`#rows WHERE listener_id = P`) + (`#rows WHERE speaker_id = P AND speaker_id != listener_id`)
  - PATCH the corrected values onto `profiles`.
- Append one line per deleted uid to `.private/reports/test-user-cleanup/YYYY-MM-DD.md`:
  `uid | email | rows cleared (table:count) | HTTP status`.

---

## Self-check
- [ ] Env stated before any live call; auth verified (HTTP 200)
- [ ] Only allowlist + exclusions used for identification (no heuristics)
- [ ] Counterparty scan ran; zero real users on shared rows (or stopped)
- [ ] No live sessions among candidates (or aborted those)
- [ ] Founder gave explicit go after seeing the list
- [ ] Each uid verified absent; audit line written
