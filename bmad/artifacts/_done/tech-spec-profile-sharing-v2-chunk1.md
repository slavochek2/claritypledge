# Tech-Spec: Profile Sharing Experience v2 - Chunk 1

**Created:** 2025-12-02
**Status:** Completed
**UX Reference:** [ux-profile-sharing-v2.md](../../docs/bmad/ux-profile-sharing-v2.md)

## Overview

### Problem Statement

The current profile owner experience is confusing and buries sharing functionality:

1. **Misleading messaging** - "This is how others see your pledge" appears in two places and isn't accurate
2. **Buried sharing** - Copy Link is the only sharing option, hidden in a small banner
3. **No sharing hub** - Owners have no dedicated place to access multiple sharing methods
4. **Missing context** - LinkedIn share exists in orphaned `ShareTools` component but isn't used

### Solution

Transform the owner profile page experience by:
1. Removing confusing "preview mode" messaging
2. Adding a prominent **Share Hub** section with multiple sharing options
3. Integrating QR code, copy link, LinkedIn share, and email invite in one place

### Scope

**In Scope (Chunk 1):**
- Fix/remove confusing owner messaging
- Create Share Hub component for profile owners
- Copy link with improved UX
- LinkedIn share button
- QR code display
- Email invite via `mailto:` link

**Out of Scope (Chunk 2/Later):**
- Download as image
- Print as card
- "Coming Soon" painted door modals
- Brevo transactional email integration
- Separate `/dashboard` page with metrics

## Context for Development

### Codebase Patterns

- **Components:** Functional React components with TypeScript
- **Styling:** Tailwind CSS with shadcn/ui components
- **State:** Local state with `useState`, no global state library
- **Icons:** Lucide React icons
- **Toasts:** Sonner for notifications
- **Conditional rendering:** `isOwner` prop used throughout profile components

### Files to Reference

| File | Purpose |
|------|---------|
| [src/app/pages/profile-page.tsx](../../src/app/pages/profile-page.tsx) | Main profile page - add Share Hub here |
| [src/app/components/profile/owner-preview-banner.tsx](../../src/app/components/profile/owner-preview-banner.tsx) | Current owner banner - will be replaced/simplified |
| [src/app/components/profile/profile-visitor-view.tsx](../../src/app/components/profile/profile-visitor-view.tsx) | Contains the confusing "This is how others see your pledge" box |
| [src/app/components/social/share-tools.tsx](../../src/app/components/social/share-tools.tsx) | Existing (orphaned) share component - reuse copy link & LinkedIn logic |

### Technical Decisions

1. **QR Code Library:** Use `qrcode.react` - lightweight, well-maintained, SSR-safe
2. **Email Invite:** `mailto:` link to `slava@claritypledge.com` with pre-filled subject/body containing the profile URL
3. **Share Hub Location:** Below the certificate on owner view, replaces the "This is how others see" box
4. **Banner:** Simplify to just "Your Pledge" indicator, remove copy link (moved to Share Hub)

## Implementation Plan

### Tasks

- [x] **Task 1:** Install `qrcode.react` dependency
  ```bash
  npm install qrcode.react
  ```

- [x] **Task 2:** Create `ShareHub` component
  - Location: `src/app/components/profile/share-hub.tsx`
  - Props: `profileUrl: string`, `profileName: string`
  - Layout: 2x2 grid on desktop, stacked on mobile
  - Include: Copy Link, QR Code, LinkedIn Share, Email Invite

- [x] **Task 3:** Implement QR Code card in ShareHub
  - Display QR code that encodes `profileUrl`
  - Size: ~150px, scannable at arm's length
  - Label: "Show QR Code" or always visible with "Scan to view pledge"

- [x] **Task 4:** Implement Email Invite card in ShareHub
  - Button opens `mailto:` link
  - Pre-filled:
    - To: (empty - user fills in recipient)
    - Subject: `[Name] invited you to accept their Clarity Pledge`
    - Body: Template with profile URL and brief explanation

- [x] **Task 5:** Migrate Copy Link and LinkedIn from `share-tools.tsx` to `ShareHub`
  - Reuse existing clipboard logic with fallback
  - Reuse LinkedIn share URL construction
  - Keep toast notifications

- [x] **Task 6:** Update `profile-visitor-view.tsx`
  - Remove the owner-only box at the bottom (lines 162-175) that says "This is how others see your pledge"

- [x] **Task 7:** Update `owner-preview-banner.tsx`
  - Simplify to just show "Your Pledge" or "Viewing your pledge"
  - Remove the Copy Link button (now in Share Hub)
  - Keep the blue styling as a visual indicator

- [x] **Task 8:** Integrate ShareHub into `profile-page.tsx`
  - Show `<ShareHub>` only when `isOwner === true`
  - Position: After the certificate, before the witness list
  - Pass `profileUrl`, `profile.name`

- [x] **Task 9:** Clean up orphaned `share-tools.tsx`
  - Deleted - fully replaced by ShareHub

- [x] **Task 10:** Test all sharing methods
  - Build passes
  - 42 unit tests pass
  - Copy link, QR code, LinkedIn, Email all implemented

### Acceptance Criteria

- [x] **AC 1:** Given I am the profile owner, when I view my profile page, then I see a Share Hub section with 4 sharing options (Copy Link, QR Code, LinkedIn, Email)

- [x] **AC 2:** Given I am the profile owner, when I view my profile page, then I do NOT see any messaging about "this is how others see your pledge"

- [x] **AC 3:** Given I am a visitor, when I view someone's profile page, then I do NOT see the Share Hub (only owners see it)

- [x] **AC 4:** Given I am the profile owner, when I click "Copy Link", then the profile URL is copied to clipboard and I see a success toast

- [x] **AC 5:** Given I am the profile owner, when I view the QR Code, then scanning it with my phone opens my profile URL

- [x] **AC 6:** Given I am the profile owner, when I click "Share on LinkedIn", then a new tab opens with LinkedIn's share dialog pre-filled with my profile URL

- [x] **AC 7:** Given I am the profile owner, when I click "Invite by Email", then my email client opens with subject "[My Name] invited you to accept their Clarity Pledge" and body containing my profile URL

- [x] **AC 8:** Given I am viewing on mobile, when I see the Share Hub, then the layout is responsive and all buttons are easily tappable

## Additional Context

### Dependencies

- `qrcode.react` - New dependency for QR code generation
- No backend changes required
- No database changes required

### Testing Strategy

**Manual Testing:**
- Test on desktop Chrome, Safari, Firefox
- Test on mobile Safari (iOS) and Chrome (Android)
- Verify QR code scans with multiple phone camera apps
- Test `mailto:` link opens native email client

**Unit Tests (optional for Chunk 1):**
- ShareHub renders all 4 sharing options
- Copy link function works
- QR code receives correct URL prop

### Notes

- The email invite uses `mailto:` which opens the user's default email client. This is a simple MVP approach - Brevo integration can be added later for a more polished experience.
- The owner banner is simplified but not removed entirely - it serves as a visual indicator that the user is viewing their own profile.
- `share-tools.tsx` contains good clipboard fallback logic for older browsers - this should be preserved in the new ShareHub.

### Email Invite Template

**Subject:**
```
[Name] invited you to accept their Clarity Pledge
```

**Body:**
```
Hi,

I signed the Clarity Pledge - a public commitment to prevent dangerous misunderstandings through clear communication.

I'd be honored if you'd accept my pledge:
[PROFILE_URL]

The Clarity Pledge means I commit to:
• Asking "What did you understand?" instead of "Do you understand?"
• Welcoming requests for clarification without judgment
• Taking responsibility for being understood, not just speaking

Learn more at claritypledge.com

Best,
[Name]
```
