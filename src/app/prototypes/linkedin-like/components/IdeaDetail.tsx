import { useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Zap } from 'lucide-react';
import { PrototypeLayout } from './PrototypeLayout';
import { IdeaCard } from './IdeaCard';
import { FilterTabs, type PositionFilter, RatingDots } from './shared';
import { routes } from '../config';
import {
  getIdeaById,
  getUserById,
  getPositionCounts,
  getAllVerificationSessionsForIdea,
  Position,
  formatTimeAgo,
} from '../data/mock-data';

export function IdeaDetail() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const idea = getIdeaById(id || '');
  const counts = idea ? getPositionCounts(idea) : { agree: 0, disagree: 0, dont_know: 0 };

  // Check if this was shared by someone (from=userId)
  const fromUserId = searchParams.get('from');
  const sharedByUser = fromUserId ? getUserById(fromUserId) : null;
  const sharedByPosition = fromUserId && idea ? idea.positions[fromUserId]?.position : null;

  const [positionFilter, setPositionFilter] = useState<PositionFilter>('all');

  if (!idea) {
    return (
      <PrototypeLayout>
        <div className="flex items-center justify-center min-h-[50vh]">
          <p className="text-gray-500">Idea not found</p>
        </div>
      </PrototypeLayout>
    );
  }

  const totalPositions = counts.agree + counts.disagree + counts.dont_know;

  return (
    <PrototypeLayout>
      <div className="max-w-lg mx-auto pb-8">
        {/* Back button - outside the card */}
        <div className="px-4 pt-3">
          <button
            onClick={() => navigate(-1)}
            className="p-1 text-gray-500 hover:text-gray-700 -ml-1"
          >
            <ArrowLeft size={18} />
          </button>
        </div>

        {/* Shared by banner - if viewing via shared link */}
        {sharedByUser && sharedByPosition && (
          <div className="mx-2 mt-2 bg-blue-50 border border-blue-200 rounded-lg p-3">
            <div className="flex items-center gap-3">
              <button
                onClick={() => navigate(`/prototype/linkedin-like/profile/${fromUserId}`)}
                className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-lg flex-shrink-0"
              >
                {sharedByUser.avatar}
              </button>
              <div className="flex-1">
                <p className="text-sm text-blue-900">
                  <button
                    onClick={() => navigate(`/prototype/linkedin-like/profile/${fromUserId}`)}
                    className="font-semibold hover:underline"
                  >
                    {sharedByUser.name}
                  </button>
                  {' '}shared this idea
                </p>
                <p className="text-xs text-blue-700 flex items-center gap-1 mt-0.5">
                  Their stance:
                  <span className={`font-medium ${
                    sharedByPosition === 'agree' ? 'text-emerald-600' :
                    sharedByPosition === 'disagree' ? 'text-blue-600' :
                    'text-gray-600'
                  }`}>
                    {sharedByPosition === 'agree' ? '✓ Agreed' : sharedByPosition === 'disagree' ? '✗ Disagreed' : '? Unsure'}
                  </span>
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Idea card - reusing the same component as in lists */}
        <div className="px-2 pt-2">
          <IdeaCard idea={idea} isDetailView />
        </div>

        {/* People with positions - tabbed */}
        <div className="bg-white border border-gray-200 mx-2 mt-3 rounded-lg">
          {/* Tabs */}
          <FilterTabs
            activeFilter={positionFilter}
            onFilterChange={setPositionFilter}
            counts={{
              all: totalPositions,
              agree: counts.agree,
              disagree: counts.disagree,
              dont_know: counts.dont_know,
            }}
          />

          {/* Filtered people list - positions only, no verify button */}
          <div className="p-4">
            <div className="space-y-2">
              {Object.entries(idea.positions)
                .filter(([userId, entry]) => {
                  if (!entry || userId === 'current') return false;
                  if (positionFilter === 'all') return true;
                  return entry.position === positionFilter;
                })
                .map(([userId, entry]) => {
                  const user = getUserById(userId);
                  if (!user || !entry) return null;
                  return (
                    <button
                      key={userId}
                      onClick={() => navigate(`/prototype/linkedin-like/profile/${userId}`)}
                      className="flex items-center gap-3 w-full p-2 rounded-lg hover:bg-gray-50 transition-colors"
                    >
                      <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-lg flex-shrink-0">
                        {user.avatar}
                      </div>
                      <div className="flex-1 text-left min-w-0">
                        <p className="font-medium text-gray-900">{user.name}</p>
                        <p className="text-xs text-gray-500">{user.role} · {formatTimeAgo(entry.timestamp)}</p>
                      </div>
                      <PositionBadge position={entry.position} />
                    </button>
                  );
                })}
            </div>
          </div>
        </div>

        {/* Clarity Sessions section */}
        <ClaritySessionsSection ideaId={idea.id} idea={idea} navigate={navigate} />
      </div>
    </PrototypeLayout>
  );
}

// Position badge for user list - simple icon + text, no avatar (already shown on left)
function PositionBadge({ position }: { position: Position }) {
  const config = {
    agree: {
      label: 'Agreed',
      className: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      icon: '✓',
    },
    disagree: {
      label: 'Disagreed',
      className: 'bg-blue-50 text-blue-700 border-blue-200',
      icon: '✗',
    },
    dont_know: {
      label: 'Unsure',
      className: 'bg-gray-100 text-gray-600 border-gray-300',
      icon: '?',
    },
  };

  const c = config[position as keyof typeof config];
  if (!c) return null;

  return (
    <span className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium border ${c.className}`}>
      <span>{c.icon}</span>
      <span>{c.label}</span>
    </span>
  );
}

// Clarity Sessions section - shows all verifications with rating dots
interface ClaritySessionsSectionProps {
  ideaId: string;
  idea: ReturnType<typeof getIdeaById>;
  navigate: ReturnType<typeof useNavigate>;
}

function ClaritySessionsSection({ ideaId, idea, navigate }: ClaritySessionsSectionProps) {
  const sessions = getAllVerificationSessionsForIdea(ideaId);

  // Extract individual verifications from sessions
  type Verification = {
    sessionId: string;
    verifierId: string;
    verifiedId: string;
    rating: number;
    isAcrossDisagreement: boolean;
  };

  const verifications: Verification[] = [];

  for (const session of sessions) {
    const [p1, p2] = session.participants;
    const verifiedBy = session.verifiedBy || [];
    const ratings = session.ratings || {};

    // Get positions to determine if across disagreement
    const p1Position = idea?.positions[p1]?.position;
    const p2Position = idea?.positions[p2]?.position;
    const isDifferentPosition = p1Position && p2Position && p1Position !== p2Position;

    // Add verification for p1 → p2 (p1 understands p2)
    if (verifiedBy.includes(p1) && ratings[p1] !== undefined) {
      verifications.push({
        sessionId: session.id,
        verifierId: p1,
        verifiedId: p2,
        rating: ratings[p1],
        isAcrossDisagreement: !!isDifferentPosition,
      });
    }

    // Add verification for p2 → p1 (p2 understands p1)
    if (verifiedBy.includes(p2) && ratings[p2] !== undefined) {
      verifications.push({
        sessionId: session.id,
        verifierId: p2,
        verifiedId: p1,
        rating: ratings[p2],
        isAcrossDisagreement: !!isDifferentPosition,
      });
    }
  }

  if (verifications.length === 0) return null;

  const acrossDisagreementCount = verifications.filter(v => v.isAcrossDisagreement).length;

  const getName = (userId: string) => {
    if (userId === 'current') return 'You';
    const user = getUserById(userId);
    return user?.name || 'Unknown';
  };

  const getAvatar = (userId: string) => {
    if (userId === 'current') return '👤';
    const user = getUserById(userId);
    return user?.avatar || '?';
  };

  return (
    <div className="bg-white border border-gray-200 mx-2 mt-3 rounded-lg">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="w-5 h-5 rounded-full bg-blue-600 flex items-center justify-center text-xs text-white font-bold">C</span>
          <span className="font-medium text-gray-900">Clarity Sessions</span>
          <span className="text-sm text-gray-500">({verifications.length})</span>
        </div>
        {acrossDisagreementCount > 0 && (
          <div className="flex items-center gap-1.5 text-blue-600 text-sm">
            <Zap size={14} />
            <span>{acrossDisagreementCount} across disagreement</span>
          </div>
        )}
      </div>

      {/* Verification list */}
      <div className="p-4 space-y-2">
        {verifications.map((v, idx) => (
          <button
            key={`${v.sessionId}-${v.verifierId}-${idx}`}
            onClick={() => navigate(routes.liveSession(v.sessionId))}
            className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 transition-colors text-left"
          >
            {/* Verifier avatar */}
            <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-sm flex-shrink-0">
              {getAvatar(v.verifierId)}
            </div>

            {/* Text: "X understands Y" */}
            <div className="flex-1 min-w-0">
              <p className="text-sm">
                <span className="font-medium text-gray-900">{getName(v.verifierId)}</span>
                <span className="text-gray-500"> understands </span>
                <span className="font-medium text-gray-900">{getName(v.verifiedId)}</span>
              </p>
            </div>

            {/* Rating dots + across disagreement indicator */}
            <div className="flex items-center gap-2">
              {v.isAcrossDisagreement && (
                <Zap size={12} className="text-blue-600" />
              )}
              <RatingDots rating={v.rating} size="sm" />
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
