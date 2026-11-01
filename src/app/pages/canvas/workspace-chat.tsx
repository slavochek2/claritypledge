/**
 * @file workspace-chat.tsx
 * @description P1536 D4: the workspace's chat pane, in every state it can be in (each one is a drawn state, never a bare empty box):
 *  - the page is still reading: a section Skeleton (P1586);
 *  - an open draft: that draft's thread in the owner's mirror chat. When the page shows ANOTHER version than the draft (the owner is
 *    looking at v2 while a v3 draft is open), a line above the thread says the chat edits the draft and offers "Go to draft"; a
 *    run that starts moves the page there (J4: the chat edits the open draft, §2: Publish and Updating… follow the draft);
 *  - a Clone pending (W3; `ws=1` on a published version with no open draft IS one, however it was entered): the Clone line and a live composer, with Upload. Nothing is
 *    written until the first Send, which opens the next draft from the version on screen; the page then moves to it and its thread
 *    shows here. A Clone started over another base's draft (J4 "Start over") passes that draft, and the Send discards it;
 *  - the open draft's header reads `Draft · vN` beside Discard (W6), a pending Clone's `New draft from vN` with no Discard (× cancels there);
 *  - drafting unavailable, or the draft in another chat: an explicit "could not load" with Retry.
 */
import { useContext, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useAuth } from '@/auth';
import { Skeleton } from '@/components/ui/skeleton';
import { isViewingDraft, nextSeqOf, type CanvasReady } from '@/app/components/canvas/canvas-page-data';
import { CANVAS_SECONDARY_PILL } from '@/app/components/canvas/canvas-pill-styles';
import type { ChatSummary } from '@/app/data/chat-service';
import { InlineError } from '@/app/pages/chat/chat-kit';
import { ChatContext } from '@/app/pages/chat/chat-state';
import { CanvasUploadButton } from '@/app/pages/chat/CanvasUploadButton';
import { Composer } from '@/app/pages/chat/Composer';
import { ThreadHeader } from '@/app/pages/chat/ThreadHeader';
import { ThreadPanel } from '@/app/pages/chat/ThreadPanel';
import { DiscardDraftButton } from './discard-draft-button';
import type { ClonePending } from './use-clone-canvas';
import { DRAFT_ERROR_TEXT } from '@/app/pages/chat/canvas-thread-copy';
import { resetCanvasAvailability, useCanvasDraftAvailability } from '@/app/pages/chat/use-canvas-availability';
import { uploadRefusalText } from '@/app/pages/chat/use-canvas-uploads';
import { openNextDraft, type NextDraftResult } from './workspace-next-draft';

// [FOUNDER DECISION: the two strings of the draft line shown when the page is on another version than the open draft.]
export const DRAFT_LINE_TEXT = 'This chat edits your draft.';
export const GO_TO_DRAFT_LABEL = 'Go to draft';
// [FOUNDER DECISION: shown when a first Send names a version this list cannot find; the sentence the New version button already used.]
const NO_VERSION_TEXT = 'Could not find this version to start from.';

// [FOUNDER DECISION: shown when the list of your canvas versions cannot be read at the first Send.]
const VERSIONS_FAILED_TEXT = 'Could not load your canvas versions. Try again.';
// [FOUNDER DECISION: nothing published and no draft; the same sentence the canvas header shows the owner.]
const NOTHING_PUBLISHED_TEXT = 'Nothing published yet';
// W3: the pending Clone's empty thread (the spec quotes this line).
const cloneLine = (seq: number | null): string => `Clone ${seq ? `v${seq}` : 'this version'}. Nothing changes for readers until you publish.`;

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

function EmptyChatBody({ ready, projectTag, focusable, onOpened, onRunActive, onRetry, cloning, onStale, onClose }: {
  ready: CanvasReady; projectTag: string; focusable: boolean; onOpened: (versionName: string) => void; onRunActive: (active: boolean) => void; onRetry: () => void;
  cloning: ClonePending; onStale: () => void; onClose: () => void;
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
      const r = await openNextDraft({ projectTag, version: ready.version, replace: cloning.replace ? { draftId: cloning.replace.id, revision: cloning.replace.revision } : null, ...args });
      if (r.ok) {
        onOpened(r.versionName);
        if (r.fileRefusal) toast.error(uploadRefusalText(r.fileRefusal)); // the draft exists now; its first file did not go through
      } else if (r.why === 'stale_view') onStale(); // the draft being replaced moved on: the sheet asks again, the text stays in the composer
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
      {/* The panel's header: × closes the panel, or cancels a pending Clone (the owner's onClose decides). */}
      <ThreadHeader onClose={onClose}>
        <h2 className="truncate text-base font-semibold text-foreground" data-testid="canvas-thread-title">{cloning.seq ? `New draft from v${cloning.seq}` : 'New draft'}</h2>
      </ThreadHeader>
      <div className="flex min-h-0 flex-1 items-center justify-center p-6 text-center" data-testid="workspace-chat-empty">
        <p className="text-sm text-muted-foreground">{cloneLine(cloning.seq)}</p>
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

function EmptyChat(props: { ready: CanvasReady; projectTag: string; focusable: boolean; onOpened: (versionName: string) => void; onRunActive: (active: boolean) => void; cloning: ClonePending; onStale: () => void; onClose: () => void }) {
  const [attempt, setAttempt] = useState(0);
  // Retry asks the server again (a failed availability check is not remembered as "off").
  return <EmptyChatBody key={attempt} {...props} onRetry={() => { resetCanvasAvailability(); setAttempt(n => n + 1); }} />;
}

function DraftLine({ onGo }: { onGo: () => void }) {
  return (
    <div className="flex shrink-0 items-center justify-between gap-2 border-b px-3 py-2" data-testid="workspace-draft-line">
      <p className="min-w-0 text-sm text-muted-foreground">{DRAFT_LINE_TEXT}</p>
      <button type="button" className={CANVAS_SECONDARY_PILL} onClick={onGo} data-testid="workspace-go-to-draft">{GO_TO_DRAFT_LABEL}</button>
    </div>
  );
}

export function WorkspaceChat({ mirror, ready, projectTag, canvasTitle, focusable, onClose, onRunActive, onOpened, onReload, cloning = null, onStale = () => undefined }: {
  mirror: ChatSummary | null;
  ready: CanvasReady | null;
  projectTag: string | null;
  /** W8: the canvas's shown name (the owner's rename, else its tag's title): what an update draft's header links to. */
  canvasTitle?: string;
  focusable: boolean;
  onClose: () => void;
  onRunActive: (active: boolean) => void;
  /** The page should show this draft version (after a first Send, or "Go to draft"). */
  onOpened: (versionName: string) => void;
  /** Ask the canvas page to read again (Retry when the draft is in another chat). */
  onReload?: () => void;
  /** W3: a Clone is pending on the version on screen (nothing written). Its thread is empty even when another base's draft is open. */
  cloning?: ClonePending | null;
  /** W3/J4: the first Send found the draft it should replace changed: ask again. */
  onStale?: () => void;
}) {
  const { user } = useAuth();
  const [attempt, setAttempt] = useState(0);
  const chat = useContext(ChatContext);
  // Never for anyone who is not the canvas's owner, whatever the address says (defence in depth: the route gives them no workspace at all).
  if (!mirror || !ready || !ready.isOwner) return <Waiting />;
  const draft = ready.draft;
  if (cloning && projectTag && !isViewingDraft(ready)) return <EmptyChat ready={ready} projectTag={projectTag} focusable={focusable} onOpened={onOpened} onRunActive={onRunActive} cloning={cloning} onStale={onStale} onClose={onClose} />;
  if (!draft) {
    if (ready.publishedNone || !projectTag) {
      return (
        <div className="flex min-h-0 flex-1 items-center justify-center p-6 text-center" data-testid="workspace-chat-empty">
          <p className="text-sm text-muted-foreground">{NOTHING_PUBLISHED_TEXT}</p>
        </div>
      );
    }
    return <EmptyChat ready={ready} projectTag={projectTag} focusable={focusable} onOpened={onOpened} onRunActive={onRunActive} cloning={{ version: ready.version ?? '', seq: ready.versions.find(v => v.name === ready.version)?.seq ?? null, replace: null }} onStale={onStale} onClose={onClose} />;
  }
  if (draft.conversationId !== mirror.conversationId) return <Unavailable text={DRAFT_ERROR_TEXT.NOT_AVAILABLE} onRetry={() => { void chat?.refresh().catch(() => undefined); onReload?.(); setAttempt(n => n + 1); }} />;
  return (
    <>
      {!isViewingDraft(ready) && <DraftLine onGo={() => onOpened(draft.version)} />}
      <ThreadPanel key={`${draft.threadRootId}:${attempt}`} fill summary={mirror} rootId={draft.threadRootId} highlightId={null} canvasTitle={canvasTitle} panelTitle={`Draft · v${nextSeqOf(ready.versions)}`} focusable={focusable} onClose={onClose} onRunActive={onRunActive}
        headerActions={user?.slug && projectTag ? <DiscardDraftButton ready={ready} ownerSlug={user.slug} canvasName={projectTag} /> : undefined} />
    </>
  );
}
