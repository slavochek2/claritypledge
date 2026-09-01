---
status: week
type: task
rank: 1000066
workstream: infrastructure
created_date: '2026-09-01'
tags: [security, dependencies, edge-functions, migrations]
delivery_stage: create-spec
pipeline_ran: [create-spec]
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

- [ ] `npm audit --omit=dev` reports 0 high/critical for `react-router*` and `ws`
- [ ] Unit test rejects every advisory vector and accepts the allowlisted happy paths
- [ ] Catalogue query on TEST shows `search_path` in `proconfig` for all four functions
- [ ] `gcs-signed-url`: non-participant → 403, bad code charset → 400, participant → forwarded
- [ ] Full `vitest`, `tsc`, `eslint`, `npm run build`, pre-commit checks green
