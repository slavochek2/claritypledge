# The Problem Board — end-to-end process

> **Charter:** this file is the single home for the problem board's **user journey and build order** —
> what a member does, which specs build it, what blocks what, and what the first event measures. It names
> specs and points at them; it never restates their scope. Spec content lives in the specs, decisions live in
> [decisions.md](decisions.md), and the construct itself (one story plus three contestable claims) lives in
> P1180 until the `story-point-model.md` migration lands.
>
> Sibling process docs: [software-delivery-process.md](software-delivery-process.md) ·
> [content-process.md](content-process.md) · [points-process.md](points-process.md).

**Workstream:** `problem-board`. The two security specs it depends on for the agent upgrade (P1321, P1215)
live in `infrastructure` because other surfaces depend on them too.

**Rewritten 2026-09-15.** The previous version planned a two-person round from a hand-carried file of many
problems. It is replaced because the unit was wrong — see *What changed* below.

---

## What this is for

A practitioner with ten trusted people can get their thinking broken on demand. That does not transfer: it
runs on a favour, on trust nobody can inspect, and on hand routing. The problem board tests whether a
**written** problem can establish enough understanding in a stranger, fast and without a conversation, that
their disagreement is worth having.

**Comprehension alone is a failure.** A reader who understands perfectly and disagrees with nothing has
produced a mirror, and a mirror is what this replaces. The target is understanding **and** friction.

The hypothesis is registered as `H-AbsentCounterparty` in [hypotheses.md](hypotheses.md) —
**UNTESTED, zero rounds run.**

---

## The user journey

> Each member has a short **"what I'm working on" profile**, and posts **one problem they are still working
> on** — from this week or from any time back. Everyone's agent reads all the posted problems and tells them
> **which one to look into**. **Answering it is the match.** At the event, the person whose problem got
> answered leads a round with whoever is interested, and the others pair up and talk.

Step by step:

1. **Profile, once.** One or more projects, a line each. Updated when it changes.
2. **Weekly problem.** The member's agent reads their own history for a window they choose, proposes the
   **top 3** current problems, and the member marks each *submit this week · maybe later · reject*. Unpicked
   problems stay on a private list on the member's machine and can come back later. **At most one is drafted
   per run by default.** — P1319
3. **Review and send.** The member reads the drafted problem exactly as a reader will, rates the story (8 of
   10 or higher to send), picks point or anti-point for each claim, fixes wording, and presses send —
   visible to their community only. — P1320, P1181
4. **Find the one to look into.** Each member's agent reads this week's problems with its member's context
   and names the claim they can challenge, the position and the basis — preferring problems with the fewest
   readers so far. — P1182
5. **Answer.** The member answers that letter in the product. That is the match.
6. **At the event.** The author whose problem was answered leads a round with whoever is interested; everyone
   else pairs up and talks.

Founder framing of the unit, verbatim (2026-09-15): *"I can read maybe five and review only three … maybe one
per week per person, then everything gets easier."*

---

## What changed on 2026-09-15, and why

The previous design allowed unlimited submissions on the premise that *an agent does the reading, so there
is no attention to ration*. That counted the reader's attention and forgot the author's. A mining run gave the
founder 209 problems to choose from; after 15 days **none had been ticked**. That result is uninterpretable as
*unwillingness to share* — no one reads 209 — and fully explained by list size.

Moving to one current problem a week resolves three problems at once:

- **Review** — one problem is minutes, not hours.
- **Privacy** — the author chooses the single problem they are comfortable sharing; nothing is sent in bulk.
- **Quality** — a reader only sees text its author actually read.

---

## Build order

Two tracks. **Track A is the problem board. Track B is an upgrade that removes two manual steps; it never
blocks Track A.**

### Track A — the problem board

| Spec | What it delivers | Blocked by |
|---|---|---|
| **P1319** | Weekly problem: window, top 3, candidate list, profile, provider disclosure (change request on P1180) | nothing |
| **P1181** | Community-only visibility for problem letters, scoped to one organisation container | nothing |
| **P1320** | Review page: read as the reader will, rate, choose per claim, send | P1319 (the block it reads); its community send option needs P1181 |
| **P1182** | Reader: which of this week's problems to look into, with coverage | P1319 (the format it reads); community-private problems need P1181 |
| **First event** | The first real round | P1319, P1181, P1320, P1182 |

**P1181 is now before the event, not after the matcher.** Most members will not post a current problem
publicly, and a shared-by-link letter today requires a public story.

### Track B — agent access (upgrade path)

| Spec | What it delivers | Blocked by |
|---|---|---|
| **P1321** | Security gate answered with evidence; phase-1 agent-access design, independently reviewed | nothing |
| **P1215** | A member's agent acts as them: phase 1 reads, phase 2 creates drafts. Agents never send | P1321 |

When P1215 phase 2 exists, P1320's paste step disappears (the agent creates the draft). When phase 1 exists,
P1182's download step disappears (the agent reads directly). **Until then both run with one human step each.**

### Dropped

- **The multi-problem inventory file** (a spec that was never written) — superseded by P1319.
- **Replacing the existing story-creation page** (the old phase 3) — no longer on this track.
- **The two-person hand-carried round** (the old phase 1) — superseded by the first event.

---

## The Claude Code Build Day

A community build day where the founder and a collaborator build the **v1 of the reader (P1182)** in about
four hours and demo it in two minutes.

**Disclosure is the reputation rule.** The demo opens by saying what already existed — Clarity Pledge, the
problem-submit skill, letters — and what was built that day. Trying the reader on each other at the end is
testing what was built, not a result. Nothing on the day counts toward `H-AbsentCounterparty`.

---

## What the first event measures

Recorded before it runs:

- problems posted · problems with **zero readers** · problems answered
- per answer: did the author judge the disagreement **worth having**, and **which claim** did it land on
- **does the member post again the following week**

**A nod is a failure, not a pass.**

> **Confound gate — decided before the event, never in the moment.**
> A high comprehension score from a reader who already knows the project is equally consistent with
> *the problem statement worked* and *they already had the context*. **Where the reader already knows the
> project, the score is recorded as uninterpretable — never as a pass.** Verbatim requirement from
> [hypotheses.md](hypotheses.md) `H-AbsentCounterparty`; restated here because this is the document an
> executor follows.

> **What the event measures, and what it does not.** Readers choose among the week's problems, so the event
> tests self-selection **among problems**. Attendees are still **invited** to the event, so it does not fully
> test self-selection **into reading at all**. A positive result is recorded with that scope attached.

**Coverage is part of the design, not a fix afterwards.** An author left unread stops posting, and fewer posts
leave less to match on. Founder framing: *"you can be of service to them."* Host-assigned readers and agent
feedback to unpicked authors are parked until the event shows they are needed.

---

## Standing constraints

- **Agents never send.** A person presses send, on every path, including after P1215.
- **No programmatic filing until P1215 phase 2 exists.** Holding production credentials is not the same as
  holding the member's own session; the seal step compares the sender against `auth.uid()`, and a superuser
  path silently no-ops that check (P1180 §Implementation notes).
- **The drafting model reads the history through its provider,** and members are told so before anything is
  read (P1319).
- **The candidate list never leaves the member's machine.**

---

## What this process does NOT cover

- **The construct** — one story plus three contestable claims, each anti-point a complete rival position.
  Lives in P1180 §Stage 3 until it migrates to [story-point-model.md](story-point-model.md) through
  `/slava:maintain:docs-strategy-update`.
- **The filter** — which problems qualify at all: [arbiter-failure-model.md](arbiter-failure-model.md),
  private-corpus column.
- **The security track's internals** — P1321 and P1215 own them; they touch this process only as Track B.
- **Event logistics** — dates, venue, invitations.

## Related

- [hypotheses.md](hypotheses.md) `H-AbsentCounterparty` — the bet and its falsifier
- [arbiter-failure-model.md](arbiter-failure-model.md) — which problems qualify
- [decisions.md](decisions.md) 2026-09-15 — the weekly unit and this rewrite · 2026-09-14 — the previous build
  order it replaces · 2026-08-31 [product] *"The reader test run on all five candidates"* — the settled
  shape. Cite by date-and-heading anchor, never by line: the log is newest-first.
