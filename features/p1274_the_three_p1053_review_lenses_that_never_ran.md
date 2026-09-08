---
status: all-done
type: comment
rank: 1000081
workstream: infrastructure
created_date: '2026-09-08'
completed_at: '2026-09-08'
tags: [security, adversarial-review, retracted]
disclosure: public
delivery_stage: create-spec
pipeline_ran: [create-spec]
drafted_by: opus
driver: anomaly
---

# P1274: RETRACTED — the three P1053 lenses had already run

## Problem

Filed to carry P1058's "Phase 3 — run the three unrun adversarial lenses" out of P1058 so that
spec's finished fix could ship without waiting on an open-ended review.

**The premise was false. Phase 3 had already run**, on `feature/p1058-release-seat-code-auth`,
with **3 of 3 lenses reporting** — recorded in P1058 under "Phase 3 — the three unrun lenses
(2026-09-08)". It was run by another session while this one was working in a different worktree.

## Why it was filed anyway

The reading of that branch was taken hours before the spec was written and was not re-checked. It
was accurate when taken and expired before it was used — the failure
[.claude/rules/git.md](../.claude/rules/git.md) names as *"volatile state decays — re-check before
telling the user NOT to act"*, and [epistemic.md](../.claude/rules/epistemic.md) gate 9 in its
second half: verification can pass and the fact still expire afterwards.

The spec is kept rather than deleted so the P-number sequence carries no gap — a fresh gap in the
tail is countable evidence that something was withheld, which would be misleading here.

## No residual scope

The review covered the surviving migration too, not only the reverted one — that is how it found
that `20260908114500` voided the AD3 premise the name-forgeable reclaim arm had rested on. So there
is nothing left for this spec to ask.

**What the review actually found**, since the outcome is worth carrying: it broke the fix. The
per-seat capability token was minted and handed to the attacker on request (the guest-reclaim arm
authorizes on `joiner_name`, which anon can read), and it stranded 200+ existing seats. Backed out
on founder decision, on evidence. The lock question this spec would have asked was answered too —
`FOR UPDATE` **is** demonstrable and does hold, 380ms control against 3145ms locked.

## Related

- P1058 — where Phase 3 actually ran and is recorded
- P1059 — the hardening backlog findings route to
