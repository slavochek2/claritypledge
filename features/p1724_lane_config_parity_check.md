---
status: in-progress
type: task
rank: 355
workstream: infrastructure
created_date: '2026-11-24'
tags: [test-server, self-hosted, lanes, drift]
disclosure: public
delivery_stage: dev
pipeline_ran: [create-spec, dev]
drafted_by: opus
exec_model: opus
exec_effort: high
driver: anomaly
spec_review_hash: d57f000cc8648b52ee302b96b79dbcae9ab3f037c637f1ea15abd8d8d9ee3ff4
spec_review_vendors: [codex, gemini, openrouter]
---

# P1724: TEST lanes refuse to go live when their sign-in or mail settings differ from the main TEST server

## Problem

> Founder framing, verbatim (2026-11-24): *"Fix P1672 TEST lanes so they can never drift from the main
> TEST server again. Today (2026-11-24) lane1 was missing Google sign-in, the founder-only email relay
> and the production email templates."*

**Situation:** A P1672 TEST lane is a second Supabase stack on the TEST VM. `lanectl` builds its
config: `write_lane_env` copies the main lane's `.env` and replaces secrets, URLs and ports, and
`lane_yml` writes the lane's compose override by hand.

**Complication:** Anything the main lane gained in its own `docker-compose.override.yml` after
`lane_yml` was written never reached a lane, and nothing noticed. On 2026-11-24 lane1 (holding
P1658's test state) lacked three main-lane features at once:
- Google sign-in: the lane set it to `false` and blanked the client.
- The founder-only mail relay: the lane had no relay settings.
- Production e-mail designs: the lane had no template URLs.

Each was fixed by hand (`af3868662`, `36642d3d0`). The fixes were not env-only: auth and mail also had to
join a network with internet access, and auth needed a host entry to fetch the template URLs. One fix
attempt regenerated lane1's `.env` on the running lane, which replaced its secrets and broke sign-in. The
cause is structural: the lane config is an allowlist of what someone remembered, so every new main-lane
feature is silently missing.

A measurement while writing this spec found a fourth, older difference: main's `API_EXTERNAL_URL` (and
so auth's JWT issuer) is `<origin>/auth/v1`, while `write_lane_env` gives lanes the bare origin.

**Question:** How does `lanectl` find out, before a lane serves anyone, that its effective sign-in and
mail settings differ from the main lane's in a way nobody intended?

## Appetite

- **Blast radius: medium.** TEST infrastructure only (the VM's lane tool). A wrong gate either refuses
  every lane, or passes a drifted lane as it does today. Prod and hosted TEST are not touched. The main
  lane's files are not edited (`vm-install` re-runs its idempotent Caddy setup, as every install does).
- **Reversibility: high for the code, with one caveat.** `git revert` plus `lane.py vm-install` restores
  the old tool. A lane the gate already quarantined stays quarantined (functions stopped, cron off, no
  route) until its holder lifts it again (`lanectl lift`). Quarantine keeps all data.
- **Decision density: zero founder decisions.** The founder delegated the run end to end. The judgment
  calls (mail retention cap, lane1's grandfathered URL form, the shared Google client) are recorded with
  their reasons.

## Decisions already made (founder, 2026-11-24)

- The check runs **at provisioning and in `lanectl check`**. It refuses to mark a lane ready on any
  difference that is not an intended override.
- Intended overrides are **URLs, ports, secrets and the redirect URI**.
- It is proven by **staging a real mismatch on lane2**, not by a fixture.
- **lane1 is not reprovisioned** (it holds P1658's test state). **A live lane's `.env` is never
  rewritten.**

## Invariants

- **No new path writes a live lane's files.** `write_lane_env` generates fresh secrets, and running it
  on a live lane broke sign-in on 2026-11-24. The check only reads (renders, inspects, one GET). Anything
  new that *writes* a lane's config refuses unless the lane is `free` and its compose project has no
  containers, networks or volumes, and it holds the lane's exclusive lock.
- **Never start a container to prove the check.** The lane2 proof creates containers without starting
  them, so no process runs on lane2's networks and no firewall is needed.
- **The check compares real values.** It reads values as docker renders and runs them, never a
  dashboard or API that masks secrets: a comparison of masked values is blind (decisions.md
  2026-10-21, P1538).
- **Never print a value that could be a secret.** A difference prints a value only when it has a public
  shape: a URL without credentials, `true`/`false`, or a short number. Anything else is reported by name.
  Render and inspect failures report the exit code, not docker's raw error text.
- **Deny by default.** Every difference fails unless a named override rule accepts it. A key present on
  one side only is a difference. An override rule states *what the lane value must be*, never merely
  "this key may differ". A blanked value is never an accepted override.
- **Sharing with main is explicit.** Lanes deliberately reuse main's TEST Google sign-in client
  (`af3868662`) and main's relay file. Any other auth or mail value that looks like a secret (by name or
  by shape) and is non-empty and equal to main's fails, because parity alone passes a shared value and
  the outbound check does not inspect auth or mail.
- **The check never takes a serving lane down by itself on deploy.** A function deploy to a ready lane
  runs the check before it quarantines. On a difference the deploy is refused and the lane keeps serving
  its current code.
- **P1672's invariants hold unchanged.** A lane never acts on another environment, holds only TEST
  credentials, and mails nobody but the founder (P1672 Invariants; decisions.md 2026-10-28 for the
  auth-mail sink and relay). The outbound check still runs.

## Solution

**One parity check in `lanectl`, run wherever a lane becomes or stays live.** It compares the lane's auth
and mail services with the main lane's.

**What it compares, and against which reference.**
1. **Rendered lane against rendered main (governing).** Both stacks rendered by `docker compose config`
   from their own compose files and `.env`, with a clean environment so the caller's shell cannot
   interpolate. Main uses its own `COMPOSE_FILE`. Every rendered field is compared except the
   lane-structural ones: container name, published ports, logging, restart policy, start order,
   networks and extra hosts. The last two are checked by derived rules instead:
   - if main's service sits on a network with internet access, the lane's must too (the lane's
     `default` network is internal);
   - every host named in the lane's auth URLs that is the lane's own host must be in auth's host
     entries, pointing at the VM's tailnet address (how GoTrue reaches the template URLs).
2. **Lane containers against the lane's own render.** Each lane auth and mail container must run the
   image and env its rendered config produces. This catches a lane whose files are right but whose
   containers are stale, and a regenerated `.env` under a running lane (today's incident). Env the image
   itself bakes in is ignored. A missing or stopped container is a failure wherever the lane is meant to
   be up.
3. **Main containers against main's render: warning only.** Main running older config than its files is
   main-lane upkeep. It is reported and never fails a lane.
4. **Auth's own `/auth/v1/settings`, lane against main, through each stack's gateway.** An oracle
   outside docker's renderer. The lane not answering is a failure. Main not answering is a warning.

**Intended overrides, each a rule on the lane value:**
- **URLs:** main's value with the main origin replaced by the lane's origin (site URL, API URL, JWT
  issuer, Google redirect URI, template URLs). The redirect allowlist is compared as a set, with empty
  entries dropped. Any other value carrying the main origin gets the same rule automatically. A lane value
  that still names the main origin always fails.
- **Secrets:** the JWT secret must equal the lane's own `.env` value, which must be non-empty and differ
  from main's. The database URL must equal main's URL with main's database password replaced by the
  lane's, which must also be non-empty and differ from main's. This also validates the rest of the URL.
- **Lane-internal address:** auth's SMTP host is exactly the lane's mail service.
- **Mail retention cap:** exactly `2000` (main keeps 5000). It is a disk cap on a short-lived copy, not a
  feature, and changing it on lane1 would recreate its mail container and empty its inbox.
- **lane1, generation 6 only:** the API URL and JWT issuer may be the bare lane origin. That is the old
  generator's output. Fixing it would mean rewriting lane1's `.env`, and the two forms behave the same for
  sign-in links. The exception names the generation, so it expires the moment lane1 is reprovisioned.
  `write_lane_env` is fixed to derive the API URL from main's value.

**Tripwire for new main-lane features.** The check derives what main's compose files contribute beyond the
upstream file that lanes use, by rendering main both ways. Each contribution is a path at field level:
`service.environment.KEY`, list entries keyed by target (`caddy.volumes[/srv/...]`, `kong.ports[8000]`),
and other fields by name. A service the upstream file lacks is flattened the same way. Auth and mail are
covered by parity. Every other path must be classified in `lanectl` (lane-owned, main-only, or a
function env name in one of the P1672 function-env sets, plus a named set of main function env names that
lanes deliberately do not get). **An unclassified path fails.** So a new key under an already-classified
service still forces someone to decide whether lanes need it.

**Where it runs:**
1. **Provisioning.** The rendered comparison and tripwire run right after the lane's config is written,
   before the firewall, database copy or any container. The running comparison and settings oracle run
   once services are up. A difference fails provisioning and the lane goes to `failed`.
2. **Lift** (end of a claim, after a migration, after a function deploy to a ready lane). Everything,
   next to the outbound check. A difference refuses ready, and the lane stays quarantined.
3. **Function deploy to a ready lane:** a preflight before it quarantines (invariant above).
4. **Boot:** after a lane's containers come back, the rendered, tripwire and running comparisons run for a
   lane that was not quarantined. A difference quarantines it, the same as a firewall that fails to verify.
5. **`lanectl check`:** prints `PARITY FAILED:` lines, separate from the outbound check's
   `CHECK FAILED:`, and exits 3.
6. **`lanectl parity --lane L`:** the same report without a generation, read-only, for a lane that is
   configured. Used to check lane1 before installing.

**Recovery.** A lane refused at lift keeps its data. The cause is either a new main-lane setting (classify
it or add a rule in `lanectl`, commit, `vm-install`, then `lanectl lift`) or real lane drift
(reprovision).

**The lane2 proof** is a harness in the repo, run as root on the VM against a candidate `lanectl` copied
to a temporary path, so the installed tool lane1 uses is untouched. It refuses unless lane2 is free and its
compose project is empty, and it holds lane2's lock. It writes lane2's config with the real generator,
creates containers without starting them, and in all cases tears lane2 down afterwards and verifies that
nothing of lane2's project is left.

## Alternatives Considered

| Alternative | Verdict | Why |
|---|---|---|
| Make lanes inherit main's auth/mail settings wholesale, then patch the overrides | Rejected | Inheritance silently imports any new main setting, including one that points at the main lane or holds a main credential. P1672 made lane config deny-by-default for that reason. A check keeps deny-by-default and makes an omission loud. |
| Compare only the keys of main's override file | Rejected | Misses values that differ (Google `"false"` vs `"true"`) and anything main sets through `.env`. Rendered config covers both. |
| Hand-list the settings to compare | Rejected | That is the allowlist-of-what-someone-remembered that caused this. The compared set is derived from main's render. |
| Check only in `lanectl check` | Rejected | A drifted lane would still go live. The founder asked for a refusal to mark it ready. |
| Fix lane1's URL form in place | Rejected | Rewriting a live lane's `.env` is forbidden. The generation-scoped exception expires by itself. |
| Gate in warning mode first | Rejected | The lane1 read-only check before installing measures the false-positive case on the real live lane, and the deploy preflight keeps a refused deploy from taking lane1 down. |

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| lane1 fails the new check, so P1658's next deploy, migration or lift is refused | MITIGATE | The candidate's full lift-time check runs on lane1 read-only from a temporary path and must pass before `vm-install`. A deploy is refused before it quarantines. |
| A later main-lane change (new auth setting, new function env key) refuses lane lifts | ACCEPT | That is the gate working: it names the path to classify. Recovery depends on the kind of change. **A tripwire hit** (a new main path) is a one-line classification plus `vm-install` and `lift`, with no data lost. **A changed auth or mail value on main** (a new setting, or a value that changed) cannot be healed in place, because no command rewrites a live lane's `.env` or `lane.yml` (Non-Goals). The lane is refused at deploy and lift, and quarantined at boot. The options are a lane-specific exception of the `PARITY_GRANDFATHERED` kind (a founder decision) or a reprovision, which loses the lane's data. **A new image tag in the shared compose file** fails the container check until auth and mail are recreated; `lanectl boot` (`compose up -d`) does that without touching the lane's files. Corrected after review (Opus M4): this row first claimed every case was a one-line fix. |
| An override rule accepts too much and passes a real drift | MITIGATE | Each rule states the exact required lane value. Each of today's defects, replayed alone, must fail. |
| The end-to-end claim flow (claim, deploy, migrate, lift) is not run with the gate before it goes live | ACCEPT | It needs a claimable lane: lane1 is occupied and lane2 is not enabled (P1679). The lift wiring is tested offline with stubs, and the checks themselves run on real lane1 and lane2. P1679's stage-2 claim is the first live run. |
| Settings match but the feature still fails (a template URL the lane's Caddy does not serve, kong routes, relay file contents) | DEFER | Parity covers the auth and mail config docker renders and runs. It does not cover files copied at provisioning (`kong.yml`, database init scripts) or the Caddy route. An end-to-end sign-in probe is separate work. |
| Parity on services other than auth and mail (rest, storage, realtime, functions values) | DEFER | Not in the founder's scope. The tripwire still catches every new main override path for them. |
| `write_lane_env` blanks keys auth does not read today (asymmetric JWT keys and similar). If a Supabase upgrade passes one to auth, every lane fails | ACCEPT | Lanes would need their own asymmetric keys. That is a real decision, and failing loudly is correct. |

**Known limitations (review, 2026-11-24; each fails closed, none is a shape the repo produces today)**
- `write_lane_env` reads main's `API_EXTERNAL_URL` from main's `.env`, while the check compares against main's render. If main ever sets it in the override instead, every new lane fails its provisioning check, loudly. Measured today: the known-good lane2 config passes.
- `GOTRUE_URI_ALLOW_LIST` is rebased only where an entry starts with main's exact origin. An entry for main in another form (http, another port) would fail every lane until a rule is added.
- "Can reach the internet" means at least one non-internal network. A lane service attached to some other non-internal network passes that rule. This is not a regression: the outbound check never looked at auth or mail networks.
- A rule key absent from both renders reports nothing. auth cannot run without the keys those rules name.
- Capability URLs: a path segment of 16+ characters mixing letters and digits prints as its length only. A token made only of letters or only of digits still prints. A capability URL shared with main passes the secret-equality rule, because URL-shaped values are not treated as secrets. No auth or mail value has that shape today.
- The image is compared by tag. A re-pulled digest under the same tag passes. The baked env is read from the container's own image id, so the result stays correct.
- `host_entries` does not normalise the bracketed IPv6 form. It fails closed, and no lane uses IPv6 host entries.
- When the main lane does not answer `/auth/v1/settings`, the result is a warning, not a failure. The lane1 evidence above shows 0 warnings.
- Second review round (2026-11-24, Opus N1): the tripwire first dropped any main path whose value renders as null. A per-name network or `caddy.command` was invisible to it. Paths are now compared by membership, and networks are keyed per name. The live lane1 run then surfaced `caddy.command` and `caddy.entrypoint`, now classified.
- The live proof exercises the running comparison through `container_drift` on created, never-started containers. Its path through `parity_report(running=True)` is covered offline and by the read-only lane1 run.

**Non-Goals**
- Do NOT reprovision lane1, rewrite any live lane's `.env` or `lane.yml`, or recreate its containers.
- Do NOT edit the main lane's files (`.env`, `docker-compose.override.yml`, `mailpit/`, Caddy).
- Do NOT start any lane2 container, and do NOT enable lane2 for claims (P1679 owns that).
- Do NOT change the outbound check's rules, the function-env allowlist or the lane mail domain.

## Done-When

- [x] **Each of today's defects is refused on its own (real lane2, real main config).** The harness writes
      lane2's config with a candidate `lanectl` that has exactly one defect reverted, and the check fails
      naming the right fields. There are five replays: Google sign-in off, no template URLs, no relay,
      auth and mail off the internet-facing network, no template host entry.
      Evidence (2026-11-24, `p1724_live_proof.py`, candidate sha256 `1395ad68044a3f3e`, 25 of 25 held): all five
      replays fail and name the defect. The method replays each defect by removing exactly its lines from the
      generated `lane.yml` (each removal is asserted non-empty), which yields the file the pre-fix `lanectl`
      wrote for that field.
- [x] **A correct lane passes (known-good control).** The unmodified candidate writes lane2's config and
      the check reports no difference.
      Evidence: same run, "known-good lane2 config passes the rendered check (0 failure(s))", over 41 auth and
      mail env entries.
- [x] **The running comparison fires on its own.** lane2's auth and mail are created (never started) from
      a defective `lane.yml`, then the correct `lane.yml` is written back. The rendered comparison passes,
      and the running comparison fails naming the stale keys. Recreated from the correct file, it passes.
      Evidence: same run. The env case (Google off) fails with 4 lines; the structural case added in review
      (off the edge network, no host entry) fails with 3; each passes after recreation. Containers never started.
- [x] **The tripwire fires.** With one entry removed from the real classification, the check fails naming
      that path on real main config. An offline test shows a new key under an already-classified service
      fails.
      Evidence: same run, `caddy.image` removed, 1 failure naming it. Offline: `caddy.environment.NEW`,
      a new service, a new top-level key and main additions to skipped auth/mail fields are all unclassified.
- [x] **lane2 is left clean.** After the harness, lane2 is `free` and no container, network or volume of
      its compose project and no lane2 directory remain, checked by command.
      Evidence: same run, "lane2 left clean: free, no directory, no containers, networks or volumes (0 left)".
- [x] **lane1 passes and is untouched.** The candidate's full lift-time check (rendered, running,
      settings oracle, tripwire) runs on lane1 read-only from a temporary path and passes before
      installing. lane1's `.env` and `lane.yml` hashes and its containers' IDs and start times are the
      same before and after.
      Evidence: candidate `1395ad68044a3f3e` on lane1 under its shared lock: "outbound failures 0 parity
      failures 0 warnings 0" (0 warnings, so main answered the settings oracle), fingerprint unchanged. The
      live proof's nine lane1 keys were also unchanged.
- [x] **Each entry point does what it claims (offline, stubbed).** Provisioning on a difference never
      reaches the firewall or database copy and ends `failed`. Lift on a difference quarantines. Deploy to
      a ready lane on a difference is refused before quarantine. Boot on a difference quarantines. `check`
      exits 3. The rules accept the known-good inputs, refuse each defect and never print a secret.
      Evidence: `python3 scripts/test-p1724-lane-parity.py` gives 88 passed, 0 failed. Mutation run: 14 of 14
      wiring and rule mutations turn it red; the review-round tests fail on the pre-review `lanectl`.
- [x] `relay_matching` failing leaves provisioning `failed`, not stuck in `provisioning` (it raised
      `SystemExit`, which the provision handler does not catch).
      Evidence: offline tests "provision: no relay list raises RuntimeError" and "provision: no relay list leaves
      the lane failed" pass.
- [ ] The installed `lanectl` on the VM matches the committed file (hash), and `lanectl parity --lane lane1`
      passes with it installed.

## Rollback Strategy

`git revert` the change, then `lane.py vm-install` from main. The lane state format and protocol number
do not change. A lane the new gate already quarantined is lifted again with `lanectl lift` by its holder.

## Related

- [P1672](done/2026-06-10/p1672_isolated_test_environments_for_concurrent_branches.md): lanes, the
  outbound check, deny-by-default function env.
- [P1679](p1679_p1672_stage2_second_lane_clean_baseline_main_lane_protection.md): stage 2, enabling
  lane2. Its first claim is the first end-to-end run of this gate.
- [P1557](done/2026-06-10/p1557_self_hosted_supabase_test_database.md): the main TEST server's mail
  sink, relay and templates.
