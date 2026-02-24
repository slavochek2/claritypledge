---
status: week
type: story
rank: 8.0
milestone: M2
tags: [clarity-partner, agreement, co-founders, accountability, relationships]
prepped_date: '2026-02-24'
delivery_stage: ux-review
depends_on: [p424]
reviews:
  ux: '2026-02-24'
  architect: null
  alignment: null
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
- Either party can file a session request at any time under an active agreement
- Session requests are delivered as in-app notifications with email fallback (tracked delivery)
- A /live session between the two parties automatically counts as fulfilling an open session request if at least one complete paraphrase round occurred — meaning both a listener estimate and a speaker rating were submitted. This mirrors the calibration counting logic. A session that starts but never reaches a completed paraphrase exchange does not count
- No manual marking of sessions as fulfilled — attribution is automatic
- Agreement creator selects visibility at creation: private (both parties + confirmed observers only) or public (anyone can view). "Shared" does not apply to agreements — there is no event context. Aligns with P424 visibility model
- Creator can add observer emails at creation (or later); observers receive an invitation, must confirm their role (register + accept), and are then notified on deadline breach and "late" request state. Observers see: agreement existence, status, and breach notifications — not individual session content. Each observer invitation is a user acquisition opportunity
- Both parties are stored as user references (not just emails), not ephemeral identifiers
- Compliance data is tracked: requests filed, sessions completed, average response time
- Agreement health view showing tracked compliance metrics is visible to both parties
- Either party can terminate the agreement; both parties and observers are notified. No pause concept in V1
- Agreements are discoverable on user profiles per visibility setting

**Success conditions:**

- Two users can establish a bilateral commitment in under 5 minutes
- Session requests are responded to (booked) within the configured deadline in the majority of cases
- Agreements remain active and produce sessions over a multi-week period (not abandoned after first session)
- Users report that having the agreement made it easier to initiate a difficult or routine conversation

**Constraints:**

- V1 is strictly bilateral — no group agreements, no observer role (deferred)
- V1 does not build a general connections/network model — store user references only, do not create a connections graph
- Fulfillment attribution is automatic and non-negotiable — no manual override in V1 (to prevent gaming)
- Visibility model: private / public only (no "shared" — no event context for agreements). Private = both parties + confirmed observers. Public = anyone. Aligns with P424
- Observer role is V1 (not deferred). Observers are read-only; they cannot file requests. Observer invitation = user acquisition path
- Natural onboarding path: commitment to the agreement presupposes experience with /live sessions. The product does not block invitations technically, but the design and copy should guide toward "experience /live first, then formalize." The path to the agreement ideally runs through specific /live sessions and stories that build shared understanding of what the contract means

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
- [ ] Creator can add observer emails at creation; additional observers can be added later
- [ ] Invitation is sent to the second party (in-app notification + email fallback)
- [ ] Agreement is in "pending" state until second party accepts
- [ ] If second party declines or does not respond within a configurable window, agreement is marked as declined/expired

**Agreement Activation:**
- [ ] Second party can view full agreement terms before accepting or declining
- [ ] Accepting activates the agreement; declining closes it with no active state
- [ ] Both parties are stored as user references (not ephemeral identifiers)
- [ ] Both parties receive confirmation when the agreement becomes active

**Session Requests:**
- [ ] Either party under an active agreement can file a session request
- [ ] Filed request is delivered to the other party (in-app notification + email fallback) and delivery is tracked
- [ ] Recipient can respond to a session request by booking a /live session
- [ ] Open session requests are visible to both parties

**Session Fulfillment:**
- [ ] A /live session between the two parties automatically closes the oldest open session request if at least one complete paraphrase round occurred (listener estimate + speaker rating both submitted)
- [ ] Automatic attribution requires no manual action from either party
- [ ] Fulfilled session is recorded with timestamp and session reference

**Compliance Tracking:**
- [ ] Both parties can view: total requests filed, total sessions completed, average response time vs. configured deadline
- [ ] Compliance data is updated automatically when sessions are completed
- [ ] Agreement health view is accessible to both parties only (regardless of agreement visibility setting)

**Visibility:**
- [ ] Public agreements are visible on both parties' profiles to any authenticated user
- [ ] Semi-public agreements are visible on profiles only to 2nd-degree connections (defined by /live session history)
- [ ] Non-parties can see agreement existence and status but NOT compliance details

**Observers:**
- [ ] Observers receive an email invitation with the agreement terms and an explicit "accept observer role" action
- [ ] Accepted observers are notified when: a session request goes "late" (deadline passed), agreement is terminated, agreement expires
- [ ] Observers see: agreement existence, status, "late" flags — not individual session content or compliance scores
- [ ] Observer invitation is a user acquisition path — non-registered observers are prompted to sign up on acceptance

**Lifecycle:**
- [ ] Either party can terminate an agreement; both parties and observers are notified; agreement is archived not deleted
- [ ] Expired agreements (optional expiry date reached) are automatically archived
- [ ] Terminated or expired agreements remain viewable as history by both parties
- [ ] No pause concept in V1

**Constraints validation:**
- [ ] V1 rejects any attempt to add more than 2 parties to a single agreement
- [ ] No manual override for session fulfillment attribution exists in V1 UI
- [ ] Invitation flow design and copy guides toward "experience /live first, then formalize" — no technical block, but UX should make the prerequisite clear

---

## Decisions Log

All resolved before UX:

1. **Fulfillment threshold:** A session counts if at least one complete paraphrase round occurred (listener estimate + speaker rating both submitted). Mirrors calibration counting logic. Sessions that start but never complete a paraphrase exchange do not count.
2. **Lifecycle:** Terminate only in V1. No pause. If users ask for pause, add it then.
3. **Non-acceptance:** Inviting party is notified of decline. Decline triggers a prompt toward scheduling a /live session first.
4. **Privacy model:** Private / Public only — "Shared" does not apply (no event context for agreements). Aligned with P424. Private = both parties + confirmed observers only.
5. **Deadline breach:** Notification to both parties + "late" state on the open request. Observers also notified.
6. **Observers in V1** (not deferred): Read-only, invited by email, must explicitly accept observer role. Notified on breach / "late" / termination / expiry. Non-registered observers are prompted to sign up on acceptance — user acquisition path.
7. **Violation / breach status:** No auto-breach label on the agreement. Terms are free-text — the app cannot know what constitutes a violation. Instead: "late" badges accumulate visibly on open requests; observers and both parties see them. The agreement stays "active" until someone explicitly terminates. The friction of terminating is itself meaningful. If repeated "late" state is present, observers can intervene. This IS the graceful degradation mechanism.
8. **Email notifications:** Extend existing Mailgun infrastructure (built for event cancellations). No new notification system needed — add agreement-specific templates alongside existing event templates.
9. **Session tracking readiness:** Confirmed via codebase analysis. `clarity_sessions` already stores `creator_profile_id` + `joiner_profile_id` (UUID FKs). `clarity_demo_rounds` stores `speaker_rating` + `listener_self_rating` — both submitted = completed round. Query to detect "users A+B completed a round together" is straightforward. New tables needed: `clarity_agreements`, `agreement_session_requests`, `agreement_fulfillments`. RPC needed for auto-fulfillment detection. Chat verifications require a message join (minor, not blocking).

---

## Next Steps

This is a UI feature with backend persistence and automation logic.

1. Run `/ux features/p422_clarity_partner_agreement.md` — design agreement creation flow, invitation/acceptance screens, session request flow, compliance view, and profile visibility
2. Run `/architect features/p422_clarity_partner_agreement.md` — data model (agreements, requests, fulfillment), session attribution automation, visibility logic, notification system
3. Run `/generate-tests features/p422_clarity_partner_agreement.md` — test coverage including compliance automation and visibility rules
4. Run `/dev features/p422_clarity_partner_agreement.md` — implement

**Related features:**
- P419 / P420 (Filing Chat) — users need stories in the system before /live sessions are meaningful
- P421 (Pre-Session Safety Check) — runs before /live sessions that fulfill agreement requests
- Future: Connections model (P-TBD) — agreement user references will seed this
- Future: Observer role (P-TBD) — third party visibility into agreement compliance

---

## UX Design

### Overview

The Clarity Partner Agreement UX is built on two core ideas: (1) the agreement IS the Clarity Pledge, scoped to a specific person, so the same certificate frame and pledge text are reused without modification; (2) signing feels like a ceremony, not a form — the document is the interface. All screens inherit the double-border certificate frame, Playfair Display serif for commitment text, cream (#FDFBF7) background, navy (#002B5C), and blue (#0044CC) from the existing pledge design system.

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
  │    └─ New user: trigger registration flow (magic link or Google)
  │         → on auth: activation + celebration dialog
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

**Pledge text section (full pledge text, rendered identically to sign-pledge-form.tsx):**

```
I, [creator name — read-only, shown as bold text, not an input], hereby commit
to everyone—including strangers, people I disagree with, and even those I dislike:

YOUR RIGHT
[YourRightTextTailwind — same component, v3]

MY PROMISE
[MyPromiseTextTailwind — same component, v3]

THE EXCEPTION
[ExceptionTextTailwind — same component]
```

The creator's name is pre-filled from their profile and shown as bold serif text (not an editable input). It is not a form field — it comes from the authenticated user's profile. If no name is set, show a red inline error: "Please add your name in Settings before creating an agreement."

**"Specifically with:" subsection (inside the frame, after the pledge text):**

Separated by a thin horizontal rule (border-[#1A1A1A]/20). Heading: "Specifically with:" — text-sm, #1A1A1A/70.

Partner email input:
- Underline-only input (border-0 border-b-2 border-[#1A1A1A] rounded-none bg-transparent focus-visible:ring-0 focus-visible:border-[#0044CC] px-0)
- Placeholder: "partner@email.com"
- On valid email entry after 400ms debounce: live user lookup
  - Found: show avatar + name inline below the input (green check icon, avatar circle, "Found: [Full Name]")
  - Not found: show "New user — they'll be invited to register when they accept." in muted text
  - Loading: pulsing skeleton row

**"I additionally commit to:" subsection (inside the frame):**

Heading: "I additionally commit to:" — text-sm, #1A1A1A/70.

Terms textarea:
- Pre-filled default: `"We commit to honoring each other's session requests within 14 days."`
- Underline-only style: border-0 border-b-2 border-[#1A1A1A] rounded-none bg-transparent focus-visible:ring-0 focus-visible:border-[#0044CC] resize-none
- Min rows: 3, auto-expands
- Character count: shown bottom-right, max 500 characters
- The number "14" in the default text is visually bolded to signal it is the key editable variable, but the entire text is freely editable

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
- Below button: helper text "By creating, you agree to our Terms & Privacy." — 10px/12px, centered, muted, same style as pledge form

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
I additionally commit to:
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
Partner Agreements  (N public)
```
- "Partner Agreements" — h2 equivalent, font-bold
- "(N public)" — muted, text-sm, shows count of public agreements for this profile

**Agreement row (for each agreement):**
```
┌─────────────────────────────────────────────────────────────┐
│  🤝  [Your Name] & [Partner Name]  ·  Active [N] months    │
│      Sealed [Month Year]                [View Agreement →]  │
└─────────────────────────────────────────────────────────────┘
```
- Border: 1px solid border-input, rounded-lg
- 🤝 is replaced with a paired-avatar display: two overlapping PersonAvatar components (same -space-x-2 pattern as social proof on sign-pledge-page), 32px each
- "Active N months" is computed from sealed date
- [View Agreement →] is a text link (text-[#0044CC], underline on hover)
- The row itself is not clickable — only the explicit link is, to avoid accidental navigation

**Empty state (no public agreements, viewing someone else's profile):**

Not shown. If there are no public agreements, the section is hidden entirely from non-party viewers.

**Empty state (own profile, no agreements yet):**
```
Partner Agreements

  You haven't created any Partner Agreements yet.
  Formalize your commitment to calibrated communication
  with a co-founder, accountability partner, or collaborator.

  [+ New Agreement]
```

**[+ New Agreement] button (shown to profile owner, below the list):**
- Outline variant, small, with a "+" icon
- Navigates to /agreements/new
- Position: bottom-right of the section, or below the empty state copy

**Pending agreements (shown to profile owner only, never to visitors):**

Pending rows are shown in a subdued style:
```
┌─────────────────────────────────────────────────────────────┐
│  ⌛  [Your Name] & [partner@email.com]  ·  Pending          │
│      Invited [N days] ago               [View →]            │
└─────────────────────────────────────────────────────────────┘
```
- Background: amber-50/30, border: amber-200/50
- Not shown to profile visitors

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
| "I additionally commit to:" label | "I additionally commit to:" |
| Terms default text | "We commit to honoring each other's session requests within 14 days." |
| Submit button | "Seal & Invite Partner ✦" |
| Submitting state | "Sealing..." |
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

### 7. Routing Summary

| URL | Page | Auth Required |
|---|---|---|
| `/agreements/new` | Create Agreement form | Yes (owner only) |
| `/agreements/[id]` | Agreement view (active or pending) | Public agreements: no. Private: yes + must be a party. |
| `/agreements/[id]/accept` | Partner acceptance page | No (read), Yes (to sign) |
| `/agreements/[id]/declined` | Static decline confirmation | No |

Short IDs (A-0042 format) are display-only. URLs use the full UUID. The display ID is shown in the certificate header and shareable URL text display for readability.
