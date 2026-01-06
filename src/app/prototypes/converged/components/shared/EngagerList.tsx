import { useNavigate } from 'react-router-dom';
import { CheckCircle2 } from 'lucide-react';
import type { Engagement } from '../../data/mock-data';
import { getUserById } from '../../data/mock-data';
import { routes } from '../../config';

interface EngagerListProps {
  engagements: Engagement[];
  filter: 'all' | 'agree' | 'disagree' | 'unsure';
  onFilterChange: (filter: 'all' | 'agree' | 'disagree' | 'unsure') => void;
  ideaId: string;
  ideaText: string;
}

export function EngagerList({ engagements, filter, onFilterChange, ideaId, ideaText }: EngagerListProps) {
  const navigate = useNavigate();

  const filteredEngagements = engagements.filter((e) => {
    if (filter === 'all') return true;
    return e.position === filter;
  });

  const handleVerify = (partnerId: string, partnerPosition: string) => {
    // Find current user's engagement directly from the engagements array
    const currentUserEngagement = engagements.find(e => e.userId === 'current');

    navigate(routes.live, {
      state: {
        partnerId,
        ideaId,
        ideaText,
        myPosition: currentUserEngagement?.position || null,
        theirPosition: partnerPosition,
      }
    });
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

              {/* Verify button */}
              <button
                onClick={() => handleVerify(user.id, engagement.position || '')}
                className="w-full py-2.5 text-sm font-medium text-blue-600 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors mt-3"
              >
                Verify Understanding
              </button>
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
