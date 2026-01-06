import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Share2, Send, UserPlus } from 'lucide-react';
import { getIdeaById, getPositionCounts, getUserById, formatTimeAgo, type Position } from '../data/mock-data';
import { routes } from '../config';
import { PositionButtons } from './shared/PositionButtons';
import { PositionBar } from './shared/PositionBar';
import { EngagerList } from './shared/EngagerList';
import { BottomNav } from './BottomNav';

export function IdeaDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [userPosition, setUserPosition] = useState<Position>(null);
  const [engagerFilter, setEngagerFilter] = useState<'all' | 'agree' | 'disagree' | 'unsure'>('all');
  const [newComment, setNewComment] = useState('');

  const idea = getIdeaById(id || '');

  useEffect(() => {
    // Check if current user has a position on this idea
    if (idea) {
      const existing = idea.engagements.find(e => e.userId === 'current');
      if (existing) {
        setUserPosition(existing.position);
      }
    }
  }, [idea]);

  if (!idea) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600 mb-4">Idea not found</p>
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

  const counts = getPositionCounts(idea);
  const totalResponses = counts.agree + counts.disagree + counts.unsure;
  const verifiedCount = idea.engagements.filter(e => e.isVerified).length;
  const crossDisagreementCount = idea.engagements.filter(e => e.isCrossDisagreement).length;

  const handlePositionChange = (position: Position) => {
    setUserPosition(position);
    // In real app, would persist this
  };

  const handleAddComment = () => {
    if (newComment.trim()) {
      setNewComment('');
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* Header */}
      <header className="bg-white border-b border-gray-100 sticky top-0 z-40">
        <div className="flex items-center justify-between px-4 py-3">
          <button
            onClick={() => navigate(-1)}
            className="w-10 h-10 flex items-center justify-center text-gray-600 hover:bg-gray-100 rounded-full transition-colors"
            aria-label="Go back"
          >
            <ArrowLeft size={20} />
          </button>
          <h1 className="text-lg font-semibold text-gray-900">Idea</h1>
          <button
            className="w-10 h-10 flex items-center justify-center text-gray-600 hover:bg-gray-100 rounded-full transition-colors"
            aria-label="Share"
          >
            <Share2 size={20} />
          </button>
        </div>
      </header>

      <div className="px-4 py-4 space-y-6">
        {/* Full idea text */}
        <div className="bg-white rounded-2xl p-5">
          <p className="text-lg leading-relaxed text-gray-900">
            {idea.text}
          </p>
          <p className="text-sm text-gray-400 mt-4">
            {formatTimeAgo(idea.createdAt)}
          </p>
        </div>

        {/* Community Positions - with visualization bar */}
        <div className="bg-white rounded-2xl p-5">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">
            Community Positions ({totalResponses} responses)
          </h2>
          <PositionBar
            agree={counts.agree}
            disagree={counts.disagree}
            unsure={counts.unsure}
          />
        </div>

        {/* Your Position */}
        <div className="bg-white rounded-2xl p-5">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">
            Your Position
          </h2>
          <PositionButtons
            selectedPosition={userPosition}
            onPositionChange={handlePositionChange}
            showCounts={false}
          />
        </div>

        {/* Verification stats */}
        {(verifiedCount > 0 || crossDisagreementCount > 0) && (
          <div className="bg-purple-50 rounded-2xl p-4">
            <div className="flex items-center gap-4">
              <div className="text-sm text-purple-700">
                <span className="font-semibold">{verifiedCount}</span> verified understanding
              </div>
              {crossDisagreementCount > 0 && (
                <div className="text-sm text-purple-700">
                  <span className="font-semibold">{crossDisagreementCount}</span> across disagreement
                </div>
              )}
            </div>
          </div>
        )}

        {/* People with positions */}
        <div className="bg-white rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">
              People with Positions
            </h2>
            <button className="text-blue-500 text-sm font-medium flex items-center gap-1">
              <UserPlus size={14} />
              Invite
            </button>
          </div>
          <EngagerList
            engagements={idea.engagements}
            filter={engagerFilter}
            onFilterChange={setEngagerFilter}
            ideaId={idea.id}
            ideaText={idea.text}
          />
        </div>

        {/* Comments */}
        <div className="bg-white rounded-2xl p-5">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">
            Comments ({idea.comments.length})
          </h2>

          {/* Comment input */}
          <div className="flex gap-2 mb-4">
            <input
              type="text"
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              placeholder="Add a comment..."
              className="flex-1 h-10 px-4 bg-gray-100 rounded-full text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              onKeyDown={(e) => e.key === 'Enter' && handleAddComment()}
            />
            <button
              onClick={handleAddComment}
              disabled={!newComment.trim()}
              className="w-10 h-10 flex items-center justify-center bg-blue-500 hover:bg-blue-600 disabled:bg-gray-200 rounded-full text-white disabled:text-gray-400 transition-colors"
              aria-label="Send comment"
            >
              <Send size={16} />
            </button>
          </div>

          {/* Comments list */}
          <div className="space-y-4">
            {idea.comments.map((comment) => {
              const author = getUserById(comment.userId);
              return (
                <div key={comment.id} className="flex gap-3">
                  <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-sm flex-shrink-0">
                    {author?.avatar || '👤'}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-baseline gap-2">
                      <span className="font-medium text-sm text-gray-900">
                        {author?.name || 'Unknown'}
                      </span>
                      <span className="text-xs text-gray-400">
                        {formatTimeAgo(comment.timestamp)}
                      </span>
                    </div>
                    <p className="text-sm text-gray-700 mt-0.5">
                      {comment.text}
                    </p>
                  </div>
                </div>
              );
            })}

            {idea.comments.length === 0 && (
              <p className="text-center text-gray-400 text-sm py-4">
                No comments yet. Be the first to share your thoughts.
              </p>
            )}
          </div>
        </div>
      </div>

      <BottomNav />
    </div>
  );
}
