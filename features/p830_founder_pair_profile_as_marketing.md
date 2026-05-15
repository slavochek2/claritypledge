---
status: backlog
type: story
rank: 1000763.0
created_date: '2026-05-07'
tags: [marketing, outreach, brute-force, content, blog]
delivery_stage: create-spec
pipeline_ran: [create-spec]
---

# P830: Founder-pair profile as marketing artifact

## Problem

**Situation:** ClarityPledge needs a credible, replicable outreach pattern for reaching named founder pairs (the ICP). Generic cold outreach gets ignored; product pitches feel like pitches; "we analyzed your conflict" feels intrusive.

**Complication:** The strongest reframe surfaced in conversation is journalism-style: ClarityPledge *profiles* the pair as exemplars of intellectual integrity / productive disagreement / team stability. The badge + Clarity Partner Agreement become evidence embedded in a blog article. The pair shares the article because it's useful for fundraising and for trust-sensitive customers (security, healthcare, legal — anywhere internal cohesion is buyer-relevant).

**Question:** What is the repeatable production pipeline — from sourced pair → published Ghost article that the pair will share?

## Appetite

Medium blast radius (every published profile becomes a public ClarityPledge artifact carrying brand weight). Moderate reversibility (an unflattering or off-brand profile can be unpublished, but if shared it lives on screenshots). Medium-to-high decision density — tone, what counts as a "stable founder pair," and editorial standards are all founder-judgment territory.

## Solution

**End-to-end pipeline (manual v1, automation considered later):**

1. **Pair selection** — pull from P829 source list. Filter: top 10 priority pairs (reachability + artifact-readiness scores).
2. **Outreach to participate** — invite them to a short interview ("we're profiling founder pairs known for partnership stability — would you be open to a 30-min conversation?"). Frame: journalism, not sales.
3. **Interview + /live session** — 30-min recorded conversation. Run their genuine disagreement through /live during the session, capturing the real artifact (badge + Clarity Partner Agreement). Ask product-positioning questions naturally as part of the interview.
4. **Article production** — draft profile in Slava's voice using the existing blog pipeline (`/prepare-blog` → `/draft-blog` → `/ship-blog`). Embed the badge + agreement as visual evidence.
5. **Pair approval gate** — show draft to the pair before publishing. Their explicit "yes" required.
6. **Publish + amplify** — ship via Ghost. Ask the pair to share. Slava cross-posts on LinkedIn.

**Artifact format (what makes the article share-worthy for them):**
- Title positions them as exemplars: "How [Pair] disagrees productively"
- Concrete moment from their public history (the conflict signal that put them on our list)
- Embedded calibration evidence: badge + agreement, beautifully rendered
- 1 paragraph on the pattern observed; 1 paragraph on what the agreement addresses
- Short interview pull-quotes
- ~800-1200 words, designed to be skimmed in 90 seconds

## Risks / Non-Goals

### Risks
- **Inauthenticity risk** — if the profile reads as marketing-disguised-as-journalism, both pair and audience reject it. Mitigation: real interviews, real artifacts, factual claims only, pair approval gate.
- **Dependency on validation** — if the underlying /live + agreement output isn't actually wow-worthy yet, this entire pattern fails. Mitigation: gated on first 5 paid /live sessions confirming artifact quality (see Done-When). Do NOT start production before that gate.
- **Scaling cost** — every profile is hours of manual work. Mitigation: P-future spec for automation (P831) — only build automation after 3-5 manual profiles validate the pattern.
- **Brand drift** — too many profiles dilute the signal that ClarityPledge stands for substantive practice, not "founder content." Mitigation: cap at 1 published profile per 4 weeks in v1.

### Non-Goals
- Do NOT start production before P829 sourcing and the validation gate (5 paid /live sessions) are both complete.
- Do NOT publish without explicit pair approval. Drafts must be sent to the pair, not surprises.
- Do NOT diagnose problems or critique the pair. Tone is profile/celebration, not analysis.
- Do NOT use private conversation material in the article — only the public conflict signal + interview-on-record + the artifact they generated themselves.
- Do NOT confuse this with `/draft-blog` content workflow — this is a *new* outreach pipeline that *uses* the existing blog tooling at the production step.

### Alternatives Considered
- **Cold artifact-as-gift** (original Brute-Force Marketing pattern: produce artifact privately, gift it, publish if silent). Rejected for v1 because it's lower-trust and the unilateral analysis without consent feels off-brand for ClarityPledge. The interview-first version is slower but matches the brand of "we practice clarity *with* people, not *on* them."
- **Podcast format instead of written profile.** Higher production cost, harder to embed badge/agreement evidence visually. Possible v2.

## Done-When

This spec is "ready to start" when:
- [ ] P829 sourcing complete (founder-pairs-source-list with top-10 priority)
- [ ] Validation gate passed: 5 paid /live sessions confirm badge + agreement is artifact-worthy
- [ ] 1 prototype profile produced for a famous public pair (e.g. Chesky/Gebbia from public material) to verify the format works before reaching out to real targets

This spec is "shipped" when:
- [ ] 3 published profiles live on blog.claritypledge.com
- [ ] At least 1 of the profiled pairs publicly shares the article
- [ ] Pipeline is documented (interview script, article template, approval flow) such that a non-Slava team member could run it
- [ ] Decision recorded on whether to continue, scale via P831 automation, or sunset

## Acceptance Criteria

- [ ] All published profiles have explicit pair approval before publication
- [ ] All published profiles embed the actual /live-generated badge and Clarity Partner Agreement
- [ ] Each profile has a measurable distribution outcome (shared by pair / mentioned in their fundraising / linked from their site / engagement metrics)

## Predecessor

- **P829** — sourcing list (must complete first)
- **Validation gate** — first 5 paid /live sessions (separate, not yet specced)

## Successor

- **P831** (this spec, filed alongside) — auto-diagnose conflict patterns from public material → enables artifact production at scale
