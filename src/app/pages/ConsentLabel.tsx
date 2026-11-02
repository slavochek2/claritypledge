/**
 * @file ConsentLabel.tsx
 * @description P1592: the consent section of /transcribe/:code — the intro paragraph and the
 * agree toggle. For an event room the wording says the words are posted to the event's channel
 * for its attendees; otherwise it is today's text. The room is looked up first
 * (useRoomEventState): while that runs the toggle is disabled and no agreed-label text is shown,
 * and when it fails the EVENT wording is shown (the broader audience; see the hook). Kept out of
 * the page so its function does not grow.
 */
import { Sparkles, ShieldOff } from 'lucide-react';
import { consentAgreedLabel } from '@/app/components/session/capture-copy';
import { useRoomEventState } from './use-room-event';

export function ConsentLabel({ agreed, code }: { agreed: boolean; code: string | undefined }) {
  const state = useRoomEventState(code);
  if (!agreed) return <>Not yet agreed — tap to agree</>;
  if (state === 'loading') return <>Checking this room…</>;
  return <>{consentAgreedLabel(state !== 'room')}</>;
}

export function ConsentSection({ agreed, code, onToggle }: { agreed: boolean; code: string | undefined; onToggle: () => void }) {
  const state = useRoomEventState(code);
  const forEvent = state === 'event' || state === 'unknown';
  return (
    <>
      <p className="text-sm text-muted-foreground mb-6" data-testid="transcribe-consent-intro">
        {/* [FOUNDER DECISION: copy] — P1236 removed a "corrected transcript afterwards" promise
            from this screen because nothing kept it. Restore one only once the saved transcript
            is live and verified. The event-room wording below is founder-approved (P1592). */}
        {state === 'loading' ? (
          'Checking this room…'
        ) : (
          <>
            Your spoken words will be transcribed live and {forEvent ? "shown in this room, and a clean version is posted to this event's channel after each round; anything said outside a round is posted after the room ends" : 'shown to everyone in this room'},
            attributed to you with a timestamp. The room&rsquo;s audio is recorded.
          </>
        )}
      </p>

      <button
        type="button"
        onClick={onToggle}
        disabled={state === 'loading'}
        aria-pressed={agreed}
        className={`w-full flex items-center gap-3 rounded-lg border px-4 py-3 mb-6 min-h-11 text-left transition-colors disabled:opacity-60 ${
          agreed
            ? 'border-blue-300 bg-blue-50 text-blue-700 hover:bg-blue-100'
            : 'border-border text-muted-foreground hover:bg-muted'
        }`}
        data-testid="transcribe-recording-toggle"
      >
        {agreed ? <Sparkles className="w-5 h-5 text-blue-500 shrink-0" /> : <ShieldOff className="w-5 h-5 shrink-0" />}
        <span className="font-medium">
          <ConsentLabel agreed={agreed} code={code} />
        </span>
      </button>
    </>
  );
}
