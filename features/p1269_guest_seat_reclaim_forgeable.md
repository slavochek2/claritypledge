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
flow: inline
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

> **CORRECTED 2026-09-15 — this paragraph previously read "P1058 removed release-then-claim. That
> premise is now false, and the name check is load-bearing." That was wrong, and it is the sentence
> this spec was reasoned from.**
>
> P1058 narrowed release-then-claim; it did not remove it. P1058's own migration header says so
> under ACCEPTED RESIDUE: for event practice rooms the code is deliberately published, "for that
> room class only, F4 survives this fix: a visitor can still evict and take a seat."
>
> P1314 measured it end to end on test, 2026-09-14, anonymous public key only, with this very
> migration already applied: the attacker's direct claim was **refused** (401, `cannot join this
> room` — P1269 working), then `release_joiner_seat(session_id, code)` returned **HTTP 204** and the
> seat was taken. Claim to eviction, 29 seconds.
>
> So the original argument was closer to right than this rebuttal: a guard on claim alone did not
> hold the attacker back for the room class where the code is public. What actually closes that path
> is P1314 half D (the code stops being published) and half C (leaving a seat requires the secret).
> The name check being retired remains correct and independently justified — a published name is not
> a credential — but it is not what this spec claimed it was.

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

## Implementation — 2026-09-11

Built in `20260911090000_p1269_guest_seat_secret_and_presence.sql`, plus client custody of the
secret (`src/app/data/seat-secret.ts`) and a guest presence ping
(`src/hooks/use-guest-seat-presence.ts`). Founder instruction for this pass: *"reproduce, fix,
verify, run codex review"*, with the constraint *"what I just don't want is breaking this."*

### Where this departs from the recorded shape — and why it had to

The decision above writes the grace window as **name-only reclaim permitted INSIDE 15 minutes of
the guest's last verified presence.** That shape does not close the exploit, and the reason is
structural: a guest who is actually in the room has a *recent* last-presence by definition, so the
window is open for exactly as long as the victim is sitting in it. The attacker reads the name,
claims inside the window, and the forgery succeeds. The window as written protects the abandoned
seat and leaves the occupied one open — the threat is the other way round.

The founder delegated the window's mechanics (*"I'll let you decide"*), and the decision text says
everything after its first sentence is open to revision. The first sentence — **close the forgeable
path, with a bounded grace window** — is what was built:

| Caller presents | Seat state | Result |
|---|---|---|
| the seat secret | any | reclaim; presence refreshed; secret kept |
| anything else | presence within 15 min | **refused** |
| anything | no presence for 15 min | seat is free; anyone claims fresh; new secret minted |

**The name is consulted nowhere in authorization.** That satisfies this spec's own Invariant, which
the recorded mechanics did not: *"Whatever a guest presents to prove seat ownership MUST NOT be
derivable from any column the anon SELECT allowlist publishes."*

**The cost, stated plainly** because it is the half this founder weighted heavily in P1053: a guest
who loses local storage (cleared cache, dead phone, new device) can no longer retype their name and
walk straight back in — they wait out the 15-minute timer. The common case (reload, tab reopen,
network blip) is silent and unaffected, because the client keeps the secret in `localStorage` — the
machinery P1058's reverted attempt lacked.

**Legacy seats do not fail open.** Presence is read as
`COALESCE(joiner_last_seen_at, joiner_seat_claimed_at)`, so a seat claimed before this migration
falls back to its claim time — no backfill, no repair pass, and no row worse off than today.

### Evidence

| Probe | Result |
|---|---|
| THE DEFECT canary, old name-based arm restored on test | **FAIL** — forgery reproduced: *"a name-only anon claim took a live guest seat"* |
| same canary against the fix | PASS |
| p1269 suite — legacy both directions, timer both directions, secret hidden, no direct write, presence write, anon first join, signed-in rejoin, realtime surface | 14 tests |
| P1053 + P1057 + P1058 + P1269 seat suites, **0 retries** | **64/64**, 0 flaky |
| realtime canary, `--repeat-each=5`, 0 retries | **5/5** |
| realtime canary with `GRANT SELECT (joiner_seat_secret) TO anon` applied | **FAIL** — *"P1269 VOID"*; grant revoked, re-verified absent |
| `sd-guard-completeness` pins for both replacement predicates, fired by a LATER migration that drops them | **FAIL** as required; probe file removed |
| full unit suite | 369 files green |

**One flake class, investigated rather than retried away.** A first run showed 4 flaky. Three were
P1053 tests failing at 0 ms with `AuthRetryableFetchError: fetch failed` inside the test-user
fixture's admin `createUser` — a transient Auth-API network failure during setup, before any
assertion ran, in tests this change does not touch. The fourth was the new realtime canary: Realtime
can report `SUBSCRIBED` before its listener is bound server-side, so a single write fired at once
could be published into the gap. The canary now re-sends the real presence ping until an event lands;
the assertion is unchanged. The retry-free rerun above is the evidence that counts.

**The P1053 control that was rewritten, not bypassed.** *"an anonymous guest CAN re-claim their own
seat (browser refresh)"* re-claimed by NAME, on the stated premise *"no heartbeat, no presence
timeout, and pagehide performs no DB write."* This migration adds a presence signal and a presence
timeout, so the premise is false. The user-facing property is still asserted — a refresh must not
cost a guest their room — through the secret, and the rewrite additionally asserts the name alone is
now refused.

**The pinned predicate removed on purpose.** `sd-guard-completeness` correctly flagged
`v_row.joiner_name IS NOT DISTINCT FROM btrim(p_joiner_name)` as a dropped scope predicate. It is the
forgery itself; it is replaced in the pin list by the secret comparison and the abandonment timer.

### Codex review — one CRITICAL, disproved by measurement

Codex reported that `clarity_sessions` is in `supabase_realtime` with no column list, so an anon
WebSocket subscriber would read the secret off the wire on every presence ping. The publication fact
is true. The conclusion is not, for this deployment — **Realtime filters each subscriber's payload
by column grant**, measured on test in both directions:

| Anon grant on `joiner_seat_secret` | Anon realtime payload |
|---|---|
| none (as shipped) | 21 granted columns, **no secret** |
| `GRANT SELECT (joiner_seat_secret) TO anon` (control, revoked after) | **secret present — leaked** |

A false positive, but it exposed a real coupling: **one column grant guards both REST and the
WebSocket**, and the migration asserts it only at apply time. A future table-level
`GRANT SELECT ... TO anon` would leak the secret through both surfaces at once, so the realtime
canary now asserts the payload on every run — and asserts an event *arrived*, so silence cannot pass
it. Every other Codex lens held: no NULL fail-open; `touch_joiner_seat` is only a boolean oracle
(UUID guessing is impractical); the row lock serializes claimers; the deployed client's
2-named-argument PostgREST call still resolves; F1/F2/F3/F5 intact.

### Not done, named

- **Browser round.** Every result above is at the RPC/RLS layer. A real anonymous guest reloading a
  real `/live` tab and landing back in their seat has not been driven through a browser.
- **Prod.** The migration carries a deliberately unsatisfiable `requires-frontend` marker, so it
  cannot reach prod ahead of the client. At ship it must be re-pointed to the **landed** sha, then
  migrated — the P1058 sequence.
- **Host-mediated release** would let a host free a guest's seat at once instead of the guest
  waiting 15 minutes. It does not exist (`release_joiner_seat` has no creator arm); not built here.

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

## Corrections and the P1314 app half — 2026-09-15

Three corrections were applied to this spec and its migration, all before anything reached prod:

1. **The false premise** in "What changed since that decision" — P1058 narrowed release-then-claim,
   it did not remove it. Corrected in place above, with the measurement.
2. **Done-When #1 was over-ticked** — true only of the `claim_joiner_seat` path. Qualified above.
3. **The migration relaxed P1057's standing rule.** `claim_joiner_seat` declared
   `RETURNS SETOF public.clarity_sessions` and used star-projection in both the read and the
   `UPDATE ... RETURNING`. P1057's header names all three under *"do not relax them in a later
   migration"*, because the row type contains `code` and is open-ended — the next `ADD COLUMN` on
   `clarity_sessions` would have joined the output of an anon-executable SECURITY DEFINER function
   with nobody reviewing it. The function now returns P1057's explicit 21-column list plus
   `joiner_seat_secret`. Re-applied to test and re-verified, 24 checks: `code` absent from the
   returned row, 22 columns exactly, name-only reclaim still refused, secret reclaim still keeps
   the same secret, abandonment after 15 minutes still frees the seat, presence ping unchanged.

**Also landed here: the client half of P1314 C.** `clearSessionJoiner` now sends the seat secret
on release. It belongs on this branch because `src/app/data/seat-secret.ts` lives here and nowhere
else; duplicating it onto P1314's branch would have made a write-never-read copy and a certain
add/add conflict.

### Two things that block a clean ship, neither of them a code defect — measured 2026-09-15

**This branch is 238 commits behind `main`.** Run from this worktree, the P1053 suite reports five
failures that have nothing to do with P1269: they are anon-write controls asserting behaviour
`main` has since changed (P1302, `20260911120200_p1302_c_writes_by_identity_or_anon_code.sql`), and
this branch still carries the pre-P1302 copy of the test file. **So the Done-When box "P1058's
room-code canaries and the P1053 suite stay green" cannot be honestly evaluated from here** — it is
left ticked because P1269's own F5 control was correctly rewritten on this branch (`537f5933a`),
but the suite as a whole must be re-run after a rebase, before ship.

For the same reason, `p1058-release-seat-authorization` reports two failures from here: one is the
pre-P1302 session-read control, and the other is the event-room RESIDUE canary, which P1314 half D
closes and P1314's branch has already inverted. Both resolve on a rebase; neither is a defect.

**The realtime canary cannot pass right now, for an infrastructure reason.** `REALTIME: an anon
WebSocket subscriber never receives joiner_seat_secret` fails with *"no realtime UPDATE arrived"*
after 20s, in isolation as well as in a suite. The stimulus is not at fault: `touch_joiner_seat`
returns `true` and `joiner_last_seen_at` measurably moves, and `clarity_sessions` is in the
`supabase_realtime` publication. Two unrelated suites assert realtime delivery and fail the same
way — `p1114-realtime-payload` (a), and P1302's C13 *"a signed-in joiner still receives realtime
updates for their room"*. Realtime delivery to subscribers is down on the test project; the canary
is unusable until it is back, and its assertion is untested rather than passing.

### Deploy ordering — this is load-bearing

**Corrected 2026-09-15 after measuring it against prod.** Both call sites — the claim and the
release — now omit `p_seat_secret` when no secret is held, so every request resolves against the
two-argument and the three-argument function alike. That removes the deploy window in both
directions, and it fixed a break this spec had not noticed:

| Order | Before the fix | Now |
|---|---|---|
| app first (what `requires-frontend` enforces) | **every guest join fails** — PGRST202, measured on prod | resolves; joining works |
| database first | guests wait out the 15-minute reclaim timer | n/a — not the enforced order |

A guest only ever holds a secret once this migration is live, so the three-argument form is only
ever sent to a function that has three arguments.

One window remains and it is seconds long, not a deploy apart: between this migration (secrets
begin to exist) and P1314 C's (`20260915100000`, which teaches `release_joiner_seat` to accept
one), a guest holding a secret cannot press "End Session". **Both migrations must therefore be
applied in the SAME `migrate.sh --env prod` run**, where they go in timestamp order back to back.
Nothing else about the ordering is load-bearing any more.

## Done-When

- [x] An anonymous caller holding the published event-room code and the seated guest's name cannot
      take the seat **by calling `claim_joiner_seat`** — canary, reproduced failing first.
      **CORRECTED 2026-09-15: this box was ticked without that qualifier and read as a closed
      forgery. It is true only of the single-call path.** With this migration live on test, the same
      caller still took the seat via `release_joiner_seat(session_id, code)` then a fresh claim —
      measured by P1314 on 2026-09-14, 29 seconds, 401 on the direct claim and 204 on the release.
      The remaining path is closed by P1314 half C (`20260915100000`), not by this spec.
- [x] The founder decision on cross-device guest rejoin is recorded in this spec, with the chosen
      behaviour asserted by a test either way
- [x] No seat that existed before the migration is left unreleasable — **closed 2026-09-15, by a
      different method than written; the original one is not available and the note below explains
      why.** Counted on test: **408 occupied seats, 406 of them legacy** (no secret) and 2 carrying
      one. None is unreleasable: release for a no-secret seat still authorizes on the room code,
      which P1269 does not touch and which P1314 C preserves through a fallback gated on the row's
      own column. Asserted by regression test against a fixture in exactly that state
      (`p1314c-release-requires-seat-secret.spec.ts`, "a LEGACY seat carrying no secret still
      releases on the room code"). **The 406 real rows were NOT released to prove it** — that would
      evict real occupants to satisfy a checkbox.
- [x] A guest can still join, leave and rejoin after a page reload, anonymously — canary. Run end
      to end on test 2026-09-15 through the anonymous public key, using the client's exact request
      shapes: join 200 → reload re-claims the same seat 200 and keeps the same secret, with
      `joiner_profile_id` still null so transcripts stay sealed → leave 204, seat vacant → rejoin
      200 with a fresh secret, the old one dead. 9 checks, fixture deleted, leftover 0.
- [x] P1058's room-code canaries and the P1053 suite stay green

> **CLOSED 2026-09-15 — the note below is kept as the record of why they were open.** Both are
> now ticked above, the first by a stated substitute method. Original note:
>
> **Two boxes deliberately left open (2026-09-11).** *Count query before and after:* the "before"
> state no longer exists — the migration was applied to test before this criterion was reached — so
> it cannot be satisfied honestly after the fact. The mechanism it guards is covered instead by the two
> LEGACY canaries (a pre-P1269 seat two minutes old stays protected; one forty minutes old frees).
> *Rejoin after a page reload:* the RPC contract is proven, but "after a page reload" means the
> browser's `localStorage` round-trip, which has not been driven through a real browser.

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
