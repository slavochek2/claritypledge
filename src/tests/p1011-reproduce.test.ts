// P1011 canary — errors THROWN BY browser-extension code reach Sentry as
// application errors. Fixture is modeled on the real prod event
// JAVASCRIPT-REACT-2P: a TypeError whose throw-site frames are
// `<obscura:bootstrap>` / `ext:core/01_core.js` — origins no app build can
// produce. Not message-matchable (the message is a bare TypeError string a real
// bug could produce verbatim), hence a frame filter rather than an
// `ignoreErrors` pattern, per the guidance in sentry-filters.ts's own header.
//
// Pre-fix the "drops" cases fail. The "KEEPS" cases are false-positive guards —
// they are what stops this filter from swallowing real bugs, and they are the
// tests that matter most here, since the failure mode of an over-broad filter is
// silence rather than noise.
import { describe, it, expect, vi } from "vitest";
import type { ErrorEvent } from "@sentry/react";
import { dropBrowserExtensionNoise } from "@/lib/sentry-filters";

vi.mock("@sentry/react", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  addBreadcrumb: vi.fn(),
}));

/** One exception value with the given frames, ordered oldest-caller → throw-site. */
function value(filenames: string[], type = "TypeError") {
  return {
    type,
    value: "Cannot read properties of undefined (reading 'prototype')",
    stacktrace: { frames: filenames.map((filename) => ({ filename })) },
  };
}

function eventWithValues(...values: ReturnType<typeof value>[]): ErrorEvent {
  return { exception: { values } } as unknown as ErrorEvent;
}

const eventWithFrames = (filenames: string[]) =>
  eventWithValues(value(filenames));

describe("p1011: extension-thrown errors are dropped before Sentry", () => {
  it("drops the JAVASCRIPT-REACT-2P stack (throw-site is <obscura:bootstrap>)", () => {
    const event = eventWithFrames([
      "ext:core/01_core.js",
      "/assets/index-DXSpBDYs.js",
      "<obscura:bootstrap>",
    ]);
    expect(dropBrowserExtensionNoise(event)).toBeNull();
  });

  it.each([
    "chrome-extension://abcdefghijklmnop/injected.js",
    "moz-extension://11111111-2222-3333-4444-555555555555/content.js",
    "safari-web-extension://DEADBEEF/script.js",
    "ext:core/01_core.js",
  ])("drops an error thrown at %s", (filename) => {
    expect(dropBrowserExtensionNoise(eventWithFrames([filename]))).toBeNull();
  });

  it("leaves a breadcrumb on every drop, so over-suppression stays discoverable", async () => {
    const { addBreadcrumb } = await import("@sentry/react");
    vi.mocked(addBreadcrumb).mockClear();

    dropBrowserExtensionNoise(eventWithFrames(["<obscura:bootstrap>"]));

    expect(addBreadcrumb).toHaveBeenCalledWith(
      expect.objectContaining({
        category: "sentry-event-suppressed",
        data: expect.objectContaining({
          reason: "extension-frame",
          origin: "<obscura:bootstrap>",
        }),
      })
    );
  });
});

describe("p1011: false-positive guards — real bugs must still report", () => {
  // The whole reason for keying on the throw site rather than "any frame".
  it("KEEPS a real app error that merely passed through an extension wrapper", () => {
    const event = eventWithFrames([
      "chrome-extension://abcdefghijklmnop/fetch-patch.js",
      "/assets/index-DXSpBDYs.js",
    ]);
    expect(dropBrowserExtensionNoise(event)).toBe(event);
  });

  // The reason for keying on the last VALUE rather than "any value": the app-level
  // wrapper has its own app-frame stack and is real signal about our handling.
  it("KEEPS an app error whose Error.cause originated in an extension", () => {
    const event = eventWithValues(
      value(["chrome-extension://abcdefghijklmnop/injected.js"]),
      value(["/assets/letters-page-CW5wsHEN.js"], "Error")
    );
    expect(dropBrowserExtensionNoise(event)).toBe(event);
  });

  it("KEEPS an ordinary application error", () => {
    const event = eventWithFrames([
      "/assets/index-DXSpBDYs.js",
      "/assets/letters-page-CW5wsHEN.js",
    ]);
    expect(dropBrowserExtensionNoise(event)).toBe(event);
  });

  it("KEEPS an event with no stacktrace rather than dropping it blind", () => {
    const event = { exception: { values: [{ type: "Error" }] } } as ErrorEvent;
    expect(dropBrowserExtensionNoise(event)).toBe(event);
  });

  it("KEEPS a non-exception event (message capture)", () => {
    const event = { message: "something happened" } as ErrorEvent;
    expect(dropBrowserExtensionNoise(event)).toBe(event);
  });
});
