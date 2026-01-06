import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Settings, ChevronDown, ChevronUp, ArrowRight } from 'lucide-react';
import { getUserById, currentUser, positionChanges, getIdeaById, formatTimeAgo, getEngagedIdeas, getCurrentUserPosition, type ActivityFilter } from '../data/mock-data';
import { routes } from '../config';
import { BottomNav } from './BottomNav';
import { EmptyState } from './EmptyState';
import { ProfileIdeaCard } from './ProfileIdeaCard';

export function Profile() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [activeFilter, setActiveFilter] = useState<ActivityFilter>('all');
  const [showPositionChanges, setShowPositionChanges] = useState(false);

  // If no id param, show current user's profile
  const isOwnProfile = !id || id === 'current';
  const user = isOwnProfile ? currentUser : getUserById(id);

  if (!user) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600 mb-4">User not found</p>
          <button
            onClick={() => navigate(routes.feed)}
            className="text-blue-500 hover:underline"
          >
            Go back to feed
          </button>
        </div>
      </div>
    );
  }

  const engagedIdeas = getEngagedIdeas(user.id, activeFilter);

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* Header */}
      <header className="bg-white border-b border-gray-100 sticky top-0 z-40">
        <div className="flex items-center justify-between px-4 py-3">
          {!isOwnProfile ? (
            <button
              onClick={() => navigate(-1)}
              className="w-10 h-10 flex items-center justify-center text-gray-600 hover:bg-gray-100 rounded-full transition-colors"
              aria-label="Go back"
            >
              <ArrowLeft size={20} />
            </button>
          ) : (
            <div className="w-10" />
          )}
          <h1 className="text-lg font-semibold text-gray-900">Profile</h1>
          {isOwnProfile ? (
            <button
              className="w-10 h-10 flex items-center justify-center text-gray-600 hover:bg-gray-100 rounded-full transition-colors"
              aria-label="Settings"
            >
              <Settings size={20} />
            </button>
          ) : (
            <div className="w-10" />
          )}
        </div>
      </header>

      {/* Profile header */}
      <div className="bg-white px-4 py-6 border-b border-gray-100">
        <div className="flex items-start gap-4">
          <div className="w-20 h-20 rounded-full bg-gray-200 flex items-center justify-center text-4xl">
            {user.avatar}
          </div>
          <div className="flex-1">
            <h2 className="text-xl font-bold text-gray-900">{user.name}</h2>
            {user.role && (
              <p className="text-gray-500 text-sm mt-0.5">{user.role}</p>
            )}
            {user.bio && (
              <p className="text-gray-600 text-sm mt-2">{user.bio}</p>
            )}
          </div>
        </div>

        {/* Stats */}
        <div className="flex items-center gap-6 mt-6">
          <div className="text-center">
            <p className="text-2xl font-bold text-purple-600">
              {user.verifiedListenerScore.toFixed(1)}
            </p>
            <p className="text-xs text-gray-500">Listener Score</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-gray-900">
              {user.ideasEngaged}
            </p>
            <p className="text-xs text-gray-500">Ideas Engaged</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-gray-900">
              {getEngagedIdeas(user.id, 'verified').length}
            </p>
            <p className="text-xs text-gray-500">Verified</p>
          </div>
        </div>
      </div>

      {/* Activity Section */}
      <div className="px-4 py-6">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">
          {isOwnProfile ? 'Your Intellectual Journey' : `${user.name.split(' ')[0]}'s Journey`}
        </h2>

        {/* Filter tabs */}
        <div className="flex gap-2 mb-4 overflow-x-auto scrollbar-hide">
          {(['all', 'agreed', 'disagreed', 'verified'] as const).map((filter) => (
            <button
              key={filter}
              onClick={() => setActiveFilter(filter)}
              className={`
                px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap
                transition-colors min-h-[32px]
                ${activeFilter === filter
                  ? 'bg-gray-900 text-white'
                  : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'
                }
              `}
            >
              {filter.charAt(0).toUpperCase() + filter.slice(1)}
            </button>
          ))}
        </div>

        {/* Engaged Idea Cards */}
        {engagedIdeas.length === 0 ? (
          <EmptyState filter={activeFilter} isOwnProfile={isOwnProfile} />
        ) : (
          <div className="space-y-4">
            {engagedIdeas.map(item => (
              <ProfileIdeaCard
                key={item.idea.id}
                idea={item.idea}
                userPosition={item.position}
                otherUserPosition={isOwnProfile ? null : getCurrentUserPosition(item.idea.id)}
                isVerified={item.isVerified}
                isOwnProfile={isOwnProfile}
                userName={user.name}
                profileOwnerId={user.id}
              />
            ))}
          </div>
        )}
      </div>

      {/* Position Change Log (expandable) */}
      {isOwnProfile && positionChanges.length > 0 && (
        <div className="px-4 pb-4">
          <button
            onClick={() => setShowPositionChanges(!showPositionChanges)}
            className="w-full p-4 bg-purple-50 rounded-xl flex items-center justify-between"
          >
            <div>
              <h3 className="font-semibold text-purple-900">Position Change Log</h3>
              <p className="text-sm text-purple-700">
                {positionChanges.length} position{positionChanges.length !== 1 ? 's' : ''} changed
              </p>
            </div>
            {showPositionChanges ? (
              <ChevronUp size={20} className="text-purple-700" />
            ) : (
              <ChevronDown size={20} className="text-purple-700" />
            )}
          </button>

          {showPositionChanges && (
            <div className="mt-2 space-y-2">
              {positionChanges.map((change, idx) => {
                const idea = getIdeaById(change.ideaId);
                return (
                  <div
                    key={idx}
                    className="p-3 bg-white rounded-xl border border-purple-100"
                  >
                    <div className="flex items-center gap-2 text-sm">
                      <span
                        className={`
                          px-2 py-0.5 rounded text-xs font-medium
                          ${change.fromPosition === 'agree'
                            ? 'bg-emerald-100 text-emerald-700'
                            : change.fromPosition === 'disagree'
                              ? 'bg-red-100 text-red-700'
                              : 'bg-gray-100 text-gray-700'
                          }
                        `}
                      >
                        {change.fromPosition}
                      </span>
                      <ArrowRight size={14} className="text-gray-400" />
                      <span
                        className={`
                          px-2 py-0.5 rounded text-xs font-medium
                          ${change.toPosition === 'agree'
                            ? 'bg-emerald-100 text-emerald-700'
                            : change.toPosition === 'disagree'
                              ? 'bg-red-100 text-red-700'
                              : 'bg-gray-100 text-gray-700'
                          }
                        `}
                      >
                        {change.toPosition}
                      </span>
                    </div>
                    {idea && (
                      <p className="text-sm text-gray-600 mt-2 line-clamp-1">
                        {idea.text}
                      </p>
                    )}
                    <p className="text-xs text-gray-400 mt-1">
                      {formatTimeAgo(change.timestamp)}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      <BottomNav />
    </div>
  );
}
