---
status: idea
title: "Why Joint Comprehension Is Bounded by the Minimum, Not the Average"
rank: 1
tags:
  - min-principle
  - comprehension
  - demarcation
  - critical-rationalism
  - verification
created_at: 2026-06-20T00:00:00.000Z
---

# Why Joint Comprehension Is Bounded by the Minimum, Not the Average

> Working title — not final. `[FOUNDER DECISION: title]`.

## The idea

Most informal talk about "we understand each other" quietly assumes comprehension is **additive or averaged** — if I get 8/10 and you get 6/10, we're "around 7" and good to go. The Min Principle rests on a different, usually-unstated premise: joint comprehension is **conjunctive** — it is bounded by the *minimum* of the two sides, not their average. A shared understanding is only as verified as its weakest link, because the unshared remainder is exactly the part that surfaces later as a "real disagreement" that was actually a misunderstanding all along.

This article makes that hidden premise explicit and defends it: why ≤min (not =average, not =max) is the right bound for *coordination*-grade understanding, and what follows once you accept it (the lowest honest self-rating sets the floor; raising the floor requires work on the specific weak link, not more agreement). It also marks the precise boundary the Min rests on — and where it strains (a group of N collapses to the lowest self-reporter; see the heckler's-veto problem, treated as a tension to name, not hide).

## Why this is distinct from a29

a29 (the Min Principle formal foundation, now folded into a9) gives the *two-origins* derivation (min ← recursion's weakest link; authority ← referent-absence) and the decision rule. a39 isolates the **conjunctive-vs-additive premise** itself — the ≤min vs =min vs =average precision — which a29/a9 use but never argue for standalone. This is the assumption underneath the foundation. Cross-link; do not duplicate the formal derivation.

## Arc

ARC-4 (The Assumption Nobody Questioned) — the assumption that two people's understanding "averages out."

## Extension worth carrying: the Min as a decay function along a chain (2026-07-28)

The conjunctive premise has a consequence the original framing never drew out. If joint comprehension is bounded by the minimum of two parties, then comprehension propagated along a **chain** — A verifies B, B verifies C — is bounded by the minimum across *every link*.

Why that matters: delegable verification is a known failure pattern. Apprenticeship, teaching lineage, PGP's web of trust — all of them break on the same finding, that **trust is not transitive**. A verifies B, B verifies C, and A has no grounds to accept C. Content drifts at each hop, and the drift is invisible from the origin.

The Min Principle supplies something those systems lacked: a **principled decay function**. Chain confidence = the minimum over all links. Monotonically non-increasing, computable, and — the important property — it makes degradation *visible* rather than hidden. A binary trust flag has nothing to decay; a bounded quantity does. That's a concrete reason a verification chain built on the Min might survive where web-of-trust didn't, and it belongs in this article because it follows directly from ≤min rather than from anything else in the framework.

The cheaper unlock hiding underneath, worth naming as the honest alternative: a story carries **two payloads** — the *experiential* content (what happened, how it felt) and the *structural* insight that moves positions. Only the first is genuinely owner-privileged; nobody but the author can say whether someone got their experience right. The second may not be owner-bound at all. If it's the structural payload doing the position-moving work, no chain is needed — you separate the layers and let the transferable one travel freely. **Test that before building infrastructure for the harder version.**

Keep the tension visible alongside the existing heckler's-veto note: a chain minimum is *conservative to the point of uselessness* at length — enough hops and every chain reports near-zero. Whether that's a bug or the correct answer is the open question.

## Enrichment (2026-07-28)
Source: "Building trust to reduce hiring costs through clarity" (2026-07-28)
Applied to: a-spec body

## Source

Conversation: "Conjunctive vs. additive comprehension and the demarcation criterion" (2026-06-20). Founder marker: `[/cp articlr worthy]`. Surfaced via `/claude-conversations-to-cp`.
