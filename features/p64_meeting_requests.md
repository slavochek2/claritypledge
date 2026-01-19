# P64: Async Meeting Requests

## Problem

P62 introduces sync meeting invitations: User A clicks "Invite to a Clarity Meeting" → goes to `/live` → shares link manually → User B must join NOW.

This doesn't work when:
- User B isn't online right now
- User A doesn't have User B's contact info (phone/email)
- User A wants to schedule for later

Users need a way to **request** a meeting that the other person can **accept later**.

## Solution

In-app meeting request system:
1. User A sends meeting request to User B
2. User B sees notification (bell icon in nav)
3. User B accepts → Both go to `/live`
4. Or User B declines / request expires

## User Stories

### As a meeting requester
- I want to request a Clarity Meeting with someone from my event
- I want to see the status of my pending requests
- I want to know when they accept so we can start

### As a request recipient
- I want to see meeting requests in my notifications
- I want to accept or decline requests
- I want requests to expire so I'm not overwhelmed with old ones

## Design

### Notification Bell (Nav)

Add notification bell to nav for logged-in users:

```
DESKTOP:
[Events] [Pledgers] [Manifesto] [About] [Start a Clarity Meeting] [🔔 2] [Avatar]
                                                                    ↑
                                                              Unread count badge
```

Click bell → Dropdown with notifications:

```
┌─────────────────────────────────────────────┐
│  Notifications                              │
├─────────────────────────────────────────────┤
│  🆕 Sarah Chen wants to have a Clarity      │
│     Meeting with you                        │
│     from: Clarity Hike                      │
│     [Accept]  [Decline]           2h ago    │
├─────────────────────────────────────────────┤
│  ✓  Marcus accepted your meeting request    │
│     [Start Meeting]               1d ago    │
├─────────────────────────────────────────────┤
│  ✗  Elena declined your meeting request     │
│                                   2d ago    │
├─────────────────────────────────────────────┤
│  [See all notifications]                    │
└─────────────────────────────────────────────┘
```

### Request Flow

**Sending a request:**

```
┌─────────────────────────────────────────────┐
│  [Avatar] Sarah Chen                        │
│                                             │
│  ┌─────────────────────────────────────┐   │
│  │ Invite to a Clarity Meeting         │   │  ← P62 (sync)
│  └─────────────────────────────────────┘   │
│  ┌─────────────────────────────────────┐   │
│  │ Request a Meeting                   │   │  ← P64 (async) NEW
│  └─────────────────────────────────────┘   │
│                                             │
└─────────────────────────────────────────────┘
```

Or single button with choice:

```
┌─────────────────────────────────────────────┐
│  [Avatar] Sarah Chen                        │
│                                             │
│  [Invite to a Clarity Meeting ▾]            │
│  ┌─────────────────────────────────────┐   │
│  │ Start now (share link)              │   │
│  │ Request meeting (they accept later) │   │
│  └─────────────────────────────────────┘   │
└─────────────────────────────────────────────┘
```

**After sending:**

```
┌─────────────────────────────────────────────┐
│  ✓ Request sent to Sarah Chen               │
│                                             │
│  We'll notify you when they respond.        │
│                                             │
│  [View pending requests]                    │
└─────────────────────────────────────────────┘
```

### Accepting a Request

From notification dropdown:

```
Click [Accept] →
┌─────────────────────────────────────────────┐
│  Ready to meet with Sarah Chen?             │
│                                             │
│  This will start a Clarity Meeting now.     │
│  Make sure you have 10-15 minutes.          │
│                                             │
│  [Start Meeting]  [Not now]                 │
└─────────────────────────────────────────────┘
```

Click [Start Meeting] → Creates session → Both users notified → Both go to `/live/{code}`

### Request States

```
PENDING → ACCEPTED → STARTED
       ↘ DECLINED
       ↘ EXPIRED (after 7 days)
       ↘ CANCELLED (requester withdraws)
```

### Notifications Page (`/notifications`)

Full list of all notifications (not just meeting requests):

```
┌─────────────────────────────────────────────────────────────────┐
│  Notifications                                                  │
│                                                                 │
│  ─── TODAY ──────────────────────────────────────────────────  │
│                                                                 │
│  🆕 Sarah Chen wants to have a Clarity Meeting                  │
│     from: Clarity Hike                                          │
│     [Accept]  [Decline]                              2 hours ago│
│                                                                 │
│  ─── YESTERDAY ──────────────────────────────────────────────  │
│                                                                 │
│  ✓  Marcus Johnson accepted your meeting request                │
│     [Start Meeting]                                    1 day ago│
│                                                                 │
│  ─── EARLIER ────────────────────────────────────────────────  │
│                                                                 │
│  ✗  Elena Rodriguez declined your meeting request               │
│                                                         2 days ago│
│                                                                 │
│  ⏰ Your meeting request to Alex Kim expired                    │
│                                                         7 days ago│
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Technical Notes

### Database Schema

```sql
-- Meeting requests
CREATE TABLE meeting_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  requester_id UUID NOT NULL REFERENCES profiles(id),
  recipient_id UUID NOT NULL REFERENCES profiles(id),
  event_id UUID REFERENCES events(id),  -- Optional: context of how they met
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined', 'expired', 'cancelled', 'started')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  responded_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '7 days'),
  session_code TEXT,  -- Set when accepted and session created

  -- Prevent duplicate pending requests
  UNIQUE(requester_id, recipient_id) WHERE status = 'pending'
);

-- Notifications (generic, extensible)
CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id),
  type TEXT NOT NULL,  -- 'meeting_request', 'meeting_accepted', 'meeting_declined', etc.
  data JSONB NOT NULL DEFAULT '{}',  -- Flexible payload
  read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_meeting_requests_recipient ON meeting_requests(recipient_id) WHERE status = 'pending';
CREATE INDEX idx_meeting_requests_requester ON meeting_requests(requester_id);
CREATE INDEX idx_notifications_user_unread ON notifications(user_id) WHERE read = FALSE;
```

### RLS Policies

```sql
-- Meeting requests: Users can see their own (sent or received)
CREATE POLICY "Users can view their meeting requests"
  ON meeting_requests FOR SELECT
  USING (auth.uid() = requester_id OR auth.uid() = recipient_id);

CREATE POLICY "Users can create meeting requests"
  ON meeting_requests FOR INSERT
  WITH CHECK (auth.uid() = requester_id);

CREATE POLICY "Recipients can update request status"
  ON meeting_requests FOR UPDATE
  USING (auth.uid() = recipient_id)
  WITH CHECK (status IN ('accepted', 'declined'));

-- Notifications: Users can only see their own
CREATE POLICY "Users can view their notifications"
  ON notifications FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can mark their notifications as read"
  ON notifications FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (read = TRUE);  -- Can only set read=true
```

### API / Service Interface

```typescript
interface MeetingRequestService {
  // Send a request
  sendRequest(recipientId: string, eventId?: string): Promise<MeetingRequest>;

  // Respond to a request
  acceptRequest(requestId: string): Promise<{ request: MeetingRequest; sessionCode: string }>;
  declineRequest(requestId: string): Promise<MeetingRequest>;
  cancelRequest(requestId: string): Promise<void>;

  // Query requests
  getPendingRequestsReceived(userId: string): Promise<MeetingRequest[]>;
  getPendingRequestsSent(userId: string): Promise<MeetingRequest[]>;

  // Check if request exists (prevent duplicates)
  hasPendingRequest(requesterId: string, recipientId: string): Promise<boolean>;
}

interface NotificationService {
  // Get notifications
  getUnreadCount(userId: string): Promise<number>;
  getNotifications(userId: string, limit?: number): Promise<Notification[]>;

  // Mark as read
  markAsRead(notificationId: string): Promise<void>;
  markAllAsRead(userId: string): Promise<void>;

  // Real-time subscription
  subscribeToNotifications(userId: string, callback: (n: Notification) => void): () => void;
}

interface MeetingRequest {
  id: string;
  requesterId: string;
  requesterName: string;
  requesterSlug: string;
  requesterAvatarColor?: string;
  recipientId: string;
  recipientName: string;
  recipientSlug: string;
  eventId?: string;
  eventTitle?: string;
  status: 'pending' | 'accepted' | 'declined' | 'expired' | 'cancelled' | 'started';
  createdAt: string;
  respondedAt?: string;
  expiresAt: string;
  sessionCode?: string;
}

interface Notification {
  id: string;
  type: 'meeting_request' | 'meeting_accepted' | 'meeting_declined' | 'meeting_expired';
  data: Record<string, unknown>;
  read: boolean;
  createdAt: string;
}
```

### Real-time Updates

Use Supabase Realtime to:
1. Update notification badge count when new notification arrives
2. Notify requester when recipient accepts (so both can go to `/live`)
3. Update request status in UI without refresh

```typescript
// Subscribe to new notifications
const subscription = supabase
  .channel('notifications')
  .on('postgres_changes', {
    event: 'INSERT',
    schema: 'public',
    table: 'notifications',
    filter: `user_id=eq.${userId}`
  }, (payload) => {
    // Update badge count, show toast, etc.
  })
  .subscribe();
```

### New Files

| File | Purpose |
|------|---------|
| `src/app/pages/notifications-page.tsx` | Full notifications list |
| `src/app/components/notifications/notification-bell.tsx` | Nav bell with dropdown |
| `src/app/components/notifications/notification-item.tsx` | Single notification row |
| `src/app/components/notifications/meeting-request-actions.tsx` | Accept/Decline buttons |
| `src/app/data/meeting-requests.ts` | Meeting request API calls |
| `src/app/data/notifications.ts` | Notification API calls |
| `src/hooks/use-notifications.ts` | Hook for notification state + real-time |
| `supabase/migrations/xxx_meeting_requests.sql` | DB schema |

### Modified Files

| File | Change |
|------|--------|
| `src/app/components/layout/simple-navigation.tsx` | Add notification bell |
| `src/App.tsx` | Add `/notifications` route |
| Dashboard people cards | Add "Request meeting" option |
| Event page attendee cards | Add "Request meeting" option |

## Edge Cases

| Scenario | Behavior |
|----------|----------|
| Request already pending | Show "Request pending" instead of button |
| Recipient accepts but requester offline | Requester sees notification when online, can start meeting |
| Both accept at exact same time | First acceptance wins, creates session |
| Request expires while viewing | UI updates to show expired state |
| User blocks/unfriends (future) | Requests from blocked users hidden |
| Requester cancels after recipient opens notification | Show "Request withdrawn" |

## Phases

### Phase 1: Database + Basic API
- [ ] Create `meeting_requests` table with RLS
- [ ] Create `notifications` table with RLS
- [ ] Implement `MeetingRequestService` (send, accept, decline)
- [ ] Implement `NotificationService` (get, mark read)
- [ ] Add expiration cron job (mark old requests as expired)

### Phase 2: Notification Bell UI
- [ ] Add notification bell to nav (logged-in users)
- [ ] Show unread count badge
- [ ] Dropdown with recent notifications
- [ ] Accept/Decline actions in dropdown
- [ ] Mark as read on view

### Phase 3: Request Flow Integration
- [ ] Add "Request meeting" option to dashboard people cards
- [ ] Add "Request meeting" option to event page attendee cards
- [ ] Show "Request pending" state when request exists
- [ ] Confirmation dialog for sending request
- [ ] Success toast after sending

### Phase 4: Accept Flow + Meeting Start
- [ ] Accept dialog with "Start Meeting" button
- [ ] Create session on accept
- [ ] Notify requester (real-time)
- [ ] Both users can navigate to `/live/{code}`
- [ ] Handle "Start later" option (session code saved)

### Phase 5: Full Notifications Page
- [ ] Create `/notifications` page
- [ ] Group by date (Today, Yesterday, Earlier)
- [ ] Mark all as read button
- [ ] Filter by type (future)

### Phase 6: Real-time Updates
- [ ] Supabase Realtime subscription for new notifications
- [ ] Live badge count update
- [ ] Toast notification for new requests
- [ ] Auto-update UI when request status changes

## Out of Scope

- Email notifications (P63)
- Push notifications (future)
- Scheduled meetings with calendar integration
- Blocking/muting users
- Message with request ("Hey, want to chat about...")

## Success Metrics

- % of meeting requests that get accepted
- Time from request to acceptance
- % of accepted requests that become actual meetings
- Reduction in "manual link sharing" (sync flow)

## Dependencies

- P62 (Dashboard) — Provides the UI context for meeting buttons
- P61 (Events) — Provides event context for requests

## Prep Notes (for future /prep-spec)

Notes from initial review (2025-01-19):

### Button Design Decision
"Request meeting" = "Invite to a Clarity Meeting" = same concept. Consider unified button:
- **Option:** Single "[C] Start Meeting" button with dropdown:
  - "Start now (share link)" — sync, P62
  - "Send request (they accept later)" — async, P64

### Event Page Attendee Cards
- Only show meeting button to users who are ALSO attending the event
- Non-attendees viewing the event page should NOT see meeting buttons on attendee cards
- This prevents strangers from requesting meetings with event attendees

### Review Findings to Address
- **Bidirectional requests:** Block if any pending request exists between the pair (decided)
- **"Not now" button:** Keeps request pending, soft dismiss (decided)
- **Mobile bell:** Always visible next to hamburger menu (decided)
- **Cron job:** Use DB trigger/view instead of pg_cron (architect recommendation)
- **Empty states:** Need for notifications dropdown and /notifications page
- **Accessibility:** Keyboard nav for dropdown, ARIA live region for badge updates

## References

- Supabase Realtime: https://supabase.com/docs/guides/realtime
- Notification patterns: Similar to LinkedIn connection requests

## Changelog

- **2025-01-19**: Initial spec created based on P62 UX review discussion.
- **2025-01-19**: Added prep notes from UX + Architect review. Deferred full prep until P62 is complete.
