/**
 * @file PrepConfirm.tsx
 * @description P1336 screen 0 — "You're Registered!" for an event with preparation on. The box
 * (EventBox) carries the registration; below it the prep block asks for the preparation. An
 * event with preparation off keeps RsvpConfirm's existing screen unchanged.
 *
 * "Remind me by email" records the choice only: the existing 24h reminder ("Tomorrow") is the
 * reminder. No extra email is sent from here.
 */
import { useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuth } from '@/auth';
import { savePreparation } from '@/app/data/event-prep-service';
import type { EventWithHost } from '@/app/types';
import { EventBox, PrepBlock, PrepStatus, RegisteredBlock, seriesLabel, socialProofLine } from './PrepPieces';
import { usePrepState } from './use-prep-state';
import { recipeFor } from '../series-recipes';
import { LearnInvitation } from './PrepRoom';
import { useDeclareAppMenu } from '@/app/components/layout/app-menu-override';
import { useHideTodaysStripForEvent } from '@/app/components/layout/app-shell/shell-nav';

export function PrepConfirm({ event, groupChatUrl }: { event: EventWithHost; groupChatUrl: string | null }) {
  const { user, session } = useAuth();
  const navigate = useNavigate();
  const recipe = recipeFor(event.seriesSlug);
  // Round 10e: a hike's thank-you never shows the prep status (LearnInvitation reads its own), so it sends no prep reads.
  const state = usePrepState(event, recipe.prepare.offer ? undefined : user?.id);
  const [remindSaving, setRemindSaving] = useState(false);
  const reminded = state.prep?.prepChoice === 'remind';
  // P1542 VQA round 5: a hike's registration thank-you is a destination with the app menu (bottom tabs on a
  // phone). /confirm hides them by route for Clarity Night, whose pinned Prepare now would compete (P1387).
  useDeclareAppMenu(!!recipe.prepare.offer);
  // Round 6b: this page is inside the event the phone's "Today's event" strip points to — the strip steps aside.
  useHideTodaysStripForEvent(event.slug, !!recipe.prepare.offer);
  const started = !!state.prep?.startedAt;

  const remind = async () => {
    if (!user || remindSaving) return;
    setRemindSaving(true);
    try {
      state.setPrep(await savePreparation(event.id, user.id, { prepChoice: 'remind' }));
    } catch {
      toast.error('Could not save. Please try again.');
    } finally {
      setRemindSaving(false);
    }
  };

  const proof = state.proof;
  const proofLine = proof ? socialProofLine('prepared for', proof.preparedPrevious, proof.preparedThis, seriesLabel(event)) : null;

  // P1542 founder UAT round 6 (A, decision 39): "so many white buttons — where should attention go?" One calm,
  // centred stack: the success with its quiet links (group chat, calendar, share), 48px of space, then the one
  // invitation to learn (an outline button, never a blue primary) — or nothing more for a learner or a member.
  if (recipe.prepare.offer) {
    return (
      <main className="mx-auto max-w-2xl px-4 pt-6 pb-20" data-testid="p1336-confirm">
        {/* Round 10b: the session's id, the one LearnInvitation and the chat-opened flags use (the profile can lag). */}
        <RegisteredBlock event={event} groupChatUrl={groupChatUrl} viewerId={session?.user?.id ?? user?.id ?? null} />
        <LearnInvitation event={event} className="mt-6" />
      </main>
    );
  }

  return (
    // pb-48 on phones while the pinned Prepare now bar shows (P1387).
    <main className={`mx-auto max-w-2xl space-y-6 px-4 pt-4 ${state.progress.complete ? 'pb-20' : 'pb-48 lg:pb-20'}`} data-testid="p1336-confirm">
      {!state.loading && !state.error && (
        <PrepBlock
          progress={state.progress}
          minutes={state.minutes}
          reminded={reminded}
          proof={{ line: proofLine, people: proof?.preparedPeople ?? [] }}
          onPrepare={() => navigate(`/events/${event.slug}/prepare`)}
          onRemind={remind}
        />
      )}
      <EventBox
        event={event}
        groupChatUrl={groupChatUrl}
        testId="registered-card"
        title={
          <div className="flex flex-col items-center gap-2">
            <div className="flex items-center justify-center gap-2">
              <CheckCircle2 className="h-5 w-5 flex-shrink-0 text-muted-foreground" aria-hidden="true" />
              <h2 className="text-lg font-semibold">You&apos;re Registered!</h2>
            </div>
            {!state.loading && !state.error && <PrepStatus progress={state.progress} started={started} />}
          </div>
        }
      />
    </main>
  );
}
