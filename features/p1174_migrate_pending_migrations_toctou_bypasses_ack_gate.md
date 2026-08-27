---
status: week
type: bug
rank: 79
severity: high
workstream: infrastructure
date_reported: '2026-08-27'
created_date: '2026-08-27'
tags: [migrations, prod-safety, tooling, concurrency]
drafted_by: sonnet
exec_model: opus
exec_effort: high
delivery_stage: create-bug
pipeline_ran: [create-bug]
---

# P1174: `migrate.sh`'s pending-migration enumeration and apply loop independently re-glob the migrations directory — a file landing in between bypasses the P887 ack gate and the P886 requires-frontend coupling gate

## Summary

Surfaced by adversarial review of P1168 (2026-08-27, forgeable/racy lens, reproduced with a real filesystem race). `scripts/migrate.sh` builds `PENDING_FILES` (the list shown to the human for explicit y/N ack, and scanned for the `requires-frontend` coupling marker — the P887/P886 prevention gates, added after a real prod incident) via one glob of `supabase/migrations/*.sql` at `migrate.sh:351`. The apply loop that actually POSTs SQL to prod does an **independent second glob of the same directory** at `migrate.sh:424` — it does not reuse `PENDING_FILES`. A migration file landing on disk between the ack prompt and the apply loop (e.g. a co-tenant's commit, a `git pull`, a merge landing on the shared main checkout while a human is reading the ack prompt) is applied to prod without ever being shown to the human and without ever passing the `requires-frontend` coupling check.

## Root Cause

```bash
# migrate.sh:349-360 — builds PENDING_FILES, shown to the human, scanned for the coupling marker
if [ "$ENV_NAME" = "prod" ]; then
  PENDING_FILES=()
  for MIGRATION_FILE in "$PROJECT_DIR"/supabase/migrations/*.sql; do
    ...
    PENDING_FILES+=("$BASENAME")
  done
  # ... ack prompt (interactive y/N) or --yes ...
fi

# migrate.sh:424 — the apply loop, a SEPARATE glob, not fed from PENDING_FILES
for MIGRATION_FILE in "$PROJECT_DIR"/supabase/migrations/*.sql; do
  ...
  apply_via_api "$MIGRATION_FILE"   # actually POSTs to prod
done
```

Reproduced (adversarial reviewer): with 1 file present at ack time, a second file landing during the (simulated) ack wait resulted in the apply loop attempting 2 files — the second (`20260101000001_sneaky.sql`) applied to prod with neither ack nor `requires-frontend` coupling scan, because it was never in `PENDING_FILES`.

This is exactly the incident class `migrate.sh`'s own header documents P887/P886 as preventing ("a client-breaking grants migration rode along with an unrelated backend ship").

**Secondary, related finding (same reviewer, same investigation):** the `PENDING_FILES`/`REMOTE_VERSIONS` enumeration is also vulnerable to a **malformed-but-HTTP-200** API response. The `APPLIED_HTTP != 200/201` guard (`migrate.sh:323-330`) only catches transport-level failure; a response that returns HTTP 200 with a truncated/malformed body is invisible to that guard, and JSON parsing swallows the error via `2>/dev/null || true` (`migrate.sh:333-341`), silently yielding an empty `REMOTE_VERSIONS`. Reproduced: an already-applied migration got misclassified as pending, shown to the human as "WILL be applied to PROD" (a lie — it's already live), and re-sent to the API. Harmless in the reproduction because the migration was idempotent (`CREATE TABLE IF NOT EXISTS`), but a non-idempotent migration would either fail loudly (fail-safe, via the P417 `_check_api_success` guard) or — worse — apply destructively a second time if it lacks that guard's protection.

## Invariants

- **The set of migrations a human acks (and that passes the coupling gate) must be the exact set that gets applied.** A gap between "what was shown" and "what was sent to prod" defeats the P887/P886 gates by construction, regardless of how good the gates themselves are.
- **A malformed API response must never be silently treated as "nothing here."** Empty-on-error is the dangerous default when "empty" also means "no pending migrations, apply everything without further gating."

## Reproduction Steps

See the P1168 adversarial-review transcript (2026-08-27, forgeable/racy lens) for exact hermetic reproductions of both mechanisms, run against a real scratch git repo with the existing PATH-stub pattern (`scripts/test-p1042-version-collision.sh`'s stub style). The double-glob race used a real filesystem write timed between the two globs; the malformed-response case stubbed `curl`'s ledger-SELECT response to return HTTP 200 with malformed JSON.

**Reproduction rate:** 100% — structural (two independent globs of the same directory; a real malformed-response path), not timing-flake.

## Expected Behavior

- The exact list of files a human acks (and that clears the coupling gate) is what actually gets applied — no more, no fewer.
- A malformed-but-200 API response is treated as an error (abort, don't proceed with an empty/wrong pending list), not as "no pending migrations."

## Actual Behavior

Both violated, per the reproductions above.

## Affected Files

- `scripts/migrate.sh:349-360` — `PENDING_FILES` enumeration (ack + coupling gate source)
- `scripts/migrate.sh:424` — apply loop, independent re-glob
- `scripts/migrate.sh:312-341` — ledger fetch + parse, swallows malformed-but-200 responses

## Severity

**High** — this defeats the exact prod-safety gates (P887, P886) that exist because of a real prior incident, on the shared checkout where a co-tenant's commit landing mid-run is a documented, routine occurrence (`.claude/rules/git.md`).

## Fix Approach

Not decided here — candidates:
- Have the apply loop iterate over `PENDING_FILES` directly instead of re-globbing the directory.
- If a fresh glob is intentional (e.g. to catch files that appeared), diff it against `PENDING_FILES` and abort loudly on any new file rather than silently applying it.
- For the malformed-response case: validate the parsed `REMOTE_VERSIONS`/`REMOTE_NAMES` shape (e.g. non-empty JSON array expected, or the raw body must parse as valid JSON) before trusting it as "no pending" — fail loud on malformed content, matching the existing `APPLIED_HTTP` guard's fail-safe intent rather than undermining it via a swallowed parse error.

## Acceptance Criteria

- [ ] A migration file that appears on disk after the ack prompt is shown (but before the apply loop runs) is NOT applied to prod without a fresh ack and coupling-gate scan
- [ ] A malformed-but-HTTP-200 ledger response causes the run to abort loudly, not silently proceed with an empty/wrong pending list
- [ ] Regression test using the existing hermetic stub pattern for both mechanisms

## Related

- **P1168** — the spec that triggered this discovery via adversarial review; unrelated fix (stamp/stage on no-op), does not touch this code path.
- `scripts/migrate.sh` header comment — documents P887 (explicit ack) and the `requires-frontend` coupling gate (P886 prevention) as the mechanisms this bug defeats.
