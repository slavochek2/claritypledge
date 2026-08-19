---
status: week
type: task
rank: 40
created_date: '2026-08-19'
tags: [previews, og, truthfulness, crawlers]
delivery_stage: create-spec
pipeline_ran: [create-spec]
driver: anomaly
---

# P1108: Link previews must say true things, and keep saying them

## Problem

**Situation:** Two independent preview systems exist. Thirty page files set their own meta tags in the app. Four page types — events, stories, points, profiles — have a **second**, separately hand-written preview built by `api/og.ts`. `vercel.json:117-135` routes only those four paths to it, and only for a fixed crawler user-agent list (Facebook, Twitter, Telegram, WhatsApp, LinkedIn, Slack, Discord). Everything else falls through to the SPA, whose meta tags no crawler executes.

**Complication:** The in-app tags are therefore decorative for sharing on all thirty pages, and the four crawler handlers are the only preview anyone actually sees — each with its description written by hand and no rule about whether it is true. `api/og.ts:117-137` builds, for **any** profile slug:

> `{name} signed the Clarity Pledge — a public commitment to clear communication.`

It never checks whether they signed. It does not select `has_pledged`, so it cannot. **Every non-pledger's shared profile link asserts they took the oath.** This is invisible when opening the link yourself, because a browser never takes the crawler path — which is why it has survived.

Found while scoping `features/p1104_agents_must_be_visually_distinguishable.md`, which needs the same surface to stop attributing a machine's reading to a person. That spec does not fix this; it is not agent-specific and predates agents entirely.

**Question:** What makes preview text true today across the four live handlers, and true by default for the next page type someone adds?

## Appetite

**Medium blast radius, entirely outward-facing.** Nothing in the app changes; what changes is what strangers see in a chat thread. **Reversible** — the handlers are pure functions of a database row.

**Decision density: low.** One founder decision on scope (below); the rest follows from what the data supports.

## Solution

Direction only; `/architect` owns the design.

1. **Audit the four live handlers** for claims not supported by the row they fetch. The profile one is known. The others emit `by {authorName}`, `Shared by {creatorName}` and event copy — each needs the same question asked.
2. **A claim must be backed by a fetched column.** The profile bug exists because the description asserts something the query never retrieved. Any preview sentence stating a fact about a person or object must read that fact, or not state it.
3. **A default that fails safe.** When a column is missing, absent, or false, the preview degrades to a description that asserts nothing about the subject rather than to a flattering constant.
4. **Something that keeps it true for page five.** Today a new page type gets a hand-written description with no check. Whatever form this takes — a shared builder, a test, a checklist in the crawler file — the goal is that the next person adding a handler cannot repeat the profile mistake silently.
5. **Decide the fate of the twenty-six orphan pages** whose in-app meta tags no crawler reads. Either they are reachable and need handlers, or they are not shared and the tags are honest-but-unread. Say which, per page type, rather than leaving it ambiguous.

**Scope — `[FOUNDER DECISION]`.** Fix the four live handlers only, or also resolve the twenty-six orphans? Recommending the four first: they are the ones producing false text today, and the orphan question is a survey, not a defect.

## Risks / Non-Goals

### Risks

- **A preview bug cannot be seen by looking.** Opening the link in a browser shows the real page; only a crawler user-agent gets the false text. **MITIGATE:** verification is `curl` with a crawler user-agent against a live URL, with the output pasted — never "I opened it and it looked fine."
- **Fixing the text without fixing the fetch reproduces the bug one column over.** The profile handler cannot check the pledge because it does not select it. **MITIGATE:** for each claim, confirm the column is in the `select` list before trusting the condition that reads it.
- **A guard nobody has watched fail is not a guard.** Per `.claude/rules/epistemic.md` gate 7, whatever mechanism is added in step 4 must be seen to fail on a deliberately false preview before it is trusted. **MITIGATE:** paste the failing output.
- **Changed preview text does not propagate.** Facebook, LinkedIn and Slack cache previews; a fixed description may keep showing the old one for existing links. **ACCEPT and state it** — this bounds what "fixed" means for links already in the wild.

### Non-Goals

- **Do NOT add the agent marker here.** That is P1104. This spec makes preview text true about people; P1104 decides what an agent's preview says.
- **Do NOT redesign preview images, banners, or card layout.** Text truthfulness only.
- **Do NOT touch the in-app meta tags** except to answer question 5 about which pages need a handler.
- **Do NOT add new crawler routes** without deciding they are needed — each is a new surface to keep true.
- **Do NOT let this block P1104 or the first event.** They are independent; this one is not reachable at an event.

### Alternatives Considered

- **Fix the profile string only.** One line, and it leaves three unaudited handlers plus no rule for the next one. Rejected: the pattern is the defect, not the sentence.
- **Delete the crawler path and rely on in-app tags.** Crawlers do not execute the SPA, so previews would degrade to nothing for all four types. Rejected on outcome.
- **Server-render every page.** Solves it permanently and is a different product. Out of appetite.

### Rollback Strategy

Each handler is a pure function of a fetched row; reverting one is restoring its previous string. No data, no schema, no migration.

## Done-When

- [ ] Each of the four live handlers is listed with every factual claim its description makes, and the column backing that claim — or the claim removed
- [ ] `curl` with a crawler user-agent against a **non-pledger** profile returns a description that does not say they signed the pledge — output pasted
- [ ] `curl` with a crawler user-agent against a pledger profile still says so — output pasted, so the fix is not "delete the sentence"
- [ ] The mechanism from step 4 has been watched to fail on a deliberately false preview, with a non-zero exit or a visibly failing check — output pasted
- [ ] The twenty-six page types with in-app tags and no crawler handler are each classified as needing one or not, with the reason
- [ ] Founder decision on scope answered and recorded here
