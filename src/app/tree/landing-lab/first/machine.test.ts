import { describe, expect, it } from "vitest";
import {
  BEATS,
  LINEAR,
  START,
  answerWork,
  back,
  beatCount,
  canOpenMirror,
  choose,
  chooseElsewhere,
  hasBack,
  hasNext,
  historyOp,
  isOffJourney,
  journeyProgress,
  lastBeat,
  next,
  openMirror,
  parseEntry,
  returnFromMirror,
  sceneSize,
  type JourneyState,
} from "./machine";
import { DEMO_BEATS } from "./demo";

/** Presses Next until the state stops changing, returning every state visited. */
function walk(from: JourneyState): JourneyState[] {
  const seen = [from];
  let s = from;
  for (let i = 0; i < 100; i++) {
    const n = next(s);
    if (n === s) break;
    seen.push(n);
    s = n;
  }
  return seen;
}

describe("Go first journey machine", () => {
  it("walks screens 1, 2, 3, 4, 6 and the fork in order, one beat per Next", () => {
    const path = walk(START).map((s) => `${s.screen}:${s.beat}`);
    expect(path).toEqual([
      "promise:0",
      "story:0",
      "story:1",
      "meanings:0",
      "demo:0",
      "demo:1",
      "demo:2",
      "demo:3",
      "demo:4",
      "demo:5",
      "norm:0",
      "norm:1",
      "norm:2",
      "fork:0",
    ]);
  });

  it("never walks into the mirror or an ending with Next", () => {
    const screens = new Set(walk(START).map((s) => s.screen));
    expect(screens.has("mirror")).toBe(false);
    expect([...screens].every((s) => LINEAR.includes(s))).toBe(true);
  });

  it("has no Next at the fork or after it, and no Back on the first screen", () => {
    expect(hasNext({ screen: "fork", beat: 0 })).toBe(false);
    expect(hasNext({ screen: "work-yes", beat: 0 })).toBe(false);
    expect(next({ screen: "fork", beat: 0 })).toEqual({ screen: "fork", beat: 0 });
    expect(hasBack(START)).toBe(false);
    expect(hasBack({ screen: "story", beat: 0 })).toBe(true);
  });

  it("Back reverses Next exactly along the whole linear journey", () => {
    const path = walk(START);
    for (let i = path.length - 1; i > 0; i--) {
      expect(back(path[i]!)).toEqual(path[i - 1]);
    }
    expect(back(START)).toBe(START);
  });

  it("opens the mirror only from the finished demonstration", () => {
    const early: JourneyState = { screen: "demo", beat: 2 };
    expect(canOpenMirror(early)).toBe(false);
    expect(openMirror(early)).toBe(early);
    const done: JourneyState = { screen: "demo", beat: lastBeat("demo") };
    expect(openMirror(done)).toEqual({ screen: "mirror", beat: 0 });
    expect(openMirror({ screen: "norm", beat: 0 })).toEqual({ screen: "norm", beat: 0 });
  });

  it("returns from the mirror to the first beat of screen 6, never skipping the norm", () => {
    const mirror = openMirror({ screen: "demo", beat: lastBeat("demo") });
    expect(returnFromMirror(mirror)).toEqual({ screen: "norm", beat: 0 });
    // A return from anywhere else is not a transition.
    const fork: JourneyState = { screen: "fork", beat: 0 };
    expect(returnFromMirror(fork)).toBe(fork);
  });

  it("has two ways out of the mirror: Back to the end of the demonstration, Continue to screen 6", () => {
    expect(back({ screen: "mirror", beat: 0 })).toEqual({ screen: "demo", beat: lastBeat("demo") });
    expect(returnFromMirror({ screen: "mirror", beat: 0 })).toEqual({ screen: "norm", beat: 0 });
  });

  it("forks into four routes and their endings", () => {
    const fork: JourneyState = { screen: "fork", beat: 0 };
    expect(choose(fork, "work")).toEqual({ screen: "work", beat: 0 });
    expect(choose(fork, "one")).toEqual({ screen: "one", beat: 0 });
    expect(choose(fork, "room")).toEqual({ screen: "room", beat: 0 });
    expect(choose(fork, "examples")).toEqual({ screen: "examples", beat: 0 });
    expect(choose({ screen: "norm", beat: 3 }, "work")).toEqual({ screen: "norm", beat: 3 });

    const work = choose(fork, "work");
    expect(answerWork(work, true)).toEqual({ screen: "work-yes", beat: 0 });
    expect(answerWork(work, false)).toEqual({ screen: "work-no", beat: 0 });

    const room = choose(fork, "room");
    // "Yes, show me the next event" is a link to the events page, not a screen.
    expect(chooseElsewhere(room)).toEqual({ screen: "room-elsewhere", beat: 0 });
    expect(chooseElsewhere(fork)).toBe(fork);
  });

  it("Back from each ending steps up one level to where it was chosen", () => {
    expect(back({ screen: "work-yes", beat: 0 })).toEqual({ screen: "work", beat: 0 });
    expect(back({ screen: "work-no", beat: 0 })).toEqual({ screen: "work", beat: 0 });
    expect(back({ screen: "room-elsewhere", beat: 0 })).toEqual({ screen: "room", beat: 0 });
    for (const s of ["work", "one", "room", "examples"] as const) {
      expect(back({ screen: s, beat: 0 })).toEqual({ screen: "fork", beat: 0 });
    }
    expect(back({ screen: "fork", beat: 0 })).toEqual({ screen: "norm", beat: lastBeat("norm") });
  });

  it("gives the scene two sizes, chosen per screen: hero on 1 and 2, none on forms and the mirror, else band", () => {
    expect(sceneSize("promise")).toBe("hero");
    expect(sceneSize("story")).toBe("hero");
    for (const s of ["meanings", "demo", "norm", "fork", "work", "work-no", "one", "room", "examples"] as const) {
      expect(sceneSize(s), s).toBe("band");
    }
    for (const s of ["mirror", "work-yes", "room-elsewhere"] as const) expect(sceneSize(s), s).toBe("none");
  });

  it("counts progress one segment per beat of the main journey, and none off it", () => {
    const path = walk(START);
    path.forEach((s, i) => expect(journeyProgress(s)).toEqual({ index: i, total: path.length }));
    for (const screen of ["mirror", "work", "work-yes", "one", "room-elsewhere", "examples"] as const) {
      expect(journeyProgress({ screen, beat: 0 })).toBeNull();
    }
  });

  it("marks the mirror and the endings as off the journey", () => {
    expect(isOffJourney("mirror")).toBe(true);
    expect(isOffJourney("work-yes")).toBe(true);
    expect(isOffJourney("demo")).toBe(false);
    expect(isOffJourney("fork")).toBe(false);
  });

  it("counts beats per screen as JOURNEY.md sets them", () => {
    expect(BEATS).toMatchObject({ promise: 1, story: 2, meanings: 1, demo: DEMO_BEATS, norm: 3, fork: 1 });
    expect(DEMO_BEATS).toBe(6);
    expect(beatCount("examples")).toBe(1);
  });
});

describe("Go first history entries", () => {
  it("pushes on a screen change and replaces on a beat change", () => {
    const cur = { screen: "story" as const, beat: 0, below: "promise" as const };
    expect(historyOp(cur, { screen: "story", beat: 1 }, "forward")).toEqual({
      kind: "replace",
      entry: { screen: "story", beat: 1, below: "promise" },
    });
    expect(historyOp({ ...cur, beat: 1 }, { screen: "meanings", beat: 0 }, "forward")).toEqual({
      kind: "push",
      entry: { screen: "meanings", beat: 0, below: "story" },
    });
    expect(historyOp(cur, { screen: "story", beat: 0 }, "forward")).toEqual({ kind: "none" });
  });

  it("pops the real history entry when Back targets the screen directly below", () => {
    const cur = { screen: "meanings" as const, beat: 0, below: "story" as const };
    expect(historyOp(cur, back(cur), "back")).toEqual({ kind: "pop" });
  });

  it("pops back to the demonstration from the mirror, and pushes screen 6 on Continue", () => {
    const cur = { screen: "mirror" as const, beat: 0, below: "demo" as const };
    expect(historyOp(cur, back(cur), "back")).toEqual({ kind: "pop" });
    expect(historyOp(cur, returnFromMirror(cur), "forward")).toEqual({ kind: "push", entry: { screen: "norm", beat: 0, below: "mirror" } });
  });

  it("pushes instead of popping when the entry below is the mirror, not screen 4", () => {
    // Returned from the mirror: screen 6 sits on top of the mirror's entry. The page's
    // Back goes to screen 4, which is not the entry below, so it cannot pop.
    const cur = { screen: "norm" as const, beat: 0, below: "mirror" as const };
    const op = historyOp(cur, back(cur), "back");
    expect(op).toEqual({ kind: "push", entry: { screen: "demo", beat: lastBeat("demo"), below: "norm" } });
  });

  it("reads back only well-formed entries", () => {
    expect(parseEntry({ screen: "demo", beat: 4, below: "meanings" })).toEqual({ screen: "demo", beat: 4, below: "meanings" });
    expect(parseEntry({ screen: "promise", beat: 0, below: null })).not.toBeNull();
    expect(parseEntry(null)).toBeNull();
    expect(parseEntry({ screen: "demo", beat: 5, below: null })).not.toBeNull();
    expect(parseEntry({ screen: "demo", beat: 6, below: null })).toBeNull();
    expect(parseEntry({ screen: "demo", beat: -1, below: null })).toBeNull();
    expect(parseEntry({ screen: "demo", beat: 1.5, below: null })).toBeNull();
    expect(parseEntry({ screen: "nowhere", beat: 0, below: null })).toBeNull();
    expect(parseEntry({ screen: "demo", beat: 0, below: "nowhere" })).toBeNull();
    expect(parseEntry({ screen: "demo", beat: 0 })).toBeNull();
  });
});
