---
name: analytics
description: Pull the live analytics picture — Mixpanel session health + Supabase user health. Ensures Mixpanel login before querying. Called by /weekly or standalone.
when_to_use: "During /weekly or standalone. When checking Mixpanel + Supabase health."
version: 1.0.0
---

# /slava:maintain:analytics

Unified analytics snapshot. Ensures Mixpanel is accessible, then queries all sources.

Run standalone for a quick health check, or called from `/weekly` for the full evidence picture.

---

## Step 1: Mixpanel access

**Prefer MCP:** If Mixpanel MCP tools (`mcp__mixpanel__*`) are available, use them directly for all queries in Step 3. Skip Chrome login entirely.

**Fallback (Chrome):** If MCP is unavailable:
```
Use mcp__claude-in-chrome__tabs_context_mcp to get current tabs.
Check if any tab has URL matching eu.mixpanel.com/project/3968494/...
  - If YES: session is live, skip login.
  - If NO: invoke /slava:maintain:mixpanel-login before continuing.
```

---

## Step 2: Supabase user health

```bash
source <cp-root>/.env.local
node -e "
const ref = 'besjtuodziykmjidubzw';
const key = process.env.VITE_SUPABASE_ANON_KEY;
const url = 'https://' + ref + '.supabase.co/rest/v1/profiles';
const headers = { apikey: key, Authorization: 'Bearer ' + key };
const since = new Date(Date.now() - 7 * 86400 * 1000).toISOString();
fetch(url + '?select=id,created_at,email_confirmed_at&limit=2000', { headers })
  .then(r => r.json())
  .then(rows => {
    const total = rows.length;
    const verified = rows.filter(r => r.email_confirmed_at).length;
    const newThisWeek = rows.filter(r => r.created_at >= since).length;
    console.log('USERS: total=' + total + ' verified=' + verified + ' unverified=' + (total - verified) + ' new_this_week=' + newThisWeek);
  })
  .catch(e => console.log('USERS: error — ' + e.message));
"
```

---

## Step 3: Mixpanel — key event counts (last 30 days)

**If MCP available:** Query Mixpanel MCP for the same metrics — session counts, activation events, retention. Use the MCP query tools to get event counts for the last 30 days.

**Fallback (Chrome):** Navigate to each board and read the headline numbers:

| Board | URL |
|-------|-----|
| Session Value | https://eu.mixpanel.com/project/3968494/view/4464294/app/boards#id=10989894 |
| Activation | https://eu.mixpanel.com/project/3968494/view/4464294/app/boards#id=10989933 |
| Retention | https://eu.mixpanel.com/project/3968494/view/4464294/app/boards#id=10989955 |

Read visible metric numbers from each board (use `get_page_text` or `read_page`).

---

## Output

```
ANALYTICS SNAPSHOT — [date]

USERS:     Total: N | Verified: N | Unverified: N | New this week: N

MIXPANEL (last 30d):
  Session Value:  [key metric from board — or "board not loaded"]
  Activation:     [key metric — or "board not loaded"]
  Retention:      [key metric — or "board not loaded"]

SIGNAL:    [1-line interpretation — e.g. "Activation low, retention healthy = onboarding gap"]
```

If Mixpanel login failed: output `MIXPANEL: login failed — run /mixpanel-login manually` and continue with Supabase only.

---

## Future sources (add here when relevant)

- Stripe MRR — add when paid sessions begin (C2)
- Ghost subscribers — add when essays launch (R1)
- PostHog / other — if added later
