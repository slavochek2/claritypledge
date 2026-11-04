/**
 * @file transcribe-chat-list.tsx
 * @description The room's live text, the same list in the running room and after Stop (the transcript stays on screen). Split out of
 * transcribe-room-page.tsx (its size limit).
 */
import type { RefObject } from 'react';
import { ArrowDown } from 'lucide-react';
import type { TranscribeRoomMember } from '@/app/data/transcribe-service';
import type { MergedRow } from '@/app/components/session/transcript-merge';

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export function TranscribeChatList({ rows, members, speaking, chatRef, onScroll, isAtBottom, scrollToBottom }: {
  rows: MergedRow[];
  members: TranscribeRoomMember[];
  speaking: ReadonlySet<string>;
  chatRef: RefObject<HTMLDivElement>;
  onScroll: () => void;
  isAtBottom: boolean;
  scrollToBottom: () => void;
}) {
  const lastRow = rows[rows.length - 1];
  return (
    <div className="relative flex-1 min-h-0 mb-4">
      <div ref={chatRef} onScroll={onScroll} className="h-full overflow-y-auto space-y-3" data-testid="transcribe-chat">
        {rows.map((row) => {
          const speaker = members.find((m) => m.id === row.memberId);
          const stillSpeaking = row === lastRow && speaking.has(row.memberId);
          return (
            <div key={row.key} className="text-sm" data-testid="transcribe-message">
              <span className="font-medium">{speaker?.displayName ?? 'Someone'}</span>{' '}
              <span className="text-xs text-muted-foreground">{formatTime(row.spokenAt)}</span>
              <p>
                {row.text}
                {stillSpeaking && (
                  <span className="text-muted-foreground" aria-label="still speaking" data-testid="transcribe-speaking">
                    {' '}…
                  </span>
                )}
              </p>
            </div>
          );
        })}
      </div>

      {/* Only while detached; not a primary action and never full-width (P955). */}
      {!isAtBottom && (
        <button
          type="button"
          onClick={() => scrollToBottom()}
          aria-label="Jump to newest"
          data-testid="transcribe-jump-to-newest"
          className="absolute bottom-2 right-2 w-11 h-11 rounded-full border bg-background shadow-md flex items-center justify-center text-muted-foreground hover:text-foreground"
        >
          <ArrowDown className="w-5 h-5" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
