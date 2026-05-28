---
name: sync-ghost-members
description: Sync verified ClarityPledge users (name + email) to Ghost as newsletter subscribers.
when_to_use: "When you need to update Ghost members list with new ClarityPledge signups — e.g., before sending a newsletter, after a batch of new users, or on periodic maintenance."
version: 1.3.0
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
7. **If member already exists (422)** — **fetch the member record first**, check `unsubscribed_at`. If set → log as opted-out, stop. If null → PUT to add newsletter subscription. Never PUT blind on a 422 — this is the only path that can re-subscribe a confirmed opt-out.
8. **Audit ALL existing Ghost members** — after Supabase sync, scan every Ghost member for `newsletters: []`. For each:
   - `unsubscribed_at` is set → **skip** (respected opt-out — log as opted-out)
   - `unsubscribed_at` is null → **fix via PUT** with `{ subscribed: true, newsletters: [{ id: newsletterId }] }` (was created without subscription, not an opt-out)

**Important:** Members created without the `newsletters` array exist as accounts but are NOT newsletter subscribers. Ghost's publish dialog only counts subscribers, not all members. Always include the newsletter ID.

### Step 3: Persist opt-out ledger

After the audit, append all opted-out members (email + `unsubscribed_at`) to `.private/ghost-optouts.jsonl` (one JSON object per line, append-only). Create the file and parent dir if missing. This survives Ghost data deletion — check it on every future run before creating or fixing any member.

```javascript
// At start of run: load existing ledger
const ledgerPath = '.private/ghost-optouts.jsonl';
const existingOptouts = new Set(); // emails known to have opted out
if (fs.existsSync(ledgerPath)) {
  fs.readFileSync(ledgerPath, 'utf8').split('\n').filter(Boolean)
    .forEach(line => existingOptouts.add(JSON.parse(line).email.toLowerCase()));
}

// During sync: before creating or fixing any member, check ledger first
if (existingOptouts.has(email.toLowerCase())) {
  // skip — known opt-out even if Ghost record is gone
}

// After audit: append newly discovered opt-outs
const newOptouts = ghostMembers.filter(m => m.unsubscribed_at);
const toAppend = newOptouts.filter(m => !existingOptouts.has(m.email.toLowerCase()));
if (toAppend.length > 0) {
  fs.appendFileSync(ledgerPath,
    toAppend.map(m => JSON.stringify({ email: m.email, unsubscribed_at: m.unsubscribed_at })).join('\n') + '\n'
  );
}
```

### Step 4: Verify subscriber count

After all creates and fixes, fetch `GET /members/?limit=all` and count:
- Total members (all entries)
- Newsletter subscribers (members where `newsletters` array is non-empty)
- Opted-out (members where `unsubscribed_at` is set) — these are expected non-subscribers

If `total members − opted_out > newsletter subscribers` → **WARNING**: some members still lack newsletter subscriptions unexpectedly. List them.

### Step 5: Report

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
- **422 path is the re-subscription risk.** On a 422, always fetch the member record and check `unsubscribed_at` before issuing PUT. A blind PUT on 422 is the only concrete path to re-subscribing a confirmed opt-out in a single run.
- **Local opt-out ledger** (`.private/ghost-optouts.jsonl`) is the guard against Ghost data deletion. Ghost's `unsubscribed_at` is the primary source of truth; the ledger is the backup. Check both before any create or fix.
- **Full audit on every run**: Don't assume previous runs were complete — always scan all Ghost members and fix any `unsubscribed_at: null + newsletters: []` cases. This catches members added through Ghost admin UI directly (not via this script) and handles any past sync bugs.
- **Audit covers all Ghost members, not just Supabase users**: This is intentional — Ghost admin may add members directly. Assumption: any Ghost member with `unsubscribed_at: null + newsletters: []` was created without newsletter by mistake, not by deliberate choice. If you ever need to create a Ghost account that should NOT receive newsletters, set a note so it won't be auto-fixed.

---

## Related Skills

- `/create-offer` — personalized post-session offer page
- `/draft-email` — outbound email drafting
