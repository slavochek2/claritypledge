import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ClarityPageLoader } from "./clarity-loader";
import { InShellContentContext } from "./loader-context";

// P1586 invariant: a wait that never ends becomes a readable state. The page loader owns the one
// deadline for every page-level wait; the page stops rendering it when its data arrives.
const DEADLINE_MS = 15_000;

describe("ClarityPageLoader deadline (P1586)", () => {
  const reload = vi.fn();
  const realLocation = window.location;

  beforeEach(() => {
    vi.useFakeTimers();
    reload.mockReset();
    Object.defineProperty(window, "location", { configurable: true, value: { ...realLocation, reload } });
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    Object.defineProperty(window, "location", { configurable: true, value: realLocation });
  });

  for (const [name, inShell] of [["boot", false], ["content", true]] as const) {
    describe(`${name} form`, () => {
      const ui = () => (
        <InShellContentContext.Provider value={inShell}>
          <ClarityPageLoader />
        </InShellContentContext.Provider>
      );

      it("shows no text before the deadline", () => {
        const { container } = render(ui());
        act(() => { vi.advanceTimersByTime(DEADLINE_MS - 1); });
        expect(container.querySelector("p")).toBeNull();
        expect(screen.queryByRole("button", { name: "Reload" })).toBeNull();
      });

      it("shows a readable line and a Reload button after the deadline, anti-flash class intact", () => {
        const { container } = render(ui());
        act(() => { vi.advanceTimersByTime(DEADLINE_MS); });
        expect(container.querySelector("p")?.textContent?.length).toBeGreaterThan(0);
        expect(screen.getByRole("button", { name: "Reload" })).toBeTruthy();
        expect((container.firstElementChild as HTMLElement).classList.contains("clarity-page-loader")).toBe(true);
        // the mark is still the same element, still in its viewport-centred box
        expect(screen.getByRole("img", { name: "Loading" })).toBeTruthy();
      });

      it("Reload reloads the page", () => {
        render(ui());
        act(() => { vi.advanceTimersByTime(DEADLINE_MS); });
        fireEvent.click(screen.getByRole("button", { name: "Reload" }));
        expect(reload).toHaveBeenCalledTimes(1);
      });

      it("the deadline never re-renders the loader before it fires", () => {
        const { container } = render(ui());
        const before = container.innerHTML;
        act(() => { vi.advanceTimersByTime(DEADLINE_MS - 1); });
        expect(container.innerHTML).toBe(before);
      });

      it("stops when the page stops rendering the loader (no late timer)", () => {
        const { unmount } = render(ui());
        unmount();
        expect(vi.getTimerCount()).toBe(0);
      });
    });
  }
});

describe("ClarityPageLoader deadline across a loader chain (P1586)", () => {
  beforeEach(() => { vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance", "Date"] }); });
  afterEach(() => { cleanup(); vi.useRealTimers(); });

  // Loaders that replace each other (guard -> chunk -> page -> redirect target) are one wait: the
  // deadline counts from the run's start, so a chain of fresh loaders cannot postpone it forever.
  it("a loader that continues a 10s run shows the notice 5s later, not 15s later", () => {
    const first = render(<ClarityPageLoader />);
    act(() => { vi.advanceTimersByTime(10_000); });
    const second = render(<ClarityPageLoader />); // mounts while the first is still on screen
    first.unmount();
    act(() => { vi.advanceTimersByTime(4_900); });
    expect(second.queryByRole("button", { name: "Reload" })).toBeNull();
    act(() => { vi.advanceTimersByTime(200); });
    expect(second.getByRole("button", { name: "Reload" })).toBeTruthy();
  });
});
