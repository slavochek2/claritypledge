/**
 * @file workspace-chat.tsx
 * @description P1536 D4: the workspace's chat pane, in every state it can be in (each one is a drawn state, never a bare empty box):
 *  - the page is still reading: a section Skeleton (P1586);
 *  - an open draft: that draft's thread in the owner's mirror chat. When the page shows ANOTHER version than the draft (the owner is
 *    looking at v2 while a v3 draft is open), a line above the thread says the chat edits the draft and offers "Go to draft"; a
 *    run that starts moves the page there (J4: the chat edits the open draft, §2: Publish and Updating… follow the draft);
 *  - no open draft on a published canvas (J3): the empty state and a live composer, with Upload. Nothing is written until the first
 *    Send, which opens the next draft from the version on screen; the page then moves to it and its thread shows here;
 *  - drafting unavailable, or the draft in another chat: an explicit "could not load" with Retry.
 */
import { useContext, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useAuth } from '@/auth';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { isViewingDraft, type CanvasReady } from '@/app/components/canvas/canvas-page-data';
import type { ChatSummary } from '@/app/data/chat-service';
import { InlineError } from '@/app/pages/chat/chat-kit';
import { ChatContext } from '@/app/pages/chat/chat-state';
import { CanvasUploadButton } from '@/app/pages/chat/CanvasUploadButton';
import { Composer } from '@/app/pages/chat/Composer';
import { ThreadPanel } from '@/app/pages/chat/ThreadPanel';
import { DRAFT_ERROR_TEXT } from '@/app/pages/chat/canvas-thread-copy';
import { resetCanvasAvailability, useCanvasDraftAvailability } from '@/app/pages/chat/use-canvas-availability';
import { WORKSPACE_EMPTY_TEXT, openNextDraft, type NextDraftResult } from './workspace-next-draft';

// [FOUNDER DECISION: the two strings of the draft line shown when the page is on another version than the open draft.]
export const DRAFT_LINE_TEXT = 'This chat edits your draft.';
export const GO_TO_DRAFT_LABEL = 'Go to draft';
// [FOUNDER DECISION: shown when a first Send names a version this list cannot find; the sentence the New version button already used.]
const NO_VERSION_TEXT = 'Could not find this version to start from.';

// [FOUNDER DECISION: shown when the list of your canvas versions cannot be read at the first Send.]
const VERSIONS_FAILED_TEXT = 'Could not load your canvas versions. Try again.';
// [FOUNDER DECISION: nothing published and no draft; the same sentence the canvas header shows the owner.]
const NOTHING_PUBLISHED_TEXT = 'Nothing published yet';

function Waiting() {
  return (
    <div role="status" aria-busy="true" className="flex-1 px-4 py-6" data-testid="workspace-chat-loading">
      <Skeleton className="h-5 w-2/3" />
      <span className="sr-only">Loading your draft</span>
    </div>
  );
}

function Unavailable({ text, onRetry }: { text?: string; onRetry: () => void }) {
  return (
    <div className="flex flex-1 flex-col justify-center" data-testid="workspace-chat-unavailable">
      {text && <p className="px-6 text-center text-sm text-muted-foreground">{text}</p>}
      <InlineError what="this chat" onRetry={onRetry} compact />
    </div>
  );
}

function failureText(r: NextDraftResult): string | null {
  if (r.ok) return null;
  if (r.why === 'no_version') return NO_VERSION_TEXT;
  if (r.why === 'versions_failed') return VERSIONS_FAILED_TEXT;
  if (r.why === 'too_large') return DRAFT_ERROR_TEXT.TOO_LARGE ?? '';
  return DRAFT_ERROR_TEXT.FAILED ?? '';
}

function EmptyChatBody({ ready, projectTag, focusable, onOpened, onRunActive, onRetry }: {
  ready: CanvasReady; projectTag: string; focusable: boolean; onOpened: (versionName: string) => void; onRunActive: (active: boolean) => void; onRetry: () => void;
}) {
  const { user } = useAuth();
  const on = useCanvasDraftAvailability(true);
  const [sending, setSending] = useState(false);
  // The first Send is work in flight (D15): the Publish spot reads Updating… meanwhile, and lets go when this goes away.
  useEffect(() => {
    onRunActive(sending);
    return () => onRunActive(false);
  }, [sending, onRunActive]);
  if (on === null) return <Waiting />;
  if (!on || !user) return <Unavailable text={DRAFT_ERROR_TEXT.DISABLED} onRetry={onRetry} />;
  const run = async (args: { body?: string; file?: File }): Promise<boolean> => {
    setSending(true);
    try {
      const r = await openNextDraft({ projectTag, version: ready.version, ...args });
      if (r.ok) onOpened(r.versionName);
      else toast.error(failureText(r));
      return r.ok;
    } catch {
      toast.error(DRAFT_ERROR_TEXT.FAILED); // the outcome is unknown: the same message, sent again, replays (workspace-next-draft)
      return false;
    } finally {
      setSending(false);
    }
  };
  return (
    <>
      <div className="flex min-h-0 flex-1 items-center justify-center p-6 text-center" data-testid="workspace-chat-empty">
        <p className="text-sm text-muted-foreground">{WORKSPACE_EMPTY_TEXT}</p>
      </div>
      <Composer
        draftKey={`${user.id}:workspace:${projectTag}`}
        placeholder="Reply in thread"
        autoFocus={focusable}
        sendDisabled={sending}
        onSend={body => (body ? run({ body }) : false)}
        leading={<CanvasUploadButton busy={sending} onPick={file => { if (file) void run({ file }); }} />}
      />
    </>
  );
}

function EmptyChat(props: { ready: CanvasReady; projectTag: string; focusable: boolean; onOpened: (versionName: string) => void; onRunActive: (active: boolean) => void }) {
  const [attempt, setAttempt] = useState(0);
  // Retry asks the server again (a failed availability check is not remembered as "off").
  return <EmptyChatBody key={attempt} {...props} onRetry={() => { resetCanvasAvailability(); setAttempt(n => n + 1); }} />;
}

function DraftLine({ onGo }: { onGo: () => void }) {
  return (
    <div className="flex shrink-0 items-center justify-between gap-2 border-b px-3 py-2" data-testid="workspace-draft-line">
      <p className="min-w-0 text-sm text-muted-foreground">{DRAFT_LINE_TEXT}</p>
      <Button type="button" variant="outline" className="h-10 shrink-0" onClick={onGo} data-testid="workspace-go-to-draft">{GO_TO_DRAFT_LABEL}</Button>
    </div>
  );
}

export function WorkspaceChat({ mirror, ready, projectTag, focusable, onClose, onRunActive, onOpened, onReload }: {
  mirror: ChatSummary | null;
  ready: CanvasReady | null;
  projectTag: string | null;
  focusable: boolean;
  onClose: () => void;
  onRunActive: (active: boolean) => void;
  /** The page should show this draft version (after a first Send, or "Go to draft"). */
  onOpened: (versionName: string) => void;
  /** Ask the canvas page to read again (Retry when the draft is in another chat). */
  onReload?: () => void;
}) {
  const [attempt, setAttempt] = useState(0);
  const chat = useContext(ChatContext);
  if (!mirror || !ready) return <Waiting />;
  const draft = ready.draft;
  if (!draft) {
    if (ready.publishedNone || !projectTag) {
      return (
        <div className="flex min-h-0 flex-1 items-center justify-center p-6 text-center" data-testid="workspace-chat-empty">
          <p className="text-sm text-muted-foreground">{NOTHING_PUBLISHED_TEXT}</p>
        </div>
      );
    }
    return <EmptyChat ready={ready} projectTag={projectTag} focusable={focusable} onOpened={onOpened} onRunActive={onRunActive} />;
  }
  if (draft.conversationId !== mirror.conversationId) return <Unavailable text={DRAFT_ERROR_TEXT.NOT_AVAILABLE} onRetry={() => { void chat?.refresh().catch(() => undefined); onReload?.(); setAttempt(n => n + 1); }} />;
  return (
    <>
      {!isViewingDraft(ready) && <DraftLine onGo={() => onOpened(draft.version)} />}
      <ThreadPanel key={`${draft.threadRootId}:${attempt}`} fill summary={mirror} rootId={draft.threadRootId} highlightId={null} focusable={focusable} onClose={onClose} onRunActive={onRunActive} />
    </>
  );
}
