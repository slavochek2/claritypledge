/**
 * @file PrepMarks.tsx
 * @description P1386 — the host's two small marks after a person's name, in the event page's
 * Participants list and in the room (/meet) roster: ✓ prepared, 🎙 recording volunteer (with or
 * without a USB-C mic to hand out). Host only: the data comes from get_event_prep_host_view, which
 * refuses anyone but the event's host. Replaces P1336's separate Preparation card (founder,
 * 2026-10-01: "same similar small thing, we don't need extra categories").
 *
 * Each mark is a Popover opened by tap (phone) or hover (desktop) — MobileTooltip opens on hover
 * and long-press only, so a tap on a phone explained nothing (P1336 review 2026-10-01).
 */
import { useEffect, useState, type ReactNode } from 'react';
import { Check, Mic } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { getPrepHostView, type HostPrepRow } from '@/app/data/event-prep-service';

export interface PrepMarkState {
  prepared: boolean;
  /** Recording volunteer's mic: 'usbc' = needs one handed out, 'own' = brings their own. */
  mic: 'usbc' | 'own' | null;
}

export const PREPARED_HINT = 'Prepared for the event';
export const MIC_HINTS = { usbc: 'Needs a USB-C mic', own: 'Brings own mic' } as const;

/** Profile id → marks, for the people who carry at least one mark. */
export function prepMarksByProfile(rows: HostPrepRow[]): Map<string, PrepMarkState> {
  const marks = new Map<string, PrepMarkState>();
  for (const r of rows) {
    const volunteer = r.researchState === 'confirmed';
    const mic = volunteer && (r.micSetup === 'usbc' || r.micSetup === 'own') ? r.micSetup : null;
    const prepared = !!r.completedAt;
    if (prepared || mic) marks.set(r.profileId, { prepared, mic });
  }
  return marks;
}

/** "Bring 2 USB-C mics", or null when no mic is needed (the line is then not shown). */
export function micLine(marks: ReadonlyMap<string, PrepMarkState>): string | null {
  const n = [...marks.values()].filter((m) => m.mic === 'usbc').length;
  if (n === 0) return null;
  return `Bring ${n} USB-C ${n === 1 ? 'mic' : 'mics'}`;
}

/**
 * The host's marks for one event, or an empty map for everyone else. A failed read keeps what is
 * already shown. `refreshKey` re-reads (the room passes its roster size: a newcomer may have
 * prepared); the room also re-reads once a minute, since people can finish preparing in the room.
 */
export function useHostPrepMarks(
  eventId: string | undefined,
  enabled: boolean,
  { refreshKey, poll = false }: { refreshKey?: unknown; poll?: boolean } = {},
): ReadonlyMap<string, PrepMarkState> {
  const [marks, setMarks] = useState<ReadonlyMap<string, PrepMarkState>>(new Map());
  // Another event's (or a no-longer-host's) marks must never stay on screen. Cleared only when the
  // event or host status changes, not on every re-read, so the room's marks do not flicker.
  useEffect(() => { setMarks(new Map()); }, [eventId, enabled]);
  useEffect(() => {
    if (!eventId || !enabled) return;
    let cancelled = false;
    const read = () =>
      getPrepHostView(eventId)
        .then((rows) => { if (!cancelled) setMarks(prepMarksByProfile(rows)); })
        .catch(() => { /* keep what is shown */ });
    void read();
    const every = poll ? setInterval(read, 60_000) : undefined;
    return () => { cancelled = true; if (every) clearInterval(every); };
  }, [eventId, enabled, refreshKey, poll]);
  return marks;
}

function HintMark({ label, testId, className, children }: { label: string; testId: string; className: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          onMouseEnter={() => setOpen(true)}
          onMouseLeave={() => setOpen(false)}
          onClick={(e) => e.stopPropagation()}
          aria-label={label}
          className={`-m-2 inline-flex shrink-0 items-center justify-center p-2 ${className}`}
          data-testid={testId}
        >
          {children}
        </button>
      </PopoverTrigger>
      <PopoverContent side="top" className="w-auto px-3 py-1.5 text-sm" data-testid="prep-mark-note">
        {label}
      </PopoverContent>
    </Popover>
  );
}

export function PrepMarks({ marks }: { marks: PrepMarkState | undefined }) {
  if (!marks || (!marks.prepared && !marks.mic)) return null;
  return (
    <span className="inline-flex shrink-0 items-center gap-1" data-testid="prep-marks">
      {marks.prepared && (
        <HintMark label={PREPARED_HINT} testId="prep-mark-prepared" className="text-blue-600 dark:text-blue-400">
          <Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden="true" />
        </HintMark>
      )}
      {marks.mic && (
        <HintMark label={MIC_HINTS[marks.mic]} testId={`prep-mark-mic-${marks.mic}`} className="text-muted-foreground">
          <Mic className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden="true" />
        </HintMark>
      )}
    </span>
  );
}
