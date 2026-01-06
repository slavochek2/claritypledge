import { useNavigate } from 'react-router-dom';
import { MessageCircle, Mic, CheckCircle2 } from 'lucide-react';
import type { Engagement, User } from '../../data/mock-data';
import { getUserById } from '../../data/mock-data';
import { routes } from '../../config';

interface EngagerListProps {
  engagements: Engagement[];
  filter: 'all' | 'agree' | 'disagree' | 'unsure';
  onFilterChange: (filter: 'all' | 'agree' | 'disagree' | 'unsure') => void;
}

export function EngagerList({ engagements, filter, onFilterChange }: EngagerListProps) {
  const navigate = useNavigate();

  const filteredEngagements = engagements.filter((e) => {
    if (filter === 'all') return true;
    return e.position === filter;
  });

  const handleVerifyInChat = (userId: string) => {
    navigate(routes.chat(userId));
  };

  const handleGoLive = (userId: string) => {
    navigate(routes.live + `?with=${userId}`);
  };

  return (
    <div className="space-y-4">
      {/* Filter tabs */}
      <div className="flex gap-2 overflow-x-auto scrollbar-hide">
        {(['all', 'agree', 'disagree', 'unsure'] as const).map((f) => (
          <button
            key={f}
            onClick={() => onFilterChange(f)}
            className={`
              px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap
              transition-colors min-h-[32px]
              ${filter === f
                ? 'bg-gray-900 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }
            `}
          >
            {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)}
            {f !== 'all' && (
              <span className="ml-1.5 opacity-60">
                ({engagements.filter(e => e.position === f).length})
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Engagers list */}
      <div className="space-y-2">
        {filteredEngagements.map((engagement) => {
          const user = getUserById(engagement.userId);
          if (!user || user.id === 'current') return null;

          const positionColor =
            engagement.position === 'agree'
              ? 'text-emerald-600'
              : engagement.position === 'disagree'
                ? 'text-red-600'
                : 'text-gray-600';

          return (
            <div
              key={engagement.id}
              className="bg-gray-50 rounded-xl p-4"
            >
              <div className="flex items-start gap-3">
                {/* Avatar */}
                <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center text-lg flex-shrink-0">
                  {user.avatar}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-900 truncate">
                      {user.name}
                    </span>
                    <span className={`text-sm ${positionColor}`}>
                      ({engagement.position === 'agree' ? 'Agrees' : engagement.position === 'disagree' ? 'Disagrees' : 'Unsure'})
                    </span>
                    {engagement.isVerified && (
                      <CheckCircle2 size={14} className="text-purple-500 flex-shrink-0" />
                    )}
                  </div>
                  {user.role && (
                    <p className="text-sm text-gray-500 truncate">{user.role}</p>
                  )}
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex gap-2 mt-3">
                <button
                  onClick={() => handleVerifyInChat(user.id)}
                  className="flex-1 py-2 px-3 bg-white border border-gray-200 hover:bg-gray-50 rounded-lg text-sm font-medium text-gray-700 flex items-center justify-center gap-1.5 transition-colors"
                >
                  <MessageCircle size={14} />
                  Verify in Chat
                </button>
                <button
                  onClick={() => handleGoLive(user.id)}
                  className="flex-1 py-2 px-3 bg-blue-500 hover:bg-blue-600 rounded-lg text-sm font-medium text-white flex items-center justify-center gap-1.5 transition-colors"
                >
                  <Mic size={14} />
                  Go Live
                </button>
              </div>
            </div>
          );
        })}

        {filteredEngagements.length === 0 && (
          <div className="text-center py-8 text-gray-500">
            No one has taken this position yet
          </div>
        )}
      </div>
    </div>
  );
}
