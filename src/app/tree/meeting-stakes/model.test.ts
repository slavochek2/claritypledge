/** The verdict, the money arithmetic and the step gating behind /tree/meeting-stakes. */
import { describe, expect, it } from "vitest";
import { NO_ANSWERS, NO_MONEY, compute, count, eur, every, percent, rate, verdictCopy, verdictOf, type Answers } from "./model";
import { canOpen, errorsOf, missingOn, nextOf, stateOf, type FlowInput } from "./flow";

const all = (a: Answers[keyof Answers]): Answers => ({ fuzzy: a, late: a, damage: a, undo: a, blame: a });

describe("verdictOf", () => {
  it("skips when the results would not suffer, whatever the answers", () => {
    expect(verdictOf("no", all(2))).toBe("skip");
  });
  it("counts flagged points: none settles, one is borderline, two or more is worth a check", () => {
    // fuzzy is reverse-coded: disagreeing raises it, agreeing lowers it
    expect(verdictOf("yes", all(-1))).toBe("borderline"); // only fuzzy flagged
    expect(verdictOf("yes", all(1))).toBe("worth"); // the other four flagged, fuzzy not
    expect(verdictOf("yes", { ...all(-2), fuzzy: 2 })).toBe("settles");
    expect(verdictOf("yes", { ...all(-2), fuzzy: 2, late: 1 })).toBe("borderline");
    expect(verdictOf("yes", { ...all(-2), fuzzy: 2, late: 1, undo: 2 })).toBe("worth");
  });
  it("never counts Unsure or an unanswered point as a risk", () => {
    expect(verdictOf("yes", { ...all(0), fuzzy: 0 })).toBe("settles");
    expect(verdictOf("yes", NO_ANSWERS)).toBe("settles");
  });
  it("names the flagged conditions, never a summed score", () => {
    const { body } = verdictCopy("worth", { ...all(-2), fuzzy: 2, late: 1, undo: 2 });
    expect(body).toBe("Two of your answers raise the risk: late results and hard to undo. A misunderstanding here would be costly and would not sort itself out.");
  });
});

describe("compute", () => {
  it("prices the check and the break-even from the host's numbers", () => {
    const r = compute({ people: 6, hourly: 60, minutes: 15, perYear: 4, damage: 20000, oneIn: 10 });
    expect(r.checkPerMeeting).toBe(90);
    expect(Math.floor(r.breakEvenEvery!)).toBe(222);
    expect(r.mustPrevent).toBeCloseTo(0.045);
    expect(r.checkPerYear).toBe(360);
    expect(r.atRiskPerYear).toBe(8000);
  });
  it("leaves every figure empty that is missing an input, rather than guessing", () => {
    expect(compute(NO_MONEY)).toEqual({ checkPerMeeting: null, breakEvenEvery: null, mustPrevent: null, checkPerYear: null, atRiskPerYear: null });
    expect(compute({ ...NO_MONEY, people: 5, hourly: 0, minutes: 10, damage: 1000 }).breakEvenEvery).toBeNull();
  });
  it("says every meeting, never every 1 meetings", () => {
    expect(every(0.4)).toBe("every meeting");
    expect(every(1.9)).toBe("every meeting");
    expect(every(1562.5)).toBe("every 1,562 meetings");
    // The host's own rate keeps its decimals, so it never reads as "every meeting" when it is not.
    expect(rate(1.04)).toBe("every 1.04 meetings");
    expect(rate(1.9)).toBe("every 1.9 meetings");
    expect(rate(1)).toBe("every meeting");
    expect(count(1, "meeting")).toBe("1 meeting");
    expect(count(0.5, "meeting")).toBe("0.5 meetings");
    expect(count(12, "meeting")).toBe("12 meetings");
    // A positive share never reads as 0%.
    expect(percent(0.0004)).toBe("under 0.1%");
    expect(percent(0.05)).toBe("5%");
    expect(percent(0.5)).toBe("50%");
    // Yearly figures come from the typed inputs, not from a rounded per-meeting figure: 11 × €50 × 5 min × 3 is €137.50.
    expect(compute({ people: 11, hourly: 50, minutes: 5, perYear: 3, damage: 101, oneIn: 6 }).checkPerYear).toBe(137.5);
    expect(eur(137.5)).toBe("€138");
    expect(compute({ people: 11, hourly: 50, minutes: 5, perYear: 3, damage: 101, oneIn: 6 }).atRiskPerYear).toBe(50.5);
    // A positive amount never reads as €0.
    expect(eur(0.4)).toBe("€0.40");
    expect(eur(0)).toBe("€0");
    expect(eur(10.5)).toBe("€11");
  });
});

describe("flow", () => {
  const f = (over: Partial<FlowInput>): FlowInput => ({ meeting: "Pre-mortem", gate: "yes", answers: all(1), visited: new Set(), ...over });

  it("goes straight to the result when the results would not suffer", () => {
    expect(nextOf("meeting", f({ gate: "no" }))).toBe("result");
    expect(stateOf("stakes", "result", f({ gate: "no" }))).toBe("skipped");
    expect(stateOf("cost", "result", f({ gate: "no" }))).toBe("skipped");
  });
  it("closes the result again when an answer is cleared", () => {
    const visited = new Set(["cost", "result"] as const);
    expect(canOpen("result", f({ visited }))).toBe(true);
    expect(canOpen("result", f({ visited, answers: { ...all(1), undo: null } }))).toBe(false);
  });
  it("blocks Next on the first unanswered question and shows errors only after a try", () => {
    const empty = f({ meeting: "", gate: null, answers: NO_ANSWERS });
    expect(missingOn("meeting", empty)).toBe("meeting");
    expect(missingOn("stakes", f({ answers: { ...all(1), damage: null, blame: null } }))).toBe("damage");
    expect(missingOn("cost", empty)).toBeUndefined(); // the cost step is optional
    expect(errorsOf(new Set(), empty)).toEqual({});
    expect(errorsOf(new Set(["meeting"] as const), empty)).toEqual({ meeting: "Choose a meeting.", gate: "Answer yes or no." });
  });
});
