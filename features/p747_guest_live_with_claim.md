---
status: backlog
type: story
rank: 11
workstream: C2
created_date: '2026-04-17'
tags:
  - letters
  - live
  - guest
  - nickname
  - claim
  - badges
delivery_stage: create-spec
pipeline_ran:
  - create-spec
---

# P747: Guest /live from letter + save-with-badges at session end

## Problem

**Situation:** Public (one-to-many) letters allow anonymous guests to fill via token-based RPCs (P581 / P642). Their point responses land in `letter_point_responses` and their ratings in `story_verifications` with `source='letter'`. The cover headline renders `For you` when no named receiver exists (`letter-cover.tsx:77`). P745 introduces letter-hosted /live injection but is scoped to registered receivers — guests see no banner.

**Complication:** The author's motivating workflow is *person in front of me fills a public letter, I pounce into /live with them*. Three gaps block this today:
1. **Preload is empty for guests.** P733 bootstrap reads `point_positions`. Guests are RLS-blocked from writing there (`letters-service.ts:387`), so their /live starts with no positions even though their letter data exists.
2. **No identity.** Guests are indistinguishable in the author's aggregate view (P746 labels them `Guest — {hash}`). Author cannot recognize who is who.
3. **No claim moment that carries badges.** If a guest earns something during the mid-letter /live session (verified stories, clarity points), registering after the session must attach those records — today claim (`claim_letter_delivery`, P642) handles letter data but is not a flow triggered from a /live completion.

**Question:** How does a guest on a public letter get pulled into /live with correct preload, identifiable to the author, and offered a save-moment that preserves both letter responses and any badges earned in /live?

## Appetite

Medium blast radius (touches letter-cover copy, public-letter entry flow, P745 injection gate, P733 preload fallback, post-/live CTA, claim RPC). Medium reversibility (nickname storage is additive; preload fallback is an additional code path; claim expansion requires careful SQL). Medium decision density (nickname prompt UX, URL-param vs prompt precedence, badge-preservation data path).

## Solution

Depends on P745 (injection primitive) and extends P733 (preload path).

1. **Preload fallback for guests** — when `bootstrapLetterSourcedSession` finds empty `point_positions` for a listener, fall back to `letter_point_responses` + `story_verifications` scoped to the current delivery. Maps into the same `livePositionsCreator` / `livePositionsJoiner` snapshot keys.

2. **Guest nickname capture** — on first open of a public letter:
   - If URL has `?name=Alex`, accept it and store on `letter_deliveries` (new column `guest_nickname text`). Skip the prompt.
   - Otherwise, render a one-line prompt on letter cover: *What should we call you?* → stores and proceeds.
   - Persist in `localStorage` so reloads on the same device don't re-ask.

3. **Cover headline rewire** — `letter-cover.tsx:77` changes from `For {receiverName}` to a resolver that prefers `guest_nickname` when present for one-to-many deliveries. Result: `For Alex` instead of `For you`.

4. **Lift the F1 guest gate** — P745's non-goal on guest-invisible banner is lifted here. Author triggers work the same; guest receives the banner; preload uses the new fallback path.

5. **Save-with-badges CTA** — on /live completion for a guest, the post-session screen offers *Save {nickname}'s responses and badges → create account*. On confirm:
   - Standard Supabase anon → email-verified account flow
   - `claim_letter_delivery` runs (P642 behavior) — attaches delivery and letter responses
   - New step: attach any `story_verifications` or badge rows created during the /live session (where the guest was the listener) to the new verified profile id
   - Show resulting badges in the confirmation state

6. **Aggregate view labels** — P746's guest placeholder upgrades from `Guest — {hash}` to `{guest_nickname}` when set. No other change to P746.

## Risks / Non-Goals

### Risks
- **Preload fallback divergence from P733.** Two data paths for preload (direct `point_positions` vs letter-scoped fallback) could drift in rating/position semantics. **Mitigation:** fallback maps to the same position record shape; add unit test that a guest-filled letter and a registered-filled letter produce equal preload snapshots for identical responses.
- **Nickname collisions.** Two guests on the same letter pick *Alex*. **Mitigation:** display-only; internally each delivery is unique by id. Aggregate view appends a short delivery-hash suffix on collision.
- **Claim edge cases.** Guest completes /live, closes tab without claiming, returns later. **Mitigation:** letter + session data already persists under the anon profile id; `claim_letter_delivery` idempotency + an equivalent pathway for session rows covers re-entry.
- **URL-param nickname trust.** `?name=` is user-controllable. **Mitigation:** treat as display string only; sanitize for length and script content; never use in auth decisions.

### Non-Goals
- **Do NOT** re-architect the injection primitive — P745 is a prerequisite and is consumed as-is
- **Do NOT** introduce a persistent guest account concept beyond anon-auth + claim — same model as today
- **Do NOT** support cross-device guest continuity beyond localStorage — explicit follow-up
- **Do NOT** retroactively award pre-letter badges to the new account — only the letter + /live session being claimed carry over
- **Do NOT** change the claim UX for registered receivers (one-to-one letters)

## Done-When

- [ ] Guest filling a public letter sees a nickname prompt on first open (or accepts `?name=` from URL)
- [ ] Letter cover shows `For {nickname}` instead of `For you`
- [ ] Author triggers /live (per P745) for a guest-in-progress delivery — guest sees the banner
- [ ] Guest accepts → /live opens with positions preloaded from their letter responses
- [ ] /live completes → guest sees save-and-create-account CTA that uses their nickname
- [ ] On account creation, the letter delivery, letter responses, and mid-session badges all attach to the new verified profile
- [ ] P746 aggregate view shows the guest by nickname
- [ ] Regression: registered one-to-one path (P745's core flow, P733 preload) unchanged and continues to work
- [ ] Regression: guest fill without injection (fill → save-CTA → register) still works for guests who never enter /live

## UX Notes

**Nickname prompt:**
- First screen of a public letter, before `Open the Letter` CTA
- One field, placeholder *e.g. Alex*, optional *Continue as guest* skip (skip → uses `Guest`)
- Above the `From {sender}` line

**Cover headline:**
- `For {nickname}` when nickname set
- `For you` fallback when no nickname and user skipped prompt
- `For {receiverName}` for one-to-one letters (unchanged)

**Save-with-badges CTA (post-/live):**
- Heading personalizes with nickname: `Save {nickname}'s responses`
- Shows what is being saved: responses from the letter, any badges just earned
- One-tap continue to account creation / email verification

**Edge: guest completes letter without /live injection:**
- Existing save-CTA (`letter-cover.tsx:146` consent copy) gets the same nickname-aware personalization

## Acceptance Criteria

- [ ] Nickname is captured (prompt or URL param) and persists for the session
- [ ] Cover headline reflects nickname
- [ ] Guest preload for /live works end-to-end with letter data
- [ ] Save CTA uses nickname and attaches letter + session data on claim
- [ ] Aggregate view (P746) displays nickname
- [ ] No regression on registered-receiver flow

## UI Contract

| Element | Value | Context |
|---------|-------|---------|
| Nickname prompt heading | `What should we call you?` | Public letter cover, first open |
| Nickname field placeholder | `e.g. Alex` | Prompt |
| Skip copy | `Continue as guest` | Prompt |
| Cover headline w/ nickname | `For {nickname}` | Letter cover (replaces `For you`) |
| Cover headline skipped | `For you` | Letter cover when nickname skipped |
| Post-/live save CTA heading | `Save {nickname}'s responses` | Guest post-session screen |
| Post-/live save CTA body | `Create an account to keep your responses and badges` | Guest post-session screen |
| URL param | `?name={string}` | Public letter link |
