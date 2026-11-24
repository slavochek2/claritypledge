/** The /tree/meeting-stakes flow as a host walks it: nothing pre-selected, both gate paths, Clear, and the list of meetings. */
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
// The step's own heading; the result step also carries the list's "Your meetings" heading.
const heading = () => document.getElementById("step-title")?.textContent;
// By accessible name, as a screen reader reads it: the € and unit marks are hidden from it.
const field = (label: string, value: string) => fireEvent.change(screen.getByRole("spinbutton", { name: label }), { target: { value } });
const groups = () => screen.getAllByRole("group").filter((g) => g.tagName === "FIELDSET");
const firstGroup = () => groups()[0]!;

function startMeeting(meeting: string, gate: "Yes" | "No") {
  fireEvent.change(screen.getByLabelText("Which meeting?"), { target: { value: meeting } });
  fireEvent.click(screen.getByRole("radio", { name: gate }));
  click("Next");
}

describe("/tree/meeting-stakes", () => {
  it("starts with nothing chosen and names what is missing when Next is pressed", () => {
    render(<MemoryRouter><MeetingStakes /></MemoryRouter>);
    expect(screen.getByLabelText("Which meeting?")).toHaveValue("");
    expect(screen.getAllByRole("radio").filter((r) => (r as HTMLInputElement).checked)).toHaveLength(0);
    click("Next");
    expect(heading()).toBe("Your meeting");
    expect(screen.getByText("Choose a meeting.")).toBeInTheDocument();
    expect(screen.getByText("Answer yes or no.")).toBeInTheDocument();
  });

  it("walks one meeting to a verdict, then a second through the No path, and keeps both in the list", () => {
    render(<MemoryRouter><MeetingStakes /></MemoryRouter>);
    startMeeting("Hiring decision", "Yes");
    expect(heading()).toBe("What is at stake");

    // Agree on all five: four risk points flagged, the reverse-coded fuzzy point not.
    for (const g of groups()) fireEvent.click(within(g).getByRole("radio", { name: "Agree" }));
    // Clear takes an answer back, and Next then refuses to go on.
    const first = firstGroup();
    fireEvent.click(within(first.parentElement!).getByRole("button", { name: /^Clear Point 1 of 5/ }));
    expect(within(first).getAllByRole("radio").some((r) => (r as HTMLInputElement).checked)).toBe(false);
    click("Next");
    expect(heading()).toBe("What is at stake");
    fireEvent.click(within(firstGroup()).getByRole("radio", { name: "Agree" }));
    click("Next");

    expect(heading()).toBe("Your estimates");
    click("See the result");
    expect(heading()).toBe("Your result");
    expect(screen.getByText("Worth a check")).toBeInTheDocument();
    expect(screen.getByText(/^Four of your answers raise the risk: late results, concentrated cost, hard to undo and two explanations\./)).toBeInTheDocument();
    expect(screen.getByText(/To work it out, add your estimates\./)).toBeInTheDocument();
    expect(screen.queryByText("Your meetings")).not.toBeInTheDocument(); // one meeting: the card says it all

    click("Check another meeting");
    expect(heading()).toBe("Your meeting");
    expect(screen.getByText("Meeting 2. The meeting you checked before is listed below.")).toBeInTheDocument();
    // The list stays in reach while the next meeting starts.
    expect(screen.getByRole("heading", { name: "Your meetings" })).toBeInTheDocument();
    expect(screen.getByText("Hiring decision", { selector: "p" })).toBeInTheDocument();
    expect(screen.getByLabelText("Which meeting?")).toHaveValue("");
    startMeeting("Post-mortem", "No");

    expect(heading()).toBe("Your result");
    expect(screen.getAllByText("No check needed")).toHaveLength(2); // the card, and this meeting's row in the list
    const steps = within(screen.getByRole("navigation", { name: "Steps" }));
    expect(steps.getByText(/Stakes/).textContent).toContain("skipped");
    expect(screen.getByRole("heading", { name: "Your meetings" })).toBeInTheDocument();
    expect(screen.getByText("Hiring decision", { selector: "p" })).toBeInTheDocument();

    // Removing asks first, then the list (now only this meeting) goes away.
    click("Remove Hiring decision");
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Remove" }));
    expect(screen.queryByText("Hiring decision", { selector: "p" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Your meetings" })).not.toBeInTheDocument();
  });

  it("works the break-even from the host's numbers and shows their rate as entered", () => {
    render(<MemoryRouter><MeetingStakes /></MemoryRouter>);
    startMeeting("Project kickoff", "Yes");
    for (const g of groups()) fireEvent.click(within(g).getByRole("radio", { name: "Strongly Agree" }));
    click("Next");
    field("People in the meeting", "10");
    field("Cost of one person for one hour", "1");
    field("Time the check adds", "60");
    field("Cost of one misunderstanding", "10");
    field("Without a check, one misunderstanding in every", "1.9");
    click("See the result");
    expect(screen.getByText(/costs €10 a meeting and one misunderstanding costs €10\. It pays for itself if it prevents one misunderstanding in every meeting like this\./)).toBeInTheDocument();
    expect(screen.getByText(/You expect one misunderstanding in every 1\.9 meetings\. Even preventing every one of them would not cover the check\./)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Change estimates" })).toBeInTheDocument();
  });

  it("names the missing figures, goes back to them, and reads a zero as an answer", () => {
    render(<MemoryRouter><MeetingStakes /></MemoryRouter>);
    startMeeting("Pre-mortem", "Yes");
    for (const g of groups()) fireEvent.click(within(g).getByRole("radio", { name: "Agree" }));
    click("Next");
    field("People in the meeting", "4");
    click("See the result");
    expect(screen.getByText(/To work it out, add the cost of one person for one hour and the time the check adds\./)).toBeInTheDocument();

    click("Add estimates");
    expect(heading()).toBe("Your estimates");
    field("Cost of one person for one hour", "0");
    field("Time the check adds", "30");
    click("See the result");
    expect(screen.getByText("With these figures the check costs nothing, so in money it always pays for itself.")).toBeInTheDocument();

    click("Change estimates");
    field("Cost of one person for one hour", "25");
    field("Cost of one misunderstanding", "0");
    click("See the result");
    expect(screen.getByText("The check costs €50 a meeting and a misunderstanding costs nothing, so in money it never pays for itself.")).toBeInTheDocument();
  });

  it("shows cents when two whole-euro figures would read the same", () => {
    render(<MemoryRouter><MeetingStakes /></MemoryRouter>);
    startMeeting("Pre-mortem", "Yes");
    for (const g of groups()) fireEvent.click(within(g).getByRole("radio", { name: "Agree" }));
    click("Next");
    field("People in the meeting", "5");
    field("Cost of one person for one hour", "25");
    field("Time the check adds", "5"); // €10.42 a meeting
    field("Cost of one misunderstanding", "10");
    click("See the result");
    expect(screen.getByText("The check costs €10.42 a meeting, more than one misunderstanding costs (€10.00). In money, it does not pay for itself.")).toBeInTheDocument();
  });

  it("edits a checked meeting from the step bar without showing its stale row, and names a custom meeting", () => {
    render(<MemoryRouter><MeetingStakes /></MemoryRouter>);
    startMeeting("Hiring decision", "No");
    click("Check another meeting");
    fireEvent.change(screen.getByLabelText("Which meeting?"), { target: { value: "Another meeting" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Its name (optional)" }), { target: { value: "Team offsite" } });
    fireEvent.click(screen.getByRole("radio", { name: "No" }));
    click("Next");
    expect(screen.getAllByText("Team offsite", { selector: "p" })).toHaveLength(2); // the result card, and its row in the list
    expect(screen.getByRole("heading", { name: "Your meetings" })).toBeInTheDocument();

    // Back to step 1 of the same meeting through the step bar.
    fireEvent.click(within(screen.getByRole("navigation", { name: "Steps" })).getByRole("button", { name: /Meeting/ }));
    expect(heading()).toBe("Your meeting");
    // Only the other meeting is listed: this one's row would go stale while it is edited.
    expect(screen.getByText("Hiring decision", { selector: "p" })).toBeInTheDocument();
    expect(screen.queryByText(/Team offsite/, { selector: "p" })).not.toBeInTheDocument();
    // Answering Yes now closes the result until the points are answered.
    fireEvent.click(screen.getByRole("radio", { name: "Yes" }));
    const steps = within(screen.getByRole("navigation", { name: "Steps" }));
    expect(steps.queryByRole("button", { name: /Result/ })).not.toBeInTheDocument();
  });

  it("gives two rows with the same name their own Remove button", () => {
    render(<MemoryRouter><MeetingStakes /></MemoryRouter>);
    startMeeting("Project kickoff", "No");
    click("Check another meeting");
    startMeeting("Project kickoff", "No");
    // On the second one's result its own row has no button, so the one Remove button needs no number.
    expect(screen.getByRole("button", { name: "Remove Project kickoff" })).toBeInTheDocument();
    click("Check another meeting");
    startMeeting("Pre-mortem", "No");
    expect(screen.getByRole("button", { name: "Remove Project kickoff, row 1" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove Project kickoff, row 2" })).toBeInTheDocument();
  });

  it("says 'about as much' when two different amounts are equal to the cent", () => {
    render(<MemoryRouter><MeetingStakes /></MemoryRouter>);
    startMeeting("Pre-mortem", "Yes");
    for (const g of groups()) fireEvent.click(within(g).getByRole("radio", { name: "Agree" }));
    click("Next");
    field("People in the meeting", "1");
    field("Cost of one person for one hour", "10.001"); // €10.001 a meeting
    field("Time the check adds", "60");
    field("Cost of one misunderstanding", "10");
    click("See the result");
    expect(screen.getByText("The check costs about as much as one misunderstanding (€10), so in money it pays for itself only if it prevents one in every meeting.")).toBeInTheDocument();
  });

  it("puts two figures on the same scale when only one is under 50 cents", () => {
    render(<MemoryRouter><MeetingStakes /></MemoryRouter>);
    startMeeting("Pre-mortem", "Yes");
    for (const g of groups()) fireEvent.click(within(g).getByRole("radio", { name: "Agree" }));
    click("Next");
    field("People in the meeting", "1");
    field("Cost of one person for one hour", "1");
    field("Time the check adds", "30"); // €0.50 a meeting
    field("Cost of one misunderstanding", "0.4");
    click("See the result");
    expect(screen.getByText(/The check costs €0\.50 a meeting, more than one misunderstanding costs \(€0\.40\)\./)).toBeInTheDocument();
  });

  it("totals the checked meetings and says when some have no estimates", () => {
    render(<MemoryRouter><MeetingStakes /></MemoryRouter>);
    startMeeting("Pre-mortem", "Yes");
    for (const g of groups()) fireEvent.click(within(g).getByRole("radio", { name: "Agree" }));
    click("Next");
    field("People in the meeting", "2");
    field("Cost of one person for one hour", "30");
    field("Time the check adds", "5"); // €5 a meeting
    field("Meetings like this per year", "10"); // €50 a year
    field("Cost of one misunderstanding", "1000");
    field("Without a check, one misunderstanding in every", "10"); // one a year, €1,000 at risk
    click("See the result");
    click("Check another meeting");
    startMeeting("Hiring decision", "Yes");
    for (const g of groups()) fireEvent.click(within(g).getByRole("radio", { name: "Agree" }));
    click("Next");
    click("See the result");
    const list = within(screen.getByRole("region", { name: "Your meetings" }));
    expect(list.getByText("2 of 2")).toBeInTheDocument();
    expect(list.getByText("€50")).toBeInTheDocument();
    expect(list.getByText("€1,000")).toBeInTheDocument();
    expect(list.getAllByText("from 1 of 2 meetings; the rest have no estimates")).toHaveLength(2);
  });

  it("shows the yearly risk without the check's price, the answers that raise the risk, and leads to /live", () => {
    render(
      <MemoryRouter initialEntries={["/tree/meeting-stakes"]}>
        <Routes>
          <Route path="/tree/meeting-stakes" element={<MeetingStakes />} />
          <Route path="/live" element={<p>The live page</p>} />
        </Routes>
      </MemoryRouter>,
    );
    startMeeting("Pre-mortem", "Yes");
    for (const g of groups()) fireEvent.click(within(g).getByRole("radio", { name: "Agree" }));
    click("Next");
    field("Meetings like this per year", "10");
    field("Cost of one misunderstanding", "1000");
    field("Without a check, one misunderstanding in every", "10");
    click("See the result");
    expect(screen.getByText("Over a year of 10 meetings, misunderstandings put €1,000 at risk.")).toBeInTheDocument();
    // Some figures are in, so the three still missing are named rather than "your estimates".
    expect(screen.getByText(/To work it out, add the people in the meeting, the cost of one person for one hour and the time the check adds\./)).toBeInTheDocument();

    // Point 1 is said the other way round, so agreeing with it lowers the risk; agreeing with the other four raises it.
    click("Your answers");
    expect(screen.getAllByText(/raises the risk/)).toHaveLength(4);

    click("Try a check in ClarityPledge");
    expect(screen.getByText("The live page")).toBeInTheDocument();
  });

  it.each([
    // people, € an hour, minutes, € a misunderstanding, one in every N meetings → the sentence's end
    ["6", "50", "10", "500", "10", "every one of them"], // €50 × 10 / €500: exactly break-even
    ["3", "60", "33", "990", "10", "every one of them"], // 3 × 60 × (33/60) is 99.00000000000001 in floating point
    ["6", "100", "10", "500", "4", "about 80% of them"], // €100 × 4 / €500
    ["1", "598.8", "10", "100", "1", "nearly every one of them"], // €99.80 × 1 / €100
    ["1", "6", "10", "10000", "2", "under 0.1% of them"], // €1 × 2 / €10,000
  ])("says how many misunderstandings the check must prevent (%s × €%s × %s min, €%s, 1 in %s)", (people, hourly, minutes, damage, oneIn, expected) => {
    render(<MemoryRouter><MeetingStakes /></MemoryRouter>);
    startMeeting("Pre-mortem", "Yes");
    for (const g of groups()) fireEvent.click(within(g).getByRole("radio", { name: "Agree" }));
    click("Next");
    field("People in the meeting", people);
    field("Cost of one person for one hour", hourly);
    field("Time the check adds", minutes);
    field("Cost of one misunderstanding", damage);
    field("Without a check, one misunderstanding in every", oneIn);
    click("See the result");
    expect(screen.getByText(new RegExp(`so the check has to prevent ${expected}\\.`))).toBeInTheDocument();
  });

  it.each([
    ["75.83", "every one of them"], // 13 × €50 × 7 min is €75.8333: a fraction of a cent above the misunderstanding
    ["75.834", "every one of them"], // and a fraction of a cent below it
  ])("agrees with the 'about as much' sentence when the amounts tie to the cent (damage €%s)", (damage, expected) => {
    render(<MemoryRouter><MeetingStakes /></MemoryRouter>);
    startMeeting("Pre-mortem", "Yes");
    for (const g of groups()) fireEvent.click(within(g).getByRole("radio", { name: "Agree" }));
    click("Next");
    field("People in the meeting", "13");
    field("Cost of one person for one hour", "50");
    field("Time the check adds", "7");
    field("Cost of one misunderstanding", damage);
    field("Without a check, one misunderstanding in every", "1");
    click("See the result");
    expect(screen.getByText(/costs about as much as one misunderstanding/)).toBeInTheDocument();
    expect(screen.getByText(new RegExp(`so the check has to prevent ${expected}\\.`))).toBeInTheDocument();
  });

  it("keeps an exact break-even exact through floating point", () => {
    render(<MemoryRouter><MeetingStakes /></MemoryRouter>);
    startMeeting("Pre-mortem", "Yes");
    for (const g of groups()) fireEvent.click(within(g).getByRole("radio", { name: "Agree" }));
    click("Next");
    field("People in the meeting", "3");
    field("Cost of one person for one hour", "60");
    field("Time the check adds", "33"); // 3 × 60 × (33/60) is 99.00000000000001, and 990 / that floors to 9
    field("Cost of one misunderstanding", "990");
    click("See the result");
    expect(screen.getByText("The check costs €99 a meeting and one misunderstanding costs €990. It pays for itself if it prevents one misunderstanding in every 10 meetings like this.")).toBeInTheDocument();
  });
});
