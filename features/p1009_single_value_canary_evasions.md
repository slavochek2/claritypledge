---
status: backlog
type: bug
rank: 1000951.0
created_date: '2026-07-23'
tags: [tooling, docs, gates, strategy-docs]
---

# P1009: The SINGLE-VALUE canary misses most real shapes of a competing lead

## Problem

**Situation:** `scripts/check-single-value-slots.py` guards `<!-- SINGLE-VALUE: slot -->` headings against accumulating competing directives. It is enforced at write time (`/docs-strategy-update` Gate 8) and commit time (`pre-commit-checks.sh` §13e).

**Complication:** an adversarial review on 2026-07-23 found that it only recognises **one** shape — a top-level `>` blockquote whose **bold lead-in contains an ISO date**. Every finding below is a genuine competing lead that returns **exit 0**, each executed against the script, not reasoned about:

| Evasion | Example | Exit |
|---|---|---|
| Date in the body, not the bold span | `> **New page-lead (UNTESTED).** … see decisions.md 2026-07-22` | 0 |
| Date after the bold | `> **New page-lead.** (2026-07-22, UNTESTED) …` | 0 |
| Human-format date | `> **New page-lead (22 July 2026).** …` | 0 |
| Date on the second blockquote line | — | 0 |
| Nested blockquote | `>> **New page-lead (2026-07-22).** …` | 0 |
| Placed after the group's closing prose | after `Everything below is the durable positioning.` | 0 |
| Placed between heading and marker | never scanned at all | 0 |
| `> - ` bullet form | `> - **New page-lead (2026-07-22):** …` | 0 |

Control: a plain second dated lead → **exit 2**, so the harness works.

**Two of these are not hypothetical.** `docs/lean-canvas.md` §UVP already ends its callout group with exactly the kind of prose line that terminates the scan, so appending a lead after it is the path of least resistance. And the `active-market-focus` slot already writes its retired leads as `> - **…**` bullets, so a competing bullet-shaped lead there would be invisible **and** stylistically indistinguishable from its neighbours.

**Also unscanned at commit time:** `pre-commit-checks.sh` matches a fixed five-doc list. A `SINGLE-VALUE` marker in `CHARTER.md`, `philosophy.md`, `goals.md`, or any `features/` spec is never checked. (Static read of the regex — not executed as a doc edit.)

**Not a hole (verified):** bold-italic `***…***` → exit 2, caught. The `>= 2` threshold is sound on its own; it fails only because the shapes above suppress the count to 1.

## Why this is filed and not fixed

Fixing it means changing what counts as a directive — most directly, dropping the date requirement from `DIRECTIVE_RE` and scanning to the next heading rather than to the first prose line. Both widen what the gate flags across all five strategy docs, so the change needs a full before/after run on real content and a judgment call about the noise it surfaces (the docstring records that scoping to the callout group was **deliberate**, to avoid counting §Channels flywheel prose as competing answers). That is a design decision, not a patch.

Until then `docs/CHARTER.md` states the gap explicitly so the convention is not trusted beyond what it enforces.

## Acceptance Criteria

- [ ] Each row in the table above either returns exit 2, or is documented as deliberately out of scope with a reason.
- [ ] A before/after run on all five strategy docs shows what the widened rule newly flags, and each new flag is triaged as true or false positive.
- [ ] The commit-time doc list is derived (`grep -rl 'SINGLE-VALUE:' docs/` ∩ staged) rather than hardcoded, or the hardcoding is justified.
- [ ] Regression fixtures exist for the shapes that must stay uncounted (`> - ` elaboration bullets, bracket-tagged retirements).

## References

- `docs/decisions.md` 2026-07-23 [process] — the canary repair and the adversarial review that produced this list
- `docs/CHARTER.md` §single-valued slots — the stated known gap
- `scripts/check-single-value-slots.py` — `DIRECTIVE_RE`, the callout-group scan loop
- `scripts/pre-commit-checks.sh` §13e — the fixed doc list
