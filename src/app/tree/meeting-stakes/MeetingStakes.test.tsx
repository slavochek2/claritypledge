/** The /tree/meeting-stakes flow as a host walks it: nothing pre-set, Continue names what is missing, the impact. */
import { beforeAll, describe, expect, it } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { MeetingStakes } from "./MeetingStakes";

beforeAll(() => {
  // jsdom lays nothing out, so it has neither.
  Element.prototype.scrollIntoView = () => {};
  window.scrollTo = () => {};
});

const click = (name: string) => fireEvent.click(screen.getByRole("button", { name }));
const heading = () => document.getElementById("step-title")?.textContent;
const bar = (name: string) => screen.getByRole("radiogroup", { name });
const set = (name: string, level: number) => fireEvent.click(within(bar(name)).getByRole("radio", { name: new RegExp(`^${level} of 5`) }));
const DIMENSIONS = ["Fuzzy intent", "Delayed feedback", "Serious damage", "Irreversible", "Explanatory divergence"];

function renderPage() {
  render(
    <MemoryRouter initialEntries={["/tree/meeting-stakes"]}>
      <Routes>
        <Route path="/tree/meeting-stakes" element={<MeetingStakes />} />
        <Route path="/live" element={<p>Live page</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

function pick(meeting: string) {
  fireEvent.change(screen.getByLabelText("Meeting"), { target: { value: meeting } });
  click("Continue");
}

describe("/tree/meeting-stakes", () => {
  it("starts with nothing chosen, and Continue says what is missing instead of going on", () => {
    renderPage();
    expect(screen.getByLabelText("Meeting")).toHaveValue("");
    expect(screen.queryByRole("link", { name: /Prototypes/ })).not.toBeInTheDocument();
    click("Continue");
    expect(heading()).toBe("Your next high-stakes meeting");
    expect(screen.getByRole("alert")).toHaveTextContent("Choose a meeting.");
    // Choosing Another meeting answers that; the name field it reveals is not scolded before anything is typed.
    fireEvent.change(screen.getByLabelText("Meeting"), { target: { value: "Another meeting" } });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Its name")).not.toHaveAttribute("aria-invalid");
    // The Enter that confirms an IME candidate does not submit.
    fireEvent.keyDown(screen.getByLabelText("Its name"), { key: "Enter", keyCode: 229 });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("walks a meeting to a high-stakes impact with a call to action", () => {
    renderPage();
    pick("Hiring decision");
    expect(heading()).toBe("What is at stake");
    // Every bar starts unset: no level is pre-picked.
    expect(screen.getAllByRole("radio").filter((r) => (r as HTMLInputElement).checked)).toHaveLength(0);

    set("Fuzzy intent", 2);
    click("Show the impact");
    expect(heading()).toBe("What is at stake");
    expect(screen.getAllByText("Set this one.")).toHaveLength(4);

    set("Delayed feedback", 4);
    set("Serious damage", 5);
    set("Irreversible", 3);
    set("Explanatory divergence", 1);
    click("Show the impact");

    expect(heading()).toBe("The impact");
    expect(screen.getByText("Hiring decision")).toBeInTheDocument();
    expect(screen.getByText("High stakes")).toBeInTheDocument();
    expect(screen.getByText(/^High on delayed feedback and serious damage\./)).toBeInTheDocument();
    // Each row shows the level entered: its spoken value and its filled segments.
    const entered = { "Fuzzy intent": 2, "Delayed feedback": 4, "Serious damage": 5, Irreversible: 3, "Explanatory divergence": 1 };
    for (const [d, l] of Object.entries(entered)) {
      const row = screen.getByText(new RegExp(`^${d}`), { selector: "li span" }).closest("li")!;
      expect(row).toHaveTextContent(`${d}: ${l} of 5`);
      expect(row.querySelectorAll('[data-filled="true"]')).toHaveLength(l);
    }
    fireEvent.click(screen.getByRole("link", { name: "Try a check in this meeting" }));
    expect(screen.getByText("Live page")).toBeInTheDocument();
  });

  it("gives some stakes the call to action and says why it is not high", () => {
    renderPage();
    pick("Project kickoff");
    for (const [d, l] of [["Fuzzy intent", 4], ["Delayed feedback", 5], ["Serious damage", 2], ["Irreversible", 1], ["Explanatory divergence", 4]] as const) set(d, l);
    click("Show the impact");
    expect(screen.getByText("Some stakes")).toBeInTheDocument();
    expect(screen.getByText(/but serious damage is not\./)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Try a check in this meeting" })).toHaveAttribute("href", "/live");
  });

  it("starts a different meeting with its bars unset, and the step bar then cannot skip to the impact", () => {
    renderPage();
    pick("Hiring decision");
    for (const d of DIMENSIONS) set(d, 5);
    click("Show the impact");
    click("Meeting, done");
    expect(heading()).toBe("Your next high-stakes meeting");
    fireEvent.change(screen.getByLabelText("Meeting"), { target: { value: "Post-mortem" } });
    // The impact is no longer a button in the step bar: its answers belonged to the other meeting.
    expect(screen.queryByRole("button", { name: /Impact/ })).not.toBeInTheDocument();
    click("Continue");
    expect(screen.getAllByRole("radio").filter((r) => (r as HTMLInputElement).checked)).toHaveLength(0);
  });

  it("treats a retyped meeting name as a different meeting", () => {
    renderPage();
    pick("Another meeting");
    fireEvent.change(screen.getByLabelText("Its name"), { target: { value: "Board offsite" } });
    click("Continue");
    for (const d of DIMENSIONS) set(d, 5);
    click("Show the impact");
    click("Meeting, done");
    fireEvent.change(screen.getByLabelText("Its name"), { target: { value: "Salary review" } });
    expect(screen.queryByRole("button", { name: /Impact/ })).not.toBeInTheDocument();
    click("Continue");
    expect(screen.getByText("Salary review")).toBeInTheDocument();
    expect(screen.getAllByRole("radio").filter((r) => (r as HTMLInputElement).checked)).toHaveLength(0);
  });

  it("keeps the bars when the same meeting is revisited through the step bar", () => {
    renderPage();
    pick("Hiring decision");
    for (const d of DIMENSIONS) set(d, 3);
    click("Meeting, done");
    click("Stakes, done");
    expect(within(bar("Irreversible")).getByRole("radio", { name: /^3 of 5/ })).toBeChecked();
  });

  it("gives low stakes no call to action, and Back keeps the answers", () => {
    renderPage();
    pick("Post-mortem");
    for (const d of DIMENSIONS) set(d, 2);
    click("Show the impact");
    expect(screen.getByText("Low stakes")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Try a check in this meeting" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Try a check in this meeting" })).not.toBeInTheDocument();
    click("Back");
    expect(heading()).toBe("What is at stake");
    expect(within(bar("Serious damage")).getByRole("radio", { name: /^2 of 5/ })).toBeChecked();
  });

  it("asks for a typed name when the meeting is not on the list, and uses it", () => {
    renderPage();
    pick("Another meeting");
    expect(screen.getByText("Type the meeting's name.")).toBeInTheDocument();
    // Enter on the empty name refuses too, and the error announces itself (focus is already on the field).
    fireEvent.keyDown(screen.getByLabelText("Its name"), { key: "Enter" });
    expect(heading()).toBe("Your next high-stakes meeting");
    expect(screen.getByRole("alert")).toHaveTextContent("Type the meeting's name.");
    expect(screen.getByLabelText("Its name")).toBeRequired();
    fireEvent.change(screen.getByLabelText("Its name"), { target: { value: "Board offsite" } });
    fireEvent.keyDown(screen.getByLabelText("Its name"), { key: "Enter" });
    expect(heading()).toBe("What is at stake");
    expect(screen.getByText("Board offsite")).toBeInTheDocument();
  });

  it("moves focus to the first missing answer, which already carries its error", () => {
    renderPage();
    pick("Hiring decision");
    set("Fuzzy intent", 2);
    // Read at the moment focus lands, not after: the error must already be described by then.
    let errorAtFocus: string | null = null;
    const onFocus = (e: FocusEvent) => {
      const group = (e.target as HTMLElement).closest("[data-question]");
      const ids = group?.getAttribute("aria-describedby")?.split(" ") ?? [];
      errorAtFocus = ids.map((id) => document.getElementById(id)?.textContent).join(" | ");
    };
    document.addEventListener("focusin", onFocus);
    click("Show the impact");
    document.removeEventListener("focusin", onFocus);
    expect(errorAtFocus).toContain("Set this one.");
    const focused = document.activeElement as HTMLElement;
    expect(focused.closest("[data-question]")?.getAttribute("data-question")).toBe("late");
    expect(bar("Delayed feedback")).toHaveAttribute("aria-invalid", "true");
  });
});
