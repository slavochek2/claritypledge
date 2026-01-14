import { Position, currentUser, User, getUserById, Idea } from '../../data/mock-data';

interface PositionBannerProps {
  userPosition: Position;
  profileUser?: User | null;
  profileUserPosition?: Position;
  idea?: Idea; // Pass idea to show others with same position
}

export function PositionBanner({
  userPosition,
  profileUser,
  profileUserPosition,
  idea,
}: PositionBannerProps) {
  // Determine what to show
  const isOtherUserContext = profileUser && profileUserPosition;
  const isSamePosition = isOtherUserContext && userPosition === profileUserPosition;

  if (!userPosition && !isOtherUserContext) return null;

  const getPositionText = (position: Position) => {
    if (position === 'agree') return 'agreed';
    if (position === 'disagree') return 'disagreed';
    return 'are unsure';
  };

  const getPositionTextThirdPerson = (position: Position) => {
    if (position === 'agree') return 'agreed';
    if (position === 'disagree') return 'disagreed';
    return 'is unsure';
  };

  const getPositionIcon = (position: Position) => {
    if (position === 'agree') return '✓';
    if (position === 'disagree') return '✗';
    return '?';
  };

  const getAvatarBg = (position: Position) => {
    if (position === 'agree') return 'bg-emerald-100';
    if (position === 'disagree') return 'bg-blue-100';
    return 'bg-gray-100';
  };

  const getIconColor = (position: Position) => {
    if (position === 'agree') return 'text-emerald-600';
    if (position === 'disagree') return 'text-blue-600';
    return 'text-gray-400';
  };

  // Other user's profile with same position
  if (isOtherUserContext && isSamePosition) {
    return (
      <div className="px-4 py-2 bg-gray-50 border-b border-gray-100 flex items-center gap-2">
        <span className={`w-6 h-6 rounded-full flex items-center justify-center text-sm ${getAvatarBg(profileUserPosition)}`}>
          {profileUser.avatar}
        </span>
        <span className={`w-6 h-6 rounded-full flex items-center justify-center text-sm -ml-3 ring-2 ring-white ${getAvatarBg(userPosition)}`}>
          {currentUser.avatar}
        </span>
        <span className="text-sm text-gray-700 ml-1">
          <span className="font-medium">You both</span>{' '}
          <span className="text-gray-500">{getPositionText(profileUserPosition)}</span>
        </span>
        <span className={getIconColor(profileUserPosition)}>
          {getPositionIcon(profileUserPosition)}
        </span>
      </div>
    );
  }

  // Other user's profile with different position (or user has no position)
  if (isOtherUserContext && !isSamePosition) {
    return (
      <div className="px-4 py-2 bg-gray-50 border-b border-gray-100 flex items-center gap-2">
        <span className={`w-6 h-6 rounded-full flex items-center justify-center text-sm ${getAvatarBg(profileUserPosition)}`}>
          {profileUser.avatar}
        </span>
        <span className="text-sm text-gray-700">
          {profileUser.name.split(' ')[0]}{' '}
          <span className="text-gray-500">{getPositionTextThirdPerson(profileUserPosition)}</span>
        </span>
        <span className={getIconColor(profileUserPosition)}>
          {getPositionIcon(profileUserPosition)}
        </span>
      </div>
    );
  }

  // Own profile or idea detail - show your position + others with same position
  if (userPosition) {
    // Find others with same position (up to 3)
    const othersWithSamePosition: User[] = [];
    if (idea) {
      for (const [userId, entry] of Object.entries(idea.positions)) {
        if (userId !== 'current' && entry?.position === userPosition) {
          const user = getUserById(userId);
          if (user) othersWithSamePosition.push(user);
          if (othersWithSamePosition.length >= 3) break;
        }
      }
    }

    const hasOthers = othersWithSamePosition.length > 0;

    return (
      <div className="px-4 py-2 bg-gray-50 border-b border-gray-100 flex items-center gap-2">
        {/* Your avatar */}
        <span className={`w-6 h-6 rounded-full flex items-center justify-center text-sm ${getAvatarBg(userPosition)}`}>
          {currentUser.avatar}
        </span>
        {/* Others' avatars stacked */}
        {othersWithSamePosition.map((user, i) => (
          <span
            key={user.id}
            className={`w-6 h-6 rounded-full flex items-center justify-center text-sm -ml-3 ring-2 ring-white ${getAvatarBg(userPosition)}`}
            style={{ zIndex: 10 - i }}
          >
            {user.avatar}
          </span>
        ))}
        <span className="text-sm text-gray-700 ml-1">
          {hasOthers ? (
            <>
              <span className="font-medium">You</span>
              <span className="text-gray-500"> and </span>
              <span className="font-medium">{othersWithSamePosition.length} other{othersWithSamePosition.length > 1 ? 's' : ''}</span>
              <span className="text-gray-500"> {getPositionText(userPosition)}</span>
            </>
          ) : (
            <>
              <span className="font-medium">You</span>{' '}
              <span className="text-gray-500">{getPositionText(userPosition)}</span>
            </>
          )}
        </span>
        <span className={getIconColor(userPosition)}>
          {getPositionIcon(userPosition)}
        </span>
      </div>
    );
  }

  return null;
}
