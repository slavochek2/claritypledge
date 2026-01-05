export type Position = 'agree' | 'disagree' | 'dont_know' | null;

export interface User {
  id: string;
  name: string;
  avatar: string;
  verifiedListenerScore: number;
  bio?: string;
}

export interface Idea {
  id: string;
  text: string;
  createdBy: string;
  createdAt: string;
  positions: Record<string, Position>;
  verificationCount: number;
  crossDisagreementCount: number;
  commentCount: number;
}

export interface Certification {
  id: string;
  ideaId: string;
  speakerId: string;
  listenerId: string;
  speakerPosition: Position;
  listenerPosition: Position;
  createdAt: string;
}

export interface Comment {
  id: string;
  ideaId: string;
  userId: string;
  text: string;
  createdAt: string;
}

export interface Message {
  id: string;
  senderId: string;
  text: string;
  createdAt: string;
  ideaId?: string; // If message references an idea
}

export const currentUser: User = {
  id: 'current',
  name: 'You',
  avatar: '👤',
  verifiedListenerScore: 5,
  bio: 'Building better understanding',
};

export const mockUsers: User[] = [
  { id: '1', name: 'Alice Chen', avatar: '👩‍💼', verifiedListenerScore: 12, bio: 'Product Manager at TechCorp' },
  { id: '2', name: 'Bob Smith', avatar: '👨‍💻', verifiedListenerScore: 8, bio: 'Senior Engineer' },
  { id: '3', name: 'Carol Davis', avatar: '👩‍🔬', verifiedListenerScore: 15, bio: 'Research Lead' },
  { id: '4', name: 'David Park', avatar: '👨‍🎨', verifiedListenerScore: 6, bio: 'UX Designer' },
  { id: '5', name: 'Emma Wilson', avatar: '👩‍💻', verifiedListenerScore: 10, bio: 'Tech Lead' },
];

export const mockIdeas: Idea[] = [
  {
    id: '1',
    text: 'Remote work is more productive than office work for knowledge workers',
    createdBy: '1',
    createdAt: '2026-01-03T10:00:00Z',
    positions: { '1': 'agree', '2': 'disagree', '3': 'agree', '4': 'dont_know', '5': 'disagree' },
    verificationCount: 3,
    crossDisagreementCount: 1,
    commentCount: 5,
  },
  {
    id: '2',
    text: 'AI will replace most knowledge work within 10 years',
    createdBy: '2',
    createdAt: '2026-01-02T14:00:00Z',
    positions: { '1': 'disagree', '2': 'agree', '3': 'dont_know', '4': 'disagree', '5': 'agree' },
    verificationCount: 2,
    crossDisagreementCount: 2,
    commentCount: 12,
  },
  {
    id: '3',
    text: 'Code reviews are more valuable than automated testing',
    createdBy: '3',
    createdAt: '2026-01-01T09:00:00Z',
    positions: { '1': 'dont_know', '2': 'disagree', '3': 'agree', '4': 'agree', '5': 'disagree' },
    verificationCount: 1,
    crossDisagreementCount: 0,
    commentCount: 8,
  },
  {
    id: '4',
    text: 'Startups should prioritize speed over code quality in early stages',
    createdBy: '4',
    createdAt: '2025-12-30T16:00:00Z',
    positions: { '1': 'agree', '2': 'agree', '3': 'disagree', '4': 'agree', '5': 'dont_know' },
    verificationCount: 4,
    crossDisagreementCount: 1,
    commentCount: 15,
  },
  {
    id: '5',
    text: 'Most meetings could be replaced by async communication',
    createdBy: '5',
    createdAt: '2025-12-28T11:00:00Z',
    positions: { '1': 'agree', '2': 'agree', '3': 'agree', '4': 'disagree', '5': 'agree' },
    verificationCount: 5,
    crossDisagreementCount: 1,
    commentCount: 20,
  },
];

export const mockCertifications: Certification[] = [
  { id: '1', ideaId: '1', speakerId: '1', listenerId: '2', speakerPosition: 'agree', listenerPosition: 'disagree', createdAt: '2026-01-04T10:00:00Z' },
  { id: '2', ideaId: '1', speakerId: '2', listenerId: '1', speakerPosition: 'disagree', listenerPosition: 'agree', createdAt: '2026-01-04T10:30:00Z' },
  { id: '3', ideaId: '2', speakerId: '2', listenerId: '5', speakerPosition: 'agree', listenerPosition: 'agree', createdAt: '2026-01-03T15:00:00Z' },
];

export const mockComments: Comment[] = [
  { id: '1', ideaId: '1', userId: '2', text: 'I think this depends heavily on the type of work and team culture.', createdAt: '2026-01-03T11:00:00Z' },
  { id: '2', ideaId: '1', userId: '3', text: 'The data from our team supports this — 20% productivity increase after going remote.', createdAt: '2026-01-03T12:00:00Z' },
  { id: '3', ideaId: '1', userId: '4', text: 'What about collaboration and spontaneous conversations?', createdAt: '2026-01-03T13:00:00Z' },
  { id: '4', ideaId: '2', userId: '1', text: 'I think AI will augment rather than replace. The timeline seems aggressive.', createdAt: '2026-01-02T15:00:00Z' },
  { id: '5', ideaId: '2', userId: '3', text: 'Depends on your definition of "knowledge work" — some tasks are more automatable than others.', createdAt: '2026-01-02T16:00:00Z' },
];

export const mockMessages: Message[] = [
  { id: '1', senderId: '1', text: 'Hey, I saw your position on the remote work idea. Want to verify understanding?', createdAt: '2026-01-04T09:00:00Z' },
  { id: '2', senderId: 'current', text: 'Sure! I think we might be talking past each other on this one.', createdAt: '2026-01-04T09:05:00Z' },
  { id: '3', senderId: '1', text: 'Exactly. Let me explain what I mean by "productive" — it\'s not just output, but quality of deep work.', createdAt: '2026-01-04T09:10:00Z' },
  { id: '4', senderId: 'current', text: 'Ah interesting. I was thinking more about collaboration efficiency.', createdAt: '2026-01-04T09:15:00Z' },
  { id: '5', senderId: '1', text: 'Want to go live and verify properly?', createdAt: '2026-01-04T09:20:00Z', ideaId: '1' },
];

// Helper functions
export function getUserById(id: string): User | undefined {
  if (id === 'current') return currentUser;
  return mockUsers.find(u => u.id === id);
}

export function getIdeaById(id: string): Idea | undefined {
  return mockIdeas.find(i => i.id === id);
}

export function getPositionCounts(idea: Idea): { agree: number; disagree: number; dont_know: number } {
  const counts = { agree: 0, disagree: 0, dont_know: 0 };
  Object.values(idea.positions).forEach(pos => {
    if (pos) counts[pos]++;
  });
  return counts;
}

export function getCommentsForIdea(ideaId: string): Comment[] {
  return mockComments.filter(c => c.ideaId === ideaId);
}

export function getCertificationsForIdea(ideaId: string): Certification[] {
  return mockCertifications.filter(c => c.ideaId === ideaId);
}

export function formatTimeAgo(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}
