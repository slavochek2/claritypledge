/**
 * @file GutFeelNudge.tsx
 * @description Shared by every position step (event preparation, /prepare, joining a group): after NUDGE_AFTER_MS on the step with no position
 * set yet, a non-blocking card above the statements says to go with the gut and offers a 2 minute timer. Tapping it swaps the card for a
 * small countdown (m:ss, sticky within the step); at zero it says time is up and never blocks anything. A position set before the card
 * appears means it never does; one set while it shows leaves it until the person dismisses it. Copy: [FOUNDER DECISION: copy, proposed]
 * except the card's meaning, which is the founder's.
 */
import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';

export const NUDGE_AFTER_MS = 6000;
export const NUDGE_SECONDS = 120;

type Phase = 'waiting' | 'card' | 'counting' | 'closed';

export const formatCountdown = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

/** `answered`: positions set on this step so far; `loaded`: the statements are on screen. Render with a key per step so it starts fresh. */
export function GutFeelNudge({ answered, loaded }: { answered: number; loaded: boolean }) {
  const [phase, setPhase] = useState<Phase>('waiting');
  const [left, setLeft] = useState(NUDGE_SECONDS);

  useEffect(() => {
    if (phase !== 'waiting' || !loaded) return;
    if (answered > 0) { setPhase('closed'); return; }
    const t = setTimeout(() => setPhase('card'), NUDGE_AFTER_MS);
    return () => clearTimeout(t);
  }, [phase, loaded, answered]);

  const expired = left === 0;
  useEffect(() => {
    if (phase !== 'counting' || expired) return; // at zero the interval stops: nothing keeps ticking
    // From the clock, not by counting ticks: a hidden tab or a locked phone slows the ticks.
    const endsAt = Date.now() + NUDGE_SECONDS * 1000;
    const i = setInterval(() => setLeft(Math.max(0, Math.ceil((endsAt - Date.now()) / 1000))), 1000);
    return () => clearInterval(i);
  }, [phase, expired]);

  if (phase === 'card') {
    return (
      <div className="relative rounded-lg border border-blue-200 bg-blue-50 p-4 pr-12 text-foreground motion-safe:animate-in motion-safe:fade-in dark:border-blue-900 dark:bg-blue-950" data-testid="gut-nudge">
        <button type="button" aria-label="Close" className="absolute right-1 top-1 inline-flex h-11 w-11 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-blue-100 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600/40 dark:hover:bg-blue-900" onClick={() => setPhase('closed')} data-testid="gut-nudge-close">
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
        <p className="text-base leading-relaxed">Don&apos;t overthink it. Go with your gut: agree, disagree or unsure. There&apos;s no right or wrong, and you can change it later. Can you do these in 2 minutes?</p>
        <Button variant="outline" className="mt-3 min-h-11" onClick={() => setPhase('counting')} data-testid="gut-nudge-yes">Yes, 2 minutes</Button>
      </div>
    );
  }
  if (phase === 'counting') {
    return (
      <p className="sticky top-2 z-10 w-fit rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-sm font-medium tabular-nums text-blue-700 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-300" role="timer" data-testid="gut-countdown">
        {left > 0 ? formatCountdown(left) : "Time's up. Finish when you're ready."}
      </p>
    );
  }
  return null;
}
