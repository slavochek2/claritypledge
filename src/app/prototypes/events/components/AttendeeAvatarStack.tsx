/**
 * @file AttendeeAvatarStack.tsx
 * @description The event card's attendee avatar stack (up to 4 overlapping avatars + "+N"),
 * moved out of EventCard.tsx unchanged so P1336's registration onboarding can show the same
 * stack instead of a copy. Markup and classes are byte-for-byte EventCard's.
 */
import type { EventAttendee, PersonRef } from '@/app/types';
import { PersonAvatar } from '@/components/ui/person-avatar';

type StackAttendee = Pick<EventAttendee, 'profileId' | 'name' | 'slug' | 'avatarColor' | 'avatarUrl' | 'hasPledged'>;

/** P1336 opt-in: `size="lg"` draws 40px faces (the preparation's social proof). Default "sm" is
 *  the event card's 28px stack, unchanged. */
const STACK_SIZES = {
  sm: { row: '-space-x-2', face: 'w-7 h-7 border-2 border-white' },
  lg: { row: '-space-x-3', face: 'w-10 h-10 border-2 border-white' },
} as const;

export function AttendeeAvatarStack({ attendees, size = 'sm' }: { attendees: StackAttendee[]; size?: keyof typeof STACK_SIZES }) {
  if (attendees.length === 0) return null;
  const sz = STACK_SIZES[size];
  return (
    <div className={`flex ${sz.row}`}>
      {attendees.slice(0, 4).map((attendee, i) => (
        <div key={attendee.profileId} style={{ zIndex: 4 - i }} className="relative">
          <PersonAvatar
            person={{
              name: attendee.name,
              slug: attendee.slug,
              avatarColor: attendee.avatarColor,
              avatarUrl: attendee.avatarUrl,
              hasPledged: attendee.hasPledged,
            } satisfies PersonRef}
            size="sm"
            className={sz.face}
          />
        </div>
      ))}
      {attendees.length > 4 && (
        <div className={`${sz.face} rounded-full bg-gray-200 flex items-center justify-center text-xs font-medium text-gray-600`}>
          +{attendees.length - 4}
        </div>
      )}
    </div>
  );
}
