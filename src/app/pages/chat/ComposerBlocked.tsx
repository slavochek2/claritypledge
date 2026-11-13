/**
 * @file ComposerBlocked.tsx
 * @description The strip that replaces the composer when this person cannot send in the chat.
 */
import { Button } from '@/components/ui/button';

interface Props { unavailable: boolean; cannotSend: boolean; blocked: boolean; otherName?: string; onUnblock: () => void }

export function ComposerBlocked({ unavailable, cannotSend, blocked, otherName, onUnblock }: Props) {
  return (
    <div className="shrink-0 border-t px-3 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]" data-testid="composer-blocked">
      <div className="mx-auto flex w-full max-w-3xl flex-wrap items-center gap-3">
        <p className="min-w-0 flex-1 text-sm text-muted-foreground">
          {unavailable
            ? 'This person is no longer available, so you cannot send new messages here.'
            : cannotSend
              ? 'You cannot send messages in this chat.'
              : `You blocked ${otherName}. Unblock to send messages.`}
        </p>
        {blocked && (
          <Button variant="outline" className="min-h-10" onClick={onUnblock}>
            Unblock
          </Button>
        )}
      </div>
    </div>
  );
}
