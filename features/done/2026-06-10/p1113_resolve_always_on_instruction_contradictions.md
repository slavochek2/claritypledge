---
status: done
type: task
rank: 45.0
created_date: '2026-08-19'
tags: [claude-md, rules, contradictions, instruction-layer]
delivery_stage: shipped
pipeline_ran: [create-spec, dev]
completed_at: '2026-08-19'
driver: anomaly
---

# P1113: Resolve contradictions and dead pointers in the always-on instruction layer

## Problem

**Situation:** `CLAUDE.md` (350 lines) plus the five `.claude/rules/` files carrying
`globs: "*"` (357 lines) load into every session. Instrumentation added 2026-08-14
(`.claude/hooks/log-instructions-loaded.sh`) measured this across 44 real sessions: the
always-on set loaded in **38 of 44**, and was re-paid on **77 compaction events**.

**Complication:** The 2026-08-14/16 review found two pairs of instructions in that
always-on set that contradict each other, plus one pointer to a command that does not
exist. Anthropic's own guidance states that when two rules conflict, the model "may pick
one arbitrarily" (Claude Code memory docs, *Write effective instructions* → Consistency) — so a contradiction in the always-on layer is not a documentation
blemish, it is nondeterministic behavior on every session. One of the two governs the
only git operation in the repo with **no reflog recovery**. Alongside them sit one
under-specified instruction (commit authority, which git.md already resolves — a
clarification, not a conflict) and one pointer to a command that does not exist.

**Question:** Can the contradictions be removed without weakening any guarantee, and
without breaching the 350-line budget?

## Appetite

Low blast radius in code (zero runtime files touched) but **high in agent behavior** —
these lines steer every session. Fully reversible (single commit, text only). Low
decision density: the founder decision on `/wrap` is already made (delete now, build
later if the asks continue).

## Solution

Five text-only edits. Every claim below was re-verified after an adversarial review
(2026-08-19) found the first draft's edit 5 unsafe and its edit 4 in conflict with a
recorded decision. Line counts are stated, not asserted.

1. **Narrow — do not strike — the `git restore` carve-out.** The operation carries three
   authorization levels: ALWAYS-ACT (`CLAUDE.md:129`), JUDGMENT (`CLAUDE.md:133`), BANNED
   (`.claude/rules/git.md:19`). But `:129` does **not** name `git checkout`/`git restore` —
   it says "reverting a single uncommitted edit you made yourself this session," which also
   covers the trivially safe non-git case (undoing your own Edit-tool change), a case
   git.md does not govern. Three moves, all inline: strike it from JUDGMENT (`:133`),
   **narrow** `:129` to exclude git checkout/restore explicitly, and **add it to ALWAYS-ASK**
   (`:131`, which does not currently name it). All three are required together — striking
   `:129` wholesale would force asking before undoing your own typo, and omitting the
   ALWAYS-ASK placement would leave the operation in **none** of the three lists of a
   classifier that advertises "three lists, no judgment needed."

2. **Clarify commit authority (a clarification, not a contradiction).** `CLAUDE.md:175`
   says "In skills: commit when tests pass"; `git.md:21` bans subagent commits. `git.md:29`
   already prescribes the resolution — "subagent stages → main session verifies → main
   session commits" — so CLAUDE.md needs a cross-reference, not an arbitration. Downgraded
   from the first draft's "contradiction" framing.

3. **Resolve the completion-language conflict while preserving who decides.**
   `CLAUDE.md:77` "Never say 'done'" conflicts with Claude Code's default system prompt
   ("state it plainly without hedging"). The first draft's premise was backwards: the
   claudeMd injection header states these instructions **override** default behavior, so
   CLAUDE.md wins — the real cost is nondeterminism from two live rules, not override.
   Reframe the phrasing, and **explicitly preserve** "the user decides completion." A
   reframe to "no completion claim without per-AC evidence" alone would transfer completion
   authority from the user to the evidence, which is a genuine weakening.

4. **Remap `"wrap up"` to `/status` — do not delete the mapping.** `/wrap` does not exist
   (`find` over both command trees matches only an unrelated `*-wrapper.md`). Two recorded
   decisions govern this and the first draft cited neither: the archive entry states
   "`/wrap` and `/ship` archived… `/status` replaces `/wrap`", and the 2026-08-13 entry
   rejected "rewriting line 286" on the grounds that "the line remains correct for
   `/status` and `/wrap`" — a rationale that is **factually wrong about `/wrap`**, which
   was already archived. Remapping honors the archive decision's designated replacement
   and does not orphan the informal phrase. **Founder decision, resolved 2026-08-19:
   reversal approved** — the 2026-08-13 entry was decided on a fact that was wrong, and two
   independent checks confirmed `/wrap` is gone. `/kdd` records the reversal.

5. **Add the cost dimension by inline extension — remove nothing.** The ranked reasons at
   `CLAUDE.md:53` omit cost. Extending that existing line costs **zero new lines**, so no
   funding is required. **Founder decision, resolved 2026-08-19: cost ranks FIFTH** — after
   user outcome, correctness, security, stability; before sustainability and runtime
   complexity. Rationale: cheap must never outrank safe or correct, but it may outrank the
   long-horizon concerns. The resulting list is:
   `(1) user outcome / mission fit, (2) correctness, (3) security, (4) stability, (5) cost,
   (6) sustainability, (7) runtime complexity`.
   Cost must be **defined as monetary / token / runtime cost, explicitly NOT authoring
   effort** — the same section's banned-phrasing list exists to stop effort-cost reasoning,
   and an undefined "cost" dimension would reopen the door that list closes.
   **Grounding:** the 2026-08-16 parallel review justified this with a "2026-07-31 $800
   storage choice questioned on cost alone"; that decision **does not appear in
   `docs/decisions.md`** (grepped). The addition therefore stands as founder preference,
   not as an evidenced gap — recorded honestly rather than laundered into a premise
   (`docs/decisions.md:195` names this exact failure shape). The first draft proposed deleting the Approval Gate
   (`CLAUDE.md:220-224`) to fund it; that section is **not** a duplicate of ALWAYS-ASK,
   which names only *which* actions need asking. The Approval Gate uniquely carries the
   draft → show → confirm → act protocol, the never-collapse rule, and the exception
   clause — and has a named dependent at
   `.claude/commands/slava/events/publish-run.md:136`, which cites it verbatim before a
   **prod** write. Deleting it would have removed the only always-on prohibition on
   collapsing draft and send, and broken a live citation.

## Risks / Non-Goals

### Risks
- **Narrowing rather than striking (edit 1) leaves two documents describing one operation.**
  Mitigation: `:129` will name the git exclusion explicitly and point at git.md, so the
  documents agree by construction rather than by reader inference.
- **Edit 3 could still drift toward agent-declared completion.** Mitigation: the Done-When
  requires "the user decides completion" to survive verbatim, checked by grep.
- **Budget.** `CLAUDE.md` is at exactly 350/350 (`pre-commit-checks.sh:1288-1295` enforces
  the ceiling). Every edit here is an inline extension or a same-line rewrite; **no edit
  adds a line**. If the implementing agent lands any addition as a new line, the commit
  blocks — that is the intended backstop, not a failure mode to work around by deleting
  content.
- **Reversing a recorded decision.** Edit 4 changes a line the 2026-08-13 entry chose to
  keep. Mitigation: the spec cites that entry, states precisely which part of its rationale
  is factually wrong (`/wrap` was already archived), and honors the archive decision's own
  designated replacement. `/kdd` records the reversal.

### Non-Goals
- Do NOT delete the Approval Gate section, or any part of it. It is not a duplicate.
- Do NOT convert any rule to a hook here — that is spec C (mechanization).
- Do NOT re-scope any rules file from `globs: "*"` to path-scoped — that is spec E.
- Do NOT build `/wrap`.
- Do NOT add the sizing gate proposed by the 2026-08-16 parallel review: its premise is
  contradicted by `CLAUDE.md` item 5 under "Before Starting Work", which already reads
  "A change with no such dependency (copy, CSS, styling-only) doesn't need this pass."
- Do NOT add the model-effort prose proposed by the same review: it adds text to a rule
  measured as under-firing (2026-08-13 decisions.md entry: the sibling routing line fired
  **0/30**, with a control confirming the counter works). The gap is real; the remedy
  belongs in spec C.
- Do NOT touch `docs/`, `features/`, or any runtime file.

### Alternatives Considered
- **Fix the contradictions inside git.md instead of CLAUDE.md** — rejected: git.md holds
  the stricter, better-justified position (it cites the unrecoverable-loss incident);
  CLAUDE.md is the document that drifted.
- **Delete the `"wrap up"` mapping entirely** — rejected by adversarial review: the archive
  decision already names `/status` as the replacement, so deleting orphans the phrase
  instead of routing it.
- **Fund edit 5 by removing the Approval Gate** — rejected: not a duplicate, and it has a
  live dependent before a prod write. The addition needs no funding.
- **Bundle with specs C and E** — rejected: these edits have no dependencies and no
  engineering; bundling delays zero-risk fixes behind multi-day hook work.

### Rollback Strategy
Single commit touching `CLAUDE.md` and `.claude/rules/git.md`. `git revert <sha>` restores
the prior text exactly. No migration, no state, no runtime effect.

## Done-When

- [ ] All three moves of edit 1 verified by content-anchored grep, not line number (line
      numbers shift as other edits land):
      `grep -n 'ALWAYS-ACT' CLAUDE.md` → the line names git checkout/restore as excluded;
      `grep -n 'ALWAYS-ASK' CLAUDE.md` → the line now names `git checkout HEAD --`/`git restore`;
      `grep -n 'JUDGMENT' CLAUDE.md` → the line no longer names either.
      All three must hold; any one failing means edit 1 is half-applied. (Draft 1's check
      could pass on a half-applied edit, because the ALWAYS-ACT line never matched the
      pattern being grepped in the first place.)
- [ ] `CLAUDE.md`'s commit-discipline paragraph links `.claude/rules/git.md` and names the
      main-session vs subagent distinction
- [ ] `grep -c 'the user decides completion' CLAUDE.md` returns 1 — the completion
      authority survived edit 3
- [ ] `grep -c 'Never say' CLAUDE.md` returns 0
- [ ] `grep -c '/wrap' CLAUDE.md` returns 0 AND the informal phrase now routes to `/status`
- [ ] `grep -n 'Rank reasons' CLAUDE.md` shows a cost dimension in the ranked list, at position
      FIVE of seven, and defined as monetary/token/runtime cost — the line
      must NOT admit authoring effort, which the same section's banned-phrasing list forbids
- [ ] `grep -c 'draft → show → confirm → act' CLAUDE.md` returns 1 — the Approval Gate
      survived, and `publish-run.md:136`'s citation still resolves
- [ ] `git diff --stat CLAUDE.md` shows equal insertions and deletions — no net new lines
- [ ] `./scripts/pre-commit-checks.sh` passes, reporting CLAUDE.md at or under 350 lines
- [ ] Each edit was applied through the `/slava:maintain:claude-md` gate, with the gate's
      verdict quoted in the commit message (not "the session log")

## References

- Adversarial review 2026-08-19 (Fable): 7 defects; edit 5 rewritten, edit 1 narrowed,
  edit 3 corrected, edit 4 redirected, edit 2 downgraded.
- `docs/decisions.md` 2026-08-13 [process] — the 0/30 routing measurement, the gate's
  three-count refusal of a new rule, and the 350/350 deadlock.
- `docs/decisions.md` — `/wrap` and `/ship` archived; `/status` named as the replacement.
- `docs/process-learnings.md` 2026-08-14 — programme-health criteria blind spot (unrelated
  to this spec; filed the same session).
- Instrumentation: `.claude/hooks/log-instructions-loaded.sh`, log at
  `~/.claude/instructions-loaded.log` — the always-on set loads in the large majority of
  sessions and is re-paid on every compaction.
