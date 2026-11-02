/**
 * @file use-clone-voice.ts
 * @description P1536 3c X9: the round voice button of a pending Clone. Its first note is the first Send (workspace-next-draft `openNextDraftByVoice`):
 * nothing is written until it is sent, and then the draft, the thread, the note and its run are made together on the server, which also starts the
 * run when the transcript lands. The sender reads the Clone's state when it runs (a ref), so a Retry after "the draft being replaced moved on" carries
 * what the sheet asked again, and a refusal keeps the clip stored for that Retry.
 */
import { useCallback, useRef } from 'react';
import { toast } from 'sonner';
import { VoiceNoteError } from '@/app/data/chat-voice-service';
import { DRAFT_ERROR_TEXT } from '@/app/pages/chat/canvas-thread-copy';
import type { VoiceSender } from '@/hooks/use-voice-note';
import type { ClonePending } from './use-clone-canvas';
import { openNextDraftByVoice } from './workspace-next-draft';

export interface CloneVoiceArgs {
  conversationId: string;
  projectTag: string;
  version: string | null;
  cloning: ClonePending;
  /** The first note is in flight (the Publish spot reads Updating…) or settled. */
  onSending: (sending: boolean) => void;
  /** The draft exists: the page should show it. */
  onOpened: (versionName: string) => void;
  /** The draft being replaced (J4 "Start over") moved on: the sheet asks again. */
  onStale: () => void;
}

export function useCloneVoice(args: CloneVoiceArgs): VoiceSender {
  const latest = useRef(args);
  latest.current = args;
  return useCallback<VoiceSender>(async (wav, attempt) => {
    const a = latest.current;
    a.onSending(true);
    try {
      const r = await openNextDraftByVoice({
        conversationId: a.conversationId, projectTag: a.projectTag, version: a.version, wav, resume: attempt?.resume,
        replace: a.cloning.replace ? { draftId: a.cloning.replace.id, revision: a.cloning.replace.revision } : null,
      });
      if (r.ok) {
        a.onOpened(r.versionName);
        return;
      }
      if (r.why === 'stale_view') a.onStale();
      // Nothing was stored for these two (the version could not be found or listed): Retry looks again. A refusal after the clip is stored keeps its receipt.
      const receipt = 'receipt' in r ? r.receipt : undefined;
      if (!receipt) toast.error(DRAFT_ERROR_TEXT.FAILED);
      throw new VoiceNoteError('failed', 409, `canvas voice note not sent: ${r.why}`, receipt);
    } finally {
      a.onSending(false);
    }
  }, []);
}
