import { describe, expect, it } from "vitest";
import { INVITE_PATH, composeHostInvite, type PilotDraft } from "./invite";

const TOPIC = "Our release planning meeting where nobody says the date is fake";

const draft: PilotDraft = {
  conversation: TOPIC,
  roles: "two engineers and their product lead",
  contact: "someone@example.com",
  size: "51 to 250 people",
};

describe("Go first forwarded invitation", () => {
  it("links to the journey and nowhere else", () => {
    const { url } = composeHostInvite("https://example.test", draft);
    const u = new URL(url);
    expect(u.origin).toBe("https://example.test");
    expect(u.pathname).toBe(INVITE_PATH);
    expect(u.search).toBe("");
    expect(u.hash).toBe("");
  });

  it("carries no topic, and nothing else from the pilot draft, in the link or the message", () => {
    const invite = composeHostInvite("https://example.test", draft);
    const all = `${invite.url}\n${invite.text}`;
    const decoded = decodeURIComponent(all);
    for (const field of Object.values(draft)) {
      expect(all).not.toContain(field);
      expect(decoded).not.toContain(field);
    }
    // Not even single words of the topic: a whole-phrase check alone would miss a partial leak.
    for (const word of ["release", "planning", "fake"]) {
      expect(decoded.toLowerCase()).not.toContain(word);
    }
  });

  it("is identical with or without a draft", () => {
    expect(composeHostInvite("https://example.test", draft)).toEqual(composeHostInvite("https://example.test"));
  });
});
