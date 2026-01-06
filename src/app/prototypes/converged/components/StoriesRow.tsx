import { useNavigate } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { users, currentUser, getUsersWithUnviewedActivity, getUnviewedActivityCount } from '../data/mock-data';
import { routes } from '../config';
import { cn } from '@/lib/utils';

interface StoryAvatarProps {
  user: typeof users[0];
  hasUnviewed: boolean;
  badgeCount: number;
  isCurrentUser?: boolean;
  onClick: () => void;
}

function StoryAvatar({ user, hasUnviewed, badgeCount, isCurrentUser, onClick }: StoryAvatarProps) {
  const hasBadge = badgeCount > 0;

  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center gap-1 min-w-[64px]"
    >
      <div className="relative">
        {/* Avatar with optional ring */}
        <div
          className={cn(
            "w-16 h-16 rounded-full p-[3px]",
            hasBadge ? "bg-gradient-to-tr from-blue-500 to-blue-400" : "bg-gray-200"
          )}
        >
          <div className="w-full h-full rounded-full bg-white p-[2px]">
            <div className="w-full h-full rounded-full bg-gray-100 flex items-center justify-center text-2xl">
              {user.avatar}
            </div>
          </div>
        </div>

        {/* Badge */}
        {hasBadge && (
          <div className="absolute -top-1 -right-1 min-w-[20px] h-5 bg-blue-500 rounded-full flex items-center justify-center px-1.5">
            <span className="text-xs font-semibold text-white">
              {badgeCount > 9 ? '9+' : badgeCount}
            </span>
          </div>
        )}

        {/* Plus icon for current user */}
        {isCurrentUser && (
          <div className="absolute bottom-0 right-0 w-5 h-5 bg-blue-500 rounded-full flex items-center justify-center border-2 border-white">
            <Plus size={12} className="text-white" strokeWidth={3} />
          </div>
        )}
      </div>

      <span className="text-[11px] text-gray-600 font-medium truncate max-w-[60px]">
        {isCurrentUser ? 'You' : user.name.split(' ')[0]}
      </span>
    </button>
  );
}

export function StoriesRow() {
  const navigate = useNavigate();
  const usersWithActivity = getUsersWithUnviewedActivity();

  // Order: Current user first, then users with activity, then others
  const otherUsers = users.filter(u =>
    u.id !== 'current' && !usersWithActivity.some(a => a.id === u.id)
  );
  const orderedUsers = [currentUser, ...usersWithActivity, ...otherUsers];

  const handleStoryClick = (userId: string) => {
    if (userId === 'current') {
      // Could open create modal or show own activity
      navigate(routes.profile);
    } else {
      navigate(routes.story(userId));
    }
  };

  return (
    <div className="bg-white border-b border-gray-100">
      <div className="flex gap-3 px-4 py-3 overflow-x-auto scrollbar-hide">
        {orderedUsers.map((user) => {
          const badgeCount = getUnviewedActivityCount(user.id);

          return (
            <StoryAvatar
              key={user.id}
              user={user}
              hasUnviewed={user.hasUnviewedActivity}
              badgeCount={badgeCount}
              isCurrentUser={user.id === 'current'}
              onClick={() => handleStoryClick(user.id)}
            />
          );
        })}
      </div>
    </div>
  );
}
