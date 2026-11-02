/**
 * @file transcribe-room-event-links.tsx
 * @description P1596 (founder, solo test 2026-11-02): an event's transcription page falls back to the event room and
 * says when the clean text comes, with a way to the table's chat. Other rooms keep the plain Back.
 */
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useRoomCapture } from '@/app/contexts/room-capture-context';
import { FocusHeader } from '@/app/components/layout/focus-header';
import { supabase } from '@/lib/supabase';
import { EVENT_TEXT_ARRIVES, resolveEventChatPath } from '@/app/data/event-chat-path';

async function readEventSlug(eventId: string): Promise<string | null> {
  const { data, error } = await supabase.from('events').select('slug').eq('id', eventId).maybeSingle();
  return error ? null : ((data as { slug?: string } | null)?.slug ?? null);
}

/** Back returns where the person came from; with nothing behind them, an event's capture lands in the event room. */
function TopBack({ eventId, fallback }: { eventId: string | null; fallback: string }) {
  const [slug, setSlug] = useState<string | null>(null);
  useEffect(() => {
    if (!eventId) return setSlug(null);
    let live = true;
    void readEventSlug(eventId).then((s) => { if (live) setSlug(s); }, () => {});
    return () => { live = false; };
  }, [eventId]);
  return <FocusHeader fallback={slug ? `/events/${slug}/room` : fallback} />;
}

/** The chat's place is resolved on the tap: the table changes every round, and a failed read can be retried. */
function EventTextNote({ eventId }: { eventId: string }) {
  const navigate = useNavigate();
  const [failed, setFailed] = useState(false);
  // One lookup at a time; leaving the page or changing event drops its answer, so it cannot pull the person away.
  const pending = useRef<object | null>(null);
  useEffect(() => () => { pending.current = null; }, [eventId]);
  const openChat = () => {
    if (pending.current) return;
    const mine = {};
    pending.current = mine;
    setFailed(false);
    const settle = (path: string | null) => {
      if (pending.current !== mine) return;
      pending.current = null;
      if (path) navigate(path);
      else setFailed(true);
    };
    void resolveEventChatPath(eventId).then(settle, () => settle(null));
  };
  return (
    <p className="mb-2 shrink-0 text-xs text-muted-foreground" data-testid="transcribe-event-note">
      This is the live draft. {EVENT_TEXT_ARRIVES}{' '}
      <button type="button" onClick={openChat} className="underline hover:text-foreground" data-testid="transcribe-open-chat">
        Open the chat
      </button>
      {failed && <span role="alert"> The chat could not be opened. Try again.</span>}
    </p>
  );
}

/** Stopping swaps this page for its ended screen, and capture forgets the event: the note outlives it here. */
let lastEventCapture: string | null = null;

/** "Now what?" on the ended screen of an event's capture (founder, solo test 2026-11-02). */
export function EndedEventNote() {
  return lastEventCapture ? <p className="text-sm text-muted-foreground mb-6" data-testid="transcribe-ended-event-note">{EVENT_TEXT_ARRIVES}</p> : null;
}

/** The page's top: its Back, and for a running event capture when the clean text comes. */
export function TranscribeRoomTop({ running, fallback }: { running: boolean; fallback: string }) {
  const { eventId } = useRoomCapture();
  const event = running ? eventId : null;
  lastEventCapture = event; // this page's room views only; a read-only or other room clears it
  return (
    <>
      {/* Tighter than FocusHeader's page default (mb-4): on a phone every row here is taken from the live transcript. */}
      <div className="shrink-0 -mt-2 [&>button]:mb-0" data-testid="transcribe-top-back">
        <TopBack eventId={event} fallback={fallback} />
      </div>
      {event && <EventTextNote eventId={event} />}
    </>
  );
}
