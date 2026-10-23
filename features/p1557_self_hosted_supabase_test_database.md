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

**Blast radius:** high for development, none for users. Every session's testing moves to the new
server. Production is not touched.

**Reversibility:** high until the repoint, which is one env change plus the files that name the TEST
ref. The hosted TEST project stays untouched and switchable-back throughout (P1538 kept its old env
files backed up privately, the same pattern applies).

**Decision density:** a few founder calls, marked below.

## Solution

1. **Server.** One Google Cloud VM running the official self-hosted Supabase Docker stack (Postgres,
   auth, REST, realtime, storage, edge runtime, gateway). It lives in the same Google project as the
   existing VMs, in the region nearest prod. `[FOUNDER DECISION: region. The default is Singapore,
   the same as prod and Mira. Machine size: measured, not guessed. See Cost Budget.]`
2. **Reachable over HTTPS on a hostname** so browser e2e, auth redirects and edge-function calls work
   from the Mac and from worktree dev servers. Studio and Postgres are never exposed publicly.
   `[FOUNDER DECISION: hostname]`
3. **Schema and config parity with the hosted TEST project.** Apply the repo's migrations. Load the
   auth settings, email templates and redirect list. Deploy every edge function with its
   `verify_jwt` setting and secrets. Where self-hosted cannot match the hosted platform, list the gap.
   Never paper over it.
4. **Test-only identity.** Every guard that decides "this is TEST, not prod" recognises the new
   server and nothing else new. That covers the URL check the e2e runner uses and the JWT-claim check
   in the e2e purge function (`_e2e_purge_allowed`, which today matches project refs). Prod must
   still be refused everywhere.
5. **Prove, then repoint.** Run the suites against the new server **in parallel** with the hosted
   TEST project, without switching anything. Repoint only after the founder approves the proof.
6. **Recipe.** Once proven, the server gets a recipe in the pp recipe system (`scripts/recipes/`,
   proof snapshot plus weekly drift check), the same pattern as Linked Helper and Mira. That covers
   rebuild-from-zero steps, inputs, and what is restore-only.
7. **Maintenance.** Daily: /day's existing TEST health check (`cp.testdb`) reads the new URL, plus
   disk and container health. Weekly: drift against the proven recipe, plus whether the Supabase
   images are behind. Patching: a documented update procedure (pull pinned image versions, re-prove
   with a canary subset) that an agent can run and the founder never has to. Backups: test data is
   disposable, so the recipe must rebuild the server from zero. A disk snapshot schedule is
   optional. `[FOUNDER DECISION: snapshot yes/no. Small cost on credits.]`

## Invariants

- **Production is never touched.** No prod data, no prod keys and no prod secrets ever reach this
  server. Nothing in this work changes the prod project, its organisation or its plan.
- **Every TEST/prod guard still refuses prod.** Widening a guard to accept the new server must not
  widen it to anything else. Prove it with a control: the prod URL and prod-style claims are still
  refused.
- **The hosted TEST project keeps working until the founder approves the repoint.** Building in
  parallel means no session's testing changes before that.
- **Nothing is installed on the founder's Mac** without asking. Installing Docker and Supabase on
  the new VM was approved by the founder on 2026-10-23.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| Self-hosted behaves differently from hosted (edge runtime, auth config, realtime, platform-only extensions in 12 migrations) | MITIGATE | Parity checklist in step 3. Any suite that passes on hosted and fails on self-hosted is listed with its cause before the repoint decision |
| The guards that recognise TEST by project ref (`_e2e_purge_allowed`, `isTestProjectUrl`, 35 tracked files naming the ref) fail closed or, worse, open | MITIGATE | Invariant 2, plus a control against prod. Change only the guards the suites need |
| A public HTTPS endpoint exposes a database API | MITIGATE | Only the gateway is public. Studio and Postgres stay bound to the VM or reachable over IAP. Self-generated keys, never reused from any hosted project. The service-role key lives where the current TEST service-role key lives |
| The repo's 464 migrations do not apply cleanly to an empty database | MITIGATE | First build step. If they don't, restore a schema dump of hosted TEST instead, and record why |
| The VM itself becomes the next single point of failure | ACCEPT | The hosted TEST project remains the fallback until it is retired by a separate founder decision |
| Credits run out or expire | DEFER | The amount and expiry are kept private. Read them before sizing. If credits cannot cover the VM, stop and report before repointing |
| Login with Google on TEST (auth canary) needs OAuth client config | MITIGATE | Part of the parity checklist. If it can't be done, the canary stays on hosted TEST and that is recorded |

**Non-Goals**
- Do NOT move production off hosted Supabase. That is a separate decision, not this spec.
- Do NOT upgrade, pause, downgrade or delete any Supabase project or organisation (P1530 owns that).
- Do NOT change app code to suit self-hosting. A difference that needs app changes is a finding,
  not a fix.
- Do NOT retire the hosted TEST project in this spec.

## Cost Budget

Compute Engine is a new metered service. Its row is added to the registry in
`docs/technical/metered-services.md` in the same change, with prices read from the pricing page on
the day, not from memory.

| Measure | Per user | Per hour | Per test run |
|---|---|---|---|
| Requests | n/a (no users) | n/a | unchanged from today: same suites, different host |
| Egress (bytes) | n/a | Mac ↔ VM test traffic: measure one full run, then `bytes per run x runs per day` | measured on the first full run |
| Log lines | n/a | container logs on the VM disk, rotated | n/a |
| Service unit: VM hours × registry price | n/a | `1 VM x 730 h/month x hourly price for the chosen type` (filled in at sizing) | n/a |

1. **Fits the limit today?** Paid from credits. The arithmetic against the remaining credit is kept
   private (`.private/docs/usage/`).
2. **Fits at 10x?** More sessions means a bigger machine type. That is a resize, not a redesign.
3. **Out of pocket:** €0 while credits last. This must be true for the repoint to happen.

## Pre-deploy Checklist

- [ ] New JWT secret, anon key and service-role key generated on the VM. The anon and service-role
      keys are stored where the current TEST keys live (`.env.local` / keychain per
      `docs/technical/credential-keyring.md`), and that map is updated.
- [ ] Edge function secrets for TEST copied to the self-hosted edge runtime (names only in any
      public file).
- [ ] Postgres and dashboard passwords set and stored privately.

## Done-When

- [ ] The VM serves Supabase over HTTPS at the chosen hostname. Studio and Postgres are not
      reachable from the public internet: an outside probe is refused.
- [ ] Every repo migration (or a documented schema restore) is applied. A schema diff against hosted
      TEST shows no unexplained difference.
- [ ] Every edge function is deployed and answers a health call.
- [ ] The integration suites and a named e2e set pass against the new server, with the same results
      as hosted TEST. Every difference is listed with its cause.
- [ ] **Load proof:** a migration applied while a full e2e run is going does not take the API down.
      This is the failure that started this, reproduced on hosted TEST on 2026-10-22/23.
- [ ] Guard control: prod URL and prod claims are still refused by every widened guard. Pasted
      output.
- [ ] /day `cp.testdb` reads the new server (after the repoint) and flags it when it is down.
      Proven by stopping the gateway once.
- [ ] Recipe written and proven in the pp recipe system: rebuild from zero, inputs, a weekly drift
      check, and an update procedure an agent can run.
- [ ] Cost: registry row added, VM cost per month written privately, credits confirmed to cover it.
- [ ] Founder approves the repoint. After it, no tracked file names the hosted TEST ref as the
      active test target (history excepted).

## Alternatives Considered

- **Upgrade the hosted TEST organisation to paid and enlarge its compute.** Rejected by the founder:
  a new out-of-pocket subscription for a test database.
- **Move TEST back into the paid production organisation.** Rejected: test and prod would share
  usage limits again, and test traffic caused most of the earlier over-limit usage (P1530).
- **Point testing back at the old hosted TEST project.** Rejected: it has had no migrations since
  2026-10-21 and is the same compute size.
- **Move production off Supabase.** Out of scope. It is weeks of work, and today's outage was
  capacity, not Supabase.

## Rollback Strategy

Until the repoint, there is nothing to roll back. After it, restore the backed-up env files and
revert the repoint commit. The hosted TEST project is unchanged and takes traffic again.

## Open Questions

1. Do Supabase's self-hosted images include every extension the migrations use (`pg_net`, vault,
   `pg_cron`)? Unverified.
2. How was hosted TEST's schema built in P1538: migrations from zero, or a dump? Unverified. It
   decides step 3.
3. Does any test depend on hosted-only features (platform logs, management API, project-ref
   claims)? A grep at build start answers it.

## Related

- [P1546](../docs/decisions.md): 2026-10-22, the test project falls over on schema reload
- [P1538](done/2026-06-10/p1538_rebuild_test_project_in_own_org.md): the TEST project in its own
  organisation
- [P1541](done/2026-06-10/p1541_test_db_capacity_guard_for_concurrent_e2e.md): e2e capacity lock
- [P1532](p1550_p1532_full_e2e_run_user_count_proof.md): e2e user purge guard (by project ref)
- [P1530](p1530_supabase_log_ingestion_and_egress_before_restriction.md): Supabase org plan and quota
- P1524 / P1525: /day TEST latency check and usage reader
