---
status: in-progress
type: bug
rank: 1000965.0
severity: high
workstream: security
date_reported: '2026-08-10'
created_date: '2026-08-10'
tags: [security, rls, ci, tooling]
delivery_stage: reproduce
pipeline_ran: [create-bug, reproduce]
reproduce_artifact:
  test_file: src/tests/p1041-reproduce.test.ts
  root_cause: "_strip_strings_and_comments() in scripts/check-rls-scope.py only blanks single-quoted strings and -- line comments; double-quoted identifiers, /* */ block comments, and $$...$$ dollar-quoted strings are scanned as live SQL, letting a policy's own name (or unrelated file content) satisfy the TO-clause check or desync the tokenizer entirely. Separately, TO PUBLIC is accepted as sufficient scoping, ALTER POLICY is never scanned, the role-identity regex misses current_role/current_user/session_user/auth.jwt()->>'role', and an unreadable/missing file silently passes."
  confidence: high
  surfaces_in_scope: [double-quoted-identifiers, block-comments, dollar-quoted-strings, to-public-scoping, alter-policy-to-public, role-identity-regex-breadth, unreadable-file-fail-open, diff-filter-modified-migrations]
  surfaces_deferred: []
  reproduced_at: '2026-08-10'
---

# P1041: RLS-scope pre-commit gate (P1039) has false negatives on its own target vulnerability

## Summary

`scripts/check-rls-scope.py` (shipped in P1039 to prevent recurrence of the P1035 unscoped-RLS-policy
incident) reports `ok` on the exact P1035 vulnerability shape when the offending policy's name is a
double-quoted identifier containing the word "to" or "for select" — confirmed against four real,
already-committed migrations in this repo. Additional confirmed false negatives: `$$...$$` dollar-quoted
strings and `/* */` block comments are not modeled by the tokenizer, and editing a migration in a
follow-up commit is never scanned at all (the wiring only checks newly-added files, not the
"new/modified" scope the P1039 spec itself specified).

Found via `/slava:think:adversarial-review` (5 hostile reviewers, diverse lenses) run against the
just-shipped P1039 gate. Every finding below was independently reproduced by me (not taken on a
reviewer's word) with actual commands and actual output before being included here.

## Root Cause

`_strip_strings_and_comments()` in `scripts/check-rls-scope.py` only blanks single-quoted string
literals and `--` line comments before running the `TO`-clause / `FOR`-command regexes. It does not
blank:
- Double-quoted identifiers (policy/table/column names) — so a policy's own name is scanned as if it
  were live SQL syntax.
- `/* */` block comments (any nesting).
- `$$...$$` / `$tag$...$tag$` dollar-quoted strings.

An apostrophe inside an unmodeled construct (block comment, dollar-quoted body) desyncs the tokenizer's
single-quote-string tracking and silently blanks everything after it in the file, including any later
`CREATE POLICY` statement.

Separately, `scripts/pre-commit-checks.sh` selects migrations via `git diff --cached --diff-filter=A`
(added-only) for both this check and its sibling `check-migration-client-safety.sh` (shared
`$NEW_MIGRATIONS` variable) — but the P1039 spec's own Solution section says the check should scan
"new/modified migration files." `modified` was dropped in the wiring, so fixing (or breaking) a
migration in a second commit on the same branch is never scanned.

## Reproduction Steps

1. `python3 scripts/check-rls-scope.py supabase/migrations/20260216_fix_position_history_rls.sql`
2. Observe: `ok: 20260216_fix_position_history_rls.sql (no unscoped role-restricting policies)`, exit 0
3. Compare to the file's actual content — a verbatim P1035 shape:
   ```sql
   CREATE POLICY "Allow trigger to insert position history"
     ON public.point_position_history
     FOR INSERT
     WITH CHECK (true);
   ```
4. Rename the policy only (remove the word "to") and re-run — the checker now reports `VIOLATION`,
   proving the name is the sole masking agent.

Same shape confirmed in `supabase/migrations/20260220120000_story_point_history_cascade.sql`,
`20260325120000_p586_visibility_privacy_foundation.sql`, and
`supabase/migrations/20260302130000_story_versions_insert_policy_v2.sql` (via `current_user = 'postgres'`,
a role-identity form the checker doesn't recognize at all — see HIGH findings below).

**Reproduction rate:** 100% — deterministic, not timing/environment dependent.

**Scope note (accuracy, not overclaiming):** the position-history and story-point-history policies were
later superseded by other migrations, so there is no live prod exposure from these four files today. The
significance is that this codebase has produced the P1035 shape, under this repo's own natural
policy-naming convention, at least four times — and the gate built specifically to catch that shape
passes all four.

## Expected Behavior

`check-rls-scope.py` reports `VIOLATION` and exits non-zero on any non-SELECT `CREATE POLICY` whose
`USING`/`WITH CHECK` is a literal `true` or a role-identity function, with no `TO <role>` clause —
regardless of what the policy's own name happens to contain, and regardless of `/* */` or `$$` syntax
elsewhere in the file.

## Actual Behavior

Reports `ok`, exit 0, on the exact target vulnerability shape whenever the policy name contains "to" or
"for select" as an isolated word, or whenever an apostrophe inside a block comment or dollar-quoted
string precedes the `CREATE POLICY` statement in the same file.

## Affected Files

- `scripts/check-rls-scope.py` — `_strip_strings_and_comments()` (tokenizer, ~line 57), `ROLE_IDENTITY_RE`
  (~line 51), `TO_CLAUSE_RE` (~line 46), `LITERAL_TRUE_RE` (~line 47), `main()`'s
  `except OSError: continue` (~line 145)
- `scripts/pre-commit-checks.sh` — `NEW_MIGRATIONS` (`--diff-filter=A`, ~line 896), shared by both the
  P1039 and P887 (`check-migration-client-safety.sh`) invocations
- `src/tests/p1039-reproduce.test.ts` — needs one regression fixture per finding below, each proven to
  fail before the fix and pass after

## Severity

**High** — this is a security gate for a real, previously-exploited, 6-month prod-exposure incident
class. It is not currently doing the job it was built for, and the failure mode is silent (`ok`, not an
error). Not Critical because there is no evidence of *current* live prod exposure from this specific gap
(the four real instances found were all superseded by later migrations before this gate existed).

## Fix Approach

Rewrite the tokenizer to also blank double-quoted identifiers, nesting-aware `/* */` block comments, and
`$$...$$`/`$tag$...$tag$` dollar-quoted strings (same length-preserving approach already used for
single-quoted strings — output stays position-stable, `\n` preserved). This closes the CRITICAL findings
in one shared code path.

Also, in the same pass:
- Widen `ROLE_IDENTITY_RE` to recognize `current_role`, `current_user`, `session_user` (bare SQL
  keywords) and `auth.jwt() ->> 'role'` (the dominant modern Supabase idiom) in addition to the existing
  `current_setting('role')` / `auth.role()`.
- Treat a `TO` clause whose role list contains `public` (case-insensitive) as NOT sufficient scoping —
  `PUBLIC` is exactly the unscoped case this gate exists to catch. Add a separate check for
  `ALTER POLICY ... TO PUBLIC` (currently invisible — only `CREATE POLICY` is scanned).
- Replace `except OSError: continue` with a printed error + `fail = True` — an unreadable/missing staged
  file must block, not silently pass.
- Widen `scripts/pre-commit-checks.sh`'s `NEW_MIGRATIONS` from `--diff-filter=A` to `--diff-filter=AM`,
  restoring the spec's originally-stated "new/modified" scope for both this check and
  `check-migration-client-safety.sh`.

Explicitly **out of scope for this bug** (defer to a fast-follow or separate tracked item):
- MEDIUM: `-- intentionally-public:` annotation matched against raw (unblanked) content — smuggleable
  inside a string/comment/dollar-quoted body; the "ok" message doesn't disclose when violations were
  exempted; `((true))` / `1=1` / `NOT false` / `true::boolean` tautology forms not recognized.
- Repo-wide, beyond this script: a **clean** (non-conflicting) `git cherry-pick` does not fire the
  pre-commit hook (verified with a scratch-repo control, 3x) — so most `git-ops.sh ship` merges never
  re-run any pre-commit check at merge-to-main time. (A cherry-pick that hits a conflict and completes
  via `--continue` *does* fire the hook — verified separately — matching the historical P787 incident;
  the gap is specifically in the common clean-merge path, not cherry-pick generally.) Also: the checker
  (like most content-based pre-commit checks in this repo) reads the working-tree file rather than the
  staged git blob, and `git add -N` (intent-to-add) makes a file invisible to `git diff --cached` while
  still committable via the `git commit -- <path>` form this repo's own `.claude/rules/git.md` mandates.
  Both affect the whole pre-commit architecture, not this script specifically.

## Acceptance Criteria

- [ ] `python3 scripts/check-rls-scope.py supabase/migrations/20260216_fix_position_history_rls.sql`
      reports `VIOLATION` (proves the fix against real repo content, not just a synthetic fixture)
- [ ] Same for `20260220120000_story_point_history_cascade.sql`, `20260325120000_p586_visibility_privacy_foundation.sql`
- [ ] `20260302130000_story_versions_insert_policy_v2.sql` (`current_user = 'postgres'`, no TO) reports `VIOLATION`
- [ ] A fixture with an apostrophe inside a `/* */` block comment before an unscoped `CREATE POLICY` in
      the same file still reports `VIOLATION` for that policy
- [ ] A fixture with an apostrophe inside a `$$...$$` body before an unscoped `CREATE POLICY` in the
      same file still reports `VIOLATION` for that policy
- [ ] A fixture with `TO PUBLIC` (bare, or in a role list alongside a real role) on a `true`/role-identity
      policy reports `VIOLATION`
- [ ] A fixture with `ALTER POLICY ... TO PUBLIC` widening an otherwise-correctly-scoped policy reports
      `VIOLATION`
- [ ] An unreadable or missing staged file produces a printed error and a non-zero exit, not silent `ok`
- [ ] A migration modified (not newly added) in a second commit on the same branch is scanned by
      `pre-commit-checks.sh` (verify via a two-commit branch simulation, matching the P1039 reproduce
      test's harness style)
- [ ] Full run against every file in `supabase/migrations/` shows zero new false positives relative to
      the pre-fix checker (i.e. every currently-`ok` file that should stay `ok` still does)
- [ ] All existing `src/tests/p1039-reproduce.test.ts` cases still pass (no regression), plus one new
      fixture per finding above, each proven to fail before the fix and pass after
