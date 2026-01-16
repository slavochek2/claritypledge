// Mock data for events prototype

export type EventStatus = 'upcoming' | 'completed' | 'cancelled';

export interface MockEvent {
  id: string;
  slug: string;
  title: string;
  description: string;
  datetime: string;
  durationHours: number;
  location: string;
  hostId: string;
  hostName: string;
  hostRole: string;
  hostAvatarColor: string;
  coverImageUrl?: string;
  attendees: Array<{
    id: string;
    name: string;
    avatarColor: string;
  }>;
  status: EventStatus;
  createdAt: string;
}

// Mock attendees pool
const mockAttendees = [
  { id: 'u1', name: 'Sarah Chen', avatarColor: '#3B82F6' },
  { id: 'u2', name: 'Marcus Johnson', avatarColor: '#10B981' },
  { id: 'u3', name: 'Elena Rodriguez', avatarColor: '#8B5CF6' },
  { id: 'u4', name: 'James Wilson', avatarColor: '#F59E0B' },
  { id: 'u5', name: 'Priya Sharma', avatarColor: '#EF4444' },
  { id: 'u6', name: 'Alex Kim', avatarColor: '#06B6D4' },
  { id: 'u7', name: 'Maya Patel', avatarColor: '#EC4899' },
  { id: 'u8', name: 'David Lee', avatarColor: '#14B8A6' },
  { id: 'u9', name: 'Emma Thompson', avatarColor: '#6366F1' },
  { id: 'u10', name: 'Michael Brown', avatarColor: '#84CC16' },
  { id: 'u11', name: 'Lisa Wang', avatarColor: '#F97316' },
  { id: 'u12', name: 'Chris Martinez', avatarColor: '#A855F7' },
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
    durationHours: 3,
    location: 'Golden Gate Bridge Vista Point, San Francisco',
    hostId: 'host-1',
    hostName: 'Slava Solonitsyn',
    hostRole: 'Clarity Pledge Founder',
    hostAvatarColor: '#3B82F6',
    coverImageUrl: 'https://images.unsplash.com/photo-1501594907352-04cda38ebc29?w=1200&h=400&fit=crop',
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
    durationHours: 2,
    location: 'Notion HQ, 2300 Harrison St, San Francisco',
    hostId: 'host-1',
    hostName: 'Slava Solonitsyn',
    hostRole: 'Clarity Pledge Founder',
    hostAvatarColor: '#3B82F6',
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
    durationHours: 2,
    location: 'Clarity Pledge Office, 540 Howard St, San Francisco',
    hostId: 'host-1',
    hostName: 'Slava Solonitsyn',
    hostRole: 'Clarity Pledge Founder',
    hostAvatarColor: '#3B82F6',
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
    durationHours: 1,
    location: 'Sightglass Coffee, 270 7th St, San Francisco',
    hostId: 'host-2',
    hostName: 'Maya Chen',
    hostRole: 'Community Lead',
    hostAvatarColor: '#10B981',
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
    durationHours: 2,
    location: 'WeWork, 44 Montgomery St, San Francisco',
    hostId: 'host-1',
    hostName: 'Slava Solonitsyn',
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
    durationHours: 2,
    location: 'General Assembly, 225 Bush St, San Francisco',
    hostId: 'host-1',
    hostName: 'Slava Solonitsyn',
    hostRole: 'Clarity Pledge Founder',
    hostAvatarColor: '#3B82F6',
    attendees: mockAttendees,
    status: 'completed',
    createdAt: getPastDate(25),
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
export const mockCurrentUser = {
  id: 'current-user',
  name: 'You',
  avatarColor: '#6366F1',
  isLoggedIn: true,
  // Events the user has RSVP'd to (for prototype demo)
  rsvpdEventIds: ['evt-1', 'evt-2'], // Hike and Workshop
};

// Check if current user is RSVP'd to an event
export function isUserRsvpd(eventId: string): boolean {
  return mockCurrentUser.rsvpdEventIds.includes(eventId);
}
