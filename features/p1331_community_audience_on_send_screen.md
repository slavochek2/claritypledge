---
status: backlog
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
blocked_by: [p1181]
related: [p1320, p1182]
---

# P1331: Community as a third audience on the letter send screen

> **Deferred to backlog 2026-09-21 (founder).** Part of the problem-board chain whose premise failed at P1319 ([decisions.md](../docs/decisions.md) 2026-09-17 [product]). Kept, not rejected; revive with P1181 if a pilot organization wants to write letters inside the org.

## Problem

**Situation:** P1181 has **built** the whole backend for community-scoped letters, on
`feature/p1181-community-scoped-letters` — **not yet merged to main** (`main` contains none of its
commits and no P1181 migration; main's copy of that spec still reads `status: backlog`). Its two
migrations are applied to the **test** database only. A one-to-many letter can
carry an organisation address and is then readable only by that organisation's **current** members —
refused to anonymous callers on every read path, refused to non-members, and taken away from someone
who leaves, resolved fresh at every read.

**Complication:** nothing in the product sets it. Verified 2026-09-17: **no letters code reads or
writes the audience column** — zero hits across `src/app/data/letters-service.ts` and
`src/app/components/letters/`. (The bare column name does appear 31 times elsewhere in `src/app/`,
in events and organisations code, where it means something else — do not grep the bare token and
conclude it is wired up.) The send screen offers exactly two audiences — one named person
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

**Blast radius: medium** — one screen, the draft-creation path, and a new write path for the audience
(below). The backend it drives is gated on every read path and covered by 16 integration tests
against the test database — **run by hand on the branch, never in CI**: no workflow runs that suite
(CI runs typecheck, lint and unit tests only), so nothing re-checks those gates automatically. This
spec adds a control surface rather than a trust boundary — **but that backend is not on main or prod
yet**, so this cannot ship before P1181 does. **Reversibility:
high for the screen** (the choice can be removed), **low for what it produces** — a letter's audience
is immutable after sealing, so a wrong default writes rows that cannot be reclassified.
**Decision density: two**, both founder calls, both below.

## Solution

Add a **third audience** to the send screen: type a name, pick the match.

**Two things that read like reuse and are not, both verified 2026-09-17.**

*The picker is a new data source.* The existing one searches **profiles** through a relationship-scoped
function; **no organisation search exists anywhere in the codebase**, and the organisations service
offers only "list the public ones", "my membership ids" and "get one by slug". The familiar gesture
can be kept; the thing behind it has to be built.

*The mode selector never renders where this is needed.* For a **private** document the screen
force-selects one-to-one and hides the selector entirely
(`src/app/components/letters/letter-receiver-modal.tsx:321-323`, gated `!isAddRecipientMode &&
!isPrivateDoc`), and both call sites pass that straight off the document's own visibility. **A
problem-board draft is exactly the private-document case**, so a third button added to the existing
selector would be unreachable on the only flow that needs it. Acceptance must be demonstrated from a
private document, or it proves nothing.

**Selecting a community is not adding a recipient.** It switches what kind of letter this is. A
community letter has no named recipients by design — its readers are whoever is a member when they
open it — and `seal_and_send_letter` already refuses named recipients on such a letter.

**There is no write path for the audience today, and building one is part of this spec.** Verified
2026-09-17: `createLetter` inserts three columns and takes no audience
(`src/app/data/letters-service.ts:59-82`); `sealLetter` takes the letter, predictions, deliveries and
responses mode (`:92-108`); and the seal function *reads* the audience off the row rather than
accepting it as an argument. So the work is a new way to set it on the draft — either a widened
`createLetter` or an update on the draft row, which RLS already permits to its own sender while the
letter is a draft. Picking a community must also set the letter's mode, because the database refuses
an audience on any other kind of letter. The seal path itself stays unchanged.

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
- **The AUTHOR's membership gates the letter too, not only the reader's.** P1181's predicate requires
  that both the reader *and the sender* are current members, so when an author leaves, every member
  loses that letter — its content, snapshots and predictions. A community's archive is therefore
  hostage to each author's membership. That was a deliberate fail-closed choice in P1181 and it is
  reversible by editing one function; this spec must **surface** the consequence rather than assume
  the reader-side rule is the whole story. `[FOUNDER DECISION: should a departed author's letters
  stay readable by the community that already received them?]`
- **Self-enrolled reader deliveries must never be emailed — already enforced, do not undo it.** A
  delivery minted when a member opens a letter carries an address, and emailing it would send
  unsolicited invitations to every reader. Shipped code already prevents this: the mint stamps
  `notified_at` at insert time precisely so the mailer skips it (P884). **No work here** — this is
  listed so a change to the send or mail path does not quietly remove it.
- **A community letter may carry PRIVATE stories, and that exemption is the point.** P1181 widened
  the seal-time snapshot filter so a story that is private still enters an organisation letter —
  without it, a community letter from a private problem draft could not exist at all. Note this
  differs from an ordinary link letter, which snapshots public stories only. Do not "tidy" the filter
  back to symmetry.
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
| Members can read the sender's predictions before rating on a community letter, as on a public one | DEFER — **blocks the first event, not this spec** | Pre-existing on every one-to-many letter and genuinely not introduced here (the reading function has returned predictions since April, and P1181 copied that body verbatim). But this spec is what first points it at a **measurement**: the 2026-08-13 ruling was about an *anonymous* reader, while a community reader is an identified member whose rating is the calibration data. The server hands predictions over on open; only client-side convention withholds them until after rating, so a member calling the endpoint directly is unanchored by politeness alone. Fix belongs to the reading path, not this screen — but it must be closed before the first event, not merely noted |
| A member with no organisation sees an option that cannot be used | ACCEPT | Hide it when the member belongs to none; no empty state needed |

**Non-Goals**

- Do **NOT** add community visibility to stories or points. The audience lives on the letter. P1181's
  Open Question 1 measured the alternative: `private` is referenced 47 times across `src/app/`, and
  widening its meaning would reclassify content written under a different promise.
- Do **NOT** build the review page — P1320 owns it, and should reuse whatever this spec builds.
- Do **NOT** implement agent filing. A person presses send on every path.
- Do **NOT** change sealed-bid behaviour here, in either direction.

## Acceptance Criteria

- [ ] A member composing a letter **from a private document** can choose their community as the
      audience, by typing its name and selecting it. Demonstrated from a private document
      specifically — the public-document path does not exercise this flow
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
2. **Which communities the picker can even offer is a BUILD choice, not a preference.** There is no
   organisation search to configure — whichever answer is taken, something new gets built, and the
   two answers build different things: "the ones I belong to" reads from membership, "any public
   one" reads the public directory. The narrow one is almost certainly right (only a membership can
   produce a sendable letter), and it is recorded here as an engineering decision to be made with
   the implementation, not as a founder call.

3. **A genuinely private community cannot be offered in the picker at all.** Verified 2026-09-17:
   organisation rows are readable only when `visibility = 'public'` — one policy definition, never
   amended — so a `private` organisation is invisible to every caller, **including its own members**.
   A member can still read their own membership row, so they know they belong to something they
   cannot name. Today this blocks nothing: the only seeded organisation is public. But "closed
   community" is P1181's own framing, and the moment a private one exists this picker cannot list
   it. Either the picker resolves names through a member-scoped path, or private organisations stay
   out of scope and the spec says so. Not decided.

## Related

- **P1181** — the backend this opens the door to: the audience column, the read-time predicate, every
  gated read path, and the member-only export. **Built and tested on its branch, awaiting `/ship`** —
  this spec is blocked on that merge, and is dormant until both land.
- **P1320** — the review page carries the same send step for the weekly problem flow, and its spec
  already lists community as the audience the first event needs. It should reuse this, not
  reimplement it.
- **P1182** — the reader; its member-only mode consumes what community letters produce.
- `docs/problem-board-process.md` — the end-to-end journey and build order.
