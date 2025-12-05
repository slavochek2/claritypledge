# Feature: Certificate Image Export (MVP)

**Date:** 2025-12-03
**Scope:** ShareHub component - add downloadable certificate image for social sharing
**Priority:** P5 (Post-launch enhancement)

---

## Problem Statement

Maria just signed the Clarity Pledge. She's proud and wants to share her commitment on LinkedIn, Instagram, or in a team Slack. She goes to her profile, sees her beautiful certificate... and has no way to save it as an image.

Currently, the ShareHub offers:
- Copy link
- Show QR code
- Share on LinkedIn (link only)
- Email invite

But there's no way to **download the certificate as a shareable image**. Users who want to post their pledge visually must resort to screenshots, which:
- Look unprofessional (browser chrome, uneven cropping)
- Miss the viral loop (no QR code to scan)
- Don't include social proof (no acceptance count)

## User Story

> As a **pledge signatory**, I want to **download my certificate as a shareable image** so that I can **post it on social media** and let people scan the QR code to view my pledge.

## Design Solution

### New Button in ShareHub

Add a 5th option to the existing ShareHub 2x2 grid (becomes 3+2 or stays 2x2 with scroll):

| Icon | Label | Subtitle |
|------|-------|----------|
| Download icon | Download Certificate | Share on social media |

### Export Image Specifications

**Format:** PNG
**Dimensions:** 1080 × 1080 pixels (square, works everywhere)
**Filename:** `clarity-pledge-{slug}.png` (e.g., `clarity-pledge-maria-chen.png`)

### Image Content

The exported image includes:

```
┌─────────────────────────────────────────────────────────┐
│                                                         │
│                   THE CLARITY PLEDGE                    │
│                    A Public Promise                     │
│                                                         │
│  I, [Name], hereby commit to everyone...                │
│                                                         │
│  YOUR RIGHT                                             │
│  [Pledge text]                                          │
│                                                         │
│  MY PROMISE                                             │
│  [Pledge text]                                          │
│                                                         │
│  ─────────────────────────────────────────────────────  │
│                                                         │
│  [Avatar]  [Name]          [QR Code]        [Date]      │
│            [Role]                                       │
│            ✓ Verified                                   │
│                                                         │
│  ─────────────────────────────────────────────────────  │
│                                                         │
│         [X people accepted my pledge]                   │
│                                                         │
│                    claritypledge.com                    │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### Acceptance Count Display

| Scenario | Display |
|----------|---------|
| 0 acceptances | **Hide the line entirely** |
| 1 acceptance | "1 person accepted my pledge" |
| 2+ acceptances | "X people accepted my pledge" |

### QR Code

- Points to: `https://claritypledge.com/p/{slug}`
- Size: ~100×100 pixels within the image
- Placed in bottom section near signature

## Technical Specification

### Approach: Client-Side Image Generation

Use `html-to-image` library to render a hidden DOM element as PNG.

**Why client-side:**
- No server infrastructure needed
- Works offline
- Instant generation
- User's browser does the work

### Implementation Steps

1. **Install dependency:**
   ```bash
   npm install html-to-image
   ```

2. **Create ExportCertificateRenderer component:**
   - Hidden off-screen (`position: absolute; left: -9999px`)
   - Fixed dimensions (1080×1080)
   - Accepts props: `name`, `role`, `signedAt`, `isVerified`, `slug`, `acceptanceCount`
   - No responsive breakpoints, no hover states
   - Inline styles where needed (CSS may not fully apply)

3. **Enhance ProfileCertificate with export-friendly props:**
   ```typescript
   interface ProfileCertificateProps {
     // ... existing props
     showQrCode?: boolean;      // Default: false (display), true (export)
     acceptanceCount?: number;  // Show "X people accepted" when > 0
     exportMode?: boolean;      // Force fixed dimensions, no responsive
   }
   ```

4. **Add download handler in ShareHub:**
   ```typescript
   import { toPng } from 'html-to-image';

   const handleDownloadCertificate = async () => {
     const node = document.getElementById('export-certificate');
     const dataUrl = await toPng(node, { pixelRatio: 2 });
     // Trigger download
   };
   ```

### Files to Modify

| File | Changes |
|------|---------|
| [src/app/components/profile/share-hub.tsx](src/app/components/profile/share-hub.tsx) | Add download button, export logic, hidden renderer |
| [src/app/components/profile/profile-certificate.tsx](src/app/components/profile/profile-certificate.tsx) | Add `showQrCode`, `acceptanceCount`, `exportMode` props |
| `package.json` | Add `html-to-image` dependency |

### Files to Delete (Cleanup)

| File | Reason |
|------|--------|
| [src/app/components/profile/profile-certificate-copied.tsx](src/app/components/profile/profile-certificate-copied.tsx) | Unused duplicate component |

## Acceptance Criteria

- [ ] "Download Certificate" button appears in ShareHub (owner view only)
- [ ] Clicking button generates and downloads a 1080×1080 PNG image
- [ ] Image includes: certificate design, name, role, date, verified badge
- [ ] Image includes QR code linking to `/p/{slug}`
- [ ] Image shows "X people accepted my pledge" when count > 0
- [ ] Image hides acceptance count when 0
- [ ] Image includes "claritypledge.com" watermark
- [ ] Filename is `clarity-pledge-{slug}.png`
- [ ] Loading state shown during generation
- [ ] Works on mobile browsers
- [ ] `profile-certificate-copied.tsx` deleted

## Edge Cases

| Case | Expected Behavior |
|------|-------------------|
| Very long name | Truncate with ellipsis or reduce font size |
| Very long role | Truncate with ellipsis |
| No role provided | Hide role line |
| Unverified profile | Hide verified badge (show placeholder seal) |
| Export fails | Show error toast, suggest screenshot fallback |
| Slow device | Show loading spinner during generation |

## Out of Scope (Story 2)

- Format picker (LinkedIn banner, email signature, story format)
- With/without QR toggle
- Preview before download
- Multiple format downloads

## Dependencies

- `html-to-image` npm package
- `qrcode.react` (already installed, used in ShareHub)

## UX Flow

```
User on their profile page
    └── Scrolls to ShareHub section
    └── Clicks "Download Certificate"
    └── Button shows loading spinner (~1-2 seconds)
    └── PNG downloads automatically
    └── Success toast: "Certificate downloaded!"
    └── User posts to LinkedIn/Instagram/Slack
```

## Naming Note

The feature refers to "people who accepted" rather than "witnesses" to avoid legal connotations. The current codebase uses "witnesses" internally - a future story may standardize this terminology across the UI.
