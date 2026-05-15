---
status: today
type: comment
rank: 0.027
created_date: '2026-05-07'
tags:
  - marketing
  - outreach
  - brute-force
  - research
delivery_stage: create-spec
pipeline_ran:
  - create-spec
locked_at: '2026-05-11T05:22:49.859Z'
---

# P829: Source 50 founder pairs with public conflict signal

## Problem

**Situation:** ClarityPledge's target persona is co-founder pairs. We have no list of named, reachable pairs to do outreach against. Our acquisition motion is "post on LinkedIn and hope."

**Complication:** The Brute-Force Marketing pattern (use the product on a prospect's behalf, gift them the result, publish if silent) is the strongest fit for our stage and product. It requires a curated input list — pairs with enough public conflict-shaped material that we can produce a meaningful artifact (calibration map, profile, agreement-as-blog-article) without ever talking to them.

**Question:** How do we build a sourced list of ~50 founder pairs where (a) both founders are reachable, (b) there's enough public material about their partnership to produce an artifact, (c) they'd be a credible match for our ICP?

## Appetite

Low blast radius (a list in a private file — touches nothing in production code or product). Fully reversible (delete the file). Low decision density — the filter criteria are mostly mechanical; founder decision needed only on (a) ICP refinement and (b) whether to expand to non-English sources.

## Approach

Manual + agent-assisted research, biased toward depth over breadth (50 well-qualified pairs > 200 noisy ones).

**Sources to canvass:**
1. **Public conflict signals** — LinkedIn posts, Indie Hackers threads, podcast episodes ("How we almost broke up", "The fight that nearly ended our company"), YouTube founder confessions, Twitter/X threads, blog posts.
2. **Curated founder lists** — Lenny's Newsletter podcast guest list, First Round Review founder profiles, Y Combinator alumni directory (where co-founders are named), Indie Hackers interviews, Founders Podcast guests.
3. **Co-founder breakup post-mortems** — public Substack/Medium essays on partnership friction.

**For each pair, capture:**
- Names + company + LinkedIn URLs
- Stage (early/mid/late — exclude post-IPO unless conflict was at early stage)
- Public conflict signal (link + 1-line summary of the moment)
- Reachability score (0-3): how active each founder is on a public channel
- Artifact-readiness score (0-3): how much usable material exists for a calibration map / profile

**Output format:** Single markdown table in `.private/marketing/founder-pairs-source-list.md` (gitignored — pre-publication, contains real names and judgment-call notes).

## Risks / Non-Goals

### Risks
- **Privacy/ethics drift** — using personal conflict stories for marketing is sensitive. Mitigation: only use public material the founders themselves chose to publish; the artifact must flatter, not diagnose; founders must always be able to say "no thanks."
- **ICP drift** — easy to add big names (Brian Chesky/Joe Gebbia) that look impressive but aren't reachable or matched to our actual buyer. Mitigation: enforce reachability score ≥ 2 as filter.
- **Scope creep into outreach** — temptation to start sending before list is complete. Mitigation: explicit non-goal below.

### Non-Goals
- Do NOT send any outreach as part of this task. Sourcing only. Outreach is a separate spec (P-future).
- Do NOT produce artifacts for any sourced pair as part of this task. Artifact production is a separate spec.
- Do NOT scrape via automated tools that violate platform ToS (LinkedIn scrapers, etc.). Manual + standard search only.
- Do NOT include pairs from non-English sources in v1 — language barrier reduces artifact quality. Future expansion possible.
- Do NOT add pairs without a real public conflict signal — "they look successful" is not the criterion.

## Done-When

- [ ] `.private/marketing/founder-pairs-source-list.md` exists with ≥ 50 pairs
- [ ] Each pair has: names, company, stage, conflict-signal link, reachability score, artifact-readiness score
- [ ] Top 10 pairs flagged as "ready for artifact prototyping" (reachability ≥ 2 AND artifact-readiness ≥ 2)
- [ ] Sources canvassed list documented at the top of the file (so future passes know what's been mined)
- [ ] Founder decision recorded: any ICP refinements discovered during sourcing

## Research Questions

1. Which sources yield the highest density of qualified pairs per hour of search?
2. What does "enough public conflict signal" look like in practice — one viral LinkedIn post? A podcast episode? A blog series?
3. Are there obvious adjacent niches (e.g., spouse-cofounders, sibling-cofounders, agency partners) that should be in or out of scope?
4. For the top 10 ready-for-artifact pairs — what *kind* of artifact would land best (calibration map vs. profile vs. agreement-as-blog)?

## Time Box

4 hours of focused research, split across 2 sessions. If 50 qualified pairs not reached, report findings and propose narrowing or expanding criteria — do not push past 4 hours without reassessing.

## Deliverable

`.private/marketing/founder-pairs-source-list.md` — markdown file with the table described in Approach, plus:
- Header: scope, criteria, date
- Sources canvassed (so future passes don't re-mine the same ground)
- Top-10 priority list at the bottom
- Open questions / ICP refinements section
