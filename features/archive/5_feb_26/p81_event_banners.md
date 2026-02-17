---
status: done
type: comment
tags: []
rank: 125412.0
created_date: 2026-02-02
---

# P81: Event Banners

## Status: Planning

## Problem

Event pages without images feel low-effort and "beta". This may affect RSVP conversion — users are conditioned by Luma, Eventbrite, Meetup to expect visual event pages.

Text-only = spam vibes. Visual = legitimacy.

## Goal

**Make event pages look polished** with minimal effort from organizers.

## Hypothesis

Adding visual banners to events will increase RSVP conversion rate compared to text-only event pages.

## Scope

**In scope:**
- Event banner display on event pages
- Simple way for organizers to add banners
- Default visual if no banner provided

**Out of scope (for now):**
- Image cropping/editing UI
- Multiple images per event
- Luma-style stock image library
- AI-generated images

## Options Considered

| Option | Effort | Pros | Cons |
|--------|--------|------|------|
| **Skip entirely** | Zero | Ship faster | Events look "beta" |
| **URL field only** | 1 hour | Simple, organizers paste link | Requires external hosting |
| **Default gradients** | 2 hours | Zero effort for organizers | Less brand control |
| **GCS upload** | 3-4 hours | Full control, reuses existing infra | More complex |

## Decision: GCS Upload

We have Google Cloud Storage bucket for voice recordings and €25k GCP credits. Reuse existing infrastructure.

### Implementation

**Database:**
```sql
ALTER TABLE events ADD COLUMN banner_url TEXT;
```

**Storage structure:**
```
gs://{bucket}/
├── voice/           # Existing - voice recordings
└── events/          # New - event banners
    └── {event_id}/
        └── banner.{png|jpg|webp}
```

**Upload flow:**
1. Organizer clicks "Add Banner" on event create/edit
2. File picker → upload to GCS
3. Store public URL in `events.banner_url`
4. Display with `object-cover` for consistent aspect ratio

**Fallback:**
If no banner, show gradient based on event type or random selection:
```tsx
const FALLBACK_GRADIENTS = [
  'from-blue-600 to-indigo-500',   // Clarity brand
  'from-slate-700 to-slate-900',   // Professional
  'from-emerald-500 to-teal-400',  // Fresh
];
```

## UI Spec

### Event Card (list view)
```
┌─────────────────────────────────┐
│ [Banner Image - 16:9 ratio]     │
├─────────────────────────────────┤
│ Event Name                      │
│ 📅 Jan 20, 2026 · 21:00        │
│ 📍 Bangkok                      │
│ 👥 12 attending                 │
└─────────────────────────────────┘
```

### Event Page (detail view)
```
┌─────────────────────────────────┐
│                                 │
│    [Banner - full width]        │
│    aspect-ratio: 21:9           │
│                                 │
├─────────────────────────────────┤
│ Event Name                      │
│ ...                             │
```

### Upload UI (create/edit)
```
┌─────────────────────────────────┐
│  ┌─────────────────────────┐    │
│  │                         │    │
│  │   📷 Add Banner         │    │
│  │   Click or drag image   │    │
│  │                         │    │
│  └─────────────────────────┘    │
│                                 │
│  Recommended: 1200x630px        │
│  Max size: 5MB                  │
└─────────────────────────────────┘
```

## Acceptance Criteria

- [ ] Organizer can upload banner image when creating event
- [ ] Organizer can change/remove banner when editing event
- [ ] Banner displays on event page (detail view)
- [ ] Banner displays on event cards (list view)
- [ ] Fallback gradient shows if no banner
- [ ] Images stored in GCS bucket
- [ ] Uploaded images are publicly accessible
- [ ] Max file size enforced (5MB)
- [ ] Accepted formats: PNG, JPG, WebP

## Future Enhancements (not now)

- Image cropping/positioning UI
- Multiple images / gallery
- Auto-generate OG image for social sharing
- Default themed templates (like Luma)

## Dependencies

- GCS bucket access (existing)
- Events table exists
- Event create/edit UI exists

## Related

- P80: Recurring Event Workflow (uses events)
- P56: Event as Clarity Container
