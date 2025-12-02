---
stepsCompleted: [1, 2, 3, 4]
inputDocuments: []
workflowType: 'ux-design'
lastStep: 0
project_name: 'claritypledge'
user_name: 'Slava'
date: '2025-12-02'
---

# UX Design Specification: Profile & Sharing Experience v2

**Author:** Slava
**Date:** 2025-12-02
**Scope:** Redesign of the profile owner experience to reduce confusion and encourage sharing

---

## Context from Discovery Conversation

### Problem Statement
The current profile page as seen by the owner is confusing:
1. Banner says "this is how others see your profile" - but that's not accurate (visitors see more functionality)
2. Top banner says "this is how others see your commitment" - also not accurate
3. "Copy Link" button purpose is unclear - what link? why copy?

### User Goals (Priority Order)
1. **Take action** - Share pledge to educate others about their commitment
2. **See engagement** - Who endorsed, who reciprocated (equally important)
3. **Track metrics** - Numbers are secondary motivation

### Sharing Use Cases
- Meeting someone offline → show QR code
- Sending via messenger → copy link
- Proactive outreach → email invite

### Design Direction Discussion
Two potential approaches discussed:
- **Separate spaces**: Profile page (pledge view) + Dashboard (sharing tools, metrics, lists)
- **Unified with modes**: Combined view with owner-only panel

---

## Executive Summary

### Project Vision

Transform the Clarity Pledge owner experience from a confusing "preview mode" into a clear, action-oriented hub that encourages sharing and celebrates engagement. The current page sends mixed signals about what owners are seeing and buries the core action (sharing) behind a generic button.

### Target Users

**Primary: Pledge Owners**
- Professionals who signed the Clarity Pledge
- Goal: Educate others about their commitment and receive acknowledgements
- Context: May share in-person (meetings), via messaging apps, or proactively via email
- Needs: Clear sharing tools, visibility into who responded, motivation to keep sharing

**Secondary: Pledge Visitors**
- People who received a pledge link
- Goal: Understand what this is, what they gain, and optionally accept
- Context: Arriving via shared link, may be skeptical or curious
- Needs: Clear value proposition, easy accept flow, optional reciprocation path

### Key Design Challenges

1. **Page Identity Crisis**: Owner view tries to be preview + dashboard + sharing tool simultaneously
2. **Buried Actions**: Copy Link is the only sharing option, hidden in a banner
3. **Misleading Messaging**: "This is how others see your pledge" appears twice and is inaccurate
4. **Missing Engagement Feedback**: Owners can't quickly see their impact or who responded

### Design Opportunities

1. **Action-Oriented Owner Hub**: Make sharing THE focus when owners view their pledge
2. **Contextual Sharing Options**: QR for meetings, link for messaging, email for proactive outreach
3. **Engagement Celebration**: Frame witness list as "wins" to motivate continued sharing
4. **Clear Information Architecture**: Separate "View My Pledge" from "Share & Track" concerns

---

## Core User Experience

### Defining Experience

The core experience for pledge owners is a **Share → Acknowledge → Celebrate** loop:

1. **Share**: Owner distributes their pledge via the method that fits their context
2. **Acknowledge**: Visitor accepts/endorses the pledge
3. **Celebrate**: Owner sees the acknowledgement and is motivated to share more

The current implementation breaks this loop by hiding sharing tools and not celebrating acknowledgements.

**Primary Success Moment**: The owner successfully shares their pledge link (action taken). This is more critical than seeing feedback - without sharing, there's no loop at all.

### Platform Strategy

- **Web-first responsive design**: Must work excellently on both mobile and desktop
- **Mobile-critical sharing**: QR code display, copy-to-clipboard, native share sheet (if available)
- **Desktop sharing**: Copy link for pasting into social media (LinkedIn, Instagram), emails, messaging apps
- **No native app required**: PWA-style experience for home screen addition possible later

### Sharing Methods (MVP)

| Method | Context | Implementation |
|--------|---------|----------------|
| **QR Code** | In-person meetings, conferences | Display scannable QR, one tap to show |
| **Copy Link** | Messaging apps, social media | One tap copy with confirmation |
| **Email Invite** | Proactive outreach | Form to enter recipient email |

### Future Sharing (Painted Door Tests)

These features will be shown in UI but trigger a "Coming Soon" feedback modal when clicked:

| Feature | Why Test It |
|---------|-------------|
| **Download as Image** | Share certificate on LinkedIn/Instagram as visual |
| **Print as Card** | Physical conversation starter for desk/wallet |
| **Share to LinkedIn** | Direct social media integration |

**Painted Door Modal Design:**
```
┌─────────────────────────────────────────────┐
│         Coming Soon!                        │
│                                             │
│  We're considering adding this feature.     │
│  Help us prioritize by sharing:             │
│                                             │
│  ┌─────────────────────────────────────┐   │
│  │ Why would this be useful to you?    │   │
│  │                                     │   │
│  └─────────────────────────────────────┘   │
│                                             │
│  Your email: [pre-filled from session]      │
│                                             │
│  [ Cancel ]              [ Request Feature ]│
└─────────────────────────────────────────────┘
```

Submission triggers email to product owner with: feature name, user's reason, user's email.

### Effortless Interactions

These interactions must require zero friction:

1. **Share via link**: One tap/click to copy, with clear confirmation
2. **Share via QR**: Instant display, no navigation required, scannable at arm's length
3. **See engagement at a glance**: Who accepted, who reciprocated - visible without scrolling
4. **Return to pledge view**: Owner can always see exactly what visitors see

### Critical Success Moments

| Moment | What Must Happen | Current State |
|--------|------------------|---------------|
| **First Share** | Owner shares pledge within 30 seconds of landing | ❌ Copy Link buried in banner |
| **First Acknowledgement** | Owner sees notification/update that someone accepted | ⚠️ Must refresh to see |
| **Reciprocation Discovery** | Owner sees who also signed their own pledge | ❌ Not surfaced |
| **Milestone Celebration** | Owner feels progress at 5, 10, 25 acknowledgements | ❌ No celebration |

### Experience Principles

1. **Action First**: Every owner landing should have an obvious next action (share)
2. **Context-Aware Sharing**: Offer the right sharing tool for the situation (QR, link, email)
3. **Visible Progress**: Engagement should feel like accumulating wins, not hidden data
4. **Truth in Messaging**: Never say "this is what others see" unless it's actually true
5. **Test Before Building**: Use painted doors to validate demand for visual/print features

---

## Desired Emotional Response

### Primary Emotional Goals

| Emotion | When | Why It Matters |
|---------|------|----------------|
| **Pride** | Viewing own pledge | Owner should feel good about their commitment, not confused about what they're seeing |
| **Agency/Empowerment** | Sharing | "I can take action RIGHT NOW" - no hunting for buttons |
| **Confidence** | After sharing | Clear confirmation that the action worked |
| **Validation** | Seeing acknowledgements | "My commitment matters to others" |
| **Momentum** | Returning to page | "This is growing" - motivation to continue sharing |

**The "Tell a Friend" Emotion:** "I feel like a better communicator just by signing this - and I want others to know."

### Emotional Journey Map

| Stage | Current State | Desired State |
|-------|---------------|---------------|
| Owner lands on pledge page | Confusion ("Is this what others see?") | Pride ("This is MY pledge") |
| Owner looks for sharing options | Frustration (buried button) | Empowerment ("I can share this NOW") |
| Owner shares | Uncertainty ("Did that work?") | Confidence ("Link copied! Here we go") |
| Owner sees acknowledgement | Surprise (if they find it) | Celebration ("Someone valued my commitment!") |
| Owner returns later | Indifference | Momentum ("3 more people since yesterday!") |

### Micro-Emotions

**To Cultivate:**
- Confidence over Confusion (clear UI, honest messaging)
- Accomplishment over Frustration (easy sharing, visible progress)
- Belonging over Isolation (see who else is in the community)

**To Avoid:**
- Confusion ("What am I looking at?")
- Embarrassment ("Did I share the wrong thing?")
- Abandonment ("Is anyone even seeing this?")

### Emotional Design Implications

| Emotion | UX Design Approach |
|---------|-------------------|
| Pride | Show the pledge certificate prominently, use celebratory visual design |
| Agency | Large, obvious sharing buttons - not buried in banners |
| Confidence | Clear confirmation states ("Copied!", "Sent!") |
| Validation | Acknowledgement notifications, engagement counts |
| Momentum | Progress indicators, milestone celebrations (5, 10, 25) |

### Emotional Design Principles

1. **Pride Before Action**: Let owner feel good about their pledge before asking them to share
2. **Celebrate Every Win**: Acknowledgements should feel like achievements, not just data
3. **Never Confuse**: If the UI could be misunderstood, rewrite it
4. **Progress is Visible**: Numbers and names of who engaged should be front and center
5. **Return Value**: Every return visit should show something new or remind owner of progress

---

<!-- UX design content will be appended sequentially through collaborative workflow steps -->
