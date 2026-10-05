/**
 * @file host-asks.tsx
 * @description P1387 / P1337: who asks the understanding question, and the question in their own
 * voice. One home for both, used by the preparation (EventPrepPage) and the event room
 * (EventRoomMeet) so the two never drift: a small host avatar and one line ("{host} · Your event
 * host"), then "How much do you think you understand my intended meaning behind this principle?".
 */
import { GravatarAvatar } from '@/components/ui/gravatar-avatar';
import type { EventWithHost } from '@/app/types';

export const HOST_VOICED_UNDERSTANDING_QUESTION =
  'How much do you think you understand my intended meaning behind this principle?';

type Host = Pick<EventWithHost, 'hostName' | 'hostAvatarUrl' | 'hostAvatarColor' | 'hostHasPledged'>;

export function HostAvatar({ event, size }: { event: Host; size: 'sm' | 'md' | 'xl' }) {
  return (
    <GravatarAvatar
      name={event.hostName}
      photoUrl={event.hostAvatarUrl ?? undefined}
      avatarColor={event.hostAvatarColor}
      isPledger={event.hostHasPledged ?? false}
      size={size}
    />
  );
}

/** The line above the rating: the host's photo, name and role. */
export function HostAsksLine({ event, className }: { event: Host; className?: string }) {
  return (
    <div className={className ?? 'flex items-center gap-2 px-2 pb-1 sm:px-5'} data-testid="rating-host">
      <HostAvatar event={event} size="sm" />
      <p className="text-sm font-semibold text-foreground">
        {event.hostName} <span className="font-normal text-muted-foreground">· Your event host</span>
      </p>
    </div>
  );
}
