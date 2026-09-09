---
status: week
type: bug
disclosure: embargo
rank: 1000078
severity: high
workstream: infra
date_reported: '2026-09-08'
created_date: '2026-09-08'
drafted_by: opus
exec_model: opus
exec_effort: high
tags: [security, live, guest, rls, seat]
delivery_stage: create-spec
pipeline_ran: [create-spec]
driver: anomaly
---

# P1269: the guest seat is takeable by anyone who can read the guest's name

## Problem

**Situation:** P1058 closed F4 by requiring the room code to release an anonymously-held seat.
That works wherever the code is shared 1:1.

**Complication:** Two things defeat it together, and neither is closed. The room code is **not**
secret for event practice rooms — the RPC behind the public event page hands it to any anonymous
caller who names an event id, with no check that the event is published or that the caller is
attending. And `claim_joiner_seat`'s guest-reclaim arm authorizes on the seated guest's **display
name**, which is inside the anon SELECT allowlist. So a stranger reads the name, re-claims the
seat under it, and is treated as that guest.

**Reproduced 2026-09-08** on test, twice independently, during P1058's Phase 3 adversarial review.
P1058 attempted the obvious fix — mint a per-seat secret at claim time and require it on release —
and **it had to be reverted, because the reclaim arm hands the freshly minted secret to the
attacker.** Two different secrets were issued for the same seat, seconds apart, to two different
anonymous callers. Any per-seat capability is void while that arm stands.

**Question:** what may a guest present to prove they are the guest who took the seat — given that
they have no account, and that the two things they *do* hold (the code, their display name) are
both readable by someone who should not have the seat?

## Appetite

Blast radius: **high** — `claim_joiner_seat` is the entry point to every `/live` room, and the
guest path is the majority of joins. Reversibility: medium — `CREATE OR REPLACE` in a new
migration, but a seat column added wrong strands live sessions (see Risks). **Decision density:
one real founder call**, and it gates everything else.

## The founder decision that gates this

**[FOUNDER DECISION: may a guest rejoin their own seat from a new device, or after clearing
browser storage?]**

Today they can, by re-entering their name — that is precisely the forgeable path. Closing it means
a guest who loses local state cannot re-enter their own room until the seat frees. P1053 already
broke guest rejoin once and restored it deliberately (migration `20260812190000`, a recorded
founder decision) because the loss was "every refresh, not just recorded sessions" — that
restoration is what this spec would partly undo, so it is the same decision being re-opened with
better information.

**What changed since that decision:** it was argued on the ground that "release-then-claim already
bypasses any name check, so a name check on claim alone is not what is holding the attacker back."
P1058 removed release-then-claim. That premise is now false, and the name check is load-bearing.

### DECISION TAKEN — 2026-09-09

**Close the forgeable path, with a bounded grace window.** Founder, presented with close / leave /
close-with-grace: *"yes, we can close it with grace window. I don't know what is appropriate grace
window. I'll let you decide."* The window length was delegated; everything below the first sentence
is the agent's call and is open to revision.

**Shape.** A per-seat secret is the primary key to the seat: minted at claim, held client-side,
required on both release **and** reclaim (the spec's own Approach note already establishes that
requiring it on release alone hands it to whoever asks). Name-only reclaim survives **solely** as a
recovery fallback, permitted only inside the grace window below. Outside that window, a name is
never sufficient — which is what actually closes the forgery.

**Grace window: 15 minutes, measured from the guest's last verified presence on that seat**, where
a successful secret-bearing reclaim refreshes it. So the common case (refresh, tab reopen, network
blip — the client still holds the secret) is silent, needs no name, and rolls the window forward;
the rare case (storage cleared, phone died, moved device) falls back to name-only and must land
inside 15 minutes of the last time we actually saw that guest.

**Why 15 and not less or more** — the asymmetry, not a round number. Being locked out of your own
live room mid-conversation is visible, immediate, and lands on a real person; seat forgery is rare,
invisible, and requires the room code *and* the published name *and* being present inside the
window. P1053's revert is the recorded evidence that this founder weights the lockout harm heavily,
so the window errs generous. 15 minutes covers a browser crash plus reopen, or fetching a laptop
after a phone dies; it stays well inside a live session; and it is half the shortest existing room
lifetime (`20260221160452_p406_event_practice_rooms.sql`, 30 minutes), so it can never outlive the
room it protects.

**The machinery this needs, and it does not exist yet.** There is no presence signal for a guest
seat at all: P511's heartbeat is creator-only and its own migration says so explicitly
(`20260315141534_p511_session_resilience.sql:19-20` — *"Anonymous joiners do NOT heartbeat"*), and
P1053's migration records the same absence (*"there is no heartbeat or presence timeout, and
`pagehide` performs no DB write"*). A 15-minute window is therefore **not implementable against any
column that exists today** — it requires a `last_seen_at` (or equivalent) on the seat, written on
claim and on every secret-bearing reclaim. Cost that honestly before building: if the presence
timestamp proves disproportionate, the fallback shape is a window measured from seat **claim**
time, which is simpler, needs no new writes, and is strictly worse for exactly the long-session
case (a guest who refreshes at minute 40 of a 45-minute session would be outside it). Do not
silently substitute the weaker one — bring it back as a decision.

**Still open, deliberately:** whether the grace window also applies when the session's creator has
stopped heartbeating (i.e. the room is probably dead anyway). Not decided here.

## Approach

Not settled — the founder call above decides between shapes, and this spec should not pre-commit.
What the P1058 evidence already rules in or out:

- A per-seat secret minted at claim and required on release is **necessary but not sufficient**:
  it must also be required by the **reclaim** arm, or it is handed to whoever asks.
- A secret must survive a page reload on the client, or the guest cannot act on their own session.
  P1058's attempt held it in React state that no restore path ever repopulated.
- The scope of the event-room code exposure is independently worth narrowing: the RPC's own header
  describes the intent as "published because it is listed on a public page", and it implements
  "published to anyone who asks."

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| A nullable per-seat column with no backfill strands every seat that exists when it lands | MITIGATE | 200+ such rows measured on test; prod has the same shape. Use the repair pass idiom from `20260812160000` in the same transaction |
| The client-deploys-first ordering strands seats claimed in the deploy window | MITIGATE | Same repair pass, plus the coupling marker must name the commit that ships the secret — not an earlier one |
| Closing the reclaim arm locks a guest out of their own room from a new device | ACCEPT or DEFER — **the founder decision above decides which** | Do not pick this silently |
| Lock contention surfaces to the loser as HTTP 500 / `57014` rather than a refusal | DEFER | Pre-existing (`anon` has `statement_timeout=3s`); noted by P1058's race lens, not introduced here |

**Non-Goals**
- Do NOT re-open code revocability — that is P1098.
- Do NOT fix the `live_state` patch path — that is P1224, which this spec's outcome constrains.
- Do NOT weaken the room-code requirement P1058 added to `release_joiner_seat`; it is verified and
  independent of this.
- Do NOT decide whether event practice rooms should be attendee-only. That is a product question;
  this spec covers the authorization defect only.

## Invariants

- Whatever a guest presents to prove seat ownership MUST NOT be derivable from any column the anon
  SELECT allowlist publishes. `joiner_name` is published; a name is not a credential.
- A refusal guard MUST be positioned so a NULL operand denies. In a `WHERE` this is automatic; in
  an `IF` a NULL condition is skipped and a skipped refusal is an allow (P1053 F5, P1063).
- The anonymous guest join and leave paths MUST keep working without an account.

## Done-When

- [ ] An anonymous caller holding the published event-room code and the seated guest's name cannot
      take the seat — canary, reproduced failing first
- [ ] The founder decision on cross-device guest rejoin is recorded in this spec, with the chosen
      behaviour asserted by a test either way
- [ ] No seat that existed before the migration is left unreleasable — verified by a count query on
      test before and after
- [ ] A guest can still join, leave and rejoin after a page reload, anonymously — canary
- [ ] P1058's room-code canaries and the P1053 suite stay green

## Related

- **P1058** — added the room-code requirement this spec's defect walks around; its Phase 3 review
  produced the reproduction, and its reverted token migration (`20260908120000` /
  `20260908130000`) is the worked example of why the reclaim arm must be fixed first.
- **P1224** — the same "id alone is authorization" shape on the `live_state` patch path; its fix
  depends on the decision here.
- **P1098** — a leaked room code is unrevocable.
- **P1059** — P1053 hardening backlog; also now carries the `seal_and_send_letter` fail-open guard
  P1058 found.
- Exploit mechanics: `.private/docs/security-log.md`, 2026-09-08.
