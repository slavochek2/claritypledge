---
name: clean-test-users
description: Identify and delete test-user accounts from the Supabase prod (or test) database after explicit founder approval. Cascade-deletes via auth.users, with a self-review gate before any destructive action.
when_to_use: When test churn has accumulated in prod (or test) — typically after sign-up flow experiments, demo recordings, or E2E development. Run periodically, not on a schedule.
version: 1.0.0
---

# /clean-test-users

Identify suspected test users in a live Supabase database, present them with dependent-row counts and per-row reasons, and after founder approval, cascade-delete via `auth.users`.

**Default environment:** `prod`. Override by stating `test` explicitly in the invocation.

> **Hard rule:** Never delete a profile without explicit per-row or scoped approval in the same turn. Broad "yes, clean it" is not enough — show the table, get confirmation, then act.

---

## Phase 0: State the environment

State plainly: "Running on **prod** DB" or "Running on **test** DB."

If the user did not specify, ask. Do not default silently. Source the connection details:

| Env | URL var | Anon key var | Service key var |
|---|---|---|---|
| prod | `VITE_SUPABASE_URL` (.env.prod) | `VITE_SUPABASE_ANON_KEY` | `PROD_SUPABASE_SERVICE_ROLE_KEY` (.env.local) |
| test | `NEXT_PUBLIC_SUPABASE_URL` (.env.local) | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `TEST_SUPABASE_SERVICE_ROLE_KEY` |

---

## Phase 1: Pull profiles

```bash
set -a && source .env.prod && set +a   # or .env.local for test
curl -s "${VITE_SUPABASE_URL}/rest/v1/profiles?select=id,email,name,slug,created_at&order=created_at.asc" \
  -H "apikey: ${VITE_SUPABASE_ANON_KEY}" \
  -H "Authorization: Bearer ${VITE_SUPABASE_ANON_KEY}" > /tmp/profiles.json
```

Profiles are RLS-readable via anon key. No service role needed for the read phase.

---

## Phase 2: Classify candidates

Apply heuristics. Mark each profile as `founder`, `fixture`, `candidate`, or `real`.

### Exclude lists (load fresh every run — never hardcode)

**Founders** — read from `.private/docs/founder-accounts.md`:
- Table column "UUID" → exclude from candidate set entirely.

**Fixtures** (active test accounts that must not be deleted) — start with:
- `e2e-agent@claritypledge.com` — used by `e2e/verify-prod-agreements.spec.ts` on prod
- `test-agent@claritypledge.com` — documented automated smoke test agent
- Any email in `@example.com` (RFC 2606 reserved — never real)

Before flagging anything as a candidate, **grep the repo broadly** for the email:

```bash
grep -rln "$email" e2e/ scripts/ src/ .github/ docs/ features/ 2>/dev/null
```

If the email appears in active code, it is a fixture — promote it to the fixture bucket and never delete without an explicit override.

Also widen the fixture scan periodically to catch new reserved patterns:

```bash
grep -rhoE "['\"][a-zA-Z0-9._+-]+@(example\.com|example-test\.com|test\.com|smoke-receiver)" e2e/ scripts/ | sort -u
```

Add any unique fixture email found to the in-skill allowlist or to `.private/docs/founder-accounts.md`.

### Candidate heuristics

A profile is a `candidate` if **any** of these match (case-insensitive):

| Signal | Pattern |
|---|---|
| Domain | `@example.com`, `@example-test.com`, `@test.com`, `@test.example`, `@test.claritypledge.com`, ends in `.test` |
| Email prefix | `prodtest-`, `playwright-`, `smoke-`, `fail-test`, `e2e-` (without `agent`), `p[0-9]+-` |
| Name | full-word match for `test`, `playwright`, `smoke`, `e2e`, `fixture`, `dummy` |
| Slug | starts with `test-` or contains `-playwright-` |
| Gmail+ alias | matches the founder's Gmail+ namespace, resolved from `.private/docs/founder-accounts.md` (founder-created test churn) |

**Anti-false-positive guards:**
- "Test" can be a real surname (Estonian, German). Always require name to be a **full-word** match, not a substring. Combined with another signal (Gmail+ alias, prefix, etc.) it is safer.
- A user with non-zero dependent rows in `clarity_sessions`, `event_rsvps`, or `stories` is **demoted from `candidate` to `candidate-uncertain`**. Show them in a separate table — founder decides explicitly.
- Real users sometimes use `+aliases` legitimately. Do not delete a `+alias` from any domain other than the founder's own Gmail+ namespace as defined in `.private/docs/founder-accounts.md`.

---

## Phase 3: Count dependent rows — FK-aware

> **Critical:** Not all profile FKs are `ON DELETE CASCADE`. Some are `NO ACTION` or `RESTRICT` — those tables **block** the Admin API DELETE if any row exists. The candidate-uncertain bucket exists to surface this *before* deletion.

### Step 3a: Discover all profile FKs dynamically

Do not hardcode the table list. Each run, grep migrations:

```bash
grep -nE "REFERENCES (public\.)?profiles\b|REFERENCES (public\.)?auth\.users\b" supabase/migrations/*.sql \
  | grep -oE "[a-z_]+\.[a-z_]+\b.*REFERENCES.*(profiles|auth\.users).*" \
  | sort -u
```

For each match, extract the column and the `ON DELETE` clause (default if unspecified = `NO ACTION`). Build two lists:

- **BLOCKING_TABLES** — any FK where `ON DELETE` is NO ACTION or RESTRICT. Non-zero count = cannot delete without manual intervention.
- **CASCADE_TABLES** — any FK with `ON DELETE CASCADE` or `SET NULL`. Non-zero count is fine; cascade handles it.

As of 2026-05-18, BLOCKING_TABLES referencing `profiles(id)` are:
- `clarity_sessions.creator_profile_id` (NO ACTION)
- `clarity_sessions.joiner_profile_id` (NO ACTION)
- `clarity_sessions.target_listener_id` (NO ACTION)
- `clarity_letters.sender_id` (NO ACTION)
- `letter_deliveries.receiver_profile_id` (NO ACTION) — note: on letter_deliveries, NOT clarity_letters
- `clarity_docs.owner_id` (NO ACTION)
- `clarity_agreements.creator_profile_id` (RESTRICT)
- `clarity_agreements.partner_profile_id` (RESTRICT)
- `email_send_log.profile_id` (NO ACTION)
- `story_verifications.speaker_id` (NO ACTION)
- `story_verifications.listener_id` (NO ACTION)

Run the grep every time — new migrations may add entries. Always confirm column-name belongs to the table you think it does by reading the migration's `CREATE TABLE` block — line-grep alone can attribute a column to the wrong table when migrations create multiple tables in one file.

### Step 3b: Count per candidate

```python
# Pattern: count via Content-Range header (cheap, no row data fetched)
def count(url, key, table, col, val):
    req = urllib.request.Request(
        f"{url}/rest/v1/{table}?{col}=eq.{val}&select=id",
        headers={"apikey": key, "Authorization": f"Bearer {key}",
                 "Prefer": "count=exact", "Range-Unit": "items", "Range": "0-0"})
    with urllib.request.urlopen(req) as r:
        return r.headers["Content-Range"].split("/")[-1]
```

For each candidate, count rows across the full BLOCKING_TABLES + CASCADE_TABLES list. Classify:

- **clean** — zero rows in every BLOCKING table. Safe to delete via Admin API.
- **candidate-blocked** — at least one BLOCKING row. Cannot delete until founder explicitly approves (a) deleting those rows directly first, or (b) NULL-ing the FKs where the column is nullable. Show the breakdown.
- **candidate-with-cascade-data** — zero BLOCKING, non-zero CASCADE. Display the cascade footprint so founder sees what disappears.

### Step 3c: Surface live state

For any `clarity_sessions` rows in either bucket, also fetch `live_state->>'status'`. If `live` or `active`, mark the candidate `LIVE NOW` — never delete a live-session participant without explicit live-state acknowledgement.

---

## Phase 4: Self-review gate (mandatory before deletion plan is shown)

**Spawn a critic subagent** with this exact role:

> "You are an adversarial critic reviewing a destructive prod-DB cleanup plan. You see:
> (1) this skill's source (`.claude/commands/slava/maintain/clean-test-users.md`),
> (2) today's candidate table (with dependent counts and reasons),
> (3) the environment (prod / test).
>
> Find failure modes. Examples — not exhaustive:
> - A 'Test' name that is a real Estonian, German, or Russian surname
> - A `+alias` from a non-founder domain
> - A candidate with hidden dependents not in the checked table set (e.g., new tables added since this skill was written)
> - A fixture that is missing from the allowlist but referenced in code we did not grep
> - Audit-trail gaps: if a deletion is wrong, can the founder reconstruct what was lost?
> - Cascade gaps: tables that reference `profiles.id` but NOT `ON DELETE CASCADE` — what happens?
> - Race: a candidate is mid-session (live state in `clarity_sessions.live_state`) and gets deleted
>
> Output: a punch list. For each finding, label severity:
> - **HIGH** — blocks deletion until resolved
> - **WARN** — surface to founder, may proceed with explicit ack
> - **NOTE** — FYI, no action
>
> Verify by reading actual files (the skill itself, `supabase/migrations/`, `e2e/`, `scripts/`). Do NOT reason from assumptions.
> Do NOT propose alternative skills — propose patches to THIS skill or to today's candidate set."

If the critic returns any HIGH: stop, patch the skill or the candidate set, re-run the gate.
If only WARN/NOTE: include the findings in the approval display so the founder sees them.

---

## Phase 4.5: Real-user safety probes (mandatory pre-flight)

Run **all** of these against the candidate set before showing the approval gate. Surface any non-zero result to the founder. A non-empty result is not automatic abort, but requires explicit acknowledgement.

### 4.5.a — Live session check

For each candidate, query their session rows and inspect `live_state`:

```bash
curl -s "${URL}/rest/v1/clarity_sessions?or=(creator_profile_id.eq.${UID},joiner_profile_id.eq.${UID},target_listener_id.eq.${UID})&select=id,code,live_state" \
  -H "apikey: ${SERVICE_KEY}" -H "Authorization: Bearer ${SERVICE_KEY}"
```

Parse `live_state->>'status'`. If any row has `status in ('live', 'active', 'in_progress')`, mark the candidate `LIVE NOW` — abort or require explicit override per row.

### 4.5.b — Newer-migration drift check

The static BLOCKING list in Phase 3a is a snapshot. Re-derive it every run:

```bash
# All profile-id and auth.users-id FK clauses, with their CREATE TABLE context
awk '/CREATE TABLE/,/^);/' supabase/migrations/*.sql \
  | grep -E "REFERENCES (public\.)?(profiles|auth\.users)" \
  | sort -u
```

Confirm every BLOCKING-grade reference (NO ACTION / RESTRICT) is in the Phase 3a list. Add any new ones before proceeding.

### 4.5.c — Trigger side-effects on DELETE

Check whether `profiles` or `auth.users` has DELETE triggers that could cascade unexpectedly:

```sql
SELECT trigger_name, event_manipulation, action_statement
FROM information_schema.triggers
WHERE event_object_table IN ('profiles', 'users')
  AND event_manipulation = 'DELETE';
```

Run via Supabase MCP (test) or service-role REST. If triggers fire on DELETE, read each action_statement before proceeding — they may write to history tables, fire webhooks, or cascade to tables the static FK enumeration missed.

### 4.5.d — Witness back-reference

`witnesses.witness_profile_id` (when a real user endorsed one of the candidates):

```bash
curl -s "${URL}/rest/v1/witnesses?witness_profile_id=eq.${UID}&select=id,profile_id,witness_name,created_at" \
  -H "apikey: ${SERVICE_KEY}" -H "Authorization: Bearer ${SERVICE_KEY}"
```

This cascades (witness FK is CASCADE on profile side), but the **endorsed real user loses an endorsement** silently. Surface to founder.

### 4.5.e — Slug references in user-generated content

Soft links — won't block delete but leave dangling references in body text:

```bash
# Search stories, points, letter content, doc content for candidate slugs
for slug in $candidate_slugs; do
  curl -s "${URL}/rest/v1/stories?body_md=ilike.*${slug}*&select=id,author_id" ...
  # repeat for points.point_md, clarity_docs (if accessible), clarity_letters
done
```

If found, flag with `WARN` — does not block, but founder should know.

### 4.5.f — External-system side effects

These are NOT enforced by the DB, but ClarityPledge integrates with:

- **Ghost** — `slava:client:sync-ghost-members` syncs profile → Ghost. Deleted profile = orphan Ghost member. Run `gh ghost-cleanup` (manual today) after deletion if Ghost integration was used for these users.
- **Mixpanel** — events keyed by `distinct_id = profile.id`. Historical events persist; future events stop. No action needed.
- **Sentry** — error events keyed by `user.id`. Same as Mixpanel — historical preserved.
- **Mailgun bounce list** — if a user's email is on the bounce list and we delete the user, the bounce list entry stays. No action needed unless the email was a real human and we want them re-emailable later.

If a candidate has ever been pushed to Ghost (check by email match in Ghost members), surface to founder before deletion.

### 4.5.g — Heuristic last-check: is this really a test user?

For each candidate, restate the evidence in one line. Example shape (real email redacted):
- "<founder's Gmail+ alias> — Gmail+ alias of founder's primary address; only the founder can receive mail at this address; profile name matches founder test-churn pattern."

If any candidate's restatement is weak ("name contains 'test' as substring, no other signal"), demote to manual-confirm and skip.

---

## Phase 5: Show candidates and get approval

Display four tables in this order:

```
=== FOUNDERS (excluded) ===
| uid (short) | email | name |

=== FIXTURES (excluded — referenced in active code) ===
| email | code reference (file:line) |

=== CANDIDATES — clean (zero BLOCKING rows; safe via Admin API) ===
| # | email | name | created | reasons | cascade-data summary |

=== CANDIDATES — blocked (has BLOCKING-table rows; Admin API DELETE will fail) ===
| # | email | name | created | BLOCKING breakdown (table:count) | live? |
```

Then the self-review findings (if any WARN/NOTE).

Then ask explicitly. **The exact options shown depend on whether the clean bucket has more than 10 rows:**

For `len(clean) ≤ 10`:
```
Approve which set?
  A) All clean candidates (#1–N)
  B) Per-row — I'll specify which UUIDs
  C) Also handle blocked rows — show me what manual cleanup is needed
  D) Skip — don't delete anything
```

For `len(clean) > 10` (force per-row or signal-split to prevent over-broad approval):
```
Approve which set? Coarse "A" is disabled because the clean bucket exceeds 10 rows.
  A1) Founder Gmail+aliases only
  A2) Test-domain fixtures only (after fixture grep)
  A3) Name-match candidates only
  B) Per-row — I'll specify which UUIDs
  C) Also handle blocked rows
  D) Skip
```

**Hard stop:** Do not proceed without an explicit option letter. A bare "yes" must be re-confirmed against a specific option. If the founder says "yes all" with `len(clean) > 10`, force the signal-split prompt.

---

## Phase 6: Delete — fail-fast loop with status reconciliation

> **Reality check:** `profiles.id REFERENCES auth.users ON DELETE CASCADE` only deletes the `profiles` row. Tables that reference `profiles.id` cascade *only if* their FK clause says `ON DELETE CASCADE`. Many do not (see Phase 3a). If the candidate has any row in a BLOCKING table, the Admin API DELETE returns a 4xx/5xx, the `auth.users` row stays, and the loop must stop — not silently continue.

For the approved set, delete via **Supabase Admin API**, capturing per-row HTTP status:

```bash
set -a && source .env.local && set +a   # PROD_SUPABASE_SERVICE_ROLE_KEY; for test env use TEST_SUPABASE_SERVICE_ROLE_KEY
# Set PROJECT_URL to the env's Supabase URL (VITE_SUPABASE_URL for prod, NEXT_PUBLIC_SUPABASE_URL for test)

results=()
for uid in $approved_uuids; do
  status=$(curl -s -o /tmp/del.body -w "%{http_code}" -X DELETE \
    "${PROJECT_URL}/auth/v1/admin/users/${uid}" \
    -H "apikey: ${SERVICE_ROLE_KEY}" \
    -H "Authorization: Bearer ${SERVICE_ROLE_KEY}")
  body=$(cat /tmp/del.body)
  results+=("$uid|$status|$body")
  if [ "$status" != "200" ] && [ "$status" != "204" ]; then
    echo "FAILED on $uid: HTTP $status — $body. Stopping. $(( ${#results[@]} - 1 )) prior deletes succeeded; $(echo "$approved_uuids" | wc -w) - ${#results[@]} remain unattempted."
    break
  fi
done
```

After the loop, reconcile: for every UUID in the input list, GET `/rest/v1/profiles?id=eq.<uid>` and confirm it returns `[]`. Build the audit report from the **reconciled outcome**, not the input list. Differences between "approved" and "actually deleted" go into the report's discrepancies section.

---

## Phase 7: Verify

Re-query `profiles` with the same filter that produced the candidate list. Confirm zero matches. Report:

```
Deleted N users. Verified absent from prod.profiles.
Dependent rows cascaded:
  clarity_sessions: X rows
  ...
```

---

## Phase 8: Audit trail

Write a dated report to `.private/reports/test-user-cleanup/YYYY-MM-DD.md`. **Pre-delete snapshot is mandatory** — once `auth.users` is gone, this report is the only forensic record.

Format:

```markdown
# Test user cleanup — YYYY-MM-DD

**Env:** prod | test
**Approver:** founder (in-session), option <letter> chosen
**Skill version:** <semver from skill frontmatter>

## Approved

| uid | email | name | slug | created_at |

## Pre-delete snapshot (per uid)

### {uid} — {email}
- profile: {slug, name, email, role, linkedin_url, reason, created_at}
- clarity_sessions joined: [{id, code, live_state.status, partner_name}, ...]
- clarity_letters: [{id, status, sender_name, receiver_name}, ...]
- clarity_agreements: [{id, status, partner_name}, ...]
- (any other BLOCKING or CASCADE table with rows — list IDs + minimal context)

## Outcome reconciliation

| uid | HTTP status | gone from profiles? | discrepancy? |

## Self-review findings (this run)

- {WARN/NOTE items, or "none"}
```

Snapshot fetch is one GET per table per candidate. Run before any DELETE. If snapshot capture fails, **abort the run**.

---

## Self-Check Before Returning Control

- [ ] Environment was stated explicitly before any live call
- [ ] Founder UUIDs were loaded from `.private/docs/founder-accounts.md` (not hardcoded)
- [ ] Fixture grep was run for each candidate the heuristic flagged as agent/fixture-shaped
- [ ] Dependent row counts shown for every candidate
- [ ] Self-review subagent ran and findings were displayed (or skill was patched if HIGH)
- [ ] Founder gave explicit option-letter approval (not "yes")
- [ ] Verification query confirmed deletion
- [ ] Audit report written to `.private/reports/test-user-cleanup/`

---

## Known limits

- **Heuristic-based.** A test user whose email and name look like a real person will be missed. Counterbalance: founders typically know their own test-creation patterns; the skill is meant to catch what the founder put there.
- **Read uses anon key + RLS.** A user who somehow has an `auth.users` row but no `profiles` row will not be visible. If this matters, query `auth.users` via the service role in Phase 1 instead.
- **Cascade depends on FK config staying correct.** If a future migration adds a `profiles`-referencing table with `ON DELETE NO ACTION`, this skill will fail mid-loop. The self-review gate is the catch.

---

## Related skills

- `/slava:maintain:privacy` — same pattern of "scan + judgment + approval" for files
- `/slava:dd:critic` — heavier adversarial review; use if a deletion goes wrong and we need to understand why
- `.claude/rules/db-access.md` — environment/destructive-SQL rules that this skill enforces
