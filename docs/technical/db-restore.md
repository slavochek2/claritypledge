# Restoring the Production Database from Backup

**Status: the selection rule and verification below are proven against fixtures. A full restore into a live database has never been exercised end-to-end.** Until it has, treat this as a tested procedure with an untested final step. See "Open: prove the restore" at the bottom.

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

### 4. Confirm the data is actually there

```bash
psql restore_check -c "SELECT count(*) FROM public.profiles;"
```

Compare against `profiles_rows` in the marker. `profiles` is the canary the backup workflow asserts on — it is the pledge-signer table the product sits on, it only grows, and it has no legitimate empty state. **A restore where `profiles` is 0 is a restore of nothing**, even though every structural check passed: a dump of an empty database has full DDL, a valid footer, and valid gzip. Shape proves nothing; rows do.

Spot-check a few more tables (`stories`, `points`, `clarity_sessions`) before going further.

### 5. Only then, promote to the real target

Restoring into Supabase prod is a decision, not a step in a runbook. Stop here, confirm the scratch restore is genuinely good, and make that call deliberately.

---

## Open: prove the restore

The selection rule, the marker logic, and every verification check above are proven against fixtures (P991 steps 7–8), including a real poisoned object. What is **not** proven is a full restore of a real 900KB prod dump into a live Postgres and a successful application boot against it.

Until someone does that once, "we have backups" remains a hypothesis. It is the single highest-value untested claim in the infrastructure.

**Related:** P991 spec (`features/`), private infra decisions log 2026-07-15.
