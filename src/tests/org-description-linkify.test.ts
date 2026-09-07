import { describe, it, expect } from "vitest";
import { splitTrailingPunctuation } from "@/lib/linkify";

/**
 * Guards the two failure modes a character-class-only linkifier cannot hold at
 * once. Both were live defects: the first shipped to the Chiang Mai group page
 * (a 404 on the public repo link), the second was found by adversarial review
 * before it could.
 */
describe("splitTrailingPunctuation", () => {
  it("strips a sentence-ending full stop that is not part of the address", () => {
    expect(splitTrailingPunctuation("https://github.com/slavochek2/claritypledge."))
      .toEqual(["https://github.com/slavochek2/claritypledge", "."]);
  });

  it("keeps a balanced closing bracket that IS part of the address", () => {
    expect(splitTrailingPunctuation("https://en.wikipedia.org/wiki/Foo_(bar)"))
      .toEqual(["https://en.wikipedia.org/wiki/Foo_(bar)", ""]);
  });

  it("strips an unbalanced closing bracket belonging to the prose", () => {
    expect(splitTrailingPunctuation("https://x.com/a)"))
      .toEqual(["https://x.com/a", ")"]);
  });

  it("strips a run of trailing punctuation, outermost last", () => {
    expect(splitTrailingPunctuation("https://x.com/a)."))
      .toEqual(["https://x.com/a", ")."]);
  });

  it("leaves an ordinary URL untouched", () => {
    expect(splitTrailingPunctuation("https://x.com/a/b?c=1#d"))
      .toEqual(["https://x.com/a/b?c=1#d", ""]);
  });
});
