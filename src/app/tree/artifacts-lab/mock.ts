/**
 * P1545 Phase 1: mock data shared by the three Artifacts variants (/tree/artifacts).
 * Dev-only. No service calls. Copy here is placeholder; final copy is a founder decision.
 */

export type ArtifactKind = 'letter' | 'canvas';
export type Visibility = 'private' | 'public';

export interface MockArtifact {
  id: string;
  kind: ArtifactKind;
  title: string;
  visibility: Visibility;
  /** Letters only: not sent yet (predictions not sealed). */
  draft?: boolean;
  /** Shared with you: who shared it. */
  sharedBy?: string;
  /** Shared with you: unread until opened. */
  unread?: boolean;
  updated: string;
  /** Letters only: replies received / recipients. */
  replies?: { done: number; total: number };
}

export const YOURS: MockArtifact[] = [
  { id: 'l1', kind: 'letter', title: 'Why we should move the retreat to March', visibility: 'private', draft: true, updated: '2h ago' },
  { id: 'l2', kind: 'letter', title: 'What I mean by "calibrated"', visibility: 'private', updated: 'Yesterday', replies: { done: 2, total: 3 } },
  { id: 'c1', kind: 'canvas', title: 'Co-founder roles: first sketch', visibility: 'private', updated: '3 days ago' },
  { id: 'c2', kind: 'canvas', title: 'Clarity Night: questions board', visibility: 'public', updated: 'Last week' },
];

export const SHARED: MockArtifact[] = [
  { id: 's1', kind: 'canvas', title: 'Hike plan: Doi Suthep loop', visibility: 'private', sharedBy: 'Mara', unread: true, updated: '1h ago' },
  { id: 's2', kind: 'letter', title: 'On disagreeing kindly', visibility: 'private', sharedBy: 'Tom', updated: '4 days ago' },
];

/** Redesigned letter actions (decision 4): grouped, not the old six flat buttons. */
export const LETTER_ACTIONS = {
  draft: { primary: 'Continue', more: ['Preview', 'Delete'] },
  sent: { primary: 'See replies', more: ['Recipients', 'Preview', 'Delete'] },
} as const;

/** Decision 5: how a share shows up in a chat. */
export const SHARE_MESSAGES = [
  { chat: 'Mara (direct)', text: 'Mara shared a canvas', title: 'Hike plan: Doi Suthep loop' },
  { chat: 'Clarity Night · Thu', text: 'Slava shared a canvas', title: 'Clarity Night: questions board' },
];

export const MOCK_EVENTS = [
  { id: 'e1', title: 'Clarity Hike: Doi Suthep', when: 'Sat 26 Oct · 7:00' },
];

export const CM_CARD = {
  title: 'Happening in Chiang Mai',
  body: 'Talks, hikes and meetups from the community calendar.',
  href: '/cm',
};

/** Decision 2: phone tabs, in order. */
export const TABS = ['Home', 'Chats', 'Events', 'Artifacts', 'You'] as const;
export const CHATS_UNREAD = 3;
