# The Arbiter-Failure Model

> **Charter:** this file is the single home for the **arbiter-failure criteria** — the entry
> condition, the failure modes, what breaks about arbitration in each, their per-consumer firing
> conditions, the interface disqualifier, and the falsifiers. Worked examples of high-stakes meetings
> and decisions live in [high-stakes-examples.md](high-stakes-examples.md), deliberately **not**
> here: consumer skills read this file as a rubric, and the detect skill's own rule is that a rubric
> names shapes, never findings ("a rubric that names what it once found stops measuring and starts
> confirming", `.claude/commands/slava/understanding/detect.md`). Dated *decisions* about the model (why, alternatives, the
> reconciliation with the rival axis names) live in [decisions.md](decisions.md) 2026-08-24
> [product]; the go-to-market reading — why this filter picks the customer segment it does, its
> derivation and its provenance — stays in [lean-canvas.md](lean-canvas.md) §Customer Segments,
> which carries a pointer here. Consumer skills carry a pointer, never their own copy.
>
> Established by charter rule 2's concept-model exception ([CHARTER.md](CHARTER.md)) and extracted
> here by P1190, 2026-08-28, when a third consumer skill was added and the operational layer was
> found to be living inside a skill file.

**Who reads this:** any skill or agent that decides whether the comprehension instrument applies to
a given item — `/slava:understanding:detect` (private corpus, one bearer), the disagreement points
pipeline `/slava:disagreement:prepare` (public claims, a room as bearer), and any future consumer.
They need the *whole* thing — the definition **plus** the firing conditions and the disqualifier —
which is why it lives here as one document rather than as a stripped glossary entry.

**Read "the three criteria" anywhere else in this repo as this list.** The phrase predates the
fourth mode (added 2026-08-24) and was not rewritten in the append-only log or in published
articles.

**Epistemic status is marked per mode.** Fuzzy intent, delayed feedback and concentrated
consequences are the 2026-07-03 re-derivation and have field contact. Explanatory divergence is
**UNTESTED**, deductive, zero field contact. The entry condition and the
`irreversible` mode (both added 2026-11-18) are **UNTESTED** as filters. Do not weight them alike.

**Renamed 2026-11-18:** `concentrated stakes` is now **`concentrated consequences`** (founder
decision, [decisions.md](decisions.md) 2026-11-18 [product]). The detect and prepare skills and the
generated product prompt were updated the same day to emit the new tag and `irreversible`. Output
written before then carries the old tag `concentrated stakes`; read it as the new name.

---

## The model

A challenge is worth the comprehension instrument when **its success depends on shared
understanding** (the entry condition) **and its natural consequence-arbiter fails** (one of the
modes below).

The grounding: meaning hardens into fact via repeated shared consequence. The modes are where that
arbiter breaks. They fail at **ambiguity** (fuzzy intent), **timing** (delayed feedback), **cost of
trial** (concentrated consequences, irreversible) and **attribution** (explanatory divergence); the
last is what admits explanatory divergence to the taxonomy rather than bolting it on.

### The entry condition, above the modes

**Success depends on shared understanding:** if the people involved act on different readings of
it, the outcome suffers. This is the gate; the modes sit under it and say why the natural outcome
will not reveal the misunderstanding in time to fix it cheaply. It is the positive form of skip
rule (b) in [definitions.md](definitions.md) §When the Protocol Applies (the cost of
misunderstanding is low), and the "real stake" half of the problem-board filter (a real stake
**and** at least one mode).

**How you know it holds:** ask the counterfactual, *"if two of you walked away with different
readings of this, would the result suffer?"*, and answer it together with the person whose item it
is. Our side does not prefill their stakes ([decisions.md](decisions.md) 2026-07-29, two consents).
An item that passes the gate but trips no mode is still high-stakes; it is `NONE` below, because the
outcome will show the misunderstanding by itself.

*Added 2026-11-18, UNTESTED as a filter.*

**Not pitch copy.** A prospect can no more self-diagnose explanatory divergence than fuzzy intent;
the room is the instrument that surfaces them (2026-04-23 caveat, still standing).

---

## The modes — defined, not listed

Each mode carries the name this repo uses, the rival name from the "qualifying conditions v6" chain
reconciled in [decisions.md](decisions.md) 2026-08-24, what breaks about arbitration, and its
epistemic status.

| mode | rival name | what breaks about arbitration | status |
|---|---|---|---|
| `fuzzy intent` | **specifiability** | **Too ambiguous to arbitrate.** The load-bearing term is not specifiable, so no consequence can settle what it meant — the outcome arrives and both parties still read it as confirming their own reading. | field contact (2026-07-03) |
| `delayed feedback` | **observability**, widened | **Too late to arbitrate.** The consequence lands long after the decision is unwindable. The rival name widens this deliberately: it is not only *delay* — **scale and distance** break observation the same way, when the outcome is real but nobody positioned to see it is positioned to attribute it. | field contact (2026-07-03) |
| `concentrated consequences` (was `concentrated stakes`) | *(dropped by the rival chain)* | **Too costly to arbitrate by trial.** The cost of being wrong lands on specific named people, so you cannot just run it and see. The rival chain drops this mode entirely; it is retained because trial-cost is a distinct failure from ambiguity and timing, and dropping it would leave the taxonomy unable to name the case where the arbiter *would* work and must not be allowed to. | field contact (2026-07-03) |
| `irreversible` | *(none)* | **Too costly to arbitrate by trial, a second way.** Once acted on, the decision cannot be undone, so learning you were wrong does not let you try again. Distinct from `concentrated consequences` (that one is *who* bears the cost; this one is *whether* the cost can be reversed at all) and from `delayed feedback` (that one is *when* you learn; this one is whether learning still helps). | **UNTESTED** as a filter, added 2026-11-18 |
| `explanatory divergence` | **explanatory divergence** | **Not *attributed* to comprehension.** Feedback arrives on time and each party's own causal model explains the outcome, so neither reads the divergence as a misunderstanding — or as defection. | **UNTESTED** — deductive, zero field contact, added 2026-08-24 |
| `NONE` | — | **Nothing breaks.** The natural arbiter works; consequence will settle this without the instrument. | — |

**`NONE` is a finding, not a defect.** A high-stakes item whose arbiter works is an item the
instrument does not serve, and saying so is the point of carrying the field. Never re-label it to
make a run look productive — **a run where the filter never excludes anything is a filter that is
not running.**

---

## Firing conditions, by consumer

The modes are the same; **what counts as evidence that one fires is not.** A private corpus offers
the reasoning of a specific bearer; a public claim offers only the claim. These columns are not
interchangeable text.

### Consumer: a private corpus, one bearer (`/slava:understanding:detect`)

| mode | fires when the corpus shows |
|---|---|
| `fuzzy intent` | neither party can fully articulate what they mean by the load-bearing term |
| `delayed feedback` | the consequence lands months out, long after the decision is unwindable |
| `concentrated consequences` | the cost of being wrong lands on specific named people, so you cannot just run it and see |
| `irreversible` | the decision cannot be undone once acted on (a signature, a hire or a firing, an announcement, a release others build on), so a wrong reading cannot be corrected by trying again |
| `explanatory divergence` | feedback arrives on time and each party's own causal model explains the outcome, so neither reads the divergence as a misunderstanding |
| `NONE` | the natural arbiter works — consequence will settle this without the instrument |

### Consumer: a public claim, a room as bearer (disagreement points pipeline)

| mode | fires when a public claim shows |
|---|---|
| `fuzzy intent` | the load-bearing term admits no stated test — nothing named in the claim would settle what counts as satisfying it |
| `delayed feedback` | the consequence lands on a horizon or a scale where no one taking a position will observe the outcome *attributed to this choice* |
| `concentrated consequences` | being wrong lands on identifiable people who are not in the room and cannot opt out of the trial |
| `irreversible` | the claim proposes an action that cannot be undone once taken, so no try-and-revert is available |
| `explanatory divergence` | both camps already hold a complete causal story for the *same* observed outcome, so the disagreement survives the evidence arriving |
| `NONE` | the claim is empirical, near-term and checkable — someone will simply be shown right |

> **Measured, and it inverts the obvious design (P1190, 2026-08-28).** Dry-run against the five
> statements of the `ai-power-remedies` run, bearer = the room: the modes fire on **5 of 5**, `NONE`
> zero. This is not an accident of that run — **a public argument about what *should* be done is
> normative or long-horizon by construction**, so its natural arbiter fails almost always.
>
> **Consequence for any public-claim consumer: the modes are a near-universal pass and do not
> discriminate.** The component that actually excludes is the **interface disqualifier** below. A
> public-claim consumer that gates on the modes has built a gate that never closes; tag the mode and
> report it, gate on the disqualifier.

---

## The interface disqualifier — a skip, stated, never silent

Where a **specifying interface already carries the coordination** — a price, a technical standard, a
legal precedent, a default, an ADR, a PR gate, **or a document** that actually arbitrates *this*
item — the instrument is not needed, because an interface **is** a working consequence-arbiter
([definitions.md](definitions.md) §When the Protocol Applies, 2026-08-24).

Write: `SKIP — interface: ‹the interface› · ‹the one line saying why it arbitrates this item›`

Two rules bound it, because a disqualifier that fires loosely deletes real candidates:

1. **Name the interface, or you have not applied it.** "There's probably a process for this" is not
   an interface. If you cannot name the specific price, standard, precedent, default, gate or
   document, the disqualifier does not fire.
2. **A skipped item is still emitted, with its reason on it.** Skips are printed, never removed — a
   wrongly-applied disqualifier that deletes the item is unreviewable, while one that prints its
   reasoning is one line for the reader to reject. The cheap error is the visible one.

**On a public claim, the document form is the live case.** *"The report found X"* is settled by
reading the report and is skipped, naming the report. *"Labs are turning to AI to oversee AI
development"* is settled by nothing and stands.

---

## Reader translation

Where a mode is shown to the person whose item it is, translate it — never drop it. It is the line
that answers *"why this one and not the twenty other things I said"*.

| mode | in the reader's words |
|---|---|
| `fuzzy intent` | neither of you could say exactly what you meant — so nothing will settle it by itself |
| `delayed feedback` | you'd find out you were wrong months from now, long after you can unwind it |
| `concentrated consequences` | being wrong lands on specific people, so you can't just try it and see |
| `irreversible` | once it's done it can't be undone, so you can't try it and see |
| `explanatory divergence` | you'd both explain the outcome your own way and neither would call it a misunderstanding |
| `NONE` | this one will settle itself — it belongs under *Not for this instrument* |
| interface skip | ‹the named interface› already decides this; use it |

---

## Falsifiers

They travel with the model; none has been run.

- **Fuzzy intent, delayed feedback, concentrated consequences.** If people with challenges outside
  all of them pull on the instrument just as hard, the criteria don't filter and this targeting is
  noise.
- **Explanatory divergence.** If dyads that share one causal model but score low on specifiability
  pull just as hard as dyads whose models diverge, the mode does no work and is dropped.
- **Irreversible** (recorded 2026-11-18). If items where only `irreversible` fires (no other mode)
  turn up verified gaps that mattered no more often than `NONE` items, it adds nothing beyond
  `concentrated consequences` and is folded back into it.
- **The entry condition** (recorded 2026-11-18). If items the person says would *not* suffer from
  different readings turn up verified gaps that mattered as often as items they say would, the
  question does not sort anything and the gate is cut.
- **The interface disqualifier** (recorded 2026-08-24). If teams whose contribution is already
  specified by a price, a standard, a precedent or a default buy and install at the same rate as
  teams with no such interface, the exclusion does not disqualify and should be cut.

**The novel prediction that pairs with the mode-4 falsifier is a claim about *who buys*, so it
stays in [lean-canvas.md](lean-canvas.md) §Customer Segments** rather than travelling here — explanatory
divergence and the interface disqualifier make opposite predictions on teams already running ADRs and PR gates,
and settling that is a targeting question, not a definitional one.

---

## What deliberately stays elsewhere

- **[lean-canvas.md](lean-canvas.md) §Customer Segments** — the derivation, the provenance, the
  supersession of the 2026-04-23 term-drift, the internal corroboration from
  [hypotheses.md](hypotheses.md), and the go-to-market reading of the filter. Those do GTM work and
  must not travel with the definition; the move is a **split, not a cut-and-paste**.
- **[definitions.md](definitions.md) §When the Protocol Applies** — the plain-meaning entry for the
  interface disqualifier, pointing here.
- **[decisions.md](decisions.md) 2026-08-24 [product]** — the dated decision, the rejected
  alternatives, and the rival-axis reconciliation; 2026-11-18 [product] for the entry condition,
  `irreversible` and the rename.
- **[definitions.md](definitions.md) §High Stakes** — the plain-meaning glossary entry, pointing here.
- **[high-stakes-examples.md](high-stakes-examples.md)** — example meetings and decisions, with the
  conditions each usually meets.
