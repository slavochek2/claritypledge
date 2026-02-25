---
status: done
completed_at: '2026-02-25'
type: story
rank: 8.0
milestone: M2
tags: [clarity-partner, agreement, co-founders, accountability, relationships]
prepped_date: '2026-02-24'
delivery_stage: decompose-review
depends_on: [p424]
reviews:
  ux: '2026-02-24'
  architect: '2026-02-24'
  alignment: null
created_date: 2026-02-24
---

# P422: Clarity Partner Agreement

## Problem Statement

**Current state:** Co-founder relationships — and other high-stakes professional partnerships — degrade silently. Communication quality drops, trust erodes, and the relationship becomes transactional. By the time deterioration is visible, the damage is often irreversible. There is no structural mechanism to maintain communication health proactively, and no agreed-upon fallback when things get tense.

**Pain points:**

- Relationship degradation is gradual and easy to rationalize away until the moment it becomes terminal
- When conflict surfaces, neither party has a pre-committed framework to fall back on — the conversation about how to have the conversation is itself the hardest conversation
- Goodwill and verbal commitments to "communicate better" are unmeasured and fade under pressure
- There is no social or structural accountability for whether two partners are maintaining the practices they committed to
- Current ClarityPledge has no mechanism for bilateral, ongoing relationship commitments — only ad-hoc session participation

**Who's affected:**

- **Co-founders** — the primary target: high-stakes, long-duration, emotionally loaded partnerships where degradation is common and costly
- **Accountability partners** — professional relationships structured explicitly around mutual challenge and support
- **Close professional collaborators** — e.g. executive + investor, mentor + founder, therapist + client dyads where structure adds safety
- **ClarityPledge as product** — without a compelling reason for returning users to engage regularly, retention suffers

---

## Intention (Why This Matters)

**Strategic importance:** The Clarity Partner Agreement is the first product mechanism that gives ClarityPledge a persistent, recurring reason to exist in a user's life. One-off calibration sessions are valuable but episodic. A bilateral agreement with scheduled sessions, tracked compliance, and visible relationship health turns ClarityPledge into ongoing infrastructure for a relationship.

**Why now (M2):** The filing chat (P419/P420) and /live calibration session are the core mechanics. At M2, the hypothesis to validate is whether users adopt ClarityPledge as a regular relational practice — not just a workshop tool. The Agreement is the primary mechanism for testing that hypothesis.

**Why /live sessions specifically:** /live sessions have enforced structure (paraphrasing, no interruptions), session tracking, and protocol compliance measurement. They are verifiable. A commitment to "communicate better" can't be tracked. A commitment to complete a minimum number of /live sessions per period can be — and the protocol enforcement during those sessions is what makes them genuinely derisking rather than performative check-ins.

**Social mechanism:** Making an agreement public (or semi-public) adds social accountability. Breaking a public commitment has visible cost. The act of signing proactively — during a healthy relationship — is itself a signal of seriousness. Non-acceptance is a signal too.

**Why proactive signing matters:** Asking a partner to sign a communication agreement when the relationship is already degraded is confrontational. Signed during a healthy period, it's an expression of shared commitment. The onboarding path (invite to event or /live session first) ensures the agreement is signed from a position of trust, not desperation.

**Cost of inaction:**
- Users complete a /live session, see the value, and then have no structure prompting them to return
- Co-founder teams adopt ClarityPledge for a workshop and then forget it exists
- The product never graduates from "interesting tool" to "relationship infrastructure"
- Competitors or copying tools with similar mechanics have no differentiation — the Agreement is a product-level commitment that can't be easily cloned without the full /live protocol

---

## Business Requirements

**Must-haves:**

- Any authenticated user can create a Clarity Partner Agreement and invite one other user as the second party
- Agreement creation uses a flexible template text field: pre-suggested contract language covering minimum session length, frequency, response deadline, and optional expiry — but the text is fully editable; parties can exclude, rename, reword, or replace any variable, or add entirely new terms
- Agreement is not active until both parties have accepted
- Agreement creator selects visibility at creation: private (both parties only) or public (anyone can view). "Shared" does not apply. Aligns with P424 visibility model
- Both parties are stored as user references (not just emails)
- Either party can terminate the agreement unilaterally; both parties are notified. No pause in V1
- Agreements are discoverable on user profiles per visibility setting
- Session requests, compliance tracking, and observer role are deferred to P429 and P430

**Success conditions:**

- Two users can establish a bilateral commitment in under 5 minutes
- Session requests are responded to (booked) within the configured deadline in the majority of cases
- Agreements remain active and produce sessions over a multi-week period (not abandoned after first session)
- Users report that having the agreement made it easier to initiate a difficult or routine conversation

**Constraints:**

- V1 is strictly bilateral — no group agreements, no observer role (observer UX deferred to P430)
- V1 does not build a general connections/network model — store user references only, do not create a connections graph
- Visibility model: private / public only (no "shared" — no event context for agreements). Aligns with P424
- Natural onboarding path: the product does not block invitations technically, but design and copy guide toward "experience /live first, then formalize"

---

## User Stories

**As a co-founder creating an agreement:**

- As a co-founder, I want to create a Clarity Partner Agreement with my co-founder and configure our minimum session cadence, so that we have a shared, pre-committed structure for maintaining communication health
- As a co-founder, I want to choose whether our agreement is public or semi-public, so I can decide how much social accountability we want to attach to the commitment
- As a co-founder, I want the agreement to only become active once my partner has explicitly accepted it, so that the commitment is genuinely bilateral and not unilaterally imposed

**As a co-founder under an active agreement:**

- As a co-founder under an active agreement, I want to file a session request to my partner, so I have a formal, tracked way to initiate a /live session when I feel one is overdue
- As a co-founder receiving a session request, I want to respond by booking a /live session, so I can fulfill my commitment without ambiguity about what "responding" means
- As a co-founder, I want completed /live sessions that meet our agreed criteria to automatically count toward our commitment, so compliance tracking requires no administrative overhead
- As a co-founder, I want to see our agreement's compliance history — sessions requested, sessions completed, response times — so I can see whether we're honoring what we committed to
- As a co-founder, I want to be notified when my partner files a session request, so I can respond within the agreed deadline

**As a user viewing someone's public profile:**

- As any user, I want to see whether a person has active Clarity Partner Agreements (if public), so I can assess their commitment to calibrated communication practices
- As a prospective user, I want to see a public agreement between two founders I know, so I understand what ClarityPledge enables and consider creating one myself

**As either party when the relationship changes:**

- As a co-founder, I want to pause or terminate an agreement, so the agreement can evolve with the relationship rather than becoming an artifact of a defunct commitment

---

## Jobs to Be Done

**When co-founders are in a healthy phase and want to protect it:**
I want a way to commit to communication practices before they're needed, so that when things get hard, we already have a structure to fall back on rather than improvising under stress.

**When I notice communication quality is slipping with my partner:**
I want to file a session request, so that there's a formal, non-confrontational way to initiate a conversation without it feeling like an accusation or intervention.

**When I receive a session request:**
I want a clear, expected way to respond, so I can book a /live session without the booking itself feeling like an escalation.

**When I want to demonstrate my commitment to co-founder communication publicly:**
I want an artifact that is visible on my profile, so that investors, co-founders, and collaborators can see I take relationship health seriously.

**When I'm evaluating a potential co-founder or partner:**
I want to see whether they have active agreements and their track record, so I can make a better-informed judgment about how they handle difficult relationships over time.

**When I'm deciding whether to accept a Clarity Partner Agreement:**
I want to understand clearly what I'm committing to and what happens if I don't fulfill it, so I can make an informed, voluntary choice.

---

## Outcomes (Success Metrics)

**Adoption:**
- At least 10 bilateral agreements created and accepted within 60 days of launch
- Agreement acceptance rate ≥ 70% (invited second party accepts within 7 days)

**Engagement / Retention:**
- Agreements that are active for 30+ days produce ≥ 2 completed /live sessions (indicating the mechanism is actually used, not just signed and abandoned)
- Users under an active agreement have ≥ 2x the /live session frequency compared to users without agreements (agreement drives usage, not just tracks it)

**Session request fulfillment:**
- ≥ 60% of session requests are fulfilled (a /live session is completed) within the configured response deadline

**Relationship health signal:**
- Non-acceptance of an agreement invitation is tracked as a product signal — if a meaningful % of invitations are declined, investigate why (friction vs. product-market fit)

**Social / acquisition:**
- Public agreements generate at least 1 inbound inquiry from a non-user per agreement (visible agreement → product advertisement)

**Qualitative:**
- At least 3 users report that the agreement made it easier to initiate a session they would otherwise have avoided

---

## Acceptance Criteria

**Agreement Creation:**
- [ ] Authenticated user can create an agreement by specifying: partner (user reference) and agreement terms via a flexible template text field (pre-suggested language, fully editable)
- [ ] Creator selects visibility: private or public (no "shared" tier for agreements)
- [ ] Invitation is sent to the second party (in-app notification + email fallback)
- [ ] Agreement is in "pending" state until second party accepts
- [ ] If second party declines or does not respond within a configurable window, agreement is marked as declined/expired

**Agreement Activation:**
- [ ] Second party can view full agreement terms before accepting or declining
- [ ] Accepting activates the agreement; declining closes it with no active state
- [ ] Both parties are stored as user references (not ephemeral identifiers)
- [ ] Both parties receive confirmation when the agreement becomes active

**Visibility:**
- [ ] Public agreements are visible on both parties' profiles to any viewer (no auth required for public)
- [ ] Private agreements are visible only to both parties — not to profile visitors
- [ ] Non-parties viewing a public agreement can see: certificate, both names, status. NOT compliance details.

**Lifecycle:**
- [ ] Either party can terminate an agreement unilaterally — no consent from the other party required; both parties are notified after termination; agreement is archived not deleted
- [ ] Terminated agreements remain viewable as history by both parties
- [ ] No pause concept in V1

**Constraints validation:**
- [ ] V1 is strictly bilateral — no group agreements, no observer role (deferred to P430)
- [ ] No manual override for session fulfillment attribution exists in V1 UI
- [ ] Invitation flow design and copy guides toward "experience /live first, then formalize" — no technical block, but UX should make the path clear

---

## Decisions Log

All resolved before UX:

1. **Fulfillment threshold:** A session counts if at least one complete paraphrase round occurred (listener estimate + speaker rating both submitted). Mirrors calibration counting logic. Sessions that start but never complete a paraphrase exchange do not count.
2. **Lifecycle:** Terminate only in V1. No pause. If users ask for pause, add it then.
3. **Non-acceptance:** Inviting party is notified of decline. Decline triggers a prompt toward scheduling a /live session first.
4. **Privacy model:** Private / Public only — "Shared" does not apply (no event context for agreements). Aligned with P424. Private = both parties + confirmed observers only.
5. **Deadline breach:** Notification to both parties + "late" state on the open request. Observers also notified.
6. **Observers deferred to P430.** P422 ships sign + view only. Observer invitation, confirmation flow, notifications, and breach visibility are P430's scope.
7. **Termination is unilateral and immediate.** Either party can terminate without consent from the other. The other party is notified after. Bilateral agreements cannot require mutual exit consent — that would trap people. Termination IS the communication.
8. **Violation / breach status:** No auto-breach label on the agreement. Terms are free-text — the app cannot know what constitutes a violation. Instead: "late" badges accumulate visibly on open requests (P429). The agreement stays "active" until someone explicitly terminates. The friction of terminating is itself meaningful.
9. **Email notifications:** Extend existing Mailgun infrastructure (built for event cancellations). No new notification system needed — add agreement-specific templates alongside existing event templates.
10. **Session tracking readiness (for P429):** `clarity_sessions` already stores `creator_profile_id` + `joiner_profile_id` (UUID FKs). `clarity_demo_rounds` stores `speaker_rating` + `listener_self_rating` — both submitted = completed round. Query to detect "users A+B completed a round together" is straightforward. New tables needed in P429: `agreement_session_requests`, `agreement_fulfillments`.
11. **Certificate text:** Bilaterally adapted from v3 pledge. "I...commit to everyone" → "We...commit to each other." "MY PROMISE" → "OUR PROMISE." YOUR RIGHT reworded for bilateral voice. Same tagline "We all crave being understood."
12. **Terms section label:** "Our terms:" — these are the protocol (scope, frequency, format, channel, violation handling), not additions to the pledge.
13. **Default terms template:** Full 6-variable template covering scope, session duration (15 min), frequency, first /live commitment (within 30 days), response time (14 days), communication channel, violation protocol, auto-renewal. Max 1000 chars. Bracketed variables bolded to signal editability. We learn from what users keep, change, or add over time.
14. **Auto-renewal:** Default is auto-renewing until either party terminates. No expiry date in template by default.
15. **Co-sign = registration (REVISED → Option A):** Unauthenticated partners are redirected to `/signup?returnTo=/agreements/[id]/accept&token=[token]`. After magic-link auth, the return URL lands them on the acceptance page to co-sign as an authenticated user. Profile creation stays exclusively in `AuthCallbackPage.tsx`. (Original inline approach superseded by architecture decision — see Architecture Risk 1.)
16. **Post-signing /live CTA:** Non-blocking text link on pending page and celebration dialog. Pre-filled Google Calendar URL. Optional, not a gate.
17. **"By creating, you agree to Terms":** Removed from creation form — redundant for authenticated users; covered by inline account creation for new partners.

---

## Next Steps

This is a UI feature with backend persistence and automation logic.

1. ✅ UX complete — agreement creation, invitation/acceptance, pending state, active certificate, profile display
2. Run `/architect features/p422_clarity_partner_agreement.md` — data model (`clarity_agreements` table), visibility logic, invitation token system, email notifications, inline registration on acceptance
3. Run `/generate-tests features/p422_clarity_partner_agreement.md` — test coverage including compliance automation and visibility rules
4. Run `/dev features/p422_clarity_partner_agreement.md` — implement

**Related features:**
- P419 / P420 (Filing Chat) — users need stories in the system before /live sessions are meaningful
- P421 (Pre-Session Safety Check) — runs before /live sessions that fulfill agreement requests
- P429 (Session Requests + Compliance) — extends P422 with request filing, fulfillment attribution, and health view
- P430 (Observers) — extends P422 with observer invitation, confirmation, and breach notifications
- P431 (Connections Model) — agreement user references will seed the social graph

---

## UX Design

### Overview

The Clarity Partner Agreement UX is built on two core ideas: (1) the agreement IS the Clarity Pledge adapted bilaterally — same certificate frame, same pledge text structure, but reworded from "I commit to everyone" to "We commit to each other"; (2) signing feels like a ceremony, not a form — the document is the interface. All screens inherit the double-border certificate frame, Playfair Display serif for commitment text, cream (#FDFBF7) background, navy (#002B5C), and blue (#0044CC) from the existing pledge design system.

The visibility toggle uses exactly the same three-option radio group as create-story-page: Private | Shared | Public, same icon/label/tooltip, same selected state (blue border + blue-50 background + blue-700 text), same unselected state (border-input + muted text). For agreements, only Private and Public are wired — Shared is present in the component but disabled with a tooltip explaining it does not apply to bilateral agreements.

---

### 1. User Flows

#### 1.1 Creation Flow (Authenticated User)

```
Profile page → "Partner Agreements" section → [+ New Agreement] button
  │
  ▼
Create Agreement page (/agreements/new)
  │  Fill: partner email (+ live user lookup)
  │  Fill: terms textarea (pre-filled template, editable)
  │  Set:  visibility toggle (Private default)
  │
  ├─ [Seal & Invite Partner ✦] (submit)
  │    │
  │    ├─ Partner is existing user → agreement created, in-app notification sent, email sent
  │    │    ▼
  │    │  Pending state page for creator (/agreements/[id])
  │    │
  │    └─ Partner email is new (not registered) → agreement created in pending state,
  │         invitation email sent with unique acceptance link
  │         ▼
  │       Pending state page for creator (/agreements/[id])
  │
  └─ Validation errors → inline error states, no navigation
```

Entry point: Profile page → Partner Agreements section → `[+ New Agreement]` button. Requires authenticated session. Non-authenticated users are redirected to /signup with return URL.

#### 1.2 Invitation / Acceptance Flow (Partner)

```
Email invitation received
  │
  ▼
Acceptance page (/agreements/[id]/accept)
  │  Shows: full agreement text (pledge text + terms)
  │  Shows: creator's name, avatar, signed date
  │  Shows: partner name input (if new user) or name from profile
  │
  ├─ [I Accept & Co-Sign ✦] →
  │    │
  │    ├─ Existing user: agreement activated immediately
  │    │    ▼
  │    │  Celebration dialog overlay
  │    │    ▼
  │    │  Agreement certificate view (/agreements/[id])
  │    │
  │    └─ New user: inline account creation directly on acceptance page
  │         (name + email + password fields appear below the certificate frame,
  │          same form as sign-pledge-page registration — no redirect)
  │         Terms of service are accepted as part of account creation, not separately.
  │         → on account creation: agreement activated + celebration dialog
  │
  └─ [Decline] →
       ▼
     Decline confirmation: "You've declined this agreement invitation.
     No action needed." (static, no account required)
     Creator receives email notification of decline.
```

Partner receives email with a direct link to /agreements/[id]/accept — no navigation needed. If the link has expired (>7 days) or the agreement was already accepted/declined, the page shows an appropriate static message.

#### 1.3 Viewing an Active Agreement

```
Profile page → Partner Agreements section → [View Agreement]
  │
  ▼
/agreements/[id]

  ├─ Both parties (any auth state): full certificate view
  │    Signed: [Name A] ✓     [Name B] ✓
  │    Status: ACTIVE · Sealed [date]
  │
  └─ Non-party authenticated user (public agreement only):
       Same certificate, read-only, no actions shown
```

#### 1.4 Decline Flow

The decline path is intentionally minimal:

1. Partner opens acceptance page → clicks [Decline]
2. Confirmation dialog: "Are you sure you want to decline? The inviting party will be notified. No agreement will be created."
3. [Cancel] returns to acceptance page. [Confirm Decline] submits.
4. Agreement is discarded (never created in active state, removed from pending).
5. Creator receives email: "[Partner Name] declined your Clarity Partner Agreement invitation. Consider inviting them to a /live session first."
6. Decliner sees: static page "You've declined this invitation. No account or further action is needed."
7. Non-registered decliner: no account is created.

#### 1.5 Pending State (Creator Waiting)

Creator sees the agreement page at /agreements/[id] in pending state:
- Certificate frame rendered with partner slot showing "Awaiting [partner first name]... ⌛"
- Status banner: "PENDING CO-SIGNATURE"
- Shareable URL shown with [Copy Link] action
- Copy reads: "Share this link with [Partner Name] to invite them to co-sign."
- If 7 days pass with no acceptance, an expiry banner appears: "This invitation has expired. [Resend Invitation]"

---

### 2. Screen Designs

#### 2.1 Create Agreement Page (`/agreements/new`)

**Layout:** Single-column, max-width 640px, centered. Same container as sign-pledge-page (`container mx-auto px-4 py-8 md:py-12 max-w-3xl`).

**Page header (outside certificate frame):**
- `h1`: "Create a Partner Agreement" — 3xl/4xl, font-serif, font-bold
- Subtext: "Formalize your commitment to calibrated communication with one specific person." — text-muted-foreground

**Certificate frame (same visual treatment as sign-pledge-form.tsx):**
- Outer border: 8px solid #002B5C
- Inner outline: 2px solid #002B5C, outlineOffset -12px
- Background: #FDFBF7
- Shadow: 0 20px 60px -15px rgba(0,0,0,0.3)
- Padding: 16px mobile / 48px desktop

Inside the frame, top-to-bottom:

**Document header (matching pledge form header):**
- "Clarity Partner Agreement" — Playfair Display, 2xl/4xl, centered
- "A Bilateral Commitment" — 10px/12px, uppercase, letter-spacing 0.2em, #1A1A1A/60
- Bottom border: 2px solid #002B5C, mb-4/6

**Pledge text section (bilaterally adapted pledge text — NOT a reuse of the existing components verbatim):**

The certificate opens with the v3 pledge tagline and then uses bilaterally adapted wording:

```
We all crave being understood. Let's commit to listen.

We, [Creator Full Name] and [Partner Full Name — gray italic placeholder until accepted],
hereby commit to each other:

YOUR RIGHT
When we speak, if either of us needs to know the other truly understood them,
we can ask to have it mirrored back.

OUR PROMISE
We will explain back what we think the other meant—withholding judgment or
criticism—so they can confirm or correct us. We won't pretend to understand
if we don't.

THE EXCEPTION
If either of us can't keep this promise in the moment, we'll explain why.
```

Creator name: pre-filled from profile, rendered as bold serif (not an input). If no name is set, show inline error: "Please add your name in Settings before creating an agreement."

Partner name: shown as gray italic "[Partner Name]" placeholder in the opening line at creation time. Populated with the partner's actual name once they accept.

**"Specifically with:" subsection (inside the frame, after the pledge text):**

Separated by a thin horizontal rule (border-[#1A1A1A]/20). Heading: "Specifically with:" — text-sm, #1A1A1A/70.

Partner email input:
- Underline-only input (border-0 border-b-2 border-[#1A1A1A] rounded-none bg-transparent focus-visible:ring-0 focus-visible:border-[#0044CC] px-0)
- Placeholder: "partner@email.com"
- On valid email entry after 400ms debounce: live user lookup
  - Found: show avatar + name inline below the input (green check icon, avatar circle, "Found: [Full Name]")
  - Not found: show "New user — they'll be invited to register when they accept." in muted text
  - Loading: pulsing skeleton row

**"Our terms:" subsection (inside the frame):**

Heading: "Our terms:" — text-sm, #1A1A1A/70.

These are not additions to the pledge — they define the protocol: when the pledge applies, how often, in what format, how violations are handled. The creator fills this; both parties commit to it on signing.

Terms textarea:
- Pre-filled default template (fully editable — users delete what doesn't fit, keep what does; we learn from what they change over time):

```
This agreement applies to: [all our conversations / our /live sessions only / our business meetings / our product decisions].

We commit to at least one /live session of [15 minutes] per [month] as our regular moment to surface issues and maintain shared clarity.

Our first commitment is to do a /live session together within [30 days].

When either of us requests a session, the other will respond within [14 days]. Requests are made via: [email / direct message / WhatsApp].

If either of us can't honor the pledge in the moment, we will [say so and reschedule / explain why in writing].

This agreement renews automatically and remains valid until either party terminates it.
```

- Bracketed `[values]` are shown in bold to signal "edit this variable"
- Underline-only style: border-0 border-b-2 border-[#1A1A1A] rounded-none bg-transparent focus-visible:ring-0 focus-visible:border-[#0044CC] resize-none
- Min rows: 6, auto-expands
- Character count: shown bottom-right, max 1000 characters (increased from 500 to accommodate the full template)

**Bottom section of frame (separated by 2px solid #002B5C border-top, matching pledge form):**

No additional fields needed inside the frame. The signing uses profile names.

**Outside the frame:**

Visibility selector — exact pattern from create-story-page.tsx:
```
fieldset
  legend: "Visibility"
  radiogroup (flex gap-2):
    [🔒 Private]  [👥 Shared — disabled]  [🌐 Public]
```
- Private and Public are selectable. Private is the default.
- Shared button is visually present but disabled (opacity-50, cursor-not-allowed) with tooltip: "Shared visibility does not apply to bilateral agreements."
- Tooltip text for Private: "Only you and your partner can view this agreement."
- Tooltip text for Public: "Anyone can view this agreement on your public profile."

Submit button (matching sign-pledge-form.tsx):
```
[✦ Seal & Invite Partner]
```
- Full width, bg-[#002B5C] hover:bg-[#001f45], text-white, font-semibold, text-base md:text-lg, py-4 md:py-6
- Loading state: "Sealing..." with pulse animation

**Error states inside the frame:**
- Partner email invalid: "Please enter a valid email address." — red, below the input
- Terms empty: "Please describe what you're committing to." — red, below textarea
- General API error: red box below the form, matching sign-pledge-form.tsx pattern (p-3 bg-red-50 border border-red-200 rounded-md)

---

#### 2.2 Pending Agreement Page (`/agreements/[id]` — pending state)

**Shown to:** Creator (and anyone with the link who is authenticated, if visibility is public).

**Layout:** Same certificate frame, max-width 640px centered.

**Status banner (above the certificate frame):**
```
┌────────────────────────────────────────────────────────┐
│  ⌛  PENDING CO-SIGNATURE                              │
│  Waiting for [Partner First Name] to accept            │
└────────────────────────────────────────────────────────┘
```
- Background: amber-50, border: amber-200, text: amber-800
- Icon: Clock icon from lucide-react

**Inside the certificate frame:**

Full pledge text (rendered exactly as on the active certificate), then below the pledge body:

```
──────────────────────────────────────────
Specifically with:    [Partner Name or email]

I additionally commit to:
  [Terms text]
──────────────────────────────────────────

Signed:
[Creator Avatar] [Creator Full Name] ✓         [Partner Avatar placeholder] Awaiting [First Name]... ⌛
[Date signed by creator]                        (grayed out, dashed underline)
```

Creator signature: avatar circle + name + green checkmark. Same avatar style as existing PersonAvatar component.
Partner slot: gray avatar placeholder (initials if name known, "?" if email-only) + name + clock icon + "(Awaiting co-signature)" in muted italic text.

**Below the frame:**

```
Share this link to invite [Partner Name]:
claritypledge.com/agreements/[id]  [Copy Link]
```
- Shareable URL shown in a muted input-like display (read-only, click-to-copy)
- [Copy Link] button: outline variant, small
- Success state: button changes to "Copied!" with checkmark for 2 seconds

**First session CTA (below the share row):**
```
✦ Ready to experience what you just committed to?
  [Schedule your first /live session →]
```
- Subtle, not prominent — muted text + text link (not a button)
- Link: pre-filled Google Calendar event URL with title "Clarity /live session — [Creator] & [Partner]", duration 30 min
- This is the post-signing /live nudge. No gate — it's optional.

**Expiry state (after 7 days, no acceptance):**

Banner above the certificate frame changes to red:
```
┌────────────────────────────────────────────────────────┐
│  ⚠  This invitation has expired (7 days)               │
│  [Resend Invitation]                                    │
└────────────────────────────────────────────────────────┘
```
[Resend Invitation] resets the expiry clock and sends a fresh email/notification.

---

#### 2.3 Partner Acceptance Page (`/agreements/[id]/accept`)

**Shown to:** Anyone who has the acceptance link (authenticated or not). Non-authenticated users must authenticate first — but the authentication redirect preserves the return URL so they land back here after signing in.

**Unauthenticated flow note:** If the partner is not logged in, show a pre-acceptance banner: "To co-sign this agreement, create a free account or log in." — with [Create Account] and [Log In] buttons. The agreement text is fully visible before authentication so the partner can read what they are agreeing to before committing to sign up.

**Page header (outside frame):**
- "[Creator First Name] invites you to a Clarity Partner Agreement" — 2xl/3xl serif, centered
- "[Creator Name] has committed. Your signature makes it bilateral." — muted, centered

**Inside the certificate frame:**

Same pledge text structure as 2.1. Creator name is locked (shown as bold serif, not editable). Partner name field:

```
Our terms:
  [terms text — read-only, shown as styled prose, not editable]

Signed:
[Creator Avatar] [Creator Name] ✓    ___________________
[Date creator signed]                Your signature
                                     (your name from profile, or input if new user)
```

Partner name: if authenticated, pre-filled from profile (read-only, same as creator). If new user completing registration, this is editable once (they are entering their display name for their new account).

**Two action buttons (outside frame, side by side on desktop, stacked on mobile):**

```
[Decline]                    [I Accept & Co-Sign ✦]
```

- Decline: ghost/outline variant, smaller weight, left-aligned on desktop
- Accept: bg-[#002B5C] hover:bg-[#001f45], full treatment matching sign-pledge-form submit button
- Minimum touch target: 44px height on both
- Loading state for Accept: "Co-signing..." with pulse
- Decline triggers a confirmation dialog before proceeding (see 1.4 above)

**Already accepted state:** If the partner navigates back to this URL after accepting, show the active agreement view (2.4) instead.

**Already declined state:** Show static: "You declined this agreement. This page is no longer active."

**Expired invitation state:** "This invitation has expired. Please ask [Creator Name] to resend the invitation."

---

#### 2.4a Declined Agreement Page (`/agreements/[id]` — declined state)

**Shown to:** Creator only (the person who sent the invitation). Accessible at the same URL.

**Status banner (above the certificate frame):**
```
┌────────────────────────────────────────────────────────┐
│  ✕  DECLINED                                           │
│  [Partner Name] declined this invitation on [date].    │
└────────────────────────────────────────────────────────┘
```
- Background: red-50, border: red-200, text: red-800

**Inside the certificate frame:**

Full certificate rendered in a muted/faded state (opacity-60, grayscale filter). Both the pledge text and terms are visible — the creator can see exactly what they proposed. Partner signature slot shows "—" (em dash), not a clock or checkmark.

**Below the frame:**
```
[+ Create New Agreement]
```
- Outline variant, navigates to /agreements/new
- Optional secondary copy: "Consider inviting [Partner Name] to a /live session first."

**Not shown to:** The partner (they see the `/declined` static page). Not shown to any visitor.

---

#### 2.4 Active Agreement Certificate Page (`/agreements/[id]` — active state)

**Shown to:** Both parties (always), public visitors if visibility = public, private = parties only.

**Owner/party banner (above frame, shown to either party):**
```
┌────────────────────────────────────────────────────────┐
│  Your Agreement  ·  Active since [date]          [···] │
└────────────────────────────────────────────────────────┘
```
- [···] is a dropdown menu: "Copy Link", "Terminate Agreement" (requires confirmation)
- Background: blue-50, border: blue-200

**Inside the certificate frame:**

Header section:
```
CLARITY PARTNER AGREEMENT                A-[shortcode]
A Bilateral Commitment      Sealed [date] · [visibility badge]
```

Full pledge text (same rendering as creation form, read-only).

Below pledge text, "Specifically with:" and terms, both read-only styled prose.

Signature section at the bottom of the frame:
```
──────────────────────────────────────────────────
[Creator Avatar] [Creator Name] ✓    [Partner Avatar] [Partner Name] ✓
Signed [date]                        Signed [date]
```

Both signatures shown as green checkmarks. Playfair Display for names.

**Below the frame:**

Status badge: "ACTIVE" — green, pill shape, same muted-badge style as existing VisibilityBadge component.

Shareable URL (if public):
```
claritypledge.com/agreements/[id]  [Copy Link]
```

**Terminate Agreement:**
Accessible from the [···] menu. Clicking shows a confirmation dialog:
```
Are you sure you want to terminate this agreement?
Both you and [Partner Name] will be notified.
The agreement will be archived and no longer active.

[Cancel]    [Terminate Agreement]
```
Terminate button: red destructive variant. After termination, the page shows a terminated state banner (red, "TERMINATED · [date]") and both parties are emailed.

---

#### 2.5 Celebration Dialog (Post Co-Signature)

Shown as a dialog overlay immediately after co-signature, for both parties. Creator sees it on next page load if they are viewing the pending agreement when it gets accepted (real-time or on refresh). Partner sees it immediately after accepting.

```
╔══════════════════════════════════════════════════════╗
║              ✦  Agreement Sealed  ✦                  ║
║         [Creator First Name] & [Partner First Name]  ║
║  ╔════════════════════════════════════════════════╗  ║
║  ║  CLARITY PARTNER AGREEMENT · A-[shortcode]    ║  ║
║  ║  Sealed: [date]  ·  [Visibility badge]        ║  ║
║  ║  [Creator Avatar] ✓     [Partner Avatar] ✓    ║  ║
║  ╚════════════════════════════════════════════════╝  ║
║                                                      ║
║           [View Agreement]                           ║
╚══════════════════════════════════════════════════════╝
```

- Dialog uses DialogContent from shadcn/ui, same as pledge-page.tsx welcome dialog
- Title: "✦ Agreement Sealed ✦" — 2xl, font-serif, text-center
- Mini-certificate inside the dialog: smaller version of the frame, navy border, cream bg
- [View Agreement]: primary button, navigates to /agreements/[id]
- Dialog closes on [View Agreement] click or outside-click (but not on Escape accidentally — the ✦ moment should feel intentional)
- Below [View Agreement]: secondary text link "Schedule your first /live session →" (same pre-filled Google Calendar URL as pending page). Muted, smaller. Optional — not required to close the dialog.

---

#### 2.6 Decline Landing Page (`/agreements/[id]/declined`)

Static, no authentication required, no actions. Accessible to the decliner after declining.

```
[ClarityPledge wordmark — small, centered]

You've declined this agreement invitation.

No further action is needed. No account has been created.

[claritypledge.com — subtle link home]
```

Minimal. Cream background, #1A1A1A text. No certificate frame (there is no agreement to show). Centered content, max-width 400px.

---

#### 2.7 Profile Display — Partner Agreements Section

Location: User's profile page (`/p/[slug]`), below the existing Pledges section. Visible to profile viewers per visibility rules (public agreements shown to all, private only shown to parties).

**Section header:**
```
Partner Agreements
```
- "Partner Agreements" — h2 equivalent, font-bold
- No count shown — visibility badge on each row conveys what's public vs. private

**Agreement row (active — all viewers who can see it):**
```
┌─────────────────────────────────────────────────────────────┐
│  [●●] [Name A] & [Name B]  ·  Active [N] months  [PUBLIC]  │
│       Sealed [Month Year]                [View Agreement →] │
└─────────────────────────────────────────────────────────────┘
```
- Border: 1px solid border-input, rounded-lg
- Paired-avatar display: two overlapping PersonAvatar components (-space-x-2, 32px each)
- Visibility badge: [PUBLIC] or [PRIVATE] — muted pill, same VisibilityBadge component
- "Active N months" computed from sealed date (singular "month" when N=1)
- [View Agreement →]: text link (text-[#0044CC], underline on hover)
- Row itself is not clickable — only the explicit link

**What each viewer sees:**

| Viewer | Sees |
|--------|------|
| Profile owner (own profile) | All active + pending + terminated (own) |
| Party to a private agreement (viewing partner's profile) | That private agreement + any public agreements on the profile |
| Anonymous / non-party visitor | Public active agreements only |

**Empty state — own profile, no agreements yet:**
```
Partner Agreements

  You haven't created any Partner Agreements yet.
  Formalize your commitment to calibrated communication
  with a co-founder, accountability partner, or collaborator.

  [+ New Agreement]
```

**Empty state — visitor, no public agreements:**
Section hidden entirely. Visitor does not know whether private agreements exist.

**[+ New Agreement] button:**
- Shown to profile owner only (never to visitors)
- Outline variant, small, "+" icon, navigates to /agreements/new
- Position: top-right of section header, or below empty state copy

**Pending rows (own profile only, never to visitors):**
```
┌─────────────────────────────────────────────────────────────┐
│  ⌛  [Your Name] & [partner@email.com]  ·  Pending          │
│      Invited [N days] ago               [View →]            │
└─────────────────────────────────────────────────────────────┘
```
- Background: amber-50/30, border: amber-200/50

**Terminated rows (own profile only, never to visitors):**
```
┌─────────────────────────────────────────────────────────────┐
│  [●●] [Name A] & [Name B]  ·  Terminated [Month Year]      │
│       Active [N] months                  [View →]           │
└─────────────────────────────────────────────────────────────┘
```
- Background: gray-50, border: gray-200, text: gray-500 (subdued)
- "Active N months" = duration from sealed to terminated date
- Shown below active rows, in a visually de-emphasized style
- Hidden from all visitors (even if the agreement was previously public)

**Declined agreements:** Hidden from profile list entirely. Declined = no agreement was ever formed.

---

### 3. Edge Cases

#### 3.1 Partner Email Already Has an Agreement with Creator

When creator enters an email and live lookup finds they already have an active agreement with that person:
- Inline warning below the email input: "You already have an active agreement with [Name]. View it here." (link to existing agreement)
- The submit button remains disabled until a different email is entered.

#### 3.2 Creator Invites Themselves

If creator enters their own email:
- Immediate inline error: "You cannot create an agreement with yourself."
- Submit remains disabled.

#### 3.3 Partner Accepts After Expiry

The acceptance URL is time-limited (7 days). If opened after expiry:
- Static page: "This invitation has expired. Please ask [Creator Name] to resend the invitation."
- No acceptance flow shown, no form.
- If creator has already resent, the old URL still shows expired — only the latest invitation link is valid.

#### 3.4 Partner Attempts to Accept When Already Accepted

If the partner navigates to /agreements/[id]/accept when the agreement is already active:
- Redirect to /agreements/[id] (active view).

#### 3.5 Non-Authenticated User Visiting a Private Agreement

- If the agreement is private and the viewer is not a party: "This agreement is private." static message, no certificate content shown.
- If the viewer is not authenticated: prompt to log in ("Log in to view this agreement"), redirect back after auth.

#### 3.6 Terms Textarea Empty or Whitespace Only

- Inline validation on submit: "Please describe what you're committing to."
- Submit is not prevented on typing (only on submit attempt) — no live validation that might interrupt the writing flow.

#### 3.7 Creator Has No Name Set on Profile

- On page load of /agreements/new: inline error state shown in the certificate frame where the name would appear: "Add your name in Settings to continue." with a link to /settings.
- The form cannot be submitted without a name on the creator's profile.

#### 3.8 Network Error During Seal

- Form submit fails silently → red error box below the submit button: "Something went wrong. Please check your connection and try again."
- Form content is preserved (no reset on error).
- No duplicate submission protection needed at UX level — this is backend responsibility.

#### 3.9 Agreement Terminated While Viewing

If a party terminates while the other is viewing the agreement certificate:
- On next page load: the certificate shows a terminated state banner (red, "TERMINATED · [date]").
- No real-time update needed in V1 (page reload shows current state).

#### 3.10 Long Terms Text

- Max 500 characters for terms. Character counter shown (N/500).
- At 450+ characters: counter turns amber.
- At 500: counter turns red, further typing is blocked.

---

### 4. Accessibility

#### 4.1 ARIA Structure

**Create Agreement form:**
- Outer `<form>` with `aria-label="Create Partner Agreement"`
- Partner email: `<label for="partner-email">` + `<input id="partner-email" type="email" aria-describedby="partner-email-hint partner-email-error" aria-invalid={hasError}`
- Live user lookup result: `role="status" aria-live="polite"` region below the email input — announces "Found: [Name]" or "New user — they'll receive an invitation" to screen readers without visual focus change
- Terms textarea: `<label for="terms">` + `<textarea id="terms" aria-describedby="terms-hint terms-error"`
- Visibility selector: `<fieldset><legend>Visibility</legend><div role="radiogroup">` — each button has `role="radio" aria-checked={isSelected}` matching create-story-page pattern
- Submit button: `aria-busy={isSubmitting}` while submitting, label changes to "Sealing..." with `aria-live="polite"` on the button's inner span

**Certificate frame:**
- Pledge text sections are landmark `<section>` elements with `aria-label` matching their heading (e.g., `aria-label="Your Right"`)
- Read-only name in pledge text: `<span aria-label="Creator: [Name]">[Name]</span>`

**Acceptance page:**
- Partner name (pre-filled from profile): `readonly` input with `aria-readonly="true"` and `title="Your name from your profile"`
- Decline confirmation dialog: `role="alertdialog" aria-labelledby aria-describedby`, focus trapped within dialog while open
- [I Accept & Co-Sign ✦] button: `aria-describedby` pointing to a visually hidden description of what acceptance means

**Celebration dialog:**
- `role="dialog" aria-modal="true" aria-labelledby="celebration-title"`
- Focus moves to the dialog heading on open, trapped within
- [View Agreement] button receives focus on dialog open

**Profile section:**
- Agreement rows: each row is a `<article>` with `aria-label="Agreement with [Partner Name], active [N] months"`
- [View Agreement →] link: `aria-label="View agreement with [Partner Name]"` (not just "View Agreement")
- [+ New Agreement] button: `aria-label="Create a new Partner Agreement"`

#### 4.2 Keyboard Navigation

- Full tab order through the creation form: partner email → terms → visibility options → submit button
- Visibility radio group: arrow keys cycle between options (standard radiogroup keyboard behavior)
- Certificate frame: pledge text is not in the tab order (read-only prose). Only interactive elements are focusable.
- Acceptance page: tab order is pledge text (skipped as non-interactive) → accept button → decline button. Reverse tab reaches decline first (visually on left) — no, on desktop decline is on left, accept on right, so tab order: decline → accept (left-to-right). On mobile (stacked), accept is shown above decline in the visual stacking, so tab order is: accept → decline.
- Terminate dialog: focus trap within dialog, Escape closes dialog (does NOT terminate — requires explicit button click)
- Celebration dialog: Escape closes only if user has seen the full content (no accidental dismissal on first render — Escape is enabled after a 1-second delay or after first Tab keypress)

#### 4.3 Screen Reader

- Pledge text sections are read in full — they are prose `<p>` elements, not interactive, no special treatment needed
- Partner lookup result region (`aria-live="polite"`) announces changes without interrupting the user's typing focus
- Status banners (pending, expired, terminated) use `role="status"` for informational states
- Error messages use `role="alert"` for immediate interruption
- Celebration dialog: `aria-label="Agreement Sealed"`, inner mini-certificate is `aria-hidden="true"` (decorative), only the heading and [View Agreement] button are read

#### 4.4 Color Contrast

All text meets WCAG AA:
- #1A1A1A on #FDFBF7: 18.1:1 (passes AAA)
- #002B5C on #FDFBF7: 14.8:1 (passes AAA)
- #0044CC on #FDFBF7: 5.9:1 (passes AA for normal text)
- White on #002B5C (submit button): 14.8:1 (passes AAA)
- Amber-800 on amber-50 (pending banner): verify — use text-amber-900 if amber-800 fails AA
- Red-600 on white (error text): 5.9:1 (passes AA)
- Blue-700 on blue-50 (selected visibility option): 7.2:1 (passes AA)
- Muted text (#1A1A1A/60 = approximately #888 on #FDFBF7): 3.7:1 — used only for supplementary text, not for error or action states

Status indicators (✓ checkmark, ⌛ clock) are accompanied by text labels, not used as sole conveyors of information.

---

### 5. Responsive Design

#### 5.1 Mobile (320–767px)

**Create Agreement page:**
- Container: px-4, max-width 100%
- Certificate frame: padding 16px (p-4), reduced from desktop 48px
- Header typography: text-2xl (reduced from 4xl)
- Partner email and terms: full width, same underline-only style
- Visibility options: `flex-wrap` allowed — three buttons may stack to two rows on 320px
- Submit button: full width, py-4

**Acceptance page:**
- Full-width pledge text (readable without horizontal scroll)
- Action buttons: stacked vertically, Accept on top, Decline below (each full width)
- [I Accept & Co-Sign ✦]: full width, min-h-[52px] for large touch target
- [Decline]: full width, outline variant, min-h-[44px]

**Profile section (agreement rows):**
- Row layout: stacked — paired avatars + names on top line, "Active N months · [View →]" on second line
- No horizontal overflow
- [+ New Agreement]: full width, centered

**Celebration dialog:**
- Max-width 90vw, centered
- Mini-certificate inside dialog: padding reduced to p-3
- Title: text-xl

**Pending page:**
- Status banner: full width, text wraps naturally
- Shareable URL: truncated with ellipsis if too long, copy button below on its own row

#### 5.2 Tablet (768–1023px)

- Container max-width 640px centered
- Certificate frame: padding 24px (p-6)
- Action buttons on acceptance page: side by side (flex-row, gap-3)
- Agreement rows on profile: horizontal layout (avatars left, meta center, View link right)
- Visibility options: single row (three buttons fit at 768px+)

#### 5.3 Desktop (1024px+)

- Container max-width 640px (same as tablet — certificate should not be excessively wide)
- Certificate frame: padding 48px (p-12), matching sign-pledge-form.tsx desktop padding
- Action buttons: side by side, Decline left (ghost), Accept right (primary navy)
- Agreement rows: full horizontal layout
- Hover states: all interactive elements show hover transitions (bg change for buttons, color change for links)
- Visibility tooltip: shown on hover (standard tooltip, not mobile-modal). Uses MobileTooltip component which adapts automatically.

#### 5.4 Print / Export (certificate view only)

The active agreement certificate at /agreements/[id] should be printable:
- `@media print`: hide navigation, banners, action buttons
- Certificate frame renders with CSS borders (not box-shadow — shadows don't print reliably)
- Pledge text and signatures print at 12pt minimum
- Page break: avoid mid-certificate

---

### 6. Copy Decisions

All copy references in this section are the exact strings to use:

| Location | Copy |
|---|---|
| Create page h1 | "Create a Partner Agreement" |
| Create page subtext | "Formalize your commitment to calibrated communication with one specific person." |
| Certificate header title | "Clarity Partner Agreement" |
| Certificate header subtitle | "A Bilateral Commitment" |
| "Specifically with:" label | "Specifically with:" |
| Terms section label | "Our terms:" |
| Terms default text | (see terms template in section 2.1) |
| Submit button | "Seal & Invite Partner ✦" |
| Submitting state | "Sealing..." |
| First session CTA text | "✦ Ready to experience what you just committed to?" |
| First session CTA link | "Schedule your first /live session →" |
| Celebration dialog secondary link | "Schedule your first /live session →" |
| Inline registration label (acceptance page) | "Create your account to co-sign" |
| Visibility Private tooltip | "Only you and your partner can view this agreement." |
| Visibility Public tooltip | "Anyone can view this agreement on your public profile." |
| Visibility Shared tooltip (disabled) | "Shared visibility does not apply to bilateral agreements." |
| Pending banner | "PENDING CO-SIGNATURE" |
| Pending sub-copy | "Waiting for [First Name] to accept" |
| Share copy | "Share this link to invite [Name]:" |
| Expired banner | "This invitation has expired (7 days)" |
| Resend button | "Resend Invitation" |
| Acceptance page header | "[Creator First Name] invites you to a Clarity Partner Agreement" |
| Acceptance page sub-copy | "[Creator Name] has committed. Your signature makes it bilateral." |
| Accept button | "I Accept & Co-Sign ✦" |
| Accepting state | "Co-signing..." |
| Decline button | "Decline" |
| Decline confirmation body | "Are you sure you want to decline? [Creator First Name] will be notified. No agreement will be created." |
| Decline confirm button | "Confirm Decline" |
| Decliner landing page | "You've declined this invitation. No account has been created. No further action is needed." |
| Active status badge | "ACTIVE" |
| Terminated banner | "TERMINATED" |
| Celebration dialog title | "✦  Agreement Sealed  ✦" |
| Celebration [View] button | "View Agreement" |
| Profile section heading | "Partner Agreements" |
| Profile empty state | "You haven't created any Partner Agreements yet." |
| Profile empty state CTA | "+ New Agreement" |
| Partner row "Active" duration | "Active [N] months" (singular "month" when N=1) |
| View link in row | "View Agreement →" |
| Terminate menu item | "Terminate Agreement" |
| Terminate confirm body | "Both you and [Partner Name] will be notified. The agreement will be archived." |
| Terminate confirm button | "Terminate Agreement" |
| Creator decline notification email subject | "[Partner Name] declined your Clarity Partner Agreement invitation" |
| Creator decline email body cue | "Consider inviting them to a /live session first to build shared understanding." |

---

## Architecture

> Authored: 2026-02-24 | Scope: P422 sign + view only (P429 session requests, P430 observers deferred)

---

### 1. Database Schema

#### 1.1 `clarity_agreements` table

```sql
CREATE TABLE public.clarity_agreements (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Parties (both stored as profile UUIDs)
  creator_profile_id  UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  partner_profile_id  UUID REFERENCES public.profiles(id) ON DELETE RESTRICT,
  -- partner_profile_id is NULL while invitation is pending for a non-registered partner.
  -- It is set when the partner accepts (creates account or logs in).

  -- Invitation target (always stored; used for lookup on acceptance)
  partner_email       TEXT NOT NULL,  -- the email the invitation was sent to

  -- Agreement content
  terms_text          TEXT NOT NULL CHECK (char_length(terms_text) <= 1000),

  -- Status lifecycle: pending → active | declined | expired | terminated
  status              TEXT NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending', 'active', 'declined', 'expired', 'terminated')),

  -- Visibility: private or public (no "shared" — per spec decision 4)
  visibility          TEXT NOT NULL DEFAULT 'private'
                        CHECK (visibility IN ('private', 'public')),

  -- Invitation token for the acceptance URL
  -- UUID stored as text for URL-safe use; rotated on Resend Invitation
  invitation_token    TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  invitation_expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '7 days'),

  -- Timestamps
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  partner_signed_at   TIMESTAMPTZ,          -- set when partner accepts
  terminated_at       TIMESTAMPTZ,          -- set when either party terminates
  terminated_by       UUID REFERENCES public.profiles(id) ON DELETE SET NULL,

  -- Display short ID — A-NNNN format, display only (not used in URLs)
  -- Generated as a zero-padded sequence via a trigger (see 1.3 below)
  display_id          TEXT UNIQUE
);

CREATE INDEX idx_clarity_agreements_creator     ON public.clarity_agreements(creator_profile_id);
CREATE INDEX idx_clarity_agreements_partner     ON public.clarity_agreements(partner_profile_id);
CREATE INDEX idx_clarity_agreements_token       ON public.clarity_agreements(invitation_token);
CREATE INDEX idx_clarity_agreements_partner_email ON public.clarity_agreements(partner_email);
CREATE INDEX idx_clarity_agreements_status      ON public.clarity_agreements(status);
```

**Design notes:**

- `partner_profile_id` is nullable while pending for unregistered partners. It is populated on acceptance. This avoids the need for a separate "pending_partners" table and mirrors how the existing app handles pre-registration flows (profile created at auth callback).
- `partner_email` is always stored. On acceptance by an authenticated user, the service layer matches email → profile.id and sets `partner_profile_id`.
- `invitation_token` is a UUID (not the agreement `id`) so the token can be rotated on resend without changing the agreement URL (`/agreements/[id]`).
- `display_id` (A-0042 format) is generated by a trigger on INSERT. It is display-only — URLs use `id` (UUID).
- No `expiry_date` field for the agreement itself per decision 14 (auto-renewing until terminated).
- `terms_text` max 1000 chars enforced at DB level (spec decision 13; note spec section 3.10 says 500 chars — use 1000 to match spec decision 13 and UX spec 2.1 which says "increased from 500 to 1000").

#### 1.2 Short Display ID trigger

```sql
-- Sequence for the numeric part of A-NNNN
CREATE SEQUENCE IF NOT EXISTS clarity_agreements_display_seq START 1;

CREATE OR REPLACE FUNCTION trg_set_agreement_display_id()
RETURNS TRIGGER AS $$
BEGIN
  NEW.display_id := 'A-' || LPAD(nextval('clarity_agreements_display_seq')::text, 4, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_agreement_display_id
  BEFORE INSERT ON public.clarity_agreements
  FOR EACH ROW
  WHEN (NEW.display_id IS NULL)
  EXECUTE FUNCTION trg_set_agreement_display_id();
```

#### 1.3 No additional tables in P422

The following tables are **deferred** — do not create in this migration:
- `agreement_session_requests` — P429
- `agreement_fulfillments` — P429
- `agreement_observers` — P430

---

### 2. RLS Policies

```sql
ALTER TABLE public.clarity_agreements ENABLE ROW LEVEL SECURITY;

-- ── SELECT ────────────────────────────────────────────────────────────────────

-- Public agreements: readable by anyone (unauthenticated included)
-- Private agreements: readable only by the two parties
-- Pending/expired agreements: readable by creator (and partner via token — handled in app layer)
CREATE POLICY "Agreements readable by visibility and parties"
  ON public.clarity_agreements FOR SELECT
  USING (
    visibility = 'public'
    OR creator_profile_id = auth.uid()
    OR partner_profile_id = auth.uid()
  );

-- ── INSERT ────────────────────────────────────────────────────────────────────

-- Any authenticated user can create an agreement
CREATE POLICY "Authenticated users can create agreements"
  ON public.clarity_agreements FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND creator_profile_id = auth.uid()
  );

-- ── UPDATE ────────────────────────────────────────────────────────────────────

-- Only parties can update. Specific column guards are enforced in service layer.
-- (RLS cannot restrict which columns are updated, only which rows)
CREATE POLICY "Parties can update their agreements"
  ON public.clarity_agreements FOR UPDATE
  USING (
    creator_profile_id = auth.uid()
    OR partner_profile_id = auth.uid()
  );

-- ── DELETE ────────────────────────────────────────────────────────────────────

-- No delete — agreements are archived (status = terminated/declined/expired), never deleted.
-- This policy intentionally absent. Hard delete is not permitted.
```

**Column-level authorization (enforced in service layer, not RLS):**

| Operation | Who can do it | Columns affected |
|-----------|--------------|-----------------|
| Accept agreement | Partner only | `partner_profile_id`, `partner_signed_at`, `status → active` |
| Decline agreement | Partner only (via token, unauthenticated OK) | `status → declined` |
| Terminate agreement | Either party | `status → terminated`, `terminated_at`, `terminated_by` |
| Resend invitation | Creator only | `invitation_token`, `invitation_expires_at` |
| Mark expired | Service role (edge function) or app layer | `status → expired` |

Service-layer checks: before any UPDATE, fetch the agreement and assert the caller's `auth.uid()` matches the expected party for the operation.

**Token-based access (decline/accept for unauthenticated partners):**

The acceptance page is accessible without authentication — the partner reads the agreement before deciding to create an account. The edge function (or service layer with service role) handles the `status` transition when the token matches and has not expired. This means:
- The frontend passes the invitation token to the edge function.
- The edge function uses the **service role key** to perform the status update (bypasses RLS).
- The token is validated server-side: `invitation_token = $token AND invitation_expires_at > now() AND status = 'pending'`.

---

### 3. API Layer

#### 3.1 Pattern decision

New features use the **interface-based service pattern** (`src/app/data/{domain}-service*.ts`). P422 introduces `agreements-service`. It follows the same structure as `events-service`.

Token-sensitive operations (accept, decline by unauthenticated user) are handled by a new **Supabase Edge Function** (`send-agreement-emails`) that also sends Mailgun emails. This mirrors the `send-event-emails` pattern exactly.

#### 3.2 Service interface — `src/app/data/agreements-service.interface.ts`

```typescript
export type AgreementStatus = 'pending' | 'active' | 'declined' | 'expired' | 'terminated';
export type AgreementVisibility = 'private' | 'public';

export interface AgreementParty {
  profileId: string;
  name: string;
  slug: string | null;
  avatarColor: string;
  avatarUrl: string | null;
  hasPledged: boolean;
}

export interface ClarityAgreement {
  id: string;
  displayId: string;           // e.g. "A-0042"
  creatorProfileId: string;
  partnerProfileId: string | null;
  partnerEmail: string;
  termsText: string;
  status: AgreementStatus;
  visibility: AgreementVisibility;
  invitationToken: string;
  invitationExpiresAt: string;
  createdAt: string;
  partnerSignedAt: string | null;
  terminatedAt: string | null;
  terminatedBy: string | null;
  // Joined data (populated by service, not stored)
  creator: AgreementParty | null;
  partner: AgreementParty | null;
}

export interface CreateAgreementInput {
  partnerEmail: string;
  termsText: string;
  visibility: AgreementVisibility;
}

export interface AgreementsService {
  // Creator creates a new agreement
  createAgreement(input: CreateAgreementInput): Promise<ClarityAgreement | null>;

  // Fetch a single agreement by UUID (used for /agreements/[id] route)
  // Returns null if not found or caller lacks access
  getAgreement(id: string): Promise<ClarityAgreement | null>;

  // Fetch an agreement by invitation token (unauthenticated access for acceptance page)
  // Returned only if token is valid and status is pending
  getAgreementByToken(token: string): Promise<ClarityAgreement | null>;

  // Get all agreements for a given profile (for profile page display)
  // Visibility filtering is applied: private ones returned only if viewer is a party
  getAgreementsForProfile(profileId: string, viewerProfileId: string | null): Promise<ClarityAgreement[]>;

  // Lookup user by email (for live user lookup on creation form)
  lookupUserByEmail(email: string): Promise<AgreementParty | null>;

  // Check if creator already has an active agreement with the given email
  hasActiveAgreementWith(creatorProfileId: string, partnerEmail: string): Promise<boolean>;

  // Resend invitation (creator only) — rotates token, extends expiry
  resendInvitation(agreementId: string): Promise<boolean>;

  // Terminate an agreement (either party)
  terminateAgreement(agreementId: string): Promise<boolean>;
}
```

#### 3.3 Real service — `src/app/data/agreements-service-real.ts`

Key implementation notes:

**`createAgreement`:**
1. Assert `auth.uid()` is not null.
2. Validate `partnerEmail !== currentUser.email` (cannot invite yourself).
3. Check `hasActiveAgreementWith(uid, partnerEmail)` — return error if duplicate active exists.
4. INSERT into `clarity_agreements` with `creator_profile_id = auth.uid()`.
5. Fire-and-forget: `invokeAgreementEmails('invitation', agreementId)`.
6. Return the created agreement with joined creator profile.

**`getAgreement`:**
- Single SELECT joining profiles for both creator and partner.
- RLS enforces access. If RLS blocks (private, non-party), Supabase returns empty — service returns null.
- Expired check: if `status = 'pending' AND invitation_expires_at < now()`, the service marks it expired on read (lazy expiry — no cron needed for V1). UPDATE `status = 'expired'` via service role or the UPDATE RLS policy (creator can do this update since they are a party).

**`getAgreementByToken`:**
- Uses unauthenticated Supabase client (anon key) for the SELECT.
- Filters: `invitation_token = $token AND status = 'pending' AND invitation_expires_at > now()`.
- Returns the agreement with joined creator profile (no partner profile yet, they haven't signed).
- Does NOT use auth session — this is the public acceptance URL.

**`getAgreementsForProfile`:**
- SELECT all agreements where `creator_profile_id = profileId OR partner_profile_id = profileId`.
- Filter out private agreements where `viewerProfileId` is not one of the two parties.
- Order: active first, then pending (creator's own profile only), then terminated (history).
- For non-owner visitors: return only `status IN ('active')` with `visibility = 'public'`.

**`terminateAgreement`:**
1. Fetch agreement, assert caller is `creator_profile_id` or `partner_profile_id`.
2. UPDATE `status = 'terminated', terminated_at = now(), terminated_by = auth.uid()`.
3. Fire-and-forget: `invokeAgreementEmails('terminated', agreementId)`.

#### 3.4 Feature flag

```typescript
// src/app/data/agreements-service.ts
const USE_REAL_API = import.meta.env.VITE_USE_REAL_AGREEMENTS_API === 'true';
export const agreementsService: AgreementsService = USE_REAL_API ? realService : mockService;
```

Add `VITE_USE_REAL_AGREEMENTS_API=true` to `.env.local`.

---

### 4. Edge Function — `send-agreement-emails`

Mirrors `send-event-emails` pattern exactly. New Deno edge function at:

```
supabase/functions/send-agreement-emails/index.ts
```

**Actions handled:**

| Action | Trigger | Recipients | Template |
|--------|---------|-----------|----------|
| `invitation` | Agreement created | `partner_email` | "[Creator] invited you to a Clarity Partner Agreement" with acceptance link |
| `accepted` | Partner accepts | creator email | "[Partner] co-signed your agreement. It's now active." |
| `declined` | Partner declines | creator email | "[Partner] declined your agreement. Consider /live first." |
| `terminated` | Either party terminates | both parties | "Your Clarity Partner Agreement has been terminated." |
| `resend` | Creator resends | `partner_email` | Same as `invitation` with refreshed token |

**From address:** `agreements@${MAILGUN_DOMAIN}` — new sender persona, consistent with event emails.

**Acceptance link format:** `https://claritypledge.com/agreements/[id]/accept?token=[invitation_token]`

**Service role usage:** The edge function uses `SUPABASE_SERVICE_ROLE_KEY` (same as `send-event-emails`). For the `accept` and `decline` actions triggered by unauthenticated partners, the function validates the token and updates `status` directly — bypassing RLS.

**Invoke from frontend:** New helper at `src/lib/agreement-emails.ts`:

```typescript
export async function invokeAgreementEmails(
  action: 'invitation' | 'accepted' | 'declined' | 'terminated' | 'resend',
  agreementId: string
): Promise<void> {
  try {
    const { error } = await supabase.functions.invoke('send-agreement-emails', {
      body: { action, agreementId },
    });
    if (error) console.error('[agreement-emails] Edge function error:', error);
  } catch (err) {
    console.error('[agreement-emails] Invoke failed:', err);
  }
}
```

**Accept/Decline via edge function (unauthenticated path):**

The acceptance page calls the edge function directly with `{ action: 'accept', agreementId, token, newUserData? }`. The function:
1. Validates token against `clarity_agreements`.
2. If `newUserData` present (inline registration): creates the Supabase auth user + profile via service role, then sets `partner_profile_id`.
3. If user already authenticated (passed `userId`): sets `partner_profile_id = userId`.
4. Updates `status = 'active', partner_signed_at = now()`.
5. Sends `accepted` email to creator.

This keeps auth user creation in a single place (server-side, service role) rather than the frontend — consistent with the principle that auth flows run through server functions.

> **Risk flag:** Inline registration inside an edge function differs from the existing `AuthCallbackPage.tsx` pattern (which handles magic-link flow). The edge function path should call `supabase.auth.admin.createUser()` + insert into `profiles` with slug generation. This is the only place in P422 where a new profile is created outside the magic-link flow. If any complexity arises, fallback: redirect unauthenticated partners to `/signup?returnTo=/agreements/[id]/accept&token=[token]` instead (simpler but adds one extra step).

---

### 5. Files to Create or Modify

#### New files

| File | Purpose |
|------|---------|
| `supabase/migrations/20260224HHMMSS_p422_clarity_agreements.sql` | `clarity_agreements` table, sequence, trigger, RLS policies |
| `supabase/functions/send-agreement-emails/index.ts` | Edge function: Mailgun emails + token-validated accept/decline |
| `src/app/data/agreements-service.interface.ts` | TypeScript types + service interface |
| `src/app/data/agreements-service-real.ts` | Supabase implementation |
| `src/app/data/agreements-service-mock.ts` | Mock implementation for unit tests |
| `src/app/data/agreements-service.ts` | Feature-flag export |
| `src/lib/agreement-emails.ts` | `invokeAgreementEmails()` helper (mirrors `event-emails.ts`) |
| `src/app/pages/create-agreement-page.tsx` | `/agreements/new` — creation form |
| `src/app/pages/agreement-page.tsx` | `/agreements/[id]` — pending + active + terminated views (state-branched) |
| `src/app/pages/accept-agreement-page.tsx` | `/agreements/[id]/accept` — acceptance + inline registration |
| `src/app/pages/declined-agreement-page.tsx` | `/agreements/[id]/declined` — static decline landing |
| `src/app/components/agreements/agreement-certificate.tsx` | Reusable certificate frame component (shared across creation, pending, active, celebration dialog) |
| `src/app/components/agreements/agreement-row.tsx` | Profile page row component |
| `src/app/components/agreements/profile-agreements-section.tsx` | Profile page section with empty state + list |
| `src/app/components/agreements/celebration-dialog.tsx` | Post-acceptance dialog overlay |
| `e2e/agreements.spec.ts` | E2E tests (see test spec) |

#### Modified files

| File | Change |
|------|--------|
| `src/App.tsx` | Add lazy routes: `/agreements/new`, `/agreements/:id`, `/agreements/:id/accept`, `/agreements/:id/declined` |
| `src/app/pages/profile-page-v2.tsx` | Add `<ProfileAgreementsSection>` below the existing Pledges section |
| `src/app/types/index.ts` | Add `ClarityAgreement`, `AgreementParty`, `AgreementStatus`, `AgreementVisibility` — or export from `agreements-service.interface.ts` and re-export here |
| `.env.local` (dev only, not committed) | Add `VITE_USE_REAL_AGREEMENTS_API=true` |
| `docs/technical/architecture.md` | Add `agreements-service` to the service pattern table |

---

### 6. Route Structure

```
/agreements/new                     → CreateAgreementPage   (auth required)
/agreements/:id                     → AgreementPage         (public if visibility=public; party-gated if private)
/agreements/:id/accept              → AcceptAgreementPage   (unauthenticated allowed — reads agreement before auth)
/agreements/:id/declined            → DeclinedAgreementPage (static, no auth)
```

All agreement routes are lazy-loaded (same `lazy()` pattern as `CreateStoryPage`, `StoryDetailPage`).

The `:id` param is the agreement UUID, not the display ID (A-0042 is display-only).

---

### 7. Security Considerations

**Token validation is server-side only.** The invitation token is never trusted from the client for write operations. The edge function re-validates the token against the database on every accept/decline call.

**Prevent self-invitation.** Service layer asserts `partnerEmail !== currentUser.email` before inserting. Also enforced by a DB check constraint:

```sql
-- Optional DB-level guard (belt-and-suspenders)
ALTER TABLE public.clarity_agreements
  ADD CONSTRAINT no_self_agreement
  CHECK (partner_profile_id IS NULL OR partner_profile_id != creator_profile_id);
```

**Duplicate active agreements.** Service layer calls `hasActiveAgreementWith()` before INSERT. The unique constraint is not at DB level (a user could have a terminated and a new active agreement with the same person) — so the uniqueness check is scoped to `status = 'active' OR status = 'pending'`.

**Private agreement access.** RLS SELECT policy: `visibility = 'public' OR creator_profile_id = auth.uid() OR partner_profile_id = auth.uid()`. This means:
- Private agreements with `partner_profile_id IS NULL` (pending, partner not yet registered) are readable only by the creator. The partner uses the token-based `getAgreementByToken` path (no auth required, token-scoped).
- Once the partner registers and `partner_profile_id` is set, RLS grants them SELECT via their `auth.uid()`.

**Token rotation on resend.** `resendInvitation` generates a new `gen_random_uuid()` for `invitation_token` and extends `invitation_expires_at`. Old token links immediately return "expired" — only the latest token is valid.

**Termination is unilateral.** Either party can terminate. No approval needed from the other. This is intentional (spec decision 7). The notified party receives an email — that is the only communication mechanism in V1.

**Inline registration security.** If the edge function handles new user creation (service role `admin.createUser`):
- Rate-limit the edge function invocation per IP (Supabase rate limiting on functions is on by default).
- The email in the created account must match `clarity_agreements.partner_email` — validated server-side before account creation.
- ToS acceptance is recorded in `terms_acceptances` table (existing consent mechanism from P37) as part of the registration flow.

**RLS: no DELETE policy.** Agreements are never hard-deleted. The absence of a DELETE policy means no role (except service role or `postgres`) can delete rows. Service role is only used in the edge function, which never deletes.

---

### 8. Implementation Risks

**Risk 1 — Inline registration: RESOLVED → Option A**

Unauthenticated partners are redirected to `/signup?returnTo=/agreements/[id]/accept&token=[token]`. After magic-link auth, the return URL lands them on the acceptance page where they co-sign as an authenticated user. Keeps auth flow unchanged. Profile creation stays exclusively in `AuthCallbackPage.tsx`.

**Risk 2 — Lazy expiry race condition (LOW)**

If the creator views the agreement and the service marks it `expired` on read, but simultaneously the partner clicks accept with a token that was technically valid a moment ago: the edge function should validate `invitation_expires_at > now()` at the time of the accept action, not rely on the `status` column (which may or may not have been updated by the read side). The edge function must check the timestamp directly.

**Risk 3 — Profile page N+1 on agreements (LOW)**

`getAgreementsForProfile` must batch-fetch both party profiles in a single query (join or two IN queries), not loop per agreement. With the service pattern this is straightforward — fetch all agreements, collect all unique profile IDs, fetch all profiles in one query, resolve on the client.

**Risk 4 — Display ID sequence gaps in test (LOW)**

The `clarity_agreements_display_seq` sequence does not reset between test runs. E2E tests that assert on display ID format should match the pattern (`/^A-\d{4,}$/`) rather than specific values.

**Risk 5 — Email deliverability for new Mailgun sender persona (LOW)**

`agreements@${MAILGUN_DOMAIN}` is a new sender address. Ensure it is added to Mailgun allowed senders and SPF/DKIM is configured before testing email delivery. The existing `events@${MAILGUN_DOMAIN}` is a reference — same domain, should be covered by existing DNS records.

**Risk 6 — Profile page load time (LOW)**

Adding a `getAgreementsForProfile` query to the profile page increases load time. The profile page already fetches points, stories, witnesses, and calibration stats. The agreements query should run in parallel (via `Promise.all`) not sequentially. The section should have an independent loading skeleton so it does not block the rest of the profile from rendering.

---

### 9. Migration Filename

Use a 14-digit timestamp per database rules. Since today is 2026-02-24 and other migrations exist for this date:

```
supabase/migrations/20260224150000_p422_clarity_agreements.sql
```

(Use the next available HH:MM:SS that does not conflict with existing files. Verify with `ls supabase/migrations/20260224*` before creating.)

---

### 10. Post-P422 Hooks for P429 / P430

The `clarity_agreements` table is designed to be extended without schema changes for the P422 column set:
- P429 adds `agreement_session_requests` and `agreement_fulfillments` tables (separate migrations).
- P430 adds `agreement_observers` table.
- Neither requires modifying `clarity_agreements` columns in P422.

One future-proofing note: if P429 needs to denormalize a session count onto `clarity_agreements` for cheap profile display, add a `fulfilled_sessions_count INT DEFAULT 0` column in P429's migration — not now.

---

### 7. Routing Summary

| URL | Page | Auth Required |
|---|---|---|
| `/agreements/new` | Create Agreement form | Yes (owner only) |
| `/agreements/[id]` | Agreement view (active or pending) | Public agreements: no. Private: yes + must be a party. |
| `/agreements/[id]/accept` | Partner acceptance page | No (read), Yes (to sign) |
| `/agreements/[id]/declined` | Static decline confirmation | No |

Short IDs (A-0042 format) are display-only. URLs use the full UUID. The display ID is shown in the certificate header and shareable URL text display for readability.

---

## Test Scenarios

> Scope: P422 sign + view only. Session requests (P429) and observers (P430) are out of scope.
>
> File to create: `e2e/agreements.spec.ts`
> Unit tests: described below — actual files created by `/dev`.

---

### E2E Tests — `e2e/agreements.spec.ts`

**File header pattern** (match existing specs exactly):

```typescript
/**
 * @file agreements.spec.ts
 * @description E2E tests for P422: Clarity Partner Agreement
 *
 * Tests:
 * - Creator creates agreement with existing user partner (happy path)
 * - Creator creates agreement with new user partner (pending + invitation state)
 * - Partner accepts agreement (existing user) → celebration dialog → active certificate
 * - Partner accepts agreement (new user — redirect to signup with returnTo, then co-sign)
 * - Partner declines → decline landing shown, creator sees declined state
 * - Invitation expires (7 days) → resend invitation flow
 * - Either party terminates → terminated state shown, other party sees terminated banner
 * - Public agreement visible on profile without auth
 * - Private agreement NOT visible to non-party visitors
 * - Creator without a name set → inline error on /agreements/new
 * - Creator invites themselves → inline error on /agreements/new
 */

import { test, expect } from '@playwright/test';
import { createTestUser, deleteTestUser, setTestSession, type TestUser } from './helpers/test-user';
import { supabaseAdmin } from '../src/lib/supabase-admin';
```

**Shared setup pattern:**

```typescript
test.describe('P422 — Clarity Partner Agreement', () => {
  test.setTimeout(60000);

  let creator: TestUser;
  let partner: TestUser;
  let visitorUser: TestUser;

  test.beforeAll(async () => {
    creator = await createTestUser({ name: 'P422 Creator' });
    partner = await createTestUser({ name: 'P422 Partner' });
    visitorUser = await createTestUser({ name: 'P422 Visitor' });
  });

  test.afterAll(async () => {
    // Clean up all agreements created by creator in tests
    await supabaseAdmin
      .from('clarity_agreements')
      .delete()
      .eq('creator_profile_id', creator.user.id);
    if (creator?.user?.id) await deleteTestUser(creator.user.id);
    if (partner?.user?.id) await deleteTestUser(partner.user.id);
    if (visitorUser?.user?.id) await deleteTestUser(visitorUser.user.id);
  });
```

---

#### TC-01: Creator creates agreement — existing user partner (happy path)

**Purpose:** Full creation flow where the partner is already registered. Agreement created in pending state.

```typescript
test('creator creates agreement with an existing user partner — shows pending state', async ({ page }) => {
  await setTestSession(page, creator.email);

  await page.goto('/agreements/new');
  await page.waitForLoadState('networkidle');

  // Certificate frame heading visible
  await expect(page.getByText('Clarity Partner Agreement')).toBeVisible({ timeout: 10000 });

  // Enter partner email — triggers live user lookup
  await page.getByLabel(/partner.*email/i).fill(partner.email);

  // Live lookup should resolve and show "Found: P422 Partner"
  await expect(page.getByText(/found/i)).toBeVisible({ timeout: 5000 });

  // Terms textarea pre-filled with template
  await expect(page.getByLabel(/our terms/i)).not.toBeEmpty();

  // Submit
  await page.getByRole('button', { name: /seal & invite partner/i }).click();

  // Redirected to /agreements/[id] in pending state
  await expect(page).toHaveURL(/\/agreements\/[0-9a-f-]{36}$/, { timeout: 10000 });

  // Pending status banner
  await expect(page.getByText(/pending co-signature/i)).toBeVisible({ timeout: 10000 });

  // Creator's name signed
  await expect(page.getByText('P422 Creator')).toBeVisible();

  // Partner slot shows "Awaiting"
  await expect(page.getByText(/awaiting/i)).toBeVisible();

  // Shareable URL shown
  await expect(page.getByRole('button', { name: /copy link/i })).toBeVisible();
});
```

---

#### TC-02: Creator creates agreement — partner is a new (unregistered) user

**Purpose:** When the entered email has no account, the form shows "New user — they'll be invited" and creation still succeeds.

```typescript
test('creator creates agreement with a new user partner — shows pending state with invitation copy', async ({ page }) => {
  await setTestSession(page, creator.email);

  const newUserEmail = `p422-new-partner-${Date.now()}@gmail.com`;

  await page.goto('/agreements/new');
  await page.waitForLoadState('networkidle');

  await page.getByLabel(/partner.*email/i).fill(newUserEmail);

  // Live lookup shows "new user" copy (no found match)
  await expect(page.getByText(/new user/i)).toBeVisible({ timeout: 5000 });

  // Terms present
  await expect(page.getByLabel(/our terms/i)).not.toBeEmpty();

  await page.getByRole('button', { name: /seal & invite partner/i }).click();

  // Lands on pending page
  await expect(page).toHaveURL(/\/agreements\/[0-9a-f-]{36}$/, { timeout: 10000 });
  await expect(page.getByText(/pending co-signature/i)).toBeVisible({ timeout: 10000 });

  // Partner email shown in pending view (no name yet)
  await expect(page.getByText(newUserEmail)).toBeVisible();

  // Clean up: delete this test agreement
  const url = page.url();
  const agreementId = url.split('/agreements/')[1];
  await supabaseAdmin.from('clarity_agreements').delete().eq('id', agreementId);
});
```

---

#### TC-03: Partner accepts agreement (existing user) → celebration dialog → active certificate

**Purpose:** Core acceptance flow. Partner lands on accept page, reads agreement, clicks accept, sees celebration dialog, then the active certificate.

**Setup:** Create agreement in DB directly for test isolation.

```typescript
test('existing user partner accepts agreement → celebration dialog shown → active certificate', async ({ page }) => {
  // Create pending agreement directly in DB
  const { data: agreement } = await supabaseAdmin
    .from('clarity_agreements')
    .insert({
      creator_profile_id: creator.user.id,
      partner_email: partner.email,
      terms_text: 'We commit to at least one /live session per month.',
      status: 'pending',
      visibility: 'public',
    })
    .select()
    .single();

  // Partner logs in and visits the accept page
  await setTestSession(page, partner.email);
  await page.goto(`/agreements/${agreement.id}/accept`);
  await page.waitForLoadState('networkidle');

  // Acceptance page header shows creator's name
  await expect(page.getByText(/P422 Creator invites you/i)).toBeVisible({ timeout: 10000 });

  // Full pledge text visible (read-only)
  await expect(page.getByText(/We all crave being understood/i)).toBeVisible();

  // Terms text shown read-only
  await expect(page.getByText(/at least one \/live session/i)).toBeVisible();

  // Accept button
  await page.getByRole('button', { name: /i accept & co-sign/i }).click();

  // Celebration dialog appears
  await expect(page.getByRole('dialog')).toBeVisible({ timeout: 10000 });
  await expect(page.getByText(/agreement sealed/i)).toBeVisible();

  // Click View Agreement to close dialog and navigate to certificate
  await page.getByRole('button', { name: /view agreement/i }).click();

  // Active certificate view
  await expect(page.getByText(/active/i)).toBeVisible({ timeout: 10000 });

  // Both names show checkmarks (signatures)
  await expect(page.getByText('P422 Creator')).toBeVisible();
  await expect(page.getByText('P422 Partner')).toBeVisible();

  // Cleanup
  await supabaseAdmin.from('clarity_agreements').delete().eq('id', agreement.id);
});
```

---

#### TC-04: Partner accepts agreement — new user (redirect to signup with returnTo, then co-sign)

**Purpose:** Unauthenticated partner visiting accept URL is redirected to /signup with returnTo preserved. After creating account, they land back on the accept page and can co-sign.

**Note:** In P422 Risk 1 was resolved to Option A — redirect to `/signup?returnTo=...&token=...`. This test verifies the redirect and return URL mechanics.

```typescript
test('unauthenticated partner redirected to signup with returnTo — lands back on accept page after auth', async ({ page }) => {
  const token = `test-token-${Date.now()}`;
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  // Create pending agreement with known token
  const { data: agreement } = await supabaseAdmin
    .from('clarity_agreements')
    .insert({
      creator_profile_id: creator.user.id,
      partner_email: `p422-unauth-${Date.now()}@gmail.com`,
      terms_text: 'Test terms for unauth acceptance.',
      status: 'pending',
      visibility: 'private',
      invitation_token: token,
      invitation_expires_at: expiresAt,
    })
    .select()
    .single();

  // Visit accept page as unauthenticated user (no setTestSession)
  await page.goto(`/agreements/${agreement.id}/accept?token=${token}`);
  await page.waitForLoadState('networkidle');

  // Agreement text should be readable before auth (spec: partner can read before committing to sign up)
  await expect(page.getByText(/We all crave being understood/i)).toBeVisible({ timeout: 10000 });

  // Auth prompt should appear (not a hard block — content visible first)
  await expect(page.getByRole('link', { name: /create account/i }).or(
    page.getByRole('button', { name: /create account/i })
  )).toBeVisible({ timeout: 5000 });

  // Clicking sign up should carry returnTo with token
  const [navigationUrl] = await Promise.all([
    page.waitForURL(/\/signup/, { timeout: 10000 }),
    page.getByRole('link', { name: /create account/i }).click().catch(() =>
      page.getByRole('button', { name: /create account/i }).click()
    ),
  ]);

  // returnTo in URL preserves the accept path and token
  expect(page.url()).toContain('returnTo=');
  expect(page.url()).toContain(agreement.id);

  // Cleanup
  await supabaseAdmin.from('clarity_agreements').delete().eq('id', agreement.id);
});
```

---

#### TC-05: Partner declines → decline landing shown, creator sees declined state

**Purpose:** Decline confirmation flow. Decliner sees the decline landing page. Agreement is marked declined in DB.

```typescript
test('partner declines agreement → decline landing shown, agreement marked declined', async ({ page }) => {
  const { data: agreement } = await supabaseAdmin
    .from('clarity_agreements')
    .insert({
      creator_profile_id: creator.user.id,
      partner_email: partner.email,
      terms_text: 'We commit to monthly sessions.',
      status: 'pending',
      visibility: 'private',
    })
    .select()
    .single();

  await setTestSession(page, partner.email);
  await page.goto(`/agreements/${agreement.id}/accept`);
  await page.waitForLoadState('networkidle');

  // Click Decline
  await page.getByRole('button', { name: /decline/i }).click();

  // Confirmation dialog
  await expect(page.getByRole('dialog', { name: /decline/i })
    .or(page.getByText(/are you sure/i))).toBeVisible({ timeout: 5000 });

  // Confirm decline
  await page.getByRole('button', { name: /confirm decline/i }).click();

  // Decline landing page
  await expect(page.getByText(/you've declined this invitation/i)).toBeVisible({ timeout: 10000 });
  await expect(page.getByText(/no further action is needed/i)).toBeVisible();

  // Agreement is declined in DB
  const { data: updated } = await supabaseAdmin
    .from('clarity_agreements')
    .select('status')
    .eq('id', agreement.id)
    .single();
  expect(updated?.status).toBe('declined');

  // Cleanup
  await supabaseAdmin.from('clarity_agreements').delete().eq('id', agreement.id);
});
```

---

#### TC-06: Invitation expires (7 days) → expired banner shown, resend invitation flow

**Purpose:** When the invitation token is expired, the creator sees an expired banner with a "Resend Invitation" button. Clicking it regenerates the token and resets the expiry.

```typescript
test('expired invitation shows expired banner — resend generates new token', async ({ page }) => {
  const expiredAt = new Date(Date.now() - 1000).toISOString(); // expired 1 second ago

  const { data: agreement } = await supabaseAdmin
    .from('clarity_agreements')
    .insert({
      creator_profile_id: creator.user.id,
      partner_email: partner.email,
      terms_text: 'Test terms.',
      status: 'pending',
      visibility: 'private',
      invitation_expires_at: expiredAt,
    })
    .select()
    .single();

  const originalToken = agreement.invitation_token;

  await setTestSession(page, creator.email);
  await page.goto(`/agreements/${agreement.id}`);
  await page.waitForLoadState('networkidle');

  // Expired banner shown
  await expect(page.getByText(/invitation has expired/i)).toBeVisible({ timeout: 10000 });
  await expect(page.getByRole('button', { name: /resend invitation/i })).toBeVisible();

  // Click resend
  await page.getByRole('button', { name: /resend invitation/i }).click();

  // Pending banner returns (expired banner goes away)
  await expect(page.getByText(/pending co-signature/i)).toBeVisible({ timeout: 10000 });
  await expect(page.getByText(/invitation has expired/i)).not.toBeAttached({ timeout: 5000 });

  // Token rotated in DB
  const { data: refreshed } = await supabaseAdmin
    .from('clarity_agreements')
    .select('invitation_token, invitation_expires_at')
    .eq('id', agreement.id)
    .single();
  expect(refreshed?.invitation_token).not.toBe(originalToken);
  expect(new Date(refreshed!.invitation_expires_at) > new Date()).toBe(true);

  // Cleanup
  await supabaseAdmin.from('clarity_agreements').delete().eq('id', agreement.id);
});
```

---

#### TC-07: Either party terminates → terminated state shown, other party sees terminated banner

**Purpose:** Either party can terminate. After termination the certificate shows a red TERMINATED banner.

**Two sub-tests:** one where creator terminates, one where partner terminates.

```typescript
test('creator terminates active agreement → terminated banner shown on certificate', async ({ page }) => {
  // Set up active agreement directly in DB
  const { data: agreement } = await supabaseAdmin
    .from('clarity_agreements')
    .insert({
      creator_profile_id: creator.user.id,
      partner_profile_id: partner.user.id,
      partner_email: partner.email,
      terms_text: 'We commit to monthly sessions.',
      status: 'active',
      visibility: 'public',
      partner_signed_at: new Date().toISOString(),
    })
    .select()
    .single();

  await setTestSession(page, creator.email);
  await page.goto(`/agreements/${agreement.id}`);
  await page.waitForLoadState('networkidle');

  // Agreement is active — party banner shown
  await expect(page.getByText(/active/i)).toBeVisible({ timeout: 10000 });

  // Open [···] menu and click Terminate
  await page.getByRole('button', { name: /more options/i })
    .or(page.locator('[aria-label*="more"]'))
    .or(page.getByText('···')).click();
  await page.getByRole('menuitem', { name: /terminate agreement/i }).click();

  // Confirmation dialog
  await expect(page.getByRole('dialog')).toBeVisible({ timeout: 5000 });
  await expect(page.getByText(/will be archived/i)).toBeVisible();

  // Confirm termination
  await page.getByRole('button', { name: /terminate agreement/i }).last().click();

  // Terminated banner shown
  await expect(page.getByText(/terminated/i)).toBeVisible({ timeout: 10000 });

  // DB record updated
  const { data: terminated } = await supabaseAdmin
    .from('clarity_agreements')
    .select('status, terminated_by')
    .eq('id', agreement.id)
    .single();
  expect(terminated?.status).toBe('terminated');
  expect(terminated?.terminated_by).toBe(creator.user.id);

  // Cleanup
  await supabaseAdmin.from('clarity_agreements').delete().eq('id', agreement.id);
});

test('partner terminates active agreement → terminated banner shown on certificate', async ({ page }) => {
  const { data: agreement } = await supabaseAdmin
    .from('clarity_agreements')
    .insert({
      creator_profile_id: creator.user.id,
      partner_profile_id: partner.user.id,
      partner_email: partner.email,
      terms_text: 'Monthly sessions.',
      status: 'active',
      visibility: 'public',
      partner_signed_at: new Date().toISOString(),
    })
    .select()
    .single();

  await setTestSession(page, partner.email);
  await page.goto(`/agreements/${agreement.id}`);
  await page.waitForLoadState('networkidle');

  await page.getByRole('button', { name: /more options/i })
    .or(page.locator('[aria-label*="more"]'))
    .or(page.getByText('···')).click();
  await page.getByRole('menuitem', { name: /terminate agreement/i }).click();
  await page.getByRole('button', { name: /terminate agreement/i }).last().click();

  await expect(page.getByText(/terminated/i)).toBeVisible({ timeout: 10000 });

  const { data: terminated } = await supabaseAdmin
    .from('clarity_agreements')
    .select('status, terminated_by')
    .eq('id', agreement.id)
    .single();
  expect(terminated?.status).toBe('terminated');
  expect(terminated?.terminated_by).toBe(partner.user.id);

  // Cleanup
  await supabaseAdmin.from('clarity_agreements').delete().eq('id', agreement.id);
});
```

---

#### TC-08: Public agreement visible on profile without auth

**Purpose:** A public, active agreement appears in the "Partner Agreements" section of both parties' profile pages without authentication.

```typescript
test('public active agreement visible on profile page without authentication', async ({ page }) => {
  const { data: agreement } = await supabaseAdmin
    .from('clarity_agreements')
    .insert({
      creator_profile_id: creator.user.id,
      partner_profile_id: partner.user.id,
      partner_email: partner.email,
      terms_text: 'Public agreement terms.',
      status: 'active',
      visibility: 'public',
      partner_signed_at: new Date().toISOString(),
    })
    .select()
    .single();

  // Unauthenticated visit to creator's profile
  await page.goto(`/p/${creator.slug}`);
  await page.waitForLoadState('networkidle');

  // Partner Agreements section visible
  await expect(page.getByText('Partner Agreements')).toBeVisible({ timeout: 10000 });

  // Agreement row shows both names
  await expect(page.getByText('P422 Creator')).toBeVisible();
  await expect(page.getByText('P422 Partner')).toBeVisible();

  // View Agreement link exists and navigates to the certificate
  const viewLink = page.getByRole('link', { name: /view agreement/i });
  await expect(viewLink).toBeVisible();
  await viewLink.click();

  await expect(page).toHaveURL(`/agreements/${agreement.id}`, { timeout: 10000 });
  await expect(page.getByText(/active/i)).toBeVisible({ timeout: 10000 });

  // Cleanup
  await supabaseAdmin.from('clarity_agreements').delete().eq('id', agreement.id);
});
```

---

#### TC-09: Private agreement NOT visible to non-party visitors

**Purpose:** A private agreement does not appear on the profile for non-party authenticated visitors, and navigating to the certificate URL shows "This agreement is private."

```typescript
test('private agreement hidden from non-party profile visitors', async ({ page }) => {
  const { data: agreement } = await supabaseAdmin
    .from('clarity_agreements')
    .insert({
      creator_profile_id: creator.user.id,
      partner_profile_id: partner.user.id,
      partner_email: partner.email,
      terms_text: 'Private agreement terms.',
      status: 'active',
      visibility: 'private',
      partner_signed_at: new Date().toISOString(),
    })
    .select()
    .single();

  // Log in as a non-party visitor
  await setTestSession(page, visitorUser.email);

  // Visit creator's profile — no Partner Agreements section for private agreements
  await page.goto(`/p/${creator.slug}`);
  await page.waitForLoadState('networkidle');

  // Section either absent, or present but with no agreement rows
  const agreementRow = page.getByRole('article', { name: /agreement with/i });
  await expect(agreementRow).not.toBeAttached({ timeout: 5000 });

  // Navigate to the agreement certificate directly — should be blocked
  await page.goto(`/agreements/${agreement.id}`);
  await page.waitForLoadState('networkidle');

  await expect(
    page.getByText(/private/i).or(page.getByText(/not found/i)).or(page.getByText(/access denied/i))
  ).toBeVisible({ timeout: 10000 });

  // Cleanup
  await supabaseAdmin.from('clarity_agreements').delete().eq('id', agreement.id);
});
```

---

#### TC-10: Creator without a name set → inline error on /agreements/new

**Purpose:** If the creator's profile has no display name, the form shows an inline error at the name position inside the certificate frame, and the form cannot be submitted.

```typescript
test('creator with no name set sees inline error and cannot submit', async ({ page }) => {
  // Create a user without a name
  const namelessUser = await createTestUser({ name: '' });
  // Explicitly null out the name in profiles
  await supabaseAdmin.from('profiles').update({ name: null }).eq('id', namelessUser.user.id);

  await setTestSession(page, namelessUser.email);
  await page.goto('/agreements/new');
  await page.waitForLoadState('networkidle');

  // Inline error where creator name would appear
  await expect(
    page.getByText(/add your name in settings/i).or(
      page.getByText(/please add your name/i)
    )
  ).toBeVisible({ timeout: 10000 });

  // Submit button should be disabled or absent
  const submitButton = page.getByRole('button', { name: /seal & invite partner/i });
  if (await submitButton.isVisible()) {
    await expect(submitButton).toBeDisabled();
  }

  // Cleanup
  await deleteTestUser(namelessUser.user.id);
});
```

---

#### TC-11: Creator invites themselves → inline error

**Purpose:** Entering the creator's own email triggers an immediate inline error and keeps the submit disabled.

```typescript
test('creator entering their own email sees inline error — submit disabled', async ({ page }) => {
  await setTestSession(page, creator.email);

  await page.goto('/agreements/new');
  await page.waitForLoadState('networkidle');

  // Enter own email
  await page.getByLabel(/partner.*email/i).fill(creator.email);
  // Trigger blur/change
  await page.keyboard.press('Tab');

  // Inline error
  await expect(
    page.getByText(/cannot create an agreement with yourself/i).or(
      page.getByText(/you cannot invite yourself/i)
    )
  ).toBeVisible({ timeout: 5000 });

  // Submit disabled
  const submitButton = page.getByRole('button', { name: /seal & invite partner/i });
  await expect(submitButton).toBeDisabled({ timeout: 3000 });
});
```

---

### Unit / Service Tests

These test the `agreements-service-real.ts` and `agreements-service-mock.ts` logic. Files to create by `/dev`: `src/app/data/__tests__/agreements-service.test.ts`.

**Pattern:** Vitest unit tests with a mock Supabase client. Follow the same structure as existing `*-service` tests in the project.

---

#### UT-01: `hasActiveAgreementWith` — returns true when active agreement exists

```
describe('hasActiveAgreementWith', () => {
  it('returns true when an active agreement exists between creator and partner email', async () => {
    // Seed: one agreement with status='active' matching creatorProfileId + partnerEmail
    // Call: hasActiveAgreementWith(creatorId, partnerEmail)
    // Assert: returns true
  });

  it('returns false when only a terminated agreement exists', async () => {
    // Seed: terminated agreement
    // Assert: returns false
  });

  it('returns false when no agreement exists', async () => {
    // Assert: returns false
  });
});
```

---

#### UT-02: `getAgreementByToken` — returns null for expired token

```
describe('getAgreementByToken', () => {
  it('returns null for an expired token (invitation_expires_at in the past)', async () => {
    // Seed: pending agreement with invitation_expires_at = now() - 1 day
    // Call: getAgreementByToken(token)
    // Assert: returns null
  });

  it('returns null for an already-active agreement token (status != pending)', async () => {
    // Seed: active agreement (partner already accepted)
    // Call: getAgreementByToken(token)
    // Assert: returns null
  });

  it('returns the agreement for a valid pending token within expiry', async () => {
    // Seed: pending agreement with future expiry
    // Assert: returns ClarityAgreement with correct id
  });
});
```

---

#### UT-03: `getAgreementsForProfile` — filters private agreements from non-party viewers

```
describe('getAgreementsForProfile', () => {
  it('returns public active agreements to any viewer (null viewerProfileId)', async () => {
    // Seed: public active agreement
    // Call: getAgreementsForProfile(profileId, null)
    // Assert: agreement included
  });

  it('returns private active agreements to party viewers', async () => {
    // Seed: private active agreement
    // Call with creatorProfileId as viewerProfileId
    // Assert: agreement included
  });

  it('excludes private active agreements from non-party viewers', async () => {
    // Seed: private active agreement
    // Call with unrelated viewerProfileId
    // Assert: agreement NOT included
  });

  it('excludes pending agreements from non-owner viewers', async () => {
    // Seed: pending agreement
    // Call with a third-party viewerProfileId
    // Assert: pending agreement NOT included
  });
});
```

---

#### UT-04: `terminateAgreement` — rejects if caller is not a party

```
describe('terminateAgreement', () => {
  it('returns false and does not update when caller is not creator or partner', async () => {
    // Seed: active agreement between userA and userB
    // Call terminateAgreement(agreementId) as userC (neither party)
    // Assert: returns false, status unchanged in DB
  });

  it('succeeds when creator terminates', async () => {
    // Call as creator
    // Assert: returns true, status = 'terminated', terminated_by = creator.id
  });

  it('succeeds when partner terminates', async () => {
    // Call as partner
    // Assert: returns true, status = 'terminated', terminated_by = partner.id
  });
});
```

---

### Test Helpers to Create

A new helper file `e2e/helpers/test-agreement.ts` (mirrors `test-event.ts` pattern):

```typescript
export interface TestAgreement {
  id: string;
  invitationToken: string;
}

export async function createTestAgreement(
  creatorProfileId: string,
  partnerProfileId: string,
  partnerEmail: string,
  overrides?: Partial<{
    status: string;
    visibility: string;
    termsText: string;
    invitationExpiresAt: string;
    invitationToken: string;
    partnerSignedAt: string;
  }>
): Promise<TestAgreement>

export async function deleteTestAgreement(id: string): Promise<void>
```

Use `createTestAgreement` in all E2E tests instead of raw `supabaseAdmin.from('clarity_agreements').insert(...)` to reduce boilerplate.

---

### Display ID Assertion Pattern

Per Architecture Risk 4, the `display_id` sequence does not reset between test runs. Tests that check the display ID must match the pattern, not a literal:

```typescript
// Good
expect(displayId).toMatch(/^A-\d{4,}$/);

// Bad — fragile
expect(displayId).toBe('A-0001');
```

---

## Implementation Tasks

> Generated by /decompose. Each task is scoped to 1–3 files and independently verifiable.
> Run /dev to execute — it will dispatch one subagent per task in dependency order.
>
> ⚠️ **Before starting:** Remove the stale observer AC (`Creator can add observer emails at creation`) from `## Acceptance Criteria` — observers are deferred to P430. And use "Our terms:" label on the acceptance page certificate (section 2.3), not "I additionally commit to:".

---

### Task 1: DB Migration
- **Files:** `supabase/migrations/20260224150000_p422_clarity_agreements.sql` (create)
- **Spec refs:** "Architecture > 1. Database Schema (lines ~1034–1120)", "Architecture > 2. RLS Policies (lines ~1124–1167)", "Architecture > 9. Migration Filename (lines ~1482–1490)"
- **Depends on:** None
- **Verify:** `./scripts/migrate.sh` succeeds; `clarity_agreements` table exists in Supabase with `display_id` A-NNNN trigger; all 3 RLS policies present
- [ ] Complete

### Task 2: Service Interface + Types
- **Files:** `src/app/data/agreements-service.interface.ts` (create)
- **Spec refs:** "Architecture > 3.2 Service interface (lines ~1198–1266)"
- **Depends on:** None
- **Verify:** `npx tsc --noEmit` passes; all types (`ClarityAgreement`, `AgreementParty`, `AgreementStatus`, `AgreementVisibility`, `AgreementsService`) exported
- [ ] Complete

### Task 3: Email Helper
- **Files:** `src/lib/agreement-emails.ts` (create)
- **Spec refs:** "Architecture > 4. Edge Function > invokeAgreementEmails helper (lines ~1339–1354)"
- **Depends on:** None
- **Verify:** `npx tsc --noEmit` passes; `invokeAgreementEmails` exported with correct action union type
- [ ] Complete

### Task 4: Edge Function
- **Files:** `supabase/functions/send-agreement-emails/index.ts` (create)
- **Spec refs:** "Architecture > 4. Edge Function (lines ~1315–1368)"
- **Depends on:** Task 1, Task 3
- **Verify:** `supabase functions deploy send-agreement-emails` succeeds; invitation action sends email to `partner_email`; accept/decline actions validate token and update status via service role
- [ ] Complete

### Task 5: Real Service
- **Files:** `src/app/data/agreements-service-real.ts` (create)
- **Spec refs:** "Architecture > 3.3 Real service (lines ~1269–1311)"
- **Depends on:** Task 1, Task 2
- **Verify:** `npx tsc --noEmit` passes; all 8 `AgreementsService` methods implemented; `getAgreementsForProfile` uses `Promise.all` for profile batch-fetch (no N+1); lazy expiry logic in `getAgreement`
- [ ] Complete

### Task 6: Mock Service + Feature Flag
- **Files:** `src/app/data/agreements-service-mock.ts` (create), `src/app/data/agreements-service.ts` (create)
- **Spec refs:** "Architecture > 3.4 Feature flag (lines ~1303–1311)"
- **Depends on:** Task 2
- **Verify:** `VITE_USE_REAL_AGREEMENTS_API=false` returns mock data for all methods; feature flag export compiles; add `VITE_USE_REAL_AGREEMENTS_API=true` to `.env.local`
- [ ] Complete

### Task 7: Certificate Component
- **Files:** `src/app/components/agreements/agreement-certificate.tsx` (create)
- **Spec refs:** "UX Design > 2.1 Create Agreement Page (lines ~351–469)", "UX Design > 2.4 Active Agreement Certificate Page (lines ~614–750)"
- **Depends on:** Task 2
- **Verify:** Renders double-border frame (outer 8px solid #002B5C, inner outline); Playfair Display for commitment text; bilateral pledge text sections (YOUR RIGHT, OUR PROMISE, THE EXCEPTION); "Our terms:" label; creator/partner signature slots; accepts variant props for creation/pending/active/celebration states
- [ ] Complete

### Task 8: Row + Profile Section Components
- **Files:** `src/app/components/agreements/agreement-row.tsx` (create), `src/app/components/agreements/profile-agreements-section.tsx` (create)
- **Spec refs:** "UX Design > 2.7 Profile Agreements Section (lines ~900–1027)"
- **Depends on:** Task 2, Task 7
- **Verify:** 5 viewer states render correctly (own-empty, own-nonempty, visitor-public, visitor-is-party, visitor-no-public); terminated rows shown on own profile; declined rows hidden; `agreement-row` shows partner name + seal date + duration + status badge
- [ ] Complete

### Task 9: Celebration Dialog
- **Files:** `src/app/components/agreements/celebration-dialog.tsx` (create)
- **Spec refs:** "UX Design > 1.2 Invitation/Acceptance Flow (lines ~276–308)", "UX Design > Celebration state"
- **Depends on:** Task 7
- **Verify:** Shows `✦ Agreement Sealed ✦` heading; certificate frame rendered inside dialog; /live Google Calendar CTA link present; "View Agreement" button navigates to `/agreements/[id]`
- [ ] Complete

### Task 10: Create Agreement Page
- **Files:** `src/app/pages/create-agreement-page.tsx` (create)
- **Spec refs:** "UX Design > 1.1 Creation Flow (lines ~249–274)", "UX Design > 2.1 Create Agreement Page (lines ~351–469)"
- **Tests:** `e2e/agreements.spec.ts` (TC-01, TC-12 self-invite error, TC-13 no-name error)
- **Depends on:** Task 2, Task 3, Task 5 (or Task 6 for mock mode), Task 7
- **Verify:** Partner email live-lookup shows avatar/name or "new user" message after 400ms debounce; "Our terms:" label with pre-filled 6-variable template; submit → calls `createAgreement` → navigates to pending state; self-invite and no-name errors display inline; visibility toggle (Private default, Shared disabled)
- [ ] Complete

### Task 11: Agreement Page (state-branched)
- **Files:** `src/app/pages/agreement-page.tsx` (create)
- **Spec refs:** "UX Design > 2.2 Pending Agreement Page (lines ~472–538)", "UX Design > 2.4 Active Certificate Page (lines ~614–750)", "UX Design > 2.4a Declined Page (lines ~586–611)", "UX Design > 2.5 Terminated Page"
- **Tests:** `e2e/agreements.spec.ts` (TC-03 active, TC-05 declined creator view, TC-07 terminated, TC-08 public visible, TC-09 private gated)
- **Depends on:** Task 2, Task 3, Task 5 (or Task 6), Task 7, Task 9
- **Verify:** Pending state shows half-signed certificate + clock symbol + resend button (creator only); active state shows both signatures + terminate button; declined state shows muted certificate + creator-only banner; terminated state shows terminated banner + history; private agreement returns 403/redirect for non-parties
- [ ] Complete

### Task 12: Accept Agreement Page
- **Files:** `src/app/pages/accept-agreement-page.tsx` (create)
- **Spec refs:** "UX Design > 1.2 Invitation/Acceptance Flow (lines ~276–308)", "UX Design > 2.3 Partner Acceptance Page (lines ~540–583)", "Architecture > 8. Risk 1 Option A (lines ~1456–1458)"
- **Tests:** `e2e/agreements.spec.ts` (TC-02 existing user accept, TC-04 new user redirect)
- **Depends on:** Task 2, Task 3, Task 5 (or Task 6), Task 7
- **Verify:** Reads agreement by token; unauthenticated partner sees full certificate + "Create Account / Log In" banner before signing; authenticated partner sees pre-filled name + [I Accept & Co-Sign ✦]; accept → calls edge function → shows celebration dialog; decline → confirmation → calls edge function → redirects to `/agreements/[id]/declined`; expired token shows "invitation expired" message; "Our terms:" label (not "I additionally commit to:")
- [ ] Complete

### Task 13: Declined Agreement Page
- **Files:** `src/app/pages/declined-agreement-page.tsx` (create)
- **Spec refs:** "UX Design > 1.4 Decline Flow (lines ~326–336)"
- **Tests:** `e2e/agreements.spec.ts` (TC-05)
- **Depends on:** Task 2
- **Verify:** Static page; no auth required; shows "You declined this agreement. This page is no longer active."; no certificate rendered
- [ ] Complete

### Task 14: Routing + Types Wiring
- **Files:** `src/App.tsx` (modify), `src/app/types/index.ts` (modify)
- **Spec refs:** "Architecture > 5. Files to Modify (lines ~1395–1404)", "Architecture > 6. Route Structure (lines ~1407–1417)"
- **Depends on:** Task 10, Task 11, Task 12, Task 13
- **Verify:** All 4 routes lazy-loaded and resolve in browser (`/agreements/new`, `/agreements/:id`, `/agreements/:id/accept`, `/agreements/:id/declined`); `ClarityAgreement`, `AgreementParty`, `AgreementStatus`, `AgreementVisibility` exported from `src/app/types/index.ts`; `npx tsc --noEmit` passes
- [ ] Complete

### Task 15: Profile Page Integration
- **Files:** `src/app/pages/profile-page-v2.tsx` (modify)
- **Spec refs:** "UX Design > 2.7 Profile Agreements Section (lines ~900–1027)", "Architecture > 5. Modified files (lines ~1399–1402)"
- **Tests:** `e2e/agreements.spec.ts` (TC-08 public profile, TC-09 private gated, TC-10 party-viewer)
- **Depends on:** Task 5 (service), Task 8 (components), Task 14 (routing)
- **Verify:** `<ProfileAgreementsSection>` renders below Pledges section; agreements query runs in `Promise.all` with existing profile queries (not sequential); section has independent loading skeleton; public agreements visible to visitors; private agreements hidden from non-parties
- [ ] Complete

### Task 16: E2E Test File
- **Files:** `e2e/agreements.spec.ts` (create)
- **Spec refs:** "Test Scenarios (lines ~1518–2302)"
- **Depends on:** Tasks 1–15 (all implementation complete)
- **Verify:** `npm run test:e2e -- agreements.spec.ts` passes all 11 test cases; uses `createTestAgreement` / `deleteTestAgreement` helpers; display ID assertions use pattern `/^A-\d{4,}$/` not literal values
- [ ] Complete

---

**Total tasks:** 16 | **Can parallelize (Wave 1):** Task 1, Task 2, Task 3 (no shared dependencies) | **Can parallelize (Wave 2):** Task 4, Task 5, Task 6 (after Wave 1) | **Can parallelize (Wave 3):** Task 7 (after Task 2) | **Can parallelize (Wave 4):** Task 8, Task 9 (after Task 7) | **Can parallelize (Wave 5):** Task 10, Task 11, Task 12, Task 13 (after Wave 4) | **Must be sequential:** Task 14 → Task 15 → Task 16
