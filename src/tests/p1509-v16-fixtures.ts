/**
 * @file p1509-v16-fixtures.ts
 * @description P1509 v16: NAMED fixture records standing in for what the persona seed script puts in the test project.
 * Plain data, no vitest imports, so a test's hoisted `vi.mock` factories can build on them. Each record is the one a
 * real surface must show (the build report pairs each with its test-project query).
 */
import { personaEmail, PERSONA_DOMAIN } from '@/app/prototypes/clarity-chat-v16/personas';

export const BOB = { id: 'u-bob', slug: 'p1509-bob', name: 'Bob Keller', email: personaEmail('bob') };
export const DANA = { id: 'u-dana', slug: 'p1509-dana', name: 'Dana Ortiz', email: personaEmail('dana') };
export const STRANGER = { id: 'u-sam-e2e', slug: 'e2e-someone', name: 'Someone Else', email: 'someone@example.com' };

const CREATED = '2026-10-01T00:00:00.000Z';
const person = (id: string, slug: string, name: string) => ({ profileId: id, slug, name, avatarColor: '#2563eb', hasPledged: false, earCount: 0 });
export const ALICE = person('u-alice', 'p1509-alice', 'Alice Moreau');
export const CAROL = person('u-carol', 'p1509-carol', 'Carol Singh');
export const ELI = person('u-eli', 'p1509-eli', 'Eli Brandt');

/* ---------- points and stories ---------- */

export const POINT_DISAGREEMENT = {
  id: 'pt-bob-1', statement: 'Disagreement is information, not a threat', firstValidatorId: BOB.id, createdAt: CREATED, updatedAt: CREATED, tags: ['conflict', 'work'], systemTags: [], visibility: 'public',
  creatorName: BOB.name, creatorSlug: BOB.slug, creatorAvatarColor: '#2563eb',
  positionCounts: { strongly_agree: 0, agree: 4, somewhat_agree: 0, unsure: 1, somewhat_disagree: 0, disagree: 1, strongly_disagree: 0 }, totalPositions: 6,
};
export const POINT_REPEAT = {
  id: 'pt-dana-1', statement: 'Repeat back before you reply', firstValidatorId: DANA.id, createdAt: CREATED, updatedAt: CREATED, tags: ['listening', 'work'], systemTags: [], visibility: 'public',
  creatorName: DANA.name, creatorSlug: DANA.slug, creatorAvatarColor: '#0891b2',
  positionCounts: { strongly_agree: 2, agree: 3, somewhat_agree: 0, unsure: 0, somewhat_disagree: 0, disagree: 0, strongly_disagree: 0 }, totalPositions: 5,
};
export const POINT_DEFINITIONS = {
  id: 'pt-alice-1', statement: 'Most arguments are about definitions, not facts', firstValidatorId: ALICE.profileId, createdAt: CREATED, updatedAt: CREATED, tags: ['conflict', 'definitions'], systemTags: [], visibility: 'public',
  creatorName: ALICE.name, creatorSlug: ALICE.slug, creatorAvatarColor: '#1d4ed8',
  positionCounts: { strongly_agree: 0, agree: 2, somewhat_agree: 0, unsure: 3, somewhat_disagree: 2, disagree: 0, strongly_disagree: 0 }, totalPositions: 7,
};
const story = (id: string, authorId: string, slug: string, name: string, content: string, tags: string[]) => ({
  id, authorId, content, visibility: 'public', currentVersion: 1, understoodCount: 0, createdAt: CREATED, updatedAt: CREATED, tags, systemTags: [],
  authorName: name, authorSlug: slug, authorAvatarColor: '#2563eb', authorRole: 'Member', authorHasPledged: false, authorEarsCount: 0,
});
export const STORY_HIKE = story('st-bob-1', BOB.id, BOB.slug, BOB.name, 'The hike where we got lost on purpose. We left the map in the car and agreed to say out loud every guess we made about the trail.', ['trust', 'outdoors']);
export const STORY_SISTER = story('st-dana-1', DANA.id, DANA.slug, DANA.name, 'How I misread my sister for ten years. I heard "you never call" as blame. She meant "I miss you".', ['family', 'listening']);
export const POINT_SUMMARY_DISAGREEMENT = { id: POINT_DISAGREEMENT.id, statement: POINT_DISAGREEMENT.statement, tags: POINT_DISAGREEMENT.tags, systemTags: [], visibility: 'public', positionCounts: POINT_DISAGREEMENT.positionCounts, userPosition: null };

/* ---------- groups, events ---------- */

export const ORG_CM = { id: 'org-cm', slug: 'cm', name: 'Communication Activism Community · Chiang Mai', blurb: 'We reveal gaps in cognitive understanding instead of pretending.', description: 'Ask a colleague what they understood from your words and it reads as disrespect.', visibility: 'public', hasEvents: true };
export const ORG_ONLINE = { id: 'org-online', slug: 'online', name: 'Clarity Practice Community · Online', blurb: 'Practise revealing and bridging gaps.', description: 'This community is for people who get curious rather than defensive.', visibility: 'public', hasEvents: true };

export const member = (p: { profileId: string; slug: string; name: string }, role: 'member' | 'organizer' = 'member') => ({ ...p, avatarColor: '#2563eb', avatarUrl: null, acceptedAt: CREATED, role, hasPledged: false, reason: null, linkedinUrl: null });
export const MEMBERS: Record<string, ReturnType<typeof member>[]> = {
  cm: [member({ profileId: BOB.id, slug: BOB.slug, name: BOB.name }, 'organizer'), member(ALICE), member(CAROL)],
  online: [member(ELI, 'organizer'), member(CAROL)],
};

const ev = (id: string, slug: string, title: string, datetime: string, location: string, status: 'upcoming' | 'completed', host: { profileId: string; slug: string; name: string }) => ({
  id, slug, title, description: `${title}, described.`, datetime, durationMinutes: 90, timezone: 'Asia/Bangkok', location, hostId: host.profileId, createdAt: CREATED, status,
  hostName: host.name, hostSlug: host.slug, hostAvatarColor: '#2563eb', hostHasPledged: false,
});
export const EVENT_NIGHT_OCT16 = ev('ev-oct16', 'p1509-night-oct16', 'Clarity Night, Oct 16', '2099-10-16T12:00:00.000Z', 'Chiang Mai', 'upcoming', ALICE);
export const EVENT_NIGHT_OCT2 = ev('ev-oct2', 'p1509-night-oct02', 'Clarity Night, Oct 2', '2026-10-02T12:00:00.000Z', 'Chiang Mai', 'completed', { profileId: BOB.id, slug: BOB.slug, name: BOB.name });
export const EVENT_ONLINE_SEPT = ev('ev-sept', 'p1509-online-sept', 'Online practice, Sept 28', '2026-09-28T11:00:00.000Z', 'Online', 'completed', ELI);
export const EVENT_ONLINE_OCT23 = ev('ev-oct23', 'p1509-online-oct23', 'Online practice, Oct 23', '2099-10-23T11:00:00.000Z', 'Online', 'upcoming', ELI);
export const EVENTS_BY_ORG: Record<string, { upcoming: unknown[]; past: unknown[] }> = {
  'org-cm': { upcoming: [EVENT_NIGHT_OCT16], past: [EVENT_NIGHT_OCT2] },
  'org-online': { upcoming: [EVENT_ONLINE_OCT23], past: [EVENT_ONLINE_SEPT] },
};
export const ATTENDEES: Record<string, ReturnType<typeof person>[]> = {
  'ev-oct16': [person(BOB.id, BOB.slug, BOB.name), ALICE, person(DANA.id, DANA.slug, DANA.name), person('u-fay', 'p1509-fay', 'Fay Okafor')],
  'ev-oct2': [person(BOB.id, BOB.slug, BOB.name), ALICE, CAROL],
  'ev-sept': [person(BOB.id, BOB.slug, BOB.name), ELI],
  'ev-oct23': [ELI, CAROL],
};

/* ---------- letters, partners, profiles ---------- */

export const INBOX = [
  { type: 'received', delivery_id: 'dl-alice', letter_id: 'lt-alice', title: 'What I learned facilitating ten nights', actor_name: ALICE.name, actor_slug: ALICE.slug, timestamp: '2026-10-12T10:00:00.000Z', read_at: null, completed_at: null },
  { type: 'received', delivery_id: 'dl-carol', letter_id: 'lt-carol', title: 'Design reviews without silence', actor_name: CAROL.name, actor_slug: CAROL.slug, timestamp: '2026-10-05T10:00:00.000Z', read_at: null, completed_at: null },
];
export const DRAFT_BOB = { id: 'doc-bob', title: 'Why I run the Chiang Mai circle', updated_at: '2026-10-14T10:00:00.000Z', created_at: '2026-10-14T10:00:00.000Z', story_count: 0, point_count: 0, has_sent_letters: false };
export const SENT_BOB = { id: 'lt-bob', doc_title: 'Notes from Clarity Night, Oct 2', sealed_at: '2026-10-03T10:00:00.000Z', created_at: '2026-10-03T10:00:00.000Z' };

const party = (profileId: string, slug: string, name: string) => ({ profileId, name, slug, avatarColor: '#2563eb', avatarUrl: null, hasPledged: false });
const agreement = (id: string, status: 'active' | 'pending', creator: ReturnType<typeof party>, partner: ReturnType<typeof party>) => ({
  id, displayId: id.toUpperCase(), creatorProfileId: creator.profileId, partnerProfileId: partner.profileId, partnerEmail: `${partner.slug}@${PERSONA_DOMAIN}`, partnerDisplayName: partner.name, termsText: '', status,
  visibility: 'private', invitationToken: 'tok', invitationExpiresAt: CREATED, createdAt: CREATED, partnerSignedAt: status === 'active' ? CREATED : null, terminatedAt: null, terminatedBy: null, agreementVersion: 4, creator, partner,
});
export const PARTY_BOB = party(BOB.id, BOB.slug, BOB.name);
export const PARTY_ALICE = party(ALICE.profileId, ALICE.slug, ALICE.name);
export const PARTY_CAROL = party(CAROL.profileId, CAROL.slug, CAROL.name);
export const AGREEMENT_BOB_ALICE = agreement('ag-bob-alice', 'active', PARTY_BOB, PARTY_ALICE);
export const AGREEMENT_BOB_CAROL_PENDING = agreement('ag-bob-carol', 'pending', PARTY_BOB, PARTY_CAROL);

export const profileOf = (slug: string) => {
  const all = [BOB, DANA, { id: ALICE.profileId, slug: ALICE.slug, name: ALICE.name, email: personaEmail('alice') }, { id: CAROL.profileId, slug: CAROL.slug, name: CAROL.name, email: personaEmail('carol') }];
  const p = all.find((x) => x.slug === slug);
  return p ? { id: p.id, slug: p.slug, name: p.name, email: p.email, role: 'Member', bio: `${p.name}'s profile`, signedAt: CREATED, isVerified: true, witnesses: [], reciprocations: 0, hasPledged: false, avatarColor: '#2563eb' } : null;
};
