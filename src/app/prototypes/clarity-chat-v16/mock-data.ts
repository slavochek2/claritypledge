/**
 * @file mock-data.ts
 * @description P1509 v16: what is STILL MOCK. Chats, channels, threads, unread, archive and the mirror have no tables, so
 * the PEOPLE of the chat world, the group/event rosters that decide which channels exist (GROUPS, EVENTS: "chat mock only"),
 * and the copy live here. Everything else (points, stories, letters, groups, events, partners, profiles, is_admin) is read
 * from the test project through real-data.ts. v15 header follows.
 * P1509 v15 mock world. v15 #2: the two REAL groups replace v14's invented ones. Their slugs, names,
 * blurbs and the opening paragraph of each About are copied from the migrations that seed them
 * (`20260907120000_cm_activist_group_copy.sql` for cm, `20260828164500_p1060_events_org_id.sql` +
 * `20260907180000_online_group_fuller_about.sql` for online). The people, events, letters and points are mock.
 * Bob is a member of the Chiang Mai group and an admin; he attended one Online event but has not joined Online, so
 * Online is "a group you haven't joined" (its Join page). Dana is a member of nothing and attends tonight. Sam shares
 * nothing with anyone. Mock only: nothing here is read from or written to a server.
 */
import type { PointSummary, PointWithUserPosition, StoryWithAuthor } from '@/app/types';

export type PersonId = 'bob' | 'dana' | 'alice' | 'carol' | 'eli' | 'fay' | 'sam';
export type ViewerId = 'bob' | 'dana';

export interface Person {
  id: PersonId;
  name: string;
  /** Production has a URL slug, not a display handle: search matches it, nothing shows it as @name. */
  slug: string;
  email: string;
  bio: string;
  /** The production avatar's colour and pledge ring. */
  avatarColor: string;
  pledger: boolean;
  role: string;
}

export const PEOPLE: Record<PersonId, Person> = {
  bob: { id: 'bob', name: 'Bob Keller', slug: 'bobk', email: 'bob@example.com', bio: 'Runs the Chiang Mai circle.', avatarColor: '#2563eb', pledger: true, role: 'Organizer' },
  dana: { id: 'dana', name: 'Dana Ortiz', slug: 'dana', email: 'dana@example.com', bio: 'Came to her first Clarity Night.', avatarColor: '#0891b2', pledger: false, role: 'Engineer' },
  alice: { id: 'alice', name: 'Alice Moreau', slug: 'alicem', email: 'alice@example.com', bio: 'Facilitator.', avatarColor: '#1d4ed8', pledger: true, role: 'Facilitator' },
  carol: { id: 'carol', name: 'Carol Singh', slug: 'carols', email: 'carol@example.com', bio: 'Product designer.', avatarColor: '#0d9488', pledger: true, role: 'Product designer' },
  eli: { id: 'eli', name: 'Eli Brandt', slug: 'eli', email: 'eli@example.com', bio: 'Founder, Berlin.', avatarColor: '#475569', pledger: false, role: 'Founder' },
  /* Attends tonight and has no 1:1 with anyone yet: "Message" on her profile starts a new chat. */
  fay: { id: 'fay', name: 'Fay Okafor', slug: 'fayo', email: 'fay@example.com', bio: 'Coming to her second Clarity Night.', avatarColor: '#0e7490', pledger: false, role: 'Teacher' },
  sam: { id: 'sam', name: 'Sam Rivera', slug: 'samr', email: 'sam@example.com', bio: 'Writes about negotiation.', avatarColor: '#64748b', pledger: false, role: 'Writer' },
};

/** The mock pair the pure-state tests start from. The prototype does not use it: partners come from the agreements service (state.realPartners). */
export const PARTNERS: [PersonId, PersonId][] = [['bob', 'alice']];

/** CHAT MOCK ONLY (v16): the roster that decides which channels exist and who is in them. The Groups and Events screens read the real rows. A group is matched to its real org by slug (the id), an event to its real row by slug (`seedEventSlug(id)`, seed-world.ts). A group: production's `Organization` fields (organizations-service.interface.ts) plus the mock roster. */
export interface Group { id: string; slug: string; name: string; blurb: string | null; description: string; hasEvents: boolean; members: PersonId[]; organizers: PersonId[] }
export interface EventInfo {
  id: string; groupId: string; name: string; when: string; attendees: PersonId[]; host: PersonId; location: string;
  description: string; today?: boolean; live?: boolean; past?: boolean;
}

export const GROUPS: Group[] = [
  {
    id: 'cm', slug: 'cm', name: 'Communication Activism Community · Chiang Mai', hasEvents: true,
    blurb: 'We reveal gaps in cognitive understanding instead of pretending, and carry the habit out of the room.',
    /* The first paragraph of the seeded About (migration 20260907120000); the rest lives in the database. */
    description: 'Ask a colleague what they understood from your words and it reads as disrespect. Admit you did not fully understand them and they might think you are stupid. So people pretend they understood, and the gap in cognitive understanding stays hidden. Many groups run on that damaging social norm: revealing a cognitive understanding gap is punished. Five common barriers keep it in place: ego, fear, laziness, plausible deniability and ignorance. The first four are hard to shift. Ignorance is not. It can be filled.',
    members: ['bob', 'alice', 'carol'], organizers: ['bob'],
  },
  {
    id: 'online', slug: 'online', name: 'Clarity Practice Community · Online', hasEvents: true,
    blurb: 'Practise revealing and bridging gaps in cognitive understanding with people across different interests, opinions, values and industries.',
    /* The first paragraph of the seeded About (migration 20260907180000). */
    description: 'This community is for people who get curious rather than defensive when they spot a gap in their own cognitive understanding. If "how well do you think you understood me?" strikes you as an interesting question, this is for you.',
    members: ['eli', 'carol'], organizers: ['eli'],
  },
];

export const EVENTS: EventInfo[] = [
  { id: 'night-oct16', groupId: 'cm', name: 'Clarity Night, Oct 16', when: 'Today, 19:00', host: 'alice', location: 'Chiang Mai', attendees: ['bob', 'alice', 'dana', 'fay'], today: true, live: true,
    description: 'We pair up and try to state the other person’s view so well they say “yes, exactly”.' },
  { id: 'night-oct02', groupId: 'cm', name: 'Clarity Night, Oct 2', when: 'Oct 2', host: 'bob', location: 'Chiang Mai', attendees: ['bob', 'alice', 'carol'], past: true,
    description: 'Rounds of explain-back on a disagreement each of us brought.' },
  { id: 'online-sept', groupId: 'online', name: 'Online practice, Sept 28', when: 'Sept 28', host: 'eli', location: 'Online', attendees: ['bob', 'eli'], past: true,
    description: 'Ninety minutes of paired practice on video.' },
  { id: 'online-oct23', groupId: 'online', name: 'Online practice, Oct 23', when: 'Oct 23, 18:00', host: 'eli', location: 'Online', attendees: ['eli', 'carol'],
    description: 'Paired practice with people outside your own field.' },
];

/** What a real point or story needs to render in its production card (real-data.ts fills it from the services). */
export interface RealShare {
  point?: PointWithUserPosition;
  story?: StoryWithAuthor;
  /** A story's linked points (production's story card shows them with positions). */
  linkedPoints?: PointSummary[];
}
/** A real point or story offered by the Share dialog and carried by a chat message. */
export interface Shareable { id: string; kind: 'point' | 'story'; title: string; tags: string[]; real: RealShare }

export const COPY = {
  chats: 'Chats',
  all: 'All chats',
  partners: 'Partners',
  groups: 'Groups',
  /* v16: the group's members-only channel. A lock and "Members only" mark it. */
  general: 'General',
  membersOnly: 'Members only',
  agreement: 'Agreement',
  channels: 'Channels',
  noPartners: 'No partners yet. A partner is someone you agree to practise clarity with.',
  transcribing: 'Transcribing · live',
  transcribed: 'transcribed',
  unread: 'Unread',
  archived: 'Archived chats',
  /* v16: one verb for the partner flow everywhere: Invite partner -> Invite sent -> Partner. */
  invite: 'Invite partner',
  inviteSent: 'Invite sent',
  sendInvite: 'Send invite',
  inviteRefused: 'Prototype invites go only to test personas.',
  clarify: 'Clarify',
  partner: 'Partner',
  /* v16: Transcribe sits in every chat header; it says "Coming soon" until a per-chat room exists (spec Risks, DEFER). */
  transcribe: 'Transcribe',
  comingSoon: 'Coming soon',
  inviteToLive: 'Invite to Clarity Live',
  markUnread: 'Mark as unread',
  replies: (n: number) => `${n} ${n === 1 ? 'reply' : 'replies'}`,
  replyInThread: 'Reply in thread',
  message: 'Message',
  search: 'Search chats and people',
  newChatOpener: (first: string, shared: string) => `No messages yet. Say hello to ${first}. You both ${shared}.`,
  emptyList: 'No chats yet',
  emptySearch: 'No one you share a group or event with matches.',
  notSent: 'Not sent',
  retry: 'Retry',
  forwardedFrom: 'Forwarded from',
  selectChat: 'Select a chat to start messaging',
  /* v15 #10: the mirror agent */
  yourMirror: 'Your mirror',
  mirrorAsk: 'Give me a name',
  mirrorExplainer: 'Your mirror helps you check what you meant before you send it. Forward any message here with Clarify.',
  mirrorPlaceholder: 'Type a name for your mirror',
  mirrorReply: 'I’ll help you clarify this — coming soon',
  share: 'Share',
  shareTitle: 'Share a point or story',
} as const;

/** Letters (production /letters has Inbox, Drafts and Published tabs, letters-page.tsx). The rows are real (real-data.ts). */
export type LetterBox = 'inbox' | 'drafts' | 'sent';

/** The desktop sidebar's places (v16): Chats first. Tools sits beside the profile picture, not in this list. */
export const PLACES = ['chats', 'home', 'groups', 'letters', 'events'] as const;
export type Place = (typeof PLACES)[number];
/** The phone's bottom tabs (v16): the mobile app opens on Chats; Profile opens a sheet. */
export const MOBILE_TABS = ['chats', 'home', 'groups', 'letters', 'me'] as const;
export type MobileTab = (typeof MOBILE_TABS)[number];
export const PLACE_LABEL: Record<Place | MobileTab | 'tools', string> = { home: 'Home', chats: 'Chats', letters: 'Letters', tools: 'Tools', groups: 'Groups', events: 'Events', me: 'Profile' };
export const SIDEBAR_KEY = 'p1509-v16-sidebar-collapsed';
