import { describe, expect, it } from "vitest";
import { focusTarget, keyAction, type FocusTarget } from "./keys";

const ADVANCE = [" ", "Enter", "ArrowDown"] as const;

describe("Go first keyboard rule", () => {
  it.each(ADVANCE)("%j advances when focus is on the page body", (key) => {
    expect(keyAction({ key, focus: "body" })).toBe("advance");
  });

  it("the down arrow advances from Next; Enter and Space are left to the button itself", () => {
    expect(keyAction({ key: "ArrowDown", focus: "next" })).toBe("advance");
    expect(keyAction({ key: "Enter", focus: "next" })).toBe("native");
    expect(keyAction({ key: " ", focus: "next" })).toBe("native");
  });

  it.each(ADVANCE)("%j does not advance when focus is anywhere else", (key) => {
    expect(keyAction({ key, focus: "other" })).toBe("ignore");
  });

  it.each(["ArrowUp", "ArrowRight", "PageDown", "Tab", "Escape", "a"])("%j never advances", (key) => {
    for (const focus of ["body", "next", "other"] as FocusTarget[]) {
      expect(keyAction({ key, focus })).toBe("ignore");
    }
  });

  it("ignores modified and repeating keys", () => {
    expect(keyAction({ key: " ", focus: "body", shiftKey: true })).toBe("ignore");
    expect(keyAction({ key: "ArrowDown", focus: "body", altKey: true })).toBe("ignore");
    expect(keyAction({ key: "Enter", focus: "body", metaKey: true })).toBe("ignore");
    expect(keyAction({ key: "Enter", focus: "body", ctrlKey: true })).toBe("ignore");
    expect(keyAction({ key: "ArrowDown", focus: "body", repeat: true })).toBe("ignore");
  });

  it("classifies focus against the real document", () => {
    const nextBtn = document.createElement("button");
    const forkBtn = document.createElement("button");
    const field = document.createElement("textarea");
    document.body.append(nextBtn, forkBtn, field);
    expect(focusTarget(document.body, document, nextBtn)).toBe("body");
    expect(focusTarget(null, document, nextBtn)).toBe("body");
    expect(focusTarget(nextBtn, document, nextBtn)).toBe("next");
    expect(focusTarget(forkBtn, document, nextBtn)).toBe("other");
    expect(focusTarget(field, document, nextBtn)).toBe("other");
    // With no Next on screen, a button is never mistaken for it.
    expect(focusTarget(nextBtn, document, null)).toBe("other");
    nextBtn.remove();
    forkBtn.remove();
    field.remove();
  });
});
