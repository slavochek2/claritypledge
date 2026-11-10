/**
 * @file MastermindMicStep.tsx
 * @description P1529: the round card while the person is seated and their mic is not capturing: the table, what it discusses, one
 * primary "Start your mic" and a quiet "Continue without mic". Nothing else (no people, no canvas link) until the mic is on or
 * the person continues without it. The start is the room's own (use-round-mic.ts). Wording is a draft: [FOUNDER DECISION: copy, proposed].
 */
import { Button } from '@/components/ui/button';
import { ROUND_UPDATE_CONSENT } from '@/app/components/session/capture-copy';
import type { RoundMic } from './use-round-mic';

const MIC_COPY = {
  start: 'Start your mic',
  starting: 'Starting…',
  without: 'Continue without mic',
  failed: 'The mic did not start. Check it is allowed in your browser, then try again.',
};

export function MastermindMicStep({ table, discussing, mic }: { table: number; discussing: string | null; mic: RoundMic }) {
  return (
    <section className="rounded-xl border border-blue-200 bg-card p-4 shadow-sm" data-testid="mastermind-mic-step">
      <h2 className="text-3xl font-semibold" data-testid="round-card-table">Table {table}</h2>
      {discussing && <p className="mt-3 text-lg font-semibold break-words" data-testid="round-card-headline">{discussing}</p>}
      <Button type="button" className="mt-4 min-h-12 w-full text-base" disabled={mic.busy} onClick={mic.start} data-testid="round-mic-start">
        {mic.busy ? MIC_COPY.starting : MIC_COPY.start}
      </Button>
      <p className="mt-2 text-xs text-muted-foreground" data-testid="round-mic-consent">{ROUND_UPDATE_CONSENT}</p>
      {mic.failed && !mic.busy && <p role="alert" className="mt-2 text-sm text-red-600" data-testid="round-mic-failed">{MIC_COPY.failed}</p>}
      <button
        type="button"
        onClick={mic.continueWithout}
        disabled={mic.busy}
        className="mt-1 flex min-h-11 w-full items-center justify-center text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground disabled:opacity-50"
        data-testid="round-mic-without"
      >
        {MIC_COPY.without}
      </button>
    </section>
  );
}
