---
status: backlog
type: task
rank: 301
created_date: '2026-09-11'
tags: [design-system, ui, consistency]
disclosure: public
delivery_stage: create-spec
pipeline_ran: [create-spec]
drafted_by: opus
exec_model: opus
exec_effort: high
---

# P1308: One blue for primary buttons — audit and settle the app's button colours

## Problem

> Founder framing, verbatim (2026-09-11): *"we ahve two blue colros in /live one on CTA butotn and
> here a differnet one.. how we resovle now and continiously later.. i liek the dark blue but also
> it seems to need more refleciton on consistnecy ? but maybe separate spec because too big?"*

**Situation.** Primary buttons use at least three blues today (counts are files referencing each,
measured 2026-09-11):

| Blue | Where | Files |
|---|---|---|
| `bg-blue-500` (#3b82f6) | `/live` and most product UI | 87 |
| dark navy `#002B5C` (`PRIMARY_BUTTON_CLASS`) | event ready screen, meeting terms | 22 (5 import the class) |
| ceremony navy `#0044CC` | agreements, pledge, certificates | 56 |

The design-system doc contradicts itself: `blue-500` is "Primary" (`docs/design-system.md`,
Interactive Elements) while its Button Hierarchy table says a primary CTA is `bg-blue-600`. The
2026-04-05 decision formalised two visual languages — standard `blue-500`, ceremony `#0044CC` — and
recorded enforcement as advisory only. `#002B5C` belongs to neither.

**Complication.** P1307 puts a dark-blue Continue (event ready screen) and a light-blue bar
(`/live`'s) on consecutive screens, and the founder noticed. With no single source, each new screen
takes whichever blue the nearest file uses, so the drift grows with every feature.

**Question.** Which blue is a primary button, where does each visual language apply, and what keeps
it that way?

## Appetite

Blast radius: medium — visual only, but 100+ files. Reversibility: high once a single token exists.
Decision density: one founder call (the primary colour), possibly a second (keep or drop the
ceremony language).

## Approach

1. **Inventory.** Every primary-button colour in use, by page, with the main flows screenshotted
   side by side — the founder decides from pictures, not class names.
2. **Decide.** `[FOUNDER DECISION: primary button colour]` — the founder likes the dark blue; show it
   against the light blue on the same screens first.
3. **One token.** A single class/token for primary buttons; migrate call sites; make the
   design-system doc say one thing.
4. **Keep it.** Decide after step 1 whether a mechanical check is worth it (e.g. a P955 UI-gate rule
   against raw hex or ad-hoc blue on primary buttons) — build it or record why not.

## Decision Criteria

1. The chosen primary colour passes WCAG AA contrast with white text at the button's size — checked
   for every candidate, not assumed.
2. The ceremony/standard split stays only if distinct moments are meant to look distinct; otherwise
   one language.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| A colour sweep across 100+ files breaks visual/snapshot tests or misses call sites | MITIGATE | Inventory first; migrate through one token so a miss is greppable |
| The founder prefers the other blue once it is live everywhere | ACCEPT | With one token the change is one line |

**Non-Goals**
- Do NOT change P1307's screens here — they keep today's colours until this lands.
- Do NOT restyle components beyond colour.

## Done-When

- [ ] Inventory with screenshots recorded in this spec.
- [ ] Founder decision on the primary colour recorded.
- [ ] Every primary button uses the chosen token; `docs/design-system.md` states one rule.
- [ ] Enforcement check built, or its rejection recorded with the reason.

## Related

- P1307 — where the mismatch surfaced.
- P540 — hyperlink consistency across text surfaces (done): the same kind of cleanup, for links.
- `docs/decisions.md` 2026-04-05 [technical] "Design system audit — two visual languages".
