/**
 * @file transcribe-room-frame.tsx
 * @description /transcribe: ONE frame for the join, the room and the ended view (founder: Stop never navigates; the view changes in
 * place, so the container, its width, its top padding and the Back do not move). Also the compact "Session ended" banner that takes the
 * place of the controls, with its one action. Split out of transcribe-room-page.tsx (its size limit).
 */
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';

/** The same box in every view: clears the old nav (or not, in the shell) the same way, 44px under the Back. */
export function RoomFrame({ children, testId, claim }: { children: ReactNode; testId: string; claim?: ReactNode }) {
  return (
    <div className="flex flex-col h-full min-h-0" data-testid={testId}>
      {claim}
      <div
        data-clears-nav="1"
        className="max-w-2xl mx-auto px-4 pb-[calc(5rem+env(safe-area-inset-bottom))] lg:pb-4 pt-[calc(4rem+env(safe-area-inset-top)+1rem)] lg:pt-[calc(5rem+env(safe-area-inset-top)+1rem)] flex flex-col flex-1 min-h-0 w-full"
      >
        {children}
      </div>
    </div>
  );
}

/** [FOUNDER DECISION: copy, proposed] The compact banner that replaces info / Pause / Stop once the session has ended. */
export const SESSION_ENDED = 'Session ended';
export const OPEN_CHAT = 'Open chat';
export const SEE_YOUR_TRANSCRIPT = 'See your transcript';

/** "Session ended" and ONE action: the chat for a chat room, otherwise session history. Real links: they navigate only when tapped. */
export function EndedBanner({ conversationId }: { conversationId: string | null }) {
  const to = conversationId ? `/chats/c/${conversationId}` : '/sessions';
  return (
    <div className="flex min-w-0 items-center gap-2" data-testid="transcribe-ended-banner">
      <span className="truncate text-sm font-medium text-foreground">{SESSION_ENDED}</span>
      <Button asChild variant="secondary" className="min-h-11 shrink-0">
        <Link to={to}>{conversationId ? OPEN_CHAT : SEE_YOUR_TRANSCRIPT}</Link>
      </Button>
    </div>
  );
}
