/**
 * @file use-clone-voice.ts
 * @description P1536 3c X9: the round voice button of a pending Clone. Its first note is the first Send (workspace-next-draft `openNextDraftByVoice`):
 * nothing is written until it is sent, and then the draft, the thread, the note and its run are made together on the server, which also starts the
 * run when the transcript lands.
 *
 * A recording lands on the target it was made for. The canvas and version are captured when a clip is FIRST submitted and kept with its stored upload,
 * so a Retry after the owner picked another version still goes to the first one; only a new recording takes the version on screen. The draft a Start over
 * replaces is re-read (the sheet asks again) within that identity only: a fresher revision of the same version's draft is used, another version's never.
 * A stale view with no draft to replace means a draft appeared elsewhere: the page re-reads (it shows that draft), and no stored clip is offered for a
 * target that no longer exists.
 */
import { useCallback, useRef } from 'react';
import { toast } from 'sonner';
import { VoiceNoteError, type VoiceUploadReceipt } from '@/app/data/chat-voice-service';
import { DRAFT_ERROR_TEXT } from '@/app/pages/chat/canvas-thread-copy';
import type { VoiceSender } from '@/hooks/use-voice-note';
import type { ClonePending } from './use-clone-canvas';
import { openNextDraftByVoice, type FirstVoiceResult } from './workspace-next-draft';

export interface CloneVoiceArgs {
  conversationId: string;
  projectTag: string;
  version: string | null;
  cloning: ClonePending;
  /** The first note is in flight (the Publish spot reads Updating…) or settled. */
  onSending: (sending: boolean) => void;
  /** The draft exists: the page should show it. */
  onOpened: (versionName: string) => void;
  /** The page's Clone state is out of date (the draft being replaced moved on, or one appeared): it re-reads and the sheet asks again. */
  onStale: () => void;
}

/** What a clip was recorded for: the canvas and version, and the draft its Start over replaced (as last known for that version). */
interface Identity { projectTag: string; version: string | null; replace: { draftId: string; revision: number } | null }

const replaceOf = (a: CloneVoiceArgs): Identity['replace'] => (a.cloning.replace ? { draftId: a.cloning.replace.id, revision: a.cloning.replace.revision } : null);

/** The identity a send uses: the one captured for a stored clip (its draft re-read within that version only), or the page's own for a new recording. */
function identityOf(a: CloneVoiceArgs, captured: Identity | undefined): Identity {
  if (!captured) return { projectTag: a.projectTag, version: a.version, replace: replaceOf(a) };
  return { ...captured, replace: a.version === captured.version && a.cloning.replace ? replaceOf(a) : captured.replace };
}

/** Which stored clip a refusal keeps: not for a "stale" with no draft to replace (the clip would be refused again, its target is gone). */
function keptReceipt(r: Exclude<FirstVoiceResult, { ok: true }>, identity: Identity): VoiceUploadReceipt | undefined {
  return 'receipt' in r && !(r.why === 'stale_view' && !identity.replace) ? r.receipt : undefined;
}

export function useCloneVoice(args: CloneVoiceArgs): VoiceSender {
  const latest = useRef(args);
  latest.current = args;
  /** By stored upload: the identity its first submission captured. */
  const identities = useRef(new Map<string, Identity>());
  return useCallback<VoiceSender>(async (wav, attempt) => {
    const a = latest.current;
    const resumeKey = attempt?.resume?.objectKey;
    const captured = resumeKey ? identities.current.get(resumeKey) : undefined;
    const identity = identityOf(a, captured); // refreshed within the identity only
    if (resumeKey && captured) identities.current.set(resumeKey, identity); // the refreshed revision is this clip's from now on
    a.onSending(true);
    try {
      const r = await openNextDraftByVoice({
        conversationId: a.conversationId, projectTag: identity.projectTag, version: identity.version, wav, resume: attempt?.resume, replace: identity.replace,
      });
      if (r.ok) {
        if (resumeKey) identities.current.delete(resumeKey); // sent: nothing to remember
        a.onOpened(r.versionName);
        return;
      }
      if (r.why === 'stale_view') a.onStale();
      // Nothing was stored for these two (the version could not be found or listed): Retry looks again. A refusal after the clip is stored keeps its receipt,
      // unless the target is gone: with no draft to replace, "stale" says a draft appeared elsewhere and the clip would be refused again.
      const keep = keptReceipt(r, identity);
      if (!('receipt' in r)) toast.error(DRAFT_ERROR_TEXT.FAILED);
      throw new VoiceNoteError('failed', 409, `canvas voice note not sent: ${r.why}`, keep);
    } catch (e) {
      // The clip's identity follows the stored upload wherever the failure comes from: a refusal above, or a commit that threw after the clip was stored.
      const kept = e instanceof VoiceNoteError ? e.receipt : undefined;
      if (kept) identities.current.set(kept.objectKey, identity);
      else if (resumeKey) identities.current.delete(resumeKey); // nothing kept for it any more
      throw e;
    } finally {
      a.onSending(false);
    }
  }, []);
}
