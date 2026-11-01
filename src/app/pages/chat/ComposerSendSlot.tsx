/**
 * @file ComposerSendSlot.tsx
 * @description The composer's send slot: the round voice-note button or Send while the composer can send, and, while the caller says the send must
 * wait (`waiting`: a canvas draft's run is going), a STATUS in the same spot (D15: the owner keeps typing, Send waits, nothing is ever disabled; a
 * different meaning looks different). Both the status and the buttons carry data-composer-send (the P955 gate skips that slot).
 */
import { ArrowUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { FOCUS_RING, ROUND } from './chat-kit';
import type { Slots } from './composer-slots';
import type { VoiceNote } from '@/hooks/use-voice-note';
import type { ComposerDictation } from './use-composer-dictation';
import { VoiceSlot } from './VoiceControls';

export function SendSlot({ slots, voice, dict, waiting, sendDisabled }: { slots: Slots; voice: VoiceNote; dict: ComposerDictation; waiting?: string; sendDisabled: boolean }) {
  if (waiting && slots.field) {
    return (
      <p role="status" data-composer-send data-testid="composer-send-status" className="flex min-h-10 max-w-[9rem] shrink-0 items-center px-1 text-xs font-medium leading-4 text-muted-foreground">
        {waiting}
      </p>
    );
  }
  return (
    <>
      <VoiceSlot slots={slots} voice={voice} dict={dict} />
      {slots.send && (
        <button type="submit" data-composer-send aria-label="Send" title="Send" disabled={sendDisabled} className={cn(ROUND, 'bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50', FOCUS_RING)}>
          <ArrowUp className="h-[18px] w-[18px]" aria-hidden="true" />
        </button>
      )}
    </>
  );
}
