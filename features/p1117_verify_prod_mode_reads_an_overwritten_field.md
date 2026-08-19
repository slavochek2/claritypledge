---
status: backlog
type: bug
rank: 96
created_date: '2026-08-19'
tags: [verify, pipeline, prod-safety, delivery_stage]
delivery_stage: create-spec
pipeline_ran: [create-spec]
driver: anomaly
---

# P1117: /verify decides prod-vs-localhost from a field it has already overwritten

## Problem

**Situation:** `/verify` stamps `delivery_stage: verify` "before any other work in this skill"
(`verify/SKILL.md:69`). Its environment detection (`:58`) then decides **prod mode** from
`dev` in `pipeline_ran` **OR** `delivery_stage` being `dev`/`uat` "for backward compat".

**Complication:** by the time detection runs, `delivery_stage` is always `verify`. The
backward-compat half of that OR can therefore never be true — mode detection is silently
riding `pipeline_ran` alone. Today that is harmless, because the `pipeline_ran` half is
correct. It is a hazard because the dead clause **reads** like a working fallback: anyone
removing or narrowing the `pipeline_ran` half would believe a safety net exists.

Prod mode runs against the live site with a real account and writes rows to the production
database. This is the one place in the pipeline where a stale field selection has a
production blast radius.

**Question:** delete the dead clause, or make it real?

## Appetite

Low blast radius (one condition in one skill), fully reversible, low decision density.

## Solution

Delete the `delivery_stage`-based half of the prod-mode condition and state plainly that
`pipeline_ran` is the only signal, or re-read `delivery_stage` from disk **before** the
pipeline stamp and pass the pre-stamp value to detection. Prefer deletion: one signal that
works beats two where one is decorative.

## Risks / Non-Goals

- **Risk:** a spec that legitimately relied on the legacy `uat` value loses prod mode.
  Mitigation: grep `features/` for specs carrying the deprecated value before deleting.
- **Do NOT** change the step-6a status guard — it was corrected on 2026-08-19 to test
  `dev`/`fix` in `pipeline_ran`, and that fix is independent of this one.
- **Do NOT** widen prod-mode triggering. This spec narrows or clarifies; it never adds a
  new path to production.

## Done-When

- [ ] The prod-mode condition names exactly one signal, and that signal is readable at the
      point it is evaluated — shown by running `/verify` on a spec and pasting which branch fired
- [ ] `grep -n 'delivery_stage' verify/SKILL.md` shows no condition depending on a value the
      skill itself overwrites earlier in the same run — output pasted
- [ ] A spec carrying only the legacy `uat` value is confirmed to still resolve correctly, or
      is confirmed not to exist — grep output pasted

## Context

Found while executing the `/goalify` plan (2026-08-19). The same session **falsified** the
originating plan's larger claim that `/dev` → `/verify` → `/ship` "cannot complete": at least
six specs completed `dev → verify → ship` **after** the stamp and guard both landed in
`8c090095` (2026-04-05). The guard was not blocking, it was **not binding**. It has since been
fixed to test `pipeline_ran`. This spec is the remaining residual, not the original claim.
