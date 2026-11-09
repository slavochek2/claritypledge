/**
 * @file canvas-share-options.ts
 * @description P1650: the rows of the Share field's list, in the founder's order (D1): people, then events, then groups.
 * People are the owner's own relationships before anything is typed (`get_canvas_share_people`), the server's
 * `search_profiles` answer once the query is searchable (3+ characters, no '@') and has been answered, and a
 * client-side narrowing of those same relationships (same prefix rule as the server) otherwise. A query with '@' is an
 * email: no person rows, as before.
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
  /** the search has answered the CURRENT query (`found` is then its answer) */
  hasSearched: boolean;
  targets: ShareTargets;
  /** is this target already on the canvas */
  has: (kind: Option['kind'], id: string) => boolean;
}

const SEPARATOR = /[\s\-'’.]/;

/**
 * The server's rule (search_profiles): a prefix of the UNSPLIT name that starts at its start or right after any
 * separator (space, hyphen, apostrophe, period), or a prefix of the handle. So "o'brien", "jean-luc" and "maria l"
 * match, and a mid-word "rien" does not.
 */
function matchesPerson(p: ProfileSearchResult, needle: string): boolean {
  const name = p.name.toLowerCase();
  for (let i = 0; i < name.length; i++) {
    if ((i === 0 || SEPARATOR.test(name.charAt(i - 1))) && name.startsWith(needle, i)) return true;
  }
  return (p.slug ?? '').toLowerCase().startsWith(needle);
}

/**
 * The people rows. The loaded people that match always stay: they carry the rows through the debounce after the third
 * character (no blank, no "Nothing matches yet.") and survive an empty or throttled server answer. Once the server has
 * answered THIS query its people come first, then any loaded person it left out.
 */
function peopleFor(query: string, people: ProfileSearchResult[], found: ProfileSearchResult[], hasSearched: boolean): ProfileSearchResult[] {
  const needle = query.trim().toLowerCase();
  if (needle === '') return people;
  if (needle.includes('@')) return [];
  const near = people.filter(p => matchesPerson(p, needle));
  if (!hasSearched || !isSearchableQuery(query)) return near;
  const answered = new Set(found.map(f => f.profileId));
  return [...found, ...near.filter(p => !answered.has(p.profileId))];
}

export function buildOptions({ query, people, found, hasSearched, targets, has }: Inputs): Option[] {
  const needle = query.trim().toLowerCase();
  return [
    ...peopleFor(query, people, found, hasSearched)
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

/** The options cut into their sections (people, events, groups: they arrive in that order), each row keeping its place `i` in the WHOLE list, which is what the keyboard highlight and the option ids use. */
export function sectionsOf(options: Option[]): { kind: Option['kind']; items: { o: Option; i: number }[] }[] {
  const sections: { kind: Option['kind']; items: { o: Option; i: number }[] }[] = [];
  options.forEach((o, i) => {
    const last = sections[sections.length - 1];
    if (last?.kind === o.kind) last.items.push({ o, i });
    else sections.push({ kind: o.kind, items: [{ o, i }] });
  });
  return sections;
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
