/**
 * @file capture-chat-link.tsx
 * @description P1604 (founder final look): "Transcribing into {chat name}", the name linking to the chat. Shown in the bar and on the
 * room page for a recording that belongs to a chat; nothing for a room with no chat. The name is the chat's name FOR THIS PERSON,
 * read from the server (the other person of a DM, the group, the event); until it arrives the link says "this chat".
 */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getMyRoomStates } from '@/app/data/room-transcription-state';
import { THIS_CHAT, TRANSCRIBING_INTO, transcribingInto } from './capture-copy';

export function CaptureChatLink({ roomId, conversationId, className = '' }: { roomId: string | null; conversationId: string | null; className?: string }) {
  const [name, setName] = useState<string | null>(null);
  useEffect(() => {
    setName(null);
    if (!roomId || !conversationId) return;
    let live = true;
    void getMyRoomStates([roomId]).then((got) => { if (live) setName(got.get(roomId)?.chatName ?? null); });
    return () => { live = false; };
  }, [roomId, conversationId]);
  if (!conversationId) return null;
  const label = name ?? THIS_CHAT;
  return (
    <span className={`truncate text-xs text-muted-foreground ${className}`} title={transcribingInto(label)} data-testid="capture-chat-hint">
      {TRANSCRIBING_INTO}
      <Link to={`/chats/c/${conversationId}`} className="underline hover:text-foreground">{label}</Link>
    </span>
  );
}
