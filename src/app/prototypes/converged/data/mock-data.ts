// Mock data for Converged Prototype (P32.3)
// Extended from Premium prototype with stories and chat data

export type Position = 'agree' | 'disagree' | 'unsure' | null;

export interface User {
  id: string;
  name: string;
  avatar: string;
  role?: string;
  bio?: string;
  verifiedListenerScore: number;
  ideasEngaged: number;
  hasUnviewedActivity: boolean;
}

export interface Engagement {
  id: string;
  ideaId: string;
  userId: string;
  position: Position;
  timestamp: string;
  isVerified: boolean;
  verifiedWith?: string; // userId of verification partner
  isCrossDisagreement?: boolean;
}

export interface Idea {
  id: string;
  text: string;
  createdAt: string;
  engagements: Engagement[];
  comments: Comment[];
}

export interface Comment {
  id: string;
  userId: string;
  text: string;
  timestamp: string;
}

export interface Message {
  id: string;
  senderId: string;
  text: string;
  timestamp: string;
  isRead: boolean;
}

export interface Chat {
  id: string;
  participantIds: string[];
  messages: Message[];
  pinnedIdeaId?: string;
  lastActivity: string;
}

export interface PositionChange {
  ideaId: string;
  fromPosition: Position;
  toPosition: Position;
  timestamp: string;
}

// Current user
export const currentUser: User = {
  id: 'current',
  name: 'You',
  avatar: '👤',
  role: 'Product Designer',
  bio: 'Committed to understanding before judging',
  verifiedListenerScore: 8.5,
  ideasEngaged: 24,
  hasUnviewedActivity: false,
};

// Users
export const users: User[] = [
  currentUser,
  {
    id: 'alice',
    name: 'Alice Chen',
    avatar: '👩',
    role: 'Senior PM at TechCorp',
    verifiedListenerScore: 9.2,
    ideasEngaged: 47,
    hasUnviewedActivity: true,
  },
  {
    id: 'bob',
    name: 'Bob Smith',
    avatar: '🧑',
    role: 'Staff Engineer at StartupXYZ',
    verifiedListenerScore: 8.8,
    ideasEngaged: 32,
    hasUnviewedActivity: true,
  },
  {
    id: 'carol',
    name: 'Carol Davis',
    avatar: '👩‍💼',
    role: 'Research Lead at DesignCo',
    verifiedListenerScore: 9.5,
    ideasEngaged: 56,
    hasUnviewedActivity: false,
  },
  {
    id: 'dan',
    name: 'Dan Wilson',
    avatar: '👨',
    role: 'VP Engineering',
    verifiedListenerScore: 7.9,
    ideasEngaged: 19,
    hasUnviewedActivity: true,
  },
  {
    id: 'eve',
    name: 'Eve Martinez',
    avatar: '👧',
    role: 'UX Researcher',
    verifiedListenerScore: 8.1,
    ideasEngaged: 28,
    hasUnviewedActivity: false,
  },
];

// Ideas
export const ideas: Idea[] = [
  {
    id: 'idea-1',
    text: 'Remote work is more productive than office work for knowledge workers',
    createdAt: '2024-01-15T10:00:00Z',
    engagements: [
      { id: 'e1', ideaId: 'idea-1', userId: 'alice', position: 'agree', timestamp: '2024-01-15T10:30:00Z', isVerified: true, verifiedWith: 'bob', isCrossDisagreement: true },
      { id: 'e2', ideaId: 'idea-1', userId: 'bob', position: 'disagree', timestamp: '2024-01-15T11:00:00Z', isVerified: true, verifiedWith: 'alice', isCrossDisagreement: true },
      { id: 'e3', ideaId: 'idea-1', userId: 'carol', position: 'agree', timestamp: '2024-01-15T12:00:00Z', isVerified: true, verifiedWith: 'dan' },
      { id: 'e4', ideaId: 'idea-1', userId: 'dan', position: 'disagree', timestamp: '2024-01-15T13:00:00Z', isVerified: false },
      { id: 'e5', ideaId: 'idea-1', userId: 'eve', position: 'unsure', timestamp: '2024-01-15T14:00:00Z', isVerified: false },
    ],
    comments: [
      { id: 'c1', userId: 'alice', text: 'Depends heavily on the type of work and team culture', timestamp: '2024-01-15T15:00:00Z' },
      { id: 'c2', userId: 'bob', text: 'I think collaboration suffers in remote settings', timestamp: '2024-01-15T15:30:00Z' },
    ],
  },
  {
    id: 'idea-2',
    text: 'AI will replace most knowledge work within 10 years',
    createdAt: '2024-01-14T09:00:00Z',
    engagements: [
      { id: 'e6', ideaId: 'idea-2', userId: 'bob', position: 'agree', timestamp: '2024-01-14T10:00:00Z', isVerified: true, verifiedWith: 'carol' },
      { id: 'e7', ideaId: 'idea-2', userId: 'carol', position: 'disagree', timestamp: '2024-01-14T11:00:00Z', isVerified: true, verifiedWith: 'bob', isCrossDisagreement: true },
      { id: 'e8', ideaId: 'idea-2', userId: 'dan', position: 'unsure', timestamp: '2024-01-14T12:00:00Z', isVerified: false },
      { id: 'e9', ideaId: 'idea-2', userId: 'eve', position: 'disagree', timestamp: '2024-01-14T13:00:00Z', isVerified: false },
    ],
    comments: [
      { id: 'c3', userId: 'carol', text: 'Augment, not replace. Big difference.', timestamp: '2024-01-14T14:00:00Z' },
    ],
  },
  {
    id: 'idea-3',
    text: 'Code reviews are more valuable than automated testing',
    createdAt: '2024-01-13T08:00:00Z',
    engagements: [
      { id: 'e10', ideaId: 'idea-3', userId: 'alice', position: 'disagree', timestamp: '2024-01-13T09:00:00Z', isVerified: false },
      { id: 'e11', ideaId: 'idea-3', userId: 'dan', position: 'agree', timestamp: '2024-01-13T10:00:00Z', isVerified: true, verifiedWith: 'eve' },
      { id: 'e12', ideaId: 'idea-3', userId: 'eve', position: 'unsure', timestamp: '2024-01-13T11:00:00Z', isVerified: true, verifiedWith: 'dan' },
    ],
    comments: [],
  },
  {
    id: 'idea-4',
    text: 'Most meetings could be replaced with async communication',
    createdAt: '2024-01-12T07:00:00Z',
    engagements: [
      { id: 'e13', ideaId: 'idea-4', userId: 'carol', position: 'agree', timestamp: '2024-01-12T08:00:00Z', isVerified: false },
      { id: 'e14', ideaId: 'idea-4', userId: 'bob', position: 'agree', timestamp: '2024-01-12T09:00:00Z', isVerified: false },
      { id: 'e15', ideaId: 'idea-4', userId: 'eve', position: 'disagree', timestamp: '2024-01-12T10:00:00Z', isVerified: false },
    ],
    comments: [
      { id: 'c4', userId: 'eve', text: 'Some things just need real-time discussion', timestamp: '2024-01-12T11:00:00Z' },
    ],
  },
  {
    id: 'idea-5',
    text: 'Technical debt should be paid down continuously, not in dedicated sprints',
    createdAt: '2024-01-11T06:00:00Z',
    engagements: [
      { id: 'e16', ideaId: 'idea-5', userId: 'alice', position: 'agree', timestamp: '2024-01-11T07:00:00Z', isVerified: true, verifiedWith: 'bob' },
      { id: 'e17', ideaId: 'idea-5', userId: 'bob', position: 'agree', timestamp: '2024-01-11T08:00:00Z', isVerified: true, verifiedWith: 'alice' },
      { id: 'e18', ideaId: 'idea-5', userId: 'dan', position: 'disagree', timestamp: '2024-01-11T09:00:00Z', isVerified: false },
    ],
    comments: [],
  },
];

// Chats
export const chats: Chat[] = [
  {
    id: 'chat-1',
    participantIds: ['current', 'carol'],
    pinnedIdeaId: 'idea-1',
    lastActivity: '2024-01-15T16:00:00Z',
    messages: [
      { id: 'm1', senderId: 'current', text: 'Hey, I saw your position on the remote work idea. Want to verify understanding?', timestamp: '2024-01-15T14:00:00Z', isRead: true },
      { id: 'm2', senderId: 'carol', text: "Sure! I think we might be talking past each other on this one.", timestamp: '2024-01-15T14:30:00Z', isRead: true },
      { id: 'm3', senderId: 'current', text: 'Exactly. Let me explain what I mean by "productive" — it\'s not just output, but quality of deep work.', timestamp: '2024-01-15T15:00:00Z', isRead: true },
      { id: 'm4', senderId: 'carol', text: 'Ah interesting. I was thinking more about collaboration efficiency.', timestamp: '2024-01-15T15:30:00Z', isRead: true },
      { id: 'm5', senderId: 'current', text: 'Want to go live and verify properly?', timestamp: '2024-01-15T16:00:00Z', isRead: false },
    ],
  },
  {
    id: 'chat-2',
    participantIds: ['current', 'bob'],
    lastActivity: '2024-01-14T15:00:00Z',
    messages: [
      { id: 'm6', senderId: 'bob', text: 'Great discussion on the AI idea yesterday!', timestamp: '2024-01-14T14:00:00Z', isRead: true },
      { id: 'm7', senderId: 'current', text: 'Thanks! I learned a lot from your perspective.', timestamp: '2024-01-14T15:00:00Z', isRead: true },
    ],
  },
  {
    id: 'chat-3',
    participantIds: ['current', 'alice'],
    pinnedIdeaId: 'idea-2',
    lastActivity: '2024-01-13T12:00:00Z',
    messages: [
      { id: 'm8', senderId: 'alice', text: 'Your take on AI replacing jobs was thought-provoking', timestamp: '2024-01-13T11:00:00Z', isRead: true },
      { id: 'm9', senderId: 'current', text: "I'm still forming my opinion honestly", timestamp: '2024-01-13T12:00:00Z', isRead: true },
    ],
  },
];

// Position changes for profile activity
export const positionChanges: PositionChange[] = [
  { ideaId: 'idea-2', fromPosition: 'agree', toPosition: 'unsure', timestamp: '2024-01-14T18:00:00Z' },
];

// Helper functions
export function getUserById(id: string): User | undefined {
  return users.find(u => u.id === id);
}

export function getIdeaById(id: string): Idea | undefined {
  return ideas.find(i => i.id === id);
}

export function getChatById(id: string): Chat | undefined {
  return chats.find(c => c.id === id);
}

export function getChatWithUser(userId: string): Chat | undefined {
  return chats.find(c => c.participantIds.includes(userId) && c.participantIds.includes('current'));
}

export function getPositionCounts(idea: Idea): { agree: number; disagree: number; unsure: number } {
  return idea.engagements.reduce(
    (acc, e) => {
      if (e.position === 'agree') acc.agree++;
      else if (e.position === 'disagree') acc.disagree++;
      else if (e.position === 'unsure') acc.unsure++;
      return acc;
    },
    { agree: 0, disagree: 0, unsure: 0 }
  );
}

export function getVerificationCount(idea: Idea): number {
  return idea.engagements.filter(e => e.isVerified).length;
}

export function getCrossDisagreementCount(idea: Idea): number {
  return idea.engagements.filter(e => e.isCrossDisagreement).length;
}

export function getUserEngagement(idea: Idea, userId: string): Engagement | undefined {
  return idea.engagements.find(e => e.userId === userId);
}

export function getUsersWithUnviewedActivity(): User[] {
  return users.filter(u => u.hasUnviewedActivity && u.id !== 'current');
}

export function getUserEngagements(userId: string): Array<{ idea: Idea; engagement: Engagement }> {
  const results: Array<{ idea: Idea; engagement: Engagement }> = [];
  for (const idea of ideas) {
    const engagement = idea.engagements.find(e => e.userId === userId);
    if (engagement) {
      results.push({ idea, engagement });
    }
  }
  return results.sort((a, b) => new Date(b.engagement.timestamp).getTime() - new Date(a.engagement.timestamp).getTime());
}

export function formatTimeAgo(timestamp: string): string {
  const now = new Date();
  const then = new Date(timestamp);
  const diffMs = now.getTime() - then.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m`;
  if (diffHours < 24) return `${diffHours}h`;
  if (diffDays < 7) return `${diffDays}d`;
  return then.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
