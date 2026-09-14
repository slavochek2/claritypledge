# The Problem Board — end-to-end process

> **Charter:** this file is the single home for the **build order** of the problem board — the
> phases, what each one tests, and what blocks what. It names specs and points at them; it never
> restates their scope. Spec content lives in the specs, decisions live in
> [decisions.md](decisions.md), and the construct itself (one story plus three contestable claims)
> lives in P1180 until the `story-point-model.md` migration lands.
>
> Sibling process docs: [software-delivery-process.md](software-delivery-process.md) ·
> [content-process.md](content-process.md) · [points-process.md](points-process.md).

**Workstream:** `problem-board`. Established 2026-09-08; the three specs previously carried
`infrastructure`, which hid that they are one product line.

---

## What this is for

A practitioner with ten trusted people can get their thinking broken on demand. That does not
transfer: it runs on a favour, on trust nobody can inspect, and on hand routing. The problem board
tests whether a **written** problem can establish enough understanding in a stranger, fast and
without a conversation, that their disagreement is worth having.

**Comprehension alone is a failure.** A reader who understands perfectly and disagrees with nothing
has produced a mirror, and a mirror is what this replaces. The target is understanding **and**
friction.

The hypothesis is registered as `H-AbsentCounterparty` in [hypotheses.md](hypotheses.md) —
**UNTESTED, zero rounds run.**

---

## The phases

Each phase names what it tests. A phase is not done when its code ships; it is done when its
question is answered either way.

### Phase 1 — does a written problem produce disagreement worth having?

The load-bearing bet, and the one currently at zero rounds. Two people, matching done by hand.

1. The sender mines their own session history into a classified, ranked, redacted inventory.
2. The sender reviews it — nothing is included by default — rates each problem's story 0–10 with a
   floor of 8, and takes a position on each claim and on each anti-point.
3. **The confound is decided here, before anything is sent.** See the gate below.
4. The counterparty receives the inventory file and a scoring skill. Their agent ranks it **by
   slot, not by problem**; **they pick one.**
5. Only then is a letter drafted for that one problem and filed — **via the paste path, from the
   sender's own browser session.** No letter is filed before the pick.
6. They answer it in the product. Both comprehension estimates are recorded — the reader's, and
   the sender's counter-estimate — and the min-gate applies.
7. **They mine their own history and send one back by the same route.** The round is not complete
   until the reciprocal letter has also been answered.

> **Confound gate — decided at step 3, never in the moment.**
> A high comprehension score from a reader who already knows the project is equally consistent with
> *the problem statement worked* and *they already had the context*. Pick a counterparty who does
> not already know the project and it mostly dissolves. **Where that is not possible, the score is
> recorded as uninterpretable — never as a pass.** Verbatim requirement from
> [hypotheses.md](hypotheses.md) `H-AbsentCounterparty`; restated here because this is the document
> an executor follows.

> **What phase 1 measures, and what it does not.** The counterparty is **recruited** — a known
> person who agreed in advance to a mutual round. Their agent ranking the inventory produces
> self-selection *among problems*, not self-selection *into reading at all*. The registered
> hypothesis says the reader is *"self-selected rather than recruited, so reading is an exchange
> rather than a favour"* — phase 1 tests the **absence** leg (the counterparty was genuinely not in
> the room) and **does not test the exchange leg**. A positive result here therefore does not
> corroborate the registered claim in full, and must be recorded with that scope attached. Only the
> matcher (phase 4) produces a self-selected reader.

**Step 6 is not optional.** Reciprocity is the one part of the practitioner loop this design
structurally improves on — it is what stops a read being a favour, and a favour is what caps that
loop at ten people and zero strangers. A round in which one party only sends has not tested the
thing.

**Matching is done by a human here, deliberately.** With one counterparty, matching is a person
reading a ranked list and pointing at one. Building the agent that does this automatically before
knowing whether the letter works at all means building routing for something unvalidated — and a
null result would not say which half failed.

**Blocked by:** nothing.

### Phase 2 — does reviewing get better with a real surface?

The review in phase 1 happens in a terminal. Phase 2 gives it a screen: read the problem, accept or
reject, then per claim see the point beside its anti-point and agree or say what is missing — with
the draft revised until approved.

**The unit is story and point**, which is the product's universal unit, so the surface generalises
because of what it operates on rather than because options were added for hypothetical callers. It
is built against one real consumer first.

Voice input for the revision step joins here rather than earlier: the transcription work it depends
on has open faults, and the review surface must not wait behind them.

**Blocked by:** phase 1, which is what tells this surface what reviewing at volume actually needs.
Writing it earlier means designing against imagined requirements.

### Phase 3 — does the surface generalise beyond problems?

The existing story-creation page is replaced by the phase-2 surface. This is deliberately after the
surface has been used for real, because replacing a live page that people already use is a
different risk class from adding a new internal flow, and designing the replacement up front means
designing against what that page is imagined to need.

**Blocked by:** phase 2, and by phase 2 having been used.

### Phase 4 — can an agent reproduce what a human did by hand?

The matcher becomes autonomous rather than assisted, and the counterparty's side stops requiring a
paste. Both halves of this phase exist because phase 1 was run by hand first: the matcher is built
to reproduce an observed behaviour rather than a guessed one.

**Blocked by:** phase 1 (for the observation), and by P1215 for the agent-identity half — see
*Standing constraint* below.

### Phase 5 — does it hold with a group instead of a pair?

Community-scoped visibility, then a rollout to one test group.

**Blocked by:** phase 4. Not blocked by P1180, which is done.

---

## The specs

| Spec | Phase | Blocked by |
|---|---|---|
| **P1180** — the submit skill, shipped | 1 | — (done) |
| *New* — sender side: the inventory, and submit reading it | 1 | nothing unbuilt; carries two named requirements below |
| **P1182** — reader side, trimmed to assisted-with-human-picking | 1 | the inventory's file format |
| *Not yet written* — the review surface | 2 | phase 1 |
| *Not yet written* — story-page replacement | 3 | phase 2 |
| **P1215** — a user's agent acts as them without credentials | 4 | see below |
| **P1181** — community-scoped visibility | 5 | phase 4 |

**P1182's recorded blocked-by is over-broad and is corrected by this document.** It reads *"blocked
by P1180 and P1181"*. The dependency on community visibility holds only where the corpus lives
**inside the product**, so two members need to read each other's submissions. Handing over a file
has nothing shared and needs no shared visibility. The in-product multi-member version keeps that
dependency; the phase-1 file-based version does not.

**Two requirements the sender-side spec must carry, both already recorded elsewhere and neither in
P1180's Done-When:**

1. **The want stated as an explicit sentence inside the story.** P1182's amendment: once *where they
   want to get to* became story material, there is no per-slot comprehension object, so a reader's
   divergence on it must surface as a comprehension flag on the story — and for there to be anything
   to flag, the submit side has to state the want explicitly. P1182 marks this *"surface it before
   this spec is worked."*
2. **Ranking is by slot, not by problem — and the labels must survive into the file.** *"Match on
   the slot, not the problem"* (decisions.md 2026-08-28 [product]); divergence on the obstacle and
   on the hypothesis are the high-value cases. The submit skill emits a `local` / `portable` label
   per claim, and P1182's amendment warns that a ranker without them *"will systematically
   under-supply claim 1 and read that as low interest."* The inventory must carry them through.
   Ranking by topic overlap is the exact failure P1182's own risk table names — *"matches come back
   generic."*

### Step 7 runs on a path nobody has executed

The counterparty cannot use the founder's local history tool — P1180: *"not on PATH by design."*
They get the fallback scanner, and P1180's implementation notes record it plainly: *"The fallback
path (direct globbing, compressed stores treated as unreachable rather than empty)… has **not** been
exercised."*

So the step this document calls not-optional rests on code that has never run, on someone else's
machine, mid-round, with their goodwill as the collateral. **Exercise the fallback before the
inventory is handed over** — on a machine without the local tool, against a real store — or step 7
is a coin flip. This is epistemic gate 7 applied to the reciprocity half: a path you have not
watched work is unproven.

**Deliberately not specs.** Keeping system-created letters out of the sender's own lists is a note,
not a phase-1 item — clutter is annoying, not blocking. It is also now moot for round one, since
step 5 files one letter rather than many.

---

## Standing constraint — nobody files programmatically, including the founder

**Programmatic filing does not exist and is not to be built here.** P1180 records the founder
direction of 2026-08-31 — *"the paste fallback is the round-one path, and the credential path is
NOT built"* — and is explicit that this binds the founder's own run too: *"For the founder's own run
it must be designed before Stage 6 is attempted, or the run uses the paste fallback too."*

Holding production credentials is **not** sufficient. The seal step compares the sender against the
sender's own authenticated session (`v_sender_id != auth.uid()`), and P1180 documents that a
superuser path silently no-ops that check rather than raising — so an improvised credential route
would appear to work while bypassing the guard entirely. That is the failure mode the security
track exists to prevent.

**This is why step 5 files one letter after the pick rather than many before it.** Filing at volume
was only ever justified by a capability that does not exist; removing it removes the dependency.
Everything phase 1 needs is a shipped flow today.

An earlier draft of this document asserted the opposite and marked phase 1 *"blocked by nothing"* on
that basis. Corrected 2026-09-14 after a hostile review checked it against the record.

---

## What this process does NOT cover

- **The construct** — one story plus three contestable claims, with each anti-point a complete rival
  position. Lives in P1180 §Stage 3 until it migrates to
  [story-point-model.md](story-point-model.md) through `/slava:maintain:docs-strategy-update`.
- **The filter** — which problems the instrument serves at all. That is
  [arbiter-failure-model.md](arbiter-failure-model.md), private-corpus column.
- **The security track** — P1239, P1214 and the P1207 family are their own work. They touch this
  process only through P1215, and only at phase 4.
- **Privacy of the corpus itself.** No corpus content leaves the machine; what leaves is the
  inventory the sender explicitly included, with third parties anonymized. That constraint belongs
  to the sender-side spec, not here.

## Related

- [hypotheses.md](hypotheses.md) `H-AbsentCounterparty` — the bet and its falsifier
- [arbiter-failure-model.md](arbiter-failure-model.md) — which problems qualify
- [decisions.md](decisions.md) 2026-08-31 [product] *"The reader test run on all five candidates"* —
  the settled shape. Cite by date-and-heading anchor, never by line: the log is newest-first.
