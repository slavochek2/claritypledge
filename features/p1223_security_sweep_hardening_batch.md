---
status: week
type: task
rank: 1000066
workstream: infrastructure
created_date: '2026-09-01'
tags: [security, dependencies, edge-functions, migrations]
delivery_stage: ship
pipeline_ran: [create-spec, inline, ship]
drafted_by: opus
exec_model: opus
exec_effort: high
driver: anomaly
---

# P1223: Security sweep hardening batch (2026-09-01)

## Problem

The 2026-09-01 general security sweep (`.private/docs/security-log.md`, entry of that date —
mechanics live there, not here) produced three findings small enough to close in one branch. Each
is a missing guard in front of an existing, otherwise-correct mechanism:

1. **Dependencies.** `react-router-dom@7.13.0` carries 12 published advisories (open redirect via
   `\` / `//` path forms, RSC/SSR issues); a transitive `ws` 8.x has two high advisories. The app's
   own post-auth redirect allowlist rejects `//` but not the backslash form.
2. **`search_path`.** Four `SECURITY DEFINER` functions have no pinned `search_path`.
3. **Signed upload URLs.** The edge function that mints a GCS upload URL verifies the caller has
   a JWT, but not that the caller belongs to the session or room whose prefix they name, and it
   forwards the path segments without a charset check.

## Appetite

Blast radius: low-medium — the dep bump touches every route (declarative `<BrowserRouter>` mode,
no `unstable_*` APIs in use); the other two touch one edge function and four DB functions.
Reversibility: git revert for code; the migration is `ALTER FUNCTION … SET`, reversible with
`RESET`. Decision density: zero — every fix restores an existing invariant.

## Solution

1. Bump `react-router-dom` to the first version past all listed advisories; `npm update ws`.
   Harden the auth-callback redirect allowlist so any path containing a backslash, or whose
   second character is `/` or `\`, is rejected before the prefix check. Unit test with the exact
   vectors from the two open-redirect advisories.
2. One migration pinning `search_path` on the four functions, with a DO-block positive control
   that asserts `proconfig` for all four.
3. `gcs-signed-url`: after the JWT check, resolve the named prefix to a `clarity_sessions` row
   (6-char code) or a `transcribe_room_members` row (`rooms/<code>/<who>-<memberId>`), require the
   caller to be a participant/member, and enforce a strict charset on code, fileName and
   contentType before forwarding. Guest joiners never reach this function (no JWT → 401 today),
   so binding to profile ids changes nothing for them.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| Room uploads use a multi-segment prefix, not a bare code | MITIGATE | Both shapes are parsed and authorized; a bare-code-only check would break `/transcribe` |
| Cloud Function source (path sanitisation) is outside this repo | ACCEPT | Charset check here bounds what it can receive; its own sanitisation stays unverified |
| Test-project edge function must be redeployed for the e2e cases to pass | DEFER | Deploy is a separate, human-approved step |

Non-Goals: do NOT touch G1/G2/G3/G7/G8 from the sweep (own specs); do NOT change `patch_live_state`;
do NOT refactor the upload client.

## Done-When

- [x] `npm audit --omit=dev` reports 0 high/critical for `react-router*` and `ws`
- [x] Unit test rejects every advisory vector and accepts the allowlisted happy paths
- [x] Catalogue query on TEST shows `search_path` in `proconfig` for all four functions
- [x] `gcs-signed-url` handler: non-participant → 403, bad code charset → 400, participant → forwarded — proven at the handler level with fakes (`handler.test.ts`, 20/20)
- [ ] The same three cases proven over HTTP against the TEST project — BLOCKED: the deployed
      `gcs-signed-url` on test is the pre-P1223 build (v12, last updated 2026-04-21; its eszip
      carries only `index.ts` and none of `handler.ts` / `validate.ts`). Unblocking needs a
      human-approved `supabase functions deploy gcs-signed-url --project-ref <test-ref>`, after
      which `npx playwright test --project=integration e2e/integration/p1223-gcs-signed-url-authz.spec.ts`
      is the check. No deploy was performed.
- [x] Full `vitest`, `tsc`, `eslint`, `npm run build`, pre-commit checks green

## Evidence (2026-09-03, worktree w18 @ `0ab09246`)

### 1. `npm audit --omit=dev` — react-router / ws

```
$ npm ls react-router-dom react-router ws --omit=dev
├─┬ @supabase/supabase-js@2.84.0
│ └─┬ @supabase/realtime-js@2.84.0
│   └── ws@8.21.3
└─┬ react-router-dom@7.18.3
  └── react-router@7.18.3

$ npm audit --omit=dev
found 0 vulnerabilities                      # exit 0

$ npm audit --omit=dev --json | (filter for ^react-router / ^ws)
matching packages: []
total high: 0 critical: 0
```

Probe control (the audit is not blind): `npm audit` **with** dev deps on the same tree reports
`26 vulnerabilities (2 low, 6 moderate, 16 high, 2 critical)`. The prod-only zero is a real zero.

### 2. Redirect allowlist unit test

```
$ npx vitest run src/tests/p1223-redirect-allowlist.test.ts
 ✓ src/tests/p1223-redirect-allowlist.test.ts (56 tests) 9ms
 Test Files  1 passed (1)
      Tests  56 passed (56)
```

Both directions are covered: 7 advisory vectors from GHSA-wrjc-x8rr-h8h6 / GHSA-2j2x-hqr9-3h42
(plus their allowlisted-tail variants) must be rejected, and 16 real `?redirect=` producer targets
grepped out of `src/` must be accepted.

Discrimination control (gate 7 — the assertions bind the new guard, they are not vacuous). Running
`main`'s prefix-only predicate over the same strings:

```
"/events/\\evil.com"  prefix-only-guard(main) accepts = true    ← now rejected
"/events/\evil.com"   prefix-only-guard(main) accepts = true    ← now rejected
"/live/\evil.com"     prefix-only-guard(main) accepts = true    ← now rejected
"/point/abc-123"      prefix-only-guard(main) accepts = false   ← now accepted (trailing-slash root bug)
"/p/alice"            prefix-only-guard(main) accepts = false   ← now accepted
```

### 3. `search_path` on the four SECURITY DEFINER functions — TEST project (`gfjctyxqlwexxwsmkakq`), read-only

```sql
select p.proname, p.prosecdef, p.proconfig from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.proname in ('create_transcription_job','expire_stale_sub_rooms',
                     'retry_transcription','update_last_activity')
 order by p.proname;
```

```json
[{"proname":"create_transcription_job","prosecdef":true,"proconfig":["search_path=public"]},
 {"proname":"expire_stale_sub_rooms","prosecdef":true,"proconfig":["search_path=public"]},
 {"proname":"retry_transcription","prosecdef":true,"proconfig":["search_path=public"]},
 {"proname":"update_last_activity","prosecdef":true,"proconfig":["search_path=public"]}]
HTTP:201
```

Probe control: the same query shape returns `proconfig: null` for functions that have none
(`array_to_halfvec`, …), so a missing pin would have shown as `null` rather than as a false pass.
Population check on TEST: 92 `SECURITY DEFINER` functions in `public`, 0 without a pinned path.

### 4. `gcs-signed-url` — handler level (all branches, no deploy)

```
$ deno test --allow-net=deno.land supabase/functions/gcs-signed-url/handler.test.ts
running 20 tests from ./supabase/functions/gcs-signed-url/handler.test.ts
...
400 on a sessionCode outside the charset — before any DB read ... ok
403 when the caller is signed in but not a participant of the session ... ok
creator is forwarded with the exact body shape the Cloud Function expects ... ok
403 when a participant requests the OTHER participant's object names ... ok
room prefix: the named member is forwarded; anyone else is 403 ... ok
validators admit every shape the client produces ... ok
ok | 20 passed | 0 failed (18ms)
```

`index.ts` is a thin `Deno.serve` over `handleGcsSignedUrl`, so this exercises the shipped path.

**What is NOT proven here** (the unticked item above): the same behaviour over HTTP against the
deployed function. TEST still runs the pre-fix build — Management API reports `gcs-signed-url` v12,
`updated_at 2026-04-21T11:45:31Z`, and its deployed eszip contains `functions/gcs-signed-url/index.ts`
only, with `handleGcsSignedUrl` / `parseUploadTarget` / `isValidFileName` all absent (0 matches) while
the pre-fix `sessionCode` / `GCS_CLOUD_FUNCTION` strings are present.

### 5. Full gate run

| Command | Exit | Result |
|---|---|---|
| `npx vitest run` | 0 | 305 files passed, 2 skipped; **3541 tests passed**, 19 skipped |
| `npx tsc --noEmit` | 0 | no output |
| `npx eslint .` | 0 | no output |
| `npm run build` | 0 | built in 7.83s, PWA precache 56 entries |
| `./scripts/pre-commit-checks.sh` | 0 | `✓ All checks passed` |
