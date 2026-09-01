# Story Craft — how to write one somebody finishes

**Charter:** routing lives in [CHARTER.md](CHARTER.md). **What a Story *is*** — recount vs reveal,
the agreement test, why a Story can only be comprehended — lives in
[story-point-model.md](story-point-model.md). **Read it there; do not restate it here.**

This file holds one thing the model doc does not: the *craft procedure*. Length, opening, sentence
shape, and the patterns that make a factually correct story unreadable.

> **Why it exists.** The disagreement pipeline's first end-to-end run produced four stories that
> passed every accuracy gate and that the founder could not read: *"right now it's too dry and it's
> not interesting to read… I cannot read that."* Nothing in the pipeline looked at prose. `grep -F`
> verifies quotes and says nothing about the sentences around them.

---

## Consumers

| Skill | Reads this for |
|---|---|
| [`/slava:disagreement:story-draft`](../.claude/commands/slava/disagreement/story-draft.md) | Every rule below. It adds the person-safety rules (attribution, position, full-name) and keeps them in its own file. |

**One consumer today.** That is deliberate and it is the extraction risk running the other way: this
repo's precedent is to extract a shared doc when a *third* consumer appears, and premature extraction
is what produced the five-copy drift already on record. This file exists ahead of that rule because
the founder chose it (2026-08-31, *"I agree with decision A"*) and `CHARTER.md` §"Recording is never
blocked, only routed" makes routing advisory and the founder's call final.

**If a second consumer appears** (the blog or letter skills are the candidates), the rules below are
almost certainly not all portable — the ceiling is not, the metadiscourse ban probably is. Split at
that point; do not copy.

---

## 1. The ceiling

**A pipeline story is at most 1,500 characters of AUTHORED content — the prose and the quote block.**
**The event hashtag the filer appends is EXCLUDED from the count** (it is filer-written metadata, not
something the writer chose), and so is anything else a downstream stage appends. The database's own
10,000-character check covers the assembled total.

*(Clarified 2026-09-01, on the first real filing. The ceiling was written as "everything the `content`
field holds", but `/slava:disagreement:publish` MUST append `#<event-tag>` to the body — the tag
trigger reads it out of the text. Three stories drafted at 1,493–1,496 became 1,505–1,508 the moment
the filer did its job, so the drafting stage and the filing stage were measuring different strings and
a correct story failed at the gate. Nothing about the intended length changed; the accounting did.)* Not a target to approach: a ceiling that forces the choice about what the story is *for*.

The existing 10,000-character database limit is a constraint, not a brief. The four drafts that
prompted this file ran 2,416–3,604.

**Measured, so the number is not mistaken for a spare allowance** (`ai-power-remedies` run B):

```
              total   prose   quote block   prose left at 1,500
story 1 (5q)   3142    2349          791            709
story 2 (7q)   3604    2703          899            601
story 3 (5q)   2416    1907          507            993
story 4 (3q)   2656    2176          478           1022
```

*(Subjects unnamed: this file is public and the drafts these numbers describe were about real named
people. `q` = quotes in the text — the column that drives the third one.)*

Two things follow, and they matter more than the number.

- **The quote block scales with quote count, so the arguer with the most quotes gets the least room
  for prose** — exactly backwards, since more quotes means more strands to connect. The consumer
  skill decides how many quotes enter the text; the prose is what the ceiling must protect.
- **1,500 is an assumption, not a measurement.** The founder's stated range was *"1,000 … or maybe
  1,500"* and the number may need to move **down** as well as up. *Falsifier: if a story written to
  this ceiling cannot carry its reasoning without dropping a strand the source actually contains, the
  ceiling is wrong — say so with the character count, do not quietly overrun it.*

---

## 2. The first sentence must earn the second

**No story may open by announcing what it is about.** An opening that describes the story instead of
starting it spends the only sentence a reader is guaranteed to read.

```
✗  The argument <Full Name> makes in this talk begins with a claim about what moved
   the field in the first place.
✗  The argument <Full Name> makes in this interview rests on an asymmetry.
```

Both are verbatim from the failed drafts, with the subjects' names replaced — this file is public.
Both are true. Both are a table of contents. The reader learns that an argument exists and is given
no reason to want it.

Open on the load-bearing thing itself — the claim, the mechanism, the tension, the consequence. If
the first sentence would still be true with the subject's name swapped for anyone else's, it is not
an opening.

---

## 3. Metadiscourse is the disease

**The single largest cause of the dryness.** Attribution repeated on every clause turns an argument
into a transcript of someone reporting an argument.

Banned constructions, all of them lifted verbatim from the drafts that failed:

| Pattern | Occurrences that failed | Write instead |
|---|---|---|
| *"The argument X makes in this talk…"* | opened 4 of 4 stories | the argument |
| *"is described as"*, *"is characterised as"* | throughout | the thing itself |
| *"The claim made is that…"* | throughout | the claim |
| *"The remedy X describes follows from…"* | throughout | the remedy |
| *"The evidence offered is…"*, *"The reason given is…"* | throughout | the evidence, the reason |
| *"the observation is added that"* | throughout | delete; state the observation |

**Attribute once, at the top, and then write.** The rendered page already carries the machine-account
byline, the embedded video, the footer disclaiming authorship, and the quote block naming its source.
Four surfaces establish whose argument this is. The prose re-hedging every sentence adds nothing a
reader needs and removes everything they came for.

**This does not license imputation.** Attributing once is not permission to state what the person
believes — see the consumer skill's person-safety rules. The move being banned here is
*grammatical throat-clearing*, not attribution itself.

> **Provenance.** The diagnosis — metadiscourse as the disease, classic-style prose as the cure — is
> the drafting agent's own knowledge of the prose-advice literature, **not verified against a source
> and UNTESTED here.** *Falsifier: if a rewrite obeying every rule above still reads flat under the
> reader test in §7, the diagnosis is wrong and a research pass has earned its cost.*

---

## 4. The story's job is the connective tissue

**A story that paraphrases its own quotes has no reason to exist.** The quotes are on the page,
verbatim, each with a jump link into the video. Restating them in worse words is the pipeline
spending 900 characters to make its evidence weaker.

The story's job is the thing the fragments cannot carry: **why they hang together.** The reasoning
that runs between quote one and quote four — the step the speaker made that no single quote states.
That is what `publish.md` means by *"the inference chain belongs in the agent's story"*, and it is
the part a reader cannot reconstruct alone.

Test each sentence: **if a reader with the quote list in front of them already knows this, cut it.**

---

## 5. Sentences

- **Short.** A sentence carrying two subordinate clauses is carrying one of them for the writer's
  benefit.
- **Concrete nouns, active verbs.** *"legal systems have recognised two kinds of person"* over
  *"there exists a recognition of two categories of personhood."*
- **Nominalisation is where the energy goes to die** — *the observation is added*, *the conclusion
  drawn is*, *what is wanted is*. If a verb has been turned into a noun and given a weak verb to
  carry it, turn it back.
- **The passive is not banned; the agentless passive is the tell.** *"is described as"* hides who is
  describing. When the agent is the subject of the story, name them or drop the frame.

---

## 6. Rejected, with the reason

| Move | Why not |
|---|---|
| Marking agent interpretation as speculation in the prose (*"this part is inferred"*) | Weak writing, and it duplicates the inference-strength label the pipeline already carries — two homes for one fact. Founder-rejected 2026-08-31. **If the reasoning is not in the source, do not write it**: a two-hour transcript always holds more real reasoning than 1,500 characters can carry. |
| Opening by naming the subject's position | Makes the Story a Point, which [story-point-model.md](story-point-model.md) forbids. Full reasoning is in the consumer skill's person-safety rules. |
| A separate skill that rewrites stories for style afterwards | Two skills authoring one artifact is how rules drift apart. And a strong opening cannot be bolted on afterwards — the constraint has to be held *while* writing. |
| Trimming toward a token budget | The ceiling is a craft constraint, not an economy. Founder, 2026-08-31: *"I don't think token efficiency is that important… we have to do it good or we don't do it."* |

---

## 7. How these rules are measured — the blind reader test

The rules above are a hypothesis about what makes a story readable. **The founder is not the test.**
They asked to be taken out of the loop (*"next time we run it, I don't want to repeat myself"*), and
an accuracy checker does not substitute — it checks claims against sources and says nothing about
whether anyone would read the thing.

**Design. Every element below is load-bearing; a test missing any one of them measures agent variance
rather than writing.**

1. **One evaluator sees BOTH versions of the SAME story**, in randomised order, unlabelled, with no
   indication that a comparison is being run. Same subject, same evaluator: the only variable is the
   writing.
2. **Three fixed questions, asked in this order:**
   - **Q1 — shown the opening sentence ALONE, before anything else: would you read on? yes/no.**
     Asked after the full text, it is answered retrospectively by a reader who already knows the
     ending, and it measures nothing.
   - **Q2 — what does this person think?**
   - **Q3 — why do they think it?**
3. **Anchors, so the scale means something.** Include one deliberately bad story (throat-clearing
   opener, quotes paraphrased) and one deliberately good one. **An evaluator that does not rank the
   anchors correctly is not measuring — discard that run and re-run it.**
4. **A tie is a failure to improve, not a pass.** The rewrite must win **outright** on Q1 across a
   majority of stories.

**Status: RUN ONCE, 2026-08-31 — n=1, on the run that motivated these rules.** Anchors ranked
correctly (deliberately-good 1st of 10, deliberately-bad 10th), so the run counts. The rewrite won Q1
**outright on 3 of 4** stories; the 4th tied YES/YES on the binary and the rewrite outranked the
original 3rd vs 6th. Every rewritten opening ranked above every original.

**That is one evaluator on one topic, and it is not enough to call the rules validated** — the same
agent family wrote the rules and evaluated them, which the anchors bound but do not eliminate.
*Falsifier, still live: if a later run's rewrites do not win Q1 outright, the rules in §2–§5 are
wrong, and the honest report is that they were tried and did not work — not a re-run until they do.*

---

## History

Created 2026-08-31 (P1202), after the `ai-power-remedies` run B produced four accurate,
unreadable stories. Dated decisions and alternatives: [decisions.md](decisions.md).
