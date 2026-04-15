---
status: backlog
type: bug
severity: high
rank: 1
tags: [letters, rls, security-definer]
date_reported: 2026-04-15
pipeline_plan: [fix, ship]
---

# P707: submitLetterResponseAuthenticated silently fails — letter_deliveries RLS blocks all client inserts

## Bug Description

**Reported:** 2026-04-15
**Severity:** High — every authenticated one-to-many letter recipient loses their response data

**Symptom:**
When an already-logged-in user reads a one-to-many letter and submits ratings + positions,
the completion screen appears but no data is saved. The delivery, ratings, and position
responses are all lost.

**Pre-condition:** A false-completion-screen bug (fixed earlier) masked this entirely — users
saw "done" even though the DB write failed. That fix (moved `setViewState('complete')` into
`.then()`) now surfaces this as a toast error instead.

**Not yet prod-impacting:** `letter_deliveries` table does not exist on prod — letters feature
not shipped. Must be fixed before letters ship.

## Reproduction

**Exact reproduction (test DB — confirmed 2026-04-15):**

```bash
# 1. Sign in as an e2e test user (not the letter sender)
USER_JWT=$(curl -s -X POST "$SUPABASE_URL/auth/v1/token?grant_type=password" \
  -H "apikey: $ANON_KEY" -H "Content-Type: application/json" \
  -d '{"email":"e2e-test-1776233610714-1358@gmail.com","password":"test-password-12345"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])")

# 2. Attempt the exact insert submitLetterResponseAuthenticated makes
curl -X POST "$SUPABASE_URL/rest/v1/letter_deliveries" \
  -H "apikey: $ANON_KEY" \
  -H "Authorization: Bearer $USER_JWT" \
  -H "Content-Type: application/json" \
  -d '{"letter_id":"65b09097-ce06-4679-a8c1-ead434975b92","receiver_profile_id":"64697355-9e2e-4f28-84ad-c00790b4136c","status":"completed","stories_rated":3}'
```

**Confirmed result:**
```json
{"code":"42501","message":"new row violates row-level security policy for table \"letter_deliveries\""}
```

## 5 Whys Root Cause Analysis

**Why 1 — Why is the response lost?**
`submitLetterResponseAuthenticated` throws `42501` on step 2 (`letter_deliveries` INSERT). Execution stops; no ratings, positions, or terms rows are written.

**Why 2 — Why does the INSERT fail?**
RLS policy `"Deliveries insert blocked"` on `letter_deliveries` has `WITH CHECK (false)` — rejects ALL inserts regardless of user role or payload.

**Why 3 — Why does the policy say `WITH CHECK (false)`?**
Intentional by design. Migration comment in `20260403224331_p581_clarity_letters.sql` line ~197:
`-- INSERT: WITH CHECK(false) — created only by SECURITY DEFINER RPCs`

**Why 4 — Why was `submitLetterResponseAuthenticated` built as a direct client insert?**
The anon→signup flow already had `confirm-letter-response` (edge function, SECURITY DEFINER).
When the already-authenticated path was added, a corresponding SECURITY DEFINER RPC was never
created for it. The function name implied "authenticated users can just insert directly" — but
the architectural contract always required a privileged server-side path.

**Why 5 — Why wasn't this caught?**
Three factors combined:
(1) The false-completion-screen bug made users see "done" even on failure.
(2) `letter_deliveries` doesn't exist on prod — no production failures.
(3) E2E tests didn't assert a DB row was created after submission.

## Root Cause

No SECURITY DEFINER RPC exists for the authenticated letter submission path. The
`confirm-letter-response` edge function handles the anon→signup flow only. The authenticated
path (direct `.insert()`) is permanently blocked by `WITH CHECK (false)` on `letter_deliveries`.

## Scope

### Which tables are blocked

| Table | Auth INSERT policy | Fix needed? |
|-------|--------------------|-------------|
| `letter_deliveries` | `WITH CHECK (false)` | **Yes — RPC required** |
| `story_verifications` | `WITH CHECK (auth.uid() IS NOT NULL)` | No — client OK |
| `letter_point_responses` | Checks delivery exists via JOIN | No — client OK once delivery exists |
| `terms_acceptances` | Standard permissive upsert | No — client OK |

### One-to-one vs one-to-many path distinction (IMPORTANT)

The proposed RPC is **one-to-many only**. For one-to-one letters, a delivery row is
pre-created (invitation row) and the correct action is UPDATE, not INSERT. The call
site that reaches `submitLetterResponseAuthenticated` must not be the one-to-one path.

**Verify before implementing:** Grep callers of `submitLetterResponseAuthenticated` and
confirm only the one-to-many code path calls it. Add a runtime guard in the RPC: check
that no delivery row already exists for `(letter_id, receiver_profile_id)` — if one
exists, return its ID (idempotency) rather than inserting a second row.

## Proposed Fix

### Design decision: minimal RPC vs. full atomic RPC

The Opus advisor flagged that `confirm-letter-response` (the anon path) does all 4 inserts
server-side for atomicity. The minimal approach (RPC only for delivery, rest client-side) risks
an orphaned "completed" delivery with `stories_rated=N` but zero verifications if steps 3–5 fail.

**Decision for founder:** Is a partial success state acceptable in v1, or should all 4 inserts
move into one SECURITY DEFINER function for parity with the anon path? Mark your choice:

- [ ] **Minimal (fast):** RPC for delivery only. Partial success documented limitation (per spec AD4).
- [ ] **Full atomic (correct):** Single `submit_letter_response` RPC handles all 4 inserts, matching `confirm-letter-response` pattern.

The proposed fix below assumes **minimal** (consistent with existing spec AD4). Update if
full atomic is chosen.

### 1. New migration

File: `supabase/migrations/YYYYMMDDHHMMSS_p707_create_letter_delivery_rpc.sql`

```sql
-- Unique constraint: prevent duplicate deliveries for same authenticated recipient
-- (idempotency guard — also protects against race conditions and double-submit)
CREATE UNIQUE INDEX IF NOT EXISTS idx_letter_deliveries_one_per_recipient
  ON letter_deliveries (letter_id, receiver_profile_id)
  WHERE receiver_profile_id IS NOT NULL;

-- SECURITY DEFINER RPC: authenticated path for one-to-many letter delivery
-- Bypasses WITH CHECK(false) on letter_deliveries by running as function owner.
-- One-to-one path uses UPDATE on pre-existing invitation row — do NOT use this function for that.
CREATE OR REPLACE FUNCTION create_letter_delivery(
  p_letter_id UUID,
  p_stories_rated INT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_delivery_id UUID;
  v_recipient_id UUID;
  v_sender_id UUID;
  v_letter_found BOOL;
BEGIN
  v_recipient_id := auth.uid();
  IF v_recipient_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Idempotency: return existing delivery if recipient already submitted
  SELECT id INTO v_delivery_id
  FROM letter_deliveries
  WHERE letter_id = p_letter_id AND receiver_profile_id = v_recipient_id
  LIMIT 1;

  IF FOUND THEN
    RETURN v_delivery_id;
  END IF;

  -- Guard: letter must exist
  SELECT sender_id INTO v_sender_id FROM clarity_letters WHERE id = p_letter_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Letter not found';
  END IF;

  -- Guard: caller must not be the sender
  IF v_sender_id = v_recipient_id THEN
    RAISE EXCEPTION 'Sender cannot submit a response to their own letter';
  END IF;

  INSERT INTO letter_deliveries (
    letter_id, receiver_profile_id, receiver_email,
    status, completed_at, stories_rated
  )
  SELECT
    p_letter_id,
    v_recipient_id,
    au.email,
    'completed',
    now(),
    p_stories_rated
  FROM auth.users au
  WHERE au.id = v_recipient_id
  RETURNING id INTO v_delivery_id;

  RETURN v_delivery_id;
END;
$$;

REVOKE ALL ON FUNCTION create_letter_delivery FROM PUBLIC;
GRANT EXECUTE ON FUNCTION create_letter_delivery TO authenticated;
```

### 2. Service update — `src/app/data/letters-service.ts`

Replace step 2 (lines 965–983) — direct `.insert()` — with:

```typescript
// 2. Create delivery via SECURITY DEFINER RPC
//    (letter_deliveries has WITH CHECK(false) RLS; client inserts always fail)
//    RPC is idempotent — returns existing delivery_id if already submitted.
const { data: deliveryId, error: deliveryError } = await supabase
  .rpc('create_letter_delivery', {
    p_letter_id: letterId,
    p_stories_rated: ratings.length,
  });

if (deliveryError || !deliveryId) {
  throw new Error(`Failed to create delivery: ${deliveryError?.message}`);
}
```

Step 1 (fetch `letterData.sender_id`) — check if still needed for `story_verifications.speaker_id`
in step 3. If yes, keep it. If `speaker_id` can be sourced elsewhere or dropped, remove the fetch.

## Files to Change

- `supabase/migrations/YYYYMMDDHHMMSS_p707_create_letter_delivery_rpc.sql` — new migration
- `src/app/data/letters-service.ts` — replace step 2 with `supabase.rpc('create_letter_delivery', ...)`

## Acceptance Criteria

- [ ] Authenticated user submits a one-to-many letter response → `letter_deliveries` row created with correct `letter_id`, `receiver_profile_id`, `receiver_email`, `stories_rated`
- [ ] `story_verifications` rows created (one per rating)
- [ ] `letter_point_responses` rows created (one per position)
- [ ] `terms_acceptances` upsert succeeds
- [ ] **Idempotency:** Calling `create_letter_delivery` twice for same `(letter_id, recipient)` returns the same delivery ID; exactly ONE `letter_deliveries` row exists after two calls
- [ ] **Sender guard:** Calling `create_letter_delivery` as the letter sender's JWT raises an exception; Sentry captures the event; no partial rows written
- [ ] **Letter not found:** Calling with a nonexistent `letter_id` raises an exception (not a silent failure)
- [ ] No regression: anon→signup flow (`confirm-letter-response` edge function) untouched
- [ ] **Regression test:** `src/tests/p707-authenticated-letter-delivery.test.ts` asserts:
  - Signs in as a non-sender e2e user
  - Calls `submitLetterResponseAuthenticated` end-to-end
  - Queries test DB: `SELECT id, stories_rated FROM letter_deliveries WHERE letter_id=? AND receiver_profile_id=?` → exactly 1 row
  - `story_verifications` count equals `ratings.length`
  - `letter_point_responses` count equals `positions.length`
  - Calling again (double-submit): still exactly 1 delivery row
- [ ] `./scripts/migrate.sh` runs cleanly on test DB
- [ ] `npm test` passes

## Related

- `src/app/data/letters-service.ts` — `submitLetterResponseAuthenticated` (line 932)
- `supabase/migrations/20260403224331_p581_clarity_letters.sql` — `letter_deliveries` RLS (~line 197)
- `supabase/functions/confirm-letter-response/index.ts` — the existing SECURITY DEFINER path (anon→signup only); idempotency pattern at lines 164–179; atomic 4-step at lines 211–307
