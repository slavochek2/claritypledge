---
status: week
type: comment
rank: 50
created_date: '2026-08-20'
tags: [previews, og, crawlers, survey]
delivery_stage: create-spec
pipeline_ran: [create-spec]
driver: anomaly
---

# P1128: Which pages actually need a link-preview handler

## Split out of P1108

P1108 (`features/p1108_link_previews_say_true_things.md`) originally carried this as step 5 of
its Solution. The founder's scope decision on 2026-08-20 removed it, for a reason that is itself
the point of this spec: *"classified, with the reason"* is a judgement, and no command decides it.
P1108 is a defect fix whose finish line is an exit code; this is a survey whose deliverable is a
decision. Keeping them together would have put one un-decidable line into an otherwise mechanical
contract.

**Nothing here is a defect.** P1108 fixes text that is false. This spec answers whether text that
is true but unread should be reachable at all.

## Problem

**Situation:** The app has two preview systems. Pages render an in-app SEO component that writes
meta tags into the SPA. Separately, `vercel.json` rewrites a small number of paths to `api/og.ts`
when the request carries a known crawler user-agent, and that handler writes its own tags.

**Complication:** Crawlers do not execute the SPA. So for any page without a rewrite, the in-app
tags are never read by the thing they are written for — a link to that page shared in a chat gets
whatever the crawler infers from an empty document. The tags are honest and invisible.

The two sets are far apart. **Derive both counts at survey time rather than trusting the numbers
here** — a ticked box in P1104 asserted 12 call sites when measurement said 17, and the
re-derivation that caught it had three errors of its own (`docs/decisions.md`, 2026-08-20).
As of 2026-08-20 the commands below returned 28 and 4:

```bash
grep -rl "<SEO" src/app/pages/ | wc -l                    # pages with in-app tags
grep -c 'destination": "/api/og' vercel.json              # paths with a crawler handler
```

**Question:** For each page with in-app tags and no crawler handler — is it a page people actually
share a link to? If yes it needs a handler. If no, the in-app tags are fine as they are and we
should say so, once, rather than re-asking every time someone notices the gap.

## Appetite

**Blast radius: zero while surveying.** The deliverable is a classification. Any handler this
survey recommends becomes its own spec with its own appetite.

**Reversibility: n/a** — nothing is changed.

**Decision density: high, and that is the whole content.** Every page is a founder call about
whether that URL gets shared. Nothing about the code answers it.

## Approach

1. **Enumerate.** Derive the two sets by command (above), not from this file. List every page in
   the difference, with its route.
2. **Classify each** into exactly one of:
   - **SHARED** — people paste this link. Needs a crawler handler. Name what the preview should
     truthfully say, and what column backs it.
   - **NOT SHARED** — reached only by navigating inside the app, or gated behind auth. In-app tags
     stay; no handler. Give the reason.
   - **SHOULD NOT PREVIEW** — sharing it is possible but the preview should stay generic on
     purpose (private, personal, or misleading out of context).
3. **Say what evidence was used** per row. A route being public is not evidence it gets shared —
   analytics, a real shared link, or the founder's judgement are. Where it is judgement, label it.
4. **Emit the follow-on specs**, one per SHARED page or one covering a coherent group. This spec
   does not build handlers.

## Risks / Non-Goals

### Risks

- **The survey silently becomes a build.** The temptation on finding a SHARED page is to add the
  handler while the file is open. **MITIGATE:** every handler is a follow-on spec; this one is
  closed by a table, not by a diff.
- **A frozen count rots.** Any number written here is wrong the moment a page is added.
  **MITIGATE:** the counts above are dated and paired with the command that produced them; the
  survey re-derives rather than reading them.
- **Classification without evidence reads as fact.** "Nobody shares the terms page" is a guess
  wearing a verdict's clothes. **MITIGATE:** the evidence column is mandatory, and `judgement` is
  a permitted value — an unlabelled guess is not.
- **Every new handler is a new surface that must stay true.** P1108 exists because four
  hand-written descriptions had no rule keeping them honest. **MITIGATE:** any SHARED
  recommendation must state that its handler is subject to whatever mechanism P1108 lands, and
  should not be built before P1108 closes.

### Non-Goals

- **Do NOT add crawler routes or handlers in this spec.** Classification only.
- **Do NOT change the in-app SEO component or any page's tags.**
- **Do NOT re-audit the four existing handlers** — that is P1108's job and it is in flight.
- **Do NOT widen the crawler user-agent list.** A separate question, and a separate risk.
- **Do NOT block P1108, P1124, or the first event on this.** It is a survey; nothing waits on it.

### Time Box

One pass. If a page cannot be classified from the route, the code, and the founder's answer in a
single exchange, mark it `UNDECIDED` with the specific question that would settle it and move on.
An unfinished row is a better artifact than a fabricated verdict.

### Deliverable

One table appended to this spec — every page in the difference set, one row each:

| route | page | verdict | evidence | if SHARED: what the preview says, and the column backing it |
|---|---|---|---|---|

Plus a list of follow-on P-numbers filed for the SHARED rows, or an explicit "none" .

## Done-When

- [ ] Both sets derived by the commands above, with output pasted and dated — not read from this file
- [ ] Every page in the difference appears as exactly one row in the deliverable table
- [ ] Every row carries a verdict from the three permitted values, or `UNDECIDED` with its blocking question
- [ ] Every row carries an evidence value; rows resting on founder judgement say `judgement`
- [ ] Every SHARED row names the sentence its preview would assert and the column that backs it
- [ ] Follow-on specs filed for SHARED rows, or "none" recorded with the reason
- [ ] No handler, route, or meta tag was changed by this spec
