# The Arbiter-Failure Model

> **Charter:** this file is the single home for the **arbiter-failure criteria** — the four failure
> modes, what breaks about arbitration in each, their per-consumer firing conditions, the interface
> disqualifier, and the falsifiers. Dated *decisions* about the model (why, alternatives, the
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

**Epistemic status is marked per mode.** Modes 1–3 are the 2026-07-03 re-derivation and have field
contact. Mode 4 is **UNTESTED**, deductive, zero field contact. Do not weight them alike.

---

## The model

A challenge is worth the comprehension instrument when its **natural consequence-arbiter fails**.

The grounding: meaning hardens into fact via repeated shared consequence. These four modes are
where that arbiter breaks. The first three fail at **ambiguity**, **timing** and **cost of trial**;
the fourth fails at **attribution**, which is what admits it to the taxonomy rather than bolting it
on.

**Not pitch copy.** A prospect can no more self-diagnose explanatory divergence than fuzzy intent;
the room is the instrument that surfaces them (2026-04-23 caveat, still standing).

---

## The four modes — defined, not listed

Each mode carries the name this repo uses, the rival name from the "qualifying conditions v6" chain
reconciled in [decisions.md](decisions.md) 2026-08-24, what breaks about arbitration, and its
epistemic status.

| mode | rival name | what breaks about arbitration | status |
|---|---|---|---|
| `fuzzy intent` | **specifiability** | **Too ambiguous to arbitrate.** The load-bearing term is not specifiable, so no consequence can settle what it meant — the outcome arrives and both parties still read it as confirming their own reading. | field contact (2026-07-03) |
| `delayed feedback` | **observability**, widened | **Too late to arbitrate.** The consequence lands long after the decision is unwindable. The rival name widens this deliberately: it is not only *delay* — **scale and distance** break observation the same way, when the outcome is real but nobody positioned to see it is positioned to attribute it. | field contact (2026-07-03) |
| `concentrated stakes` | *(dropped by the rival chain)* | **Too costly to arbitrate by trial.** The cost of being wrong lands on specific named people, so you cannot just run it and see. The rival chain drops this mode entirely; it is retained because trial-cost is a distinct failure from ambiguity and timing, and dropping it would leave the taxonomy unable to name the case where the arbiter *would* work and must not be allowed to. | field contact (2026-07-03) |
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
| `concentrated stakes` | the cost of being wrong lands on specific named people, so you cannot just run it and see |
| `explanatory divergence` | feedback arrives on time and each party's own causal model explains the outcome, so neither reads the divergence as a misunderstanding |
| `NONE` | the natural arbiter works — consequence will settle this without the instrument |

### Consumer: a public claim, a room as bearer (disagreement points pipeline)

| mode | fires when a public claim shows |
|---|---|
| `fuzzy intent` | the load-bearing term admits no stated test — nothing named in the claim would settle what counts as satisfying it |
| `delayed feedback` | the consequence lands on a horizon or a scale where no one taking a position will observe the outcome *attributed to this choice* |
| `concentrated stakes` | being wrong lands on identifiable people who are not in the room and cannot opt out of the trial |
| `explanatory divergence` | both camps already hold a complete causal story for the *same* observed outcome, so the disagreement survives the evidence arriving |
| `NONE` | the claim is empirical, near-term and checkable — someone will simply be shown right |

> **Measured, and it inverts the obvious design (P1190, 2026-08-28).** Dry-run against the five
> statements of the `ai-power-remedies` run, bearer = the room: the modes fire on **5 of 5**, `NONE`
> zero. This is not an accident of that run — **a public argument about what *should* be done is
> normative or long-horizon by construction**, so its natural arbiter fails almost always.
>
> **Consequence for any public-claim consumer: the four modes are a near-universal pass and do not
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
| `concentrated stakes` | being wrong lands on specific people, so you can't just try it and see |
| `explanatory divergence` | you'd both explain the outcome your own way and neither would call it a misunderstanding |
| `NONE` | this one will settle itself — it belongs under *Not for this instrument* |
| interface skip | ‹the named interface› already decides this; use it |

---

## Falsifiers

Both travel with the model; neither has been run.

- **Modes 1–3.** If people with challenges outside all of them pull on the instrument just as hard,
  the criteria don't filter and this targeting is noise.
- **Mode 4.** If dyads that share one causal model but score low on specifiability pull just as hard
  as dyads whose models diverge, the fourth mode does no work and this drops back to three.
- **The interface disqualifier** (recorded 2026-08-24). If teams whose contribution is already
  specified by a price, a standard, a precedent or a default buy and install at the same rate as
  teams with no such interface, the exclusion does not disqualify and should be cut.

**The novel prediction that pairs with the mode-4 falsifier is a claim about *who buys*, so it
stays in [lean-canvas.md](lean-canvas.md) §Customer Segments** rather than travelling here — mode 4
and the interface disqualifier make opposite predictions on teams already running ADRs and PR gates,
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
  alternatives, and the rival-axis reconciliation.
