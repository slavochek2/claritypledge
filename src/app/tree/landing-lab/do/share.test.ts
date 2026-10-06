import { describe, expect, it } from "vitest";
import {
  MAX_HASH_CHARS,
  MAX_INTERVAL_MS,
  MAX_NAME_CHARS,
  MAX_TAPS,
  MIN_INTERVAL_MS,
  decodeShareHash,
  encodeShareHash,
  guessMatches,
} from "./share";

const b64url = (s: string) =>
  btoa(String.fromCharCode(...new TextEncoder().encode(s))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const hashOf = (obj: unknown) => `#listen=${b64url(JSON.stringify(obj))}`;

describe("landing Do share link", () => {
  it("round-trips taps and a unicode song name", () => {
    const hash = encodeShareHash([300, 300, 600, 300, 300], "Frère Jacques");
    expect(hash).not.toBeNull();
    expect(hash).not.toContain("Jacques");
    expect(decodeShareHash(hash ?? "")).toEqual({ intervals: [300, 300, 600, 300, 300], song: "Frère Jacques" });
  });

  it("refuses to encode too few taps or an empty name", () => {
    expect(encodeShareHash([300, 300], "Song")).toBeNull();
    expect(encodeShareHash([300, 300, 300, 300, 300], "   ")).toBeNull();
  });

  it.each([
    ["empty", ""],
    ["other hash", "#top"],
    ["not base64", "#listen=@@@"],
    ["not json", `#listen=${b64url("nope")}`],
    ["wrong version", hashOf({ v: 2, t: [1, 1, 1, 1, 1], s: "x" })],
    ["taps not array", hashOf({ v: 1, t: "x", s: "x" })],
    ["non-number tap", hashOf({ v: 1, t: [1, 1, 1, 1, "1"], s: "x" })],
    ["too few taps", hashOf({ v: 1, t: [1, 1], s: "x" })],
    ["blank name", hashOf({ v: 1, t: [1, 1, 1, 1, 1], s: " \u0000 " })],
    ["oversized", `#listen=${"A".repeat(MAX_HASH_CHARS)}`],
  ])("decodes %s to null", (_, hash) => {
    expect(decodeShareHash(hash)).toBeNull();
  });

  it("clamps intervals, caps taps and caps the name", () => {
    const decoded = decodeShareHash(
      hashOf({ v: 1, t: [1, 99999, ...Array(200).fill(250)], s: "<b>x</b>\u0007" + "y".repeat(200) }),
    );
    expect(decoded?.intervals.length).toBe(MAX_TAPS - 1);
    expect(decoded?.intervals[0]).toBe(MIN_INTERVAL_MS);
    expect(decoded?.intervals[1]).toBe(MAX_INTERVAL_MS);
    expect(Array.from(decoded?.song ?? "").length).toBe(MAX_NAME_CHARS);
    expect(decoded?.song.startsWith("<b>x</b>y")).toBe(true);
  });

  it("matches guesses loosely", () => {
    expect(guessMatches("happy birthday to you", "Happy Birthday")).toBe(true);
    expect(guessMatches("Jingle Bells!", "jingle bells")).toBe(true);
    expect(guessMatches("bells", "Jingle Bells")).toBe(true);
    expect(guessMatches("yes", "Yesterday")).toBe(false);
    expect(guessMatches("Let It Be", "Hey Jude")).toBe(false);
  });
});
