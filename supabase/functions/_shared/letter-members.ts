/**
 * P1691: what belongs to a sealed letter, read from its snapshot rows.
 *
 * The snapshot (letter_story_snapshots) is fixed at seal time and is the record of a letter's
 * stories and of the points sealed into each story (point_config.points). Membership is decided
 * from it, never from live join tables. A point the sender hid is still sealed into the letter
 * and counts as a member, as it does on the database's own response paths.
 *
 * Ids are compared in one form, lower case, which is how the database prints a uuid. Everything
 * returned here is in that form, so a caller that looks up, de-duplicates and writes with these
 * values cannot disagree with itself about spelling.
 *
 * Dependency-free: the two letter-response functions import it, and tests can too.
 */

export interface SnapshotRow {
  story_id: string;
  version_id?: string | null;
  point_config?: unknown;
}

/** The one spelling used for every comparison and every write. */
export function canonicalId(id: string): string {
  return id.toLowerCase();
}

/**
 * Point ids sealed into one story, in order, repeats kept. A snapshot with no usable list
 * (missing, not an array, or entries without a text id) contributes nothing; it never throws.
 */
export function sealedPointIds(pointConfig: unknown): string[] {
  const points = (pointConfig as { points?: unknown } | null | undefined)?.points;
  if (!Array.isArray(points)) return [];
  const ids: string[] = [];
  for (const point of points) {
    const id = (point as { id?: unknown } | null | undefined)?.id;
    if (typeof id === 'string' && id !== '') ids.push(canonicalId(id));
  }
  return ids;
}

/**
 * The largest response a reader of this letter can legitimately send: one rating per story, and
 * one position per story and point. A point sealed under two stories is answered once in each,
 * so point entries are counted per story, repeats included.
 */
export function letterResponseBounds(snapshots: SnapshotRow[]): { stories: number; pointEntries: number } {
  let pointEntries = 0;
  for (const snapshot of snapshots) pointEntries += sealedPointIds(snapshot.point_config).length;
  return { stories: snapshots.length, pointEntries };
}

export interface LetterMembers {
  /** Canonical story id → the version sealed into the letter. */
  stories: Map<string, string | null>;
  /** Canonical ids of every point sealed into any story of the letter. */
  points: Set<string>;
}

export function letterMembers(snapshots: SnapshotRow[]): LetterMembers {
  const stories = new Map<string, string | null>();
  const points = new Set<string>();
  for (const snapshot of snapshots) {
    if (typeof snapshot.story_id !== 'string') continue;
    stories.set(canonicalId(snapshot.story_id), snapshot.version_id ?? null);
    for (const id of sealedPointIds(snapshot.point_config)) points.add(id);
  }
  return { stories, points };
}

/**
 * Keeps the entries whose id (read with `idOf`) is in `allowed`, once each, first entry wins,
 * and returns them with the canonical id. `dropped` counts everything left out.
 */
export function keepMembersOnce<T>(
  entries: unknown,
  idOf: (entry: T) => unknown,
  allowed: { has(id: string): boolean },
): { kept: Array<{ id: string; entry: T }>; dropped: number } {
  const list: T[] = Array.isArray(entries) ? entries : [];
  const seen = new Set<string>();
  const kept: Array<{ id: string; entry: T }> = [];
  for (const entry of list) {
    const raw = entry === null || typeof entry !== 'object' ? undefined : idOf(entry);
    if (typeof raw !== 'string') continue;
    const id = canonicalId(raw);
    if (!allowed.has(id) || seen.has(id)) continue;
    seen.add(id);
    kept.push({ id, entry });
  }
  return { kept, dropped: list.length - kept.length };
}
