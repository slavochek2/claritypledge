// P882: Sentry noise — unhandled "Error: Rejected" from PWA service-worker registration.
// The message is literally "Rejected", so message-based ignoreErrors can't catch it —
// the serviceWorker/registerSW context only appears in stack frames.
// Canary: a fixture event modeled on Sentry event 17fa2d36497c42bebb18eb0efa1770e6
// must be dropped by beforeSend; real application errors must pass through unchanged.
import { describe, it, expect } from "vitest";
import type { ErrorEvent } from "@sentry/react";
import { dropServiceWorkerRegistrationNoise } from "@/lib/sentry-filters";

// Modeled on the real prod event: unhandledrejection, message "Rejected",
// stack frames pointing at the vite-plugin-pwa generated /registerSW.js
// (plus injected harness frame wrsParams.serviceWorkers.navigator.serviceWorker.register).
const swRejectionEvent = {
  exception: {
    values: [
      {
        type: "Error",
        value: "Rejected",
        mechanism: {
          type: "auto.browser.global_handlers.onunhandledrejection",
          handled: false,
        },
        stacktrace: {
          frames: [
            {
              filename: "https://claritypledge.com/registerSW.js",
              abs_path: "https://claritypledge.com/registerSW.js",
              function: "?",
            },
            {
              filename: "<anonymous>",
              abs_path: "<anonymous>",
              function:
                "wrsParams.serviceWorkers.navigator.serviceWorker.register",
            },
          ],
        },
      },
    ],
  },
} as unknown as ErrorEvent;

const realAppError = {
  exception: {
    values: [
      {
        type: "TypeError",
        value: "Cannot read properties of undefined (reading 'id')",
        stacktrace: {
          frames: [
            {
              filename: "https://claritypledge.com/assets/index-abc123.js",
              abs_path: "https://claritypledge.com/assets/index-abc123.js",
              function: "ProfilePage",
            },
          ],
        },
      },
    ],
  },
} as unknown as ErrorEvent;

describe("p882: beforeSend drops SW registration rejection noise", () => {
  it("drops an event whose stack frames include /registerSW.js", () => {
    expect(dropServiceWorkerRegistrationNoise(swRejectionEvent)).toBeNull();
  });

  it("drops the event when ONLY the function field names serviceWorker.register (no filename/abs_path)", () => {
    const harnessOnly = {
      exception: {
        values: [
          {
            type: "Error",
            value: "Rejected",
            stacktrace: {
              frames: [
                {
                  filename: "",
                  abs_path: "",
                  function:
                    "wrsParams.serviceWorkers.navigator.serviceWorker.register",
                },
              ],
            },
          },
        ],
      },
    } as unknown as ErrorEvent;
    expect(dropServiceWorkerRegistrationNoise(harnessOnly)).toBeNull();
  });

  it("drops via abs_path alone when filename is absent (source-mapped frames)", () => {
    const absPathOnly = {
      exception: {
        values: [
          {
            type: "Error",
            value: "Rejected",
            stacktrace: {
              frames: [
                {
                  abs_path: "https://claritypledge.com/registerSW.js",
                  function: "?",
                },
              ],
            },
          },
        ],
      },
    } as unknown as ErrorEvent;
    expect(dropServiceWorkerRegistrationNoise(absPathOnly)).toBeNull();
  });

  it("drops when the SW frame is in a later entry of a multi-value exception array", () => {
    const multiValue = {
      exception: {
        values: [
          {
            type: "Error",
            value: "wrapper",
            stacktrace: {
              frames: [
                {
                  filename: "https://claritypledge.com/assets/index-abc123.js",
                  function: "wrapper",
                },
              ],
            },
          },
          {
            type: "Error",
            value: "Rejected",
            stacktrace: {
              frames: [
                {
                  filename: "https://claritypledge.com/registerSW.js",
                  function: "?",
                },
              ],
            },
          },
        ],
      },
    } as unknown as ErrorEvent;
    expect(dropServiceWorkerRegistrationNoise(multiValue)).toBeNull();
  });

  it("passes an app error whose function name merely contains 'serviceWorker' (not .register)", () => {
    const appSwAdjacent = {
      exception: {
        values: [
          {
            type: "TypeError",
            value: "boom",
            stacktrace: {
              frames: [
                {
                  filename: "https://claritypledge.com/assets/index-abc123.js",
                  abs_path: "https://claritypledge.com/assets/index-abc123.js",
                  function: "initServiceWorkerStatus",
                },
              ],
            },
          },
        ],
      },
    } as unknown as ErrorEvent;
    expect(dropServiceWorkerRegistrationNoise(appSwAdjacent)).toBe(
      appSwAdjacent
    );
  });

  it("passes a real application error through unchanged", () => {
    expect(dropServiceWorkerRegistrationNoise(realAppError)).toBe(realAppError);
  });

  it("passes an event with no exception data through unchanged", () => {
    const messageOnly = { message: "plain message" } as unknown as ErrorEvent;
    expect(dropServiceWorkerRegistrationNoise(messageOnly)).toBe(messageOnly);
  });
});
