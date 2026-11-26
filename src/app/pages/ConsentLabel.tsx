/**
 * @file ConsentLabel.tsx
 * @description P1592: the consent section of /transcribe/:code — the intro paragraph. Tapping Join is the consent (no toggle). For an event room the wording says the words are posted to the event's channel
 * for its attendees; otherwise it is today's text. The room is looked up first
 * (useRoomEventState): while that runs the intro shows no committed wording, and when it fails the EVENT wording is shown (the broader audience; see the hook). Kept out of
 * the page so its function does not grow.
 */
import type { Ref } from 'react';
import { CHAT_ROOM_INTRO, ROOM_CHECK_FAILED, ROOM_NOT_FOUND, ROUND_UPDATE_CONSENT } from '@/app/components/session/capture-copy';
import type { RoomEventState } from './use-room-event';
import { DISCLOSURE_ID } from './use-room-disclosure';

export function ConsentSection({ state, mastermind, introRef }: { state: RoomEventState; mastermind: boolean | null; introRef?: Ref<HTMLParagraphElement> }) {
  // The live region only ever receives settled text: until an event room's mastermind answer is in, it still says 'Checking this room…'.
  const checking = state === 'loading' || (state === 'event' && mastermind === null);
  return (
    <>
      <p id={DISCLOSURE_ID} ref={introRef} tabIndex={-1} role="status" aria-live="polite" className="text-sm text-muted-foreground mb-6 outline-none" data-testid="transcribe-consent-intro">
        {/* [FOUNDER DECISION: copy] — P1236 removed a "corrected transcript afterwards" promise
            from this screen because nothing kept it. Restore one only once the saved transcript
            is live and verified. The event-room wording below is founder-approved (P1592). */}
        {state === 'failed' ? (
          ROOM_CHECK_FAILED
        ) : state === 'unknown' ? (
          ROOM_NOT_FOUND
        ) : checking ? (
          'Checking this room…'
        ) : (
          <>
            Your spoken words will be transcribed live and {state === 'chat' ? CHAT_ROOM_INTRO : state === 'event' ? "shown in this room, and a clean version is posted to this event's channel after each round; anything said outside a round is posted after the room ends" : 'shown to everyone in this room'},
            attributed to you with a timestamp. The room&rsquo;s audio is recorded.{mastermind ? ` ${ROUND_UPDATE_CONSENT}` : ''}
          </>
        )}
      </p>
    </>
  );
}
