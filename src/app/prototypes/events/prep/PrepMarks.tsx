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

export type MarkMic = 'own' | 'usbc' | 'lightning' | 'other';

export interface PrepMarkState {
  prepared: boolean;
  /** The volunteer's mic: 'own' = brings their own; the rest = needs one, by connector ('other' = not USB-C or Lightning, or unsure). */
  mic: MarkMic | null;
}

export const PREPARED_HINT = 'Prepared for the event';
export const MIC_HINTS = {
  own: 'Brings own mic',
  usbc: 'Needs a USB-C mic',
  lightning: 'Needs a Lightning mic',
  other: 'Needs a mic: other or unknown connector',
} as const satisfies Record<MarkMic, string>;
/** The small letter after the two overlapping mics: which connector the host would need. */
const MIC_LETTER = { usbc: 'C', lightning: 'L', other: '?' } as const;

const isMarkMic = (v: string | null): v is MarkMic => v === 'own' || v === 'usbc' || v === 'lightning' || v === 'other';

/** Profile id → marks, for the people who carry at least one mark. */
export function prepMarksByProfile(rows: HostPrepRow[]): Map<string, PrepMarkState> {
  const marks = new Map<string, PrepMarkState>();
  for (const r of rows) {
    // eligible = consented but not (yet) a recording place (Lightning / other); declined = said no (or the retired "none").
    const volunteer = r.researchState === 'confirmed' || r.researchState === 'eligible';
    const mic = volunteer && isMarkMic(r.micSetup) ? r.micSetup : null;
    const prepared = !!r.completedAt;
    if (prepared || mic) marks.set(r.profileId, { prepared, mic });
  }
  return marks;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * The host's packing line, or null when nobody needs a mic (the line is then not shown):
 * "Bring 2 USB-C mics, 1 Lightning mic · 1 needs another kind of mic".
 */
export function micLine(marks: ReadonlyMap<string, PrepMarkState>): string | null {
  const count = (k: MarkMic) => [...marks.values()].filter((m) => m.mic === k).length;
  const usbc = count('usbc');
  const lightning = count('lightning');
  const other = count('other');
  const bring = [usbc > 0 && plural(usbc, 'USB-C mic', 'USB-C mics'), lightning > 0 && plural(lightning, 'Lightning mic', 'Lightning mics')].filter(Boolean);
  const parts = [bring.length > 0 && `Bring ${bring.join(', ')}`, other > 0 && `${other} ${other === 1 ? 'needs' : 'need'} another kind of mic`].filter(Boolean);
  return parts.length > 0 ? parts.join(' · ') : null;
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
        // One grey mic = brings their own (nothing to do). Two overlapping dark mics = you hand
        // one out (like WhatsApp's double check), so it reads as the one that needs action; the
        // letter says which connector.
        <HintMark
          label={MIC_HINTS[marks.mic]}
          testId={`prep-mark-mic-${marks.mic}`}
          className={marks.mic === 'own' ? 'text-muted-foreground' : 'text-foreground'}
        >
          {marks.mic === 'own' ? (
            <Mic className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden="true" />
          ) : (
            <span className="inline-flex items-center" aria-hidden="true">
              <Mic className="h-3.5 w-3.5" strokeWidth={2.5} />
              <Mic className="-ml-2 h-3.5 w-3.5" strokeWidth={2.5} />
              <span className="ml-0.5 text-[10px] font-bold leading-none" data-testid="prep-mark-letter">{MIC_LETTER[marks.mic]}</span>
            </span>
          )}
        </HintMark>
      )}
    </span>
  );
}
