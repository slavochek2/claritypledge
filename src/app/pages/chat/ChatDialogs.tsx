/**
 * @file ChatDialogs.tsx
 * @description P1512: the chat's dialogs — confirm, forward, attach and rename the mirror. All are
 * shadcn Dialogs: focus is trapped, Escape closes, and focus returns to the control that opened them.
 */
import { ShareableCard } from './ShareableCard';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowLeft, Forward, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { forwardMessage, renameMirror, type ChatMessage, type ChatSummary } from '@/app/data/chat-service';
import { filterShareables, loadMyShareables, type Shareable } from '@/app/data/chat-ui-helpers';
import { ChannelMark, ChatRowTitle, FOCUS_RING, HOVER, InlineError, MirrorMark, PRIMARY_CLASS, PersonMark } from './chat-kit';
import { chatErrorText, chatTitle, messageSummary } from './chat-view-model';

/** Phone dialogs float with a side margin and rounded corners all round (the base only rounds from sm up). */
const DIALOG = 'w-[calc(100vw-2rem)] rounded-lg sm:max-w-sm';
const SHEET = '[&>button.absolute]:top-2 flex max-h-[85dvh] w-[calc(100vw-2rem)] flex-col gap-0 overflow-hidden rounded-lg p-0 sm:w-full sm:max-w-md';
const SHEET_HEAD = 'flex min-h-14 shrink-0 justify-center border-b px-4 py-2 pr-14 text-left';

// ---------------------------------------------------------------------------
// Confirm
// ---------------------------------------------------------------------------
export function ConfirmDialog({
  title,
  description,
  confirmLabel,
  onConfirm,
  onClose,
}: {
  title: string;
  description: ReactNode;
  confirmLabel: string;
  onConfirm: () => Promise<void> | void;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      await onConfirm();
      onClose();
    } catch (e) {
      setError(chatErrorText(e));
      setBusy(false);
    }
  };
  return (
    <Dialog open onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className={DIALOG}>
        <DialogHeader className="text-left">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {error && (
          <p role="alert" className="text-sm text-red-700">
            {error}
          </p>
        )}
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="ghost" className="min-h-10 text-muted-foreground" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="destructive" className="min-h-10" onClick={() => void run()} disabled={busy}>
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Forward
// ---------------------------------------------------------------------------
function ChatMark({ chat }: { chat: ChatSummary }) {
  if (chat.kind === 'mirror') return <MirrorMark size="sm" />;
  if (chat.kind === 'dm') return <PersonMark person={chat.other ?? { name: 'Deleted user', deleted: true }} size="sm" />;
  return <ChannelMark kind={chat.kind} size="sm" />;
}

export function ForwardDialog({
  source,
  authorName,
  chats,
  revalidate,
  onClose,
  onForwarded,
}: {
  source: ChatMessage;
  authorName: string;
  /** The chats the person can forward into (already filtered to those they can post to). */
  chats: ChatSummary[];
  /** Reads the chat list again, so a chat that closed to new messages since the picker opened is caught. */
  revalidate: () => Promise<ChatSummary[] | null>;
  onClose: () => void;
  onForwarded: (target: ChatSummary) => void;
}) {
  const [target, setTarget] = useState<ChatSummary | null>(null);
  // One key per target for the life of the dialog: pressing Send again after a lost reply replays the same
  // forward, also after going to another chat and back.
  const attemptKeys = useRef(new Map<string, string>());
  const [query, setQuery] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const q = query.trim().toLowerCase();
  const shown = chats.filter((c) => !q || chatTitle(c).toLowerCase().includes(q));

  const send = async () => {
    if (!target) return;
    setBusy(true);
    setError(null);
    try {
      const fresh = await revalidate();
      const now = fresh?.find((c) => c.conversationId === target.conversationId);
      if (fresh && (!now || !now.canSend)) {
        setError('You can no longer send messages in that chat.');
        setBusy(false);
        return;
      }
      let clientId = attemptKeys.current.get(target.conversationId);
      if (!clientId) {
        clientId = crypto.randomUUID();
        attemptKeys.current.set(target.conversationId, clientId);
      }
      await forwardMessage(source.id, target.conversationId, note.trim() || undefined, clientId);
      onForwarded(target);
      onClose();
    } catch (e) {
      setError(chatErrorText(e, 'Could not forward. Try again.'));
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className={SHEET}>
        <DialogHeader className={SHEET_HEAD}>
          <DialogTitle className="flex items-center gap-2 text-base">
            {target && (
              <button type="button" aria-label="Back to chats" onClick={() => setTarget(null)} className={cn('-ml-2 flex h-10 w-10 items-center justify-center rounded-full', HOVER, FOCUS_RING)}>
                <ArrowLeft className="h-5 w-5" aria-hidden="true" />
              </button>
            )}
            {target ? (
              <span className="flex min-w-0 flex-1">
                <span className="shrink-0 whitespace-pre">Forward to </span>
                <ChatRowTitle chat={target} />
              </span>
            ) : (
              <span className="min-w-0 truncate">Forward to</span>
            )}
          </DialogTitle>
          <DialogDescription className="sr-only">Choose a chat to forward this message to.</DialogDescription>
        </DialogHeader>
        {target ? (
          <>
            <div className="min-h-0 flex-1 overflow-y-auto p-4" data-testid="forward-preview">
              <div className="rounded-xl border bg-muted/40 p-3">
                <p className="text-xs font-medium text-muted-foreground">
                  Forwarded from <span className="font-semibold text-foreground">{source.forwardSnapshot?.authorName ?? authorName}</span>
                </p>
                <p className="mt-1 line-clamp-4 whitespace-pre-wrap break-words text-sm text-foreground">
                  {source.forwardSnapshot?.body ?? messageSummary(source)}
                </p>
              </div>
              <label className="mt-3 block text-sm text-foreground">
                Add a note (optional)
                <input
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  maxLength={4000}
                  className="mt-1 block min-h-11 w-full rounded-lg border bg-background px-3 text-base outline-none focus:border-gray-500 md:text-sm"
                />
              </label>
              {error && (
                <p role="alert" className="mt-2 text-sm text-red-700">
                  {error}
                </p>
              )}
            </div>
            <div className="shrink-0 border-t p-3">
              <Button className={`${PRIMARY_CLASS} min-h-11 w-full`} disabled={busy} onClick={() => void send()}>
                <Forward className="h-4 w-4" aria-hidden="true" />
                Send
              </Button>
            </div>
          </>
        ) : (
          <>
            <div className="shrink-0 px-3 pt-3">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search chats"
                aria-label="Search chats"
                className="min-h-11 w-full rounded-full bg-muted px-4 text-base outline-none md:text-sm"
              />
            </div>
            <ul className="min-h-0 flex-1 overflow-y-auto py-2">
              {shown.map((c) => (
                <li key={c.conversationId}>
                  <button type="button" onClick={() => setTarget(c)} className={cn('flex min-h-14 w-full items-center gap-3 px-4 text-left', HOVER, FOCUS_RING)}>
                    <ChatMark chat={c} />
                    <ChatRowTitle chat={c} stacked className="flex-1 text-[15px] text-foreground" />
                  </button>
                </li>
              ))}
              {shown.length === 0 && <li className="px-4 py-8 text-center text-sm text-muted-foreground">No chat matches.</li>}
            </ul>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Attach
// ---------------------------------------------------------------------------
export function AttachDialog({ viewerId, onPick, onClose }: { viewerId: string; onPick: (s: Shareable) => void; onClose: () => void }) {
  const [state, setState] = useState<{ status: 'loading' } | { status: 'error' } | { status: 'ready'; items: Shareable[] }>({ status: 'loading' });
  const [kind, setKind] = useState<'point' | 'story'>('point');
  const [query, setQuery] = useState('');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    setState({ status: 'loading' });
    loadMyShareables(viewerId).then(
      (items) => live && setState({ status: 'ready', items }),
      () => live && setState({ status: 'error' }),
    );
    return () => {
      live = false;
    };
  }, [viewerId, attempt]);

  const items = state.status === 'ready' ? filterShareables(state.items, query, kind) : [];

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className={cn(SHEET, 'sm:max-w-lg')}>
        <DialogHeader className={SHEET_HEAD}>
          <DialogTitle className="text-base">Attach a point or story</DialogTitle>
          <DialogDescription className="sr-only">Pick one of your own points or stories to send.</DialogDescription>
        </DialogHeader>
        <div className="shrink-0 space-y-2 px-3 pt-3">
          <div role="tablist" aria-label="Kind" className="flex gap-1 border-b">
            {(['point', 'story'] as const).map((k) => (
              <button
                key={k}
                type="button"
                role="tab"
                aria-selected={kind === k}
                onClick={() => setKind(k)}
                className={cn('min-h-11 border-b-2 px-4 text-sm font-medium', FOCUS_RING, kind === k ? 'border-blue-600 text-blue-700' : 'border-transparent text-muted-foreground hover:text-foreground')}
              >
                {k === 'point' ? 'Points' : 'Stories'}
              </button>
            ))}
          </div>
          <label className="flex min-h-11 items-center gap-2 rounded-full bg-muted px-3 text-muted-foreground">
            <Search className="h-4 w-4 shrink-0" aria-hidden="true" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search words or #tags"
              aria-label="Search points and stories"
              className="min-w-0 flex-1 bg-transparent text-base text-foreground outline-none md:text-sm"
            />
          </label>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {state.status === 'loading' && (
            <div role="status" aria-busy="true" aria-label="Loading your points and stories" className="space-y-2 p-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-16 animate-pulse rounded-xl bg-muted" />
              ))}
            </div>
          )}
          {state.status === 'error' && <InlineError what="your points and stories" onRetry={() => setAttempt((a) => a + 1)} />}
          {state.status === 'ready' && (
            <ul className="space-y-2 p-3" data-testid="attach-results">
              {items.map((s) => (
                <li key={s.id} className="relative">
                  {/* The feed's own card, read-only: inert keeps its links, buttons and menu out of reach,
                      and one overlay button makes the whole card the single selectable control. */}
                  <ShareableCard item={s} />
                  <button
                    type="button"
                    onClick={() => onPick(s)}
                    aria-label={`Attach ${s.title}`}
                    className={cn('absolute inset-0 rounded-xl [@media(hover:hover)]:hover:bg-accent/30', FOCUS_RING)}
                  />
                </li>
              ))}
              {items.length === 0 && (
                <li className="px-3 py-8 text-center text-sm text-muted-foreground">
                  {state.items.some((s) => s.kind === kind) ? 'Nothing matches. Try fewer words or another #tag.' : `You have no ${kind === 'point' ? 'points' : 'stories'} to attach yet.`}
                </li>
              )}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Rename the mirror
// ---------------------------------------------------------------------------
export function RenameMirrorDialog({ initial, role, onClose, onSaved }: { initial: string; /** The role as it is shown next to the name, e.g. "Mia's mirror". */ role: string; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const trimmed = name.trim();
  const valid = trimmed.length >= 1 && trimmed.length <= 60;
  const save = async () => {
    if (!valid) return;
    setBusy(true);
    setError(null);
    try {
      await renameMirror(trimmed);
      onSaved();
      onClose();
    } catch (e) {
      setError(chatErrorText(e, 'Could not rename. Try again.'));
      setBusy(false);
    }
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className={DIALOG}>
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <DialogHeader className="text-left">
            <DialogTitle>Rename your mirror</DialogTitle>
            <DialogDescription>Its role, “{role}”, always stays next to the name.</DialogDescription>
          </DialogHeader>
          <label className="block text-sm text-foreground">
            Name
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={60}
              autoFocus
              className="mt-1 block min-h-11 w-full rounded-lg border bg-background px-3 text-base outline-none focus:border-gray-500 md:text-sm"
            />
            <span className="mt-1 block text-xs text-muted-foreground">1 to 60 characters</span>
          </label>
          {error && (
            <p role="alert" className="text-sm text-red-700">
              {error}
            </p>
          )}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="ghost" className="min-h-10 text-muted-foreground" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" className={PRIMARY_CLASS} disabled={!valid || busy}>
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
