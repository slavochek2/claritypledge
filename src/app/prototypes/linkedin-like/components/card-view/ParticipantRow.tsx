/**
 * @file ParticipantRow.tsx
 * @description Horizontal scrollable row of participant avatars for navigation.
 *
 * Behavior:
 * - Tap avatar = navigate to that person's profile
 * - Shows name below avatar (Instagram-style)
 * - Uses GravatarAvatar for consistent styling with rest of app
 */
import { useNavigate } from 'react-router-dom';
import { GravatarAvatar } from '@/components/ui/gravatar-avatar';
import { routes } from '../../config';
import type { User } from '../../../shared/types';

interface ParticipantRowProps {
  participants: User[];
  currentUserId?: string;
}

export function ParticipantRow({ participants, currentUserId = 'current' }: ParticipantRowProps) {
  const navigate = useNavigate();

  const handleClick = (userId: string) => {
    // Navigate to user's profile
    if (userId === currentUserId) {
      navigate(routes.profile);
    } else {
      navigate(routes.profileById(userId));
    }
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

        return (
          <button
            key={user.id}
            onClick={() => handleClick(user.id)}
            className="flex-shrink-0 flex flex-col items-center gap-1 group"
            aria-label={`View ${user.name}'s profile`}
          >
            <div className="transition-transform group-hover:scale-105 group-active:scale-95">
              <GravatarAvatar
                name={user.name}
                size="sm"
                isPledger={user.hasPledged}
              />
            </div>
            <span className="text-xs text-gray-600 group-hover:text-gray-900 transition-colors max-w-[60px] truncate">
              {isCurrentUser ? 'You' : getShortName(user.name)}
            </span>
          </button>
        );
      })}
    </div>
  );
}
