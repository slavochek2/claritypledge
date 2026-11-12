/**
 * @file CanvasTimingField.tsx
 * @description P1529 E1: the host's per-event setting for where the Clarity Canvas is made, on the edit form of a
 * sales mastermind. [FOUNDER DECISION: copy] the question is the spec's ("Clarity Canvas: before the event / at the event");
 * the helper lines are the builder's.
 */
import type { CanvasTiming } from '@/app/types/event-fields';

export const CANVAS_TIMING_OPTIONS: { value: CanvasTiming; label: string; help: string }[] = [
  { value: 'at_event', label: 'At the event', help: 'Preparation is the videos and principle only. The host guides everyone through making the canvas at the event.' },
  { value: 'before', label: 'Before the event', help: 'Preparation includes making the canvas at home and sharing it with the event.' },
];

export function CanvasTimingField({ value, onChange }: { value: CanvasTiming; onChange: (v: CanvasTiming) => void }) {
  return (
    <fieldset className="space-y-2" data-testid="canvas-timing-field">
      <legend className="text-sm font-medium">Clarity Canvas</legend>
      {CANVAS_TIMING_OPTIONS.map((o) => (
        <label key={o.value} className="flex items-start gap-3 text-sm">
          <input
            type="radio"
            name="canvasTiming"
            value={o.value}
            checked={value === o.value}
            onChange={() => onChange(o.value)}
            className="mt-1"
            data-testid={`canvas-timing-${o.value}`}
          />
          <span>
            {o.label}
            <span className="block text-xs text-muted-foreground">{o.help}</span>
          </span>
        </label>
      ))}
    </fieldset>
  );
}
