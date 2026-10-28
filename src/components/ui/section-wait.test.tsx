import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { SectionWait } from "./section-wait";

// P1586 invariant: a section wait that never ends becomes a readable line with a Retry.
const DEADLINE_MS = 10_000;

describe("SectionWait (P1586)", () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { cleanup(); vi.useRealTimers(); });

  const ui = (onRetry = vi.fn()) => (
    <SectionWait onRetry={onRetry}><div data-testid="skel">skeleton</div></SectionWait>
  );

  it("shows the skeleton before the deadline and no Retry", () => {
    render(ui());
    act(() => { vi.advanceTimersByTime(DEADLINE_MS - 1); });
    expect(screen.getByTestId("skel")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Retry" })).toBeNull();
  });

  it("swaps to a readable line and Retry after the deadline", () => {
    render(ui());
    act(() => { vi.advanceTimersByTime(DEADLINE_MS); });
    expect(screen.queryByTestId("skel")).toBeNull();
    expect(screen.getByRole("status").textContent?.length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Retry" })).toBeTruthy();
  });

  it("Retry calls onRetry, brings the skeleton back and restarts the deadline", () => {
    const onRetry = vi.fn();
    render(ui(onRetry));
    act(() => { vi.advanceTimersByTime(DEADLINE_MS); });
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("skel")).toBeTruthy();
    act(() => { vi.advanceTimersByTime(DEADLINE_MS - 1); });
    expect(screen.getByTestId("skel")).toBeTruthy();
    act(() => { vi.advanceTimersByTime(1); });
    expect(screen.getByRole("button", { name: "Retry" })).toBeTruthy();
  });

  it("a re-mount starts a fresh deadline and unmounting clears the timer", () => {
    const { unmount } = render(ui());
    act(() => { vi.advanceTimersByTime(DEADLINE_MS - 1); });
    unmount();
    expect(vi.getTimerCount()).toBe(0);
    render(ui());
    act(() => { vi.advanceTimersByTime(DEADLINE_MS - 1); });
    expect(screen.getByTestId("skel")).toBeTruthy();
  });
});
