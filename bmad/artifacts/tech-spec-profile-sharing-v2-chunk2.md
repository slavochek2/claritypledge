# Tech-Spec: Profile Sharing Experience v2 - Chunk 2

**Created:** 2025-12-02
**Status:** Ready for Development (after Chunk 1)
**Depends On:** [tech-spec-profile-sharing-v2-chunk1.md](./tech-spec-profile-sharing-v2-chunk1.md)
**UX Reference:** [ux-profile-sharing-v2.md](../../docs/bmad/ux-profile-sharing-v2.md)

## Overview

### Problem Statement

After Chunk 1, users can share via link, QR, LinkedIn, and email. However, the UX spec identified additional sharing use cases:

1. **Visual sharing** - Users want to share their pledge as an image on social media (LinkedIn posts, Instagram stories)
2. **Physical sharing** - Some users want a printable card for their desk or wallet as a conversation starter
3. **Feature validation** - We need to test demand for these features before building them fully

### Solution

Extend the Share Hub with:
1. **Download as Image** - Generate a shareable image of the pledge certificate
2. **Print as Card** - Printable card format optimized for desk display
3. **Painted Door Testing** - "Coming Soon" modals that collect user feedback before full implementation

### Scope

**In Scope (Chunk 2):**
- Download as Image feature (html2canvas or similar)
- Print as Card feature (print-optimized CSS)
- "Coming Soon" painted door modal component
- Feature request collection (via Web3Forms to product owner)

**Out of Scope (Future):**
- Brevo transactional email (upgrade from mailto:)
- Dashboard page with metrics/analytics
- Direct social media API integrations (post directly to LinkedIn)
- Milestone celebrations (5, 10, 25 endorsements)

## Context for Development

### Codebase Patterns

Same as Chunk 1:
- Functional React components with TypeScript
- Tailwind CSS + shadcn/ui
- Sonner for toasts
- Web3Forms for form submissions (already used in services-page.tsx)

### Files to Reference

| File | Purpose |
|------|---------|
| [src/app/components/profile/share-hub.tsx](../../src/app/components/profile/share-hub.tsx) | Created in Chunk 1 - extend with new options |
| [src/app/components/profile/profile-certificate.tsx](../../src/app/components/profile/profile-certificate.tsx) | The certificate component to capture as image |
| [src/app/pages/services-page.tsx](../../src/app/pages/services-page.tsx) | Reference for Web3Forms integration pattern |
| [src/components/ui/dialog.tsx](../../src/components/ui/dialog.tsx) | shadcn dialog for painted door modal |

### Technical Decisions

1. **Image Generation:** Use `html2canvas` library - captures DOM elements as canvas, then exports to PNG/JPG
2. **Print Styling:** CSS `@media print` rules + `window.print()` API
3. **Painted Door Modal:** Reusable component that can wrap any "coming soon" feature
4. **Feedback Collection:** Web3Forms (already in use) - sends email to product owner with feature name + user's reason
5. **Feature Flags:** Consider adding flags to toggle between "painted door" and "real" implementation

## Implementation Plan

### Tasks

- [ ] **Task 1:** Install `html2canvas` dependency
  ```bash
  npm install html2canvas
  npm install --save-dev @types/html2canvas
  ```

- [ ] **Task 2:** Create `PaintedDoorModal` component
  - Location: `src/app/components/ui/painted-door-modal.tsx`
  - Props: `isOpen`, `onClose`, `featureName`, `userEmail` (pre-filled)
  - Content: "Coming Soon!" message, textarea for "Why would this be useful?", submit button
  - On submit: POST to Web3Forms with feature name, user's reason, user's email

- [ ] **Task 3:** Implement "Download as Image" feature
  - Add button to ShareHub: "Download as Image"
  - On click: Use html2canvas to capture the certificate element
  - Convert canvas to blob, trigger download as `clarity-pledge-[name].png`
  - Show loading state during capture
  - Handle errors gracefully (toast on failure)

- [ ] **Task 4:** Create print-optimized certificate variant
  - Location: `src/app/components/profile/certificate-print-view.tsx`
  - Design: Card-sized (3.5" x 2" business card OR 4" x 6" postcard)
  - Include: Name, date signed, QR code to profile, Clarity Pledge branding
  - Hide unnecessary elements, optimize for black & white printing

- [ ] **Task 5:** Implement "Print as Card" feature
  - Add button to ShareHub: "Print as Card"
  - On click: Open print dialog with print-optimized view
  - Use CSS `@media print` to show only the card content
  - Alternative: Open new window with print view, auto-trigger print

- [ ] **Task 6:** Add feature flag for painted doors vs real features
  - Create config: `src/config/feature-flags.ts`
  - Flags: `ENABLE_DOWNLOAD_IMAGE`, `ENABLE_PRINT_CARD`
  - When flag is false: Show painted door modal instead of real feature
  - Default: `true` (features enabled) - painted doors for future features only

- [ ] **Task 7:** Extend ShareHub with new options
  - Add "Download as Image" card (6th position or reorganize grid)
  - Add "Print as Card" card
  - Consider 3x2 grid layout or expandable "More options" section

- [ ] **Task 8:** Style the downloaded image
  - Ensure certificate looks good as standalone image
  - Add padding/background so it's not just floating content
  - Include subtle branding/watermark: "claritypledge.com"
  - Optimal size for LinkedIn posts: 1200x627px or square 1080x1080

- [ ] **Task 9:** Test image generation across browsers
  - html2canvas has known quirks with certain CSS properties
  - Test: Chrome, Safari, Firefox, mobile browsers
  - Fallback: If capture fails, show error toast with alternative (screenshot instructions)

- [ ] **Task 10:** Add analytics/tracking (optional)
  - Track which sharing methods are used most
  - Track painted door submissions to gauge demand
  - Simple console.log for now, can integrate analytics later

### Acceptance Criteria

- [ ] **AC 1:** Given I am the profile owner, when I click "Download as Image", then a PNG file downloads containing my pledge certificate

- [ ] **AC 2:** Given I am the profile owner, when I click "Print as Card", then a print dialog opens with a card-sized, print-optimized version of my pledge

- [ ] **AC 3:** Given the download is processing, when html2canvas is capturing, then I see a loading indicator on the button

- [ ] **AC 4:** Given html2canvas fails, when an error occurs, then I see a helpful error toast (not a crash)

- [ ] **AC 5:** Given I click a painted-door feature, when the modal opens, then I can submit feedback about why I want this feature

- [ ] **AC 6:** Given I submit painted door feedback, when the form submits successfully, then I see a thank you message and the modal closes

- [ ] **AC 7:** Given I am on mobile, when I use Download as Image, then the image downloads correctly (or shows appropriate fallback)

- [ ] **AC 8:** Given I print the card, when the print preview shows, then only the card content is visible (no page chrome, navigation, etc.)

## Additional Context

### Dependencies

- `html2canvas` - DOM to canvas/image conversion
- `@types/html2canvas` - TypeScript types
- Web3Forms - Already in project (for painted door feedback)

### Image Generation Considerations

**html2canvas limitations:**
- Cannot capture cross-origin images (ensure avatar/assets are same-origin or use CORS)
- Some CSS properties may not render correctly (shadows, gradients, filters)
- Performance: Large/complex DOMs take longer to capture

**Alternatives if html2canvas doesn't work well:**
- `dom-to-image` - Similar library, sometimes better results
- Server-side rendering with Puppeteer (more complex, needs backend)
- Pre-designed static template with user data overlaid

### Print Card Design

```
┌─────────────────────────────────────────┐
│                                         │
│         [CLARITY PLEDGE LOGO]           │
│                                         │
│    ─────────────────────────────────    │
│                                         │
│           [NAME] signed the             │
│           Clarity Pledge                │
│                                         │
│           [DATE]                        │
│                                         │
│    ─────────────────────────────────    │
│                                         │
│    [QR CODE]     claritypledge.com      │
│                                         │
└─────────────────────────────────────────┘
```

### Web3Forms Painted Door Payload

```javascript
{
  access_key: "5c88ffaa-4e5a-4c82-9c73-e7fb0ad3ad01", // existing key
  subject: "Feature Request: [FEATURE_NAME]",
  from_name: "Clarity Pledge - Feature Request",
  email: userEmail,
  feature_name: featureName,
  reason: userReason,
}
```

### Testing Strategy

**Manual Testing:**
- Download image on desktop browsers (Chrome, Safari, Firefox)
- Download image on mobile (iOS Safari, Android Chrome)
- Print card and verify it fits standard card sizes
- Submit painted door feedback and verify email received

**Visual Testing:**
- Compare downloaded image to on-screen certificate
- Verify image dimensions are social-media friendly
- Check print preview matches expected card design

### Notes

- The painted door modal is designed to be reusable for ANY future feature we want to test demand for
- Consider A/B testing: Show painted door to 50% of users, real feature to 50%, measure engagement
- Image download filename should be URL-safe: `clarity-pledge-john-doe.png`
- Print feature may need browser-specific handling (Safari print is quirky)

### Future Painted Door Candidates

Features to potentially test with painted doors before building:
- "Share to Instagram Stories"
- "Add to LinkedIn Featured Section"
- "Email Weekly Engagement Summary"
- "Embed Badge on Personal Website"
