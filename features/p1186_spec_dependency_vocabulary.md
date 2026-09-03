---
status: backlog
type: task
rank: 239
workstream: spec-schema
created_date: '2026-08-28'
tags: [specs, schema, skills, kanban]
related: [p1214, p1148]
delivery_stage: create-spec
pipeline_ran: [create-spec]
drafted_by: opus
exec_model: sonnet
exec_effort: medium
driver: anomaly
---

# P1186: Pin one spelling for spec dependencies, and have the filing skills emit it

## Problem

**Situation:** `.claude/rules/features.md` defines relationship fields **only** for `type: change-request` (`changes:`, `superseded_by:`). Every other kind of relationship between specs is ad hoc.

**Complication:** Measured across `features/` on 2026-08-28 — `parent:` **12** · `blocked_by:` **7** · `depends_on:` **6** · `blocks:` **5** · `related:` **2**. Five spellings for two ideas (ordering and association), across 32 specs, none in the schema. ~~Nothing consumes any of them~~ — **corrected 2026-09-03: `blocked_by` HAS a consumer.** The
kanban parses it (`tools/kanban/server/api.ts:176`), types it (`tools/kanban/src/lib/types.ts:50`,
commented *"AI-managed, display only"*), persists it through the PATCH path
(`api.ts:661-663,712`), and covers it in tests (`server/__tests__/api.test.ts:482`). The original
probe searched `scripts/` and missed `tools/`. The other four spellings remain unconsumed.

So a chain of dependent specs is **invisible unless a human reads the prose**. Filed this session: P1180 → P1181 → P1182, whose ordering lived only in a `## Related` paragraph until it was added by hand, in a spelling chosen by counting other files.

> Founder framing, verbatim: *"they kind of belong together, but it's not clear how they do and what is blocked by what."*

**Question:** Which spelling wins, and which skills emit it?

## Appetite

**Blast radius: medium** — every spec filed from now on, and a gated rules file. **Reversibility: high** for the schema line; **low-ish** for 32 existing specs if they are migrated. **Decision density: one** — the spelling.

## Solution

Three parts.

**This changes the recommendation's basis, not its direction.** `blocked_by` was proposed on a raw
count; it now wins on a stronger ground — it is the only spelling with a working consumer, so
pinning anything else means either abandoning that consumer or rewriting it. The `related:`
half is still unconsumed and still a judgement call.

**Scope extended 2026-09-03 — `workstream:` is the same defect, one field over.** Measured today:
`workstream: infrastructure` **28** · `infra` **10** (same thing, two spellings) · `security` 3 ·
`letters` 9. Like the dependency fields, `workstream:` appears nowhere in `features.md`. Worse, it
is doing two incompatible jobs at once — naming a *category* ("infrastructure": 28 unrelated
specs) and naming a *body of work* ("letters": one effort). A founder trying to find a family gets
28 strangers.

**Decision taken 2026-09-03 (founder delegated this one explicitly): narrow `workstream:` to mean
the BODY OF WORK, and let `tags:` carry category** — `tags:` already does that job and needs no
change. Three levels, three existing fields, nothing new invented:

| Level | Field | Means | Example |
|---|---|---|---|
| Body of work | `workstream:` | one effort; changing one member re-scopes the others | `keyring` — P1214 + P1148 |
| Category | `tags:` | what area it touches; no coupling implied | `security`, `credentials` |
| Association | `related:` | same class, different surface; flat, no ordering | P1214 ↔ P998 |
| Ordering | `blocked_by:` | genuinely cannot start until that lands | (kanban reads this one) |

First families named under it: **`keyring`** (P1214 + P1148, and the encryption-at-rest spec when
it is filed) and **`spec-schema`** (this spec). Legacy values stay as they are — the non-goal
against migrating 32 specs applies here too.

**Deliberately NOT a graph.** A hand-maintained chain rots: measured this session, a `related:`
link broke within hours because its target shipped to `features/done/` mid-session. Flat lists per
spec, no bidirectional edges to keep consistent.

1. **Pin the vocabulary in `features.md`.** Two ideas, two fields: an **ordering** field (this cannot start until that is done) and an **association** field (these are about the same thing, no ordering implied). Recommend `blocked_by:` and `related:` — `blocked_by` is the most-used ordering spelling and reads unambiguously in one direction; `parent:` leads the raw count but means containment, which is a third idea and should not be conflated. Inline list form, matching `pipeline_ran`.

2. **Emit it from the filing skills** — `/create-spec`, `/create-bug`, `/change-request` — so new specs carry it without anyone remembering.

3. **Leave the 32 existing specs alone** unless a consumer is built. Rewriting them buys nothing while nothing reads the field, and touching 32 files across live and done specs has its own blast radius.

[FOUNDER DECISION — still open, and narrower than it was: the `workstream`/`tags` split above is decided; this one is not. Is `blocked_by` / `related` the pair, or do you want `depends_on` / `parent` semantics instead? The counts are above; the recommendation is mine, the call is yours.]

## Invariants

- **`features.md` is a gated file.** This change runs through `/slava:maintain:claude-md` before it is applied, not after.
- Whatever is pinned, the **filing skills emit it** — a schema field nobody writes is worse than no field, because it looks supported.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| A sixth spelling gets added rather than the five converging | MITIGATE | The rules file names the losing spellings explicitly as deprecated, so a reader sees why theirs is absent |
| A field nobody reads is documentation theatre | ACCEPT | Half-true as of 2026-09-03: `blocked_by` is read by the kanban, `related` is not. The cost is one line, and the current cost is chains that only exist in prose |
| Migrating 32 specs breaks something in `done/` or kanban parsing | DEFER | Not migrating them; revisit if a consumer lands |

**Non-Goals**
- Do NOT migrate the 32 existing specs.
- Do NOT build a kanban visualisation here — that is what would make the field load-bearing, and it is a separate decision.
- Do NOT touch `changes:` / `superseded_by:`; the change-request chain is already defined and works.

## Done-When

- [ ] `features.md` names one ordering field and one association field, with the deprecated spellings listed and their counts
- [ ] `/create-spec`, `/create-bug` and `/change-request` emit the pinned field
- [ ] A newly filed spec carries it without the author adding it by hand
- [ ] The gate was run on the `features.md` change — recorded, not assumed

## Related

- `docs/process-learnings.md` — the measurement that produced this spec
- `.claude/rules/features.md` §change-request fields — the existing, working precedent
- Motivating chain: P1180 / P1181 / P1182
