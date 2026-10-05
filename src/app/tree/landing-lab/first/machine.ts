/**
 * The "Go first" journey as a pure state machine. No React, no DOM: every transition the
 * page can make is a function here, so the order of the journey is testable on its own.
 *
 * A state is a screen and a beat within it. The linear journey is screens 1, 2, 3, 4, 6
 * and the fork. Screen 5, the mirror, is a detour off screen 4 that always returns to the
 * first beat of screen 6, so nobody who takes it skips the norm. The fork leads to four
 * routes; two of them branch once more before their ending.
 */

export type ScreenId =
  | "promise" // 1. Promise and story, first beat
  | "story" // 2. Story, second and third beat
  | "meanings" // 3. Three meanings
  | "demo" // 4. Demonstration
  | "mirror" // 5. Optional detour: the mirror
  | "norm" // 6. The norm, and Point A to Point B
  | "fork" // 7. The fork
  | "work" // Ending: work, the invite question
  | "work-yes" // Ending: work, pilot request
  | "work-no" // Ending: work, forward an invitation
  | "one" // Ending: one person
  | "room" // Ending: room, the location question
  | "room-elsewhere" // Ending: room, somewhere else
  | "examples"; // Ending: examples

export type Route = "work" | "one" | "room" | "examples";

export interface JourneyState {
  screen: ScreenId;
  beat: number;
}

/** The screens Next walks through, in order. */
export const LINEAR: readonly ScreenId[] = ["promise", "story", "meanings", "demo", "norm", "fork"];

/** How many Next presses each linear screen holds. */
export const BEATS: Readonly<Partial<Record<ScreenId, number>>> = {
  promise: 1,
  story: 2,
  meanings: 1,
  demo: 6,
  norm: 3,
  fork: 1,
};

export const ROUTES: readonly Route[] = ["work", "one", "room", "examples"];

/** The screen number JOURNEY.md gives each screen, for measurement. Endings share 8. */
export const SCREEN_NUMBER: Readonly<Record<ScreenId, number>> = {
  promise: 1,
  story: 2,
  meanings: 3,
  demo: 4,
  mirror: 5,
  norm: 6,
  fork: 7,
  work: 8,
  "work-yes": 8,
  "work-no": 8,
  one: 8,
  room: 8,
  "room-elsewhere": 8,
  examples: 8,
};

/**
 * Where Back leads from each off-line screen. Back from the mirror returns to the end of the
 * demonstration; its other way out, Continue, goes on to screen 6 (see returnFromMirror).
 */
const PARENT: Readonly<Partial<Record<ScreenId, ScreenId>>> = {
  mirror: "demo",
  work: "fork",
  one: "fork",
  room: "fork",
  examples: "fork",
  "work-yes": "work",
  "work-no": "work",
  "room-elsewhere": "room",
};

export const START: JourneyState = { screen: "promise", beat: 0 };

export function beatCount(screen: ScreenId): number {
  return BEATS[screen] ?? 1;
}

export function lastBeat(screen: ScreenId): number {
  return beatCount(screen) - 1;
}

const at = (screen: ScreenId, beat = 0): JourneyState => ({ screen, beat });

/** True where the visible Next button exists: the linear screens before the fork. */
export function hasNext(s: JourneyState): boolean {
  return LINEAR.includes(s.screen) && s.screen !== "fork";
}

/** Back is shown from screen 2 onwards. */
export function hasBack(s: JourneyState): boolean {
  return !(s.screen === "promise" && s.beat === 0);
}

/**
 * How much room the scene gets, chosen per screen and never per beat or by content length.
 *  - "hero": screens 1 and 2, the scene takes the room above the text.
 *  - "band": a short strip above the text on every other screen (hidden on short viewports
 *    by the layout, not here).
 *  - "none": the two forms and the mirror, where the text and the keyboard need the room.
 */
export type SceneSize = "hero" | "band" | "none";

export function sceneSize(screen: ScreenId): SceneSize {
  if (screen === "promise" || screen === "story") return "hero";
  if (screen === "mirror" || screen === "work-yes" || screen === "room-elsewhere") return "none";
  return "band";
}

/**
 * Where the visitor is in the main journey, for the progress line: one segment per beat
 * from screen 1 to the fork. Null off the journey (the mirror, the endings, the forms).
 */
export function journeyProgress(s: JourneyState): { index: number; total: number } | null {
  const i = LINEAR.indexOf(s.screen);
  if (i < 0) return null;
  const before = LINEAR.slice(0, i).reduce((n, screen) => n + beatCount(screen), 0);
  const total = LINEAR.reduce((n, screen) => n + beatCount(screen), 0);
  return { index: before + s.beat, total };
}

/** Screens reached off the linear journey: the mirror and every ending. */
export function isOffJourney(screen: ScreenId): boolean {
  return !LINEAR.includes(screen);
}

export function next(s: JourneyState): JourneyState {
  if (!hasNext(s)) return s;
  if (s.beat < lastBeat(s.screen)) return at(s.screen, s.beat + 1);
  const following = LINEAR[LINEAR.indexOf(s.screen) + 1];
  return following ? at(following) : s;
}

export function back(s: JourneyState): JourneyState {
  if (s.beat > 0 && LINEAR.includes(s.screen)) return at(s.screen, s.beat - 1);
  const parent = PARENT[s.screen];
  if (parent) return at(parent, lastBeat(parent));
  const prev = LINEAR[LINEAR.indexOf(s.screen) - 1];
  return prev ? at(prev, lastBeat(prev)) : s;
}

/** The mirror link sits under the finished demonstration only. */
export function canOpenMirror(s: JourneyState): boolean {
  return s.screen === "demo" && s.beat === lastBeat("demo");
}

export function openMirror(s: JourneyState): JourneyState {
  return canOpenMirror(s) ? at("mirror") : s;
}

/** Leaving the mirror always lands on the first beat of the norm. */
export function returnFromMirror(s: JourneyState): JourneyState {
  return s.screen === "mirror" ? at("norm") : s;
}

export function choose(s: JourneyState, route: Route): JourneyState {
  return s.screen === "fork" ? at(route) : s;
}

export function answerWork(s: JourneyState, canInvite: boolean): JourneyState {
  return s.screen === "work" ? at(canInvite ? "work-yes" : "work-no") : s;
}

/**
 * "No, I am somewhere else" leads to the notifications form. "Yes, show me the next event"
 * is a link to the events page, so it is not a transition of this machine.
 */
export function chooseElsewhere(s: JourneyState): JourneyState {
  return s.screen === "room" ? at("room-elsewhere") : s;
}

/** The demonstration counts as completed when its last step is on screen. */
export function isDemoComplete(s: JourneyState): boolean {
  return s.screen === "demo" && s.beat === lastBeat("demo");
}

// ---------------------------------------------------------------------------------------
// Browser history. Each screen change is its own history entry, so the browser's Back
// steps one screen. A beat change only rewrites the current entry. Each entry remembers
// the screen below it, so the page's own Back can step down the real stack instead of
// piling a new entry on top whenever the entry below is the screen it wants.
// ---------------------------------------------------------------------------------------

export interface HistoryEntry extends JourneyState {
  /** The screen of the history entry directly below this one, if it is ours. */
  below: ScreenId | null;
}

export type HistoryOp =
  | { kind: "none" }
  | { kind: "replace"; entry: HistoryEntry }
  | { kind: "push"; entry: HistoryEntry }
  | { kind: "pop" };

export function historyOp(current: HistoryEntry, target: JourneyState, direction: "forward" | "back"): HistoryOp {
  if (target.screen === current.screen) {
    if (target.beat === current.beat) return { kind: "none" };
    return { kind: "replace", entry: { ...target, below: current.below } };
  }
  if (direction === "back" && current.below === target.screen) return { kind: "pop" };
  return { kind: "push", entry: { ...target, below: current.screen } };
}

const SCREENS = new Set<ScreenId>(Object.keys(SCREEN_NUMBER) as ScreenId[]);

function isScreen(x: unknown): x is ScreenId {
  return typeof x === "string" && SCREENS.has(x as ScreenId);
}

/**
 * Reads a history entry back from `history.state`. Anything malformed, or a beat out of
 * range, starts the journey from the top rather than rendering a screen that cannot exist.
 */
export function parseEntry(raw: unknown): HistoryEntry | null {
  if (typeof raw !== "object" || raw === null) return null;
  const { screen, beat, below } = raw as { screen?: unknown; beat?: unknown; below?: unknown };
  if (!isScreen(screen)) return null;
  if (typeof beat !== "number" || !Number.isInteger(beat) || beat < 0 || beat > lastBeat(screen)) return null;
  if (below !== null && !isScreen(below)) return null;
  return { screen, beat, below };
}
