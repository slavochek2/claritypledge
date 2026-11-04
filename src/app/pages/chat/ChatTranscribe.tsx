/**
 * @file ChatTranscribe.tsx
 * @description P1604: transcription from a chat. The three-dot "Transcribe" item, the explanation shown the FIRST time a person
 * transcribes in a chat (consent is the terms; the server still records it on the tap), and the live-session line
 * ("{name} is transcribing", Join). Starting and joining are the same start: the server finds the chat's one open room or opens
 * it (a second tap while one is live joins it, session rule 1).
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Clock, Info, Mic, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/auth';
import { startVisiblePoll } from '@/lib/visible-poll';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useRoomCapture } from '@/app/contexts/room-capture-context';
import { LIVE_PHASES } from '@/app/contexts/room-capture-core';
import { getChatLiveTranscription, hasTranscribedInChat, type ChatLiveTranscription } from '@/app/data/chat-live-transcription';
import { getChatTranscriptionProcessing } from '@/app/data/room-transcription-state';
import type { ChatSummary } from '@/app/data/chat-service';
import { CHAT_EXPLANATION, LIVE_SESSION_JOIN, TRANSCRIBE_MENU_LABEL, TRANSCRIPT_FAILED, TRANSCRIPT_PROCESSING, liveSessionLine } from '@/app/components/session/capture-copy';

/** How often the live-session line re-reads while the chat is open. */
const LIVE_POLL_MS = 15_000;

/** The mirror is a person's own notes: it has no room. */
const canTranscribe = (chat: ChatSummary) => chat.kind !== 'mirror';

export function TranscribeMenuItem({ chat, onTranscribe }: { chat: ChatSummary; onTranscribe?: () => void }) {
  if (!canTranscribe(chat) || !onTranscribe) return null;
  return (
    <DropdownMenuItem className="min-h-11" onSelect={onTranscribe} data-testid="chat-transcribe-item">
      <Mic className="mr-2 h-4 w-4" aria-hidden="true" />
      {TRANSCRIBE_MENU_LABEL}
    </DropdownMenuItem>
  );
}

/** The live session and the sessions whose text is still coming, read together on ONE poll (never faster than LIVE_POLL_MS). */
interface ChatTranscribeState {
  live: ChatLiveTranscription | null;
  /** The state of this person's newest unfinished session here: processing beats failed (the clean text may still arrive). */
  preparing: 'processing' | 'failed' | null;
}

/** Re-read when the capture starts, stops or changes room: the line must not lag behind what the person just did. */
function useChatTranscribeState(conversationId: string, enabled: boolean, phase: string, roomId: string | null): ChatTranscribeState {
  const [state, setState] = useState<ChatTranscribeState>({ live: null, preparing: null });
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const read = () => void Promise.all([getChatLiveTranscription(conversationId), getChatTranscriptionProcessing(conversationId)]).then(([live, rows]) => {
      if (cancelled) return;
      const preparing = rows.some((r) => r.state === 'processing') ? 'processing' : rows.length > 0 ? 'failed' : null;
      setState({ live, preparing });
    });
    read();
    const stop = startVisiblePoll(read, LIVE_POLL_MS);   // nothing while the tab is hidden; one read the moment it is visible
    return () => {
      cancelled = true;
      stop();
    };
  }, [conversationId, enabled, phase, roomId]);
  return enabled ? state : { live: null, preparing: null };
}

/** Is this person already recording in this chat, whether the capture knows the chat or only its event (started from the event page)? */
function recordingHere(capture: { phase: string; conversationId: string | null; eventId: string | null }, chat: ChatSummary): boolean {
  if (!LIVE_PHASES.has(capture.phase as never)) return false;
  return capture.conversationId === chat.conversationId || (!!chat.event && capture.eventId === chat.event.id);
}

function ExplanationDialog({ busy, onConfirm, onClose }: { busy: boolean; onConfirm: () => void; onClose: () => void }) {
  return (
    <Dialog open onOpenChange={(o) => !o && !busy && onClose()}>
      {/* No X: the two buttons are the way out (Escape still closes). */}
      <DialogContent hideCloseButton className="w-[calc(100vw-2rem)] rounded-lg sm:max-w-sm" data-testid="chat-transcribe-explanation">
        <DialogHeader className="text-left">
          <div className="flex items-start justify-between gap-2">
            <DialogTitle>{CHAT_EXPLANATION.title}</DialogTitle>
            <Popover>
              <PopoverTrigger
                aria-label="More information"
                className="-mt-2 -mr-2 inline-flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full text-blue-700 hover:bg-blue-100"
              >
                <Info className="h-4 w-4" aria-hidden="true" />
              </PopoverTrigger>
              <PopoverContent className="text-sm">{CHAT_EXPLANATION.info}</PopoverContent>
            </Popover>
          </div>
          <DialogDescription>{CHAT_EXPLANATION.body}</DialogDescription>
        </DialogHeader>
        {/* Side by side at every width, each taking half (the phone default stacks them). */}
        <DialogFooter className="flex-row gap-2 space-x-0 sm:space-x-0">
          <Button variant="ghost" className="min-h-11 flex-1 text-muted-foreground" onClick={onClose} disabled={busy}>
            {CHAT_EXPLANATION.cancel}
          </Button>
          <Button className="min-h-11 flex-1" onClick={onConfirm} disabled={busy} aria-busy={busy}>
            {busy ? CHAT_EXPLANATION.starting : CHAT_EXPLANATION.confirm}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Wraps the chat's header: gives it the transcribe action, and renders the live-session line and the first-time explanation. */
export function ChatTranscribe({ chat, children }: { chat: ChatSummary; children: (onTranscribe: (() => void) | undefined) => ReactNode }) {
  const { user } = useAuth();
  const capture = useRoomCapture();
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const enabled = canTranscribe(chat);
  const { live, preparing } = useChatTranscribeState(chat.conversationId, enabled, capture.phase, capture.roomId);

  const start = useCallback(async () => {
    if (!user) return;
    setBusy(true);
    try {
      const result = await capture.startCapture({
        // an event chat names its event: recording that event's room from the event page is then the same place
        eventId: chat.kind === 'event' ? chat.event?.id ?? null : null,
        conversationId: chat.conversationId,
        displayName: user.name || user.email || 'Participant',
      });
      if (!result.started) {
        toast.error(result.reason === 'microphone'
          ? 'The microphone could not be opened, so nothing is being transcribed.'
          : 'Could not start transcribing. Please try again.');
      }
    } catch {
      toast.error('Could not start transcribing. Please try again.');
    } finally {
      setBusy(false);
      setAsking(false);
    }
  }, [user, capture, chat.conversationId, chat.kind, chat.event?.id]);

  /** First time in this chat: the explanation. Seen before (a seat in any room of this chat): one tap starts. Doubt shows the box. */
  const checking = useRef(false);
  const ask = useCallback(async () => {
    if (!user || checking.current) return;   // a second tap while the check or the start is in flight does nothing
    checking.current = true;
    try {
      const seen = await hasTranscribedInChat(chat.conversationId, user.id, chat.kind === 'event' ? chat.event?.id ?? null : null);
      if (seen) await start();
      else setAsking(true);
    } catch {
      setAsking(true);   // on doubt, show the box
    } finally {
      checking.current = false;
    }
  }, [user, chat.conversationId, chat.kind, chat.event?.id, start]);

  const showLine = enabled && live !== null && !live.iAmRecording && !recordingHere(capture, chat);
  return (
    <>
      {children(enabled ? () => void ask() : undefined)}
      {showLine && (
        <div className="flex min-h-11 shrink-0 items-center gap-3 border-b bg-muted/40 px-3 text-sm" data-testid="chat-live-session">
          <span className="min-w-0 flex-1 truncate">{liveSessionLine(live.starterName)}</span>
          <Button variant="outline" className="min-h-11" onClick={() => void ask()}>
            {LIVE_SESSION_JOIN}
          </Button>
        </div>
      )}
      {preparing && (
        // P1604 founder live test: after Stop and until the text is ready, say where the thread will appear. A still mark (no
        // spinner outside a control, P1586) and a 44px line, like the live line above it.
        <div className="flex min-h-11 shrink-0 items-center gap-2 border-b bg-muted/40 px-3 text-sm text-muted-foreground" data-testid="chat-transcription-state">
          {preparing === 'failed' ? <XCircle className="h-4 w-4 flex-shrink-0" aria-hidden="true" /> : <Clock className="h-4 w-4 flex-shrink-0" aria-hidden="true" />}
          <span className="min-w-0 truncate">{preparing === 'failed' ? TRANSCRIPT_FAILED : TRANSCRIPT_PROCESSING}</span>
        </div>
      )}
      {asking && <ExplanationDialog busy={busy} onConfirm={() => void start()} onClose={() => setAsking(false)} />}
    </>
  );
}
