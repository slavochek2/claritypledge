import { describe, expect, it } from "vitest";
import { DEMO, DEMO_BEATS, demoView, ratingForDisplay, validateDemonstration, type Demonstration, type Rating } from "./demo";

describe("Go first demonstration: no rating without a rater", () => {
  it("ships a sound demonstration, marked pending", () => {
    expect(validateDemonstration(DEMO)).toEqual([]);
    expect(DEMO.pending).toBe(true);
  });

  it("uses the labels exactly, with curly apostrophes as displayed", () => {
    expect(DEMO.steps.map((s) => s.label)).toEqual([
      "Speaker",
      "Listener explains back",
      "Speaker’s rating",
      "Listener explains back again",
      "Speaker’s rating",
    ]);
  });

  it("walks six beats: statement, first try, guess, rating, second try, rating", () => {
    const beats = Array.from({ length: DEMO_BEATS }, (_, b) => demoView(b));
    expect(beats.map((v) => v.current?.round ?? 0)).toEqual([0, 1, 1, 1, 2, 2]);
    expect(beats.map((v) => v.guessing)).toEqual([false, false, true, false, false, false]);
    expect(beats.map((v) => v.ratingShown)).toEqual([false, false, false, true, false, true]);
    expect(beats.map((v) => v.summaries.length)).toEqual([0, 0, 0, 0, 1, 1]);
    expect(beats.map((v) => v.revealedRatings.map((r) => r.value))).toEqual([[], [], [], [4], [4], [4, 9]]);
    expect(beats.map((v) => v.current?.label ?? null)).toEqual([null, "First try", "First try", "First try", "Second try", "Second try"]);
  });

  it("passes a rating that names its rater and what it rates", () => {
    expect(ratingForDisplay({ rater: "Speaker", rates: "explainBack1", value: 4, outOf: 10 })).toEqual({
      rater: "Speaker",
      rates: "explainBack1",
      value: 4,
      outOf: 10,
    });
  });

  it.each([
    ["no rater", { rates: "explainBack1", value: 7, outOf: 10 }],
    ["empty rater", { rater: "", rates: "explainBack1", value: 7, outOf: 10 }],
    ["blank rater", { rater: "   ", rates: "explainBack1", value: 7, outOf: 10 }],
    ["non-string rater", { rater: 1, rates: "explainBack1", value: 7, outOf: 10 }],
    ["no rated step", { rater: "Speaker", value: 7, outOf: 10 }],
    ["unknown rated step", { rater: "Speaker", rates: "vibes", value: 7, outOf: 10 }],
    ["a bare number", 7],
    ["null", null],
    ["out of range", { rater: "Speaker", rates: "explainBack1", value: 11, outOf: 10 }],
    ["fraction", { rater: "Speaker", rates: "explainBack1", value: 6.5, outOf: 10 }],
    ["wrong scale", { rater: "Speaker", rates: "explainBack1", value: 7, outOf: 100 }],
  ])("refuses to hand the page a number with %s", (_, candidate) => {
    expect(ratingForDisplay(candidate)).toBeNull();
  });

  it("fails validation when a rating loses its rater", () => {
    const broken = {
      pending: true,
      steps: DEMO.steps.map((s) =>
        s.kind === "rating" && s.id === "rating2" ? { ...s, rating: { ...s.rating, rater: "" } } : s,
      ),
    } as Demonstration;
    const problems = validateDemonstration(broken);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/^rating2: /);
  });

  it("fails validation when a rating rates a step that is not shown before it", () => {
    const early = {
      pending: true,
      steps: [DEMO.steps[2], DEMO.steps[0], DEMO.steps[1]],
    } as Demonstration;
    expect(validateDemonstration(early)).toEqual(["rating1: rates explainBack1, which is not shown before it"]);
  });

  it("makes the rater a required field of the type", () => {
    // @ts-expect-error `rater` is required: this line must not type-check.
    const noRater: Rating = { rates: "explainBack1", value: 7, outOf: 10 };
    expect(ratingForDisplay(noRater)).toBeNull();
  });
});
