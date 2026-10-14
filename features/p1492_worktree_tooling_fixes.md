---
status: week
type: bug
rank: 40
severity: high
workstream: infra
date_reported: 2026-10-14
created_date: 2026-10-14
drafted_by: opus
exec_model: sonnet
exec_effort: medium
tags: [tooling, worktrees, migrations, spec-gates]
disclosure: public
delivery_stage: create-bug
pipeline_ran: [create-bug]
---

# P1492: Three dev-tooling bugs every agent hit today (worktree e2e port, migrate.sh arguments, embargo stub gate)

> Founder framing, verbatim: *"I guess for everything you take on, make sure that you as orchestrator, you don't do the work, but everybody else who you delegate to does the work"*

## Summary

Three separate tooling defects, each one hit by every delegated agent on 2026-10-14:
(1) Playwright cannot start its web server in a worktree, (2) `migrate.sh` treats an
unknown argument such as `--help` as a normal run and applies migrations, and (3) the
neutral embargo stub that `/create-bug` step 4 commits to main is refused by the
spec-intent gate.

## Root Cause

**1. ANSI-coloured port (P1480 regression).** `scripts/lib/worktree-port.mjs` printed its
CLI result with `console.log(<number>)`. Node colours a logged *number* when `FORCE_COLOR`
is set, and Playwright sets `FORCE_COLOR=1` for its webServer child (verified in
`node_modules/playwright/lib/runner/index.js`, `WebServerPlugin` →
`DEFAULT_ENVIRONMENT_VARIABLES`, Playwright 1.64.0). The child runs `npm run dev`, then
predev's `scripts/check-worktree-env.sh` runs `node worktree-port.mjs`. That received
`\e[33m5600\e[39m`, failed the P1480 digits-only guard and exited 1 with *"could not
compute this checkout's port"*. It was seen on 5600 and 5900. The guard is correct. The
producer was not.

**2. `migrate.sh` dropped unknown arguments.** The parse loop ended in `*) shift ;;`, so
any argument it did not recognise was skipped. `--help`, `-h`, a typo like `--yes
--frobnicate`, a bare `prod`, or `--env staging` (which fell through to the test
`.env.local`) all ran normally. With no `--env`, that means a real apply against the test
DB. Reproduced hermetically: before the fix, `--help` reached the Management API history
read, `supabase migration list` and `supabase db push`. `--env prod --help` reached the
prod keychain read.

**3. The embargo stub has no intent to quote.** `scripts/spec-intent-gate.sh` exempts
`type: bug` and `intent: cold-start`. The stub template in `create-bug.md` step 4 is
deliberately `type: task`, because a bug type would hint at the withheld defect. So the
gate refused it. To get past the gate, orchestrators hand-pasted one shared founder quote
into every stub (P1485–P1491). The gate's own refusal message suggests a quote first and
`intent: cold-start` only for "no conversation to mine", which is not true here. A
founder quote about a vulnerability is exactly what a public stub must not carry.
`docs/decisions.md` 2026-10-09 [process] (P1321/P1446) recorded the `intent: cold-start`
workaround as a pending skill edit. It was never applied, and the stubs filed today show
why it did not stick.

## Invariants

- The port CLI's stdout is exactly `<digits>\n` in every environment. Consumers must not
  have to sanitise it.
- `migrate.sh` refuses any argument it does not understand **before** it reads an env
  file, contacts a database or reads the keychain. `-h`/`--help` prints usage and touches
  nothing.
- The spec-intent exemption covers only the neutral stub. A real embargoed spec
  (`disclosure: embargo`) and an ordinary spec carrying the tag are still gated.

## Reproduction Steps

1. In any worktree: `FORCE_COLOR=1 node scripts/lib/worktree-port.mjs | od -c` shows
   `033 [ 3 3 m` around the port. `CHECK_WORKTREE_ENV_PRINT_PORT=1 FORCE_COLOR=1 bash
   scripts/check-worktree-env.sh` exits 1 with the P1480 message.
2. `bash scripts/test-p1492-migrate-args.sh` against the pre-fix `migrate.sh`: 11 of 11
   bad-argument cases ran stubbed DB tooling or did not refuse with usage.
3. Run `bash scripts/spec-intent-gate.sh` on the step-4 template exactly as written. It
   is refused with "carries no verbatim founder framing".

**Reproduction rate:** 100%.

## Expected Behavior

1. `npx playwright test` starts the dev server in any worktree slot.
2. `migrate.sh --help` prints usage and exits 0. An unknown argument exits 2 with usage
   on stderr. Neither one touches anything.
3. The stub template commits without a hand-added quote.

## Actual Behavior

1. The web server failed to start: *"✘ check-worktree-env: could not compute this
   checkout's port (got '\e[33m5600\e[39m' …)"*.
2. `migrate.sh --help` started a real apply against TEST.
3. "spec-intent-gate: REFUSED — … carries no verbatim founder framing."

## Affected Files

- `scripts/lib/worktree-port.mjs`: CLI entry point (`console.log` of a number)
- `scripts/migrate.sh`: argument parse loop (`*) shift`)
- `scripts/spec-intent-gate.sh`: no exemption for the embargo stub
- `.claude/commands/slava/build/create-bug.md` step 4: stub template (skill, edited on main)

## Severity

**High.** Bug 2 started an unrequested database apply from a command meant to read help.
Bug 1 blocked every worktree e2e run.

## Fix Approach

1. The producer writes `process.stdout.write(\`${port}\n\`)`, a plain string that is never
   coloured. The P1480 guard is unchanged.
2. Add strict parsing: `-h|--help` prints usage and exits 0. Unknown arguments, a flag
   missing its value, and an `--env` outside `local|test|prod` each exit 2 with usage on
   stderr. Empty values (`--expect-sha ""`, `--env ""`, `--only ""`) and an empty
   `--only` list are also refused with usage. `--only` stops collecting at any
   `-`-prefixed argument, so `--only A.sql -h` still reaches help.
3. Exempt the stub in the gate, keyed on content (both callers pass a temp copy, so the
   path is not available). The stub must have all three of: `disclosure: public`, the
   `disclosure-embargo` tag, and a body that is exactly the template (the
   `# P<N>: Under disclosure embargo` heading plus its fixed paragraph, with whitespace
   and re-wrapping tolerated). Any added section, checkbox or prose means it is a real
   spec, and the gate applies. The `intent: cold-start` alternative from decisions.md 2026-10-09 was
   rejected because it is a false declaration for a stub that came from a conversation,
   and it dilutes cold-start as a signal.

## Acceptance Criteria

- [ ] `FORCE_COLOR=1 node scripts/lib/worktree-port.mjs <wN dir>` prints only digits and
      a newline (`src/tests/p1480-worktree-ports.test.ts`, FORCE_COLOR 1/2/3).
- [ ] `check-worktree-env.sh` accepts its port under `FORCE_COLOR=1` (same file).
- [ ] `migrate.sh --help` / `-h` print usage and exit 0, also after other flags. Bad
      arguments, empty values and an empty `--only` list exit 2 with usage. None of them invokes any DB tool or the keychain, and the repo
      stays unchanged (`scripts/test-p1492-migrate-args.sh`, with positive controls
      showing the probe sees a real run).
- [ ] The existing migrate canaries still pass (P1211, P1174, P1168, P1042, P1173, P1103,
      P887).
- [ ] The step-4 stub template passes the gate with no quote. A `disclosure: embargo`
      spec, a tag-only ordinary spec, and a spec with the stub heading plus a real Problem
      and ACs are still refused (`scripts/test-pipeline-gates.sh` E7–E12).
