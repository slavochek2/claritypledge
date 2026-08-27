---
status: week
type: bug
rank: 75
severity: medium
workstream: infrastructure
date_reported: '2026-08-27'
created_date: '2026-08-27'
tags: [migrations, deploy-manifest, tooling]
drafted_by: sonnet
exec_model: sonnet
exec_effort: medium
delivery_stage: create-bug
pipeline_ran: [create-bug]
---

# P1170: `migrate.sh`'s primary CLI path may stamp the deploy manifest on a genuine no-op push — unverified this session, needs an environment where the CLI actually succeeds

## Summary

`scripts/migrate.sh:265-273` stamps `supabase/deploy-manifest.json` unconditionally whenever `supabase db push` exits 0 — including a genuine no-op (nothing pending) — with no check on whether anything was actually pushed. Same defect class as P1168 (fixed: the Management API fallback path stamped unconditionally on `APPLIED_COUNT == 0`), but this one is in the **primary** CLI path and was never fixed alongside it because it could not be verified.

## Root Cause

```bash
PUSH_OUTPUT=$(npx supabase db push -p "$DB_PASSWORD" 2>&1) && PUSH_EXIT=0 || PUSH_EXIT=$?

if [ $PUSH_EXIT -eq 0 ]; then
    echo "$PUSH_OUTPUT"
    echo ""
    # Stamp deploy manifest after successful migration
    "$SCRIPT_DIR/stamp-deploy-manifest.sh" --env "$ENV_NAME" --migrations-only
    echo "Done."
    exit 0
fi
```

`supabase db push` exits 0 on a no-op (nothing pending) exactly as it does on a real push — this branch has no way to distinguish the two. Unlike the fallback path (P1168), it doesn't `git add` the result, so the "leaves it staged on a shared checkout" half of P1168 doesn't apply here — only the "stamps a deploy that didn't happen" half does.

**Why this wasn't fixed alongside P1168 (2026-08-27 session):** the test project's migration history currently carries pre-existing drift (local/remote timestamp mismatches unrelated to this bug — several bare-vs-timestamped version pairs disagree between `npx supabase migration list`'s Local and Remote columns). Every `./scripts/migrate.sh` run against this project's CLI fails with `"Remote migration versions not found in local migrations directory"` and falls through to the Management API fallback before this branch is ever reached — confirmed by direct execution + full output capture this session (`/tmp/migrate_out.log`, line 280). The true CLI-success no-op case (this exact `if [ $PUSH_EXIT -eq 0 ]` branch, with genuinely nothing to push) could not be observed, so no fix could be written without guessing at unconfirmed CLI output text — a hard stop under this repo's "Falsify Before You Rely" rule (never assert unverified tool behavior).

## Invariants

- **A record of a deployment is written only when a deployment occurred** (same invariant as P1168 — the field's semantics were settled there: `migrations_deployed_at` means "when migrations were last applied," not "when last verified").

## Reproduction Steps

**Blocked in this environment.** Needs either: (a) a test/local Supabase project with clean, drift-free migration history so `supabase db push` actually succeeds via the primary path, or (b) resolving the pre-existing local/remote timestamp drift on the current test project first (separate, out of scope here — not a P1168/P1170 concern).

1. On a project where `supabase db push` succeeds (exit 0) with nothing pending
2. Run `./scripts/migrate.sh` (no `--env` flag, or `--env test`)
3. Observe: manifest's `test.migrations_deployed_at` (or the relevant env key) advances even though nothing was pushed

**Reproduction rate:** unverified — 0/1 attempts reached this code path (fell through to fallback both times)

## Expected Behavior

`migrations_deployed_at` only advances when `supabase db push` actually applied at least one migration.

## Actual Behavior

Unverified — inferred from reading the code; the branch stamps unconditionally on any exit-0 push per the code shown above.

## Affected Files

- `scripts/migrate.sh:265-273` — the primary CLI-success branch

## Severity

**Medium** — same class as P1168 but narrower blast radius (no shared-checkout staging side effect, since this branch doesn't `git add`). Downgraded from P1168's original medium mainly because the fallback path (fixed) already absorbs the common real-world case in this repo's current environment (CLI fails → fallback → the P1168 fix applies).

## Fix Approach

Once reproducible: determine a verified signal for "nothing was pushed" from the real `supabase db push` output or exit behavior (do not guess at exact CLI text — capture and read the actual output first). Candidate approaches to evaluate against real output:
- Parse `$PUSH_OUTPUT` for a positive "applied N migrations" signal rather than inferring from absence
- Use `supabase db push --dry-run` (confirmed to exist via `--help` this session) as a pre-check, mirroring the prod path's "enumerate pending, then apply" pattern already used at `migrate.sh:349-360`

Gate the `stamp-deploy-manifest.sh` call on that signal, matching the `APPLIED_COUNT -gt 0` gate P1168 added to the fallback path.

## Acceptance Criteria

- [ ] The primary CLI-success path's actual output for a genuine no-op is captured and pasted into this spec (`## Root Cause` or a new evidence section) — replacing "unverified" with a real observation
- [ ] `migrations_deployed_at` does not advance when `supabase db push` succeeds with nothing pending
- [ ] `migrations_deployed_at` still advances correctly when `supabase db push` succeeds with migrations actually applied
- [ ] No regression to the existing `test-p1042-version-collision.sh` canary (which stubs `npx` and exercises both the CLI-success and fallback paths)

## Related

- **P1168** — same defect class, Management API fallback path (fixed 2026-08-27). This spec is the deferred remainder.
