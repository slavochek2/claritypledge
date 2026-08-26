---
name: unbundle
description: >
  Split a bundled, multi-topic message into a numbered list of discrete items,
  each tagged do-now / needs-spec / question, and show it BEFORE touching code —
  so nothing in the middle or tail of a rambling message gets silently dropped.
when_to_use: >
  Auto-run silently when ONE incoming message bundles 2+ distinct asks pointing at
  different subjects (a UI tweak + a copy change + a new feature idea + a question),
  especially when chained with semicolons, "also"/"laso", "btw", "and also", or
  screenshot references mixed with unrelated requests. Also triggered by "/unbundle".
  Skip for single-topic messages (even long multi-step ones), for messages where the
  user already numbered their asks, and for one-liners.
version: 1.0.0
---

# /unbundle

The founder often sends several unrelated asks in one breath. Middle and tail items
get dropped. This skill makes the split visible before any work starts. No preamble.

## When it fires (and when it must not)

**Fire** when a single message contains 2+ asks that point at *different subjects*.
Signals (need at least one strong OR two weak):

- **Strong:** semicolon-chained fragments each naming a different thing; an explicit
  topic switch marker ("also", "laso", "btw", "and also", "one more", "separately")
  followed by a new subject; a screenshot/UI reference sitting next to an unrelated
  copy change or feature idea.
- **Weak:** 3+ sentences each with a different verb-object; a question mixed in with
  imperative asks; a new proper noun (page, component, route) per clause.

**Do NOT fire** — these are the annoyance guardrails, honor them:

1. **Single-topic, multi-step.** "Add the field, wire the mutation, add a test" is ONE
   ask decomposed into steps — not a bundle. One subject = don't split.
2. **User already numbered/bulleted** their own asks — they've done the split; just act.
3. **One-liner** or a single imperative, however terse.
4. **A back-and-forth answer** to a question you just asked — that's a reply, not a bundle.
5. **Tightly causal chain.** "X is broken because Y, so change Z" is one thread.

Rule of thumb: could these items ship in separate commits with unrelated messages?
If yes → bundle. If they'd all land in one coherent commit → not a bundle, don't fire.

## What it does

1. **Parse** the message into discrete asks. Split on topic, not punctuation — a
   semicolon inside one thought is not a boundary; a topic switch without punctuation is.
2. **Restate each item in one line**, in the user's own framing (don't editorialize or
   expand scope — echo, don't reinterpret).
3. **Tag each item:**
   - `do-now` — mechanical, unambiguous, no design decision (copy swap, move a button,
     rename). Safe to just do.
   - `needs-spec` — real feature work / design decision / multi-file blast radius.
     Route to `/create-spec` or `/pick-flow`, don't freehand it.
   - `question` — needs an answer from the founder before anything can be done.
     Includes anything with a `[FOUNDER DECISION]` (CTA text, pricing, naming, tone).
4. **Show the list and stop.** Do not start coding until the founder confirms or
   reorders. Questions block their own item only, not the whole list.

## Output shape

```
Heard N items:
1. [do-now]     Move the secondary CTA below the fold on the pricing page.
2. [needs-spec] "Let's collaborate" block → new slide in /presi2.
3. [question]   "live t..." — didn't fully parse. What's the ask here?
4. [do-now]     Copy: change hero subhead to "…".

Starting the do-now items (1, 4). Item 2 wants a spec — /create-spec? Item 3 I need you to clarify.
```

Keep it ≤ one line per item. If an item is genuinely ambiguous (truncated, "live t..."),
tag it `question` and say what you couldn't parse — never silently guess and drop it.

## Boundaries with adjacent skills

- **`/pick-flow`** classifies ONE task into a flow. `/unbundle` runs *before* it, when
  there are several tasks tangled in one message. Unbundle first, then pick-flow each
  `needs-spec` item.
- **`/simplify`** compresses a long *discussion* into situation/options/recommendation.
  `/unbundle` splits a single *message* into discrete asks. Different inputs, different jobs.
- **`/status`** summarizes the session. `/unbundle` summarizes one message.

## Anti-noise discipline

This skill earns its keep by staying quiet on normal requests. If you fire it on a
single-topic message, you've made the founder read a list they didn't need — that's the
failure mode, worse than missing one borderline bundle. When unsure, prefer NOT firing;
but if you proceed on a genuine bundle without listing, and later drop a tail item, that's
the exact failure this exists to prevent. Bias: fire on clear bundles, stay silent on
everything else, don't agonize over the middle.
