/**
 * @file HikeQuestionsFields.tsx
 * @description P1675 UAT round 3 R18: the one "Before the seat" choice on Edit event for a hike (replaces R6's two checkboxes):
 * one-tap optional, or the form with the when question only, when and how they're coming, or every question. Shown on Edit
 * event for hikes only; same radio pattern as CanvasTimingField. Words: hike-copy.ts.
 */
import type { HikeRegistration } from '@/app/data/hike-answer-model';
import { HIKE_REGISTRATION_HEADING, HIKE_REGISTRATION_OPTIONS } from '../components/hike-copy';

export function HikeQuestionsFields({ value, onChange }: { value: HikeRegistration; onChange: (v: HikeRegistration) => void }) {
  return (
    <fieldset className="m-0 min-w-0 space-y-1 border-0 p-0" data-testid="hike-questions-settings">
      <legend className="p-0 pb-2 text-sm font-medium">{HIKE_REGISTRATION_HEADING}</legend>
      {HIKE_REGISTRATION_OPTIONS.map((o) => (
        <label key={o.value} className="flex min-h-10 cursor-pointer items-center gap-3 text-sm">
          <input
            type="radio"
            name="hikeRegistration"
            value={o.value}
            checked={value === o.value}
            onChange={() => onChange(o.value)}
            className="size-4 shrink-0"
            data-testid={`hike-registration-${o.value}`}
          />
          <span>{o.label}</span>
        </label>
      ))}
    </fieldset>
  );
}
