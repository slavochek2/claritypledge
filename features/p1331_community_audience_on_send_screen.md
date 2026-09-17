---
status: week
type: story
rank: 106
workstream: problem-board
created_date: '2026-09-17'
tags: [letters, visibility, community, send]
disclosure: public
delivery_stage: create-spec
pipeline_ran: [create-spec]
drafted_by: opus
exec_model: opus
exec_effort: high
driver: heuristic
blocked_by: []
related: [p1181, p1320, p1182]
---

# P1331: Community as a third audience on the letter send screen

## Problem

**Situation:** P1181 landed the whole backend for community-scoped letters. A one-to-many letter can
carry an organisation address and is then readable only by that organisation's **current** members —
refused to anonymous callers on every read path, refused to non-members, and taken away from someone
who leaves, resolved fresh at every read.

**Complication:** nothing in the product sets it. Verified 2026-09-17: the column name appears **zero
times** across `src/app/`, and the send screen offers exactly two audiences — one named person
(search box: `Name or email address`) or a public link
(`src/app/components/letters/letter-receiver-modal.tsx`, mode selector at `:321`–`:337`). So the
founder can file a community letter for himself with his own login, and **no other member can file
one at all**. Filing on their behalf with admin credentials is ruled out by the problem board's own
standing constraint: the seal step compares the sender against `auth.uid()`, and a superuser path
silently no-ops that check.

**Question:** what does a member see, and choose, when they want their community to read this?

> Founder framing, verbatim (2026-09-17):
> *"I think we have the search field. So when people type the letter, they can type in the email
> field who it's for. And there we can also say they can type and select the community. They can
> type maybe the name of community and then selecting community, like they would select a person."*

> And on why this is filed rather than built now:
> *"Right now, I don't expect actually people to manually go and use the interface to file community
> letters. And until they do, maybe we don't need that. We just need to file that as a spec and keep
> it."*

## Appetite

**Blast radius: medium** — one screen and the draft-creation path. The backend it drives is already
shipped, gated on every read path and covered by 16 integration assertions, so this spec adds a
control surface rather than a trust boundary. **Reversibility: high for the screen** (the choice can
be removed), **low for what it produces** — a letter's audience is immutable after sealing, so a
wrong default writes rows that cannot be reclassified. **Decision density: two**, both founder calls,
both below.

## Solution

Add a **third audience** to the existing send screen, chosen with the gesture members already know:
type a name, pick the match.

**Selecting a community is not adding a recipient.** It switches what kind of letter this is. A
community letter has no named recipients by design — its readers are whoever is a member when they
open it — and `seal_and_send_letter` already refuses named recipients on such a letter. So the
picker sets the letter's audience on the draft; the existing seal path does the rest, unchanged.

`[FOUNDER DECISION: what the third option is called where a member sees it.` The standing warning
from P1181's Open Question 2 is that an option which renders identically to "private" is worse than
no option, because people calibrate what they reveal from what they see. The name must make the
audience legible without implying one-to-one privacy.`]`

`[FOUNDER DECISION: is community the default audience once it exists, and for which letters?` P1320
carries the same decision for the review page; the two must agree.`]`

## Invariants

Earned constraints. Later specs may add; removing an entry needs explicit founder approval.

- **A community letter takes no named recipients.** Selecting a community must not create a delivery
  row at send time. Deliveries are minted when a member opens the letter.
- **The audience is resolved at read time, never frozen at send.** A member who joins next week can
  read a letter sent today; a member who leaves loses it immediately, including through a link or
  token they already hold. Do **not** implement this as a fan-out of private letters to the current
  member list — that was the imprecise "shared" model cut on 2026-03-24.
- **Self-enrolled reader deliveries must never be emailed.** A delivery minted when a member opens a
  letter carries an address; emailing it would send unsolicited invitations to every reader
  (`docs/decisions.md` 2026-06-04, P884, which names this class explicitly for P778 deliveries).
- **The sealed-bid guarantee is load-bearing** (`docs/decisions.md` 2026-08-13 [product], founder
  ruling): a reader who sees the sender's prediction before rating is anchored, so the rating stops
  being an independent measurement. This spec must not widen that surface.
- **Dialog behaviour is settled** (`docs/decisions.md` 2026-06-28 [technical]): keep Radix `modal`
  at its default and keep `onInteractOutside` prevented, so a backdrop click never discards a
  half-typed recipient.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| A wrong default writes community letters nobody intended, unfixable per row | MITIGATE | The default is a founder decision recorded here before any row is written; audience is immutable after seal |
| The new option renders indistinguishably from "private" and people misjudge their audience | MITIGATE | Naming is a founder decision; the send screen must state who can read it, in words, before sending |
| A member belongs to two organisations and picks the wrong one | MITIGATE | Show the organisation name on the confirmation, not only in the picker |
| Members can read the sender's predictions before rating on a community letter, as on a public one | DEFER | Pre-existing on every one-to-many letter and not introduced here; the 2026-08-13 ruling calls it a defect for public letters. Needs its own spec — see Open Questions |
| A member with no organisation sees an option that cannot be used | ACCEPT | Hide it when the member belongs to none; no empty state needed |

**Non-Goals**

- Do **NOT** add community visibility to stories or points. The audience lives on the letter. P1181's
  Open Question 1 measured the alternative: `private` is referenced 47 times across `src/app/`, and
  widening its meaning would reclassify content written under a different promise.
- Do **NOT** build the review page — P1320 owns it, and should reuse whatever this spec builds.
- Do **NOT** implement agent filing. A person presses send on every path.
- Do **NOT** change sealed-bid behaviour here, in either direction.

## Acceptance Criteria

- [ ] A member composing a letter can choose their community as the audience, by typing its name and
      selecting it in the existing picker
- [ ] The screen states, in words, who will be able to read the letter before it is sent
- [ ] Sending to a community produces a letter with no named recipients, and no invitation email is
      sent to anyone
- [ ] Another member of that community can open and read it; a member of a different community
      cannot; a signed-out visitor with the link cannot
- [ ] A member who leaves the community can no longer open a letter they previously read
- [ ] A member who belongs to no community is not offered the option
- [ ] The two founder decisions above are recorded in this spec before implementation begins

## Open Questions

1. **Do community letters inherit the sealed-bid defect?** The reading path returns the sender's
   predictions to a member before they rate, exactly as it does for a public link letter. The
   2026-08-13 founder ruling classifies that as a defect rather than a nicety, on the grounds that
   an anchored rating is not a measurement. It is **pre-existing and out of scope here**, but a
   community letter is where calibration data for the first event would come from, so it is worth
   deciding before that event rather than after. Not assessed.
2. **Does the picker search organisations the member belongs to, or all public ones?** Only
   memberships can produce a sendable letter, so the narrower list is probably right — unconfirmed.

## Related

- **P1181** — the backend this opens the door to: the audience column, the read-time predicate, every
  gated read path, and the member-only export. Shipped and tested; dormant until this lands.
- **P1320** — the review page carries the same send step for the weekly problem flow, and its spec
  already lists community as the audience the first event needs. It should reuse this, not
  reimplement it.
- **P1182** — the reader; its member-only mode consumes what community letters produce.
- `docs/problem-board-process.md` — the end-to-end journey and build order.
