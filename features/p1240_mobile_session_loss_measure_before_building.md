---
status: week
type: story
rank: 1000069
workstream: C1
created_date: '2026-09-03'
tags: [auth, mobile, in-app-browser, activation]
delivery_stage: create-spec
pipeline_ran: [create-spec]
drafted_by: opus
exec_model: opus
exec_effort: medium
driver: anomaly
---

# P1240: Does a signed-in person on a phone actually lose their session? Measure it

## Problem

**Situation:** People on phones lose their session. The founder's description, 2026-09-01:

> "a person is logged in. Maybe he's on the event, maybe he's in the browser, and then maybe he
> clicks on some kind of a link or something or opens a new tab... sometimes he loses his session.
> So his browser is not remembering very good."

**Read it precisely, because the original spec did not.** This is about a person who **was already
signed in** and stops being signed in while navigating. It is **not** about signing in. The link
being tapped is an ordinary link to a page — the founder confirmed this explicitly on 2026-09-04
("when i say send link i was talking about public link.. i was not talkking about maginc link").
Every hypothesis framed around login links, magic links, or the auth callback is answering a
different question, and one full session was spent that way before the misreading surfaced.

**Complication:** filed once before as **P840** (2026-05-15) and rejected during `/reproduce`. Filed
again here on recurrence. **It has now been investigated twice and reproduced zero times**, and the
2026-09-04 session falsified every mechanism anyone had proposed:

| Proposed mechanism | Status |
|---|---|
| (a) In-app browser spawns a fresh WebView with isolated storage | **Falsified by the founder's own observation** — he reports the same browser. Also unverified for Gmail specifically, which routes taps through Chrome Custom Tabs (shared storage), so Gmail may never have belonged in this list |
| (b) PKCE login link opened in a different browser | **Out of scope.** Real, deliberate (P608), and about *signing in* — not about staying signed in. Findings preserved in `docs/decisions.md` 2026-09-03 and `docs/technical/authentication.md`; do not re-derive them here |
| (c) Storage eviction (ITP / disk pressure / browser setting clearing site data) | **Still live, untested.** Not assessable on Android via the ITP route; the general storage-cleared route remains open |
| (d) Refresh-token reuse detection revoking the session family | **Falsified 2026-09-04 by direct test** against the test project: rotation is ON, but reusing a stale refresh token 90s later returned the *same* replacement token and the session survived. A garbage-token control returned 400, proving the probe could see a failure |

**Question:** does this happen at all, and to whom? Nobody knows, because nothing recorded it.

## Appetite

**Blast radius: small** — one additive analytics path in the auth provider; no change to auth
behaviour. **Reversibility: high.** **Decision density: one** — build or close, once there is a
number.

## Invariants

- **The session lives in `localStorage`, never in a cookie** (`src/lib/supabase.ts`, no custom
  `storage`). Any hypothesis framed around cookie attributes, `SameSite`, or `Secure` is malformed
  for this codebase — recorded 2026-05-15 after one was pursued, re-confirmed by direct observation
  on the device 2026-09-03.
- **The 1-hour access token is not the mechanism.** `jwt_expiry = 3600` with
  `enable_refresh_token_rotation = true` and no refresh-token expiry: the short token renews
  silently and invisibly (observed renewing on the founder's own phone, 2026-09-04). Raising
  `jwt_expiry` does not address session loss and costs revocability — an access token cannot be
  revoked, so sign-out and bans would not take effect until it lapses. Capped at 604,800s (1 week)
  regardless; "14 days" is not available. Considered and rejected 2026-09-04.
- **Do not propose a mechanism without a falsifier.** Four have been proposed; four have died. The
  next one must arrive with the command that would kill it.

## Solution / Approach

**This is a measurement task, not a build task, and it must not be converted back into one until
there is data.** Two gates open the door to building: a reproduction, or a count. Neither exists.
Four investigation sessions have produced four dead hypotheses and zero evidence that any user
other than the founder has ever experienced this.

**Step 1 — record it (done 2026-09-04, uncommitted at time of writing).** `src/auth/AuthContext.tsx`
fires `session_lost_unexplained` when a session disappears without a deliberate sign-out. The
load-bearing field is `stored_token_present`, which splits the remaining causes cleanly:

| `stored_token_present` | Means | Whose problem |
|---|---|---|
| `true` | The stored login is still on the device; the client discarded the session anyway | **Ours** — a defect in this codebase |
| `false` | Storage was cleared underneath us | **Environment** — eviction, browser setting, WebView |
| `'threw'` | Storage is unreadable at all (private mode, blocked site data) | A cause in its own right |

Also carried: `auth_event`, `visibility`, `was_hidden`, `online`, `path`.

Covered by `src/tests/p1240-session-loss-instrumentation.test.tsx` in **both** directions — fires on
an unexplained loss, stays silent on a deliberate sign-out and when there was never a session. Both
directions are asserted deliberately: a recorder that fired on everything would pass a fires-on-loss
test alone and then report every normal sign-out as a defect. The test earned its place immediately —
it caught the first implementation reading `Object.keys(localStorage)`, which returns method names
rather than stored keys under some Storage implementations, so `stored_token_present` was reporting
`false` while a token sat in storage. That is the single field the whole measurement turns on; it
would have produced weeks of confident, wrong data.

**Step 2 — ship it and wait.** Mixpanel and Sentry are production-only here; nothing is measured
until this is live.

**Step 3 — decide with the number.** A real rate plus a dominant `stored_token_present` value names
the cause and the fix. A near-zero rate closes this permanently, and the third report does not cost
another evening.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| The recorder is noisy — fires on ordinary sign-outs | MITIGATE | Suppressed by an explicit deliberate-sign-out flag and by ignoring transitions where no session existed; both asserted in the test |
| The recorder is silent because it is broken, and silence is read as "the bug is not real" | MITIGATE | This is the failure mode that matters most, since a broken recorder and a non-existent bug look identical. Both firing directions are tested; the first implementation was in fact broken and the test caught it |
| Analytics is blocked for some users, undercounting | ACCEPT | `analytics.track` no-ops when the Mixpanel global is absent (tracker blockers). The number is a floor, not a census — do not present it as a rate |
| Nobody remembers to read the number | MITIGATE | Open Question 1 carries the date to check |
| It turns out to affect very few people | ACCEPT | That is a valid and useful result — it closes the spec |

**Non-Goals**
- Do NOT build a fallback-identity or re-auth UI before there is data. That was the original
  direction and it presumes a cause nobody has established.
- Do NOT pursue any cookie-attribute hypothesis (first invariant).
- Do NOT touch the login/magic-link flow here — that is a separate concern with its own trade-off,
  recorded in `docs/decisions.md` 2026-09-03. Changing it does not affect this spec.
- Do NOT raise `jwt_expiry` as a remedy (second invariant).
- Do NOT re-derive the in-app WebView mechanism — documented, and falsified for this report.
- Do NOT build a PWA install prompt; it was P840's rejected direction.

## Acceptance Criteria

- [x] **2026-09-04** — every proposed mechanism carries an explicit verdict, including the ones that
      did **not** reproduce, since a negative rules out a whole fix direction. Four proposed, four
      dead or out of scope; (c) remains untested
- [x] **2026-09-04** — the product records an unexplained session loss, distinguishing "the stored
      login was still there" from "storage was cleared", and stays silent on deliberate sign-out
- [x] **2026-09-04** — the recorder has been observed both firing and staying silent, not merely
      written. A recorder never seen to fire cannot be told apart from a bug that never happens
- [ ] The recorder is live in production
- [ ] A number exists, read on or after the date in Open Question 1
- [ ] Build-or-close decided **from that number**, not from impression

## Open Questions

1. **How often does this actually happen?** Unanswerable until the recorder ships. Check no earlier
   than **2 weeks after deploy**; if the count is near zero, close the spec.
2. Is there a route where losing the session loses *work* — a half-written letter, an unsubmitted
   position — rather than just the session? That would change severity materially. Not assessed, and
   independent of the count.
3. Does the prod Supabase auth config match `supabase/config.toml`? The falsification of (d) was run
   against the **test** project. GoTrue behaviour is not expected to differ per project, but this was
   not confirmed.
4. Does Gmail on Android use a Custom Tab (shared storage) or an isolated WebView? One tap settles
   it. Now low priority — (a) is falsified by the founder's own observation — but it would also
   correct `docs/technical/authentication.md`, which currently lists Gmail as an isolated WebView.

## Related

- **P840** (archive, rejected 2026-05-15) — the predecessor and the source of the mechanism
- `docs/technical/authentication.md` §"Mobile in-app WebView" — the documented mechanism
- decisions.md 2026-05-15 [technical] — verify storage mechanism and WebView spawn model before
  treating a mobile auth-loss report as a code defect; and the third-occurrence escalation trigger
- **P1086** (open) — magic-link E2E timeouts; belongs to the login concern, not to this one
- `docs/decisions.md` 2026-09-03 [technical] — the login-link cross-browser trade-off (P608), moved
  out of this spec deliberately
- `docs/decisions.md` 2026-09-04 [technical] — the four falsified mechanisms and the measure-first turn
