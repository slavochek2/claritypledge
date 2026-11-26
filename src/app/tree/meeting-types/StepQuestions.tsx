/** Steps 1 and 2 of /meeting-types: the meeting, and its five dimensions. */
import { ANOTHER, DIMENSIONS, MEETINGS, type DimensionKey, type Level, type Levels } from "./model";
import { LevelBar, type DimensionErrors } from "./parts";
import { FIELD, errorId } from "./ui";

export function MeetingQuestions({ meeting, customName, errors, onMeeting, onCustomName, onSubmit }: { meeting: string; customName: string; errors: { meeting?: string; name?: string }; onMeeting: (m: string) => void; onCustomName: (s: string) => void; onSubmit: () => void }) {
  return (
    <div className="grid gap-4">
      <div data-question="meeting">
        <label htmlFor="meeting" className="block font-medium">Meeting</label>
        {/* role="alert": announced on insertion, even when focus does not move (it may already be on the field). */}
        {errors.meeting && <p id={errorId("meeting")} role="alert" className="mt-1 text-sm text-red-700">{errors.meeting}</p>}
        <select
          id="meeting"
          required
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
      </div>
      {meeting === ANOTHER && (
        <div data-question="name">
          <label htmlFor="meeting-name" className="block font-medium">Its name</label>
          {errors.name && <p id={errorId("name")} role="alert" className="mt-1 text-sm text-red-700">{errors.name}</p>}
          <input
            id="meeting-name"
            required
            type="text"
            value={customName}
            maxLength={80}
            onChange={(e) => onCustomName(e.target.value)}
            // Enter in the only text field does what Continue does, as in any one-field form.
            onKeyDown={(e) => {
              // keyCode 229: Safari's Enter that confirms an IME candidate, which can report isComposing false.
              if (e.key === "Enter" && !e.nativeEvent.isComposing && e.keyCode !== 229) {
                e.preventDefault();
                onSubmit();
              }
            }}
            aria-invalid={errors.name ? true : undefined}
            aria-describedby={errors.name ? errorId("name") : undefined}
            className={`${FIELD} mt-2`}
          />
        </div>
      )}
    </div>
  );
}

export function StakesQuestions({ levels, errors, onLevel }: { levels: Levels; errors: DimensionErrors; onLevel: (k: DimensionKey, l: Level) => void }) {
  return (
    <div className="grid gap-5 rounded-xl border border-border bg-card p-4 sm:p-6">
      {DIMENSIONS.map((d) => (
        <LevelBar key={d.key} dim={d} value={levels[d.key]} onChange={(l) => onLevel(d.key, l)} error={errors[d.key]} />
      ))}
    </div>
  );
}
