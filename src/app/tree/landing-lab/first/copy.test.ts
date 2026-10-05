import { describe, expect, it } from "vitest";
import { FOUNDER } from "../content";
import { DECK_TEXT, FOUNDER_DECK, PROPOSALS, STORY, STORY_TEXT, TEXT, curly, display, displayUrlParts, keepQuoteTogether, sentences } from "./copy";

describe("Go first copy", () => {
  it("cuts story beats out of the founder's st1 text verbatim", () => {
    for (const beat of [STORY.askedThem, STORY.saidYes, STORY.daysLater]) {
      expect(FOUNDER.st1[0]).toContain(beat);
    }
    expect(STORY.askedThem).toBe("I asked them if they think I understand them.");
    expect(STORY.saidYes).toBe("They said: yes.");
    expect(STORY.daysLater).toBe("Days later, they said I didn't understand them.");
    expect(FOUNDER.st1[1]).toContain(STORY.threeMeanings);
    expect(STORY.threeMeanings.endsWith("has at least three meanings.")).toBe(true);
  });

  it("splits sentences without changing a character", () => {
    for (const paragraph of FOUNDER.st1) {
      expect(sentences(paragraph).join(" ")).toBe(paragraph);
    }
  });

  it("keeps PROPOSALS a flat list of non-empty strings", () => {
    for (const [key, value] of Object.entries(PROPOSALS)) {
      expect(typeof value, key).toBe("string");
      expect(value.trim(), key).not.toBe("");
    }
  });

  it("keeps “I don’t together at render time without rewording anything else", () => {
    for (const text of [STORY.headline, FOUNDER_DECK.noSocialNorm]) {
      const shown = keepQuoteTogether(text);
      expect(shown).toContain("“I\u00A0don’t");
      expect(shown.replace("\u00A0", " ")).toBe(text);
    }
    expect(keepQuoteTogether("no quote here")).toBe("no quote here");
  });

  it("uses the founder's hidden-number sentence above the fork, verbatim, and keeps the old line unused", () => {
    expect(STORY.hiddenNumber).toBe(FOUNDER.hiddenNumber);
    expect(STORY_TEXT.hiddenNumber).toBe(curly(FOUNDER.hiddenNumber));
    expect(PROPOSALS.forkLineAlt).toBe("Making it safe to admit misunderstanding starts when someone goes first.");
    expect("forkLine" in PROPOSALS).toBe(false);
  });

  it("changes only typography for display: curly apostrophes, the quote kept together", () => {
    const straightBack = (t: string) => t.replace(/’/g, "'").replace(/\u00A0/g, " ");
    for (const [key, raw] of Object.entries(PROPOSALS)) {
      const shown = TEXT[key as keyof typeof TEXT];
      expect(shown, key).not.toContain("'");
      expect(straightBack(shown), key).toBe(raw.replace(/’/g, "'"));
    }
    expect(STORY_TEXT.daysLater).toBe("Days later, they said I didn’t understand them.");
    expect(DECK_TEXT.pointAText).toBe("you can’t reveal the gaps in understanding");
    expect(display(STORY.headline)).toContain("“I\u00A0don’t");
  });

  it("puts no full stop on a label or a button", () => {
    const labels = [
      "next", "back", "skip", "demoPending", "demoRound1", "demoRound2", "demoExplainBack", "demoSecondExplainBack",
      "demoYourGuess", "mirrorLink", "forkQuestion", "routeWork", "routeOne", "routeRoom", "routeExamples", "workYes", "workNo",
      "workFormTitle", "oneCta", "roomChiangMai", "roomElsewhere", "demoLabelCompact", "examplesFilm", "examplesFeed",
      "mirrorInputLabel", "mirrorReturn", "mirrorAttempt", "previewButton", "inviteShare", "inviteCopy",
    ] as const;
    for (const key of labels) expect(PROPOSALS[key].endsWith("."), key).toBe(false);
  });

  it("shows the deck's OBSTACLE in sentence case without changing the stored value", () => {
    expect(FOUNDER_DECK.obstacle).toBe("OBSTACLE");
    expect(DECK_TEXT.obstacle).toBe("Obstacle");
  });

  it("shows a link without its protocol, breakable only after a slash", () => {
    expect(displayUrlParts("https://example.test/tree/landing-first")).toEqual(["example.test/", "tree/", "landing-first"]);
    expect(displayUrlParts("http://localhost:5847/tree/landing-first").join("")).toBe("localhost:5847/tree/landing-first");
  });
});
