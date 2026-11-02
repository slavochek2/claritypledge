/**
 * @file MessageParts.tsx
 * @description P1512 / P1592: the pieces of a message row that do not depend on the row's own
 * state — the author name, a reply's quote, a forward's / clarify's copied card, and the toolbar
 * buttons. Split out of MessageRow.tsx so that file stays under its size limit.
 */
import { useEffect, useState, type MouseEvent as ReactMouseEvent } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuth } from '@/auth';
import { cn } from '@/lib/utils';
import { getMessage, type ChatMessage } from '@/app/data/chat-service';
import type { ChatAuthor } from '@/app/data/chat-ui-helpers';
import { AuthorNameSkeleton, QuoteSkeleton } from './MessageRowPlaceholders';
import { AttachmentCard } from './AttachmentCard';
import { Quote } from './Quote';
import { FOCUS_RING, MirrorMark } from './chat-kit';
import { useChatNavigate } from './chat-hooks';
import { useChat } from './chat-state';
import { chatPath, messageSummary, mirrorName, sourceLabel } from './chat-view-model';
import type { MessageActions } from './MessageRow';

/** P1592: the small "Transcribed" pill beside a transcription's author and time. Not a button, not a link. */
export function TranscriptionTag({ className }: { className?: string }) {
  return (
    <span data-testid="transcription-label" className={cn('inline-flex w-fit shrink-0 items-center rounded-full border px-1.5 text-[11px] leading-4 text-muted-foreground', className)}>
      Transcribed
    </span>
  );
}

/**
 * The pill for a stored message: nothing unless it is a transcription that is not deleted. `grouped` is a message with
 * no author line, where the pill gets a line of its own above the words.
 */
export function TranscriptionMark({ msg, grouped = false, continues = false }: { msg: ChatMessage | null | undefined; grouped?: boolean; continues?: boolean }) {
  // `continues`: the message before is the same author's transcription, so the run already carries the pill.
  if (!msg?.isTranscription || msg.isDeleted || continues) return null;
  return grouped ? <div className="mb-0.5"><TranscriptionTag /></div> : <TranscriptionTag />;
}

/** A message's words: plain (a transcription is set like a typed message), or a bold title for a system post; "(edited)" only from edited_at. */
export function MessageNote({ body, editedAt, system }: { body: string; editedAt: string | null; system: boolean }) {
  return (
    <p
      data-testid={system ? 'system-title' : undefined}
      className={cn('whitespace-pre-wrap break-words text-[15px] leading-[22px] text-foreground', system && 'font-semibold')}
    >
      {body}
      {editedAt && <span className="ml-1.5 text-xs text-muted-foreground" data-testid="edited-mark">(edited)</span>}
    </p>
  );
}

export function AuthorName({ author, authorId, pending, className }: { author: ChatAuthor | undefined; authorId: string | null; pending: boolean; className?: string }) {
  if (!authorId) return <span className={cn('font-semibold text-muted-foreground', className)}>Deleted user</span>;
  // The profile is still on its way: a quiet bar, never a flash of "Unknown".
  if (pending) return <AuthorNameSkeleton />;
  const name = author?.name ?? 'Unknown member';
  if (!author?.slug) return <span className={cn('font-semibold', className)}>{name}</span>;
  return (
    <Link to={`/p/${author.slug}`} className={cn('font-semibold hover:underline hover:underline-offset-2', FOCUS_RING, className)}>
      {name}
    </Link>
  );
}

/**
 * The message a reply points at: its author and words, "Original message deleted", or not available.
 * A loaded source is read from the live message list, so an edit, a delete or an erasure shows at
 * once; a source that is not loaded is read once and again whenever the conversation re-syncs.
 */
export function QuoteBlock({ replyToId, actions, authors }: { replyToId: string; actions: MessageActions; authors: Record<string, ChatAuthor> }) {
  const [fetched, setFetched] = useState<ChatMessage | null | undefined>(undefined);
  const { lookup, getLoaded, version } = actions;
  const { missingAuthors } = useChat();
  const loaded = getLoaded(replyToId);
  useEffect(() => {
    if (loaded) return;
    let live = true;
    lookup(replyToId).then(
      (m) => live && setFetched(m),
      () => live && setFetched(null),
    );
    return () => {
      live = false;
    };
  }, [replyToId, lookup, loaded, version]);
  const quoted = loaded ?? fetched;
  if (quoted === undefined) return <QuoteSkeleton />;
  // P1592: a system post has no author; it is quoted by its title alone, never as "Deleted user".
  const system = !!quoted?.systemKind;
  const name = quoted?.authorId ? authors[quoted.authorId]?.name ?? (missingAuthors.has(quoted.authorId) ? 'Unknown member' : '') : 'Deleted user';
  const text = quoted === null ? 'Original message not available' : quoted.isDeleted ? 'Original message deleted' : messageSummary(quoted);
  const jumpable = !!quoted && !quoted.isDeleted;
  const unavailable = quoted === null || quoted.isDeleted;
  const bare = unavailable || system;
  return (
    <Quote
      testId="reply-quote"
      label={bare ? 'Reply' : `Reply to ${name}`}
      summary={bare ? text : `Reply to ${name}: ${text}`}
      body={<span className={cn('mt-0.5 block line-clamp-2 break-words text-sm text-muted-foreground', unavailable && 'italic')}>{text}</span>}
      onJump={jumpable ? () => actions.onJumpTo(quoted.id) : undefined}
      className="my-1"
    />
  );
}

/** Tap-to-jump: the source is read when pressed (through the reader's own access), not on every render. */
function useJumpToOriginal(sourceId: string | null) {
  const go = useChatNavigate();
  const [busy, setBusy] = useState(false);
  return async () => {
    if (!sourceId || busy) return;
    setBusy(true);
    try {
      const target = await getMessage(sourceId);
      if (target && !target.isDeleted) {
        // On top of where they are, so Back returns here.
        go(chatPath(target.conversationId, { rootId: target.threadRootId ?? undefined, messageId: target.id }), 'follow');
      } else {
        toast("The original isn't available to you any more.");
      }
    } catch {
      toast.error('Could not open the original. Try again.');
    } finally {
      setBusy(false);
    }
  };
}

type Snapshot = NonNullable<ChatMessage['forwardSnapshot']>;

/** "Forwarded from <name>", "Forwarded" (a system post has no author), or the Clarify line naming the source chat. */
function ForwardedLabel({ snap, clarify, mirror }: { snap: Snapshot; clarify: boolean; mirror: string }) {
  if (clarify) {
    return (
      <>
        <MirrorMark size="xs" className="mr-1 align-text-bottom" />Sent to {mirror} to clarify · from {sourceLabel(snap.conversationKind, snap.conversationTitle)}
      </>
    );
  }
  if (snap.systemKind) return <>Forwarded</>;
  return (
    <>
      Forwarded from <span className="font-semibold text-foreground">{snap.authorName}</span>
    </>
  );
}

function forwardSummary(snap: Snapshot, clarify: boolean, clarifiedAuthor: string): string {
  const who = snap.systemKind ? '' : clarify ? `, ${clarifiedAuthor}` : ` from ${snap.authorName}`;
  return `${clarify ? 'Clarify' : 'Forwarded'}${who}: ${snap.body ?? 'message removed'}`;
}

/** The copied words: a transcription keeps its pill, a system post its bold title alone. */
function SnapshotWords({ snap, clarify, clarifiedAuthor }: { snap: Snapshot; clarify: boolean; clarifiedAuthor: string }) {
  const words = cn('whitespace-pre-wrap break-words text-[15px] leading-[22px] text-foreground', snap.systemKind && 'font-semibold');
  return (
    <>
      {snap.isTranscription && snap.body && <span className="mt-1 block"><TranscriptionTag /></span>}
      {clarify && !snap.systemKind && (
        <span className="mt-1 block text-sm font-semibold text-foreground" data-testid="clarified-author">
          {clarifiedAuthor}
        </span>
      )}
      {snap.body && <span className={cn('mt-1 block', words)}>{snap.body}</span>}
    </>
  );
}

/** A Clarify's copy of the thread the message sat in. */
function ForwardedThread({ thread }: { thread: Snapshot['thread'] }) {
  return (
    <span className="mt-2 block space-y-1.5 border-t pt-2" data-testid="forwarded-thread">
      {thread.map((t, i) => (
        <span key={`${t.createdAt}-${i}`} className="block text-sm">
          {!t.systemKind && <span className="font-semibold text-foreground">{t.authorName}</span>}
          {t.body === null ? (
            <span className="text-muted-foreground"> · Message removed</span>
          ) : (
            <>
              {!t.systemKind && <span className="text-muted-foreground">: </span>}
              {t.isTranscription && <TranscriptionTag className="mr-1 align-middle" />}
              <span className={cn('whitespace-pre-wrap break-words text-foreground', t.systemKind && 'font-semibold')}>{t.body}</span>
            </>
          )}
        </span>
      ))}
    </span>
  );
}

export function ForwardedBody({ msg, viewerId }: { msg: ChatMessage; viewerId: string }) {
  const { chats } = useChat();
  const { user } = useAuth();
  const snap = msg.forwardSnapshot;
  // Hooks run before the early return: the jump target is null whenever there is no original to reach.
  const removed = !!snap && snap.body === null && !msg.attachmentKind;
  const hasOriginal = !!snap && !!msg.forwardedFromMessageId && !removed && (snap.authorName !== 'Deleted user' || !!snap.systemKind);
  const jump = useJumpToOriginal(hasOriginal ? msg.forwardedFromMessageId : null);
  if (!snap) return null;
  const clarify = msg.kind === 'clarify';
  // The clarifier owns the mirror: their own words read "You". Decided by the original author's id, never by a name
  // (two people can share one). No id (erased account, or a row without it) means the snapshot's name, which erasure
  // sets to "Deleted user".
  const clarifiedAuthor = user?.id && msg.forwardAuthorId === user.id ? 'You' : snap.authorName;
  // An erased author's text is gone from the copy too (removed, above): say so instead of showing an empty card;
  // and there is nowhere to go from a copy whose author was erased or whose text was removed (hasOriginal).
  return (
    <Quote
      testId={clarify ? 'clarified-card' : 'forwarded-card'}
      summary={forwardSummary(snap, clarify, clarifiedAuthor)}
      label={
        <>
          <ForwardedLabel snap={snap} clarify={clarify} mirror={mirrorName(chats.find((c) => c.kind === 'mirror'))} />
          {removed && <span data-testid="snapshot-removed"> · Message removed</span>}
        </>
      }
      onJump={hasOriginal ? () => void jump() : undefined}
      body={<SnapshotWords snap={snap} clarify={clarify} clarifiedAuthor={clarifiedAuthor} />}
    >
      {msg.attachmentKind && msg.attachmentId && <AttachmentCard kind={msg.attachmentKind} id={msg.attachmentId} viewerId={viewerId} compact />}
      {snap.thread.length > 0 && <ForwardedThread thread={snap.thread} />}
    </Quote>
  );
}

export function ToolButton({ label, onClick, children }: { label: string; onClick: (e: ReactMouseEvent<HTMLButtonElement>) => void; children: React.ReactNode }) {
  // Icons only, on purpose: five labelled buttons cannot share one row at 320, and an action bar that wraps
  // looks broken. The name is on the button for assistive tech and the hover tip; the long-press menu has the words.
  // Clarify is the one labelled button (ClarifyButton): it wears the mirror's face and the word.
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground lg:h-9 lg:w-9', FOCUS_RING)}
    >
      {children}
    </button>
  );
}

/**
 * Clarify: the mirror's face and the word. The name and tip say whose mirror ("Clarify with Ada's mirror").
 * Below 360px the word drops out (face only, still 40px) so the five buttons keep one row at 320.
 */
export function ClarifyButton({ mirror, onClick }: { mirror: string; onClick: () => void }) {
  const label = `Clarify with ${mirror}`;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      data-testid="clarify-button"
      className={cn('flex h-10 min-w-10 shrink-0 items-center justify-center gap-1.5 rounded-lg px-2 text-muted-foreground hover:bg-accent hover:text-foreground min-[360px]:px-2.5 lg:h-9 lg:px-2', FOCUS_RING)}
    >
      <MirrorMark size="xs" />
      <span className="hidden text-sm font-medium min-[360px]:inline">Clarify</span>
    </button>
  );
}

