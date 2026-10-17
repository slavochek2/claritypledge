/**
 * @file seed-world.ts
 * @description P1509 v16: the rows `scripts/p1509-seed-personas.ts` writes to the Supabase TEST project (points,
 * stories, letters, who is an admin). Pure data, no imports beyond types, so the script and the prototype's tests can
 * both name the same records. These were the mock Share/Letters/Admin lists of v15; since v16 the prototype reads them
 * back from the database, and this file is the only place that still holds their text.
 *
 * No tags: agent-authored content may carry only the closed list of system tags (st1-st9, understanding,
 * misunderstanding, v1, v2), and none is needed here, so nothing is tagged.
 */
import type { PositionType } from '@/app/types';
import type { PersonId } from './mock-data';

/**
 * Personas whose profile row gets `is_admin`: none, by design. `profiles.is_admin` has a single-admin unique index
 * (migration 20260605150000_p878, mitigation 4) and the one admin is the founder, set by hand. So every persona is a
 * non-admin; the Admin entry's visible state is reached only on the founder's own account.
 */
export const SEED_ADMIN_IDS: readonly PersonId[] = [];

export interface SeedShareable {
  /** Key within the seed run; not stored. */
  id: string;
  kind: 'point' | 'story';
  /** A point's statement, or the story's headline (stories store only `content`, so a story uses `excerpt`). */
  title: string;
  author: PersonId;
  excerpt?: string;
  /** A story's linked point ids (keys in this list). */
  points?: string[];
  /** The point's position counts from other personas (production's 7-point buckets). */
  counts?: Partial<Record<PositionType, number>>;
}

export const SEED_SHAREABLE: SeedShareable[] = [
  { id: 'pt-bob-1', kind: 'point', title: 'Disagreement is information, not a threat', author: 'bob', counts: { agree: 4, unsure: 1, disagree: 1 } },
  { id: 'st-bob-1', kind: 'story', title: 'The hike where we got lost on purpose', author: 'bob', points: ['pt-bob-1'], excerpt: 'We left the map in the car and agreed to say out loud every guess we made about the trail.' },
  { id: 'pt-dana-1', kind: 'point', title: 'Repeat back before you reply', author: 'dana', counts: { strongly_agree: 2, agree: 3 } },
  { id: 'st-dana-1', kind: 'story', title: 'How I misread my sister for ten years', author: 'dana', points: ['pt-dana-1'], excerpt: 'I heard "you never call" as blame. She meant "I miss you".' },
  { id: 'pt-alice-1', kind: 'point', title: 'Most arguments are about definitions, not facts', author: 'alice', counts: { agree: 2, unsure: 3, somewhat_disagree: 2 } },
  { id: 'st-carol-1', kind: 'story', title: 'The design review that went silent', author: 'carol', points: ['pt-alice-1'], excerpt: 'Nobody disagreed out loud, and three weeks later everyone had built something different.' },
];

/** Where a letter lives: `inbox` = sealed and delivered to bob; `drafts` = a doc with no letter; `sent` = a sealed public letter. */
export type SeedLetterBox = 'inbox' | 'drafts' | 'sent';
export interface SeedLetter {
  id: string;
  box: SeedLetterBox;
  author: PersonId;
  /** The letter's doc title (production shows it as the letter's title). */
  title: string;
  /** The letter's single story. */
  body: string;
  /** How long ago it was written. */
  daysAgo: number;
}

export const SEED_LETTERS: SeedLetter[] = [
  { id: 'l-alice', box: 'inbox', author: 'alice', daysAgo: 4, title: 'What I learned facilitating ten nights', body: 'The best moment of every night is when someone says “yes, exactly” and you can see they mean it. I want more of those, and fewer rounds where people wait for their turn to talk.' },
  { id: 'l-carol', box: 'inbox', author: 'carol', daysAgo: 11, title: 'Design reviews without silence', body: 'Silence in a review is not agreement. Since we started repeating back the critique before answering it, our reviews got shorter and the work got better.' },
  { id: 'l-bob-draft', box: 'drafts', author: 'bob', daysAgo: 2, title: 'Why I run the Chiang Mai circle', body: 'Draft. Most of the people I meet here moved for a reason they never say out loud.' },
  { id: 'l-bob-sent', box: 'sent', author: 'bob', daysAgo: 13, title: 'Notes from Clarity Night, Oct 2', body: 'Three pairs got to “yes, exactly” in under five minutes. Two never did. Here is what the second group had in common.' },
];

/**
 * The seeded event for a mock event id. Titles carry a date computed when the seed runs ("Clarity Night, Oct 17"),
 * so they cannot be matched against the mock's fixed names; the slug is the stable key.
 */
export const SEED_EVENT_SLUG_PREFIX = 'p1509-';
export const seedEventSlug = (mockEventId: string): string => `${SEED_EVENT_SLUG_PREFIX}${mockEventId}`;
