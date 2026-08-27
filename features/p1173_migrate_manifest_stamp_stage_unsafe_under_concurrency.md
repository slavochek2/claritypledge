---
status: qa
type: bug
rank: 78
severity: high
workstream: infrastructure
date_reported: '2026-08-27'
date_resolved: '2026-08-27'
created_date: '2026-08-27'
tags: [migrations, deploy-manifest, shared-checkout, tooling, concurrency]
drafted_by: sonnet
exec_model: opus
exec_effort: high
delivery_stage: fix
pipeline_ran: [create-bug, reproduce, fix]
reproduce_artifact:
  test_file: scripts/test-p1173-manifest-stamp-concurrency.sh
  root_cause: "stamp-deploy-manifest.sh reads whatever is on disk as its merge baseline and writes back through a truncating redirect with no lock; migrate.sh then stages the whole file and swallows every git-add failure"
  confidence: high
  surfaces_in_scope: [stamp-deploy-manifest-write, migrate-stage-manifest]
  surfaces_deferred: []
  reproduced_at: 2026-08-27
---

# P1173: `migrate.sh`'s manifest stamp+stage sequence is unsafe under concurrent sessions — absorbs bystander edits, swallows lock failures, races other stamps

## Summary

Surfaced by adversarial review of P1168 (2026-08-27, 3 hostile reviewers, all findings independently reproduced with real commands). `scripts/migrate.sh:493`'s `git -C "$PROJECT_DIR" add supabase/deploy-manifest.json` and `scripts/stamp-deploy-manifest.sh`'s read-merge-write are not safe on the shared main checkout that multiple concurrent Claude Code sessions run against — three distinct, converging fragility mechanisms, all pre-existing (not introduced by P1168, which only added a conditional gate in front of this same sequence).

## Root Cause

Three related mechanisms, same underlying gap (no locking, no freshness check, around a shared-checkout file):

**1. Dangling-edit absorption (the most severe — directly undercuts the incident class P1168 cites as motivation).** `stamp-deploy-manifest.sh:53` does `EXISTING=$(cat "$MANIFEST")` — reads whatever is currently on disk, with no check that it matches `HEAD`, before merging in the new stamp and overwriting. `migrate.sh:493`'s `git add supabase/deploy-manifest.json` then stages the ENTIRE current file content, whatever it is. Reproduced (adversarial reviewer, forgeable/racy lens): a co-tenant's earlier dangling edit sitting uncommitted on disk (e.g. from finding #2 below) gets read as this run's baseline, merged in, and staged alongside this run's legitimate stamp — attributed to a session that never wrote it. This is the literal shape of `decisions.md` 2026-08-23 and 2026-08-25, reproduced through this script's own `git add` line.

**2. Swallowed index.lock failure.** `migrate.sh:493`'s `2>/dev/null || true` masks every failure mode of the `git add`, including a concurrent session holding `.git/index.lock` (a live, documented concern per `.claude/rules/git.md`). Reproduced: with a held lock, `git add` exits 128 (real error), but migrate.sh swallows it and still prints `"Staged supabase/deploy-manifest.json — commit it..."` — a false success message. The edit is left on disk, uncommitted AND unstaged, with zero signal anything went wrong.

**3. No lock, lost-update race.** `stamp-deploy-manifest.sh`'s read→merge→write is non-atomic (plain `>` redirect at the end, no temp-file+rename, no `flock` anywhere in `scripts/` — confirmed via `grep -rn flock scripts/`). Reproduced: two genuinely concurrent `migrate.sh` invocations (different envs), one slow, one fast — the fast one's real stamp is silently clobbered by the slow one's later write. `git-ops.sh` already has a working lock primitive (`LOCK_PID`/nonce/heartbeat, used by `commit-to-main`) that this path doesn't use.

**5. Truncate-on-failure (found during reproduction, not in the original report).** `stamp-deploy-manifest.sh:99-124` is `python3 -c "..." > "$MANIFEST"` — the shell truncates `$MANIFEST` to zero bytes *before* python starts. Any merge failure (malformed JSON on disk, e.g. a partially-written file left by mechanism 3) therefore destroys the manifest outright rather than leaving it unchanged. Reproduced: manifest is 0 bytes after a failed stamp. Closed for free by the atomic-write fix this spec already names, so it is treated as in scope rather than deferred.

**4. `set -e` non-atomicity (related, smaller).** The `then` branch of P1168's new gate (migrate.sh:485-494) is ordinary sequential commands under `set -e`. If `stamp-deploy-manifest.sh` (called first) fails *after* it has already written the file but before `git add` runs, migrate.sh aborts immediately — the file is now rewritten on disk but never staged, and the script reports overall failure (exit 1) even though a real migration may have applied successfully.

## Invariants

- **A manifest write must never be based on unverified on-disk state.** Before reading `supabase/deploy-manifest.json` as a merge baseline, or staging it, the actor must know whether the working-tree content matches `HEAD` — silently trusting "whatever's on disk right now" is what absorbs a bystander's edit.
- **Concurrent stamps to the same manifest must not silently clobber each other.** The 2026-08-23/2026-08-25 incidents and this session's reproduction are the same failure shape: unsynchronized writers to one shared file.

## Reproduction Steps

See the P1168 adversarial-review transcript (2026-08-27) for exact hermetic reproductions of all three mechanisms — each was run against a real scratch git repo with real timing (backgrounded processes + `wait`, an artificially-held `.git/index.lock` to force a realistic contention window). Re-derive with the same hermetic stub pattern used in `scripts/test-p1168-noop-stamp.sh` and `scripts/test-p1042-version-collision.sh` (PATH-stub `npx`/`curl`/`security`, throwaway git repo).

**Reproduction rate:** 100% for all three — these are structural, not timing-dependent flakes (the index.lock and concurrent-process scenarios were induced deliberately to demonstrate the mechanism; on the real shared checkout the trigger is any co-tenant `git add`/`git commit` traffic overlapping a `migrate.sh` run, which `git.md` already documents as routine).

## Expected Behavior

- A `migrate.sh` stamp run never merges in or stages content it didn't itself write this run.
- A `git add` failure (lock contention or otherwise) is surfaced, not swallowed into a false "Staged..." message.
- Two concurrent stamp writes to the same manifest either serialize (lock) or both survive (no lost update).

## Actual Behavior

All three violated, per the reproductions above.

## Affected Files

- `scripts/migrate.sh:493` — unconditional `git add`, swallowed failure
- `scripts/stamp-deploy-manifest.sh:53-57, 99-124` — read-merge-write, no freshness check, non-atomic write

## Severity

**High** — this is the exact incident class (`decisions.md` 2026-08-23, 2026-08-25) the P1168 spec names as its motivating harm, reproduced through a path P1168 doesn't touch. Not urgent-blocking (no active incident right now), but next occurrence is a repeat, not a novel failure.

## Fix Approach

Needs real design, not a quick patch — candidates to evaluate, not a decision made here:
- Route the manifest stamp+stage through `git-ops.sh`'s existing lock primitive (the one `commit-to-main` already uses) instead of migrate.sh doing its own unguarded `git add`.
- `stamp-deploy-manifest.sh` checks `git diff HEAD -- supabase/deploy-manifest.json` is empty before treating on-disk content as a safe merge baseline; abort/warn instead of silently absorbing dirty state.
- Atomic write (temp file + rename) in `stamp-deploy-manifest.sh` to close the lost-update race, independent of any locking fix.
- Surface (don't swallow) `git add` failures — remove or narrow the `2>/dev/null || true`.

## Acceptance Criteria

- [x] A dangling bystander edit to `supabase/deploy-manifest.json` cannot be absorbed into another session's stamp commit — either detected and refused, or made structurally impossible
- [x] `git add` failures (e.g. index.lock contention) are surfaced to the operator, not silently swallowed with a false "Staged..." message
- [x] Two concurrent `migrate.sh` stamp runs cannot silently lose one session's write — either serialized or merged correctly
- [x] Regression test using the existing hermetic stub pattern for at least the dangling-edit-absorption case (the highest-severity, most directly-relevant-to-cited-incidents finding)

## Resolution

**Fixed:** 2026-08-27 · **Regression test:** `scripts/test-p1173-manifest-stamp-concurrency.sh` (12 assertions)

`scripts/stamp-deploy-manifest.sh` — three changes, all before/around the read-merge-write:

1. **Exclusive lock** (`supabase/.deploy-manifest.lock`) held across read→merge→write, using the same atomic hard-link (`ln`) primitive `git-ops.sh` uses for `main.lock` — `flock` is not on stock macOS. Placed here rather than in `migrate.sh` because *every* writer converges on this script (`migrate.sh`, `deploy-functions.sh`, standalone runs); a lock in `migrate.sh` would not serialize the other two. A lock whose holder is gone is broken with a notice; a live holder's lock is waited on, then reported, never stolen.

    Staleness is decided on PID **and** recorded process start time (mirroring `git-ops.sh`'s `classify_lock_state`), so a recycled PID cannot disguise a dead holder as a live one. The break itself claims the file by `mv` before deleting it: `rename(2)` is atomic, so when several waiters spot the same stale lock only the one that wins the move may delete it — deleting `$LOCKFILE` directly let a loser delete the *new* lock the winner had meanwhile acquired (code-review finding, a TOCTOU in the very race the lock exists to close).
2. **Shape-aware dirty refusal.** If the working-tree manifest differs from `HEAD`, the difference is classified: changes confined to the fields a stamp writes (`functions`, `functions_deployed_at`, `migrations`, `migrations_deployed_at`, under any env key) are stamp output and are allowed through with a note; anything else — a foreign top-level key, a non-dict env value, unparsable JSON — is refused with the offending diff and three named resolutions. `--allow-dirty` bypasses the classification entirely; `migrate.sh` never passes it.

    A blanket "differs from `HEAD`" refusal was the first implementation and code review reproduced it breaking the tool's own documented workflow: `migrate.sh` stamps **and stages**, expecting a later commit, so the manifest is routinely dirty when the next run starts — a second `migrate.sh` before that commit hard-failed, with an error message that wrongly blamed another session. The shape test keeps the refusal for foreign content (staged or not) while letting the sequential case through.

    **Residual, stated honestly:** a co-tenant's *stamp-shaped* uncommitted leftover is merged and staged rather than refused, because it is byte-for-byte indistinguishable from this tool's own prior output. The merge preserves it rather than dropping it, so the outcome is a correct manifest committed under the wrong session's name — strictly milder than the incident class this spec cites, but not zero. Refusing it would require per-session provenance the script does not have.
3. **Atomic write.** `python3 ... > "$MANIFEST"` truncated the file to zero bytes *before* python ran, so any merge failure destroyed the manifest. Now builds into a sibling temp file and `mv`s it into place.

`scripts/migrate.sh` — the stamp+stage sequence no longer relies on `set -e` or `|| true`:

4. Stamp failure and staging failure are each checked explicitly and reported with the recovery command, **at both stamp call sites** — the Management-API fallback path and the primary `supabase db push` path (line 271), which code review found unguarded. That path is the default `./scripts/migrate.sh` invocation; under bare `set -e` a stamp refusal aborted it with no sign the push had already succeeded, which reads as a failed migration and invites a blind re-run.
5. `STAMP_FAILED` defers the non-zero exit until *after* the mandatory P887 prod smoke gate, so a manifest problem can never suppress a schema-ahead-of-client check.
6. A *missing git checkout* is distinguished from a *refused write*: only the latter is fatal. Without this, every non-repo invocation of `migrate.sh` fails (caught by the P1042 canary, which runs outside a repo).

**Verified both directions.** The canary runs against pre-fix scripts via `P1173_MIGRATE_SRC` / `P1173_STAMP_SRC`: **11 of its 16 assertions FAIL pre-fix and pass post-fix.** The other 5 must pass in both directions — three no-false-positive guards (a clean run still applies, stamps and stages) and two regression guards against *this fix* rather than the original bug (`no-repo-is-not-a-failure`, `sequential-stamp-allowed`), both of which describe behavior that was already correct before the change.

**Neutral to adjacent work:** P1174's canary (on `main`, red pending its own fix) returns an identical 4-passed/9-failed against this branch's `migrate.sh` and against `main`'s, so this change neither fixes nor worsens it.

**Known limits of the fixture** (gate 7b): every scenario runs against a throwaway repo with PATH-stubbed `npx`/`curl`/`security`. It does not exercise a real concurrent `/ship`, a real Management API, or contention on the actual shared checkout — only the mechanisms above, hermetically. Two specific gaps remain unmodelled: **multi-waiter** stale-lock contention (scenarios 6, 7 and 11 each use a single waiter, so the rename-based break is reasoned-correct but not observed under real contention), and the stamp-shaped-leftover residual described under change 2, which the fixture cannot distinguish by construction.

## Related

- **P1168** — the spec that triggered this discovery via adversarial review; fixed the "stamp when nothing applied" defect, does not close this one.
- `decisions.md` 2026-08-23 — uncommitted leftovers on the shared main checkout are not inert
- `decisions.md` 2026-08-25 — a manifest leftover from a `migrate.sh` workaround was absorbed by a co-tenant's unrelated commit
- `.claude/rules/git.md` — "Concurrent sessions share the main checkout's index AND HEAD"; documents `git-ops.sh commit-to-main` as the only construct that holds a lock across a full staging+commit sequence on the shared checkout
