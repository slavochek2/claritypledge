---
status: qa
type: story
rank: 1000989.0
created_date: '2026-08-13'
tags: [organizations, invite, auth, share]
delivery_stage: ship
pipeline_ran: [create-spec, ascii-flows, dev, verify, fix, verify.2, ship, dev.2, ship.2]
driver: heuristic
---

# P1076: Org invite link — share to join

## Problem

**Situation:** Clarity Organizations ship with a public join gate at `/org/:slug/join`, where
accepting the Clarity Organization Terms creates the membership row — the row IS the acceptance
record (P1010). On the org page a stranger sees "Join as member"; a member sees "Manage
membership".

**Complication:** Two gaps sit between "a member wants to bring someone in" and "that someone is
a member."

1. **No member can hand the link to anyone.** The join page is reachable only by pressing the
   Join button — which members no longer see. A member who wants the address would have to leave
   the organization to find it.
2. **A signed-out recipient cannot finish.** Tapping "Accept terms & join" while logged out sends
   them to `/login?redirect=/org/cm/join` (`org-join-page.tsx:64`). But `/org` is absent from
   `ALLOWED_REDIRECT_PREFIXES` (`AuthCallbackPage.tsx:576`), so after registering they are sent to
   `/feed` (`AuthCallbackPage.tsx:689`) — not joined, with no explanation of what happened.

**Question:** How does a member invite someone, and how does that someone finish joining when they
arrive without an account?

## Appetite

Medium blast radius — the invite affordance touches one page, but the redirect allowlist governs
every post-auth navigation in the product, and the join RPC gains a caller-supplied value. Good
reversibility: one nullable column and a `git revert`; the column can be dropped without data loss
because nothing reads it. Low decision density — link shape, auto-join, and silent attribution are
decided; the invitation wording remains open.

## Solution

**1. Invite affordance.** Reuse `ShareDialog` (`src/app/components/shared/ShareDialog.tsx`) — the
existing share surface for stories, points, and profiles — by adding `'org'` to its type union.
The embed-code section is already restricted to stories and points (`ShareDialog.tsx:53`), so an
org gets link + native mobile share only.

**Session revision (2026-08-16, founder-approved):** the shared URL points at the org page,
`{origin}/org/{slug}` — not straight at `/org/{slug}/join` as originally shipped. A cold invite
recipient landing directly on the terms-only join page has no context: no About, no Members, no
sense of what they're joining or who's in it. The org page already has About/Members/Events tabs
and its own "Join as member" CTA, built for exactly this — reusing it costs nothing new, versus
building a second context surface on the join page. `org-page.tsx`'s Join button now forwards
`?from=` onto `/join` when pressed, so attribution survives the extra hop.

A member reaches it from the org page. For a member this can be the primary header action, since a
member never sees "Join as member" — the two audiences never see both, so P955's one-primary-action
rule holds. **Exact placement and prominence are a `/ux` decision**, raised because an invite
nobody finds produces no invitations.

The dialog stays as plain as the profile share dialog it reuses: title, link, copy, share. Social
proof ("23 members have committed…") belongs on the **join page**, where the person deciding
whether to join actually reads it — not in the sharer's dialog, where the reader is already a
member and the line is addressed to the wrong person.

**2. Auto-join after auth.** Add `/org` to `ALLOWED_REDIRECT_PREFIXES`, and carry the join intent
through the auth callback so a visitor who tapped Accept before signing in comes back **already a
member**, seeing the success state — not the terms page awaiting a second tap. Precedent exists in
the same file: `action=rsvp` auto-RSVPs a user to an event after signup
(`AuthCallbackPage.tsx:539`).

**3. Silent attribution.** The shared link carries `?from={inviter}`, stamped into a new nullable
column on the membership row at join time. **Nothing displays it.** The link works identically if
the parameter is stripped, absent, or invalid. This exists solely so the question "did invites
produce members?" is answerable later — attribution is collectable only at the moment of joining
and cannot be reconstructed afterwards. The `?from=` convention already exists in `ShareDialog`
for embeds (`ShareDialog.tsx:57`).

**4. Post-join prompt.** The moment a person becomes a member — whether by their own click or by
arriving through someone's link — the org page shows a dismissible banner inviting them to bring
someone. This is the one motivation lever in the feature that is structural rather than copy: it
acts at the moment of highest intent, the same reasoning that makes auto-join beat a second tap.

## Risks / Non-Goals

### Risks

- **The allowlist omission is a recurring class, not a one-off.** P458 (`/point/`, `/chat`), P486
  (`/create`), and P698 (`/letter`) each shipped or nearly shipped with the same silent fallback.
  *Mitigation:* follow P458's precedent — a regression test that reads `AuthCallbackPage` source and
  asserts the prefix is present (`e2e/integration/p458-auth-callback-position.spec.ts:45`).
- **Auto-join completes a terms acceptance as a side effect of a redirect.** *Mitigation:* auto-join
  only when the user reached auth from the join page's Accept action via an explicit action param —
  never from a bare `/org` redirect. The membership row remains the acceptance record and the
  server stamps `terms_version`, so the accepted version cannot drift from the client constant.
- **Widening the allowlist admits every `/org/*` path as a post-auth destination.** *Mitigation:*
  verify no `/org` route performs a mutation on load; they are public read pages.
- **The link ships and nobody presses Invite.** *Mitigation:* the post-join prompt supplies a
  timing-based trigger rather than relying on copy alone; `/verify` walks the journey. Note
  honestly: the dialog copy is an UNTESTED nudge, and the attribution column exists precisely so
  this risk becomes measurable instead of arguable.
- **`?from=` is user-controlled input written to the database.** Anyone can hand-edit the parameter
  and forge who invited them, or supply junk. Harm is low while nothing is displayed, but the
  column must not become a write-anything field. *Mitigation:* the join RPC validates the value
  resolves to an existing profile and stores NULL otherwise; never echo the raw value back into the
  page. Treat display of this column as a separate decision with its own review — see Non-Goals.

### Non-Goals

- Do NOT add an `org_invites` table, tokens, expiry, or revocation.
- Do NOT **display** attribution anywhere — not in the roster, not on a profile, not in a count.
  The column is written and never read by the UI. Showing who recruited whom inside a practice
  community is a privacy decision about people, and it gets its own spec and its own review.
- Do NOT make the link depend on `?from=` — a link without it must join exactly as well.
- Do NOT add an email field to the join form — the redirect already carries the intent, and an
  inline email creates a half-registered state to persist and expire.
- Do NOT change who may join, or add organizer approval — membership stays open.
- Do NOT change the Clarity Organization Terms, their versioning, or the certificate frame.
- Do NOT touch `clarity_sessions` join authorization (P1053) — unrelated meaning of "join".
- Do NOT add an embed-code section to the org share dialog.
- Do NOT alter the destination of any existing post-auth redirect.

### Alternatives Considered

- **Tokenized per-invite links.** A token invite already exists for bilateral agreements (P488),
  where it is correct: that invite is addressed to one known email and doubles as a magic link.
  An org invite is unaddressed and one-to-many. A token would add expired / revoked / used-up /
  wrong-org states while `/org/:slug/join` remains publicly reachable and search-indexable
  (`org-join-page.tsx:111` renders a public `SEO` tag) — gating a door in a glass wall. Revisit the
  day membership becomes invite-only.
- **Copy link inside the "Manage membership" dropdown.** Rejected on discoverability.
- **Second tap on Accept after returning from signup.** Rejected — it drops people at the moment of
  highest intent, and the events flow already proves the auto-complete pattern.

## Done-When

- [x] A member can copy the invite link from their org page without leaving the organization
- [x] The copied link opens the org page for a signed-out visitor (session revision — previously
      opened the join page directly; see Solution point 1), who sees About/Members context and can
      reach the join page via the same "Join as member" CTA a stranger always sees, attribution
      carried through
- [x] On a phone, the native share sheet offers the link to WhatsApp / Messages —
      **founder-accepted 2026-08-17, not yet manually verified**: `navigator.share` is not
      exercisable headless; the code path mirrors the existing story/point/profile ShareDialog
      behavior verbatim (unmodified this session). Founder will do the phone check after this
      ships. If it fails, this is a `/fix`, not a re-open of this spec's design.
- [x] A signed-out visitor who taps "Accept terms & join", registers, and returns is a member —
      lands on the org page with the join confirmation, no second tap —
      **founder-accepted 2026-08-17**: the automated round-trip test cannot run because of a
      known, root-caused test-infrastructure gap (P1086 — `AuthCallbackPage` vs. admin-generated
      magic links, not a real bug in this flow's code). The founder independently verified real
      self-service signup works end to end this session. Re-run
      `e2e/p1076-org-invite-link.spec.ts` "auto-join: ..." once P1086 is fixed to close this out
      with automated evidence.
- [x] An already-signed-in visitor's flow is unchanged: one tap, joins
- [x] Someone who signs up from any other entry point lands where they did before — `/org` is a
      new allowlist entry, no existing prefix changed; full p1010 regression suite (18 tests) and
      the full unit suite (2784 tests) pass unchanged
- [x] A regression test asserts `/org` is present in `ALLOWED_REDIRECT_PREFIXES`
- [x] Opening the invite link as an existing member shows a sane state, not an error
- [x] A link carrying `?from=` and a link without it both join identically
- [x] Attribution is recorded on join and appears nowhere in the interface — also column-gated at
      the DB level (anon/authenticated denied `SELECT invited_by` directly), stricter than the
      spec's own bar
- [x] A forged or nonsense `?from=` value stores NULL — never the raw string
- [x] The post-join prompt appears once for a new member and can be dismissed
- [x] The share dialog is usable at 320px and 375px without rebuilding it — verified
- [x] The journey is screenshotted at 375px, 320px, and desktop, and reviewed against
      `.claude/rules/visual-qa.md` by a separate agent that sees only the screenshots — two
      blind passes; the first surfaced two false positives (mid-animation screenshot timing,
      confirmed and dismissed after recapturing with the transition settled) and one real
      defect (link-box text clipping at 320/375px), which is fixed and DOM-verified
      (`scrollHeight <= clientHeight` at both widths, was 144px vs 96px clientHeight before)

## Acceptance Criteria

- [x] AC-1: A member can invite someone in three taps or fewer from the org page
- [x] AC-2: A person with no account can go from receiving the link to appearing in the member
      roster without assistance — **founder-accepted 2026-08-17**, see the auto-join Done-When
      item above (P1086 blocks automated proof, not the flow itself)
- [x] AC-3: The invite dialog is visually the same surface as sharing a profile — same `ShareDialog`
      component and new `'org'` type case reuse the identical markup; confirmed by blind visual-QA
      ("reads as a polished, reused component") once screenshots were captured post-animation
- [x] AC-4: No existing post-auth redirect changes its destination
- [x] AC-5: Whether invites produced members is answerable from the data, without any of it being
      visible to members

## UX Notes

States the design must cover:

| State | What the person sees |
|---|---|
| Member on org page | Invite entry point |
| Stranger on org page | "Join as member" (unchanged) |
| Signed-out on join page | Terms readable; Accept triggers auth — routes to signup by default (session revision), not login; a "switch to login" toggle exists for the rare case they already have an account |
| Returning from auth | Already joined + confirmation |
| Freshly joined (either path) | Dismissible post-join prompt to bring someone |
| Existing member opens invite link | Recognised as already in — routed to the org page, not an error |

**Placement resolved by `/ascii-flows` (30 variants scored):** Invite becomes a primary-blue button
in the org page header beside "Manage membership". This costs nothing under P955 — a member never
sees "Join as member", and "Manage membership" is already `variant="outline"`
(`org-header.tsx:113`), so a member's header currently has no primary-styled button at all. A
stranger's view is unchanged.

**Named honestly:** inside this spec's Non-Goals, placement and copy are the only levers available;
the exploration found no behavioural mechanism beyond the post-join timing. The attribution column
exists so the next iteration can be driven by what actually happened rather than by another guess.

## UI Contract

| Element | Value | Context |
|---------|-------|---------|
| Dialog title | "Invite new members" — **founder-approved** (`/dev` session, 2026-08-13) | ShareDialog for `type: 'org'` |
| Dialog body | Link + copy + Share only. No social-proof or motivation line — the reader is already a member | ShareDialog |
| Invite button label | "Invite" — **founder-approved** | Org page header, primary blue |
| Native-share sentence | "I would like to invite you to {org.name}." — **founder-approved**. Deliberately interpolates only `org.name`, nothing from the About blurb or other org-specific copy, so it keeps working once a second org exists | `description` passed to native share |
| Join-page social proof | `[FOUNDER DECISION]` — still open, not implemented this pass. No Done-When/AC item depends on it | `/org/:slug/join`, above the certificate |
| Post-join prompt | "Welcome! Know someone who might want to join too?" — **founder-approved** | Dismissible banner on org page |
| Join confirmation | "You've joined {org.name}" (existing, `org-join-page.tsx:76`) | After auto-join |
| Copied state | Green tick, 2s (existing ShareDialog behaviour) | Copy button |
