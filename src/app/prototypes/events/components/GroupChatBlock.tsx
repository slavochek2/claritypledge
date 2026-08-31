import { MessagesSquare, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { classifyGroupChat } from '../group-chat-utils';
import { safeLinkHref } from '../location-utils';

interface GroupChatBlockProps {
  /** Null for anyone the service refused — never a value the caller must remember not to render. */
  url: string | null;
  /** Show the locked, reason-to-register state instead of nothing at all. */
  showLockedState?: boolean;
  /** P955: the event page already has a full-width primary (RSVP). Secondary there, primary on the confirm page. */
  variant?: 'secondary' | 'primary';
}

/**
 * P1194: the event's group chat, as a button rather than a sentence in the middle
 * of a description. Two states and no third: a registered attendee gets the link,
 * everyone else gets the reason to register — never a hidden link in the payload.
 */
export function GroupChatBlock({ url, showLockedState = false, variant = 'secondary' }: GroupChatBlockProps) {
  if (!url) {
    if (!showLockedState) return null;
    return (
      <div
        className="flex items-start gap-3 p-4 rounded-lg border border-dashed border-border text-muted-foreground"
        data-testid="group-chat-locked"
      >
        <Lock className="w-4 h-4 mt-0.5 flex-shrink-0" />
        <p className="text-sm">
          {/* Founder-authored, 2026-08-31. */}
          Register and you'll get an invitation to our private WhatsApp group, right here — last-minute changes,
          cancellations, and coordinating rides to the mountain. Many come by motorbike, so if you
          need a lift, just ask.
        </p>
      </div>
    );
  }

  const { label } = classifyGroupChat(url);
  const href = safeLinkHref(url);
  if (!href) return null;

  return (
    <div data-testid="group-chat-block">
      <Button
        asChild
        size="lg"
        variant={variant === 'primary' ? 'default' : 'outline'}
        className="w-full gap-2"
      >
        <a href={href} target="_blank" rel="noopener noreferrer" data-testid="group-chat-link">
          <MessagesSquare className="w-4 h-4" />
          {label}
        </a>
      </Button>
      <p className="text-xs text-muted-foreground mt-2 text-center">
        {/* Founder-authored, 2026-08-31. */}
        Last-minute changes, cancellations, and getting there. Many come by motorbike — if you need a
        lift, ask in the group.
      </p>
    </div>
  );
}
