// ============================================================================
// Shared Mock Data for Prototypes
// ============================================================================
// Single source of truth for all prototype mock data.
// Both linkedin-like and premium import from here.

import type {
  User,
  Idea,
  IdeaSimple,
  Certification,
  VerificationSession,
  Comment,
  Message,
  Position,
  UserCalibration,
  CalibrationState,
  Notification,
} from './types';

// -----------------------------------------------------------------------------
// Current User
// -----------------------------------------------------------------------------

export const currentUser: User = {
  id: 'current',
  name: 'Jordan Taylor',
  avatar: '👤',
  verifiedListenerScore: 5,
  bio: 'Building better understanding',
  role: 'Product Manager',
  company: 'TechCorp',
  connections: 127,
  hasPledged: true, // Current user has taken the pledge
};

// -----------------------------------------------------------------------------
// Mock Users
// -----------------------------------------------------------------------------

export const mockUsers: User[] = [
  {
    id: '1',
    name: 'Alice Chen',
    avatar: '👩‍💼',
    verifiedListenerScore: 12,
    bio: 'Driving product strategy with empathy and data.',
    role: 'Senior Product Manager',
    company: 'TechCorp',
    connections: 543,
    hasPledged: true, // Pledger - gets blue ring
  },
  {
    id: '2',
    name: 'Bob Smith',
    avatar: '👨‍💻',
    verifiedListenerScore: 8,
    bio: 'Full-stack engineer. Passionate about clean code.',
    role: 'Staff Engineer',
    company: 'StartupXYZ',
    connections: 312,
    hasPledged: false, // Non-pledger - no ring, no pledge CTA
  },
  {
    id: '3',
    name: 'Carol Davis',
    avatar: '👩‍🔬',
    verifiedListenerScore: 15,
    bio: 'UX Research Lead. Making products people actually want to use.',
    role: 'Research Lead',
    company: 'DesignCo',
    connections: 891,
    hasPledged: true, // Pledger
  },
  {
    id: '4',
    name: 'David Park',
    avatar: '👨‍🎨',
    verifiedListenerScore: 6,
    bio: 'Design systems and accessibility advocate.',
    role: 'Principal Designer',
    company: 'TechCorp',
    connections: 234,
    hasPledged: false, // Non-pledger
  },
  {
    id: '5',
    name: 'Emma Wilson',
    avatar: '👩‍💻',
    verifiedListenerScore: 10,
    bio: 'Engineering manager building high-performing teams.',
    role: 'Engineering Manager',
    company: 'BigTech Inc',
    connections: 678,
    hasPledged: true, // Pledger
  },
];

// -----------------------------------------------------------------------------
// Mock Ideas (Full format with timestamps and visibility)
// -----------------------------------------------------------------------------

export const mockIdeas: Idea[] = [
  {
    id: '1',
    text: 'Remote work is more productive than office work for knowledge workers',
    createdBy: '1',
    createdAt: '2026-01-03T10:00:00Z',
    visibility: 'public',
    positions: {
      '1': { position: 'agree', timestamp: '2026-01-03T10:00:00Z' },
      '2': { position: 'disagree', timestamp: '2026-01-03T14:30:00Z' },
      '3': { position: 'agree', timestamp: '2026-01-04T09:15:00Z' },
      '4': { position: 'unsure', timestamp: '2026-01-05T11:00:00Z' },
      '5': { position: 'disagree', timestamp: '2026-01-06T16:45:00Z' },
      'current': { position: 'agree', timestamp: '2026-01-07T08:30:00Z' },
    },
    understoodCount: 3,
    crossDisagreementCount: 1,
    commentCount: 5,
  },
  {
    id: '2',
    text: 'AI will replace most knowledge work within 10 years',
    createdBy: '2',
    createdAt: '2026-01-02T14:00:00Z',
    visibility: 'public',
    positions: {
      '1': { position: 'disagree', timestamp: '2026-01-02T15:00:00Z' },
      '2': { position: 'agree', timestamp: '2026-01-02T14:00:00Z' },
      '3': { position: 'unsure', timestamp: '2026-01-03T10:30:00Z' },
      '4': { position: 'disagree', timestamp: '2026-01-04T13:00:00Z' },
      '5': { position: 'agree', timestamp: '2026-01-05T09:00:00Z' },
      'current': { position: 'disagree', timestamp: '2026-01-06T11:15:00Z' },
    },
    understoodCount: 2,
    crossDisagreementCount: 2,
    commentCount: 12,
  },
  {
    id: '3',
    text: 'Code reviews are more valuable than automated testing',
    createdBy: '3',
    createdAt: '2026-01-01T09:00:00Z',
    visibility: 'shared',
    positions: {
      '1': { position: 'unsure', timestamp: '2026-01-01T12:00:00Z' },
      '2': { position: 'disagree', timestamp: '2026-01-02T08:30:00Z' },
      '3': { position: 'agree', timestamp: '2026-01-01T09:00:00Z' },
      '4': { position: 'agree', timestamp: '2026-01-03T14:00:00Z' },
      '5': { position: 'disagree', timestamp: '2026-01-04T10:15:00Z' },
      'current': { position: 'agree', timestamp: '2026-01-05T16:30:00Z' },
    },
    understoodCount: 1,
    crossDisagreementCount: 0,
    commentCount: 8,
  },
  {
    id: '4',
    text: 'Startups should prioritize speed over code quality in early stages',
    createdBy: '4',
    createdAt: '2025-12-30T16:00:00Z',
    visibility: 'public',
    positions: {
      '1': { position: 'agree', timestamp: '2025-12-30T18:00:00Z' },
      '2': { position: 'agree', timestamp: '2025-12-31T09:30:00Z' },
      '3': { position: 'disagree', timestamp: '2026-01-01T11:00:00Z' },
      '4': { position: 'agree', timestamp: '2025-12-30T16:00:00Z' },
      '5': { position: 'unsure', timestamp: '2026-01-02T14:45:00Z' },
      'current': { position: 'unsure', timestamp: '2026-01-03T10:00:00Z' },
    },
    understoodCount: 4,
    crossDisagreementCount: 1,
    commentCount: 15,
  },
  {
    id: '5',
    text: 'Most meetings could be replaced by async communication',
    createdBy: '5',
    createdAt: '2025-12-28T11:00:00Z',
    visibility: 'shared',
    positions: {
      '1': { position: 'agree', timestamp: '2025-12-28T14:00:00Z' },
      '2': { position: 'agree', timestamp: '2025-12-29T09:00:00Z' },
      '3': { position: 'agree', timestamp: '2025-12-30T10:30:00Z' },
      '4': { position: 'disagree', timestamp: '2025-12-31T15:00:00Z' },
      '5': { position: 'agree', timestamp: '2025-12-28T11:00:00Z' },
      'current': { position: 'agree', timestamp: '2026-01-01T08:00:00Z' },
    },
    understoodCount: 5,
    crossDisagreementCount: 1,
    commentCount: 20,
  },
  {
    id: '6',
    text: 'The best engineers are those who can explain complex things simply',
    createdBy: 'current',
    createdAt: '2025-12-25T09:00:00Z',
    visibility: 'private',
    positions: {
      'current': { position: 'agree', timestamp: '2025-12-25T09:00:00Z' },
    },
    understoodCount: 0,
    crossDisagreementCount: 0,
    commentCount: 0,
  },
];

// -----------------------------------------------------------------------------
// Simplified Ideas (for Premium prototype)
// -----------------------------------------------------------------------------

export function getSimplifiedIdeas(): IdeaSimple[] {
  return mockIdeas.map(idea => ({
    id: idea.id,
    text: idea.text,
    createdBy: idea.createdBy,
    createdAt: idea.createdAt,
    understoodCount: idea.understoodCount,
    crossDisagreementCount: idea.crossDisagreementCount,
    commentCount: idea.commentCount,
    positions: Object.fromEntries(
      Object.entries(idea.positions).map(([userId, entry]) => [
        userId,
        entry?.position ?? null,
      ])
    ) as Record<string, Position>,
  }));
}

// -----------------------------------------------------------------------------
// Verification Sessions
// -----------------------------------------------------------------------------

export const mockVerificationSessions: VerificationSession[] = [
  // Idea 1: Mix of all statuses and directionalities for current user
  {
    id: 'v1',
    ideaId: '1',
    participants: ['current', '1'],
    status: 'verified',
    startedAt: '2026-01-05T10:00:00Z',
    completedAt: '2026-01-05T10:30:00Z',
    verifiedBy: ['current', '1'], // Mutual - both understand each other
    ratings: { 'current': 9, '1': 8 }, // You gave 9/10, Alice gave 8/10
  },
  {
    id: 'v1b',
    ideaId: '1',
    participants: ['current', '2'],
    status: 'in_progress',
    startedAt: '2026-01-06T14:00:00Z',
    verifiedBy: ['current'], // One-way: You understand Bob, waiting on Bob
    ratings: { 'current': 7 }, // You gave 7/10, Bob hasn't rated yet
  },
  {
    id: 'v1c',
    ideaId: '1',
    participants: ['current', '3'],
    status: 'in_progress',
    startedAt: '2026-01-07T11:00:00Z',
    verifiedBy: ['3'], // One-way: Carol understands you, you haven't verified her
    ratings: { '3': 6 }, // Carol gave 6/10, you haven't rated yet
  },
  // User 4, 5 with current user on idea 1 = not_started (no session)
  {
    id: 'v4',
    ideaId: '1',
    participants: ['1', '2'],
    status: 'verified',
    startedAt: '2026-01-04T10:00:00Z',
    completedAt: '2026-01-04T10:30:00Z',
    verifiedBy: ['1', '2'], // Mutual between Alice and Bob
    ratings: { '1': 10, '2': 9 }, // Alice gave 10/10, Bob gave 9/10
  },
  // Idea 2: in_progress for current user
  {
    id: 'v2',
    ideaId: '2',
    participants: ['current', '2'],
    status: 'in_progress',
    startedAt: '2026-01-06T14:00:00Z',
    verifiedBy: [], // Started but no one has verified yet
    ratings: {}, // No ratings yet
  },
  {
    id: 'v2b',
    ideaId: '2',
    participants: ['current', '1'],
    status: 'verified',
    startedAt: '2026-01-07T09:00:00Z',
    completedAt: '2026-01-07T09:30:00Z',
    verifiedBy: ['current', '1'], // Mutual
    ratings: { 'current': 8, '1': 10 }, // You gave 8/10, Alice gave perfect 10
  },
  // Idea 3: verified for current user
  {
    id: 'v3',
    ideaId: '3',
    participants: ['current', '3'],
    status: 'verified',
    startedAt: '2026-01-04T11:00:00Z',
    completedAt: '2026-01-04T11:45:00Z',
    verifiedBy: ['current', '3'], // Mutual
    ratings: { 'current': 10, '3': 10 }, // Perfect mutual understanding!
  },
  {
    id: 'v3b',
    ideaId: '3',
    participants: ['current', '2'],
    status: 'in_progress',
    startedAt: '2026-01-08T10:00:00Z',
    verifiedBy: ['2'], // One-way: Bob understands you
    ratings: { '2': 5 }, // Bob gave 5/10, you haven't rated yet
  },
];

// -----------------------------------------------------------------------------
// Certifications
// -----------------------------------------------------------------------------

export const mockCertifications: Certification[] = [
  { id: '1', ideaId: '1', speakerId: '1', listenerId: '2', speakerPosition: 'agree', listenerPosition: 'disagree', createdAt: '2026-01-04T10:00:00Z' },
  { id: '2', ideaId: '1', speakerId: '2', listenerId: '1', speakerPosition: 'disagree', listenerPosition: 'agree', createdAt: '2026-01-04T10:30:00Z' },
  { id: '3', ideaId: '2', speakerId: '2', listenerId: '5', speakerPosition: 'agree', listenerPosition: 'agree', createdAt: '2026-01-03T15:00:00Z' },
  { id: '4', ideaId: '4', speakerId: '3', listenerId: '1', speakerPosition: 'disagree', listenerPosition: 'agree', createdAt: '2026-01-02T14:00:00Z' },
  { id: '5', ideaId: '5', speakerId: '4', listenerId: '5', speakerPosition: 'disagree', listenerPosition: 'agree', createdAt: '2026-01-01T12:00:00Z' },
];

// -----------------------------------------------------------------------------
// Comments
// -----------------------------------------------------------------------------

export const mockComments: Comment[] = [
  { id: '1', ideaId: '1', userId: '2', text: 'I think this depends heavily on the type of work and team culture. In my experience, deep work is easier at home, but collaboration suffers.', createdAt: '2026-01-03T11:00:00Z', likes: 12 },
  { id: '2', ideaId: '1', userId: '3', text: 'The data from our team supports this — 20% productivity increase after going remote. We should verify understanding on the metrics definition though.', createdAt: '2026-01-03T12:00:00Z', likes: 8 },
  { id: '3', ideaId: '1', userId: '4', text: 'What about collaboration and spontaneous conversations? Those are harder to measure but crucial for innovation.', createdAt: '2026-01-03T13:00:00Z', likes: 5 },
  { id: '4', ideaId: '2', userId: '1', text: 'I think AI will augment rather than replace. The timeline seems aggressive. Would love to verify understanding on what "replace" means exactly.', createdAt: '2026-01-02T15:00:00Z', likes: 15 },
  { id: '5', ideaId: '2', userId: '3', text: 'Depends on your definition of "knowledge work" — some tasks are more automatable than others. Let\'s break this down.', createdAt: '2026-01-02T16:00:00Z', likes: 7 },
];

// -----------------------------------------------------------------------------
// Notifications (Bell Icon)
// -----------------------------------------------------------------------------

export const mockNotifications: Notification[] = [
  {
    id: 'n1',
    type: 'verification_request',
    fromUserId: '1', // Alice
    storyId: 'st8',  // Wants to verify your remote work story
    eventId: 'evt-1',
    createdAt: '2026-01-09T14:30:00Z',
    read: false,
  },
  {
    id: 'n2',
    type: 'verification_request',
    fromUserId: '3', // Carol
    storyId: 'st9',  // Wants to verify your no-meetings story
    eventId: 'evt-2',
    createdAt: '2026-01-09T10:15:00Z',
    read: false,
  },
  {
    id: 'n3',
    type: 'verification_accepted',
    fromUserId: '2', // Bob accepted your request
    storyId: 'st2',
    createdAt: '2026-01-08T16:00:00Z',
    read: true,
  },
];

/**
 * Get unread notification count for badge display.
 */
export function getUnreadNotificationCount(): number {
  return mockNotifications.filter(n => !n.read).length;
}

/**
 * Get all notifications for current user, sorted by date (newest first).
 */
export function getNotifications(): Notification[] {
  return [...mockNotifications].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

// -----------------------------------------------------------------------------
// Messages
// -----------------------------------------------------------------------------

export const mockMessages: Message[] = [
  { id: '1', senderId: '1', text: 'Hey, I saw your position on the remote work idea. I disagree but would love to understand your perspective better.', createdAt: '2026-01-04T09:00:00Z', read: true },
  { id: '2', senderId: 'current', text: 'Thanks for reaching out! I think we might be defining "productive" differently.', createdAt: '2026-01-04T09:05:00Z', read: true },
  { id: '3', senderId: '1', text: 'Exactly. For me, productivity includes quality of deep work AND collaboration output. What\'s your framework?', createdAt: '2026-01-04T09:10:00Z', read: true },
  { id: '4', senderId: 'current', text: 'I was thinking more about focused output — lines of code, documents completed. But your point about collaboration is valid.', createdAt: '2026-01-04T09:15:00Z', read: true },
  { id: '5', senderId: '1', text: 'Want to go live and verify properly? I think we can reach mutual understanding even if we still disagree.', createdAt: '2026-01-04T09:20:00Z', ideaId: '1', read: false },
];

// -----------------------------------------------------------------------------
// P55: Understanding Verification Loop Mock Data
// -----------------------------------------------------------------------------

import type { SurfacedIdea, IdeaQueueItem } from './types';

/**
 * Mock surfaced ideas for a live meeting.
 * These are ideas Alice (user 1) has surfaced for the current user to review.
 */
export const mockSurfacedIdeas: SurfacedIdea[] = [
  {
    id: 's1',
    text: 'We should ship the MVP by Friday to get early user feedback',
    surfacedBy: '1', // Alice
    surfacedAt: '2026-01-12T10:05:00Z',
  },
  {
    id: 's2',
    text: 'The checkout flow needs a progress indicator to reduce abandonment',
    surfacedBy: '1', // Alice
    surfacedAt: '2026-01-12T10:08:00Z',
  },
  {
    id: 's3',
    text: 'We should prioritize mobile experience over desktop for the beta',
    surfacedBy: '1', // Alice
    surfacedAt: '2026-01-12T10:12:00Z',
  },
  {
    id: 's4',
    text: 'The onboarding should ask for fewer permissions upfront',
    surfacedBy: '1', // Alice
    surfacedAt: '2026-01-12T10:15:00Z',
  },
];

/**
 * Convert surfaced ideas to queue items (LIFO order).
 * Most recent ideas appear first in the queue.
 */
export function createIdeaQueue(ideas: SurfacedIdea[]): IdeaQueueItem[] {
  // Sort by surfacedAt descending (newest first) for LIFO
  const sorted = [...ideas].sort((a, b) =>
    new Date(b.surfacedAt).getTime() - new Date(a.surfacedAt).getTime()
  );

  return sorted.map((idea, index) => ({
    ...idea,
    queuePosition: index,
    actioned: false,
  }));
}

/**
 * Get the initial queue for "Your Ideas" section.
 */
export function getInitialYourIdeasQueue(): IdeaQueueItem[] {
  return createIdeaQueue(mockSurfacedIdeas);
}

/**
 * Mock ideas the current user has surfaced for Alice to review.
 */
export const mockYourSurfacedIdeas: SurfacedIdea[] = [
  {
    id: 'y1',
    text: 'We need to add better error messages for form validation',
    surfacedBy: 'current',
    surfacedAt: '2026-01-12T10:03:00Z',
  },
  {
    id: 'y2',
    text: 'The API response times are too slow for the dashboard',
    surfacedBy: 'current',
    surfacedAt: '2026-01-12T10:10:00Z',
  },
];

// -----------------------------------------------------------------------------
// Helper Functions
// -----------------------------------------------------------------------------

export function getUserById(id: string): User | undefined {
  if (id === 'current') return currentUser;
  return mockUsers.find(u => u.id === id);
}

export function getIdeaById(id: string): Idea | undefined {
  return mockIdeas.find(i => i.id === id);
}

export function getSimpleIdeaById(id: string): IdeaSimple | undefined {
  return getSimplifiedIdeas().find(i => i.id === id);
}

export function getCommentsForIdea(ideaId: string): Comment[] {
  return mockComments.filter(c => c.ideaId === ideaId);
}

export function getCertificationsForIdea(ideaId: string): Certification[] {
  return mockCertifications.filter(c => c.ideaId === ideaId);
}

export function getCertificationsForUser(userId: string): { given: Certification[]; received: Certification[] } {
  return {
    given: mockCertifications.filter(c => c.speakerId === userId),
    received: mockCertifications.filter(c => c.listenerId === userId),
  };
}

export function getVerificationStatus(ideaId: string, userId1: string, userId2: string): VerificationSession | null {
  return mockVerificationSessions.find(s =>
    s.ideaId === ideaId &&
    s.participants.includes(userId1) &&
    s.participants.includes(userId2)
  ) || null;
}

/**
 * Get all verification sessions for an idea involving a specific user.
 * Useful for determining the "best" status across all partners.
 */
export function getVerificationSessionsForIdea(ideaId: string, userId: string): VerificationSession[] {
  return mockVerificationSessions.filter(s =>
    s.ideaId === ideaId &&
    s.participants.includes(userId)
  );
}

/**
 * Get ALL verification sessions for an idea (regardless of user).
 * Use this when displaying all verification activity on an idea.
 */
export function getAllVerificationSessionsForIdea(ideaId: string): VerificationSession[] {
  return mockVerificationSessions.filter(s => s.ideaId === ideaId);
}

// -----------------------------------------------------------------------------
// Profile Aggregate Metrics (P56)
// -----------------------------------------------------------------------------

export interface UserMetrics {
  positionsTaken: number;       // Total ideas user has staked a position on
  claritySessions: number;      // Total clarity sessions completed (ratings given)
  crossVerifications: number;   // Verifications across disagreement
}

/**
 * Calculate aggregate metrics for a user's profile.
 * Shows their overall engagement: positions, clarity sessions, cross-verifications.
 */
export function getUserMetrics(userId: string): UserMetrics {
  let positionsTaken = 0;
  let claritySessions = 0;
  let crossVerifications = 0;

  // Count positions taken across all ideas
  for (const idea of mockIdeas) {
    const entry = idea.positions[userId];
    if (entry?.position) {
      positionsTaken++;
    }
  }

  // Count clarity sessions (verifications where this user gave a rating)
  for (const session of mockVerificationSessions) {
    if (!session.participants.includes(userId)) continue;

    const ratings = session.ratings || {};
    if (ratings[userId] !== undefined) {
      claritySessions++;

      // Check if this was across disagreement
      const [p1, p2] = session.participants;
      const idea = mockIdeas.find(i => i.id === session.ideaId);
      if (idea) {
        const p1Position = idea.positions[p1]?.position;
        const p2Position = idea.positions[p2]?.position;
        if (p1Position && p2Position && p1Position !== p2Position) {
          crossVerifications++;
        }
      }
    }
  }

  return { positionsTaken, claritySessions, crossVerifications };
}

// -----------------------------------------------------------------------------
// Calibration Data (P56.1)
// -----------------------------------------------------------------------------

/**
 * Mock calibration data for each user.
 * In production, this would be calculated from actual session data.
 */
const mockCalibrationData: Record<string, UserCalibration> = {
  'current': {
    listener: { avgGap: -1.2, state: 'overconfident', sessionCount: 8 },
    speaker: { avgGap: 0.3, state: 'calibrated', sessionCount: 8 },
  },
  '1': { // Alice - well calibrated
    listener: { avgGap: 0.2, state: 'calibrated', sessionCount: 15 },
    speaker: { avgGap: -0.1, state: 'calibrated', sessionCount: 15 },
  },
  '2': { // Bob - overconfident as listener
    listener: { avgGap: -2.1, state: 'overconfident', sessionCount: 10 },
    speaker: { avgGap: -1.5, state: 'overconfident', sessionCount: 10 },
  },
  '3': { // Carol - underconfident
    listener: { avgGap: 1.8, state: 'underconfident', sessionCount: 20 },
    speaker: { avgGap: 1.2, state: 'underconfident', sessionCount: 20 },
  },
  '4': { // David - mixed
    listener: { avgGap: -0.8, state: 'overconfident', sessionCount: 5 },
    speaker: { avgGap: 0.5, state: 'calibrated', sessionCount: 5 },
  },
  '5': { // Emma - new user, few sessions
    listener: { avgGap: 0, state: 'calibrated', sessionCount: 2 },
    speaker: { avgGap: 0, state: 'calibrated', sessionCount: 2 },
  },
};

/**
 * Get calibration data for a user.
 * Returns null if user has no calibration data yet (< 3 sessions).
 */
export function getUserCalibration(userId: string): UserCalibration | null {
  const data = mockCalibrationData[userId];
  if (!data) return null;
  // Require minimum sessions for meaningful calibration
  if (data.listener.sessionCount < 3 && data.speaker.sessionCount < 3) return null;
  return data;
}

/**
 * Calculate calibration state from average gap.
 * Threshold: ±0.5 is considered calibrated.
 */
export function getCalibrationState(avgGap: number): CalibrationState {
  if (avgGap < -0.5) return 'overconfident';
  if (avgGap > 0.5) return 'underconfident';
  return 'calibrated';
}

/**
 * User credibility stats shown next to name everywhere.
 * - ear: How many people's stories this user understood (as listener)
 * - mic: How many people understood this user's stories (as speaker)
 */
export interface UserCredibilityStats {
  ear: number;  // People this user understood
  mic: number;  // People who understood this user
}

/**
 * Get Ear/Mic credibility stats for a user.
 * Used to show credibility signal next to name in all contexts.
 */
export function getUserCredibilityStats(userId: string): UserCredibilityStats {
  // Ear: Count verification sessions where this user was the listener
  // For mock, we use calibration session count as proxy
  const calibration = mockCalibrationData[userId];
  const ear = calibration?.listener.sessionCount || 0;

  // Mic: Sum of understoodCount across all stories authored by this user
  // This requires mockStories which is defined below, so we access it lazily
  const mic = getMicCount(userId);

  return { ear, mic };
}

// Helper to compute mic count (defined as function to access mockStories after it's declared)
function getMicCount(userId: string): number {
  // Will be populated after mockStories is defined
  // For now, return from a lookup or compute from stories
  return _micCountCache[userId] ?? 0;
}

// Cache for mic counts, populated after mockStories is loaded
const _micCountCache: Record<string, number> = {};

// Call this after mockStories is defined to populate cache
export function _initMicCountCache(stories: { authorId: string; understoodCount: number }[]) {
  for (const story of stories) {
    _micCountCache[story.authorId] = (_micCountCache[story.authorId] || 0) + story.understoodCount;
  }
}

// -----------------------------------------------------------------------------
// P60: Stories and Points Mock Data
// -----------------------------------------------------------------------------

import type { Story, Point } from './types';

/**
 * Mock Points - claims about reality that can be agreed/disagreed with.
 * Points are ownerless (global) - no single author.
 */
export const mockPoints: Point[] = [
  {
    id: 'pt1',
    text: 'Remote work is more productive than office work for knowledge workers',
    createdAt: '2026-01-01T10:00:00Z',
    // 7-point scale demo: all position types represented (including new granular ones)
    positions: {
      '1': { position: 'strongly_agree', timestamp: '2026-01-03T10:00:00Z' },      // +3
      '2': { position: 'strongly_disagree', timestamp: '2026-01-03T14:30:00Z' },   // -3
      '3': { position: 'somewhat_agree', timestamp: '2026-01-04T09:15:00Z' },      // +1 (new)
      '4': { position: 'unsure', timestamp: '2026-01-05T11:00:00Z' },              // 0
      '5': { position: 'somewhat_disagree', timestamp: '2026-01-05T12:00:00Z' },   // -1 (new)
      '6': { position: 'strongly_agree', timestamp: '2026-01-06T09:00:00Z' },      // +3
      '7': { position: 'agree', timestamp: '2026-01-06T14:00:00Z' },               // +2
      '8': { position: 'unsure', timestamp: '2026-01-06T16:00:00Z' },              // 0
      'current': { position: 'agree', timestamp: '2026-01-07T08:30:00Z' },         // +2
    },
    linkedStoryIds: ['st1', 'st2', 'st3', 'st8', 'st9'], // Added st9
  },
  {
    id: 'pt2',
    text: 'Fewer meetings leads to better outcomes',
    createdAt: '2026-01-02T14:00:00Z',
    positions: {
      '1': { position: 'strongly_agree', timestamp: '2026-01-02T15:00:00Z' },
      '2': { position: 'agree', timestamp: '2026-01-02T16:00:00Z' },
      '3': { position: 'disagree', timestamp: '2026-01-03T10:30:00Z' },
      '4': { position: 'strongly_agree', timestamp: '2026-01-04T09:00:00Z' },
      'current': { position: 'unsure', timestamp: '2026-01-06T11:15:00Z' },
    },
    linkedStoryIds: ['st1', 'st2', 'st4', 'st8', 'st9'], // Added st2, st8
  },
  {
    id: 'pt3',
    text: 'AI will replace most knowledge work within 10 years',
    createdAt: '2026-01-03T09:00:00Z',
    positions: {
      '1': { position: 'strongly_disagree', timestamp: '2026-01-03T12:00:00Z' },
      '2': { position: 'strongly_agree', timestamp: '2026-01-03T14:00:00Z' },
      '3': { position: 'unsure', timestamp: '2026-01-04T09:00:00Z' },
      '5': { position: 'agree', timestamp: '2026-01-05T10:00:00Z' },
      'current': { position: 'disagree', timestamp: '2026-01-06T08:00:00Z' },
    },
    linkedStoryIds: ['st5', 'st6'],
  },
  {
    id: 'pt4',
    text: 'Code reviews are more valuable than automated testing',
    createdAt: '2026-01-04T11:00:00Z',
    positions: {
      '1': { position: 'agree', timestamp: '2026-01-05T14:30:00Z' }, // Alice (from st5)
      '2': { position: 'strongly_disagree', timestamp: '2026-01-04T14:00:00Z' },
      '3': { position: 'agree', timestamp: '2026-01-04T15:00:00Z' },
      '4': { position: 'strongly_agree', timestamp: '2026-01-05T09:00:00Z' },
      'current': { position: 'agree', timestamp: '2026-01-06T10:00:00Z' },
    },
    linkedStoryIds: ['st5', 'st7'], // Added st5 (Alice's AI story)
  },
];

/**
 * Mock Stories - personal experiences that can only be understood (not debated).
 * Stories have an author and are shown with blue styling.
 */
export const mockStories: Story[] = [
  {
    id: 'st1',
    text: 'After switching to fully remote, I found myself shipping 40% more features. The lack of interruptions and commute time gave me deep focus blocks I never had in the office.',
    authorId: '1', // Alice
    createdAt: '2026-01-03T10:00:00Z',
    visibility: 'public',
    linkedPointIds: ['pt1', 'pt2'],
    understoodCount: 3,
    crossDisagreementCount: 1,
  },
  {
    id: 'st2',
    text: 'I tried remote work for 6 months and felt completely disconnected from my team. Important decisions happened in hallway conversations I wasn\'t part of.',
    authorId: '2', // Bob
    createdAt: '2026-01-03T14:30:00Z',
    visibility: 'public',
    linkedPointIds: ['pt1', 'pt2'], // Also relates to meetings culture
    understoodCount: 2,
    crossDisagreementCount: 2,
  },
  {
    id: 'st3',
    text: 'Our research team went remote and collaboration actually improved. We started documenting everything which made knowledge sharing easier across time zones.',
    authorId: '3', // Carol
    createdAt: '2026-01-04T09:15:00Z',
    visibility: 'public',
    linkedPointIds: ['pt1'],
    understoodCount: 1,
    crossDisagreementCount: 0,
  },
  {
    id: 'st4',
    text: 'When we cut our weekly meetings from 8 to 2, team morale skyrocketed. People finally had time to do deep work instead of context-switching all day.',
    authorId: '4', // David
    createdAt: '2026-01-05T11:00:00Z',
    visibility: 'shared',
    eventId: 'evt-1', // Shared within "Future of Work Summit"
    linkedPointIds: ['pt2'],
    understoodCount: 4,
    crossDisagreementCount: 1,
  },
  {
    id: 'st5',
    text: 'I\'ve been using AI coding assistants for a year now. They\'ve changed how I work but I still make all the architectural decisions. The AI is a tool, not a replacement.',
    authorId: '1', // Alice
    createdAt: '2026-01-05T14:00:00Z',
    visibility: 'public',
    linkedPointIds: ['pt3', 'pt4'], // AI affects both knowledge work and code review practices
    understoodCount: 2,
    crossDisagreementCount: 1,
  },
  {
    id: 'st6',
    text: 'My junior developer role was eliminated when the company adopted AI tools. Management said they only need senior devs to "supervise the AI" now.',
    authorId: '5', // Emma
    createdAt: '2026-01-06T10:00:00Z',
    visibility: 'public',
    linkedPointIds: ['pt3'],
    understoodCount: 5,
    crossDisagreementCount: 3,
  },
  {
    id: 'st7',
    text: 'In my experience, code reviews catch bugs that tests miss. A colleague\'s review once found a security vulnerability that no test would have caught.',
    authorId: '3', // Carol
    createdAt: '2026-01-06T15:00:00Z',
    visibility: 'public',
    linkedPointIds: ['pt4'],
    understoodCount: 1,
    crossDisagreementCount: 0,
  },
  {
    id: 'st8',
    text: 'I started working remotely 2 years ago and my work-life balance has completely transformed. I can pick up my kids from school now without stressing about commute time.',
    authorId: 'current', // You
    createdAt: '2026-01-07T09:00:00Z',
    visibility: 'public',
    linkedPointIds: ['pt1', 'pt2'], // Remote work relates to meeting culture too
    understoodCount: 2,
    crossDisagreementCount: 1,
  },
  {
    id: 'st9',
    text: 'Our team tried a "no meetings Wednesday" experiment. Productivity went through the roof - I finished a project that had been stalled for weeks.',
    authorId: 'current', // You
    createdAt: '2026-01-08T14:00:00Z',
    visibility: 'shared',
    eventId: 'evt-2', // Shared within "Team Productivity Workshop"
    linkedPointIds: ['pt1', 'pt2'], // Relates to both remote work and meeting culture
    understoodCount: 3,
    crossDisagreementCount: 0,
  },
  {
    id: 'st10',
    text: 'I\'m drafting thoughts about how async communication changed our team dynamics. Not ready to share yet - still processing the experience.',
    authorId: 'current', // You
    createdAt: '2026-01-09T10:00:00Z',
    visibility: 'private', // Draft - only author sees
    linkedPointIds: [],
    understoodCount: 0,
    crossDisagreementCount: 0,
  },
];

// Initialize mic count cache from stories
_initMicCountCache(mockStories);

// -----------------------------------------------------------------------------
// P60: Story and Point Helper Functions
// -----------------------------------------------------------------------------

export function getPointById(id: string): Point | undefined {
  return mockPoints.find(p => p.id === id);
}

export function getStoryById(id: string): Story | undefined {
  return mockStories.find(s => s.id === id);
}

export function getStoriesForPoint(pointId: string): Story[] {
  const point = getPointById(pointId);
  if (!point) return [];
  return point.linkedStoryIds
    .map(id => getStoryById(id))
    .filter((s): s is Story => s !== undefined);
}

export function getPointsForStory(storyId: string): Point[] {
  const story = getStoryById(storyId);
  if (!story) return [];
  return story.linkedPointIds
    .map(id => getPointById(id))
    .filter((p): p is Point => p !== undefined);
}

/**
 * 7-point position counts for Points
 * Used for the 3-button dropdown UI where counts are aggregated by group
 */
export interface SevenPointCounts {
  strongly_agree: number;     // +3
  agree: number;              // +2
  somewhat_agree: number;     // +1
  unsure: number;             // 0
  somewhat_disagree: number;  // -1
  disagree: number;           // -2
  strongly_disagree: number;  // -3
}

/**
 * Get position counts for a Point (7-point Likert scale)
 */
export function getPointPositionCounts(point: Point): SevenPointCounts {
  const counts: SevenPointCounts = {
    strongly_agree: 0,
    agree: 0,
    somewhat_agree: 0,
    unsure: 0,
    somewhat_disagree: 0,
    disagree: 0,
    strongly_disagree: 0,
  };
  for (const entry of Object.values(point.positions)) {
    if (entry?.position && entry.position in counts) {
      counts[entry.position as keyof SevenPointCounts]++;
    }
  }
  return counts;
}

/**
 * Aggregate counts by button group for 3-button UI
 */
export function getAggregatedCounts(counts: SevenPointCounts): { disagree: number; unsure: number; agree: number } {
  return {
    disagree: counts.strongly_disagree + counts.disagree + counts.somewhat_disagree,
    unsure: counts.unsure,
    agree: counts.somewhat_agree + counts.agree + counts.strongly_agree,
  };
}

/**
 * Get all stories, optionally filtered by author
 */
export function getStories(authorId?: string): Story[] {
  if (authorId) {
    return mockStories.filter(s => s.authorId === authorId);
  }
  return mockStories;
}

/**
 * Get all points
 */
export function getPoints(): Point[] {
  return mockPoints;
}

/**
 * Get participant users for a Point (users who have taken a position)
 * Returns up to `limit` users, excluding 'current' pseudo-user
 */
export function getPointParticipants(point: Point, limit = 3): { id: string; avatar: string; name: string }[] {
  const participants: { id: string; avatar: string; name: string }[] = [];

  for (const [userId, entry] of Object.entries(point.positions)) {
    if (userId === 'current' || !entry?.position) continue;

    const user = getUserById(userId);
    if (user) {
      participants.push({ id: user.id, avatar: user.avatar, name: user.name });
    }

    if (participants.length >= limit) break;
  }

  return participants;
}
