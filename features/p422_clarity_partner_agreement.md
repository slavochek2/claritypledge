---
status: week
type: story
rank: 8.0
milestone: M2
tags: [clarity-partner, agreement, co-founders, accountability, relationships]
prepped_date: '2026-02-24'
delivery_stage: prd-review
reviews:
  ux: null
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
- Agreement creation requires configuring: minimum session length, minimum session frequency, response deadline for session requests, and optional expiry date
- Agreement is not active until both parties have accepted
- Either party can file a session request at any time under an active agreement
- Session requests are delivered as in-app notifications with email fallback (tracked delivery)
- A /live session between the two parties automatically counts as fulfilling an open session request if it meets: (a) the minimum time threshold, and (b) protocol compliance (paraphrasing + no-interruption thresholds)
- No manual marking of sessions as fulfilled — attribution is automatic
- Agreement creator selects visibility at creation: public (anyone can view) or semi-public (2nd-degree connections only — defined as users who have had at least one /live session with a user connected to either party)
- Both parties are stored as user references (not just emails), not ephemeral identifiers
- Compliance data is tracked: requests filed, sessions completed, average response time
- Agreement health view showing tracked compliance metrics is visible to both parties
- Either party can pause or terminate the agreement; termination is visible to both parties
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
- Visibility model: public or semi-public only — no fully private agreements (if private, there's no accountability and no product advertisement value)
- Onboarding path: the invitation to sign an agreement must never be the first contact between a new user and the product — the user should have participated in at least one /live session or event first. This is a distribution constraint, not a technical one.

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
- [ ] Authenticated user can create an agreement by specifying: partner (user reference), minimum session length, minimum frequency, response deadline, optional expiry date
- [ ] Creator selects visibility: public or semi-public (cannot be fully private)
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
- [ ] A /live session between the two parties automatically closes the oldest open session request if: session duration ≥ configured minimum AND protocol compliance thresholds are met (paraphrasing + no-interruptions)
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

**Lifecycle:**
- [ ] Either party can pause an active agreement; both parties are notified
- [ ] Either party can terminate an agreement; both parties are notified; agreement is archived not deleted
- [ ] Expired agreements (optional expiry date reached) are automatically archived
- [ ] Terminated or expired agreements remain viewable as history by both parties

**Constraints validation:**
- [ ] V1 rejects any attempt to add more than 2 parties to a single agreement
- [ ] No manual override for session fulfillment attribution exists in V1 UI
- [ ] Agreement invitation cannot be sent to a user who has never completed a /live session (distribution constraint — see uncertainty note below)

---

## Open Questions / Uncertainties

**Flagged for resolution before UX/architecture:**

1. **Semi-public definition:** "2nd-degree connections" is defined here as users who have had a /live session with a user connected to either party. This requires the session history graph to be queryable. Confirm this is implementable without a full connections model before committing to the semi-public tier in V1. Alternative: semi-public = visible to users who have had a /live session with either party directly (1st-degree only). Simpler, less rich.

2. **Distribution constraint enforcement:** The requirement that the invitation target must have completed at least one /live session before receiving an agreement invitation is a distribution philosophy, not a hard product rule. Should this be enforced in the product (block sending invitation), enforced via onboarding guidance only, or not enforced at all in V1 and handled via user education?

3. **Non-acceptance as a signal:** The spec notes that non-acceptance of an agreement invitation "is itself a signal." This is a product/philosophical observation. In V1, is there any product behavior tied to non-acceptance (e.g., notification to the inviting party, surfacing in a dashboard), or is it purely a data point for the product team?

4. **Public vs. semi-public in practice:** If the target user has never used ClarityPledge, there are no 2nd-degree connections. The semi-public setting effectively becomes "visible to nobody" until the user builds a session graph. Is this acceptable, or should semi-public have a fallback (e.g., "visible to anyone after 30 days if no connections exist")?

5. **Protocol compliance thresholds for fulfillment:** The spec says fulfillment requires protocol compliance (paraphrasing + no interruptions). Are these the same thresholds used for /live session verification scores, or are they configurable per agreement? V1 assumption: use the existing /live protocol thresholds, not per-agreement configuration.

6. **Pause vs. terminate semantics:** What is the practical difference between pause and terminate? Proposed: pause = requests can't be filed, clock stops, agreement can be resumed; terminate = agreement is closed, new agreement required to resume. Confirm.

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
