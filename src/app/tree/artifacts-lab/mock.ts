/**
 * P1545 Phase 1 round 2: mock data shared by the Artifacts variants (/tree/artifacts).
 * Dev-only. No service calls. Copy here is placeholder; final copy is a founder decision.
 * Letter fields mirror what the real tabs show (drafts-tab.tsx, sent-tab.tsx, inbox-tab.tsx).
 */

export type ArtifactKind = 'letter' | 'canvas';
export type Visibility = 'private' | 'public';
/** sent-tab.tsx getStatusLabel(): the four words the app uses today. */
export type RecipientStatus = 'Invited' | 'Opened' | 'In progress' | 'Completed';

export interface MockRecipient {
  name: string;
  status: RecipientStatus;
  steps?: { done: number; total: number };
  /** Today a "Results" button shows once the recipient has started. */
  hasResults: boolean;
}

export interface MockArtifact {
  id: string;
  kind: ArtifactKind;
  title: string;
  visibility: Visibility;
  updated: string;
  /** Letters only: not sent yet (predictions not sealed). */
  draft?: boolean;
  /** Draft letters: "N stories · N points". */
  counts?: { stories: number; points: number };
  /** Published letters: "Sealed X ago". */
  sealed?: string;
  /** Published one-to-many letters: "Public link letter". */
  publicLink?: boolean;
  /** Published letters: invited recipients (anyone present also blocks Delete letter). */
  recipients?: MockRecipient[];
  /** Public letters: people who answered through the link. */
  responses?: number;
  /** Published letters: unread explain-backs ("N new from <name>"). */
  newFrom?: { name: string; count: number };
  /** Shared with you: who shared it. */
  sharedBy?: string;
  /** Shared with you: unread until opened. */
  unread?: boolean;
  /** Received letters: reading progress. */
  steps?: { done: number; total: number };
  /** Received letters: finished, so the button says Results instead of Open. */
  finished?: boolean;
}

export const YOURS: MockArtifact[] = [
  { id: 'l1', kind: 'letter', title: 'Why we should move the retreat to March', visibility: 'private', draft: true, counts: { stories: 3, points: 5 }, updated: '2h' },
  {
    id: 'l2',
    kind: 'letter',
    title: 'What I mean by "calibrated"',
    visibility: 'private',
    sealed: '2 days',
    updated: '1h',
    unread: true,
    newFrom: { name: 'Tom', count: 1 },
    recipients: [
      { name: 'Tom Becker', status: 'Completed', hasResults: true },
      { name: 'Anna Lund', status: 'In progress', steps: { done: 2, total: 5 }, hasResults: true },
      { name: 'Mara Quist', status: 'Invited', hasResults: false },
    ],
  },
  { id: 'l3', kind: 'letter', title: 'Ten questions before we start', visibility: 'public', publicLink: true, sealed: '5 days', updated: '1d', responses: 2, recipients: [] },
  { id: 'c1', kind: 'canvas', title: 'Co-founder roles: first sketch', visibility: 'private', updated: '3d' },
  { id: 'c2', kind: 'canvas', title: 'Clarity Night: questions board', visibility: 'public', updated: '1w' },
];

export const SHARED: MockArtifact[] = [
  { id: 's1', kind: 'canvas', title: 'Hike plan: Doi Suthep loop', visibility: 'private', sharedBy: 'Mara', unread: true, updated: '1h' },
  { id: 's2', kind: 'letter', title: 'On disagreeing kindly', visibility: 'private', sharedBy: 'Tom', steps: { done: 2, total: 5 }, updated: '4d' },
  { id: 's3', kind: 'letter', title: 'A map of what we disagree about', visibility: 'private', sharedBy: 'Anna', steps: { done: 5, total: 5 }, finished: true, updated: '1w' },
];

/** Decision 5: how a share shows up in a chat. */
export const SHARE_MESSAGES = [
  { chat: 'Mara (direct)', text: 'Mara shared a canvas', title: 'Hike plan: Doi Suthep loop' },
  { chat: 'Clarity Night · Thu', text: 'Slava shared a canvas', title: 'Clarity Night: questions board' },
];

export const MOCK_EVENTS = [{ id: 'e1', title: 'Clarity Hike: Doi Suthep', when: 'Sat 26 Oct · 7:00' }];

/** [FOUNDER DECISION: all copy in this banner is a placeholder; round 2 text taken from the founder's brief.] */
export const CM_BANNER = {
  title: 'Chiang Mai events',
  body: 'One calendar, collected from 75 sources',
  cta: 'Open the calendar',
  href: '/cm',
};

/** Decision 2: phone tabs, in order. */
export const TABS = ['Home', 'Chats', 'Events', 'Artifacts', 'You'] as const;
export const CHATS_UNREAD = 3;
