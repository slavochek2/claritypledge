---
title: "An Agent Is Never Absent"
status: preparing
tags:
  - ai-safety
  - agents
  - verification
  - negative-result
target: LessWrong / Alignment Forum (adapted); Clarity Notes
---

# An Agent Is Never Absent

*A negative result. We built an instrument to measure whether an AI agent understood us, and refuted its premise before we filed a single measurement.*

---

I spent a week building a way to find out whether my agent actually understood me.

The design was clean. The agent reads a corpus of my reasoning, writes a paraphrase back, and files it as a private letter, marked as *my* experience rather than its own. Before I see it, the agent seals a number: how well it thinks it captured my meaning. Then I read it and rate it independently. Two numbers, sealed separately, and the lower one binds. The agent cannot certify itself.

That last property is the whole point. Every comprehension score our product could previously produce was a score on the author's own story. The author writes it, the reader rates their understanding, the author predicts the reader in advance. It cannot express the case where the text's author and the experience's owner are different people. Only the owner of an experience can say whether it was captured.

So we built it. It shipped. Then we ran the chain to the point of filing, and I looked at the five candidate letters it produced and said, roughly: I have zero will to verify that. I don't need a letter.

The premise died before a single letter was filed.

## What actually broke

The tempting read is that the five candidates were weak. That read is available and I cannot fully exclude it: both detection runs drew from corpora that had already been processed the same day by other passes, so a genuinely novel item might have produced pull.

But there is a second argument, and unlike the first one it does not depend on the quality of any particular letter:

> **A letter is an async instrument. It exists because the counterparty is not in the room. An agent is always in the room, so correction is free and immediate. Filing a letter from a present agent to a present human uses an async instrument where there is no asynchrony.**

That is item-independent. No improvement in card quality changes whether the form has a job when the counterparty is present. If I want to know whether the agent understood me, I ask it, right now, in the conversation we are already having. The letter adds ceremony and a delay to a correction that was already free.

Only that part is recorded as a finding. The rest is a maybe.

## The refutation was already in our own log

Here is the part that should bother you if you keep a decision log.

Seven weeks earlier we had frozen exactly this kind of build. The recorded reason was one sentence with two independent legs: an alignment-between-people tool cannot be dogfooded solo **and** the one near-term internal counterparty does not need the async letter, because two people who are both present just talk.

When the new spec overrode that freeze, it quoted the first leg, answered it, and shipped. It manufactured the missing counterparty. It never touched the second leg. And an agent is *more* present than a colleague, so satisfying the first leg made the second one strictly worse.

The failure is not in the search. The log was grepped, the entry was found, the entry was cited. The failure is in the compression between reading and quoting: a paraphrase of a premise is where the inconvenient leg goes missing, and it goes missing silently, because nothing downstream ever re-reads the source. Every reviewer after that point reasons about the paraphrase.

I do not think a mechanical check catches this. Nothing can diff a paraphrase against its source for completeness of reasoning. The only rule that would have worked is: when you override a recorded decision, quote the whole premise, and answer each leg separately or say which one you are not answering and why that is acceptable.

## The prediction that was right for the wrong reason

Nine days before the refutation, we filed an article idea arguing that this exact instrument was exposed. Its reasoning: the protocol bounds on the lower *honest* self-estimate, and an agent has no stake, so its estimate is not honest in the load-bearing sense. It would produce a fluent, plausible "here is how I understand you" that feels verified without being verified.

The outcome it predicted is the outcome we got. The mechanism it named is not the mechanism that did the work.

I am flagging this rather than claiming the prediction, because collecting credit for a right answer reached by a wrong route is how a research programme starts degenerating without noticing. The stake argument may still be true. It was not what killed this.

## The limit of the argument I actually used

When I rejected the letter, my instinct was a second argument: the agent is an instrument, its comprehension only matters through the work it produces, and bad work is visible. So why verify the instrument directly?

That premise has a known counterexample class, and it is one we had already written down. Code fails loudly. A strategy memo, a diagnosis, a summary of your own thinking: these read fine whether or not the writer understood you. So "bad work is visible" holds for verifiable output and fails for plausible-but-unverifiable output.

A paraphrase of my reasoning is precisely the second class.

So that argument does not survive on its own. "I would correct it in the moment" and "bad work is visible" turn out to be the same premise twice, and they fail together on the same class of output. What saves the conclusion is only the async argument, which does not depend on either: even where verification genuinely is needed, you do it synchronously, because the counterparty is right there.

Worth being precise about the scope this leaves. The finding covers a **present, supervised** agent doing analysis with its principal in the room. It says nothing about an agent operating over a long horizon with nobody watching, which is the configuration the alignment community actually cares about, and where absence is structural rather than incidental. If the operative variable really is counterparty absence, that case is untouched by this result. I am stating that as an open direction, not a finding, and I have not checked it against the existing work on monitoring and chain-of-thought oversight.

## What comes next, and why you should doubt it

The successor hypothesis follows directly from the mechanism: if the letter's value is a function of counterparty *absence*, then restore the absence. Two humans in a recorded conversation, each with an agent that reads from its own party's side and files a letter to the *other* party. Present counterparty means no value, which we observed at n=1. Absent counterparty means value, which is untested.

Now the part that makes me uneasy, stated rather than sold past.

I believed, until I checked, that human-to-human letters had already failed once — *18 letters, zero async completions.* That figure was wrong. Queried against production: **28 real external deliveries, 25 opened, 12 completed — 43%**, four of them predating the date the zero was recorded. The number was false the day it was written, and it had been quoted in my own strategy documents for ten weeks.

So the recipient end did not fail. **What fails is a letter nobody had a reason to answer** — which is a fact about motive, not about the form. That leaves today's result standing alone: the *author* end failed, because I had no will to receive a letter from an agent that was already in the room with me. Counterparty-absence explains that, and there is no longer a second failure it has to explain away.

I am keeping this passage rather than deleting it, because the correction is the more useful finding. The uneasy version of this section was written from a number in my own documents, and the number did not survive a query. That is the same failure mode the essay is about, one level up: a claim that reads fine, was never checked, and was load-bearing.

There is also a contamination fork waiting there: a party who edits their agent's draft produces a better letter and a void measurement. That configuration has to pick which of the two it is for, before anyone builds it.

## Falsifiers

Stating these so the claim is not unfalsifiable, and so you can hold me to them.

**For the async claim:** if a letter from a *present* agent turns out to be valuable for some reason other than asynchrony, for instance because the ceremony of rating forces an attention that in-the-moment correction does not, then the form has a job after all and this post is wrong.

**For the successor:** if two humans with agents produce a letter that neither party completes, then counterparty-absence is not the operative variable and the letter form is dead in both configurations.

**Evidence grade, plainly:** n=1, on the only intended user, who is also the author of the thing being rejected. That is strong evidence for "does this produce pull in its intended user," because there is exactly one, and worthless for anything about anybody else. The structural argument carries the general weight. The observation carries only its own.

---

## Notes for the human before this ships

- **[FOUNDER DECISION: title]** Working title is "An Agent Is Never Absent." Alternatives: "The Refutation Was Already In The Log", "We Built A Letter To A Counterparty Who Was Already In The Room", "A Negative Result On Agent Comprehension".
- **[FOUNDER DECISION: venue and CTA]** Written for LessWrong / Alignment Forum, so it carries no CTA and no hidden current toward the practice, deliberately. The Clarity Notes version would want a closing pull. Which ships first?
- Internal links are unresolved. Before publishing, the references to the decision log, P1030, and the article idea need public URLs (the repo is public, so GitHub paths work) or the claims need to stand without them.
- The a61 article idea overlaps and is still `status: idea`. It should probably be updated or merged rather than left to be published separately with a mechanism this post contradicts.
- No em dashes, per the global drafting rule. House style in `content/voice.md` uses them freely, so this reads slightly differently from the other articles.

## Sources

- `docs/decisions.md`, 2026-08-12 [product]: "A letter is an async instrument and an agent is never absent." Commit `78e9587c`.
- `docs/decisions.md`, 2026-08-12 [process]: overriding a recorded decision requires quoting the whole premise.
- `features/done/2026-06-10/p1030_reverse_story_and_align_pipeline.md`: the built instrument, `status: all-done`, completed 2026-08-12.
- `features/archive/2026-08/p1051_align_agent_orchestrator_and_readback.md`: `status: rejected`, gate can no longer open.
- `docs/hypotheses.md`, H-LetterAsProduct: the 2026-06-02 transform, and the 2026-08-14 correction to it — the completions figure was false (28 deliveries / 12 completed, 43%), though the transform itself fired legitimately on the criterion's *zero forwards* leg, which was true that day.
- `content/articles/a61_a-twin-cannot-say-thats-not-what-i-meant.md`: the nine-days-early prediction, committed 2026-08-03.
