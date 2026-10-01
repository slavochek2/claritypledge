/**
 * @file PrepConfirm.tsx
 * @description P1336 screen 0 — "You're Registered!" for an event with preparation on. The box
 * (EventBox) carries the registration; below it the prep block asks for the preparation. An
 * event with preparation off keeps RsvpConfirm's existing screen unchanged.
 *
 * "Remind me by email" records the choice only: the existing 24h reminder ("Tomorrow") is the
 * reminder. No extra email is sent from here.
 */
import { useRef, useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuth } from '@/auth';
import { useNavAuthState } from '@/hooks/use-nav-auth-state';
import { savePreparation } from '@/app/data/event-prep-service';
import type { EventWithHost } from '@/app/types';
import { EventBox, PrepBlock, PrepStatus, seriesLabel, socialProofLine } from './PrepPieces';
import { usePrepState } from './use-prep-state';

export function PrepConfirm({ event, groupChatUrl }: { event: EventWithHost; groupChatUrl: string | null }) {
  const { user } = useAuth();
  const { showUserMenu } = useNavAuthState();
  const navigate = useNavigate();
  const state = usePrepState(event, user?.id);
  const anchorRef = useRef<HTMLDivElement>(null);
  const [remindSaving, setRemindSaving] = useState(false);

  const reminded = state.prep?.prepChoice === 'remind';
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

  return (
    <main className="mx-auto max-w-2xl space-y-6 px-4 pt-4 pb-20" data-testid="p1336-confirm">
      <EventBox
        event={event}
        groupChatUrl={groupChatUrl}
        testId="registered-card"
        title={
          <div className="flex flex-col items-center gap-2">
            <div className="flex items-center justify-center gap-2">
              <CheckCircle2 className="h-5 w-5 flex-shrink-0 text-muted-foreground" aria-hidden="true" />
              <h1 className="text-lg font-semibold">You&apos;re Registered!</h1>
            </div>
            {!state.loading && !state.error && <PrepStatus progress={state.progress} started={started} />}
          </div>
        }
      />
      <div ref={anchorRef} className="!mt-0 h-0" aria-hidden />
      {!state.loading && !state.error && (
        <PrepBlock
          progress={state.progress}
          minutes={state.minutes}
          reminded={reminded}
          proof={{ line: proofLine, people: proof?.preparedPeople ?? [] }}
          onPrepare={() => navigate(`/events/${event.slug}/prepare`)}
          onRemind={remind}
          anchorRef={anchorRef}
          aboveBottomNav={showUserMenu}
        />
      )}
    </main>
  );
}
