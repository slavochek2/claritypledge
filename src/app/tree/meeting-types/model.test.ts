import { describe, expect, it } from "vitest";
import { NO_LEVELS, isComplete, list, verdictCopy, verdictOf, type Levels } from "./model";
import { canOpen, errorsOf, missingOn, stateOf, type FlowInput } from "./flow";

const all = (n: 1 | 2 | 3 | 4 | 5): Levels => ({ fuzzy: n, late: n, damage: n, undo: n, split: n });

describe("meeting-types verdict", () => {
  it("is low when nothing is high, whatever the rest", () => {
    expect(verdictOf(all(3))).toBe("low");
    expect(verdictCopy(all(3)).title).toBe("Low stakes");
  });

  it("is high only with serious damage high and one more", () => {
    expect(verdictOf({ ...all(2), damage: 4, undo: 5 })).toBe("high");
    expect(verdictCopy({ ...all(2), damage: 4, undo: 5 }).body).toBe("High on serious damage and irreversible. Check that everyone understood the same thing before it is decided.");
  });

  it("is some when serious damage is high alone, or others are high without it", () => {
    expect(verdictOf({ ...all(1), damage: 5 })).toBe("some");
    expect(verdictCopy({ ...all(1), damage: 5 }).body).toBe("Serious damage is high, nothing else is. A short check may be worth it.");
    expect(verdictOf({ ...all(1), fuzzy: 4, late: 4, split: 5 })).toBe("some");
    expect(verdictCopy({ ...all(1), fuzzy: 4, late: 4, split: 5 }).body).toBe("High on fuzzy intent, delayed feedback and explanatory divergence, but serious damage is not. A short check may be worth it.");
  });

  it("joins names in plain English", () => {
    expect(list([])).toBe("");
    expect(list(["a"])).toBe("a");
    expect(list(["a", "b", "c"])).toBe("a, b and c");
  });
});

describe("meeting-types flow", () => {
  const empty: FlowInput = { meeting: "", customName: "", levels: NO_LEVELS };

  it("opens each step only once every step before it is answered", () => {
    expect(canOpen("stakes", empty)).toBe(false);
    const picked = { ...empty, meeting: "Hiring decision" };
    expect(canOpen("stakes", picked)).toBe(true);
    expect(canOpen("impact", picked)).toBe(false);
    expect(canOpen("impact", { ...picked, levels: all(2) })).toBe(true);
    expect(isComplete({ ...all(2), split: null })).toBe(false);
  });

  it("needs a typed name for Another meeting", () => {
    const another = { ...empty, meeting: "Another meeting" };
    expect(missingOn("meeting", another)).toBe("name");
    expect(errorsOf(new Set(["meeting"]), another)).toEqual({ name: "Type the meeting's name." });
    expect(missingOn("meeting", { ...another, customName: "  " })).toBe("name");
    expect(missingOn("meeting", { ...another, customName: "Board offsite" })).toBeUndefined();
  });

  it("shows errors only after Continue was pressed on that step", () => {
    expect(errorsOf(new Set(), empty)).toEqual({});
    expect(errorsOf(new Set(["stakes"]), { ...empty, levels: { ...all(3), late: null } })).toEqual({ late: "Set this one." });
  });

  it("closes the impact again when the meeting is unset", () => {
    expect(stateOf("impact", "meeting", { ...empty, levels: all(3) })).toBe("ahead");
  });
});
