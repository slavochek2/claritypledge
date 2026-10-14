---
status: qa
delivery_stage: dev
pipeline_ran: [dev]
type: bug
disclosure: public
rank: 82
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

- [x] Each row in the table above either returns exit 2, or is documented as deliberately out of scope with a reason. *(Evidence: all 8 rows return exit 2, see Dev evidence → AC1.)*
- [x] A before/after run on all five strategy docs shows what the widened rule newly flags, and each new flag is triaged as true or false positive. *(Evidence: zero new flags; triage of everything the wider region now sees, see Dev evidence → AC2.)*
- [x] The commit-time doc list is derived (`grep -rl 'SINGLE-VALUE:' docs/` ∩ staged) rather than hardcoded, or the hardcoding is justified. *(Evidence: §13e now scans every staged `.md` carrying the token. Run in a throwaway repo by the suite, see Dev evidence → AC3.)*
- [x] Regression fixtures exist for the shapes that must stay uncounted (`> - ` elaboration bullets, bracket-tagged retirements). *(Evidence: `scripts/test-p1009-single-value-canary.sh` §2 and §4, see Dev evidence → AC4.)*

## Dev evidence (2026-10-13)

**Design decisions (made unattended; reversible, each is one line in the checker):**
- **Region = the marker's whole section** (owning heading to the next heading of the same or higher level). This replaces "the callout group up to the first prose line". It closes rows 6 and 7 and the subsection variant. Flywheel prose stays out because only blockquote lines are candidates. That restriction, not the narrow region, is what the docstring's §Channels concern actually needed.
- **The date requirement is kept but widened.** The date may sit anywhere in the item (lead-in, rest of line, continuation lines), in ISO or human formats. Dropping it entirely would flag two undated brand taglines in §UVP's `### Coaching` and `### Shared Foundation` subsections (false positives, see AC2).
- **Bullets are positional.** A bullet attached under a live lead is an elaboration (CHARTER convention), so it is not counted. A bullet that opens its own callout block is a standalone lead, so it is counted. Anything inside a bracket-retired callout inherits the retirement. A nested `>>` bold line under a live lead is counted, because CHARTER sanctions only `> - ` bullets.
- **A marker must be on its own line and outside a code fence.** Before this change the old `.search()` treated the inline mention in `docs/decisions.md`, the fenced example in `docs/CHARTER.md`, this spec's own prose and the docs-strategy-update skill's fenced example as four phantom slots.
- **Out of scope, with reason:** (a) a competing lead written as a `> - ` bullet *attached under* the live lead is not counted. It is structurally identical to the sanctioned dated elaboration bullet (the real §Channels doc has two). Catching it needs semantics or a new bracket token for elaborations, which is a convention change for the founder. (b) An undated competing callout is not counted (see the date decision above). Both are stated in `docs/CHARTER.md` §Single-valued slots and in the checker docstring.

**AC1: every row exits 2** (`bash scripts/test-p1009-single-value-canary.sh`, §1, run against the new checker; the same suite against the pre-change checker failed 23 of 38):
```
  ok   control: plain second dated lead
  ok   row 1: date in the body, not the bold span
  ok   row 2: date after the bold
  ok   row 3: human-format date (22 July 2026)
  ok   row 3: human-format date (July 22, 2026)
  ok   row 4: date on the second blockquote line
  ok   row 5: nested (double) blockquote, own block
  ok   row 5: nested blockquote inside the live lead's callout
  ok   row 6: placed after the group's closing prose
  ok   row 6: placed under a subsection of the slot's section
  ok   row 7: placed between heading and marker
  ok   row 8: standalone dash-bullet lead
  ok   revival sentence is not a retirement tag
```
The same shapes injected into a copy of the real `docs/lean-canvas.md` (§4: after §UVP's group, body date, nested human date, standalone bullet in active-market-focus, between heading and marker, at the tail of §Channels, revival) all exit 2.

**AC2: before/after on the real docs.** Counted directives per slot, old rule and new rule, run over the five strategy docs plus every file containing `SINGLE-VALUE:`:
```
BEFORE  active-market-focus 1 · page-lead 1 · active-channel 1  (+ 4 phantom slots: CHARTER fenced example,
        decisions.md inline mention, p1009 spec prose, docs-strategy-update skill fenced example, all 0)
AFTER   active-market-focus 1 · page-lead 1 · active-channel 1   rc=0
```
**Newly flagged: none.** The page-lead region grew from about 13 to 118 lines and active-channel to 111. Every bold blockquote item the wider regions now see, triaged:
- page-lead: 1 counted (2026-07-20 lead); 6 bracket-retired (`[FALLBACK …]` ×5, `[SUPERSEDED 2026-07-03 …]`); 3 **undated, not counted**. These are the top-of-§UVP tagline, plus a `### Coaching *(ladischenski.com)*` tagline and a `### Shared Foundation` tagline. The last two are brand surfaces, not page heroes: **false positive** if the date requirement were dropped. The top tagline is a **founder question, not a defect**: is it the hero, or subordinate to the 2026-07-20 lead? It is undated and therefore not counted.
- active-channel: 1 counted (2026-09-21); 4 bracket-retired; 2 dated `> - ` bullets inside the `[SUPERSEDED 2026-09-21 …]` callout. Those inherit the retirement: **true negative**.
- active-market-focus: 1 counted (2026-09-21 Who). The `### Dormant` sibling ends the section, so its retired bullets stay outside.

**AC3: derived doc list.** §13e now takes every staged `*.md`, copies the staged blob and keeps the ones containing `SINGLE-VALUE:`; the checker decides which lines are real markers. The suite (§5) extracts the real §13e block and runs it in a throwaway repo. A staged `docs/goals.md` with two leads produces WARN, and so does a staged `features/` spec with two leads. A clean marker doc is scanned and printed green, and marker-less markdown is skipped. Gate 7e: §3 asserts the derived set contains `docs/lean-canvas.md`, and that `--list` finds exactly the three known slots. A mutant restoring the five-doc list fails 3 assertions.

**AC4: must-stay-uncounted fixtures** (§2, §4): dated `> - ` elaborations attached under the live lead; `[SUPERSEDED]`, `[FALLBACK]`, `[Dormant]`, `[Parked]` and `[Demoted]` callouts, plus bullets and `>>` lines nested inside them; an undated tagline; a fenced example marker; an inline prose marker; and an attached elaboration injected into the real active-market-focus slot. All exit 0.

**Review round (2026-10-13; /finish + Codex, each reproduced as a failing fixture first):**
- **Non-ASCII staged paths (§13e).** Under the default `core.quotepath`, git C-quotes the whole path (`"docs/strat\303\251gie.md"`), so it never matched `\.md$`. The result was a silent skip with a green line, not the ERROR the review predicted. §13e now reads `git diff --cached -z`. `core.quotepath=false` alone still fails a name containing `"` (fixture added). Unmerged paths are still an ERROR (merge-conflict fixture).
- **Fences follow CommonMark.** A closer is the same character, at least as long as the opener, and has no info string. A 4-backtick example showing a bare ```` ```python ```` line had flipped the state and hidden every slot after it. Across all tracked `.md` files, 22 change classification. In both sampled files the new reading is the CommonMark one; the old toggle closed at ```` ```ts ```` and inverted ~700 lines of decisions.md. The real-doc result is unchanged: 3 slots, rc=0.
- **Retirement propagates through nesting.** `>>> …` inside a `>> **[FALLBACK] …**` callout under a live lead now inherits the retirement, at any depth. Outdenting restores the enclosing state (two controls).
- Suite: 49/49. The 31b081d3b checker fails 4 of the new cases. Mutants killed: closer-length check removed, info-string closes, closer character ignored, retirement not inherited, no outdent pop.

**Gate 7 (the suite fails when the code is wrong):** mutants each killed. These were the old checker (23 FAIL), hardcoded list (3), any-heading-ends-region (2), bullets-never-count (2), marker via `.search()` (1), marker never matches (23), ISO-only dates (3), no retirement inheritance (4) and no fence skipping (2). Two first-draft mutants survived as *equivalent* (a regex alternative still covered the input; `.match()` still anchored). They were re-cut and killed.

## References

- `docs/decisions.md` 2026-07-23 [process] — the canary repair and the adversarial review that produced this list
- `docs/CHARTER.md` §single-valued slots — the stated known gap
- `scripts/check-single-value-slots.py` — `DIRECTIVE_RE`, the callout-group scan loop
- `scripts/pre-commit-checks.sh` §13e — the fixed doc list
