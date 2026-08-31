# Skill Families — which one applies to this corpus

> **Charter:** this file is the single home for the **skill-family classification** — the five
> families that turn a source into stories, points and letters, the four fields that tell them
> apart, and the discriminators that settle the ambiguous cases. [CHARTER.md](CHARTER.md) rule 10
> routes here. Dated *decisions* about the classification live in [decisions.md](decisions.md)
> 2026-08-28 [process] and 2026-08-31 [product]; each skill's own frontmatter carries its four
> fields. **Consumer skills carry a pointer, never their own copy.**
>
> Extracted 2026-08-31 by the same precedent that extracted
> [arbiter-failure-model.md](arbiter-failure-model.md): the table lived only inside an append-only
> log entry, it was re-derived in conversation more than once, and a fifth family was added without
> the table being updated. Five consumers is past the point where a log entry is findable.

**Who reads this:** any agent or human choosing which skill to run against a conversation, a
recording, or a corpus — and anyone adding a sixth family, who needs to see what the existing five
already cover before claiming the ground is empty.

---

## The five families

They all write into **one substrate** — stories, points, anti-points, positions, docs, letters. They
are not competing products and the overlap is not duplication; what separates them is **where the
material comes from and who the counterparty is**.

| Family | Subject | Source | Counterparty | Produces |
|---|---|---|---|---|
| `/problemify` *(global skill)* | you, stuck | this conversation | none | a diagnosis, chat only |
| `/slava:think:align` | you ↔ **the AI** | the live exchange | the AI itself | the AI's comprehension made legible before it agrees |
| `understanding/` — `detect` → `reconstruct` → `create-letter` | one declared person | a **corpus** | one **named** person | a filed Clarity Letter, **reverse** — the reader is asked *"did this capture YOUR meaning?"* |
| `disagreement/` — `select` → `prepare` → `positions` → `story-draft` → `publish` | two **absent** speakers | recorded video | a **room** | published points + agent positions |
| `problem/` — `submit` → *(P1181 visibility)* → *(P1182 read/match)* | the member, or their customer **seen through them** | the member's **own** corpus | one named person → later, a **matched stranger** | a filed Clarity Letter, **forward** — the reader is asked *"how well did you understand the sender?"* |

---

## The discriminators, in the order that settles the most cases

1. **Is the counterparty present?** Then none of these apply — they just talk. *(2026-08-12 finding.)*
2. **Does the subject rate whether it captured their meaning?** Yes ⟹ `understanding/` (it authors
   one person's interiority and hands it back). No, and nobody's interiority is authored ⟹
   `disagreement/` (*"authors no one's interiority, quotes only"*).
3. **Is the source publishable?** `disagreement/` needs a publishable source, so a private recording
   routes to a letter chain regardless of headcount. **Headcount is not the discriminator** — this is
   the mistake the classification was written to stop.
4. **Who supplies the material?** `disagreement/` is **supply curated by one person**; `problem/` is
   **supply self-served by many**. Same substrate, different source of supply.
5. **Which question does the reader answer?** This is what separates the two letter families, and it
   is the sharpest line of the five: **reverse** (`understanding/`) vs **forward** (`problem/`).
   Getting it wrong returns a number that looks valid and measures the opposite thing.

---

## Overlaps that are deliberate — do not "fix" them

Registered so a consolidation pass does not refactor a ruling into a bug. The full register with its
reasons is [story-point-model-consumers.md](story-point-model-consumers.md); this is the routing-level
summary.

| Overlap | Verdict |
|---|---|
| `problem:submit` and `understanding:detect` both scan a corpus, declare whose stakes, run the same trigger family and consult the same arbiter-failure model | **Deliberate.** `decisions.md` 2026-08-06 [process] — **elicitation procedure is not shareable**; definitions and acceptance contracts are. Eliciting from an archive (can grep, cannot ask) is a different procedure from eliciting from a live human. **Do not extract a shared step.** |
| `problem:submit` splits A → B → obstacle where `/problemify` deliberately **welds** it | **Deliberate, opposite, both correct.** `/problemify` welds because the trajectory *is* the diagnosis for one person in the room. `problem:submit` splits because the matcher matches on the **slot**, and a welded frame gives it nothing to match on. |
| `problem:submit` and `understanding:create-letter` both end in a filed letter | **Not an overlap today** — `create-letter` writes to prod programmatically as a provisioned agent; `problem:submit` writes nothing (the member pastes and sends from their own session). It *becomes* an overlap the day a credential path is built. Extract then, not before. |

**The sharing surface is a document, never a call.** Both letter families read the model from
[story-point-model.md](story-point-model.md) and the filter from
[arbiter-failure-model.md](arbiter-failure-model.md). That is the sharing this classification
permits. A shared *step* would collapse the distinction the table exists to hold.

---

## What deliberately stays elsewhere

- **[decisions.md](decisions.md) 2026-08-28 [process]** *"Three skill families, told apart by
  counterparty"* — the dated decision, the rename it ordered, and the correction it records.
  **2026-08-31 [product]** — the shape ruling that produced the fifth family.
- **Each skill's own frontmatter** — its four fields plus its `discriminator` line, per the
  2026-08-28 ruling. **Cross-references stay sparse:** this repo records that cross-skill references
  rot silently (2026-08-05 [process]), so a skill describing *itself* stays true while one describing
  its neighbour does not. That is why the table lives here and not in five skill files.
- **[story-point-model-consumers.md](story-point-model-consumers.md)** — the per-consumer divergence
  register, including the two `problem:submit` rows summarised above.
- **[.claude/rules/skills.md](../.claude/rules/skills.md)** — namespace placement, frontmatter
  requirements and the branch guard. Mechanics of writing a skill, not which family it joins.
