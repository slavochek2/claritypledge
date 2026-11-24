/** Steps 1 and 2 of /tree/meeting-stakes: the meeting with its gate question, and the five points. */
import { ANOTHER, CONDITIONS, MEETINGS, SCALE, type Answers, type ConditionKey, type Gate } from "./model";
import { ChoiceGroup } from "./parts";
import { FIELD, errorId } from "./ui";

const GATE_OPTIONS = [
  { value: "yes" as Gate, label: "Yes" },
  { value: "no" as Gate, label: "No" },
];

export type MeetingErrors = { meeting?: string; gate?: string };

export function MeetingQuestions({ meeting, customName, gate, errors, onMeeting, onCustomName, onGate }: { meeting: string; customName: string; gate: Gate | null; errors: MeetingErrors; onMeeting: (m: string) => void; onCustomName: (s: string) => void; onGate: (g: Gate | null) => void }) {
  return (
    <div className="grid gap-8">
      <div data-question="meeting">
        <label htmlFor="meeting" className="block font-medium">Which meeting?</label>
        {errors.meeting && <p id={errorId("meeting")} className="mt-1 text-sm text-red-700">{errors.meeting}</p>}
        <select
          id="meeting"
          value={meeting}
          onChange={(e) => onMeeting(e.target.value)}
          aria-invalid={errors.meeting ? true : undefined}
          aria-describedby={errors.meeting ? errorId("meeting") : undefined}
          className={`${FIELD} mt-2`}
        >
          <option value="" disabled>Choose a meeting</option>
          {MEETINGS.map((g) => (
            <optgroup key={g.group} label={g.group}>
              {g.items.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </optgroup>
          ))}
        </select>
        {meeting === ANOTHER && (
          <label className="mt-3 block">
            <span className="mb-1 block text-sm text-muted-foreground">Its name (optional)</span>
            <input type="text" value={customName} maxLength={80} onChange={(e) => onCustomName(e.target.value)} className={FIELD} />
          </label>
        )}
      </div>
      <ChoiceGroup
        name="gate"
        legend="If the participants left with different understandings of what happened, would the results suffer?"
        options={GATE_OPTIONS}
        value={gate}
        onChange={onGate}
        error={errors.gate}
        columns={2}
      />
    </div>
  );
}

export function StakesQuestions({ answers, errors, onAnswer }: { answers: Answers; errors: Partial<Record<ConditionKey, string>>; onAnswer: (k: ConditionKey, a: Answers[ConditionKey]) => void }) {
  return (
    <ol className="grid gap-4">
      {CONDITIONS.map((c, i) => (
        <li key={c.key} className={`rounded-xl border bg-card p-3 sm:p-5 ${errors[c.key] ? "border-red-700" : "border-border"}`}>
          <ChoiceGroup
            name={c.key}
            legend={<><span className="sr-only">Point {i + 1} of {CONDITIONS.length}: </span>{c.point}</>}
            options={SCALE}
            value={answers[c.key]}
            onChange={(a) => onAnswer(c.key, a)}
            error={errors[c.key]}
            columns={5}
          />
        </li>
      ))}
    </ol>
  );
}
