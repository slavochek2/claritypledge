/** Shared controls and class strings for the /tree/meeting-stakes prototype. */
import { CONDITIONS, type Ratings } from "./model";

export const CHOICE = "min-h-11 rounded-md border px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2";
export const CHOICE_ON = "border-blue-600 bg-blue-600 text-white";
export const CHOICE_OFF = "border-blue-500 bg-transparent text-blue-600 hover:bg-blue-500/10";
export const CARD = "rounded-xl border border-border bg-card p-5 sm:p-6";
export const FIELD = "h-11 w-full rounded-md border border-border bg-background px-3 text-base text-foreground tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500";

export function Choices({ label, options, value, onChange }: { label: string; options: readonly string[]; value: number; onChange: (i: number) => void }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-2">
      {options.map((o, i) => (
        <button key={o} type="button" role="radio" aria-checked={value === i} onClick={() => onChange(i)} className={`${CHOICE} ${value === i ? CHOICE_ON : CHOICE_OFF}`}>
          {o}
        </button>
      ))}
    </div>
  );
}

export function NumberField({ label, value, onChange, unit, min = 0 }: { label: string; value: number; onChange: (n: number) => void; unit?: string; min?: number }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm text-muted-foreground">{label}</span>
      <span className="flex items-center gap-2">
        <input
          type="number"
          inputMode="decimal"
          min={min}
          value={Number.isFinite(value) ? value : ""}
          onChange={(e) => onChange(Math.max(min, Number(e.target.value) || 0))}
          className={FIELD}
        />
        {unit && <span className="shrink-0 text-sm text-muted-foreground">{unit}</span>}
      </span>
    </label>
  );
}

/** Five bars, one per condition: the meeting's profile at a glance. */
export function Profile({ ratings }: { ratings: Ratings }) {
  return (
    <ul className="mt-4 grid gap-2">
      {CONDITIONS.map((c) => (
        <li key={c.key} className="grid grid-cols-[9rem_1fr] items-center gap-3 text-sm">
          <span className="text-muted-foreground">{c.name}</span>
          <span className="flex gap-1" aria-label={`${c.name}: ${c.options[ratings[c.key]]}`}>
            {[1, 2].map((step) => (
              <span key={step} className={`h-2 flex-1 rounded-full ${ratings[c.key] >= step ? "bg-blue-600" : "bg-blue-500/15"}`} />
            ))}
          </span>
        </li>
      ))}
    </ul>
  );
}
