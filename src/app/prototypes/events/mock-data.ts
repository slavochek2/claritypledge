// Mock data for events prototype

export type EventStatus = 'upcoming' | 'completed' | 'cancelled';

export interface MockEvent {
  id: string;
  slug: string;
  title: string;
  description: string;
  datetime: string;
  durationMinutes: number; // Stored in minutes (30, 60, 90, 120, etc.)
  timezone: string; // IANA timezone
  location: string;
  hostId: string;
  hostName: string;
  hostSlug: string; // For profile links
  hostRole: string;
  hostAvatarColor: string;
  maxAttendees?: number; // Capacity limit (undefined = unlimited)
  attendees: Array<{
    id: string;
    name: string;
    slug: string; // For profile links
    avatarColor: string;
  }>;
  status: EventStatus;
  createdAt: string;
}

// Mock attendees pool
// Colors: Blue/Teal/Cyan/Green family only (design system compliant)
const mockAttendees = [
  { id: 'u1', name: 'Sarah Chen', slug: 'sarah-chen', avatarColor: '#3B82F6' },
  { id: 'u2', name: 'Marcus Johnson', slug: 'marcus-johnson', avatarColor: '#10B981' },
  { id: 'u3', name: 'Elena Rodriguez', slug: 'elena-rodriguez', avatarColor: '#0891B2' },
  { id: 'u4', name: 'James Wilson', slug: 'james-wilson', avatarColor: '#059669' },
  { id: 'u5', name: 'Priya Sharma', slug: 'priya-sharma', avatarColor: '#2563EB' },
  { id: 'u6', name: 'Alex Kim', slug: 'alex-kim', avatarColor: '#06B6D4' },
  { id: 'u7', name: 'Maya Patel', slug: 'maya-patel', avatarColor: '#0EA5E9' },
  { id: 'u8', name: 'David Lee', slug: 'david-lee', avatarColor: '#14B8A6' },
  { id: 'u9', name: 'Emma Thompson', slug: 'emma-thompson', avatarColor: '#1D4ED8' },
  { id: 'u10', name: 'Michael Brown', slug: 'michael-brown', avatarColor: '#0D9488' },
  { id: 'u11', name: 'Lisa Wang', slug: 'lisa-wang', avatarColor: '#0284C7' },
  { id: 'u12', name: 'Chris Martinez', slug: 'chris-martinez', avatarColor: '#047857' },
];

// Helper to get future date
const getFutureDate = (daysFromNow: number, hour: number = 18) => {
  const date = new Date();
  date.setDate(date.getDate() + daysFromNow);
  date.setHours(hour, 0, 0, 0);
  return date.toISOString();
};

// Helper to get past date
const getPastDate = (daysAgo: number, hour: number = 18) => {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  date.setHours(hour, 0, 0, 0);
  return date.toISOString();
};

export const mockEvents: MockEvent[] = [
  {
    id: 'evt-1',
    slug: 'clarity-hike-golden-gate-2026-01-20',
    title: 'Clarity Hike: Golden Gate Edition',
    description: `Join us for a mindful hike through the beautiful Marin Headlands with stunning views of the Golden Gate Bridge.

**What to expect:**
- 5-mile moderate hike
- Clarity check-ins at scenic viewpoints
- Meaningful conversations with fellow pledgers
- Optional post-hike coffee

**Bring:**
- Comfortable hiking shoes
- Water bottle
- Sunscreen
- Curiosity and openness`,
    datetime: getFutureDate(5, 9),
    durationMinutes: 180, // 3 hours
    timezone: 'America/Los_Angeles',
    location: 'Golden Gate Bridge Vista Point, San Francisco',
    hostId: 'host-1',
    hostName: 'Slava Solonitsyn',
    hostSlug: 'slava-solonitsyn',
    hostRole: 'Clarity Pledge Founder',
    hostAvatarColor: '#3B82F6',
    maxAttendees: 12, // Capped for intimate hike
    attendees: mockAttendees.slice(0, 8),
    status: 'upcoming',
    createdAt: getPastDate(3),
  },
  {
    id: 'evt-2',
    slug: 'sensemaking-workshop-2026-01-22',
    title: 'Sensemaking Workshop: AI & Communication',
    description: `A hands-on workshop exploring how AI tools can enhance or hinder clear communication.

**Agenda:**
1. Introduction to sensemaking frameworks (30 min)
2. AI communication experiment (45 min)
3. Group discussion and insights (30 min)
4. Networking (15 min)

**You'll learn:**
- Practical techniques for clearer communication
- How to use AI tools while maintaining authenticity
- Frameworks for evaluating understanding

Space is limited to ensure quality discussions.`,
    datetime: getFutureDate(7, 18),
    durationMinutes: 120, // 2 hours
    timezone: 'Asia/Bangkok',
    location: 'Notion HQ, 2300 Harrison St, San Francisco',
    hostId: 'host-1',
    hostName: 'Slava Solonitsyn',
    hostSlug: 'slava-solonitsyn',
    hostRole: 'Clarity Pledge Founder',
    hostAvatarColor: '#3B82F6',
    maxAttendees: 12, // Full! For testing "Event Full" state
    attendees: mockAttendees.slice(0, 12),
    status: 'upcoming',
    createdAt: getPastDate(5),
  },
  {
    id: 'evt-3',
    slug: 'live-session-experiment-2026-01-25',
    title: 'Live Session Experiment: Test Our New Feature',
    description: `Be among the first to test our upcoming "Live Session" feature that helps verify understanding in real-time conversations.

**What we're testing:**
- Real-time transcription accuracy
- Understanding verification flow
- Feedback mechanisms

**What you get:**
- Early access to new features
- Direct influence on product direction
- Free premium access for 3 months
- Pizza and drinks

Your feedback shapes the future of Clarity Pledge!`,
    datetime: getFutureDate(10, 17),
    durationMinutes: 120, // 2 hours
    timezone: 'America/Los_Angeles',
    location: 'Clarity Pledge Office, 540 Howard St, San Francisco',
    hostId: 'host-1',
    hostName: 'Slava Solonitsyn',
    hostSlug: 'slava-solonitsyn',
    hostRole: 'Clarity Pledge Founder',
    hostAvatarColor: '#3B82F6',
    maxAttendees: 20,
    attendees: mockAttendees.slice(2, 9),
    status: 'upcoming',
    createdAt: getPastDate(2),
  },
  {
    id: 'evt-4',
    slug: 'clarity-coffee-2026-01-18',
    title: 'Clarity Coffee: Casual Meetup',
    description: `A relaxed coffee meetup for Clarity Pledge members to connect and share experiences.

No agenda, just good conversation with people who value clear communication.

All skill levels and backgrounds welcome!`,
    datetime: getFutureDate(3, 10),
    durationMinutes: 60, // 1 hour
    timezone: 'America/Los_Angeles',
    location: 'Sightglass Coffee, 270 7th St, San Francisco',
    hostId: 'host-2',
    hostName: 'Maya Chen',
    hostSlug: 'maya-chen',
    hostRole: 'Community Lead',
    hostAvatarColor: '#10B981',
    // No maxAttendees - unlimited capacity
    attendees: mockAttendees.slice(4, 10),
    status: 'upcoming',
    createdAt: getPastDate(1),
  },
  // Past events
  {
    id: 'evt-5',
    slug: 'first-clarity-meetup-2025-12-15',
    title: 'First Clarity Meetup: Launch Celebration',
    description: `Our inaugural community meetup to celebrate the launch of Clarity Pledge!

We discussed the vision, shared stories, and connected with early adopters.`,
    datetime: getPastDate(30, 18),
    durationMinutes: 120, // 2 hours
    timezone: 'America/Los_Angeles',
    location: 'WeWork, 44 Montgomery St, San Francisco',
    hostId: 'host-1',
    hostName: 'Slava Solonitsyn',
    hostSlug: 'slava-solonitsyn',
    hostRole: 'Clarity Pledge Founder',
    hostAvatarColor: '#3B82F6',
    attendees: mockAttendees.slice(0, 5),
    status: 'completed',
    createdAt: getPastDate(45),
  },
  {
    id: 'evt-6',
    slug: 'communication-patterns-workshop-2026-01-05',
    title: 'Workshop: Breaking Bad Communication Patterns',
    description: `An interactive workshop on identifying and breaking unhelpful communication patterns.

Participants learned practical techniques for clearer conversations.`,
    datetime: getPastDate(10, 18),
    durationMinutes: 120, // 2 hours
    timezone: 'America/Los_Angeles',
    location: 'General Assembly, 225 Bush St, San Francisco',
    hostId: 'host-1',
    hostName: 'Slava Solonitsyn',
    hostSlug: 'slava-solonitsyn',
    hostRole: 'Clarity Pledge Founder',
    hostAvatarColor: '#3B82F6',
    attendees: mockAttendees,
    status: 'completed',
    createdAt: getPastDate(25),
  },
  // === TEST EVENTS FOR EDGE CASES ===
  // Event cancelled by another host (Maya) - I was attending
  {
    id: 'evt-7',
    slug: 'maya-workshop-cancelled',
    title: 'Communication Skills Workshop (CANCELLED)',
    description: `This workshop was cancelled by the organizer.`,
    datetime: getFutureDate(14, 14),
    durationMinutes: 120, // 2 hours
    timezone: 'America/Los_Angeles',
    location: 'TechHub SF, 123 Market St',
    hostId: 'host-2',
    hostName: 'Maya Chen',
    hostSlug: 'maya-chen',
    hostRole: 'Community Lead',
    hostAvatarColor: '#10B981',
    attendees: mockAttendees.slice(0, 4),
    status: 'cancelled',
    createdAt: getPastDate(7),
  },
  // Event I cancelled as host
  {
    id: 'evt-8',
    slug: 'my-cancelled-event',
    title: 'Clarity Lunch & Learn (CANCELLED)',
    description: `Unfortunately had to cancel this event due to scheduling conflicts.`,
    datetime: getFutureDate(12, 12),
    durationMinutes: 60, // 1 hour
    timezone: 'Asia/Bangkok',
    location: 'WeWork, 44 Montgomery St, San Francisco',
    hostId: 'host-1',
    hostName: 'Slava Solonitsyn',
    hostSlug: 'slava-solonitsyn',
    hostRole: 'Clarity Pledge Founder',
    hostAvatarColor: '#3B82F6',
    attendees: mockAttendees.slice(2, 6),
    status: 'cancelled',
    createdAt: getPastDate(5),
  },
  // Event I haven't RSVP'd to yet (hosted by someone else)
  {
    id: 'evt-9',
    slug: 'open-mic-clarity',
    title: 'Open Mic: Share Your Clarity Story',
    description: `An evening of storytelling where community members share their experiences with clear communication.

**Format:**
- 5-minute stories from volunteers
- Open floor for questions
- Networking after

Come share or just listen!`,
    datetime: getFutureDate(8, 19),
    durationMinutes: 120, // 2 hours
    timezone: 'America/Los_Angeles',
    location: 'The Mill, 736 Divisadero St, San Francisco',
    hostId: 'host-2',
    hostName: 'Maya Chen',
    hostSlug: 'maya-chen',
    hostRole: 'Community Lead',
    hostAvatarColor: '#10B981',
    attendees: mockAttendees.slice(5, 9),
    status: 'upcoming',
    createdAt: getPastDate(3),
  },
  // Event where I cancelled my attendance (was going, now not in rsvpdEventIds)
  {
    id: 'evt-10',
    slug: 'book-club-clarity',
    title: 'Clarity Book Club: Nonviolent Communication',
    description: `Discussing Marshall Rosenberg's classic book on compassionate communication.

**This month's book:** Nonviolent Communication: A Language of Life

Bring your thoughts and questions!`,
    datetime: getFutureDate(6, 18),
    durationMinutes: 90, // 1.5 hours - testing non-standard duration
    timezone: 'America/Los_Angeles',
    location: 'City Lights Bookstore, 261 Columbus Ave, San Francisco',
    hostId: 'host-2',
    hostName: 'Maya Chen',
    hostSlug: 'maya-chen',
    hostRole: 'Community Lead',
    hostAvatarColor: '#10B981',
    maxAttendees: 8, // Small book club
    attendees: mockAttendees.slice(0, 7),
    status: 'upcoming',
    createdAt: getPastDate(10),
  },
];

export function getUpcomingEvents(): MockEvent[] {
  return mockEvents
    .filter(e => e.status === 'upcoming')
    .sort((a, b) => new Date(a.datetime).getTime() - new Date(b.datetime).getTime());
}

export function getPastEvents(): MockEvent[] {
  return mockEvents
    .filter(e => e.status === 'completed')
    .sort((a, b) => new Date(b.datetime).getTime() - new Date(a.datetime).getTime());
}

export function getEventBySlug(slug: string): MockEvent | undefined {
  return mockEvents.find(e => e.slug === slug);
}

// Current mock user (for prototype)
// Using 'host-1' to match Slava's events so host controls are visible
export const mockCurrentUser = {
  id: 'host-1',
  name: 'Slava Solonitsyn',
  avatarColor: '#3B82F6',
  isLoggedIn: true,
  // Events the user has RSVP'd to (for prototype demo)
  // evt-4 is hosted by Maya Chen (host-2), so user sees "You're Going" badge
  // evt-7 is cancelled by Maya - was attending, now shows cancelled
  // evt-10 (book club) - user cancelled attendance, so NOT in this list
  rsvpdEventIds: ['evt-1', 'evt-2', 'evt-4', 'evt-7'], // Hike, Workshop, Coffee, and Cancelled workshop
};

// Toggle for prototype demo - allows switching between logged in/out views
export function setMockLoggedIn(value: boolean) {
  mockCurrentUser.isLoggedIn = value;
};

// Check if current user is RSVP'd to an event
export function isUserRsvpd(eventId: string): boolean {
  return mockCurrentUser.rsvpdEventIds.includes(eventId);
}

// Check if an event is at capacity
export function isEventFull(event: MockEvent): boolean {
  if (!event.maxAttendees) return false; // No limit
  return event.attendees.length >= event.maxAttendees;
}

// Get spots remaining for an event
export function getSpotsRemaining(event: MockEvent): number | null {
  if (!event.maxAttendees) return null; // Unlimited
  return Math.max(0, event.maxAttendees - event.attendees.length);
}

// Cancel an event (set status to cancelled)
export function cancelEvent(eventId: string): boolean {
  const event = mockEvents.find(e => e.id === eventId);
  if (event && event.hostId === mockCurrentUser.id) {
    event.status = 'cancelled';
    return true;
  }
  return false;
}

// Cancel RSVP for current user
export function cancelRsvp(eventId: string): boolean {
  const index = mockCurrentUser.rsvpdEventIds.indexOf(eventId);
  if (index > -1) {
    mockCurrentUser.rsvpdEventIds.splice(index, 1);
    return true;
  }
  return false;
}
