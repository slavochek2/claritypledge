/**
 * @file CloseHeader.tsx
 * @description The close's header, per step (moved out of EventClosePage.tsx, which may not grow):
 *  - the thank-you: the shell's "Back to the event";
 *  - a hike's group terms, and the welcome: the shell's standard "Back", to the thank-you;
 *  - every other step: the pinned step header — Back, the step's name and its progress.
 *
 * P1542 founder UAT round: opened INSIDE the event room (`embedded`), the room keeps its own "Back to the event" and
 * step bar, so the thank-you adds nothing and every other step's header is drawn into the room's sticky head (`slot`,
 * as the in-room learning does) — never a second fixed bar, never a second Back in the shell bar.
 */
import { createPortal } from 'react-dom';
import { ArrowLeft } from 'lucide-react';
import { FocusHeader } from '@/app/components/layout/focus-header';
import { LetterProgressBar } from '@/app/components/letters/letter-progress-bar';

export type CloseHeaderProps = {
  step: string;
  /** A hike (its recipe offers the learning): the group terms take the shell's standard Back. */
  offer: boolean;
  /** Inside the room: its sticky head's slot (null until it mounts). */
  embedded: boolean;
  slot: HTMLElement | null;
  onBack: () => void;
  toEnd: () => void;
  backToEvent: () => void;
  /** "Joining <community>": the terms as step 2 of joining (reached through the learning). */
  joinContext: string | null;
  /** A question step's name. */
  title: string;
  progress: { chapter: number; total: number; fraction: number };
  headerRef: (node: HTMLDivElement | null) => void;
  headerHeight: number;
  /** The close's first question (no intro screen before it). Inside the room its Back would only repeat the room's
   *  "Back to the event", so it is not drawn there (founder UAT, 2026-10-29); later questions keep theirs. */
  firstQuestion?: boolean;
};

export function CloseHeader(p: CloseHeaderProps) {
  // P1512: the end screen is a destination with the menus back: its Back is the shell top bar's.
  // Round 5c (J): after submitting, "Back" read like returning to the form; a hike's thank-you names where it goes.
  // Screens whose Back returns to the thank-you: the welcome, and a hike's group terms (opened from the thank-you's
  // Join; never a step of the agenda).
  const toEnd = p.step === 'welcome' || (p.step === 'join' && p.offer);
  if (p.embedded) {
    // In the room the room's head already has "Back to the event": the thank-you and the screens that return to it add
    // no row (P1542 review round 3, E). P1595 (founder UAT): a "← Group terms" row under it read as nested Backs; the
    // terms' own "Not now" and the welcome's "Continue" return to the thank-you instead.
    if (p.step === 'end' || toEnd) return null;
  } else {
    if (p.step === 'end') return <FocusHeader onBack={p.backToEvent} label="Back to the event" aria-label="Back to the event" />;
    // Round 6b: outside the room they use the shell's standard Back (top bar), back to the thank-you.
    if (toEnd) return <FocusHeader onBack={p.toEnd} label="Back" aria-label="Back" />;
  }
  const row = (
    <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 py-2" data-testid="step-header">
      {!(p.embedded && p.firstQuestion) && <button
        type="button"
        onClick={toEnd ? p.toEnd : p.onBack}
        aria-label="Back"
        data-testid="header-back"
        className="flex-shrink-0 -ml-1 flex h-11 w-11 items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-gray-100 transition-colors"
      >
        <ArrowLeft size={20} />
      </button>}
      <CloseHeaderTitle step={p.step} joinContext={p.joinContext} title={p.title} progress={p.progress} />
    </div>
  );
  if (p.embedded) return p.slot ? createPortal(<div data-testid="close-room-head">{row}</div>, p.slot) : null;
  // The step screens keep their own pinned step-back header (a wizard step, not a page Back).
  return (
    <>
      <div ref={p.headerRef} data-shell-bar={p.offer ? '' : undefined} className="fixed inset-x-0 top-0 z-50 border-b border-border bg-background pt-[env(safe-area-inset-top)]">
        {row}
      </div>
      <div style={{ height: p.headerHeight }} aria-hidden />
    </>
  );
}

function CloseHeaderTitle({ step, joinContext, title, progress }: Pick<CloseHeaderProps, 'step' | 'joinContext' | 'title' | 'progress'>) {
  if (step === 'welcome') return <span className="min-w-0 flex-1" />;
  if (step === 'intro' || step === 'join') {
    return joinContext ? (
      <div className="min-w-0 flex-1" data-testid="join-context">
        <p className="text-sm font-semibold leading-snug text-foreground" data-testid="step-name">Joining {joinContext}</p>
        <p className="text-xs text-muted-foreground">Part 2 of 2 · Group terms</p>
      </div>
    ) : (
      <p className="min-w-0 flex-1 text-sm font-semibold leading-snug text-foreground" data-testid="step-name">{step === 'join' ? 'Group terms' : 'Feedback'}</p>
    );
  }
  return (
    <div className="min-w-0 flex-1 space-y-1">
      <p className="text-sm font-semibold leading-snug text-foreground" data-testid="step-name">{title}</p>
      <LetterProgressBar
        currentChapter={progress.chapter}
        totalChapters={progress.total}
        fraction={progress.fraction}
        label={`Step ${progress.chapter + 1} of ${progress.total}`}
      />
    </div>
  );
}
