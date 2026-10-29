/**
 * @file RoomCloseView.tsx
 * @description The event room's feedback step (moved out of EventRoomMeet.tsx, which may not grow):
 *  - finished: one plain line with a check, and for a definite non-member the group's Join;
 *  - not known yet: an empty space (no "Start now" flash);
 *  - otherwise the way in: a hike's "Start now", Clarity Night's card with "Give feedback".
 *
 * P1542 founder UAT round: the way in, and the learned person's Join (the group terms, ?join=1), open the close INSIDE
 * the room (`onOpenFeedback`, ?view=feedback on the same page) instead of changing page to /events/:slug/close.
 */
import { Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { JoinOffer } from '../prep/PrepPieces';
import type { PrepState } from '../prep/use-prep-state';
import type { recipeFor } from '../series-recipes';

type Props = {
  closeCopy: ReturnType<typeof recipeFor>['roomClose'];
  feedbackFinished: boolean | undefined;
  /** The Join is offered: a finished hike's feedback for a definite non-member whose community name is known. */
  join: { community: string } | null;
  learnState: PrepState;
  onOpenFeedback: (join?: boolean) => void;
  /** Not learned yet: the short learning first, which lands on the terms. */
  onLearnFirst: () => void;
};

export function RoomCloseView({ closeCopy, feedbackFinished, join, learnState, onOpenFeedback, onLearnFirst }: Props) {
  if (closeCopy.finished && feedbackFinished === true) {
    return (
      // Round 6b: finished — one plain centred line with a muted check; no card, no button (the step carries its tick).
      <div className="flex flex-col items-center py-6 text-center" data-testid="room-close">
        <p className="flex items-center justify-center gap-2 text-lg text-foreground">
          {/* Round 6d: the success colour (design system: green for success states only). */}
          <Check className="h-5 w-5 shrink-0 text-green-600" aria-hidden="true" data-testid="room-close-check" />
          <span data-testid="room-close-heading">{closeCopy.finished}</span>
        </p>
        {/* Round 6c (E): not a dead end for a DEFINITE non-member (a member, or an unknown, sees nothing more).
            Learned → the group terms; not yet → the short learning, which lands on the terms. */}
        {join && !learnState.loading && !learnState.error && (
          <div className="mt-8 w-full">
            <JoinOffer
              community={join.community}
              learned={learnState.learned}
              started={learnState.progress.done > 0}
              minutes={learnState.minutes}
              testId="room-join"
              onJoin={() => (learnState.learned ? onOpenFeedback(true) : onLearnFirst())}
            />
          </div>
        )}
      </div>
    );
  }
  // Round 6 (B): nothing until it is known whether this person already finished (no "Start now" flash).
  // Round 6b: an empty space, never an empty bordered card, while a slow read is out.
  if (closeCopy.finished && feedbackFinished === undefined) return <div className="min-h-[7.5rem]" aria-busy="true" data-testid="room-close-pending" />;
  return (
    // The way into P1389's closing sequence, drawn inside the room.
    // Round 6c (D): a hike's step has no card around it, like the room's other steps; Clarity Night keeps its card.
    <section className={closeCopy.title ? 'rounded-xl border border-border bg-card p-6 text-center' : 'py-6 text-center'} data-testid="room-close">
      {closeCopy.title ? (
        <>
          <h2 className="text-2xl font-semibold">{closeCopy.title}</h2>
          <p className="mt-2 text-sm text-muted-foreground">{closeCopy.body}</p>
          <Button type="button" onClick={() => onOpenFeedback()} className="mt-4 min-h-11 w-full" data-testid="room-close-feedback">
            Give feedback
          </Button>
        </>
      ) : (
        // Founder 2026-10-23 (a hike): just the button, the time small under it; no repeated wording.
        // Round 6 (B): the button says what it does ("Start now"), not the step's own name.
        // Round 6b: the app's one primary look (LetterPrimaryCta's pill); its blue is the Button's default variant (P1568).
        <>
          {closeCopy.heading && <h2 className="mb-4 text-2xl font-semibold text-balance" data-testid="room-close-heading">{closeCopy.heading}</h2>}
          <div className="mx-auto w-full max-w-sm">
            <Button type="button" onClick={() => onOpenFeedback()} className="min-h-14 w-full rounded-full text-base font-bold" data-testid="room-close-feedback">
              {closeCopy.cta ?? 'Give feedback'}
            </Button>
          </div>
          <p className="mt-2 text-xs text-muted-foreground" data-testid="room-close-time">{closeCopy.body}</p>
        </>
      )}
    </section>
  );
}
