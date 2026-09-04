---
status: backlog
type: task
rank: 50
tags: [cleanup, dead-code, tooling, knip]
delivery_stage: create-spec
pipeline_ran: [create-spec]
created_date: 2026-09-03
---

# P1241: Configure knip, then triage its findings

## Problem

`knip` has never been configured for this repo, so its output cannot be used to decide anything.
Run without a config on 2026-09-03 (`npx --yes knip@latest --no-progress`, nothing installed into
the project — `package.json` and `package-lock.json` byte-identical afterwards), it exits 1 with
**412 findings**:

```
Unused files (135)          Unused exports (145)        Unlisted dependencies (9)
Unused dependencies (7)     Unused exported types (91)  Unresolved imports (2)
Unused devDependencies (1)  Duplicate exports (22)      -> 412 total
```

**The number is not a measure of dead code — it is mostly a measure of missing entry-point
declarations.** The dominant false-positive class is *files that are entry points but are never
imported by source*:

- **16 are `supabase/functions/*/index.ts`** — HTTP-invoked edge functions. Nothing imports them by
  design. One of them, `send-letter-emails`, is invoked at `src/lib/letter-emails.ts:9`
  (`supabase.functions.invoke('send-letter-emails', …)`) and is listed in `supabase/deploy-manifest.json`,
  so "unused" is provably wrong there; the same argument covers the other 15.
- **16 are `.claude/commands/**` assets** (skill templates, render scripts) — read by agents, not imports.
- **40 are under `scripts/`**, mostly `scripts/archive/`, kept deliberately.

That is **72 of the 135 "unused files" accounted for as structural false positives before any
judgement is applied to the rest**. Acting on the raw report would delete live production code.

**Why this is its own spec.** P803 (dead-code sweep) carried "`knip` reports zero findings OR all
remaining findings are documented as intentional" as a Done-When line. P803 shipped as a Batch A/C
deletion pass whose six deletions each stood on their own dependents-grep evidence — no part of it
ever depended on knip. Configuring knip and triaging 412 findings is a distinct body of work, so it
is filed here rather than held open on a deletion branch.

## Appetite

Two sessions. Session 1 is the config (mechanical, verifiable); session 2 is triage of what
survives it. Stop after session 1 if the surviving count is still unreadable — a second config pass
beats a rushed triage.

## Solution

1. **Author `knip.json` declaring the real entry points.** At minimum: `supabase/functions/*/index.ts`,
   `.claude/commands/**`, `scripts/**` (including `scripts/archive/`), Playwright configs and
   `e2e/**`, Vite/Tailwind/Vitest config files, and `api/**` if present. Each entry gets a one-line
   comment naming *why* it is an entry point, not just that it is.
2. **Re-run and record the new baseline** — findings before/after config, per category. The drop
   from 412 is the config's own evidence.
3. **Triage what survives, by category**, in the order knip reports them. For each survivor:
   confirmed dead (delete under a follow-up spec), false positive (add to `knip.json` ignore with a
   reason), or unresolved (leave, note why).
4. **Wire it in only once the config is trustworthy** — a `npm run knip` script, and a decision on
   whether it becomes a CI gate. Do not gate CI on an unconfigured tool.

## Risks / Non-Goals

- **Risk: an ignore entry that hides a real finding.** Every ignore must carry a reason; a bare
  glob is not acceptable. This is the same blind-spot shape as the pre-P803
  `check-deploy-manifest.sh`, which iterated local dirs only and so could not see manifest-only
  functions.
- **Risk: a dependency that looks unused but is reached through config or a transitive re-export.**
  P803's run listed `zod`, `date-fns`, `react-hook-form`, `@hookform/resolvers`,
  `react-intersection-observer`, `react-type-animation`, `jsonwebtoken` as unused dependencies, and
  a grep for each over `src/`, `supabase/`, `scripts/`, `api/` returned nothing — consistent, but
  each still needs its own check before removal.
- **Risk: knip's own defaults change between versions.** Pin the version once the config exists.
- **Non-goal:** deleting anything in this spec. This spec produces a trustworthy tool and a triaged
  list; deletions are filed separately, each with its own dependents grep (P803's method).
- **Non-goal:** a CI gate before the config is proven. Per epistemic gate 7, a gate nobody has
  watched fail is unproven — and per gate 7c, a gate that has not been run against existing
  correct workflows has an unmeasured false-positive rate.

## Done-When

- [ ] `knip.json` exists, declares every entry-point class above, and each entry carries a reason
- [ ] Post-config finding count recorded against the 412 pre-config baseline, per category
- [ ] The 16 `supabase/functions/*/index.ts` files no longer appear as unused (control:
      `send-letter-emails`, provably live via `src/lib/letter-emails.ts:9`)
- [ ] Every surviving finding is classified: dead / false-positive-with-reason / unresolved-with-reason
- [ ] Deletions arising from triage are filed as their own spec(s), not performed here

## References

- P803 (`features/p803_dead_code_sweep.md`) — § Evidence — the knip criterion, holds the full
  412-finding run and the false-positive analysis this spec inherits
- `docs/technical/architecture.md` — entry-point layout
