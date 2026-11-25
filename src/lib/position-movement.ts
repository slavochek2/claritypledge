/**
 * @file position-movement.ts
 * @description P1061: the counting rules of position movement, one function per rule in the spec's Definitions.
 * Pure: the rows come from `get_story_movement_rows` / `get_point_movement_rows` (SECURITY INVOKER, so they are
 * already only what the viewer may read); everything here decides what those rows mean.
 *
 * Two measures are kept apart, as the spec keeps them:
 *  - on a STORY, "before → latest": from the position a person held when the story's author heard their
 *    explain-back, to their current position. It feeds the story's count, its points' arrows and its panel's bars.
 *  - on a POINT, "first → latest": a holder's earliest position against their current one (or the first and last
 *    inside a pair of dates). It feeds the point page's Changes view and the point card's spread.
 */
import type { PositionType } from '@/app/types';
import { POSITION_ORDER } from '@/lib/compare-positions';
import type { LevelCounts } from '@/lib/position-spread';

// ---------------------------------------------------------------------------------------------------------------
// Rows
// ---------------------------------------------------------------------------------------------------------------

export interface HistoryRow {
  id: string;
  pointId: string;
  userId: string;
  /** null: the position was removed */
  position: PositionType | null;
  changedAt: string;
}

export interface CurrentRow {
  pointId: string;
  userId: string;
  position: PositionType;
}

export interface VerificationRow {
  id: string;
  storyId: string;
  listenerId: string;
  /** the author rated the explain-back exactly 10 (`accuracy_achieved`); false or null otherwise */
  accuracyAchieved: boolean | null;
  createdAt: string;
}

export interface MovementStoryRow {
  id: string;
  authorId: string;
}

/** What `get_story_movement_rows` returns, in the app's shape. */
export interface StoryMovementRows {
  stories: MovementStoryRow[];
  storyPoints: { storyId: string; pointId: string }[];
  verifications: VerificationRow[];
  history: HistoryRow[];
  current: CurrentRow[];
  agentIds: string[];
}

// ---------------------------------------------------------------------------------------------------------------
// Levels
// ---------------------------------------------------------------------------------------------------------------

/** -3 (strongly disagree) .. 3 (strongly agree). "Toward agree" is higher. */
export function levelOf(position: PositionType): number {
  return POSITION_ORDER.indexOf(position) - 3;
}

export function positionOfLevel(level: number): PositionType {
  return POSITION_ORDER[Math.max(0, Math.min(6, level + 3))] as PositionType;
}

// ---------------------------------------------------------------------------------------------------------------
// A person's positions on a point
// ---------------------------------------------------------------------------------------------------------------

/** One position as the graphs draw it: the level, and when it was taken. */
export interface PositionEntry {
  level: number;
  at: string;
}

/** History rows in the one order every rule reads them in: `changed_at`, then row id. */
export function byTime(rows: readonly HistoryRow[]): HistoryRow[] {
  return [...rows].sort((a, b) => {
    const t = Date.parse(a.changedAt) - Date.parse(b.changedAt);
    return t !== 0 ? t : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

/**
 * A person's positions on one point: their non-null history rows in time order, removals skipped, and a row that
 * repeats the previous non-null position (a reasoning-only edit, or removing and re-taking the same position) not
 * counted as a new one.
 */
export function positionsOf(rows: readonly HistoryRow[]): PositionEntry[] {
  const out: PositionEntry[] = [];
  for (const row of byTime(rows)) {
    if (row.position === null) continue;
    const level = levelOf(row.position);
    if (out.at(-1)?.level === level) continue;
    out.push({ level, at: row.changedAt });
  }
  return out;
}

/**
 * "Before": the person's position at a moment, the last history row at or before it. A removal there, or no row
 * at all, means there is no "before".
 */
export function positionAt(rows: readonly HistoryRow[], at: string): number | null {
  const moment = Date.parse(at);
  let last: HistoryRow | null = null;
  for (const row of byTime(rows)) {
    if (Date.parse(row.changedAt) <= moment) last = row;
    else break;
  }
  return last && last.position !== null ? levelOf(last.position) : null;
}

// ---------------------------------------------------------------------------------------------------------------
// Changes and their kinds
// ---------------------------------------------------------------------------------------------------------------

export interface Change {
  before: number;
  after: number;
}

export type Strength = 'switched' | 'other' | 'same';
export type StrengthCounts = Record<Strength, number>;
export type Direction = 'left' | 'same' | 'right';
export type Arrows = Record<Direction, number>;

/** Switched sides: agree side against disagree side (Unsure is on neither). Same: no difference. Other: the rest. */
export function strengthOf(change: Change): Strength {
  if (change.after === change.before) return 'same';
  return change.before * change.after < 0 ? 'switched' : 'other';
}

/** Left: latest lower than before (toward disagree). Right: higher (toward agree). */
export function directionOf(change: Change): Direction {
  if (change.after === change.before) return 'same';
  return change.after < change.before ? 'left' : 'right';
}

export function strengthsOf(changes: readonly Change[]): StrengthCounts {
  const counts: StrengthCounts = { switched: 0, other: 0, same: 0 };
  for (const change of changes) counts[strengthOf(change)] += 1;
  return counts;
}

export function arrowsOf(changes: readonly Change[]): Arrows {
  const arrows: Arrows = { left: 0, same: 0, right: 0 };
  for (const change of changes) arrows[directionOf(change)] += 1;
  return arrows;
}

export const totalOf = (counts: StrengthCounts) => counts.switched + counts.other + counts.same;

/** The not-verified bar is drawn only for a group of this size or more (a display rule). */
export const SMALLEST_UNNAMED_GROUP = 5;
export const drawsNotVerified = (count: number) => count >= SMALLEST_UNNAMED_GROUP;

// ---------------------------------------------------------------------------------------------------------------
// Indexes
// ---------------------------------------------------------------------------------------------------------------

const pairKey = (pointId: string, userId: string) => `${pointId}|${userId}`;

function historyIndex(rows: readonly HistoryRow[]): Map<string, HistoryRow[]> {
  const map = new Map<string, HistoryRow[]>();
  for (const row of rows) {
    const key = pairKey(row.pointId, row.userId);
    const list = map.get(key);
    if (list) list.push(row);
    else map.set(key, [row]);
  }
  return map;
}

function currentIndex(rows: readonly CurrentRow[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const row of rows) map.set(pairKey(row.pointId, row.userId), levelOf(row.position));
  return map;
}

// ---------------------------------------------------------------------------------------------------------------
// Stories
// ---------------------------------------------------------------------------------------------------------------

/** Who the story's author heard explain it back, each once, from their earliest qualifying row. */
export interface StoryListeners {
  /** verified: listener id → the moment of their earliest exactly-10 row */
  verified: Map<string, string>;
  /** explained back, not verified (rated below 10 or not yet): listener id → their earliest such row */
  notVerified: Map<string, string>;
}

const earlier = (a: string, b: string) => (Date.parse(a) <= Date.parse(b) ? a : b);

/**
 * The listeners of one story. The rows are already live, by the author, of a listener who is not the author
 * (the read function selects only those); agent accounts are dropped here. Someone verified is never also counted
 * as not verified, whatever their other rows say.
 */
export function listenersOf(storyId: string, verifications: readonly VerificationRow[], agents: ReadonlySet<string>): StoryListeners {
  const verified = new Map<string, string>();
  const tried = new Map<string, string>();
  for (const row of verifications) {
    if (row.storyId !== storyId || agents.has(row.listenerId)) continue;
    const target = row.accuracyAchieved === true ? verified : tried;
    const seen = target.get(row.listenerId);
    target.set(row.listenerId, seen ? earlier(seen, row.createdAt) : row.createdAt);
  }
  const notVerified = new Map([...tried].filter(([id]) => !verified.has(id)));
  return { verified, notVerified };
}

export interface StoryPointMovement {
  pointId: string;
  /** the verified people's changes on this point: the arrows on the point */
  arrows: Arrows;
  verified: StrengthCounts;
  notVerified: StrengthCounts;
}

export interface StoryMovement {
  storyId: string;
  /** every person the author verified, holder or not ("of the M people {author} verified") */
  verifiedCount: number;
  /** distinct verified people who moved on at least one of the story's points */
  moved: number;
  points: StoryPointMovement[];
}

/**
 * "Story change on a point": before → latest for each listener who holds a position there and has a before,
 * including people who have not changed since (they are Same).
 */
function changesOn(pointId: string, listeners: Map<string, string>, history: Map<string, HistoryRow[]>, current: Map<string, number>): Map<string, Change> {
  const out = new Map<string, Change>();
  for (const [userId, at] of listeners) {
    const latest = current.get(pairKey(pointId, userId));
    if (latest === undefined) continue; // not a holder
    const before = positionAt(history.get(pairKey(pointId, userId)) ?? [], at);
    if (before === null) continue; // no position, or a removal, at the explain-back
    out.set(userId, { before, after: latest });
  }
  return out;
}

/** Every story's movement, keyed by story id. A story by an agent account is left out entirely. */
export function storyMovements(rows: StoryMovementRows): Map<string, StoryMovement> {
  const agents = new Set(rows.agentIds);
  const history = historyIndex(rows.history);
  const current = currentIndex(rows.current);
  const result = new Map<string, StoryMovement>();
  for (const story of rows.stories) {
    if (agents.has(story.authorId)) continue;
    const { verified, notVerified } = listenersOf(story.id, rows.verifications, agents);
    const pointIds = [...new Set(rows.storyPoints.filter(sp => sp.storyId === story.id).map(sp => sp.pointId))];
    const movers = new Set<string>();
    const points = pointIds.map(pointId => {
      const mine = changesOn(pointId, verified, history, current);
      for (const [userId, change] of mine) if (change.after !== change.before) movers.add(userId);
      const others = [...changesOn(pointId, notVerified, history, current).values()];
      return { pointId, arrows: arrowsOf([...mine.values()]), verified: strengthsOf([...mine.values()]), notVerified: strengthsOf(others) };
    });
    result.set(story.id, { storyId: story.id, verifiedCount: verified.size, moved: movers.size, points });
  }
  return result;
}

/** The arrows of one story on one point, or null when nobody it verified moved there (the chip is then hidden). */
export function arrowsOn(movement: StoryMovement | undefined, pointId: string): Arrows | null {
  const point = movement?.points.find(p => p.pointId === pointId);
  if (!point || point.arrows.left + point.arrows.right === 0) return null;
  return point.arrows;
}

// ---------------------------------------------------------------------------------------------------------------
// A point's Changes
// ---------------------------------------------------------------------------------------------------------------

/** One holder on the point page: their positions (inside the dates, when set), first and latest. */
export interface Reading {
  userId: string;
  entries: PositionEntry[];
  first: number;
  latest: number;
}

/** A pair of days, inclusive, in the viewer's time zone. ISO dates (YYYY-MM-DD); '' leaves that end open. */
export interface DayRange {
  from: string;
  to: string;
}

export const NO_DATES: DayRange = { from: '', to: '' };
export const hasDates = (range: DayRange) => range.from !== '' || range.to !== '';

/** The viewer's own calendar day of a moment, as YYYY-MM-DD. */
export function localDay(at: string): string {
  const d = new Date(at);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function inRange(at: string, range: DayRange, dayOf: (at: string) => string = localDay): boolean {
  const day = dayOf(at);
  return (range.from === '' || day >= range.from) && (range.to === '' || day <= range.to);
}

/**
 * The point page's "first and latest" for each holder, agent accounts excluded. Without dates: the earliest
 * position against the current one; every holder is listed, and one who took a position once and kept it (or has no
 * position in the history at all, so their current one stands in) has first = latest, which reads as Same. With
 * dates: the first and last of the positions taken inside them, listed with at least one there; a holder with none
 * inside the dates, including one with no history, drops out of the dated view.
 */
export function readingsOf(
  history: readonly HistoryRow[],
  current: readonly CurrentRow[],
  agentIds: readonly string[],
  range: DayRange = NO_DATES,
  dayOf: (at: string) => string = localDay,
): Reading[] {
  const agents = new Set(agentIds);
  const byUser = historyIndex(history);
  const out: Reading[] = [];
  for (const holder of current) {
    if (agents.has(holder.userId)) continue;
    const all = positionsOf(byUser.get(pairKey(holder.pointId, holder.userId)) ?? []);
    const dated = hasDates(range);
    const entries = dated ? all.filter(e => inRange(e.at, range, dayOf)) : all;
    const first = entries[0];
    const last = entries.at(-1);
    if (dated) {
      // The last position taken inside the dates is "latest"; none inside means no place in the dated view.
      if (!first || !last) continue;
      out.push({ userId: holder.userId, entries, first: first.level, latest: last.level });
      continue;
    }
    // Without dates "latest" is the current position, which also stands in for a holder with no history position.
    const current = levelOf(holder.position);
    out.push({ userId: holder.userId, entries, first: first?.level ?? current, latest: current });
  }
  return out;
}

export const changeOf = (r: Reading): Change => ({ before: r.first, after: r.latest });

/**
 * The point card's spread: every holder's first position (agents included, as today's spread counts them) and
 * today's. A holder with no history row is counted at their current position in both.
 */
export function spreadShift(history: readonly HistoryRow[], current: readonly CurrentRow[]): { first: LevelCounts; now: LevelCounts; changed: boolean } {
  const byUser = historyIndex(history);
  const first = emptyCounts();
  const now = emptyCounts();
  let changed = false;
  for (const holder of current) {
    const entries = positionsOf(byUser.get(pairKey(holder.pointId, holder.userId)) ?? []);
    const firstLevel = entries[0]?.level ?? levelOf(holder.position);
    first[positionOfLevel(firstLevel)] += 1;
    now[holder.position] += 1;
    if (firstLevel !== levelOf(holder.position)) changed = true;
  }
  return { first, now, changed };
}

function emptyCounts(): LevelCounts {
  return Object.fromEntries(POSITION_ORDER.map(p => [p, 0])) as LevelCounts;
}

/** One line under a person's graph: a story's author verified them, at a moment. */
export interface PersonVerification {
  storyId: string;
  authorId: string;
  at: string;
}

/**
 * The verifications of one person by the stories linked to the point, one per story (its earliest exactly-10 row),
 * oldest first. Stories by agent accounts are left out; which stories the viewer can open is the read's business.
 */
export function verificationsOf(
  userId: string,
  stories: readonly MovementStoryRow[],
  verifications: readonly VerificationRow[],
  agentIds: readonly string[],
): PersonVerification[] {
  const agents = new Set(agentIds);
  const out: PersonVerification[] = [];
  for (const story of stories) {
    if (agents.has(story.authorId)) continue;
    const at = listenersOf(story.id, verifications, agents).verified.get(userId);
    if (at) out.push({ storyId: story.id, authorId: story.authorId, at });
  }
  return out.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
}

/** Where a verification sits in a person's graph: after the last position taken at or before it (-1: before all). */
export function entryIndexAt(entries: readonly PositionEntry[], at: string): number {
  const moment = Date.parse(at);
  let index = -1;
  entries.forEach((e, i) => { if (Date.parse(e.at) <= moment) index = i; });
  return index;
}

// ---------------------------------------------------------------------------------------------------------------
// The Changes filter: people, events and groups add up; the dates cut positions
// ---------------------------------------------------------------------------------------------------------------

export interface MovementScope extends DayRange {
  people: string[];
  events: string[];
  groups: string[];
}

export const EVERYONE: MovementScope = { people: [], events: [], groups: [], from: '', to: '' };

export const hasTargets = (scope: MovementScope) => scope.people.length + scope.events.length + scope.groups.length > 0;
export const isEveryone = (scope: MovementScope) => !hasTargets(scope) && !hasDates(scope);
export const datesCrossed = (scope: MovementScope) => scope.from !== '' && scope.to !== '' && scope.from > scope.to;

export interface FilterTarget {
  id: string;
  /** the holders in this event or group */
  memberIds: string[];
}

/** Whose readings the filter keeps: anyone chosen by name, or in a chosen event, or in a chosen group. */
export function chosenPeople(scope: MovementScope, events: readonly FilterTarget[], groups: readonly FilterTarget[]): Set<string> | null {
  if (!hasTargets(scope)) return null; // everyone
  const people = new Set(scope.people);
  for (const e of events) if (scope.events.includes(e.id)) e.memberIds.forEach(id => people.add(id));
  for (const g of groups) if (scope.groups.includes(g.id)) g.memberIds.forEach(id => people.add(id));
  return people;
}
