# Restoring the Production Database from Backup

**Status: proven end-to-end on 2026-07-15 (P997) against a real prod backup, restored into a scratch Postgres via Docker.** See "P997 restore findings" at the bottom for exactly what broke and what didn't.

Backups are written by [`.github/workflows/db-backup.yml`](../../.github/workflows/db-backup.yml), daily at 03:00 UTC, to `gs://claritypledge-db-backups/`. Retention is 7 days, enforced by a GCS lifecycle rule (not by the workflow — that keeps the writer service account scoped to create+get, with no delete permission).

---

## The restore rule

> **Restore the newest object that has a matching `.verified` marker. Never restore an unmarked object.**

This is not a formality. `pg_dump | gzip | gsutil cp -` streams bytes, so when `pg_dump` dies mid-dump, gzip flushes and exits, and `gsutil` sees EOF and **finalizes the object normally** — it cannot distinguish upstream failure from end-of-input. The workflow's `pipefail` correctly fails the job *at the pipeline*, which means none of its verification steps ever run on that object.

The result is a **valid-gzip, correctly-named, plausibly-sized object that is not a usable backup**, and it sits in the bucket for the full 7-day window because the writer has no delete permission to clean it up.

Every backup that passed verification gets a sidecar marker written *after* the checks pass:

```
prod-backup-20260715-060000.sql.gz            <- the backup
prod-backup-20260715-060000.sql.gz.verified   <- proof it passed every check
```

An object with no marker is poison. It is inert as long as you obey the rule above, and it ages out on its own.

---

## Restore

### 1. Pick the newest verified backup

```bash
BUCKET=gs://claritypledge-db-backups
OBJ=$(gsutil ls "$BUCKET/*.sql.gz.verified" | sort | tail -1 | sed 's/\.verified$//')
echo "Restoring from: $OBJ"
gsutil cat "$OBJ.verified"     # shows verified_at, sha256, bytes, profiles_rows
```

Do **not** substitute `gsutil ls $BUCKET/*.sql.gz | tail -1`. That is the naive rule, and it selects the poison object in exactly the scenario where you need a restore.

### 2. Download and verify before trusting it

```bash
gsutil cp "$OBJ" /tmp/restore.sql.gz

gunzip -t /tmp/restore.sql.gz || echo "FAIL: corrupt gzip"

gunzip -c /tmp/restore.sql.gz | tail -c 200 \
  | grep -q '^-- PostgreSQL database dump complete$' || echo "FAIL: no completion footer"

# the bytes must be the bytes the marker vouched for
EXPECTED=$(gsutil cat "$OBJ.verified" | grep '^sha256=' | cut -d= -f2)
ACTUAL=$(sha256sum /tmp/restore.sql.gz | awk '{print $1}')
[ "$EXPECTED" = "$ACTUAL" ] && echo "sha256 matches marker" || echo "FAIL: sha mismatch"
```

All four must pass. If any fails, drop to the next-newest marked object and repeat.

### 3. Restore into a scratch database first — never straight into prod

Restoring into a live database is destructive and irreversible. Always land it somewhere disposable and look at it first.

```bash
createdb restore_check
gunzip -c /tmp/restore.sql.gz | psql restore_check
```

**No local Postgres? Use Docker** — the machine doing the restore will not always have `psql`/`createdb` installed (it didn't in the P997 run). This is equally disposable:

```bash
docker run -d --name restore_check -e POSTGRES_PASSWORD=scratch -e POSTGRES_DB=restore_check -p 15432:5432 postgres:17
gunzip -c /tmp/restore.sql.gz | docker exec -i restore_check psql -U postgres -d restore_check
```

**Expect a wall of `ERROR:` lines. Most are non-fatal — read to the end before judging the restore a failure.** psql keeps executing after each error; only a handful of the errors below actually cost you rows. See "P997 restore findings" for the full breakdown.

### 4. Confirm the data is actually there

```bash
psql restore_check -c "SELECT count(*) FROM public.profiles;"
```

Compare against `profiles_rows` in the marker. `profiles` is the canary the backup workflow asserts on — it is the pledge-signer table the product sits on, it only grows, and it has no legitimate empty state. **A restore where `profiles` is 0 is a restore of nothing**, even though every structural check passed: a dump of an empty database has full DDL, a valid footer, and valid gzip. Shape proves nothing; rows do.

Spot-check a few more tables (`stories`, `points`, `clarity_sessions`) before going further.

### 5. Only then, promote to the real target

Restoring into Supabase prod is a decision, not a step in a runbook. Stop here, confirm the scratch restore is genuinely good, and make that call deliberately.

---

## P997 restore findings (2026-07-15)

A real ~930KB prod backup was restored into a scratch Postgres 17 container (Docker; no local `psql`/`createdb` were installed on the operating machine). `profiles` row count matched the marker exactly (91=91); `stories` (20), `points` (39), and `clarity_sessions` (238) spot-checks were non-zero and plausible. The scratch container and downloaded dump were destroyed afterward. Full run log kept out of this doc (contains no user data, but the raw psql output is verbose) — reproducible any time by following the steps above.

**Zero `.verified` markers existed at test start.** The P991 marker-writing step had merged (2026-07-15 13:26 UTC) *after* that day's 3am UTC scheduled backup (05:22 UTC) — no backup had run since. Fixed by manually dispatching `db-backup.yml` (it already has a `workflow_dispatch` trigger; no workflow edits needed). **Lesson: after any change to the backup/verify pipeline, manually dispatch a run rather than assuming the next 3am run is imminent** — staleness alerting (P995) would eventually catch a long gap, but there's no reason to wait for it after a known infra change.

**What restores clean, no errors:**
- Structure and data for all plain-SQL schemas: `public`, `auth`, `storage`, `realtime`, `vault`, `graphql`, etc. — these are ordinary `CREATE SCHEMA`/`CREATE TABLE` statements, not extensions, so a bare Postgres handles them fine. `auth.users` restored with all 123 rows.
- The 4 pre-restore integrity checks (gzip test, completion footer, sha256-vs-marker) — all passed cleanly against a real object.

**What actually breaks on a bare `postgres:17` image, and why:**
1. **Supabase-managed roles don't exist** (`anon`, `authenticated`, `service_role`, `supabase_admin`, `dashboard_user`) → every `GRANT`/`ALTER DEFAULT PRIVILEGES`/`OWNER TO` referencing them errors (826 occurrences in this dump). Cosmetic on a scratch DB used only for a data check; would matter for a real cutover.
2. **Extensions unavailable in vanilla Postgres**: `pgvector`, `pg_cron`, `pg_net`, `supabase_vault` (Supabase-hosted only). Consequence: any object that *depends* on their types/functions fails to create — notably **`public.user_voice_profiles` (a table with a `vector` column) never gets created at all**, and every statement referencing it afterward cascades into `relation does not exist` errors (11 occurrences). `cron.*` and `net.*` schema references likewise fail (16 occurrences) because those schemas are never created without the extensions that own them.
3. **3 foreign-key violations** (`story_point_history`, `point_position_history`, `clarity_verifications`) — rows referencing data that failed to land earlier in the dump (order-dependent fallout from #2, not independent corruption). The bulk of each table still restored (51, 383, 8 rows respectively).
4. A handful of `pg_cron` job-body strings got parsed as loose SQL/psql meta-commands (`backslash commands are restricted`, `column "Authorization" does not exist`) — cosmetic dump artifacts from `cron.job` rows containing HTTP-call SQL as data, not a corruption signal.

**None of this touches `profiles`, `stories`, `points`, or `clarity_sessions` — the tables that matter for "did we get the data back."** The failures are entirely in Supabase-platform surface area (roles, vector search, pg_cron scheduled jobs) that a bare Postgres was never going to have. A real incident restore target (Supabase project, not bare Postgres) would have all of these natively and likely hit none of this.

**Wall-clock:** once a verified backup exists and Docker/Postgres tooling is available, the restore procedure itself (download → 4 integrity checks → `psql` load → data verification) took **~15 seconds** for this ~930KB dump — download 6s, restore 1s, checks/queries near-instant. The only slow parts of this test run were one-time environment setup (Docker Desktop cold start ~20s, `postgres:17` image pull ~1min) that won't recur on a machine with Docker already running, and getting a marker-bearing backup to exist at all (~2.5 min backup job, only needed because none existed yet).

**Follow-ups filed, not fixed here** (per spec: this test records, it does not repair):
- Role/extension gap when restoring to bare Postgres vs. a real Supabase project — worth a P-number if a bare-Postgres restore target is ever a real DR plan; if the real plan is always "restore into a fresh Supabase project," this gap may not matter and should be explicitly scoped out instead.
- No mechanism currently prompts "dispatch a manual backup" after a backup-pipeline change lands mid-day — P995 staleness alerting is the eventual backstop but has a multi-hour blind spot right after a merge.

**Related:** P991 spec (`features/`), P995 spec (`features/`), private infra decisions log 2026-07-15.
