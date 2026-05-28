---
name: sync-ghost-members
description: Sync verified ClarityPledge users (name + email) to Ghost as newsletter subscribers.
when_to_use: "When you need to update Ghost members list with new ClarityPledge signups — e.g., before sending a newsletter, after a batch of new users, or on periodic maintenance."
version: 1.2.0
---

# /sync-ghost-members

Sync verified Supabase users to Ghost as named newsletter subscribers.

**Announce at start:** "Running /sync-ghost-members."

---

## When to use this vs other skills

| Situation | Skill |
|---|---|
| Sync ClarityPledge users → Ghost subscribers | `/sync-ghost-members` ← here |
| Post-session personalized offer page | `/create-offer` |
| Draft outreach email | `/draft-email` |

---

## What it does

1. Fetches all **verified** profiles (`is_verified=true`) from **prod** Supabase
2. Fetches ALL existing Ghost members with their full records (including `subscribed`, `unsubscribed_at`, `newsletters`)
3. Creates new Ghost members with `name` + `email` + newsletter subscription
4. Audits existing Ghost members — fixes any who have `unsubscribed_at: null` but `newsletters: []` (created without subscription, not opted-out)
5. Reports: created / fixed / opted-out (skipped) / errors

**Excluded by default:**
- Unverified users (never confirmed email — bad for deliverability)
- Test accounts: `*@claritypledge.com` emails (test-agent, e2e-agent, etc.)
- Members with `unsubscribed_at` set (they actively opted out — never re-subscribe without consent)

---

## Prerequisites

These must exist in `.env.local`:
- `GHOST_ADMIN_API_KEY` — format `{id}:{secret}`
- `PROD_SUPABASE_SERVICE_ROLE_KEY` — prod service role key (anon key can't read profiles due to RLS)

Ghost blog URL: `https://blog.claritypledge.com`
Prod Supabase ref: `besjtuodziykmjidubzw`

---

## Workflow

### Step 1: Load credentials

```bash
source .env.local
```

Read `GHOST_ADMIN_API_KEY` and `PROD_SUPABASE_ANON_KEY` from `.env.local`.

### Step 2: Run the sync

Execute a Node.js script inline that:

1. **Fetches prod profiles** — `GET /rest/v1/profiles?select=name,email&is_verified=eq.true` from prod Supabase
2. **Filters out test accounts** — skip any email ending in `@claritypledge.com`
3. **Fetches existing Ghost members with full records** — `GET /ghost/api/admin/members/?limit=all` — include `subscribed`, `unsubscribed_at`, `newsletters` fields
4. **Fetches Ghost newsletters** — `GET /ghost/api/admin/newsletters/` to get the newsletter ID
5. **Diffs** — only create members not already in Ghost (case-insensitive email match)
6. **Creates each new member with newsletter subscription** — `POST /ghost/api/admin/members/` with `{ members: [{ email, name, newsletters: [{ id: newsletterId }] }] }`
7. **If member already exists (422)**, update them via PUT to add the newsletter subscription (members created without `newsletters` are invisible in the publish dialog)
8. **Audit ALL existing Ghost members** — after Supabase sync, scan every Ghost member for `newsletters: []`. For each:
   - `unsubscribed_at` is set → **skip** (respected opt-out — log as opted-out)
   - `unsubscribed_at` is null → **fix via PUT** with `{ subscribed: true, newsletters: [{ id: newsletterId }] }` (was created without subscription, not an opt-out)

**Important:** Members created without the `newsletters` array exist as accounts but are NOT newsletter subscribers. Ghost's publish dialog only counts subscribers, not all members. Always include the newsletter ID.

### Step 3: Verify subscriber count

After all creates and fixes, fetch `GET /members/?limit=all` and count:
- Total members (all entries)
- Newsletter subscribers (members where `newsletters` array is non-empty)
- Opted-out (members where `unsubscribed_at` is set) — these are expected non-subscribers

If `total members − opted_out > newsletter subscribers` → **WARNING**: some members still lack newsletter subscriptions unexpectedly. List them.

### Step 4: Report

Output a summary:
```
Ghost sync complete:
  From Supabase — already existed: N
  From Supabase — newly created:   N
  Audit fixed (no opt-out):        N
  Audit skipped (opted-out):       N  ← respected, not fixable without consent
  Errors:                          N
  Total Ghost members:             N
  Newsletter subscribers:          N  ← should equal total minus opted-out
  Opted-out members:               N
```

If `(total − opted_out) ≠ subscribers` after all fixes, flag it with the specific emails — don't silently succeed.

---

## Ghost JWT auth

Ghost Admin API uses short-lived JWTs (5-min expiry). Generate a fresh token for each API call:

```javascript
const [id, secret] = GHOST_ADMIN_API_KEY.split(':');
const now = Math.floor(Date.now() / 1000);
const header = Buffer.from(JSON.stringify({ alg: 'HS256', kid: id, typ: 'JWT' })).toString('base64url');
const payload = Buffer.from(JSON.stringify({ iat: now, exp: now + 300, aud: '/admin/' })).toString('base64url');
const signature = crypto.createHmac('sha256', Buffer.from(secret, 'hex'))
  .update(header + '.' + payload).digest('base64url');
const token = header + '.' + payload + '.' + signature;
// Use as: Authorization: Ghost {token}
```

---

## Known constraints

- **Newsletter subscription is required for publish visibility.** Members without a `newsletters` array are Ghost accounts but NOT subscribers — they won't appear in the publish dialog count and won't receive email newsletters. This was the root cause of the "silent data loss" initially attributed to SQLite contention.
- **No bulk endpoint**: Ghost Admin API only supports single-member creation. For 36 users this takes ~40s; plan accordingly for larger user bases.
- **Duplicate handling**: Ghost returns 422 for existing emails. On 422, the script should PUT-update the member to add the newsletter subscription (fixes members that were previously created without it).
- **Unverified users excluded**: Deliberate choice — sending to unconfirmed emails hurts sender reputation (bounces, spam reports).
- **Opt-out detection**: `unsubscribed_at` being set means the member clicked an unsubscribe link. `subscribed: false` with `unsubscribed_at: null` means they were created without a newsletter — safe to fix. Never re-subscribe someone with `unsubscribed_at` set.
- **Full audit on every run**: Don't assume previous runs were complete — always scan all Ghost members and fix any `unsubscribed_at: null + newsletters: []` cases. This catches members added through Ghost admin UI directly (not via this script) and handles any past sync bugs.

---

## Related Skills

- `/create-offer` — personalized post-session offer page
- `/draft-email` — outbound email drafting
