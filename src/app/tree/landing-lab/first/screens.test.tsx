import { describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { CompactContext } from "./compact";
import { DemoScreen, MeaningsScreen } from "./screens";
import { DEMO, DEMO_BEATS, type DemoStep } from "./demo";

const MIRROR = "Try it on something of your own with an AI rehearsal";
const noop = () => {};
const demo = (beat: number, extra: Partial<Parameters<typeof DemoScreen>[0]> = {}) => (
  <DemoScreen beat={beat} guess={null} onGuess={noop} mirrorLink={false} onOpenMirror={noop} {...extra} />
);

describe("Go first demonstration screen", () => {
  it("keeps the made-up caption on every beat, in the caption style, not styled as a field", () => {
    for (let beat = 0; beat < DEMO_BEATS; beat++) {
      const { container, unmount } = render(demo(beat));
      const pending = container.querySelector("[data-pending]");
      expect(pending, `beat ${beat}`).toHaveTextContent("Made-up example");
      expect(pending?.className).toContain("text-[13px]");
      expect(pending?.className).toContain("font-semibold");
      expect(pending?.className).not.toContain("border");
      unmount();
    }
  });

  it("pins the lead and the made-up caption as one compact sticky header on a compact screen", () => {
    const { container } = render(<CompactContext.Provider value>{demo(3)}</CompactContext.Provider>);
    const sticky = container.querySelector("[data-sticky]");
    expect(sticky?.className).toContain("sticky");
    expect(sticky?.className).toContain("border-b");
    expect(sticky?.querySelector("[data-first]")).toHaveTextContent("Speak, explain back, rate it");
    expect(sticky?.querySelector("[data-first]")?.className).toContain("text-[17px]");
    expect(sticky?.querySelector("[data-pending]")).toHaveTextContent("Made-up example");
  });

  it("keeps the statement, the current explain-back and its rating together", () => {
    for (let beat = 1; beat < DEMO_BEATS; beat++) {
      const { container, unmount } = render(demo(beat));
      expect(container.querySelector('[data-demo="statement"]'), `beat ${beat}`).not.toBeNull();
      expect(container.querySelector('[data-demo="explain-back"]'), `beat ${beat}`).not.toBeNull();
      const ratingShown = beat === 3 || beat === 5;
      expect(container.querySelector('[data-demo="rating"]') !== null, `beat ${beat}`).toBe(ratingShown);
      unmount();
    }
  });

  it("labels each try once, inside its card", () => {
    render(demo(1));
    expect(screen.getAllByText("First try")).toHaveLength(1);
    expect(screen.getByText("First try").closest("[data-card]")).not.toBeNull();
  });

  it("asks for a guess between the first explain-back and the first rating", () => {
    const onGuess = vi.fn();
    render(demo(2, { onGuess }));
    expect(screen.getByText("How would the speaker rate this?")).toBeInTheDocument();
    const buttons = screen.getAllByRole("button").filter((b) => /^\d+$/.test(b.textContent ?? ""));
    expect(buttons.map((b) => b.textContent)).toEqual(["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10"]);
    for (const b of buttons) expect(b.className).toContain("h-11");
    expect(screen.queryByTestId("demo-rating")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "7" }));
    expect(onGuess).toHaveBeenCalledWith(7);
  });

  it("shows the visitor's guess and the speaker's rating side by side, the same size, with no verdict", () => {
    const { container } = render(demo(3, { guess: 7 }));
    const mine = screen.getByTestId("demo-guess");
    const theirs = screen.getAllByTestId("demo-rating")[0]!;
    expect(mine).toHaveTextContent("Your guess");
    expect(mine).toHaveTextContent("7 out of 10");
    expect(theirs).toHaveTextContent("Speaker’s rating");
    expect(theirs).toHaveTextContent("4 out of 10");
    expect(mine.parentElement).toBe(theirs.parentElement);
    expect(mine.parentElement?.className).toContain("grid-cols-2");
    const numeral = (el: HTMLElement) => el.querySelector(".tabular-nums")!.className.replace(/text-(slate-300|white)|opacity-\d+/g, "");
    expect(numeral(mine)).toBe(numeral(theirs));
    expect(theirs.querySelector(".tabular-nums")!.className).toContain("text-[28px]");
    expect(theirs.querySelector(".tabular-nums")!.className).toContain("font-semibold");
    expect(container.textContent).not.toMatch(/right|wrong|correct|close|score/i);
    expect(container.innerHTML).not.toMatch(/green|emerald|lime|teal|red-|amber|orange|yellow|purple/);
  });

  it("reveals the speaker's number 400ms after a guess, and at once without the delay", () => {
    vi.useFakeTimers();
    try {
      render(demo(3, { guess: 7, revealDelay: true }));
      const numeral = () => screen.getAllByTestId("demo-rating")[0]!.querySelector(".tabular-nums")!;
      expect(numeral().className).toContain("opacity-0");
      act(() => {
        vi.advanceTimersByTime(399);
      });
      expect(numeral().className).toContain("opacity-0");
      act(() => {
        vi.advanceTimersByTime(1);
      });
      expect(numeral().className).toContain("opacity-100");
    } finally {
      vi.useRealTimers();
    }
    const { container } = render(demo(3, { guess: 7, revealDelay: false }));
    expect(container.querySelector('[data-testid="demo-rating"] .tabular-nums')!.className).toContain("opacity-100");
  });

  it("shows only the speaker's rating when the visitor pressed Next without guessing", () => {
    render(demo(3, { guess: null }));
    expect(screen.queryByTestId("demo-guess")).toBeNull();
    expect(screen.queryByText(/Your guess/)).toBeNull();
    expect(screen.getAllByTestId("demo-rating")).toHaveLength(1);
  });

  it("lays the guess chips in two full-width rows, 0 to 5 then 6 to 10, each at least 44px", () => {
    const { container } = render(demo(2));
    const rows = [...container.querySelectorAll("[data-guess] [role=group] > div")];
    expect(rows.map((r) => [...r.querySelectorAll("button")].map((b) => b.textContent))).toEqual([
      ["0", "1", "2", "3", "4", "5"],
      ["6", "7", "8", "9", "10"],
    ]);
    expect(rows[0]!.className).toContain("grid-cols-6");
    expect(rows[1]!.className).toContain("grid-cols-5");
    for (const b of container.querySelectorAll("[data-guess] button")) {
      expect(b.className).toContain("h-11");
      expect(b.className).toContain("min-w-11");
    }
  });

  it("folds the first try to one line once the second try starts: label left, rating right", () => {
    const { container } = render(demo(4, { guess: 7 }));
    const summary = container.querySelector("[data-summary]")!;
    expect(summary.className).toContain("whitespace-nowrap");
    expect(summary.className).toContain("justify-between");
    expect(summary.firstElementChild).toHaveTextContent("First try");
    expect(summary.lastElementChild).toHaveTextContent("Speaker’s rating4out of 10");
    expect(summary).not.toHaveTextContent("Your guess");
    expect(screen.getByText("Second try")).toBeInTheDocument();
    expect(screen.queryByText("So you’re behind schedule, and you need a few more days to catch up.")).toBeNull();
  });

  it("never lets the label dot dangle: a long try label goes on two lines with no dot", () => {
    const { container } = render(demo(4));
    const card = container.querySelector('[data-demo="explain-back"]')!;
    expect(card.querySelector(".rounded-full")).toBeNull();
    expect(card).toHaveTextContent("Second tryListener explains back again");
    const first = render(demo(1)).container.querySelector('[data-demo="explain-back"]')!;
    expect(first.querySelector(".rounded-full")).not.toBeNull();
    expect(first.firstElementChild!.className).toContain("whitespace-nowrap");
  });

  it("keeps each number and its 'out of 10' in one unbreakable line", () => {
    render(demo(5));
    for (const r of screen.getAllByTestId("demo-rating")) {
      const line = r.querySelector(".whitespace-nowrap") ?? r;
      expect(line.textContent?.replace("Speaker’s rating", "")).toMatch(/^\d+ ?out of 10$/);
    }
  });

  it("names the rater of every number it shows", () => {
    render(demo(5));
    const ratings = screen.getAllByTestId("demo-rating");
    expect(ratings).toHaveLength(2);
    for (const r of ratings) expect(r.dataset.rater).toBe("Speaker");
  });

  it("renders no number for a rating whose rater is missing", () => {
    const steps = DEMO.steps as DemoStep[];
    const original = steps[2];
    if (original?.kind !== "rating") throw new Error("fixture: step 3 is the first rating");
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    steps[2] = { ...original, rating: { ...original.rating, rater: "" } };
    try {
      render(demo(3));
      expect(screen.queryByTestId("demo-rating")).toBeNull();
      expect(screen.queryByText(String(original.rating.value))).toBeNull();
    } finally {
      steps[2] = original;
      spy.mockRestore();
    }
  });

  it("marks exactly one newest element per beat: the statement, then the current try, never the mirror link", () => {
    for (let beat = 0; beat < DEMO_BEATS; beat++) {
      const { container, unmount } = render(demo(beat, { mirrorLink: true }));
      const newest = container.querySelectorAll("[data-newest]");
      expect(newest, `beat ${beat}`).toHaveLength(1);
      // Beat 0: the statement. The guess beat: the card and the chips together. Else the card.
      const expected = beat === 0 ? '[data-demo="statement"]' : beat === 2 ? ":has(> [data-card]):has(> [data-guess])" : "[data-card]";
      expect(newest[0]!.matches(expected), `beat ${beat}`).toBe(true);
      expect(newest[0]).not.toHaveTextContent(MIRROR);
      unmount();
    }
  });

  it("shows the mirror link only when allowed, and only at the end", () => {
    const { rerender } = render(demo(5));
    expect(screen.queryByText(MIRROR)).toBeNull();
    rerender(demo(4, { mirrorLink: true }));
    expect(screen.queryByText(MIRROR)).toBeNull();
    rerender(demo(5, { mirrorLink: true }));
    expect(screen.getByText(MIRROR)).toBeInTheDocument();
  });
});

describe("Go first meanings screen", () => {
  it("lists the three meanings with bold labels, the third in full white, no edge rule", () => {
    const { container } = render(<MeaningsScreen />);
    const items = container.querySelectorAll("li");
    expect(items).toHaveLength(3);
    expect(items[0]!.className).toContain("text-white/70");
    expect(items[1]!.className).toContain("text-white/70");
    expect(items[2]!.className).toContain("text-white");
    expect(items[2]!.className).not.toContain("text-white/70");
    for (const li of items) {
      expect(li.querySelector("strong")?.textContent?.endsWith(":")).toBe(true);
      expect(li.className).not.toContain("border-l");
    }
    expect(container.querySelector("[data-first]")?.textContent).toContain("has at least three meanings.");
  });
});
