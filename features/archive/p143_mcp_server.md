---
status: rejected
type: story
priority: p1
milestone: C1
tags: [mcp, api, events, ai-assistant, infrastructure]
created: 2026-02-12
rejected: 2026-02-12
rejection_reason: Overengineered solution for 2 min/week problem. Not testing any documented hypothesis. Better to focus validation time on Recognition (essays/specs) or Coaching (workshops) tracks.
rank: 125326.0
created_date: 2026-02-13
---

# P143: ClarityPledge MCP Server

> **REJECTED 2026-02-12:** Overengineered. Saves 2 min/week but costs 3 weeks to build. Not validation-critical — peripheral to dual-track strategy (Recognition PRIMARY, Coaching SAFETY). Prep-spec review revealed: no hypothesis connection, auth architecture fundamentally broken, UX too technical for target users.

---

## Executive Summary

Enable ClarityPledge users to publish and manage events via their Claude (CLI/Desktop) through a Model Context Protocol (MCP) server, eliminating manual browser workflows and enabling AI-assisted event management. This infrastructure validates the platform's "AI-assisted thought leadership" model where Claude handles logistics and the founder focuses on content and facilitation.

**Problem:** Users hosting recurring events (weekly dinners, workshops) spend 2+ minutes per event manually filling forms at `/events/create`. The founder's vision is "AI assistant organizes events, promotes them, briefs me — I just show up and lead."

**Solution:** Installable MCP server that any ClarityPledge user can connect to their Claude, enabling event CRUD operations via natural language commands.

**Impact:**
- **Validation:** Tests events + /live sessions under real conditions before scaling (C1 milestone prerequisite)
- **Thought leadership model:** Enables the operating model where AI handles logistics, founder focuses on facilitation
- **User value:** Any user can AI-assist their event hosting (not just the founder)
- **Platform differentiation:** ClarityPledge becomes an AI-native events platform

---

## Business Context

### Why This Matters

**Strategic Alignment:**

From `lean-canvas.md`, the dual-track strategy:
- **Track 1 (PRIMARY):** Recognition path → personal AI / digital twins
- **Track 2 (SAFETY):** Workshop revenue path (€5k/month target)

MCP server serves both tracks:
1. **Recognition (Track 1):** Demonstrates thought leadership in AI-native event management. The founder becomes "the AI-assisted event host" — credibility signal to rationalist/EA community.
2. **Workshop Revenue (Track 2):** Enables scaling event hosting without manual overhead. Required for C1 milestone: "Run workshop where participants create stories, verify in /live, pair via event rooms."

**Current State (C1 Milestone):**

From `c1-stories-live-events.md`:
> **Build:** P126 (create story) → P128 (/live beginning screen) → P124 (event rooms)
> **Done when:** Can run workshop where participants create stories, verify in /live, pair via event rooms

Events system fully built. Need to validate under real conditions. MCP server enables rapid iteration without manual event publishing overhead.

### Success Metrics

**Immediate (MVP):**
- Founder can publish Thursday dinner event (2026-02-19) via Claude in <30 seconds
- Zero manual browser form-filling for recurring events
- Event appears in platform UI identical to manually-created events

**30-Day:**
- 5+ events published via MCP (weekly dinners, validation sessions)
- 2+ other users install MCP server and publish events
- Founder uses `/publish-dinner` command weekly without friction

**90-Day (Post-Validation):**
- MCP server documented for open-source users
- "AI-assisted event hosting" becomes recognized ClarityPledge feature
- Event management workflow becomes reference implementation for AI-native platforms

---

## User Stories

### Primary User: Founder (Slava)

**Story 1: Publish Recurring Dinner**
> As the founder hosting weekly Clarity Dinners, I want to publish next Thursday's event via Claude so that I don't spend 2 minutes filling the same form every week.

**Acceptance Criteria:**
- Run `/publish-dinner` command in Claude
- Claude asks for date/time if not specified
- Event published to platform with standard template (title, description, location)
- Confirmation with event URL returned
- Event visible at `/events` page immediately

**Story 2: Check RSVP Status**
> As an event host, I want to check who's attending my upcoming event via Claude so that I can prepare without opening the browser.

**Acceptance Criteria:**
- Run command like "Who's attending Thursday's dinner?"
- Claude returns list of attendees (names, pledge status)
- Includes attendee count and capacity remaining if applicable

**Story 3: Update Event Details**
> As an event host, I want to update event location/time via Claude when plans change so that I can notify attendees immediately without browser navigation.

**Acceptance Criteria:**
- Command like "Change dinner location to [new address]"
- Claude confirms change and updates event
- Attendees see updated details on event page

### Secondary User: Any ClarityPledge User

**Story 4: Install and Authenticate**
> As a ClarityPledge user, I want to connect my Claude to my ClarityPledge account so that I can manage my events via AI.

**Acceptance Criteria:**
- Generate API key in Settings page (`/settings`)
- Copy MCP server installation instructions
- Configure Claude with API key
- Test connection with "Get my events" command
- Receive confirmation of successful authentication

**Story 5: Publish Custom Event**
> As a user, I want to publish a one-off event (workshop, meetup) via Claude so that I can promote it to the community without manual form-filling.

**Acceptance Criteria:**
- Command like "Publish workshop: Understanding Calibration, Feb 20 at 18:00 Bangkok time"
- Claude prompts for missing details (duration, location, description)
- Event published with custom details
- Confirmation with event URL

---

## Technical Analysis

### Existing Infrastructure

**Events Service (`src/app/data/events-service-real.ts`):**

Complete CRUD implementation:
```typescript
interface EventsService {
  // Queries
  getUpcomingEvents(): Promise<EventWithHost[]>
  getPastEvents(): Promise<EventWithHost[]>
  getEventBySlug(slug: string): Promise<EventWithHost | null>
  getEventAttendees(eventId: string): Promise<EventAttendee[]>
  getUserHostedEvents(profileId: string): Promise<EventWithHost[]>

  // Mutations
  createEvent(data: CreateEventInput): Promise<EventWithHost | null>
  updateEvent(eventId: string, data: UpdateEventInput): Promise<boolean>
  cancelEvent(eventId: string): Promise<boolean>
  rsvpToEvent(eventId: string, profileId: string): Promise<boolean>
}
```

**Database Schema (`supabase/migrations/20260118_create_events.sql`):**

```sql
CREATE TABLE public.events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  datetime TIMESTAMPTZ NOT NULL,
  duration_minutes INTEGER NOT NULL DEFAULT 120,
  timezone TEXT NOT NULL DEFAULT 'America/Los_Angeles',
  location TEXT NOT NULL,
  host_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  max_attendees INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  status TEXT DEFAULT 'upcoming' CHECK (status IN ('upcoming', 'completed', 'cancelled'))
);

CREATE TABLE public.event_rsvps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  rsvped_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(event_id, profile_id)
);
```

**RLS Policies:**
- Events viewable by everyone (SELECT)
- Authenticated users can create events (INSERT with `auth.uid() = host_id`)
- Hosts can update/delete their own events (UPDATE/DELETE with `auth.uid() = host_id`)

**Auth System:**
- Supabase auth with JWT tokens
- Existing auth flow in `src/auth/index.tsx`
- Profile mapping in `profiles` table

### Architecture Decision: MCP Server vs Alternatives

**Considered Options:**

1. **Browser Automation (Playwright)** ❌
   - Not sustainable: breaks when UI changes
   - Requires running browser instance
   - Doesn't work for other users (need their credentials)

2. **Simple Skills in Repo** ❌
   - Only works for founder's worktree
   - Not installable by regular users
   - Can't access user's auth context

3. **MCP Server** ✅
   - Installable by any user (via `claude_desktop_config.json` or `mcp.json`)
   - Works with user's authenticated account (API key)
   - Survives UI changes (uses API, not browser)
   - Standard protocol (MCP), standard auth (API key)

**Decision:** Build standalone MCP server as npm package.

---

## Technical Requirements

### 1. MCP Server Architecture

**Package Structure:**

```
claritypledge-mcp/
├── package.json
├── README.md
├── src/
│   ├── index.ts           # MCP server entry point
│   ├── tools/
│   │   ├── publish-event.ts
│   │   ├── get-my-events.ts
│   │   ├── get-event-rsvps.ts
│   │   ├── update-event.ts
│   │   └── cancel-event.ts
│   ├── client.ts          # Supabase client with API key auth
│   └── types.ts           # Shared types
└── tsconfig.json
```

**Technology Stack:**
- **Runtime:** Node.js (20+)
- **Language:** TypeScript
- **MCP SDK:** `@modelcontextprotocol/sdk`
- **Database Client:** `@supabase/supabase-js`
- **Build:** `tsup` for bundling
- **Package Manager:** npm (consistent with main project)

### 2. Authentication Flow

**API Key Architecture:**

```
User Flow:
1. User visits /settings
2. "Generate API Key" button appears
3. Click generates API key, shows once (like GitHub PATs)
4. User copies key, stores in Claude config
5. MCP server reads key from config
6. All API calls include key in Authorization header

Server-Side Validation:
1. MCP server receives request with API key
2. Query `api_keys` table (new table) to map key → user_id
3. Create Supabase client with service role key
4. Set user context: `auth.uid()` = user_id (RLS respects this)
5. Execute operation (RLS policies apply)
```

**New Database Table:**

```sql
CREATE TABLE public.api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  key_hash TEXT NOT NULL UNIQUE, -- SHA-256 hash of API key
  name TEXT, -- User-assigned name ("Claude Desktop", "CLI")
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_used_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ, -- NULL = never expires
  is_active BOOLEAN DEFAULT true
);

CREATE INDEX idx_api_keys_hash ON api_keys(key_hash);
CREATE INDEX idx_api_keys_user ON api_keys(user_id);
```

**API Key Format:**
- Prefix: `cp_` (ClarityPledge)
- Random: 32 bytes base64url-encoded
- Example: `cp_abc123def456ghi789jkl012mno345pqr678stu901vwx234yz`

**Security:**
- Store SHA-256 hash in database (not plaintext)
- Show full key only once at generation (like GitHub)
- Support revocation via Settings UI
- Rate limiting per API key (future: 100 req/hour)

### 3. MCP Tools Specification

**Tool 1: `publish_event`**

```typescript
{
  name: "publish_event",
  description: "Create a new event on ClarityPledge",
  inputSchema: {
    type: "object",
    properties: {
      title: { type: "string", description: "Event title" },
      datetime: { type: "string", description: "ISO 8601 datetime with timezone" },
      duration_minutes: { type: "number", default: 120 },
      timezone: { type: "string", default: "Asia/Bangkok" },
      location: { type: "string", description: "Physical address or virtual link" },
      description: { type: "string", description: "Markdown-formatted description" },
      max_attendees: { type: "number", description: "Optional capacity limit" }
    },
    required: ["title", "datetime", "location", "description"]
  }
}
```

**Implementation:**
- Calls `createEvent()` from events service
- Returns event object with slug and URL
- Generates slug server-side (existing logic: `generateSlug()`)

**Tool 2: `get_my_events`**

```typescript
{
  name: "get_my_events",
  description: "List events hosted by authenticated user",
  inputSchema: {
    type: "object",
    properties: {
      filter: {
        type: "string",
        enum: ["all", "upcoming", "past"],
        default: "upcoming"
      }
    }
  }
}
```

**Implementation:**
- Calls `getUserHostedEvents(profileId)` from events service
- Filters by status based on `filter` parameter
- Returns array of events with attendee counts

**Tool 3: `get_event_rsvps`**

```typescript
{
  name: "get_event_rsvps",
  description: "Get attendees for an event",
  inputSchema: {
    type: "object",
    properties: {
      event_id: { type: "string", description: "Event UUID" },
      event_slug: { type: "string", description: "Event slug (alternative to ID)" }
    }
  }
}
```

**Implementation:**
- Resolve slug to ID if slug provided
- Verify user is host (authorization check)
- Call `getEventAttendees(eventId)`
- Return attendees with pledge status

**Tool 4: `update_event`**

```typescript
{
  name: "update_event",
  description: "Update event details (host only)",
  inputSchema: {
    type: "object",
    properties: {
      event_id: { type: "string" },
      event_slug: { type: "string" },
      title: { type: "string" },
      datetime: { type: "string" },
      location: { type: "string" },
      description: { type: "string" },
      max_attendees: { type: "number" }
    }
  }
}
```

**Implementation:**
- Resolve slug to ID if slug provided
- Call `updateEvent(eventId, data)`
- RLS enforces host-only updates
- Return success/failure

**Tool 5: `cancel_event`**

```typescript
{
  name: "cancel_event",
  description: "Cancel an event (host only)",
  inputSchema: {
    type: "object",
    properties: {
      event_id: { type: "string" },
      event_slug: { type: "string" }
    },
    required: [] // At least one required, validated in code
  }
}
```

**Implementation:**
- Resolve slug to ID if slug provided
- Call `cancelEvent(eventId)`
- RLS enforces host-only cancellation
- Return success/failure

### 4. Configuration

**User Configuration (`.mcp.json` or `claude_desktop_config.json`):**

```json
{
  "mcpServers": {
    "claritypledge": {
      "command": "npx",
      "args": ["-y", "@claritypledge/mcp-server"],
      "env": {
        "CLARITYPLEDGE_API_KEY": "cp_abc123..."
      }
    }
  }
}
```

**Alternative (Local Development):**

```json
{
  "mcpServers": {
    "claritypledge": {
      "command": "node",
      "args": ["/path/to/claritypledge-mcp/dist/index.js"],
      "env": {
        "CLARITYPLEDGE_API_KEY": "cp_abc123...",
        "CLARITYPLEDGE_API_URL": "http://localhost:5173" // Optional: override for dev
      }
    }
  }
}
```

### 5. Settings UI (API Key Management)

**New Section in `/settings` page:**

```
Settings
├── Profile (existing)
└── Developer (NEW)
    ├── API Keys
    │   ├── "Generate API Key" button
    │   ├── List of active keys
    │   │   ├── Name, Created, Last Used
    │   │   └── Revoke button
    │   └── Copy setup instructions
```

**API Key Generation Flow:**

1. User clicks "Generate API Key"
2. Modal prompts for key name (optional): "Claude Desktop", "CLI", etc.
3. Generate key: `cp_` + 32 random bytes (base64url)
4. Hash key (SHA-256), store in `api_keys` table
5. Show full key ONCE with warning: "Save this now — you won't see it again"
6. Provide setup instructions:
   ```
   Add to your Claude config (~/.claude/mcp.json):

   {
     "mcpServers": {
       "claritypledge": {
         "command": "npx",
         "args": ["-y", "@claritypledge/mcp-server"],
         "env": {
           "CLARITYPLEDGE_API_KEY": "cp_abc123..."
         }
       }
     }
   }
   ```

**Revocation:**
- Click "Revoke" → confirm modal → set `is_active = false`
- MCP server rejects requests with inactive keys

---

## Implementation Phases

### Phase 1: MVP (Week 1)

**Goal:** Founder can publish Thursday dinner event via Claude.

**Deliverables:**
1. `api_keys` table migration
2. Settings UI: Generate API key (basic)
3. MCP server package:
   - `publish_event` tool
   - `get_my_events` tool
4. Authentication via API key
5. Local testing: Publish event via Claude CLI

**Testing:**
- Founder generates API key in `/settings`
- Configures Claude Desktop with key
- Publishes test event via "Publish Clarity Dinner on Feb 19 at 20:30 Bangkok time"
- Event appears at `/events` page
- Event details correct (title, time, location)

**Success Criteria:**
- Event published in <30 seconds
- Zero browser form-filling
- Event data correct

### Phase 2: Host Management (Week 2)

**Goal:** Founder can manage events (RSVPs, updates, cancellation) via Claude.

**Deliverables:**
1. MCP tools:
   - `get_event_rsvps`
   - `update_event`
   - `cancel_event`
2. Settings UI: List/revoke API keys
3. Documentation: README for MCP server

**Testing:**
- Check RSVPs: "Who's attending Thursday's dinner?"
- Update location: "Change dinner location to [new address]"
- Cancel event: "Cancel Feb 26 dinner"
- Revoke key and verify MCP server rejects requests

**Success Criteria:**
- All event management operations work via Claude
- API key revocation works
- Basic docs explain installation

### Phase 3: Open Source (Week 3)

**Goal:** Any ClarityPledge user can install and use MCP server.

**Deliverables:**
1. Publish `@claritypledge/mcp-server` to npm
2. Documentation:
   - Installation guide
   - Authentication setup
   - Tool reference
   - Troubleshooting
3. Settings UI polish: Copy setup instructions button
4. Test with 2+ users (recruit from community)

**Testing:**
- Recruit 2 beta users
- They generate API keys
- They install MCP server
- They publish test events
- Collect feedback, iterate

**Success Criteria:**
- 2+ non-founder users successfully publish events via MCP
- Documentation sufficient for self-service setup
- No critical bugs in production use

### Phase 4: Future Enhancements (Post-MVP)

**Not in MVP, but planned:**

1. **Event Templates:**
   - Tool: `list_templates`
   - Pre-configured templates: "Clarity Dinner", "Workshop", "Meetup"
   - Command: "Publish dinner using template"

2. **Attendee Communication:**
   - Tool: `send_event_reminder`
   - Send message to all attendees
   - Requires email/notification infrastructure

3. **Analytics:**
   - Tool: `get_event_analytics`
   - Attendance patterns, RSVP conversion rates
   - Requires analytics schema

4. **Smart Scheduling:**
   - Tool: `suggest_event_time`
   - Analyze past attendance, suggest optimal times
   - Requires ML/heuristics

5. **Bulk Operations:**
   - Tool: `publish_recurring_events`
   - Create series of events (weekly dinners for next month)

---

## Verification Requirements

### Testing Strategy

**Unit Tests (via Vitest):**
- API key generation and validation
- Event CRUD operations via MCP tools
- Authorization checks (host-only operations)

**Integration Tests (via Playwright):**
- End-to-end flow: Generate API key → Configure MCP → Publish event
- Event appears in UI
- RSVP flow still works (web users can RSVP to MCP-created events)

**Manual Testing:**
- Founder publishes real events via Claude
- Community users test installation
- Cross-platform testing (macOS, Linux, Windows)

### Acceptance Criteria

**MVP Success Criteria:**

1. **Functional:**
   - ✅ Founder publishes Thursday dinner event via Claude in <30 seconds
   - ✅ Event appears at `/events` identical to manual creation
   - ✅ RSVPs work normally (web users can RSVP)
   - ✅ Founder can check RSVPs, update event, cancel via Claude

2. **Security:**
   - ✅ API key authentication works
   - ✅ RLS policies enforced (users can't modify others' events)
   - ✅ API key revocation works
   - ✅ Keys stored as hashes (not plaintext)

3. **User Experience:**
   - ✅ Settings UI clear and functional
   - ✅ Installation instructions complete
   - ✅ Error messages helpful (invalid key, unauthorized operation)

4. **Reliability:**
   - ✅ No errors in production use (5+ events published)
   - ✅ MCP server handles network failures gracefully
   - ✅ Event data integrity maintained

**Open Source Readiness Criteria:**

1. **Documentation:**
   - ✅ Installation guide (with screenshots)
   - ✅ Authentication setup (step-by-step)
   - ✅ Tool reference (all 5 tools documented)
   - ✅ Troubleshooting section (common errors)

2. **Distribution:**
   - ✅ Published to npm as `@claritypledge/mcp-server`
   - ✅ Versioned (semantic versioning)
   - ✅ README with quick start

3. **Community Validation:**
   - ✅ 2+ non-founder users successfully install and use
   - ✅ Feedback incorporated (UX improvements)

---

## Risks and Mitigations

### Risk 1: API Key Security

**Risk:** API keys leaked in public repos, screenshots, logs.

**Mitigations:**
- Prefix `cp_` makes keys recognizable in scans
- Settings UI shows warning: "Don't share this key"
- Revocation flow easy and immediate
- Future: Automatic rotation, key expiration

### Risk 2: Supabase RLS Bypass

**Risk:** MCP server uses service role key (bypasses RLS), breaks authorization.

**Mitigation:**
- Never use service role key for user operations
- Use anon key with JWT (set `auth.uid()` context)
- Test: Verify user A can't modify user B's events via MCP
- Code review: All operations respect RLS policies

### Risk 3: MCP Server Maintenance

**Risk:** MCP SDK breaking changes, Supabase API changes.

**Mitigations:**
- Pin MCP SDK version initially
- Monitor MCP SDK release notes
- Version MCP server package (semantic versioning)
- Test suite catches breaking changes early

### Risk 4: User Confusion (Setup Complexity)

**Risk:** Users can't install MCP server (config syntax, JSON errors).

**Mitigations:**
- Settings UI provides copy-paste config (no typing)
- Documentation includes screenshots
- Validation: Test config JSON before showing
- Future: Claude Desktop UI for MCP server installation (no manual config)

### Risk 5: Supabase Client Dependencies

**Risk:** MCP server pulls in unnecessary dependencies (React, UI libs).

**Mitigations:**
- Use `@supabase/supabase-js` (core client only, no UI deps)
- Bundle with `tsup` (tree-shaking)
- Target: <5MB package size
- Test: Check `node_modules` size after install

---

## Open Questions

### Q1: Event Templates — In MVP or Post-MVP?

**Question:** Should "Clarity Dinner" template be in MVP, or manual entry only?

**Considerations:**
- **Pro (MVP):** Founder's main use case is recurring dinners — template saves time
- **Con (MVP):** Adds complexity, delays MVP delivery
- **Decision:** Post-MVP. Manual entry validates core flow first.

**How to decide:** If founder publishes 3+ events manually and says "I wish this was templated," add it. If manual entry is fine, defer.

### Q2: Slug vs ID in Tool Parameters?

**Question:** Should tools accept `event_slug` (human-readable) or `event_id` (UUID)?

**Current Approach:** Accept both, resolve slug → ID internally.

**Rationale:** Human-readable slugs better for LLM interaction ("Update clarity-dinner-2026-02-19" vs "Update ae8f7d3c-..."). Internal resolution is cheap.

**Validation Needed:** Test if Claude reliably passes slugs (if not, default to ID).

### Q3: API Key Expiration?

**Question:** Should API keys auto-expire (30 days, 90 days) or live forever?

**Current Approach:** No expiration in MVP (NULL `expires_at`).

**Future:** Add optional expiration for enterprise users (security compliance).

**Decision:** Forever for MVP. Revocation is manual, immediate, sufficient.

### Q4: Rate Limiting?

**Question:** Should MCP server rate-limit API calls (prevent abuse)?

**Current Approach:** No rate limiting in MVP.

**Rationale:** Single-user use case (founder). If abused, add per-key rate limits (100 req/hour).

**Decision:** Monitor usage. Add rate limiting if abuse detected.

---

## Dependencies and Integrations

### Internal Dependencies

- **Events Service:** `src/app/data/events-service-real.ts` (complete, no changes needed)
- **Database:** Supabase (new `api_keys` table)
- **Auth:** Supabase auth (existing profiles table)
- **Settings Page:** `src/app/pages/settings-page.tsx` (add API key section)

### External Dependencies

- **MCP SDK:** `@modelcontextprotocol/sdk` (official SDK from Anthropic)
- **Supabase Client:** `@supabase/supabase-js` (existing dependency)
- **Claude Desktop/CLI:** User's local Claude installation

### Integration Points

1. **Settings → MCP Server:** API key generation
2. **MCP Server → Supabase:** Event CRUD via service
3. **MCP Server → Claude:** Tool execution
4. **Web UI → Database:** Event display (existing, no changes)

---

## Success Criteria Summary

**MVP (Week 1):**
- ✅ Founder publishes event via Claude in <30 seconds
- ✅ Event appears in UI correctly
- ✅ Authentication works (API key)

**Post-MVP (Week 2-3):**
- ✅ Full event management via Claude (RSVPs, updates, cancellation)
- ✅ 2+ community users install and use MCP server
- ✅ Documentation complete and tested

**Long-Term (90 Days):**
- ✅ "AI-assisted event hosting" becomes recognized ClarityPledge feature
- ✅ MCP server example used in other projects (reference implementation)
- ✅ Platform differentiation: "ClarityPledge is AI-native"

---

## Appendix

### A. Example Use Cases

**Use Case 1: Publish Recurring Dinner**

```
User: "Publish Clarity Dinner for next Thursday at 8:30 PM Bangkok time"

Claude (via MCP):
- Tool: publish_event
- Params:
  - title: "Clarity Dinner"
  - datetime: "2026-02-19T20:30:00+07:00"
  - timezone: "Asia/Bangkok"
  - duration_minutes: 120
  - location: "https://maps.google.com/..."
  - description: "Weekly dinner to practice calibrated communication..."

Response: "Event published! View at: https://claritypledge.com/events/clarity-dinner-2026-02-19-a3f2"
```

**Use Case 2: Check RSVPs**

```
User: "Who's coming to Thursday's dinner?"

Claude (via MCP):
- Tool: get_my_events (filter: upcoming)
- Identify event matching "Thursday's dinner"
- Tool: get_event_rsvps (event_slug: "clarity-dinner-2026-02-19-a3f2")

Response:
"3 people attending Clarity Dinner (Feb 19, 8:30 PM):
1. Alex Chen (has pledged)
2. Sarah Kim
3. Jordan Lee (has pledged)

Capacity: 3/8 spots filled"
```

**Use Case 3: Update Location**

```
User: "Change Thursday dinner location to The Commons"

Claude (via MCP):
- Tool: get_my_events (filter: upcoming)
- Identify event matching "Thursday dinner"
- Tool: update_event (
    event_slug: "clarity-dinner-2026-02-19-a3f2",
    location: "The Commons, Thonglor"
  )

Response: "Updated! Location changed to 'The Commons, Thonglor'"
```

### B. Database Schema Changes

**New Table: `api_keys`**

```sql
-- Migration: 20260212_api_keys.sql

CREATE TABLE public.api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  key_hash TEXT NOT NULL UNIQUE,
  name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_used_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT true
);

CREATE INDEX idx_api_keys_hash ON api_keys(key_hash);
CREATE INDEX idx_api_keys_user ON api_keys(user_id);

-- RLS: Users can only see their own keys
ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own API keys"
  ON api_keys FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create API keys"
  ON api_keys FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can revoke their own API keys"
  ON api_keys FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own API keys"
  ON api_keys FOR DELETE
  USING (auth.uid() = user_id);
```

### C. Package.json (MCP Server)

```json
{
  "name": "@claritypledge/mcp-server",
  "version": "0.1.0",
  "description": "MCP server for managing ClarityPledge events",
  "main": "dist/index.js",
  "type": "module",
  "bin": {
    "claritypledge-mcp": "./dist/index.js"
  },
  "scripts": {
    "build": "tsup src/index.ts --format esm --dts",
    "dev": "tsup src/index.ts --format esm --watch",
    "test": "vitest"
  },
  "keywords": ["mcp", "claritypledge", "events"],
  "author": "ClarityPledge",
  "license": "MIT",
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.0.0",
    "@supabase/supabase-js": "^2.84.0"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "tsup": "^8.0.0",
    "typescript": "^5.0.0",
    "vitest": "^1.0.0"
  },
  "engines": {
    "node": ">=20.0.0"
  }
}
```

### D. README Template (MCP Server)

```markdown
# ClarityPledge MCP Server

Manage ClarityPledge events via Claude (Desktop or CLI).

## Quick Start

1. Generate API key at [claritypledge.com/settings](https://claritypledge.com/settings)
2. Add to Claude config (`~/.claude/mcp.json`):

```json
{
  "mcpServers": {
    "claritypledge": {
      "command": "npx",
      "args": ["-y", "@claritypledge/mcp-server"],
      "env": {
        "CLARITYPLEDGE_API_KEY": "cp_your_key_here"
      }
    }
  }
}
```

3. Restart Claude
4. Try: "Publish an event on ClarityPledge"

## Tools

- `publish_event` — Create new event
- `get_my_events` — List your hosted events
- `get_event_rsvps` — See who's attending
- `update_event` — Edit event details
- `cancel_event` — Cancel event

## Examples

**Publish event:**
> "Publish Clarity Dinner on Feb 19 at 8:30 PM Bangkok time at The Commons"

**Check RSVPs:**
> "Who's attending my next event?"

**Update location:**
> "Change dinner location to The Commons, Thonglor"

## Troubleshooting

See [docs/mcp-server-troubleshooting.md](docs/mcp-server-troubleshooting.md)
```

---

## Document History

- **2026-02-12:** Initial draft (comprehensive PRD)
