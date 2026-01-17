# Feature: Extended Certificate Export Formats

**Date:** 2025-12-03
**Scope:** ShareHub component - multiple export formats for different platforms
**Priority:** P5 (Fast-follow after MVP export)
**Depends On:** p5_ux-spec-certificate-image-export.md (Story 1)

---

## Problem Statement

After Story 1 ships, users can download a square certificate image. But different platforms have different optimal dimensions:

- **LinkedIn banner:** 1584×396 (wide, horizontal)
- **Instagram Story:** 1080×1920 (tall, vertical)
- **Email signature:** Small badge, not full certificate

A one-size-fits-all square image works... but doesn't optimize for each platform's unique canvas.

## User Story

> As a **pledge signatory**, I want to **choose different certificate formats** so that I can **optimize my share for each platform**.

## Design Solution

### Replace Single Button with Format Picker

When user clicks "Download Certificate", show a modal with format options:

```
┌─────────────────────────────────────────────────────────┐
│                  Download Certificate                    │
│  Choose a format optimized for your platform             │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  ┌──────────┐   ┌──────────┐   ┌──────────┐             │
│  │  ■■■■    │   │ ■■■■■■■■ │   │   [CP]   │             │
│  │  ■■■■    │   └──────────┘   └──────────┘             │
│  │  ■■■■    │                                            │
│  └──────────┘   LinkedIn       Email                     │
│   Social Post    Banner        Signature                 │
│   1080×1080     1584×396        300×80                   │
│                                                          │
├─────────────────────────────────────────────────────────┤
│  ☑ Include QR code                                       │
├─────────────────────────────────────────────────────────┤
│                              [Cancel]  [Download]        │
└─────────────────────────────────────────────────────────┘
```

### Format Specifications

| Format | Dimensions | Use Case | Content |
|--------|------------|----------|---------|
| **Social Post** | 1080×1080 | Instagram, LinkedIn post, Twitter | Full certificate + QR + acceptance count |
| **LinkedIn Banner** | 1584×396 | Profile header | Compact: Name, "Clarity Pledge Signatory", QR, date |
| **Email Signature** | 300×80 | Email footer | Tiny badge: "I signed the Clarity Pledge" + small logo |

### LinkedIn Banner Design

```
┌────────────────────────────────────────────────────────────────────┐
│                                                                    │
│   THE CLARITY PLEDGE    │   Maria Chen          │   [QR]          │
│   ─────────────────     │   Clarity Champion    │                 │
│   A Public Promise      │   Since Dec 2025      │   Scan to       │
│                         │                       │   view pledge   │
│                                                                    │
└────────────────────────────────────────────────────────────────────┘
```

### Email Signature Badge Design

```
┌────────────────────────────────────────────────────────────────┐
│  [✓] I signed the Clarity Pledge  •  claritypledge.com        │
└────────────────────────────────────────────────────────────────┘
```

Small, unobtrusive, clickable in email (when used with hyperlink).

### QR Code Toggle

- **Default:** ON for Social Post and LinkedIn Banner
- **Default:** OFF for Email Signature (too small to scan anyway)
- User can toggle for each format

## Technical Specification

### New Component: ExportFormatModal

```typescript
interface ExportFormatModalProps {
  isOpen: boolean;
  onClose: () => void;
  profile: {
    name: string;
    slug: string;
    role?: string;
    signedAt: string;
    isVerified: boolean;
    acceptanceCount: number;
  };
}

type ExportFormat = 'social' | 'linkedin-banner' | 'email-signature';
```

### Format Renderers

Create dedicated renderer components for each format:

| Component | Purpose |
|-----------|---------|
| `ExportSocialSquare` | 1080×1080 full certificate (from Story 1) |
| `ExportLinkedInBanner` | 1584×396 horizontal banner |
| `ExportEmailBadge` | 300×80 minimal badge |

### Files to Create

| File | Purpose |
|------|---------|
| `src/app/components/profile/export-format-modal.tsx` | Format picker modal |
| `src/app/components/profile/export-linkedin-banner.tsx` | Banner renderer |
| `src/app/components/profile/export-email-badge.tsx` | Badge renderer |

### Files to Modify

| File | Changes |
|------|---------|
| [src/app/components/profile/share-hub.tsx](src/app/components/profile/share-hub.tsx) | Open modal instead of direct download |

## Acceptance Criteria

- [ ] "Download Certificate" opens format picker modal
- [ ] Three format options displayed with visual previews
- [ ] "Include QR code" toggle available
- [ ] Social Post format (1080×1080) downloads correctly
- [ ] LinkedIn Banner format (1584×396) downloads correctly
- [ ] Email Signature format (300×80) downloads correctly
- [ ] Each format uses appropriate filename:
  - `clarity-pledge-{slug}-social.png`
  - `clarity-pledge-{slug}-linkedin-banner.png`
  - `clarity-pledge-{slug}-email-badge.png`
- [ ] Modal is mobile-responsive
- [ ] Loading state shown during generation
- [ ] Success toast after download

## Edge Cases

| Case | Expected Behavior |
|------|-------------------|
| Very long name in banner | Truncate with ellipsis |
| Mobile user | Stack format options vertically |
| Slow generation | Show spinner, prevent double-click |

## Out of Scope (Future)

- Story format (1080×1920) - low priority
- PDF export for print - low priority
- Animated GIF/MP4 - not MVP
- Upload photo overlay (like LinkedIn #hiring) - separate feature
- Embed code generation - separate feature

## UX Flow

```
User clicks "Download Certificate"
    └── Modal opens with format options
    └── User selects format (default: Social Post)
    └── User toggles QR code if desired
    └── User clicks "Download"
    └── Loading spinner shown
    └── PNG downloads
    └── Modal closes
    └── Success toast shown
```

## Future Enhancement Notes

### LinkedIn Photo Overlay Feature (Not In Scope)

User mentioned interest in a "#hiring"-style overlay for LinkedIn profile photos. This would be a separate feature:
- User uploads their LinkedIn photo
- We overlay a "Clarity Pledge" badge/ribbon
- User downloads and re-uploads to LinkedIn

This requires image upload handling and is out of scope for this story.

### Embed Code Feature (Not In Scope)

Generate HTML snippet for embedding certificate on personal websites/Notion. Would look like:
```html
<a href="https://claritypledge.com/p/maria-chen">
  <img src="..." alt="Maria Chen signed the Clarity Pledge" />
</a>
```

Separate story for later.
