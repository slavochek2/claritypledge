---
status: backlog
type: task
rank: 63
created_date: '2026-06-01'
tags: [upgrade-oath, skills, process, discovery]
delivery_stage: create-spec
pipeline_ran: [create-spec]
---

# P870: Strengthen /upgrade-oath discovery — catch paraphrased drift + reconcile against the spec's named surfaces

## Problem

**Situation:** `/upgrade-oath` Step 2 (Discovery) enumerates surfaces before a version bump by grepping exact-string old-oath phrases + registry consumers + version literals.

**Complication:** P855 (pledge → v4) shipped with AC#3 ("none left silently on old text") marked complete **prematurely**. Two classes slipped past discovery: (a) **paraphrased descriptions** of the oath in prose/marketing copy — `manifesto-section`'s narrative quote ("I promise to respond without judgment") and the share-email invite bullets — describe the pledge in words, not the verbatim oath, so exact-string greps missed them; (b) the agent never **reconciled** discovery hits against the spec's OWN explicitly-named surface list (the P855 spec named 7 hardcoded surfaces to single-source — `landing-v4`, `manifesto-section`, `faq-section`, …; `manifesto-section` was simply never checked). `/finish` caught both post-hoc.

**Question:** How do we make `/upgrade-oath`'s discovery catch paraphrased drift and guarantee every spec-named surface is visited, so AC#3 can't be marked complete while prose still pitches the old model?

## Appetite

Low blast radius — edits one skill file (`.claude/commands/slava/build/upgrade-oath.md`, Step 2 + a gate). Fully reversible (git revert; agent tooling, not shipped runtime code). Low decision density — both gaps are well-characterized; one open design choice (keyword-set vs semantic-subagent for paraphrase detection).

## Solution

Add two checks to `/upgrade-oath` Step 2 (Discovery):

1. **Named-surface reconciliation gate.** When the active spec lists hardcoded surfaces explicitly (e.g. P855's "Hardcoded React surfaces (`landing-v4`, `manifesto-section`, …)"), parse that list and assert each named surface was visited/classified in Step 1. **STOP** if any named surface is unvisited — a named-but-unchecked surface is an enumeration gap, not a pass.

2. **Paraphrase detection.** Beyond verbatim old-oath strings, scan candidate surfaces for the prior model's value-prop framing. Two options (settle in `/architect` or `/dev`): (a) a curated per-doc keyword set in the manifest (pledge example: "without judgment", "what did you understand", "paraphrase", "reflect back"); or (b) a small discovery subagent that semantically scans the named + registry-consumer surfaces for old-model framing. Either way, **flag hits for human review — never auto-rewrite** (prose rewording is a founder copy decision).

## Risks / Non-Goals

### Risks
- Paraphrase detection (keyword or semantic) may over-flag legitimate current copy. **Mitigation:** flag-for-review, never auto-edit; a human triages. Over-flagging is cheap; under-flagging shipped v3 framing to prod.

### Non-Goals
- Do NOT auto-rewrite marketing/prose copy — paraphrase rewording is a `[FOUNDER DECISION]`; the skill flags, the founder writes.
- Do NOT expand `/upgrade-oath` beyond the discovery step — the three gates stay as-is.
- Do NOT add `--flags` — skills auto-detect (per `.claude/rules/skills.md`).

### Alternatives Considered
- **Rely on `/finish` to catch paraphrased drift post-hoc (status quo).** It worked for P855 — but only *after* the agent marked AC#3 complete. Catching it IN discovery prevents the false-complete at the source.
- **Pure semantic-subagent scan of all surfaces (no keyword set).** More thorough but slower/costlier; the named-surface reconciliation gate is the cheap, high-value half and should ship regardless.

### Rollback Strategy
`git revert` the skill commit — single-file change to `.claude/commands/slava/build/upgrade-oath.md`. No runtime/prod impact (the skill is agent tooling, not shipped code).

## Done-When

- [ ] `/upgrade-oath` Step 2 reconciles discovery hits against the spec's explicitly-named surface list and STOPs on any named-but-unvisited surface
- [ ] `/upgrade-oath` Step 2 flags paraphrased old-model framing (not just verbatim oath strings) for human review
- [ ] The skill explicitly marks paraphrase-rewording as a founder copy decision (no auto-rewrite)
- [ ] A dry-run of P855's discovery under the strengthened skill would surface `manifesto-section` + the share-email bullets

## Related

- decisions.md 2026-06-01 [technical] (the `(Status: proposed)` follow-up this spec implements)
- `.claude/commands/slava/build/upgrade-oath.md` (the skill being strengthened)
- [features/done/2026-04-22/p855_pledge_v4_number_first_upgrade.md](done/2026-04-22/p855_pledge_v4_number_first_upgrade.md) (the run that exposed both gaps)
