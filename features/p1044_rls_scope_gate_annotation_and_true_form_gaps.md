---
status: week
type: bug
rank: 1000968.0
severity: medium
workstream: security
date_reported: '2026-08-11'
created_date: '2026-08-11'
tags: [security, rls, ci, tooling]
delivery_stage: create-bug
pipeline_ran: [create-bug]
---

# P1044: RLS-scope gate — annotation smuggling, silent exemption, and missed literal-true forms

## Summary

Three MEDIUM-severity gaps in `scripts/check-rls-scope.py` (the P1039/P1041 RLS-scope pre-commit gate),
found during P1041's adversarial review but explicitly scoped out of that fix to keep it tight: the
`-- intentionally-public:` exemption annotation is matched against raw file content and can be smuggled
inside a string/comment/dollar-quoted body; the pre-commit output doesn't disclose when a violation was
actually found-and-exempted (reads identically to "nothing found"); and the literal-`true` detector
misses semantically-equivalent forms like `((true))`, `true::boolean`, `1=1`, `NOT false`.

## Root Cause

1. **Annotation smuggling** — `ANNOTATION_RE.search(content)` in `main()` runs against the raw,
   unblanked file content, while every other check in the script runs against a tokenizer-cleaned copy
   (`_strip_noise()`, added in P1041) specifically so string/comment content can't be mistaken for real
   SQL. The annotation check was never brought in line with that principle: a string literal, a `/* */`
   block comment, or a `$$...$$` function body containing the literal phrase
   `-- intentionally-public: ...` still matches and exempts the entire file.

2. **Silent exemption** — in `main()`, the branch `if violations and not has_annotation:` prints the
   VIOLATION block; the `else` branch (which also covers `violations and has_annotation`) always prints
   the generic `ok: <file> (no unscoped role-restricting policies)` — which is factually false when
   violations exist and were merely suppressed by the annotation. A human skimming pre-commit output
   cannot tell "nothing was found" from "something was found and exempted."

3. **Missed true-equivalent forms** — `LITERAL_TRUE_RE = re.compile(r"\b(USING|WITH\s+CHECK)\s*\(\s*true\s*\)", ...)`
   requires the parenthesized content to be exactly the bare token `true`. Redundant parens
   (`USING ((true))`), an explicit cast (`WITH CHECK (true::boolean)`), or trivial tautologies
   (`USING (1=1)`, `USING (NOT false)`) all evaluate identically to `true` at runtime but don't match the
   regex.

## Reproduction Steps

1. Annotation smuggling:
   ```sql
   INSERT INTO public.docs (body) VALUES ('
   -- intentionally-public: example text shown in the docs page
   ');

   CREATE POLICY "points_test_data_service_role_only" ON public.points
     FOR INSERT
     WITH CHECK (current_setting('role') = 'service_role');
   ```
   Run `python3 scripts/check-rls-scope.py <file>` — reports `ok`, exit 0. The annotation text is inside
   a string literal value, not a real `--` comment written by the author.

2. Silent exemption: any file with a real, legitimate annotation AND a genuine violation both print the
   same `ok: <file> (no unscoped role-restricting policies)` line — compare a clean file to one with a
   suppressed violation; the pre-commit output is indistinguishable.

3. Missed true forms:
   ```sql
   CREATE POLICY "everything_bypass" ON public.points
     FOR INSERT
     WITH CHECK ((true));
   ```
   Reports `ok`, exit 0 — despite being logically identical to the already-detected `WITH CHECK (true)`.

**Reproduction rate:** 100% — deterministic.

## Expected Behavior

1. The annotation must only be recognized when it appears as a genuine `--` line comment in the file's
   actual code — not inside a string literal, block comment, or dollar-quoted body.
2. Pre-commit output must disclose when a violation was found and exempted (distinct from "nothing
   found"), so a human reviewer can see the annotation is actually doing something.
3. `USING`/`WITH CHECK` wrapping `true` in redundant parens, an explicit boolean cast, or a trivial
   tautology must be detected the same as the bare `true` token.

## Actual Behavior

1. A string/comment/dollar-quoted body containing the annotation phrase exempts the whole file.
2. Exempted violations are invisible in pre-commit output — same message as a fully clean file.
3. `((true))`, `true::boolean`, `1=1`, `NOT false` all report `ok`.

## Affected Files

- `scripts/check-rls-scope.py` — `ANNOTATION_RE` and its use in `main()` (annotation matched against raw
  `content` instead of a cleaned copy); `main()`'s `else` branch (no exemption disclosure);
  `LITERAL_TRUE_RE` (bare-token-only match)
- `src/tests/p1041-reproduce.test.ts` or a new `src/tests/p1044-reproduce.test.ts` — needs one fixture
  per finding, each proven to fail before the fix and pass after (same pattern P1041 established)

## Severity

**Medium** — unlike P1041's CRITICAL/HIGH findings, none of these three were proven reachable against
real content already committed in this repo's migration history (P1041's full-corpus scan found zero
instances). These are plausible gaps found via adversarial review, not demonstrated live exposure. Still
worth closing: the annotation is the gate's designated escape hatch, and a security gate's exemption
mechanism being spoofable — even without a proven live instance — undermines the trust model the whole
check depends on.

## Fix Approach

1. **Annotation smuggling:** add a second, lighter stripper (or a parameterized variant of
   `_strip_noise()`) that blanks single/double-quoted content, `/* */` block comments, and `$$...$$`
   dollar-quoting, but — unlike the main tokenizer — leaves `--` line comments untouched (since the
   annotation itself lives in one). Match `ANNOTATION_RE` against that output instead of raw `content`.

2. **Silent exemption:** in `main()`, split the `else` branch: when `violations and has_annotation`,
   print something like `ok: <file> (N unscoped polic{y/ies} exempted by -- intentionally-public)` and
   list the policy names — mirroring `check-migration-client-safety.sh`'s more honest
   "annotation present" messaging (that sibling already distinguishes these cases). Keep the current
   plain `ok: <file> (no unscoped role-restricting policies)` only for the genuinely-clean case.

3. **Missed true forms:** widen `LITERAL_TRUE_RE` to
   `\b(USING|WITH\s+CHECK)\s*\(+\s*(true(\s*::\s*bool(?:ean)?)?|1\s*=\s*1|NOT\s+false)\s*\)+`. This only
   adds matches (never removes any), so no regression risk against the existing P1039/P1041 fixture
   suite — verify with a full run of both before/after.

Same verification pattern as P1041: fixture per finding (fails before fix, passes after), full-corpus
scan against `supabase/migrations/` to confirm zero new false positives, full unit suite green.

## Acceptance Criteria

- [ ] A fixture with the annotation phrase inside a single-quoted string value reports `VIOLATION`
      (annotation must be ignored — not a real comment)
- [ ] A fixture with the annotation phrase inside a `/* */` block comment reports `VIOLATION`
- [ ] A fixture with the annotation phrase inside a `$$...$$` dollar-quoted body reports `VIOLATION`
- [ ] A fixture with a genuine `--` line-comment annotation still exempts correctly (no regression)
- [ ] A file with a real violation AND a valid annotation prints an exemption-disclosure message
      distinguishable from a genuinely clean file's `ok` message
- [ ] Fixtures for `((true))`, `true::boolean`, `1=1`, `NOT false` (each as the sole `WITH CHECK`/`USING`
      content, non-SELECT, no TO clause) all report `VIOLATION`
- [ ] Full run against every file in `supabase/migrations/` shows zero new false positives relative to
      the P1041 checker
- [ ] All existing P1039/P1041 regression tests still pass, plus one new fixture per finding above
