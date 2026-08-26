---
name: grill-me
description: Interview the user relentlessly about a plan or design until reaching shared understanding, resolving each branch of the decision tree. Use when user wants to stress-test a plan, get grilled on their design, or mentions "grill me".
when_to_use: When the user has a plan or design they want stress-tested by question, one question at a time, before committing to it. Says "grill me", "interview me", or "poke holes in this". NOT for red-teaming an artifact that already exists (that's /slava:think:adversarial-review). NOT for testing a proposal against first principles (that's /slava:think:falsify).
version: 1.0.0
---

Interview me relentlessly about every aspect of this plan until we reach a shared understanding. Walk down each branch of the design tree, resolving dependencies between decisions one-by-one. For each question, provide your recommended answer.

Ask the questions one at a time.

If a question can be answered by exploring the codebase, explore the codebase instead.
