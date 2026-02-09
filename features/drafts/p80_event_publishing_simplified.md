---
status: backlog
type: story
milestone: M2
sort_order: 500000
---
# P80: Event Publishing Simplified

## Problem

Publishing events (coworking sessions, hiking meetups) requires repetitive effort:
1. Creating event details from scratch each time
2. Writing promotional copy for WhatsApp/Facebook
3. Manually posting to multiple groups
4. Tracking RSVPs across platforms

This friction reduces event frequency and consistency.

## Goal

**Minimize effort to publish events** — from idea to promoted in WhatsApp/Facebook groups in under 5 minutes.

## Scope

**In scope:**
- Event templates for coworking and hiking
- One-click copy generation for WhatsApp/Facebook
- Simple RSVP tracking
- Event history for quick duplication

**Out of scope (for now):**
- Automated posting to platforms (manual copy-paste is fine)
- Payment collection
- Complex scheduling/calendar sync
- Public event discovery page

## User Flow

### 1. Create Event from Template

```
[Select Template]
├── 🏢 Coworking Session
├── 🥾 Hiking Meetup
└── ➕ Custom Event

[Fill Quick Details]
├── Date/Time: [picker]
├── Location: [saved locations dropdown + custom]
├── Capacity: [number]
└── Notes: [optional - weather, bring X, etc.]
```

### 2. Generate Promo Copy

One click generates platform-specific copy:

**WhatsApp format:**
```
🏢 *Coworking Session*

📅 Sunday, Jan 26 • 10:00-14:00
📍 Café Roma, Tel Aviv
👥 8 spots available

Bring your laptop, grab a coffee, get stuff done together.

✅ RSVP: [link] or reply here
```

**Facebook format:**
```
🏢 Coworking Session

Join us for a focused work session!

📅 When: Sunday, January 26 • 10:00 AM - 2:00 PM
📍 Where: Café Roma, Tel Aviv
👥 Capacity: 8 people

Bring your laptop, grab a coffee, and get stuff done in good company.

RSVP: [link]
```

### 3. Copy & Post

- "Copy for WhatsApp" button
- "Copy for Facebook" button
- Links to saved group URLs (quick access)

### 4. Track RSVPs

Simple list:
- Name
- Source (WhatsApp/Facebook/Direct)
- Status (Going/Maybe/Waitlist)

## Data Model

```typescript
interface EventTemplate {
  id: string;
  name: string;           // "Coworking Session"
  emoji: string;          // "🏢"
  defaultDuration: number; // minutes
  defaultCapacity: number;
  descriptionTemplate: string;
}

interface SavedLocation {
  id: string;
  name: string;           // "Café Roma"
  address: string;        // "123 Dizengoff, Tel Aviv"
  mapsUrl?: string;
}

interface Event {
  id: string;
  templateId: string;
  date: Date;
  duration: number;
  locationId: string;
  capacity: number;
  notes?: string;
  createdAt: Date;
}

interface RSVP {
  id: string;
  eventId: string;
  name: string;
  source: 'whatsapp' | 'facebook' | 'direct';
  status: 'going' | 'maybe' | 'waitlist';
  createdAt: Date;
}

interface PromoGroup {
  id: string;
  platform: 'whatsapp' | 'facebook';
  name: string;           // "Tel Aviv Hikers"
  url?: string;           // Quick access link
}
```

## Implementation Options

### Option A: Spreadsheet + Templates (Zero Code)
- Google Sheet for events/RSVPs
- Text file with copy templates
- Manual find-replace for details

**Pros:** Instant, no maintenance
**Cons:** Manual, error-prone, no link tracking

### Option B: Simple Web App (This Project)
- New route: `/events/manage`
- Local storage or Supabase for persistence
- Copy-to-clipboard functionality

**Pros:** Streamlined UX, trackable RSVPs
**Cons:** Development time, maintenance

### Option C: Notion/Airtable + Zapier
- Notion database for events
- Template views for copy generation
- Zapier for link shortening

**Pros:** Flexible, visual
**Cons:** Platform dependency, cost

## Recommendation

**Start with Option A** (spreadsheet) to validate the workflow, then build Option B if you're hosting 2+ events/week and the manual process becomes a bottleneck.

## Success Metrics

- Time from "I want to host an event" to "posted in groups": < 5 min
- Events hosted per month increases
- No forgotten details (location, time, capacity)

## Templates

### Coworking Session Template

**WhatsApp:**
```
🏢 *Coworking Session*

📅 {DAY}, {DATE} • {START_TIME}-{END_TIME}
📍 {LOCATION}
👥 {CAPACITY} spots

{NOTES}

Bring your laptop, grab a coffee, get stuff done together.

✅ Reply "in" to join
```

**Facebook:**
```
🏢 Coworking Session

📅 {DAY}, {DATE} • {START_TIME} - {END_TIME}
📍 {LOCATION}
👥 {CAPACITY} spots

{NOTES}

Bring your laptop, order something tasty, and get stuff done in good company. No agenda, just focused work time with friendly faces.

Comment "in" to join!
```

### Hiking Meetup Template

**WhatsApp:**
```
🥾 *Hiking Meetup*

📅 {DAY}, {DATE} • {START_TIME}
📍 Meeting point: {LOCATION}
🥾 Trail: {TRAIL_NAME}
⏱️ ~{DURATION}
💪 Difficulty: {DIFFICULTY}

{NOTES}

Bring: water, snacks, sun protection

✅ Reply "in" to join
```

**Facebook:**
```
🥾 Hiking Meetup

Join us for a morning hike!

📅 {DAY}, {DATE} • {START_TIME}
📍 Meeting point: {LOCATION}
🥾 Trail: {TRAIL_NAME}
⏱️ Duration: ~{DURATION}
💪 Difficulty: {DIFFICULTY}

{NOTES}

What to bring:
- Water (1.5L minimum)
- Snacks
- Sun protection
- Good shoes

Comment "in" to join!
```

## Saved Locations (Examples)

| Name | Type | Address |
|------|------|---------|
| Café Roma | Coworking | Dizengoff 123, Tel Aviv |
| Nahal Amud Trailhead | Hiking | Route 90, parking lot |
| WeWork Rothschild | Coworking | Rothschild 45, Tel Aviv |

## Promo Groups (Examples)

| Platform | Group Name | Purpose |
|----------|------------|---------|
| WhatsApp | TLV Nomads | Coworking |
| WhatsApp | Israel Hikers | Hiking |
| Facebook | Tel Aviv Events | Both |
| Facebook | North Israel Outdoors | Hiking |

## Next Steps

1. [ ] Try Option A for 2-3 events
2. [ ] Note friction points
3. [ ] Decide if Option B is worth building
4. [ ] If yes, create tech spec with specific UI mockups
