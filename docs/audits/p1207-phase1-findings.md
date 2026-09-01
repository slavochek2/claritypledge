# P1207 Phase 1 — Reachability findings

**Run:** 2026-09-01 · **Branch:** `feature/p1207-adversarial-permission-audit`
**Lenses reported:** 5 of 5 (class A, class B, class C, class D, backlog). No lens uncovered.

## Source bounds

Per the spec's first Invariant, every verdict names the source it came from.

| Source | What it settles | What it cannot settle |
|---|---|---|
| Live **prod** catalog (`pg_policies`, `information_schema`, read-only SELECT) | What production actually enforces today | Nothing about future migrations |
| Live **test** catalog + PostgREST probes | Reachability with real role tokens | Prod divergence, unless separately probed |
| `supabase/migrations/*.sql` | Authoring intent, history | Which policy is live — superseded ones still match a grep |

**The file source was actively misleading and this is the audit's methodological result.** Grepping
migrations suggested a dozen-plus unconditional write policies. The live catalog holds **six**. The
rest were dropped by later migrations. Any fix fanned out from the grep would have been chasing
policies that no longer exist. Start live, then classify — as the Invariant says.

## Probe controls (Done-When #2)

An all-clean sweep is worthless without a known-bad and known-good scoring differently through the
*identical* probe on the *identical* metric.

| Probe | Known-good | Known-bad | Discriminates |
|---|---|---|---|
| Row reach (anon) | `events`/`points`/`stories` → rows (public by design) | `profiles`/`clarity_letters` → 401 | yes |
| Column grant | `profiles?select=id,name` → 200 | `profiles?select=email` → 401 42501 | yes |
| Cross-row (set equality) | `clarity_docs` expected 76 / actual 76, extra 0 | `event_rsvps` expected 0 / actual 41, extra 41 | yes |
| Privilege catalog | `TRUNCATE` to anon → 49 tables | `MAINTAIN` to anon → 0 | yes |
| Dynamic SQL | `realtime` 8, `storage` 3, `extensions` 2 | `public` → 0 | yes (zero is real) |
| `check-rls-scope.py` | `clean.sql` → exit 0 | `baseline_true.sql` → exit 1 | yes |

**A control caught a real defect in the first sweep.** The class B sweep used `limit=1000`; three
tables hit the cap for every role and read as "user sees all rows". Exact `Content-Range` counts
show the filters working (3464/3491, 3999/4047, 4217/4265). Dismissed as measurement artifacts.

**Six tables are VACUOUS on test** — empty, so a clean anon result proves nothing about their
policies: `clarity_demo_rounds`, `clarity_ideas`, `clarity_live_turns`, `clarity_verifications`,
`event_private_info`, `user_voice_profiles`. They cannot be classified until seeded. Criterion 4
is therefore **not** satisfied for these six.

## Coverage

57 live public tables. The migration-derived list held 55: `point_references` and `worktree_status`
exist live with **no migration file**, so every file-based control is structurally blind to them.
Both are 404 on prod (test-only). The `worktree_status` allowlist entry asserts *"never on prod, and
correctly so"* — that stored claim was tested rather than trusted, and it **holds**.

**Consequence for the standing control:** it was scoped per-commit and therefore file-based. These
two tables prove file-based checks cannot see unmigrated tables. The control needs a live
reconciliation leg, or it must state that bound in its own output.

## Findings

Severity ordered. Evidence grade is stated per finding and is not uniform.

### D-1 — Open email relay from the project's own sending domain · PROD · REPRODUCED
`supabase/functions/send-letter-response-signin/index.ts` has no `Authorization` check, no
`getUser`, and no `INTERNAL_FN_SECRET` — unlike every sibling sender. Only 2 of 16 functions carry
that secret. It takes `{to, actionLink, senderName}` and posts to Mailgun as the project's branded
sender; `actionLink` is HTML-escaped but never validated against an allowed host.

`verify_jwt` is on, but **`verify_jwt` is not authentication** — the public anon key is a valid JWT
and ships in the browser bundle. Measured boundary, both environments:

```
             nothing   key-header    Authorization only
TEST           401         401            400  <- reached user code
PROD           401         400            400  <- reached user code
```

(`key-header` = the anon key supplied via Supabase's project-key request header, no bearer token.)

A credential-less request is correctly refused. The public anon key is not. Result: anyone can send
DKIM-signed mail from the project's domain, to any address, carrying an attacker-chosen link.
Probes used an empty body (no recipient), so no mail was emitted.

**Fix pattern already exists in-repo:** `send-agreement-emails/index.ts:407`.

### F0a — Real user emails readable by anonymous visitors · PROD · REPRODUCED
`clarity_agreements` SELECT policy:
```
(visibility = 'public') OR (creator_profile_id = auth.uid())
  OR (partner_profile_id = auth.uid())
  OR (status = 'pending' AND lower(partner_email) = lower(auth.email()))
```
The pending branch is correctly built. The `visibility = 'public'` branch is unconditional and sits
ahead of it, so anon reads the whole row on public agreements. Prod returns 3 rows, all carrying a
real `partner_email`. No addresses are recorded here or anywhere in this repo.

### F0b — Invitation token is a selectable column · defect live, unarmed by expiry · chain CODE-DERIVED
The same policy exposes `invitation_token`, a capability. `create-and-sign` gates only on: token
match, `status='pending'`, not expired, no existing profile — then calls
`auth.admin.createUser({ email: partnerEmail, email_confirm: true })` and returns a session.

For a **public + pending + unexpired** agreement, an anonymous caller reads the token and obtains a
session bound to the victim's email, marked confirmed without the victim proving control. The
legitimate invitee is then locked out by the `USER_EXISTS` guard.

That state is producible: test holds 7 public+pending rows. All are expired; prod has none. **The
chain is blocked today by expiry timing, not by any control.** Not executed — doing so would create
a real auth user.

### F6 — `anon` holds `TRUNCATE` on 49 prod tables; RLS does not govern it · PROD · LATENT
Postgres does not apply row-level security to `TRUNCATE`; it is gated purely by the privilege.
`anon` and `authenticated` hold `TRUNCATE`, `TRIGGER` and `REFERENCES` on 49 production tables
including `profiles`, `clarity_letters`, `session_transcripts`, `clarity_sessions` — tables anon
**cannot read**. Control: `MAINTAIN` to anon = 0.

Root cause is one line: `20250101_initial_schema.sql:2` —
`alter default privileges in schema public grant all on tables to postgres, anon, authenticated, service_role`.
Every table created since inherited it. P877, P880, P904 and P1104 each patched one table by hand;
none revoked the class.

**Latent, not armed:** class D established exhaustively that no route reaches it — no edge function
takes a caller-supplied table, column, filter or SQL string (every `.from()`/`.rpc()` argument is a
string literal or module constant), and `public` contains zero dynamic-SQL functions against a
control that found 8 in `realtime`, 3 in `storage`, 2 in `extensions`.

**This is the audit's central argument in one finding.** The defense is "no route has been built",
not "permission denied". An agent-callable API is a route-building exercise.

### D-2 — Any authenticated user can obtain a write URL for any session's audio · CODE-DERIVED
`gcs-signed-url/index.ts:36-54` authenticates *that a user exists*, then forwards
`sessionCode`/`fileName` verbatim. No check that the caller participates in that session. The Cloud
Function builds `sessions/{sessionCode}/{fileName}` and returns a v4 `write` URL. Not reproduced:
test 500s at an env guard before the JWT check; prod was out of the agent's mandate.

### F1 — `clarity_idea_votes` UPDATE is unscoped · PROD · read REPRODUCED, write POLICY-DERIVED
```
cmd=UPDATE  roles={public}  qual=true  with_check=true
policy name: "Voters can update their own votes"
```
The name asserts ownership; the predicate enforces none. `{public}` includes `anon`, which holds
the `UPDATE` grant. No INSERT or DELETE policy exists, so a stranger cannot create or delete votes
— only silently rewrite every existing one, including `vote`, `voter_name`, `voter_session_id`.

**This finding is why the audit exists.** Prod, test and the migration files all agree on this
policy. Nothing drifted. All three existing drift checks compare those three sources against each
other, so a wrong-from-the-start policy is invisible to every one of them.

### F7 / F8 — prod-only column grants, structurally invisible to a test-only audit · PROD · REPRODUCED

```
env=PROD  role=anon  read-only GET      control (bogus column) -> 400, discriminating
clarity_verifications.session_id          200, 8 rows, 8 non-null session ids
event_room_members.comprehension_rating   200, 4 rows, 1 real rating (value 5)
```

`comprehension_rating` is a private self-reported score — the same data class as
`readiness_value`, which was deliberately revoked from `anon` on 2026-08-21. Its sibling column was
left granted in prod.

**Test refuses both.** Every convention in this repo says probe test rather than prod, and an audit
following that convention would have reported both clean. They are false negatives reachable only
by diffing prod against test — which is why the spec's Invariant demands the three-way diff first.

### D-3 — test/prod grant divergence, and a migration recorded as applied that did not take effect

`event_room_members.readiness_value` is readable by `anon` on **test** although the current
migrations revoke it; `comprehension_rating` is refused on test although the migrations grant it.
The live test grant set is neither a superset nor a subset of the files — it is a different set.

**Prod is correct on this table**, matching the files exactly. So D-3 is not a production
vulnerability. Its significance is methodological: `supabase_migrations.schema_migrations` on test
and `supabase/deploy-manifest.json` both record `20260821120000` and `20260821170000` as applied,
and the database disagrees with both. A migration ledger that says "applied" is not evidence the
grants took effect, and nothing in the repo currently checks the difference.

**Divergence, bounded** — column-level SELECT grants to `anon`/`authenticated`:

| Direction | Entries | Substance |
|---|---|---|
| Prod more permissive (security-relevant) | 4 | F7, F8 |
| Test more permissive | 38 | `worktree_status`, `point_references` (test-only tables), `event_private_info` x3, `events` x3, `readiness_value` |

Six tables disagree: `clarity_verifications`, `event_private_info`, `event_room_members`, `events`,
`point_references`, `worktree_status`. The other 878 of 882 prod grants match, so the test-derived
findings below stand with those six carved out.

### F2–F4 — test-confirmed reaches
- `transcribe_rooms`: `SELECT TO authenticated USING (true)` — any user reads all room join `code`s.
- `witnesses.witness_linkedin_url` anon-readable — the same data class P877 deliberately revoked on `profiles`.
- `story_verifications`: anon reads both party uuids **and** their private ratings of each other.

### F5 — the gate chosen to host the standing control is itself bypassable · STILL-OPEN (P1044)
`scripts/check-rls-scope.py`, exercised against 10 fixtures:
- annotation smuggling via string / block comment / dollar-quote — all exit 0
- misses `((true))`, `true::boolean`, `1=1`, `NOT false` — all exit 0
- a genuine violation exempted by a real annotation prints the byte-identical `ok:` line as a clean
  file, so a reviewer cannot tell them apart
Controls: `baseline_true` exit 1, `clean` exit 0 — the probe is not blind.

## Backlog specs

P1044 **STILL-OPEN** (above, reproduced). P1045, P1054, P1059, P1100 reported by the backlog lens;
verdicts pending transcription of its truncated sections before any is marked closed. Per Non-Goals,
none may be closed without evidence against the artifact.

## Decision Criterion 1 — answered

**No.** The agent API is not safe to build on this surface as it stands. D-1 is live and reachable
by anyone holding a key that ships in the browser bundle. F0a leaks real personal data from
production today. F7/F8 leak private per-user scores and session identifiers from production, and
were invisible to every test-based probe. F0b is a token-to-session chain
prevented only by expiry timing. F6 is a privilege RLS cannot govern on 49 production tables.

Every fix is a **narrowing**, which the Invariants require be reported rather than auto-applied.
None were applied. Nothing was written to any database in either environment; no exploit was run.

---

# Phase 2 — corrections to Phase 1, and what was actually fixed

Written 2026-09-01, after taking each approved fix to the code it would change. **Three of the
four approved fixes did not survive that contact.** Recorded here in full, because a security
audit that only records the findings it liked is the failure mode the spec's Invariants exist to
prevent.

## F8 — RETRACTED. Not a defect; a deliberate, shipped design.

Phase 1 read `event_room_members.comprehension_rating` as the overlooked sibling of
`readiness_value`, which was deliberately revoked from `anon` on 2026-08-21. That reading is
wrong, and three independent artifacts say so:

1. `20260821170000_p1114_room_readiness_distribution.sql:43` names `comprehension_rating`
   **explicitly** in the re-issued column grant. It was kept in the same statement that removed
   `readiness_value` — a deliberate inclusion, not an omission.
2. `EventRoomMeet.tsx:160-175` renders `member.comprehensionRating` beside the member's name.
   Revoking it would have broken a shipped, visible feature.
3. `e2e/integration/p1114-db-schema.spec.ts:155-158` asserts the column **must** be anon-readable,
   with a comment saying so.

The two columns are opposite by design, and the migration's own header says it: the roster is
public **by name** (a facilitator reads it off a projected screen); readiness is an **anonymous**
distribution. Those two contracts cannot share one row, which is why one column left the grant and
the other stayed. Phase 1 classified on data sensitivity and missed the design contract.

This is the Invariant working as written — *"a privilege narrowing is presumed intentional and is
reported, never auto-applied."* The same presumption has to run in the other direction: a
**grant** that a migration names explicitly is intentional too.

## F1 — CONFIRMED live, but reclassified: a documented accepted risk, now superseded.

The policy is exactly as Phase 1 measured (`roles={public} qual=true with_check=true`,
re-verified on prod 2026-09-01). What Phase 1 missed is that
`20260211_tighten_idea_feed_rls.sql:26-38` created it **deliberately**, with a written rationale
and a `COMMENT ON POLICY` recording the limitation in the database itself. It was a knowing
trade-off, correctly documented in place — not an oversight.

It is still fixed, on different grounds. P1139 established that the whole idea-feed family is dead
code and dropped its INSERT policies on that basis; re-verified here rather than taken from
P1139's claim (whole-repo grep: `voteOnIdea`, `getIdeaVoters`, `getVoteHistory` have zero callers
outside their own definitions). The app-layer enforcement the 2026-02-11 comment relied on no
longer exists, so the accepted risk is superseded rather than contradicted. Fixed by
`20260901100100_p1207_drop_idea_votes_update_policy.sql`.

**Phase 1's claim about F1 stands and is the audit's strongest result:** prod, test and the files
all agree on this policy, so every drift check — all three of which compare those three sources
against each other — is structurally blind to it. A wrong-from-the-start policy is not drift.

## F7 / F0 — reclassified: the same root cause as F6, not separate column-grant defects.

Phase 1 described F7 as a *"prod-only column grant"*. The prod catalog says otherwise:
`clarity_verifications` and `clarity_agreements` carry no column-level carve-out at all. Both hold
the blanket table-level `GRANT ALL` from the default-privileges line — every column, both roles.
What is prod-only is the **absence of a REVOKE that test received**, which is D-3's ledger
divergence, not a distinct grant.

`clarity_verifications` SELECT is additionally governed by a policy reading
`"Verifications are viewable by everyone" cmd=SELECT roles={public} qual=true`. `session_id` is
reachable because that policy admits the row, so a column revoke would not be the fix; changing
what "viewable by everyone" means is, and that is a product decision.

**F0a and F0b are NOT fixed, and were not attempted.** Both need a design decision that was not in
the approved scope:

- `partner_email` cannot simply be revoked. `agreements-service-real.ts:429` filters on it
  (`.eq('partner_email', ...)`) and `:619` (`.ilike('partner_email', email)`) — PostgREST needs the
  SELECT privilege to filter on a column, so revoking it from `authenticated` breaks the incoming-
  invitation flow outright. Revoking from `anon` alone closes the anonymous leak but leaves the
  authenticated-stranger leak, because the exposure is the RLS policy's unconditional
  `visibility = 'public'` branch, and Postgres RLS is row-level — it cannot withhold a column.
- `invitation_token` has the same shape. `getIncomingInvitations` issues `select('*')`, which
  PostgREST expands to every column and fails wholesale if one is revoked.

The real fix for both is to route these reads through a `SECURITY DEFINER` RPC that returns the
public projection without the capability column — the pattern this repo already uses for
`get_room_readiness_distribution`. That is a build, not a revoke, and it needs the founder.

**F0a remains live in production.** Real email addresses on public agreements are readable by
anonymous visitors today.

## F6 — FIXED, and it was larger than Phase 1 measured.

Re-measured on prod 2026-09-01: `TRUNCATE` and `TRIGGER` at **50** tables each per role and
`REFERENCES` at 50 — not the 49 Phase 1 recorded. `MAINTAIN` is 0 on existing tables, confirming
Phase 1's control, **but** the live `pg_default_acl` entry is `arwdDxtm`: the `m` is granted to
every future table. Phase 1's control was right about today and would have gone stale on the next
`CREATE TABLE`. The fix revokes `MAINTAIN` from the default as well.

**A bound the fix cannot reach, stated rather than papered over.** There are two default-ACL
entries for tables in `public`: one owned by `postgres` and one owned by `supabase_admin`. Our
migrations run as `postgres` and can only alter the first. The `supabase_admin` entry still grants
all four privileges, so a table created by that role would still inherit them. Tables this repo
creates use the `postgres` entry, so the fix is sufficient for our schema — but it is not a
schema-wide guarantee, and the canary prints this as a `note:` on every run rather than hiding it
behind a green exit code.

## The standing control

`scripts/check-p1207-privilege-floor.py [test|prod]` — read-only, SELECT only. Asserts the F6
privilege floor (table grants **and** the postgres-owned default ACL) and that
`clarity_idea_votes` has no unconditional UPDATE policy. Exercised both directions per gate 7:

```
before migrations, test:  exit 1  — "FAIL: 315 privilege-floor violation(s)"
after  migrations, test:  exit 0  — "ok: no TRUNCATE/REFERENCES/TRIGGER/MAINTAIN to anon or
                                     authenticated in schema public; clarity_idea_votes UPDATE
                                     is not unconditional"
```

It is deliberately **not** wired into `pre-commit-checks.sh`: it requires network and a management
token, and a commit gate that fails when offline is a gate people learn to bypass. It is a
per-environment check, run against prod after the prod apply.

## Regression evidence

- `npm test` — 3445 passed, 19 skipped, 302 files. No failures.
- Integration specs on the affected tables — 24 passed, 1 failed.

**The one failure is pre-existing and is finding D-3, not a regression.**
`p1114-db-schema.spec.ts:158` asserts `comprehension_rating` is anon-readable; test refuses it
(`42501 permission denied`). Phase 1 measured that exact divergence on test **before** any
migration was written, and the post-migration column-grant set is byte-identical to that
measurement — `readiness_value` granted, `comprehension_rating` absent, inverted from the files.
Neither migration contains the word `SELECT`, so neither could have caused it. The failing test is
independent evidence for the F8 retraction above: it exists because the grant is deliberate.

## Still open after Phase 2

| Finding | State |
|---|---|
| D-1 open email relay | Fixed in source; **still deployed to prod** until the function is deleted from the platform |
| F0a real emails readable by anon | **LIVE.** Needs the RPC-projection build above |
| F0b invitation token → session chain | **LIVE**, blocked only by expiry timing |
| F6 TRUNCATE class | Fixed on test; **prod apply still pending** |
| F1 unconditional vote UPDATE | Fixed on test; **prod apply still pending** |
| F7 `clarity_verifications.session_id` | Policy-level, needs a product decision |
| F2–F4 | Untouched |
| F5 / P1044 `check-rls-scope.py` bypassable | Untouched, STILL-OPEN |
| D-2 signed-URL session authorization | Untouched, not reproduced |
| D-3 migration ledger says applied, DB disagrees | Untouched; now has a failing test as a live marker |

## Phase 3 — adversarial review of the Phase 2 commit

An independent reviewer (codex, `--sandbox read-only`) was pointed at the four artifacts of
commit `9ca4c73a` and explicitly told **not** to read this document or the commit message, so it
read the code rather than checking my reasoning. Five defects were reported. Each was re-run as a
command before being accepted or rejected — a reviewer's claim is not evidence until it is.

| Claim | Verdict | Evidence |
|---|---|---|
| Grants held via the `PUBLIC` role survive the revoke | **REFUTED as live** | `table_privileges` where grantee not in the four known roles → `[]`. No table grants anything to `PUBLIC`. Still a blind spot in the canary; now checked. |
| Column-level `REFERENCES` survives a table-level `REVOKE` | **REFUTED as live** | Postgres tracks them separately, so the mechanism is real, but `column_privileges` for the four privileges → 0 rows post-migration. Still a blind spot; now checked. |
| The canary's unconditional-predicate regex is defeatable | **CONFIRMED** | `true AND true`, `NOT false`, `2 > 1` all passed an allowlist that matched only bare `true`. |
| `with_check` is fetched and never examined; `cmd='ALL'` is not checked | **CONFIRMED** | Both true on read. A `FOR ALL` policy applies to UPDATE, and permissive policies are OR-ed. |
| The integration spec would pass on a database where the migration never ran | **CONFIRMED** | `expect(data).toEqual([])` passed for any reason the write was blocked. |

**The regex finding is the important one, and it is P1044 reproduced in a fresh artifact.** F5
records that `check-rls-scope.py` is bypassable by exactly this class of predicate. I then wrote a
new control with the same defect, in the same session, in the file whose purpose was to be the
standing control. Enumerating the ways a predicate can spell "true" is unwinnable.

**Fixed by inverting the test.** Rather than recognising unsafe predicates, the canary now
requires a safe one: any PERMISSIVE `UPDATE` or `ALL` policy on `clarity_idea_votes` whose `qual`
or `with_check` never references `auth.uid()/email()/jwt()/role()` is flagged, whatever it is
spelled like. A predicate that cannot consult the caller cannot distinguish callers. The canary
also now reads `column_privileges`, `PUBLIC` table grants, and the empty-grantee form a `PUBLIC`
entry takes in a default ACL.

**The detector is control-tested offline, and the control ships with it** —
`check-p1207-privilege-floor.py --self-test`, no network or token required:

```
self-test ok: 11 known-bad predicates flagged, 4 known-good predicates passed,
PUBLIC ACL entry detected — the detector discriminates
```

The 11 known-bad are every evasion the reviewer supplied plus the annotation-smuggling and cast
forms P1044 documents. The 4 known-good are real identity-scoped predicates from this schema, and
they exist to measure the false-positive rate — a fixture containing only inputs the gate should
reject leaves that rate unmeasured.

**Spec fix.** `error === null` is now asserted alongside the empty result set. The two are
different mechanisms and are distinguishable: a revoked UPDATE *grant* returns `42501 permission
denied`, while RLS row-invisibility returns no error and an empty set. Measured directly against
test before writing the assertion. Pinning `error === null` pins the mechanism, so the test can no
longer pass on a database where this migration never ran but something else blocks the write.
