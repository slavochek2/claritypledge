---
status: backlog
type: bug
disclosure: public
rank: 5
severity: medium
date_reported: '2026-08-17'
created_date: '2026-08-17'
tags: [security, live, codes, lifecycle]
driver: anomaly
feature_type: backend
pipeline_ran: [inline]
---

# P1098: a leaked room code is unrevocable

## Summary

Filed out of P1057's `DEFER` list, which had no P-number behind it (caught by `ship-gates.sh`
gate 3.65 at P1057's ship).

The room `code` is the capability `claim_joiner_seat` accepts. There is no rotation path and
`expires_at` is NULL by design, so **once a code leaks, it is valid indefinitely** and the
room's owner has no action available. P1057 closed the bulk-read leak; it did not give anyone
a remedy for a code that escaped by any other route — a screenshot, a forwarded link, a
shoulder-surf, or the Mixpanel cleartext path P1057 names as a non-goal.

## Problem

Three gaps compound:

1. **No rotation.** Nothing regenerates a room's code. The capability, once out, stays out.
2. **No expiry.** `expires_at` is NULL by design, so a code from months ago still authorizes a
   seat claim if the row is still live.
3. **No revocation surface.** Even a founder with DB access has no product-level "invalidate
   this room" action short of ending the session.

The practical consequence is narrow but real: a room owner who knows their link leaked can only
end the session, losing its state, rather than re-securing it.

## Appetite

Medium blast radius — touches the join path, which P1053 and P1057 both hardened, so any change
here must not reopen either. Reversibility is good (additive rotation, no destructive change).
Decision density is **high**, and that is the real cost: rotation semantics are genuinely
undecided (see below), and several are founder calls rather than technical ones.

## Approach

Open questions before any implementation — this is closer to a research spec than a fix.

1. **What does rotation do to a live joiner?** If a session is mid-flight and the code rotates,
   does the existing joiner keep their seat (identity already bound via `joiner_profile_id` /
   `joiner_seat_claimed_at`) or get evicted? Almost certainly keep — but it must be stated.
2. **Who may rotate?** Creator only, or either participant?
3. **Is expiry separable?** A default `expires_at` on new rooms is a smaller, independent
   change than rotation and may deliver most of the value. **Consider shipping that alone
   first** — argue against building rotation before building it.
4. **Does rotation need a UI at all,** or is the honest answer "end the session and start a new
   one", making this a documentation fix rather than a feature? Answer this **before** designing
   anything — it may close the spec.

## Risks / Non-Goals

- **MITIGATE — must not reopen P1053 or P1057.** Any new rotation RPC is another anon-adjacent
  surface on this table. It must carry `SET search_path`, both REVOKE forms, an explicit grant,
  and must not return or accept `code` in a way that re-publishes it.
- **ACCEPT — this does not help a code that leaked and was used before rotation.** Rotation is
  forward-looking only; there is no session-history remediation here.
- **Non-goal — the Mixpanel cleartext paths.** P1057 names eight call sites shipping the code
  to Mixpanel in cleartext while Sentry is deliberately given `codeLength` instead. That is
  real, and it belongs with the P1059 hardening backlog, not here.
- **Non-goal — code strength.** That is P1097.

## Done-When

Closed 2026-10-14 **as won't-do**, by founder decision. The two "If built" criteria do not apply
and are listed in prose below, not ticked.

- [x] Question 4 answered first, in writing — "is this a feature or a docs fix?" — **neither a
      feature nor a docs fix: won't-do.** Founder, 2026-10-14: neither rotate nor expire; the
      remedy for a leaked link is ending the session and starting a new one
- [x] If closed as won't-do: the reasoning is recorded in `docs/decisions.md`, not just here —
      [decisions.md](../docs/decisions.md) 2026-10-14 [security] "A leaked room code is neither
      rotated nor expired — ending the session is the remedy" (Status: accepted, with falsifier)

**Not applicable — nothing was built:**

- *If built: rotation cannot evict an already-seated joiner* — no rotation exists.
- *If built: the rotation surface passes the same gate checklist P1057 applied* — no new surface.

## Closure (2026-10-14)

No code. `inline` in `pipeline_ran` records the decision work done inline on 2026-10-14 (recording
the founder's ruling and its rationale), not an implementation. The rationale relies on the
per-seat secret work (P1224) landing on prod; revisit if it does not.

## Related

- **P1053** — made the code the authorization capability
- **P1057** — stopped publishing it; named this as a DEFER and deferred it here
- **P1097** — the code is minted with `Math.random()` (strength, not lifecycle)
