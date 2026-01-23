/**
 * @file ParticipantRow.tsx
 * @description Horizontal scrollable row of participant avatars for navigation.
 *
 * Behavior:
 * - Tap avatar = opens card view of that person's content (Telegram stories style)
 * - Shows name below avatar (Instagram-style)
 * - Uses GravatarAvatar for consistent styling with rest of app
 */
import { GravatarAvatar } from '@/components/ui/gravatar-avatar';
import type { User } from '../../../shared/types';

interface ParticipantRowProps {
  participants: User[];
  currentUserId?: string;
  /** Called when avatar is tapped - opens their content in card view */
  onAvatarClick?: (userId: string) => void;
  /** Currently selected user (shows ring around avatar) */
  selectedUserId?: string | null;
}

export function ParticipantRow({
  participants,
  currentUserId = 'current',
  onAvatarClick,
  selectedUserId,
}: ParticipantRowProps) {
  const handleClick = (userId: string) => {
    onAvatarClick?.(userId);
  };

  // Get first name or short name for display
  const getShortName = (name: string) => {
    const firstName = name.split(' ')[0];
    return firstName.length > 8 ? firstName.slice(0, 7) + '…' : firstName;
  };

  return (
    <div
      className="flex items-start gap-3 overflow-x-auto scrollbar-hide py-2 -mx-4 px-4"
      role="navigation"
      aria-label="Participants"
    >
      {participants.map((user) => {
        const isCurrentUser = user.id === currentUserId;
        const isSelected = user.id === selectedUserId;

        return (
          <button
            key={user.id}
            onClick={() => handleClick(user.id)}
            className="flex-shrink-0 flex flex-col items-center gap-1 group"
            aria-label={`View ${user.name}'s stories`}
          >
            <div className={`transition-transform group-hover:scale-105 group-active:scale-95 ${
              isSelected ? 'ring-2 ring-blue-500 ring-offset-2 rounded-full' : ''
            }`}>
              <GravatarAvatar
                name={user.name}
                size="sm"
                isPledger={user.hasPledged}
              />
            </div>
            <span className={`text-xs transition-colors max-w-[60px] truncate ${
              isSelected ? 'text-blue-600 font-medium' : 'text-gray-600 group-hover:text-gray-900'
            }`}>
              {isCurrentUser ? 'You' : getShortName(user.name)}
            </span>
          </button>
        );
      })}
    </div>
  );
}
