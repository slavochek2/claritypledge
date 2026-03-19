---
name: sync-ghost-members
description: Sync verified ClarityPledge users (name + email) to Ghost as newsletter subscribers.
when_to_use: "When you need to update Ghost members list with new ClarityPledge signups — e.g., before sending a newsletter, after a batch of new users, or on periodic maintenance."
version: 1.0.0
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
2. Fetches existing Ghost members (to skip duplicates)
3. Creates new Ghost members with `name` + `email`
4. Reports: created / already existed / errors

**Excluded by default:**
- Unverified users (never confirmed email — bad for deliverability)
- Test accounts: `*@claritypledge.com` emails (test-agent, e2e-agent, etc.)

---

## Prerequisites

These must exist in `.env.local`:
- `GHOST_ADMIN_API_KEY` — format `{id}:{secret}`
- `PROD_SUPABASE_ANON_KEY` — prod anon key

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
3. **Fetches existing Ghost members** — `GET /ghost/api/admin/members/?limit=all`
4. **Diffs** — only create members not already in Ghost (case-insensitive email match)
5. **Creates each member** — `POST /ghost/api/admin/members/` with `{ members: [{ email, name }] }`

**Critical: 1-second delay between Ghost API calls.** Ghost uses SQLite — rapid writes cause silent data loss. This was discovered empirically (34 members created with 201 responses but lost without delay).

**Retry on parse error:** If Ghost returns a malformed response, wait 3s and retry once. If the retry also fails, log the error and continue.

### Step 3: Verify

After all creates, wait 2s then fetch `GET /members/?limit=all` and report the final count.

### Step 4: Report

Output a summary:
```
Ghost sync complete:
  Already existed: N
  Newly created: N
  Errors: N
  Total Ghost members: N
```

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

- **SQLite write contention**: Ghost on Docker uses SQLite. Without the 1s delay, POST returns 201 but data is silently lost. Never remove the delay.
- **No bulk endpoint**: Ghost Admin API only supports single-member creation. For 36 users this takes ~40s; plan accordingly for larger user bases.
- **Duplicate handling**: Ghost returns 422 ValidationError for existing emails. The script skips these pre-flight via the diff step, but the 422 is harmless if it occurs.
- **Unverified users excluded**: Deliberate choice — sending to unconfirmed emails hurts sender reputation (bounces, spam reports).

---

## Related Skills

- `/create-offer` — personalized post-session offer page
- `/draft-email` — outbound email drafting
