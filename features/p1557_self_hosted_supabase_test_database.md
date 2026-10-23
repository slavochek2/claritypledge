---
status: week
type: task
rank: 67
workstream: infrastructure
created_date: '2026-10-23'
tags: [supabase, test-db, self-hosted, gcp]
disclosure: public
delivery_stage: create-spec
pipeline_ran: [create-spec]
drafted_by: opus
exec_model: sonnet
exec_effort: high
driver: anomaly
---

# P1557: Run the TEST database as self-hosted Supabase on a Google Cloud server

## Problem

**Situation:** Every session's e2e and integration runs share one hosted TEST project, which sits on
Supabase's smallest compute size. Production is a separate project in a separate organisation and is
healthy.

**Complication:** The TEST project keeps falling over under our own load. On 2026-10-22 its REST API
answered 503 for about an hour after one migration: schema-cache queries took up to 6.3 s against an
8 s statement timeout (decisions.md 2026-10-22, P1546). A full e2e run at 3 workers held it at 97-99%
CPU (decisions.md 2026-10-23, P1532). On 2026-10-23 it went down again for hours, with REST 503/504 and
auth timing out, while Supabase's status page read "All Systems Operational" and production answered
in 0.3 s. That day 7 migrations reached it from three features, with several sessions testing at
once. Every session that needs TEST stops. A bigger hosted size needs a paid plan, which is a new
out-of-pocket subscription. Google Cloud compute runs on credits the account already has.

**Question:** Can the TEST database run as self-hosted Supabase (Docker) on a Google Cloud server we
size ourselves, pass the suites the hosted TEST project passes, and be maintained without the founder
running it by hand?

> Founder, verbatim: "why not running our own verison of suapbase if it open source?"

> Founder, verbatim: "if i upgarde test i start payign and we are traped we went from 0 to 50 per month - and this is out of pociet"

> Founder, verbatim: "we also need to know how to mainitan, it , patch it etc.. which becoems part of /day routine to do it? or what?"

> Founder, verbatim: "when we do server after we prove its working we create a "recepie" (simialr like we created for linkedin helper, mira and other serviers.."

## Appetite

**Blast radius:** high for development, none for users. Every session's testing, the migration
tooling and the function-deploy tooling move to the new server. Production is not touched.

**Reversibility:** high until the repoint. After the repoint, hosted TEST falls behind with every
migration that reaches only the VM, so switching back needs the same catch-up P1538 did. The rollback
is rehearsed before the repoint (Done-When).

**Decision density:** two founder calls (below). Defaults are set, so the build does not wait on them.

**Review history:** the first draft was reviewed by Gemini 4 Argon, Codex (gpt-6.1-sol, high) and
Opus, 3 of 3 reports received on 2026-10-23. All three rejected it as written. Every load-bearing claim
folded in below was re-checked by command (file and line cited where it lives in this repo).

## Solution

Three phases. Phase 1 and 2 run overnight on a branch, in parallel with hosted TEST, and change
nothing any other session uses. Phase 3 follows the founder's approval.

### Phase 1: Build the server (nothing repointed)

1. **VM.** One Google Cloud VM in Singapore (same region as prod and Mira), in the existing Google
   project, with a **dedicated service account that has no roles**. Start at 4 vCPU / 16 GB and an
   SSD-backed disk. Supabase's Docker guidance recommends at least 4 cores / 8 GB, and the stack runs
   about a dozen containers next to Postgres. Measure under load before downsizing. Region default:
   Singapore. `[FOUNDER DECISION: region, if not Singapore]`
2. **Stack.** The official Supabase Docker stack at a **pinned release**. Logflare/analytics and vector
   are dropped. Logs go to Docker's rotating json-file driver with a size cap.
3. **Front door.** A deny-by-default reverse proxy (Caddy) terminates HTTPS. It allows only
   `/rest/v1/`, `/auth/v1/`, `/realtime/v1/`, `/storage/v1/` and `/functions/v1/`. Studio (`/`),
   `/pg/` and every admin path are refused at the proxy, whatever their own auth says. Kong,
   Postgres and the pooler bind to localhost only. The GCP firewall allows 80/443 only, and
   administration goes over IAP SSH. Hostname default: `<vm-ip>.sslip.io`, which gives a real
   Let's Encrypt certificate with no DNS change. `[FOUNDER DECISION: hostname, if a claritypledge.com
   subdomain is wanted instead]`
4. **Keys.** New JWT secret. Anon and service-role keys are minted with a **unique synthetic `ref`
   claim** for this server (never a hosted ref, never empty). Every secret is generated fresh: none
   from the upstream `.env.example`, and none copied from any hosted project.
5. **Schema and data: the P1538 restore, not a migration replay.** The migration chain cannot build
   from empty (decisions.md 2026-08-20 P1132; 2026-10-21 P1538, three duplicate version keys). Restore
   a private schema-only dump of hosted TEST, using the documented P1538 procedure: grant reset and
   replay, then objects outside `public` (storage buckets and policies, cron jobs, vault secrets,
   realtime publication, the `auth.users` trigger). Then record migration history so the next normal
   migration applies exactly once. The dump stays private and is never committed.
6. **Platform config.** GoTrue env: site URL, redirect list including worktree ports, email
   templates, SMTP, Google OAuth. `API_EXTERNAL_URL` and the functions' `SUPABASE_URL` resolve to the
   public HTTPS origin, so `getPublicUrl()` returns a browser-usable address. Today the stack's default
   returns `http://api-gw:8000/...` (Codex executed the SDK against it; 4 call sites in
   `supabase/functions`). Vault secrets point their URLs at this server, not at a hosted ref.
7. **Edge functions with per-function JWT policy.** The default Docker router has one global
   `VERIFY_JWT`. The repo deploys `create-and-sign` and `event-email-link` without JWT verification and
   the other 19 with it (`scripts/deploy-functions.sh:141-148`). The router must enforce exactly that
   split. Turning verification off globally is not parity.

### Phase 2: Make the tooling target it, then prove it (on the branch, nothing repointed)

8. **Test identity guards become an exact allowlist of origins, not a widened rule.** Every place
   that decides "this is TEST" accepts the hosted TEST origin(s) and this server's exact HTTPS origin.
   It rejects other schemes, ports, embedded credentials and suffixes. The places: `isTestProjectUrl`
   (`e2e/helpers/e2e-namespace.ts:22`), which also gates the P1541 one-run lock
   (`playwright.config.ts:49`), the user pool and global teardown (`e2e/global-teardown.ts:20`). Also
   the copied origin checks in `p1515`, `p1491`, `seed-p1508-canvas*.mjs` and `video-summary.mjs`
   (substring check). **If the lock does not recognise the new server it silently switches off. That
   is the overload that started this.**
9. **Purge guard.** `_e2e_purge_allowed` adds the synthetic `ref` to its exact list in a new
   migration. Prod cannot sign that claim, because only this server's secret can. Nothing that
   accepts a missing ref, any non-prod ref, or a header.
10. **Tooling has a self-hosted path, with no silent fallback to hosted.** That covers `migrate.sh` (it
    calls the Management API at 5 points and `supabase db push` against the linked project), function
    deploy, the secrets check, and `supabase-readonly-sql.py`. It also covers the 5 integration
    specs that run SQL through `api.supabase.com` (p1491, p1515, p1222, p506, p520). For those,
    use a direct database connection over the IAP tunnel, or a service-role SQL function that exists
    only on this server.
11. **Proof.** Run per test, one worker, on hosted TEST (when it is up) and on the new server, and
    compare **pass, fail and skip** per test. A test that runs on hosted and skips on the new server
    counts as a failure (p1222:383 and p506 skip when the Management API is absent). Before running,
    declare the capabilities that must work: email sign-in and link consumption, Google sign-in
    callback, a realtime change event plus refusal of an unauthorised subscription, storage bytes and
    signed URLs, a cron tick that fires `pg_net` into a function with the expected effect, and vault
    read across a restart.
12. **Load proof, the failure that started this.** A full e2e run at 3 workers, plus 5 DDL
    migrations applied one after another mid-run, plus a second concurrent session. A latency
    probe (`check-test-db-latency.sh` style) runs every 10 s throughout. **Pass:** zero REST/auth 5xx,
    p50 under 2 s, schema reload completing every time. CPU, memory, disk I/O and connections are
    recorded. The baseline comes from the 2026-10-22/23 records. Hosted TEST is never deliberately
    loaded to recreate it.
13. **Security proof from outside.** Over public HTTPS, by hostname **and** by raw IP:
    - Studio `/`, `/pg/`, Postgres and the pooler are refused.
    - Every function except the two open ones refuses a request with no token, a bad token or an
      expired token.
    - A service-role key minted with a prod-style ref, an empty ref or an unknown ref is refused
      by the purge guard.

### Phase 3: Repoint, recipe and upkeep (after founder approval)

14. **Repoint.** Env files, keychain, `.mcp.json`/`.codex/config.toml` (decide what agents use for
    TEST reads, since the hosted MCP cannot reach self-hosted). Also the auth canary
    workflow, `check-test-db-latency.sh`, and `vercel.json` CSP if previews must reach TEST
    (`vercel.json:248` allows hosted Supabase domains only). Rules files change only through
    `/slava:maintain:claude-md`. Hosted TEST stays alive but idle.
15. **Recipe** in the pp recipe system (`scripts/recipes/`): rebuild from durable inputs, pinned
    image versions, what is restore-only (the private dump, secrets), and a proof snapshot plus the
    weekly drift check, as for Linked Helper and Mira.
16. **Upkeep.**
    - **Daily (/day):** `cp.testdb` reads this server. It also checks disk and WAL use (warn over
      75%), container health and certificate expiry.
    - **Weekly:** recipe drift, upstream images behind the pin, OS security updates.
    - **Updates:** pull the next pinned release on a disposable clone first, run the proof subset,
      then apply. Never downgrade an image across a data-format change. An agent runs this; the
      founder never has to.
    - **No disk snapshots:** test data is disposable and the recipe rebuilds from zero. The private
      dump and secrets are kept off the VM.

## Invariants

- **Production is never touched.** No prod data, keys or secrets reach this server. Nothing here
  changes the prod project, its organisation or its plan.
- **Positive identity only.** A guard admits TEST by an exact origin or an exact synthetic ref that
  only this server's secret can sign. It never admits by absence, by "not prod", or by a
  caller-controlled value.
- **The one-run lock and teardown must recognise every TEST target.** A guard that returns "not TEST"
  for a real TEST server turns off the lock and the cleanup without any error.
- **No silent hosted fallback** in migrate, deploy or SQL tooling. A self-hosted call that fails
  must fail, not quietly hit hosted TEST.
- **Nothing changes for other sessions before the repoint.** Phases 1 and 2 live on the branch and
  the VM.
- **Nothing installed on the founder's Mac** without asking. Installing Docker and Supabase on the
  new VM was approved by the founder on 2026-10-23.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| A restore looks clean while permissions are wrong (P1538: green restore, 299 wrong ACLs) | MITIGATE | Catalog comparison of owners, ACLs, default privileges, RLS policies and security-definer functions, plus behavioural checks as anon, owner, unrelated user and service role |
| A capability works on hosted and silently not on self-hosted (realtime falls back to polling, cron no-ops on missing vault config) | MITIGATE | Declared capability list in step 11, each proven by its effect, not by a green suite |
| Public endpoint abused: signup floods, function cost, storage uploads | MITIGATE | GoTrue and proxy rate limits, request-size limits, connection caps. TEST-specific SMTP and AI keys, never prod ones. VM service account without roles |
| The VM becomes a single point of failure | ACCEPT | Recipe rebuild plus idle hosted TEST. Daily check catches an outage the next morning at worst; sessions notice sooner |
| Credits do not cover the VM or expire mid-way | MITIGATE | Full monthly cost (VM, disk, IP, egress) plus runway across every consumer of the same credits, written privately before the repoint. A billing budget only alerts and does not cap, so the stop is a /day check on runway |
| Google sign-in needs the new callback added in the Google console | ACCEPT | If only the founder can add it, that capability waits for the morning and is reported as waiting, not failed |
| Self-hosted Supabase upgrades break data between releases | MITIGATE | Pinned release; upgrades on a disposable clone first |

**Non-Goals**
- Do NOT move production off hosted Supabase.
- Do NOT upgrade, pause, downgrade or delete any Supabase project or organisation (P1530 owns that).
- Do NOT repair the from-zero migration replay (P1132 owns that).
- Do NOT change app code (`src/`) to suit self-hosting. Test tooling, guards and edge-function
  deployment are in scope. A difference that needs `src/` changes is a finding for the founder.
- Do NOT retire hosted TEST.

## Cost Budget

Compute Engine is a new metered service. Its row is added to `docs/technical/metered-services.md` in
the same change, with prices read from the pricing page on the day.

| Measure | Per user | Per hour | Per test run |
|---|---|---|---|
| Requests | n/a | n/a | same suites as today, different host |
| Egress (bytes) | n/a | measured | `bytes per full run` measured on the first full run, x runs per day |
| Log lines | n/a | container logs, capped by the json-file size limit | n/a |
| VM + disk + IP | n/a | `(VM hourly + disk/730 + IP hourly) x 730 = monthly` for the chosen type | n/a |

1. **Fits today?** Paid from credits. The arithmetic and runway are kept private
   (`.private/docs/usage/`).
2. **At 10x:** a bigger machine first, then measurement. Contention may not scale with size.
3. **Out of pocket:** €0 while credits cover it. Required for the repoint.

## Pre-deploy Checklist

- [ ] JWT secret and anon/service-role keys (with the synthetic ref) generated on the VM. Stored
      where the current TEST keys live, per `docs/technical/credential-keyring.md`, and that map
      updated.
- [ ] Postgres, dashboard and SMTP passwords generated and stored privately.
- [ ] TEST edge-function secrets set on the self-hosted runtime (names only in any public file).
- [ ] Google OAuth client allows `https://<host>/auth/v1/callback`.

## Done-When

- [ ] Outside probe over hostname and raw IP: Studio, `/pg/`, Postgres and the pooler are refused.
      Pasted output.
- [ ] Restore done; catalog comparison of ACLs, owners, default privileges, RLS and security-definer
      functions against hosted TEST shows no unexplained difference.
- [ ] `migrate.sh --only <file>` applies one new migration to the new server exactly once and
      records it. Prod targeting is unchanged (dry-run shown).
- [ ] Function deploy works against the new server. The two open functions accept an unauthenticated
      call, the other 19 refuse missing, bad and expired tokens.
- [ ] Every declared capability in step 11 is proven by its effect.
- [ ] Per-test comparison table (pass/fail/skip, hosted vs new). Every difference is resolved or
      listed for the founder with its cause.
- [ ] Load proof in step 12 passes, with probe output and resource numbers.
- [ ] Guard controls: prod origin, http scheme, extra port, suffix, empty ref, unknown ref and
      prod-style ref are each refused. The one-run lock engages against the new server.
- [ ] Monthly cost and credit runway written privately; registry row added.
- [ ] Rollback rehearsed once: env back to hosted TEST, one suite green, then forward again.
- [ ] Founder approves the repoint. `[post-deploy]` after it, /day `cp.testdb` reads the new server
      and flags it when it is down (proven by stopping the proxy once), and no tracked file names
      hosted TEST as the active target.
- [ ] Recipe proven in the pp recipe system, with the upkeep steps in step 16 wired into /day and the
      weekly routine.

## Alternatives Considered

- **Upgrade the hosted TEST organisation and enlarge compute.** Rejected by the founder: a new
  out-of-pocket subscription for a test database.
- **Move TEST back into the paid prod organisation.** Rejected: shared usage limits with prod, and
  test traffic caused most of the earlier over-limit usage (P1530).
- **Point testing back at the old hosted TEST project.** Rejected: no migrations since 2026-10-21,
  same compute size.
- **Replay all migrations from empty.** Rejected: known to fail (P1132, P1538).
- **Move production off Supabase.** Out of scope: weeks of work, and the outage was capacity.

## Rollback Strategy

Before the repoint, there is nothing to roll back; the VM can be deleted. After it, restore the
backed-up env files and revert the repoint commit. Any migration that reached only the VM is then
applied to hosted TEST once, with `migrate.sh`, before suites run there. This is rehearsed before the
repoint.

## Related

- [P1546](../docs/decisions.md): 2026-10-22, the test project falls over on schema reload
- [P1538](done/2026-06-10/p1538_rebuild_test_project_in_own_org.md): TEST rebuilt from a private dump
- [P1541](done/2026-06-10/p1541_test_db_capacity_guard_for_concurrent_e2e.md): e2e one-run lock
- [P1550](p1550_p1532_full_e2e_run_user_count_proof.md): e2e purge guard by project ref (P1532)
- [P1530](p1530_supabase_log_ingestion_and_egress_before_restriction.md): Supabase org plan and quota
- P1132: the migration chain does not build from empty
- P1524 / P1525: /day TEST latency check and usage reader
