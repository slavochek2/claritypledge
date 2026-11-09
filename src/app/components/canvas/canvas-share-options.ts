/**
 * @file canvas-share-options.ts
 * @description P1650: the rows of the Share field's list, in the founder's order (D1): people, then events, then groups.
 * People are the owner's own relationships before anything is typed (`get_canvas_share_people`), the server's
 * `search_profiles` answer once the query is searchable (3+ characters, no '@'), and a client-side narrowing of those
 * same relationships for one or two characters. A query with '@' is an email: no person rows, as before.
 */
import type { ProfileSearchResult } from '@/app/data/agreements-service';
import type { ShareTargets } from '@/app/data/canvas-service';
import { isSearchableQuery } from '@/app/hooks/profile-search-query';

export interface Option {
  kind: 'person' | 'event' | 'group';
  id: string;
  label: string;
  sub: string;
  avatar?: { photoUrl?: string; color?: string };
}

interface Inputs {
  query: string;
  people: ProfileSearchResult[];
  found: ProfileSearchResult[];
  targets: ShareTargets;
  /** is this target already on the canvas */
  has: (kind: Option['kind'], id: string) => boolean;
}

function peopleFor(query: string, people: ProfileSearchResult[], found: ProfileSearchResult[]): ProfileSearchResult[] {
  const needle = query.trim().toLowerCase();
  if (needle === '') return people;
  if (isSearchableQuery(query)) return found;
  if (needle.includes('@')) return [];
  return people.filter(p => p.name.toLowerCase().includes(needle) || (p.slug ?? '').toLowerCase().includes(needle));
}

export function buildOptions({ query, people, found, targets, has }: Inputs): Option[] {
  const needle = query.trim().toLowerCase();
  return [
    ...peopleFor(query, people, found)
      .filter(p => !has('person', p.profileId))
      .map(p => ({ kind: 'person' as const, id: p.profileId, label: p.name, sub: p.slug ? `@${p.slug}` : 'Person', avatar: { photoUrl: p.avatarUrl ?? undefined, color: p.avatarColor } })),
    ...targets.events
      .filter(e => !has('event', e.id) && e.title.toLowerCase().includes(needle))
      .map(e => ({ kind: 'event' as const, id: e.id, label: e.title, sub: 'Event' })),
    ...targets.groups
      .filter(g => !has('group', g.id) && g.name.toLowerCase().includes(needle))
      .map(g => ({ kind: 'group' as const, id: g.id, label: g.name, sub: 'Group' })),
  ];
}

export const SECTION_HEADING: Record<Option['kind'], string> = { person: 'People', event: 'Events', group: 'Groups' };

/**
 * [FOUNDER DECISION: empty-events text] Shown when the list holds nothing and nothing is typed. Events are offered from
 * until a week after they start, so an owner whose events are all past sees this too.
 */
export const NO_TARGETS_TEXT = 'You have no events or groups to share with yet. Events stay on this list until a week after they start. Register for an event or join a group first, or type a name to add a person.';
export const ALL_ADDED_TEXT = 'That is all of your events and groups. Type a name to add a person.';

/** What the list says when it has no row: typed text gets the search's answer, an empty field the state of the owner's events and groups. */
export function emptyText(needle: string, hasSearched: boolean, targets: ShareTargets): string {
  if (needle !== '') return hasSearched ? 'No one found. You can add people you already have a letter or an agreement with.' : 'Nothing matches yet.';
  return targets.events.length === 0 && targets.groups.length === 0 ? NO_TARGETS_TEXT : ALL_ADDED_TEXT;
}
