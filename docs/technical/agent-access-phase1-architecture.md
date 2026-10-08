# Agent access, phase 1 (read-only): authorization architecture

**Status:** design, not built. Written under P1321 step 5 for P1215 (build blocker:
*"`/architect` has produced the authorization architecture — AS, audience, exchange, callback,
user binding, scope enforcement, `auth.uid()` derivation — and it has been adversarially
reviewed"*). Review rounds and their dispositions: [§ Review record](#review-record).

**Building it is still gated** on P1207 Criterion 1 being **Yes** for both roles. The 2026-10-08
re-audit answered **No** ([docs/audits/p1321-reaudit.md](../audits/p1321-reaudit.md)).

Everything below marked **UNVERIFIED** is a reading of vendor documentation, not something run
against this project. Build step 0 ([§ Spikes](#build-step-0--spikes-that-can-kill-this-design))
turns each one into an observed fact or kills the design. If a spike fails, its row names the
fallback.

---

## 1. The one decision everything else follows from

**An agent's token runs as its own Postgres role, `agent_reader`, which holds no privilege on
any existing table or function.** The capability boundary is therefore enforced by Postgres
grants, in the database, not by the MCP server.

Why this and not the obvious design. Supabase's OAuth 2.1 server issues access tokens that are
*"standard Supabase JWTs"* carrying `role`, `client_id` and `session_id`, and *"your existing Row
Level Security policies automatically apply"* to them. As issued, an agent token is a full
`authenticated` session: it works directly against PostgREST, Storage and Realtime, writes
included, whether or not it ever passes through our MCP server. A design that enforces
"read-only" and "only these tools" in the MCP server enforces nothing, because the token holder
can skip the MCP server and call PostgREST with the same token. P1215's invariant *"every
capability boundary in this spec is ours to enforce"* has to mean the database.

Re-roling the token makes the token's whole reach equal to what `agent_reader` is granted. That
grant set can be enumerated from the catalog, so the reachability matrix is derived rather than
hand-listed (epistemic gate 7e).

| Alternative considered | Why not |
|---|---|
| Enforce scope in the MCP server, forward the user's `authenticated` token to PostgREST | Token works without the MCP server; "read-only" is decoration. |
| MCP server holds the service-role key and passes the user id | The server trusts an asserted user id, which is P143's confused-deputy ground. It also adds a privileged credential (P1214: the credential set may only shrink). |
| Keep role `authenticated`, add `RESTRICTIVE ... USING ((auth.jwt()->>'client_id') IS NULL)` policies on every table (the vendor's documented pattern) | Fails open. Every future table, every function granted to `authenticated`, every Storage bucket and every Realtime channel is reachable until someone remembers to add the policy. |
| `agent_reader` as a member of `authenticated` plus restrictive policies | It inherits every write grant, which is the same fail-open shape. |

---

## 2. Components

```
 Agent client (Claude, ChatGPT, …)
   │  1. GET MCP endpoint → 401 + WWW-Authenticate: resource_metadata=…
   │  2. discovers AS from protected-resource metadata (RFC 9728)
   │  3. authorization-code + PKCE against Supabase Auth  /auth/v1/oauth/authorize
   │        └─► Supabase redirects the user to OUR consent page  /oauth/consent  (SPA route)
   │               user (already signed in, recently) sees client + redirect host + plain-words
   │               disclosure → Approve / Deny  (approveAuthorization / denyAuthorization)
   │  4. code → token at Supabase Auth; custom access-token hook re-roles it:
   │        role = agent_reader, aud = <MCP resource URI>
   ▼
 MCP server  — Supabase Edge Function, holds NO secret
   │  checks: signature (JWKS), iss, aud == own resource URI, exp, client_id present
   │  forwards the caller's Authorization header unchanged
   ▼
 PostgREST  /rest/v1/rpc/agent_<tool>   — runs as agent_reader, auth.uid() = token sub
   ▼
 schema `agent`: one SECURITY DEFINER function per exposed tool
   every call: grant live? kill switch off? within ceilings? → read, scoped by auth.uid()
               → write one audit row → return an allowlisted column set
```

| Component | Owner | Holds a secret? |
|---|---|---|
| Authorization server | Supabase Auth (OAuth 2.1 server, delegated per the MCP spec) | Supabase's signing keys only |
| Consent page `/oauth/consent` | SPA route, uses the browser session's own client | No |
| Custom access-token hook | Postgres function `agent.access_token_hook` | No |
| MCP server | Edge Function `mcp` | **No.** No service-role key, no DB password |
| Capability boundary | Postgres: role `agent_reader` + schema `agent` | n/a |

---

## 3. The P1215 requirements, one by one

### 3.1 Authorization server

Supabase Auth's OAuth 2.1 server. Discovery at
`https://<ref>.supabase.co/.well-known/oauth-authorization-server/auth/v1`. Authorization-code
flow with PKCE; codes valid 10 minutes; redirect URIs must match exactly (vendor docs).

- **PKCE method.** The AS accepts `S256` *or* `plain`. MCP clients are required to use S256, so
  in practice this protects a well-behaved client's own code and is not a server-side guarantee.
  `plain` is accepted as a vendor limitation. It weakens only the client that chooses it.
- **Client registration.** Dynamic registration lets *any* client register with any name, so a
  client name is attacker-controlled text. Phase 1 decision: **dynamic registration OFF; clients
  pre-registered by the operator**, one per supported agent product, each with exact redirect
  URIs. `[FOUNDER DECISION: which agent products are pre-registered for phase 1]`. Turning it on
  later requires the consent page to treat the name as untrusted (§3.4), which it already does.
- **Scopes.** Supabase supports only `openid email profile phone` and *"custom scopes are not
  currently supported"*. Scopes therefore carry no capability meaning here. Capability is the
  `agent_reader` grant set (§3.6), the same for every phase-1 grant.

### 3.2 Audience

The hook sets `aud` to the MCP server's canonical resource URI for every token that carries a
`client_id`. The MCP server refuses any other `aud`. Browser tokens keep `aud=authenticated`, so a
browser token presented to the MCP server is refused, and an agent token is useless outside this
resource because its role (§3.6) has no grants beyond `agent.*`.

RFC 8707 `resource` is not documented by Supabase. The audience is set by the hook, not by the
request, so a client cannot ask for a different audience.

**Token passthrough.** The MCP spec forbids passing an MCP-audience token to an *upstream*
API. Here PostgREST's `agent` schema *is* the resource: the Edge Function is a protocol adapter
in front of it, and no other service accepts the token for anything. The reviewers are asked to
attack this framing specifically.

### 3.3 Token exchange and lifetime: numbers, not words

| Parameter | Value | Enforced where |
|---|---|---|
| Access-token lifetime | Project JWT expiry, 3600 s default. **Not shortened per client**: the hook is not documented to change `exp`, and shortening the project setting also logs out browsers | Supabase Auth |
| Refresh tokens | **Issued by Supabase and cannot be suppressed** (no documented switch). P1215's "no refresh token" non-goal is unattainable on this AS, so its *purpose* is enforced instead by the next three rows | — |
| Absolute grant lifetime | **12 hours** from the OAuth session's `created_at`, after which every tool refuses, whether or not the token was refreshed | every `agent.*` function |
| Idle timeout | **60 minutes** without a tool call (from the audit log) → refused | every `agent.*` function |
| Concurrent grants | **At most 3** live agent sessions per user; a 4th tool call from a 4th session is refused with a message naming the disconnect page | every `agent.*` function |
| Re-auth strength at consent | Browser session must have signed in within the last **10 minutes**; otherwise the consent page sends the user to sign in again first | consent page |
| Replay | A bearer token replays until its `exp` (≤ 1 h). Bounded further by the session-row check: revocation (§3.9) deletes the session row, and every tool checks it, so revocation takes effect on the next call, not at `exp` | every `agent.*` function |
| In-flight at expiry | A call that passed the checks finishes; one call is one transaction, so nothing is half-done | Postgres |

A refreshed token past the absolute lifetime gets a working JWT that every tool refuses. A
refresh token therefore can't stretch a grant past 12 hours, which is the property the non-goal
wanted. Expired grants are swept nightly with `revokeGrant` semantics, so refresh tokens don't
pile up.

`[FOUNDER DECISION: 12 h absolute / 60 min idle / 3 concurrent are proposed defaults, not
product decisions already made]`

### 3.4 Callback and consent

`/oauth/consent?authorization_id=…` is an SPA route.

1. Requires a signed-in browser session no older than 10 minutes (§3.3). Otherwise it signs the
   user in, then returns to the same `authorization_id`.
2. Calls `getAuthorizationDetails(authorization_id)` and renders: the **account it will act as**
   (email, not just name, so a user signed into the wrong account sees it), the client's **name
   marked as self-reported**, the **redirect host** in full, and a plain-words statement of what
   the agent will be able to read and that the agent's answers may show that content to whoever
   sees its conversation. This is the confidentiality disclosure P1215 requires.
   `[FOUNDER DECISION: consent copy]`
3. Approve and Deny are explicit clicks, and both are calls in the user's own session. Login-CSRF
   is covered by step 1: an attacker who logs the victim into the *attacker's* account would need
   the victim to approve a screen showing the attacker's email.
4. Redirects to the `redirect_url` that `approveAuthorization` / `denyAuthorization` returns, and to
   no other URL.

The `state` parameter is the client's job. The consent page never reads or forwards it.

### 3.5 User binding and `auth.uid()` derivation

`auth.uid()` inside every `agent.*` function is the `sub` of a JWT whose signature PostgREST
verified. That is the same derivation as a browser request, and no layer accepts a user id from
anywhere else:

- No `agent.*` function takes a user id, email or profile id **as an identity**. A function may
  take an object id (a letter id), and that id is then authorized against `auth.uid()`, never
  trusted. (The re-audit's enrolment-function finding was exactly this failure. The rule is
  tested per function, §5.)
- The MCP server never constructs, rewrites or adds an Authorization header; it forwards the
  caller's header byte-for-byte. It has no credential of its own to substitute.
- The hook decides the role from the presence of `client_id` in the hook input, **not** from
  `authentication_method`, because the method value on a *refresh* is UNVERIFIED (spike S2). A
  token is `agent_reader` iff it came from an OAuth client, on issue and on every refresh.

### 3.6 Scope enforcement: the role

```sql
CREATE ROLE agent_reader NOLOGIN NOINHERIT;
GRANT agent_reader TO authenticator;            -- lets PostgREST switch into it
GRANT USAGE ON SCHEMA agent TO agent_reader;
GRANT EXECUTE ON FUNCTION agent.list_my_letters(...) TO agent_reader;   -- the opt-in: one line per tool
-- nothing else: no table, no column, no sequence, no other schema
```

The opt-in is the `GRANT EXECUTE`: a function in `agent` without it is not exposed (P1215:
derivation is not exposure).

**The trap this must close: `PUBLIC`.** `agent_reader` inherits whatever `PUBLIC` holds, and
Postgres gives `PUBLIC` EXECUTE on every new function by default. P1063 and P1321 found real
functions still carrying it. So:

- `ALTER DEFAULT PRIVILEGES … REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC` for the schemas the
  migrations create functions in, so the default stops being fail-open;
- the function-grant drift check gains a third role: any function `agent_reader` can execute
  outside `agent.*` is a gating finding;
- Storage and Realtime: their policies are keyed on role and `auth.uid()`. A policy written `TO
  public` admits `agent_reader`. The reachability matrix (§5) includes both; spike S5 measures
  them before anything else is built.

### 3.7 Tools: classified by effect

Phase-1 candidate set, each a `SECURITY DEFINER` function in `agent`, each scoped to
`auth.uid()` and each returning an **allowlisted column set**:

| Tool | Returns | Must never return |
|---|---|---|
| `get_my_profile` | own name, slug, bio, pledge state | anything about other users |
| `list_my_letters` | letters I sent or received: id, title, status, dates, counterparty display name | invitation tokens, delivery tokens, URLs |
| `read_letter(letter_id)` | content of a letter where I am sender or receiver | other recipients' identities or responses on one-to-many letters unless the UI shows them to me |
| `list_my_events` | events I registered for: title, time, public location | registration-gated links (chat URLs, room codes) |

`[FOUNDER DECISION: the phase-1 tool list]`. The table above is a proposal, sized to be useful
and small.

**Effect rule:** a phase-1 tool's only write is its own audit row. It sends nothing, sets no
`read`/`opened` state, claims no delivery, and returns no value that grants access by being
presented (tokens, invite URLs, room codes: re-audit pattern 2, "a credential treated as an
identifier"). Verified per tool by a test that snapshots row counts and `updated_at` maxima across
all public tables before and after a call (§5), never by reading the function name.

**Volume ceilings** (inside each function): ≤ 50 rows per call; ≤ 300 calls per user per hour;
≤ 2 000 rows per user per day across tools. Over the limit returns a refusal that is itself
audited. `[FOUNDER DECISION: ceilings]`

**Untrusted content.** Any field holding another person's free text is returned inside a
labelled field (`counterparty_text`), never merged into the tool's own prose. This doesn't make
prompt injection safe. It is the one thing the server can do, and P1215 accepts the rest as a
bounded residual.

### 3.8 Kill switch

Three levels, none of which touches the browser app:

1. **Global:** `agent.config.enabled = false` → every `agent.*` function refuses at once (one
   UPDATE, no deploy). The Edge Function also reads it and answers 503.
2. **Per user or per client:** rows in `agent.blocklist (user_id | client_id)` → refused on the
   next call.
3. **Stop new grants:** turn the OAuth server off in the Supabase dashboard.

Browser sessions never run as `agent_reader`, so none of these can affect them. The
demonstration in P1215's Done-When must still show it: flip level 1, run the browser smoke suite.

### 3.9 Disconnect

A settings page lists the user's connected agents and offers **Disconnect**, which calls
`revokeGrant(client_id)`. Per vendor docs that deletes the client's refresh tokens and invalidates
its sessions. Because every tool checks that the `session_id` row still exists (§3.3), the next
call is refused without waiting for `exp`. Done-When verifies exactly that: disconnect, then the
same call refused.

### 3.10 Audit log

`agent.audit_log`, written by every tool call, including refusals:

| Field | Meaning |
|---|---|
| `at` | timestamp |
| `session_id` | the grant (OAuth session) |
| `client_id` | which agent product |
| `user_id` | `auth.uid()` |
| `tool` | function name |
| `args` | normalized arguments (ids only; no free text) |
| `rows_returned` | count |
| `rows_not_owned` | how many returned rows belong to someone other than the caller (counterparty letters) |
| `outcome` | `ok` / `refused` |
| `refusal` | `expired` · `idle` · `revoked` · `killed` · `ceiling` · `not_authorized` · `concurrency` |

This answers "what did this agent reach" with one query per `session_id`. The refusal counts per
grant are the denominator for P1215 Criterion 4 (expiry friction): refused-as-expired over grants
issued. Readable by the operator only; not exposed to `agent_reader` or `authenticated`.

**Anomaly detection, phase 1:** a `/day` check over the log flags users above 50 % of a ceiling,
any `not_authorized` refusal, and any new `client_id`. Anything more is deferred until real
traffic exists.

---

## 4. Threats, and where each is stopped

| Threat (P1215 risk table) | Stopped by |
|---|---|
| Token used outside the MCP server | Role `agent_reader`: reach equals the `agent.*` grants wherever the token is presented |
| Confused deputy / forged user binding | No component holds a credential that could act for someone else; `auth.uid()` only from a verified `sub` (§3.5) |
| Redirect-URI substitution | Exact match at the AS; pre-registered clients (§3.1) |
| Approval bound to the attacker's connector | Consent shows redirect host and marks the name self-reported; dynamic registration off |
| Login-CSRF | Consent shows the account email and needs a recent sign-in (§3.4) |
| Long-lived compromise via refresh tokens | 12 h absolute lifetime enforced at every call (§3.3) |
| Bulk enumeration / cost exhaustion | Ceilings inside every function (§3.7) |
| A "read" tool with side effects | Effect test per tool (§3.7, §5) |
| Exfiltration through the agent's own answer (prompt injection) | **Not stopped.** Bounded by ceilings and the kill switch, disclosed at consent (P1215: accepted residual) |
| Misquoting a counterparty | **Not stopped** (P1215: accepted; the comprehension rating is the check) |
| A new function silently reachable by agents | Default privileges revoked from `PUBLIC`; drift check covers `agent_reader` |
| Dangerous tool needs withdrawing | `REVOKE EXECUTE` is always allowed and takes effect on the next call |

---

## 5. Verification the build must produce

Derived from P1215's Done-When; each is a test, not a statement.

1. **Reachability matrix, derived:** for `agent_reader`, enumerate from the catalog every table,
   column, function, Storage bucket policy and Realtime publication it can reach. The expected set
   is exactly `agent.*` with `EXECUTE`. Controls: one function deliberately granted → it appears;
   a `TO public` Storage policy fixture → it appears.
2. **Per tool, own vs another user's objects:** called with an object the caller owns (rows) and
   one they don't (refused), for every tool that takes an id.
3. **Grant observed working, then refused** after the absolute lifetime and after disconnect, using
   the same call and the same fixture.
4. **Effect test** per tool (§3.7).
5. **Ceiling demonstrated:** scripted enumeration refused at the limit, refusal in the audit log.
6. **Kill switch demonstrated**, plus the browser smoke suite green while it is on.
7. **The audit log answering** "what did grant X reach" on a real run.

---

## Build step 0 — spikes that can kill this design

Run on the **test** project before any other work. Each spike says what would kill the design or
change it.

| # | Question (UNVERIFIED today) | If it fails |
|---|---|---|
| S1 | Can the custom access-token hook set `role` to `agent_reader`, and does PostgREST then run as it? | Design changes to restrictive `client_id IS NULL` policies everywhere. Fail-open (§1 table): needs its own review before going ahead |
| S2 | On a **refresh** of an OAuth token, does the hook run again and still see `client_id`? | If a refreshed token comes back as `authenticated`, the absolute lifetime must be enforced by revoking at 1 h instead (no refresh at all) |
| S3 | Does PostgREST accept a token whose `aud` is the MCP URI? | Keep `aud=authenticated`; the MCP server checks `client_id` instead of `aud` |
| S4 | Is `session_id` in the token, does `auth.sessions` hold the OAuth session, and does `revokeGrant` delete it? | Revocation waits for `exp` (≤ 1 h); disclosed at Disconnect |
| S5 | What do Storage and Realtime do with role `agent_reader`? | Any reach found is closed by policy before build |
| S6 | Is the project on asymmetric JWT signing, so the JWKS can verify tokens without a shared secret? | The MCP server would need the JWT secret, which adds a credential; prefer migrating signing keys |
| S7 | Is the OAuth 2.1 server available on this project's plan, outside beta restrictions? | Phase 1 waits |

---

## Review record

Rounds are blind: the reviewer gets this document and the P1215 spec, never the author's
reasoning. Dispositions are written below each round: **resolved** (document changed, with the
section), or **accepted** (with the reason).

*(Rounds 1 and 2 recorded after they run.)*

## Sources

- Supabase, OAuth 2.1 Server: https://supabase.com/docs/guides/auth/oauth-server
- Supabase, OAuth flows: https://supabase.com/docs/guides/auth/oauth-server/oauth-flows
- Supabase, Token security and RLS: https://supabase.com/docs/guides/auth/oauth-server/token-security
- Supabase, MCP authentication: https://supabase.com/docs/guides/auth/oauth-server/mcp-authentication
- P1215 § Verified protocol facts (MCP authorization spec, 2026-07-28)

Vendor statements quoted here were read on 2026-10-08 and not tested against this project; that is
what build step 0 is for.
