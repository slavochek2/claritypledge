// P988 canary — two independent gaps found during a Sentry backlog triage.
//
// Gap 1: errors thrown by code injected into our page by a host browser reach
//   Sentry as application errors. Fixtures are modeled on real prod events
//   (JAVASCRIPT-REACT-2C, -2M, -2N): the Telegram in-app browser injects its
//   Mini Apps SDK on /events/* links opened from a chat, and a browser
//   extension calls runtime.sendMessage. Neither string exists in our source
//   (`grep -rn "Method not found" src/ supabase/` → no hits; `postEvent` → no
//   hits; no Telegram package in package.json).
//
// Gap 2: ChunkErrorBoundary did not recognise Vite's "Unable to preload CSS
//   for" (JAVASCRIPT-REACT-2G on /manifesto), so a stale-deploy CSS preload
//   failure showed a generic error screen instead of the reload prompt.
//
// Pre-fix these fail 4/9 — one per symptom. The remaining 5 are no-regression
// and false-positive guards that must pass in both states.
import { describe, it, expect } from "vitest";
import { isIgnoredMessage } from "@/lib/sentry-filters";
import { isChunkErrorMessage } from "@/lib/chunk-error";

describe("p988 gap 1: injected third-party errors are dropped before Sentry", () => {
  it("drops the Telegram Mini Apps SDK postEvent throw", () => {
    expect(isIgnoredMessage("Error invoking postEvent: Method not found")).toBe(
      true
    );
  });

  it("drops the bare 'Method not found' throw from the injected SDK", () => {
    expect(isIgnoredMessage("Method not found")).toBe(true);
  });

  it("drops the browser-extension runtime.sendMessage throw", () => {
    expect(
      isIgnoredMessage("Invalid call to runtime.sendMessage(). Tab not found.")
    ).toBe(true);
  });

  // Guards the one pattern with real false-positive risk. "Method not found" is
  // a generic JSON-RPC-style string; anchoring it means a future dependency
  // that suffixes it onto a real error still reports.
  it("does NOT drop an application error that merely ends in 'Method not found'", () => {
    expect(isIgnoredMessage("DB error in getFoo: Method not found")).toBe(false);
  });

  it("does NOT drop an unrelated real application error", () => {
    expect(isIgnoredMessage("DB error in getInboxItems: JWT expired")).toBe(
      false
    );
  });

  it("still drops the pre-existing noise patterns (no regression)", () => {
    expect(isIgnoredMessage("indexedDB.open failed")).toBe(true);
    expect(
      isIgnoredMessage("Object Not Found Matching Id:4, MethodName:update")
    ).toBe(true);
  });
});

describe("p988 gap 2: CSS preload failure is treated as a stale-deploy chunk error", () => {
  it("recognises Vite's 'Unable to preload CSS for' message", () => {
    expect(
      isChunkErrorMessage("Unable to preload CSS for /assets/katex-Ceawqfpt.css")
    ).toBe(true);
  });

  it("still recognises the four pre-existing chunk messages (no regression)", () => {
    expect(
      isChunkErrorMessage(
        "Failed to fetch dynamically imported module: https://claritypledge.com/assets/x.js"
      )
    ).toBe(true);
    expect(isChunkErrorMessage("Loading chunk 42 failed")).toBe(true);
    expect(isChunkErrorMessage("Loading CSS chunk 7 failed")).toBe(true);
    expect(isChunkErrorMessage("Importing a module script failed")).toBe(true);
  });

  it("does NOT treat an ordinary application error as a chunk error", () => {
    expect(
      isChunkErrorMessage("Cannot read properties of undefined (reading 'id')")
    ).toBe(false);
  });
});
