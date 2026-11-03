/**
 * @file HiddenEventMark.tsx
 * @description P1603 the small "Hidden" mark: shown on the event page to its host and in the lists of the host and of
 * the registered, who are the only people a hidden event reaches through a list. Neutral gray status badge
 * (docs/design-system.md, Status Badges); gray is the "informational, not an action" colour.
 */
import { EyeOff } from 'lucide-react';

export function HiddenEventMark({ className = '' }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-muted text-muted-foreground border border-border ${className}`}
      data-testid="hidden-event-mark"
      title="Only people with the link can see this event"
    >
      <EyeOff className="w-3 h-3" />
      Hidden
    </span>
  );
}
