/**
 * @file NewMessageDialog.tsx
 * @description P1512: the "+" next to the chat search. A "New message" picker: a search field and the
 * people the person may message (the server's own rule: a Clarity Partner, or someone who shares a
 * group or an event). The empty search lists the first people alphabetically; typing narrows it.
 * Picking someone opens the 1:1 they already have, or starts one. The last row invites a Clarity Partner.
 *
 * A dialog from sm up and a full-height sheet on a phone. Escape or Close gives focus back to the "+".
 */
import { useEffect, useRef, useState, type RefObject } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { Search, UserPlus, X } from 'lucide-react';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { searchPeople, startDm, type ChatPerson } from '@/app/data/chat-service';
import { FOCUS_RING, HOVER, InlineError, PersonMark } from './chat-kit';
import { focusOpenComposer, requestComposerFocus, useChatNavigate } from './chat-hooks';
import { useChat } from './chat-state';
import { chatErrorText, chatPath, INVITE_PARTNER_PATH } from './chat-view-model';

const DEBOUNCE_MS = 250;
/** A read that has not answered by now is a failure (with Retry), never an endless "Loading…". */
export const PICKER_TIMEOUT_MS = 10_000;
/** The server returns at most this many people per search. */
const PAGE = 20;

/** Full height on a phone, a centred dialog from sm up (the primitive's zoom / slide is switched off so the sheet does not shrink as it opens). */
const SHEET =
  'left-0 top-0 flex h-[100dvh] max-h-none w-full max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden rounded-none border-0 p-0 ' +
  // On a phone the sheet reaches under the notch and the home bar: keep its header and its last row clear of both.
  'pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] sm:pt-0 sm:pb-0 ' +
  'data-[state=open]:!zoom-in-100 data-[state=open]:!slide-in-from-left-0 data-[state=open]:!slide-in-from-top-0 ' +
  'data-[state=closed]:!zoom-out-100 data-[state=closed]:!slide-out-to-left-0 data-[state=closed]:!slide-out-to-top-0 ' +
  'sm:left-[50%] sm:top-[50%] sm:h-[min(640px,85dvh)] sm:max-w-md sm:translate-x-[-50%] sm:translate-y-[-50%] sm:rounded-lg sm:border';

type State = { status: 'loading' } | { status: 'error' } | { status: 'ready'; people: ChatPerson[]; forQuery: string };

export function NewMessageDialog({
  returnFocus,
  onClose,
}: {
  /** The "+" that opened this, given focus back on close. */
  returnFocus: RefObject<HTMLElement | null>;
  onClose: () => void;
}) {
  const go = useChatNavigate();
  const { chats, refresh } = useChat();
  const input = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<State>({ status: 'loading' });
  const [starting, setStarting] = useState<string | null>(null);
  const q = query.trim();
  // Alive while the dialog is mounted: a pick that outlives it must not navigate afterwards. `picked`: a pick
  // navigated, so the new chat already holds focus and closing must not pull it back to the "+".
  const alive = useRef(true);
  const picked = useRef(false);
  // Retry reads at once; only typing waits for a pause.
  const retryNow = useRef(false);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  useEffect(() => {
    let live = true;
    let giveUp: ReturnType<typeof setTimeout> | undefined;
    // The first read (nothing typed) and a Retry are not debounced; typing waits for a pause.
    const delay = retryNow.current || !q ? 0 : DEBOUNCE_MS;
    retryNow.current = false;
    const timer = setTimeout(
      () => {
        // Loading shows only once a read is actually in flight, so keystrokes inside the pause never flash it
        // over a list or an error that is still there. An answer for an older query is ignored (`live`).
        setState((s) => (s.status === 'ready' ? s : { status: 'loading' }));
        // A read that never answers ends in an error with Retry, never an endless "Loading…".
        giveUp = setTimeout(() => live && setState({ status: 'error' }), PICKER_TIMEOUT_MS);
        searchPeople(q).then(
          (people) => {
            clearTimeout(giveUp);
            if (live) setState({ status: 'ready', people, forQuery: q });
          },
          () => {
            clearTimeout(giveUp);
            if (live) setState({ status: 'error' });
          },
        );
      },
      delay,
    );
    return () => {
      live = false;
      clearTimeout(timer);
      clearTimeout(giveUp);
    };
  }, [q, attempt]);

  // People who share a display name get their handle on the row (only those: a unique name needs no help).
  const nameCount = new Map<string, number>();
  if (state.status === 'ready') {
    for (const p of state.people) nameCount.set(p.name.trim().toLowerCase(), (nameCount.get(p.name.trim().toLowerCase()) ?? 0) + 1);
  }
  const reason = (p: ChatPerson) => ((nameCount.get(p.name.trim().toLowerCase()) ?? 0) > 1 && p.slug ? `${p.shared} · @${p.slug}` : p.shared);

  // Showing the list of an earlier query while the current one is typed or on its way.
  const busy = state.status === 'ready' && state.forQuery !== q;

  const pick = async (person: ChatPerson) => {
    setStarting(person.id);
    try {
      const id = person.dmConversationId ?? (await startDm(person.id));
      if (!alive.current) return;
      // A chat this device has not heard of yet (just started, or made on another device): read the list again
      // before opening it, so it opens as a chat and not as "not available".
      if (!chats.some((c) => c.conversationId === id)) {
        const fresh = await refresh();
        if (!alive.current) return;
        if (!fresh?.some((c) => c.conversationId === id)) {
          toast.error('Could not open this chat. Try again.');
          setStarting(null);
          return;
        }
      }
      picked.current = true;
      // The cursor goes into that chat's composer: now if it is the one already open, on arrival otherwise.
      if (go(chatPath(id)) !== 'none') requestComposerFocus(id);
      onClose();
    } catch (e) {
      if (!alive.current) return;
      toast.error(chatErrorText(e, 'Could not start this chat.'));
      setStarting(null);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        className={SHEET}
        hideCloseButton
        data-testid="new-message"
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          input.current?.focus();
        }}
        onCloseAutoFocus={(e) => {
          e.preventDefault();
          if (picked.current) focusOpenComposer();
          else returnFocus.current?.focus();
        }}
      >
        {/* Title and Close share one row, Close vertically centred on it: ghost until hovered, a 40px target, like the Me sheet's. */}
        <DialogHeader className="flex min-h-14 shrink-0 flex-row items-center justify-between gap-2 space-y-0 border-b px-4 py-2 text-left">
          <DialogTitle className="min-w-0 truncate text-base">New message</DialogTitle>
          <DialogDescription className="sr-only">Choose someone you share a group, an event or a partnership with.</DialogDescription>
          <DialogClose asChild>
            <button
              type="button"
              aria-label="Close"
              className={cn('-mr-2 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground', FOCUS_RING)}
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          </DialogClose>
        </DialogHeader>
        <div className="shrink-0 px-3 pt-3">
          <label className="flex min-h-11 items-center gap-2 rounded-full bg-muted px-3 text-muted-foreground focus-within:ring-2 focus-within:ring-ring">
            <Search className="h-4 w-4 shrink-0" aria-hidden="true" />
            <input
              ref={input}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search people"
              aria-label="Search people"
              className="min-w-0 flex-1 bg-transparent text-base text-foreground outline-none placeholder:text-muted-foreground md:text-sm [&::-webkit-search-cancel-button]:hidden"
            />
          </label>
        </div>
        <div className="relative min-h-0 flex-1 overflow-y-auto py-2" data-testid="new-message-people" aria-busy={busy || undefined}>
          {busy && <div role="status" aria-label="Searching" className="absolute inset-x-0 top-0 h-0.5 animate-pulse bg-blue-500" />}
          {state.status === 'loading' && (
            <p role="status" className="px-4 py-6 text-center text-sm text-muted-foreground">
              Loading…
            </p>
          )}
          {state.status === 'error' && (
            <InlineError
              what="people"
              onRetry={() => {
                retryNow.current = true;
                setAttempt((n) => n + 1);
              }}
            />
          )}
          {state.status === 'ready' && state.people.length > 0 && (
            <>
              <ul aria-label="People">
                {state.people.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      disabled={starting !== null}
                      onClick={() => void pick(p)}
                      className={cn('flex min-h-14 w-full items-center gap-3 px-4 text-left disabled:opacity-60', HOVER, FOCUS_RING)}
                    >
                      <PersonMark person={p} size="sm" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[15px] text-foreground">{p.name}</span>
                        <span className="block truncate text-xs text-muted-foreground">{reason(p)}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
              {state.people.length >= PAGE && <p className="px-4 pt-2 text-xs text-muted-foreground">Search to find someone else.</p>}
            </>
          )}
          {state.status === 'ready' && state.people.length === 0 && (
            <p className="px-6 py-8 text-center text-sm text-muted-foreground" data-testid="new-message-empty">
              {q
                ? 'No one matches. You can message people you share a group, an event or a partnership with.'
                : 'No one to message yet. You can message people you share a group, an event or a partnership with.'}
            </p>
          )}
        </div>
        <div className="shrink-0 border-t">
          <Link
            to={INVITE_PARTNER_PATH}
            onClick={onClose}
            className={cn('flex min-h-14 w-full items-center gap-3 px-4 text-[15px] font-medium text-foreground', HOVER, FOCUS_RING)}
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-foreground">
              <UserPlus className="h-4 w-4" aria-hidden="true" />
            </span>
            Invite a Clarity Partner
          </Link>
        </div>
      </DialogContent>
    </Dialog>
  );
}
