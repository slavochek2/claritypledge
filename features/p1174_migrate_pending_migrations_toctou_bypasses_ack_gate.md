---
status: qa
type: bug
rank: 79
severity: high
workstream: infrastructure
date_reported: '2026-08-27'
date_resolved: '2026-08-27'
root_cause: "Two independent globs of supabase/migrations/*.sql (the ack/coupling enumeration and the apply loop) — plus a ledger parse that swallowed a malformed-but-200 body into an empty applied-versions list"
resolution: "Prod gate 1b re-enumerates the pending set immediately before the apply loop and aborts on any difference; a shared _parse_ledger_rows helper fails loud on an unusable body while still accepting a well-formed empty ledger"
created_date: '2026-08-27'
tags: [migrations, prod-safety, tooling, concurrency]
drafted_by: sonnet
exec_model: opus
exec_effort: high
delivery_stage: fix
pipeline_ran: [create-bug, reproduce, fix]
reproduce_artifact:
  test_file: scripts/test-p1174-pending-set-integrity.sh
  root_cause: "migrate.sh globs supabase/migrations/*.sql twice — once to build PENDING_FILES (the acked + coupling-scanned set) and again to drive the apply loop — so any file landing between the two globs is applied to prod ungated; separately, the ledger parse swallows a malformed-but-200 body via `2>/dev/null || true`, yielding an empty REMOTE_VERSIONS that reads as 'nothing applied yet'"
  confidence: high
  surfaces_in_scope: [prod-interactive-ack, prod-yes-flag, ledger-fetch, preflight-ledger-check]
  surfaces_deferred: []
  reproduced_at: 2026-08-27
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

**Confirmed 2026-08-27 by `scripts/test-p1174-pending-set-integrity.sh`** (hermetic: throwaway git repo, PATH-stubbed `npx`/`curl`/`security`, no network, no real DB). The interactive scenario runs `migrate.sh` under `script(1)` so `[ -t 0 ]` is true and the real y/N prompt is exercised; the co-tenant's file is written only after the prompt has appeared in the session log, so the race is ordered by observation, not by a sleep. Observed session output:

```
Pending migrations (1) — these WILL be applied to PROD:
  - 20260101000000_p1174_acked.sql

Apply these 1 migration(s) to PROD? [y/N] y
Acknowledged.

  ✓ 20260101000000_p1174_acked.sql applied
  ✓ 20260101000001_p1174_sneaky.sql applied

Applied 2 new migration(s) via Management API.
```

The human acked one file; prod received two. The injected file carried `-- requires-frontend: deadbeef…` for a sha that is not on `origin/main` — had it reached the coupling gate it would have hard-blocked the entire run (P886). It never did, because the gate only ever sees `PENDING_FILES`.

The same injection on the `--yes` path (injected during the coupling gate's own `git merge-base` call, which sits strictly between the two globs) reproduces identically — the window is not an artifact of a human reading the prompt.

**Scenario audit (Track B) — every way the acked set can diverge from the applied set:**

| # | Scenario | Pre-fix | Covered by |
|---|----------|---------|-----------|
| 1 | prod, interactive ack, file lands during the prompt | unguarded ✗ | canary `race_inject` |
| 2 | prod, `--yes`, file lands during the coupling scan | unguarded ✗ | canary `race_inject_yes` |
| 3 | prod, a pending file is *removed* during the window | acked set ≠ applied set | same divergence check (set comparison is symmetric) |
| 4 | prod, **zero** pending at enumeration, file lands after | worst case — no prompt is shown at all | same divergence check: it runs outside the `if [ ${#PENDING_FILES[@]} -eq 0 ]` branch, so the empty case is not a separate path. Not raced independently (no observable window to synchronise on in the empty branch); covered by construction, and by canary `empty-ledger-is-valid` proving the block is reached on an empty-pending run. |
| 5 | non-prod run | no ack gate exists there — not a defect | canary `test-env-unaffected` guards against the fix leaking into it |

**Mechanism B reproduction:** a ledger SELECT returning HTTP 200 with a truncated body (`[{"version":"…","name":"…"`) leaves `REMOTE_VERSIONS` empty; the already-applied migration is then printed to the operator as "WILL be applied to PROD" and its SQL is re-sent to the API. Confirmed by canary scenario `malformed_ledger`. Scenario `empty_ledger` proves the fix must distinguish *parse failure* from a well-formed empty ledger (`[]`, a fresh project), which is legitimately "nothing applied yet".

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

- [x] A migration file that appears on disk after the ack prompt is shown (but before the apply loop runs) is NOT applied to prod without a fresh ack and coupling-gate scan
- [x] A malformed-but-HTTP-200 ledger response causes the run to abort loudly, not silently proceed with an empty/wrong pending list
- [x] Regression test using the existing hermetic stub pattern for both mechanisms

## Related

- **P1168** — the spec that triggered this discovery via adversarial review; unrelated fix (stamp/stage on no-op), does not touch this code path.
- `scripts/migrate.sh` header comment — documents P887 (explicit ack) and the `requires-frontend` coupling gate (P886 prevention) as the mechanisms this bug defeats.


---

## Resolution

**Fixed:** 2026-08-27 · `scripts/migrate.sh`

**Mechanism A — prod gate 1b (`migrate.sh`, between the ack branch and the apply loop).**
The pending set is re-enumerated from disk immediately before the apply loop and compared
against `PENDING_FILES`. Any difference in either direction — a file that appeared, or one
that vanished — prints the drift and exits 1 with nothing applied.

Design choice: **abort, not re-prompt.** Re-prompting inside the same run would re-open the
identical window, and the requires-frontend coupling gate must run against a set the operator
has actually read. A fresh `./scripts/migrate.sh --env prod` gives both, from scratch.

The block sits deliberately *outside* the `if [ ${#PENDING_FILES[@]} -eq 0 ]` branch: the
empty case is the worst one — a file landing then is applied with no prompt shown at all —
so it must not be a separate path that could be missed.

Belt-and-braces: the apply loop now also refuses, on prod, to apply any basename absent from
`PENDING_FILES`. Unreachable while gate 1b holds, and kept: the bug class here is precisely
"a second glob of this directory was trusted", and that loop's glob is the second one.

**Mechanism B — `_parse_ledger_rows()`.** One helper replaces both open-coded
`python3 … 2>/dev/null || true` parses (the main ledger fetch and
`preflight_ledger_name_check`). It exits 1 on anything that is not a well-formed list of
row objects carrying `version`, and exits 0 with no output on a genuinely empty ledger —
the two must never collapse into each other, because `[]` is legitimate on a fresh project
while an unparseable body is not. The main fetch treats exit 1 as fatal; the preflight
collision scan degrades to a WARNING, matching its existing behavior on an HTTP failure
(it is an advisory scan, not a gate on what gets applied) — the run still stops at the main
fetch before anything is applied.

This extends the `_check_api_success()` principle from P417 (decisions.md: "Supabase
Management API returns HTTP 200 with a JSON error object when SQL fails") from the *write*
path to the *read* path, which had been left on status-code-only validation.

**Files changed:** `scripts/migrate.sh` (header gate list, `_parse_ledger_rows`, preflight
call site, main ledger fetch, prod gate 1b, apply-loop membership guard).

**Regression test:** `scripts/test-p1174-pending-set-integrity.sh` — 13 assertions, 4 of
them no-false-positive guards (undisturbed prod run still applies; non-prod fallback
untouched; well-formed empty ledger still applies). Failed 9/13 before the fix, passes
13/13 after. Sibling canaries unaffected: `test-p1168-noop-stamp.sh` 9/9,
`test-p1042-version-collision.sh` 10/10.

**Known limits of the test (epistemic gate 7b — what the fixture cannot emit):**
- The apply-loop membership guard is unreachable while gate 1b holds, so it is **not
  exercised** by any assertion. It is defence in depth, unverified by construction.
- Scenario 4 in the audit table (zero pending at enumeration, file lands after) is not
  raced independently: the empty branch offers no observable window to synchronise on. It
  shares gate 1b's single code path with the raced scenarios, and `empty-ledger-is-valid`
  proves that path is reached on an empty-pending run — but it is covered by construction,
  not by its own race.
- `curl` is PATH-stubbed, so no real Management API response shape is exercised. A body
  that is well-formed JSON but semantically wrong (correct shape, wrong rows) is outside
  what either mechanism detects.
