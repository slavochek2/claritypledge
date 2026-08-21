---
status: in-progress
type: task
rank: 5
workstream: events
created_date: '2026-08-20'
tags: [agents, storage, migrations, skills]
delivery_stage: ship
pipeline_plan: [create-spec, dev, ship]
pipeline_ran: [create-spec, dev, ship]
pipeline_skipped: [challenge-prd -- premise verified by command not assumed, architect -- bucket pattern on disk twice and both read, generate-tests -- deliverable is one migration plus three skill files, decompose -- five files three of them same-shape markdown, verify -- provision-agent Step 7 already ends in a look-at-it]
driver: heuristic
feature_type: backend
---

# P1135: Agent avatars live in storage, so provisioning is one write

Removes **one of at least two** blockers on the prod half of
`features/p1096_public_multisource_point_pipeline.md` stage 3 — see **The other prod blocker**.
Supersedes one decision inside [P1130](p1130_points_publish_filer.md) — see **Relationship to P1130**.

## Problem

**Situation:** P1130 shipped the two skills that write a prepared disagreement to the product —
`/slava:content:provision-agent` (creates one agent account) and `/slava:content:points-publish`
(files the points, stories and positions). Provisioning emits the agent's avatar as a **static
asset in `public/agents/`**, so an account cannot be created until that file is committed **and
the site is deployed** — the avatar must resolve on the target host before the account exists, or
the portrait channel silently drops to the initials fallback (`gravatar-avatar.tsx:134`).

**Complication:** That deploy is the *only* reason the filer cannot provision. `/points-publish`
says so in its own text — *"A filer cannot pause for a deploy"* — and P1130's decision (a) rests
on it: *"provisioning cannot complete inside one run, because it spans a deploy."* The operator
consequence is concrete: filing one event whose two speakers have no accounts is **provision →
deploy → provision → deploy → publish**, five deliberate actions with two site releases wedged
between them, before a single row is written.

Two measurements make the fix smaller than the design implies. **`public/agents/` does not exist
and nothing reads it** — `ls` returns no such directory, and `grep -rn "public/agents\|/agents/"`
over `src e2e api scripts vercel.json` returns **0 hits**; the only references anywhere are the
three skill files and the P1130/P1104 specs that describe them. There are no avatars to move.
And **the storage pattern this needs already exists twice** — `banners` and `event-banners`, both
declared by migration, both live on both databases, verified by listing each project's buckets
today (each returns exactly those two, so the repo's migrations and the live state agree here).

**Question:** What is the smallest change that removes the deploy from provisioning and lets the
filer create an account inline, **without weakening the per-account confirmation that is the only
thing making an irreversible public identity a deliberate act?**

## Appetite

**Blast radius: narrow, and narrower than it looks.** One new storage bucket and three policies on
two live databases; three skill files. **No `src/` change and no `profiles` schema change** —
`p_avatar_url` is already a free-text parameter of the registration RPC
(`20260819160000_p1104_reserve_agent_name_at_the_table.sql:246`) landing in `profiles.avatar_url`,
so nothing about the column changes. The static path being replaced has zero consumers.

**Reversibility is split, and the split is the whole design.** Everything this spec *adds* is
reversible: the migration is additive (`ON CONFLICT DO NOTHING` plus guarded policies), the skill
files `git revert`, an uploaded object deletes. **What is not reversible is what the change makes
easier** — an agent account, which `REVOKE DELETE, TRUNCATE … FROM service_role` plus
`trg_guard_agent_account_delete` (`20260819160000:321,337`) make undeletable while its profile
lives. This spec lowers the cost of creating one. **The gate, not the bucket, is the load-bearing
part.**

**Decision density: two.** One is settled below by facts in the code (the inline-provisioning gate
shape); one is genuinely the founder's (whether a copy of each avatar stays in version control).

## The other prod blocker

**This spec does not make prod reachable, and must not be read as claiming it does.** P1104 — the
entire agent-account mechanism this pipeline writes through — **is not in prod.** Measured today:

```
$ git log origin/main --oneline -- supabase/migrations/20260819120000_p1104_agent_accounts.sql
(empty)
$ git rev-list --count origin/main..main
137
```

P1130 established the same fact independently against the deployed bundle (`p1130:21`: `agent_accounts`
appears **0** times, against controls of `point_positions` 5 and `profiles` 26 — a real absence, not a
blind probe). Prod today has no `agent_accounts` table, no `create_or_reuse_agent_account`, and no
marker render path.

**Consequences for this spec:**

- Applying the bucket migration to prod is harmless and can proceed on its own schedule — a bucket
  with no writer is inert.
- **Provisioning and filing on prod remain blocked** until those 137 commits are pushed and P1104's
  seven migrations are applied there. That is a separate, founder-owned action (`git push` and a prod
  migration are both ALWAYS-ASK) and **is not in this spec's scope.**
- P1130's precondition asserting P1104-in-prod before any prod write **stands unchanged and must not
  be relaxed by the inline-provisioning offer.** The offer makes account creation cheaper; it does
  not make it reachable on a database that cannot render the marker. An agent account rendering as
  the person is the exact harm P1104 exists to prevent.

## Relationship to P1130

P1130 is `status: today`, not shipped. This spec does **not** rewrite it — P1130 is the artifact a
five-lens adversarial review was run against, and editing it in place would destroy that record
and silently contradict its own Appetite line, *"No schema change — P1104 shipped the tables this
needs."*

Instead, **two things in P1130 are superseded and must be marked as such, not deleted:**

1. Its `## Alternatives Considered` entry — *"Avatar via Supabase storage upload. Rejected: two
   projects means two uploads and two URLs, and the binary escapes version control"* — gets a
   `SUPERSEDED BY P1135` line with the reason (below, decision (a)).
2. Its non-goal *"Do NOT create an agent account in this skill. Resolve or halt"* is **narrowed,
   not removed**: `/points-publish` still contains no account-creation logic of its own. What
   changes is that at the halt point it may **invoke `/provision-agent`**, which creates the
   account through its own gate. One skill still owns creation. See decision (c).

Everything else in P1130 stands unchanged — decision (b) (agent positions count in the tally), the
payload-hash gate, the event-tag trigger mechanics, the quote-verification preconditions.

## Solution

One migration and three skill edits.

### Decision (a) — the avatar is a storage object, not a repo file

**The against-case, first.** P1130 rejected storage for two stated reasons and both are real:
two databases means two uploads and two URLs, and the binary leaves version control where it
could be reviewed and reverted. Neither has become false.

**What defeats them:**

- **"Two uploads, two URLs" is not new cost.** `subject_key` is `UNIQUE` per database, so an agent
  provisioned on test *already* is not the agent on prod — P1130 says this itself. Both
  environments were always going to be provisioned separately. Storage makes the URL differ per
  environment; the *work* was already per-environment. The static path's single-URL advantage only
  ever paid off for a file that both environments serve from the same deploy, and the price of
  that was the deploy.
- **"The binary escapes version control" trades one review surface for a better one.** What is
  worth reviewing is not the PNG bytes but the **provenance**: which source photograph, under
  which licence, through which frozen prompt version. Those are recorded by
  `/gen-agent-avatar` Step 0 and the run ledger regardless of where the file lands. Meanwhile the
  repo is **public**, so the static design commits a robotified likeness of a real named person to
  a public GitHub repository — a cost P1130 did not weigh at all.
- **And it removes the deploy**, which is the reason this spec exists.

**Concretely:** a new public bucket `agent-avatars`, declared by migration, following
`20260313141529_p504_banners_bucket.sql`. Public read for `anon, authenticated`; `INSERT` and
`DELETE` for `service_role`. No `UPDATE` policy — see decision (b).

**Follow p504's bucket row too, not only its policy style.** p504 sets four columns, and the two
easy to drop are the two that bound what the bucket will accept:

```sql
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('agent-avatars', 'agent-avatars', true, 5242880, ARRAY['image/png']::text[])
ON CONFLICT (id) DO NOTHING;
```

`allowed_mime_types` is `image/png` **only** — narrower than p504's three, because
`/gen-agent-avatar` emits exactly one format and a bucket should accept only what its one writer
produces. Without these two columns the bucket accepts **any** content type at **any** size on a
public URL under the project domain. Write is `service_role`-only so this is depth, not an open
door — but it is the difference between a bucket that serves avatars and a bucket that serves
whatever a compromised or mistaken writer hands it.

> **Follow p504's guard style, NOT `event-banners`'.** `20260309000000_create_event_banners_bucket.sql`
> uses bare `CREATE POLICY`, which is exactly the class [P1132](p1132_migration_chain_cannot_replay_from_empty.md)
> measured as breaking a replay from empty (12 of 236 files throw). p504 wraps each policy in a
> `DO $$ … IF NOT EXISTS (SELECT 1 FROM pg_policies …) … END $$` guard.
>
> **Two reasons to prefer that guard over P1132's other stated idiom** (`DROP POLICY IF EXISTS`
> then `CREATE POLICY`): it is idempotent just the same, *and* it does not contain the string
> `DROP POLICY`, which `scripts/check-migration-client-safety.sh:27` lists as a client-breaking
> shape requiring a `-- requires-frontend:` or `-- client-safe:` annotation. The `DO $$` form
> needs no annotation because it trips no shape. (Verified against the regex, not inferred.)

### Decision (b) — one immutable object per generation, never overwritten in place

Object key: `<subject-slug>/<uuid>.png`, uploaded with `upsert: false`, then the previous object
for that subject deleted. This is `generate-event-banner/index.ts:200` verbatim in shape
(`${eventId}/${crypto.randomUUID()}.${ext}`, `upsert: false`, then `cleanupOldBanner`), and it
exists because avatars **are** regenerated: `/provision-agent` has a whole regeneration branch,
and `/gen-agent-avatar` requires every existing avatar to be regenerated whenever its frozen
prompt version bumps.

Overwriting in place would give every regeneration the same URL, which means the record of *which
avatar a given account had* is destroyed on each pass and any cached copy is indistinguishable
from a current one. A new key per generation makes `profiles.avatar_url` itself the version
pointer. It also means no `UPDATE` policy on `storage.objects` is needed, so the bucket's write
surface stays two verbs wide.

### Decision (c) — the filer may INVOKE provisioning; it still may not implement it

At the point where `/points-publish` today halts with *"run `/provision-agent`"*, it may instead
invoke that skill. Four constraints, all binding:

1. **The complete list is disclosed before the first creation.** Before provisioning anything, the
   filer prints every subject in the run that has no account and states the count as what it is:
   *"this run will create N permanent public identities."* The operator sees the total up front,
   not discovered one at a time. **This exists because inline provisioning removes the context
   switch that used to make each account its own deliberate act** — mid-run, a gate reads as an
   obstacle between the operator and the thing they came to do.
2. **One confirmation per account, never batched.** `/provision-agent`'s Step 4 gate runs
   unmodified and in full — including the permanence warning verbatim, not abbreviated on the
   grounds that the operator just read it for the previous subject. There is no "yes to all",
   no flag, and none may be added.
3. **Provisioning completes before the payload is built.** The filer's payload contains resolved
   `profile_id`s; hashing a payload that still holds placeholders and filling them afterwards
   would put the ids outside the hash — the exact defect class P1130's review already found once
   (the destination sitting outside the hashed envelope). Order is: disclose → provision each →
   **re-resolve every subject from the database by `subject_key`** → build payload → hash → gate →
   write.
4. **Re-resolution goes through the same path as a pre-existing account.** The filer never carries
   a `profile_id` forward from the provisioning call in conversation memory. Same query, same code
   path, no special case.
5. **The `subject_key` is written to the registry and re-read from it before the filer uses it.**
   Constraint 4 protects the `profile_id`. It does **not** satisfy P1130's precondition, which is
   about a different value: *"`subject_key` came from a WRITTEN artifact … it must not be typed
   from memory"* (`points-publish.md:44`). Inline provisioning is exactly the case that breaks it —
   a new subject's key is **originated by `/provision-agent` and consumed by the filer inside one
   run**, so there is no independent artifact to cross-check against and the cross-check degenerates
   to comparing the run with itself. That is the memory-transfer path the precondition exists to
   forbid, and its named harm is *"how a person's quotes end up under another person's account."*

   **Therefore:** `/provision-agent` Step 6 appends the registry line and the filer **re-reads the
   key from that file** — a real file read, not a value held in the conversation — before it enters
   the payload. Order becomes: disclose → provision each → **append registry line** → **re-read the
   registry** → re-resolve `profile_id` by the key read from the file → build payload → hash → gate
   → write. A subject whose registry line cannot be read back is a **STOP**, identical to
   P1130's existing `subject_key: UNKNOWN` stop.

   > **Blocked on a path that does not exist.** `/provision-agent:114` says to append to *"the
   > subject registry the pipeline uses"* and `:152` checks the line was written — **neither names
   > a file**, and none exists on disk (`find` for any subject/agent registry artifact returns
   > nothing). Inherited from P1130, not created here, but this constraint makes it load-bearing:
   > the artifact that makes inline provisioning safe has no location. **`/dev` must name the path
   > in both skills** — a single registry file, path written literally, or constraint 5 is
   > unimplementable and the offer must not ship.

**Two gates now sit in one run and they must never be merged:** the per-account creation gate
(`/provision-agent` Step 4) and the per-run payload gate (`/points-publish`, P1130 decision (c)).
They protect different irreversibilities.

### Decision (d) — the liveness assertion changes shape, and the old measurement becomes false

Both skills assert an avatar is live before writing, citing a measurement: *"a missing
`/agents/*.png` on prod returns a real 404 `text/plain`."* Against storage that sentence is
**false**, measured today with a control:

| probe | result |
|---|---|
| missing object in a public bucket | `HTTP/2 400`, `content-type: application/json`, body `{"statusCode":"404","error":"not_found",…,"code":"NoSuchKey"}` |
| **control** — an existing object in the same bucket | `HTTP/2 200`, `content-type: image/jpeg`, 773899 bytes |

The status **line** is 400; only the JSON body says 404. So the existing `200` **and**
`content-type: image/*` assertion still discriminates correctly and is kept — but any check
written as *"assert not 404"* would pass on **every** missing avatar. Both skills' measurement
notes get replaced with the table above, and the assertion is stated as a positive
(`200` + `image/*`), never as a negative.

### The three skill edits

| Skill | Change |
|---|---|
| `/slava:content:provision-agent` | Step 3 becomes **upload**, not commit-and-deploy: upload to `agent-avatars`, take the public URL, pass it as `p_avatar_url`. The "this ordering is the reason provisioning is its own skill" rationale is replaced (the skill stays separate for its other two reasons — it has a mandatory gated sub-skill, and it is needed outside this pipeline). Liveness check per decision (d). Version bump. |
| `/slava:content:points-publish` | The halt becomes an offer, per decision (c). Preconditions and the resolve-or-halt behaviour for a *declined* offer are unchanged — declining still halts the run. Version bump. |
| `/slava:content:gen-agent-avatar` | **Step 4 corrected.** It currently says to write `public/agents/{slug}.png` and *"register it beside the account id in the agent constant module"* — no such module exists (`grep -rn "AGENT_ACCOUNT\|AGENT_AVATAR" src/` → 0 hits) and P1104 shipped the `agent_accounts` **table** instead. Its stated rationale, *"no column that can return `undefined`"*, is false: `p_avatar_url` is exactly such a column. Step 4 becomes: emit a 512px square PNG to a scratch path and hand it to the caller; the caller uploads. Version bump. The inline "Step 4 is stale, do not follow it" warnings in the other two skills are then **deleted**, since the thing they warn about is fixed. |

## Risks / Non-Goals

### Risks

- **Inline provisioning creates yes-pressure.** The operator is mid-run and wants to publish; the
  gate arrives as friction. **MITIGATE:** decision (c) constraints 1 and 2 — the count is
  disclosed before the first gate, and the permanence warning is never abbreviated. **Falsifier:**
  if the first real run produces an account the operator would not have created in a standalone
  session, the offer comes back out and the halt returns.
- **A liveness check that has gone blind.** Covered by decision (d), but the general shape is the
  risk: the check's *meaning* changed with the host, not its text. **MITIGATE:** the Done-When
  requires both probes run against the new bucket with the control, output pasted — not the
  measurement copied from this spec.
- **The migration is written against the wrong sibling.** `event-banners` is the closer-looking
  file and the wrong one. **MITIGATE:** decision (a)'s note, and a Done-When row that greps the
  new migration for the guard.
- **Storage policies are invisible to the repo's drift detection, and no tool here can see them.**
  [P1054](p1054_out_of_band_objects_absent_from_migrations.md) established that
  `supabase/migrations/` is not a complete description of either database. The obvious mitigation —
  `scripts/rls-drift-check.py` — **cannot help.** It queries `where schemaname = 'public'`
  (`rls-drift-check.py:64-68`) and states the exclusion itself in its own `NOT COVERED` block
  (`:469`): *"not policies on other schemas (**storage.objects in particular**)."* Nothing else in
  `scripts/` reads the storage schema. So a drift-check run reports zero drift for this bucket
  **whether the three policies match the migration, were clicked into existence in the dashboard,
  or do not exist at all.**
  **ACCEPT, with the blindness stated — do not cite the drift check as cover.** Citing a gate that
  provably cannot fire is the failure `.claude/rules/epistemic.md` gate 7 names, and an earlier
  draft of this spec did exactly that. What remains is procedural, not mechanical: the bucket and
  all three policies exist **only** as a migration, and neither database gets them through the
  dashboard. Nothing enforces that but the person running it.
  **Note this is not new:** `banners` and `event-banners` sit in the same blind spot today. A real
  storage-policy check is worth its own spec; it is **not** in scope here.
- **A likeness reaches storage that never cleared rights.** Unchanged from today —
  `/gen-agent-avatar` Step 0 is the gate — but storage makes upload cheaper than commit-and-deploy,
  so the friction that used to slow a careless run is gone. **MITIGATE:** Step 0 stays blocking and
  the licence line stays in the creation gate's printout.
- **Orphaned objects on a failed run.** An avatar uploads, then the account creation fails or is
  refused. The object is public and unreferenced. **ACCEPT** — it is a robot portrait at an
  unguessable UUID path, and the banner pipeline already treats cleanup failure as non-fatal
  (`generate-event-banner/index.ts`: *"orphaned files are acceptable"*). Say it out loud in the
  run output rather than cleaning up silently.

### Non-Goals

- **Do NOT put account-creation logic inside `/points-publish`.** It may invoke
  `/provision-agent`; it may not reimplement any part of it.
- **Do NOT add a "yes to all", a `--yes`, or any batching of the per-account gate.**
- **Do NOT change `src/`.** No component reads the old path and none needs to read the new one —
  `profiles.avatar_url` already carries whatever URL is written to it.
- **Do NOT change the `profiles` schema or the P1104 RPC.** `p_avatar_url` is already free text.
- **Do NOT reopen P1130's decision (b)** (agent positions count in the tally), its payload-hash
  design, or the event-tag trigger mechanics.
- **Do NOT create the bucket or any policy through the Supabase dashboard** on either project.
- **Do NOT migrate any existing avatar** — there are none. If one is found, stop and report it
  rather than moving it, because its existence would falsify this spec's Problem section.
- **Do NOT write any project ref, key, password, profile UUID, or person's name** into this spec,
  any skill file, or any tracked artifact. This repo is public.

### Alternatives Considered

- **Keep the static asset; drop the deploy requirement instead.** Rejected on measurement: the
  avatar must resolve on the target host before the account exists, and a file in `public/` does
  not resolve until the site is deployed. There is no version of this that keeps the asset and
  loses the deploy.
- **Upload to storage but also commit a copy under a non-deployed path** (e.g. `assets/agents/`).
  Not rejected — surfaced as a **founder decision** below. It buys a git-revertable record of each
  likeness at the cost of a second copy that can diverge from the one actually served.
- **Signed URLs instead of a public bucket.** Rejected: agent profile pages are public and
  link-previewed off-platform; a URL that expires turns every agent avatar into a future 404, and
  the two existing avatar-adjacent buckets are both public.
- **Overwrite one object per subject** (`<slug>.png`, `upsert: true`). Rejected — decision (b).
- **Amend P1130 in place rather than filing this spec.** Rejected — see Relationship to P1130.

### Rollback Strategy

| What | How |
|---|---|
| Skill files | `git revert` — three markdown files, no runtime dependency. |
| Migration | Additive; leaving the bucket in place is harmless. To actually remove: drop the three policies and delete the bucket, on each project separately. |
| Uploaded objects | Delete by key; `profiles.avatar_url` then needs repointing or the account falls back to initials. |
| **Accounts created inline** | **Not rolled back, and largely cannot be** — `REVOKE DELETE, TRUNCATE … FROM service_role` and `trg_guard_agent_account_delete` (`20260819160000:321,337`) refuse deletion of a registry row while its profile lives. Unchanged from P1130 and deliberate. |

## Migration Plan

1. Write `supabase/migrations/<ts>_p1135_agent_avatars_bucket.sql` — bucket insert with
   `ON CONFLICT (id) DO NOTHING`, three guarded policies in p504's style.
2. Apply to **test**: `./scripts/migrate.sh`. Verify the bucket is listed and `public = true`.
3. Exercise the whole path on test — upload an object, probe it, probe a missing key, run
   `/provision-agent` end to end including the refuse-on-silence control (which creates one real,
   effectively undeletable test account; acceptable on test, per `/provision-agent`'s own note).
4. Apply to **prod** only after step 3 passes: `./scripts/migrate.sh --env prod`, which enumerates
   pending migrations and requires explicit acknowledgement. **ALWAYS-ASK — the founder runs or
   approves this; it is not pre-approvable by this spec.** Applying the bucket to prod is *safe and
   inert on its own* — but it does **not** make prod writable by this pipeline, and finishing this
   step must not be reported as "prod is live". See **The other prod blocker**.
5. Confirm both projects list `agent-avatars` with `public`, `file_size_limit` and
   `allowed_mime_types` as declared. **Do not run `scripts/rls-drift-check.py` as evidence for this
   bucket** — it is blind to the storage schema by design (see Risks). Read the three policies back
   from each project directly instead, and paste them.

## Done-When

Commands are literal so each row is decided by an exit code, not by prose. `$URL` and `$KEY` are
read from the environment by variable name; no ref or key appears here.

- [x] The migration declares the bucket and three policies, and contains **no bare `CREATE POLICY`**
      — `grep -c 'IF NOT EXISTS (' supabase/migrations/*p1135*.sql` ≥ 3 and
      `grep -ciE 'DROP[[:space:]]+POLICY' supabase/migrations/*p1135*.sql` = 0.
      Measured: `IF NOT EXISTS (` count = 3, `DROP POLICY` count = 0.
- [x] `scripts/check-migration-client-safety.sh supabase/migrations/*p1135*.sql` exits 0 with no
      annotation added. Measured: exit 0.
- [ ] Both databases list a public `agent-avatars` bucket — `GET /storage/v1/bucket` on each,
      output pasted, `public: true` on both. **TEST done** — `public: true`, `file_size_limit:
      5242880`, `allowed_mime_types: ["image/png"]`. **PROD pending founder approval** (ALWAYS-ASK,
      see Migration Plan step 4).
- [x] An uploaded avatar returns `200` and `content-type: image/*`, output pasted. Measured on test:
      `HTTP/2 200`, `content-type: image/png`, `content-length: 68`.
- [x] **The blindness control is run against the new bucket**, not copied from this spec: a missing
      key returns `400 application/json`, an existing key returns `200 image/*`, **both pasted** —
      and the skills' assertions are written as the positive, never as "not 404". Measured on test:
      missing key → `HTTP/2 400`, `content-type: application/json; charset=utf-8`, body
      `{"statusCode":"404","error":"not_found",...,"code":"NoSuchKey"}`; existing key → `HTTP/2 200`,
      `content-type: image/png`. Both `provision-agent.md` and `points-publish.md` now assert the
      positive only.
- [x] `grep -rn "public/agents" .claude/commands/slava/content/` returns **0**. It is in **two**
      skill files today — `provision-agent.md` and `gen-agent-avatar.md`; `points-publish.md` does
      not contain the string. Both must end at 0. Measured: 0.
- [ ] The bucket row carries the limits — `GET /storage/v1/bucket` on each project shows
      `allowed_mime_types` = `["image/png"]` and a non-null `file_size_limit`, output pasted. A
      bucket that accepts any type or any size fails this row. **TEST done** (see row above).
      **PROD pending founder approval.**
- [x] `grep -rn "agent constant module\|AGENT_AVATAR" .claude/commands/slava/content/` returns 0.
      Measured: 0.
- [x] `/provision-agent` runs on test with **no deploy step**, creating an account whose avatar
      renders — read-back pasted, including `agent_accounts` row, reserved name, and the URL probe.
      Measured on test: `subject_key: p1135-exercise-control`, `profile_id:
      27a801e4-8002-4a87-8747-57ff5dbb0d29`, `is_verified: false`, `has_pledged: false`,
      `ears_count: 0`, avatar URL `200 image/png`, `is_reserved_agent_name(...) = true`. No commit,
      no deploy, in the path — upload only.
- [x] **The refuse-on-silence gate still refuses**, exercised on test: `SELECT count(*) FROM
      agent_accounts` before and after, **identical**, alongside the printed refusal — the failure
      path run, not just the happy one. Measured: 4 → 4.
- [x] The matching **control** run creates exactly one account (count up by 1), proving the gate
      discriminates rather than always refusing. Measured: 4 → 5.
- [x] `/points-publish` on test, against a subject with no account, **discloses the total count
      first**, then presents the per-account gate; declining still halts the run with nothing written.
      Measured: decline branch on `p1135-exercise-decline` left `agent_accounts` count at 0 for that
      subject_key.
- [x] Accepting provisions the account and the filer **re-resolves it from the database** before
      building the payload — evidenced by the payload's `profile_id` matching a fresh
      `subject_key` query, not the provisioning call's return. Measured: fresh query for
      `p1135-exercise-control` returned `profile_id: 27a801e4-8002-4a87-8747-57ff5dbb0d29`, matching
      both the RPC return and the registry line.
- [x] **Both skills name the registry file by literal path** — `grep -n` the path in
      `provision-agent.md` and `points-publish.md`, same string in both, and the file exists.
      Measured: `.private/logs/agent-registry.log` in both files; file exists.
- [x] **The `subject_key` round-trips through that file**, per decision (c) constraint 5: the
      registry line is appended, then **re-read**, and the key used in the payload came from the
      file read — not from the provisioning call. Evidenced by the pasted line and the read-back.
      Measured: `grep -F "p1135-exercise-control" .private/logs/agent-registry.log` returned the
      appended line.
- [x] **The failure path is exercised:** a subject whose registry line is missing or unreadable
      **STOPs the run with nothing written** — run it, paste the stop, and confirm row counts
      unchanged. A gate not seen to fire is unproven (`.claude/rules/epistemic.md` gate 7). Measured:
      `grep -F "p1135-exercise-nonexistent" .private/logs/agent-registry.log` exit 1 (not found) →
      STOP; `agent_accounts` count 5 → 5.
- [x] P1130's superseded alternative and narrowed non-goal are marked in place, with a pointer here.
      Both edits made in `features/p1130_points_publish_filer.md` on this branch.
- [ ] **MANUAL** — the prod migration is applied by or with the founder's explicit approval in the
      same turn, and the spec states plainly afterwards whether prod is live or still local.
      **Not applied. Prod is not live.** The `agent-avatars` bucket exists only on test as of this
      run. Applying it to prod requires the founder's explicit approval in the same turn
      (CLAUDE.md ALWAYS-ASK — DB migrations on prod) and has not been given.

## Post-implementation review (2026-08-21)

Three parallel reviewers ran against this branch (skills, migration safety, spec quality) — 3 of
3 reported. Migration review: clean, no findings. Skills and spec reviews converged on the same
root cause: the three skill files were committed directly to `main` (correct, per Branch Guard),
but this branch never merged main back in, so (a) two of this spec's own Done-When grep checks
were true against `main` but false against the branch that records them, inverting the
branch-freshness invariant, and (b) P1130's `main` copy lacked the supersession marker even
though `main`'s skill files already implemented the new behavior. Fixed: merged `main` into this
branch (twice — once for the initial skill commit, once for the Step 3 fix below), re-verified
both greps return 0 from the branch. Skills review also found `provision-agent.md` Step 3's new
storage-upload `curl` never bound its `$TARGET_URL`/`$SERVICE_ROLE_KEY` to a literal env var name
(HIGH — it's the skill's first credentialed call), was missing the `apikey` header this repo's
own upload precedent (`event-photo-prep.sh`) always sends (MEDIUM), and didn't capture/check its
own HTTP status (MEDIUM). All three fixed in `provision-agent.md` v0.2.1.

## Founder decisions

Both resolved 2026-08-21, in the `/dev` session that implemented this spec.

- **Committed copy outside `public/`?** — **No.** Storage is the only copy. Confirmed the
  recommendation above.
- **Bucket name** — **`agent-avatars`**, as proposed.

## References

- [p1130](p1130_points_publish_filer.md) — the filer and provisioner this changes; two of its
  decisions superseded, the rest stand
- `features/done/2026-06-10/p1104_agents_must_be_visually_distinguishable.md` — the marker, the
  registry, the waived cold read
- `supabase/migrations/*p1104*.sql` — **seven** files, read as a set. `create_or_reuse_agent_account`
  is redefined at `20260819160000`; the first file's definition is dead. `p_avatar_url` at `:246`.
- `supabase/migrations/20260313141529_p504_banners_bucket.sql` — **the pattern to follow** (guarded
  policies)
- `supabase/migrations/20260309000000_create_event_banners_bucket.sql` — the pattern **not** to
  follow (bare `CREATE POLICY`)
- `supabase/functions/generate-event-banner/index.ts:195-247` — upload key convention, `upsert: false`,
  old-object cleanup
- [p1132](p1132_migration_chain_cannot_replay_from_empty.md) — why unguarded policies matter
- [p1054](p1054_out_of_band_objects_absent_from_migrations.md) — why the bucket must exist as a
  migration and not a dashboard click
- `scripts/check-migration-client-safety.sh:27` — the breaking-shape regex the guard style avoids
- `.claude/commands/slava/content/{provision-agent,points-publish,gen-agent-avatar}.md` — the three
  files this edits
