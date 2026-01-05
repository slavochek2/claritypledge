import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ChevronLeft, Share, MessageCircle, CheckCircle2, ArrowRightLeft, Send } from 'lucide-react';
import {
  getIdeaById,
  getUserById,
  getCommentsForIdea,
  getCertificationsForIdea,
  getPositionCounts,
  formatTimeAgo,
  currentUser,
  type Position
} from '../data/mock-data';
import { BottomNav } from './BottomNav';
import { routes } from '../config';

export function IdeaDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [userPosition, setUserPosition] = useState<Position>(null);
  const [commentText, setCommentText] = useState('');
  const [isScrolled, setIsScrolled] = useState(false);

  const idea = getIdeaById(id || '');
  const comments = getCommentsForIdea(id || '');
  const certifications = getCertificationsForIdea(id || '');

  if (!idea) {
    return (
      <div className="min-h-screen bg-[#F2F2F7] flex items-center justify-center">
        <p className="text-gray-500">Idea not found</p>
      </div>
    );
  }

  const author = getUserById(idea.createdBy);
  const counts = getPositionCounts(idea);
  const total = counts.agree + counts.disagree + counts.dont_know;

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    setIsScrolled(e.currentTarget.scrollTop > 10);
  };

  const positionButtonClass = (position: Position) => {
    const isSelected = userPosition === position;
    const base = 'flex-1 py-3 px-4 rounded-full text-sm font-medium transition-all duration-200 active:scale-95';

    if (!isSelected) {
      return `${base} bg-gray-100 text-gray-600 hover:bg-gray-200`;
    }

    switch (position) {
      case 'agree':
        return `${base} bg-green-100 text-green-700`;
      case 'disagree':
        return `${base} bg-red-100 text-red-700`;
      case 'dont_know':
        return `${base} bg-gray-200 text-gray-700`;
      default:
        return `${base} bg-gray-100 text-gray-600`;
    }
  };

  return (
    <div className="min-h-screen bg-[#F2F2F7]">
      {/* Header */}
      <header
        className={`
          sticky top-0 z-10 transition-all duration-200
          ${isScrolled ? 'bg-white/80 backdrop-blur-xl border-b border-gray-200/50' : 'bg-transparent'}
        `}
      >
        <div className="flex items-center justify-between px-4 h-14 max-w-[500px] mx-auto">
          <button
            onClick={() => navigate(-1)}
            className="w-10 h-10 -ml-2 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors"
          >
            <ChevronLeft size={24} className="text-[#007AFF]" />
          </button>
          <h1 className={`text-[17px] font-semibold text-gray-900 transition-opacity ${isScrolled ? 'opacity-100' : 'opacity-0'}`}>
            Idea
          </h1>
          <button className="w-10 h-10 -mr-2 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors">
            <Share size={20} className="text-[#007AFF]" />
          </button>
        </div>
      </header>

      {/* Content */}
      <main
        className="px-5 pb-40 max-w-[500px] mx-auto overflow-auto"
        onScroll={handleScroll}
      >
        {/* Hero Section */}
        <div className="bg-white rounded-[20px] p-6 shadow-[0_2px_8px_rgba(0,0,0,0.04)] mb-4">
          <p className="text-[20px] leading-relaxed text-gray-900 font-medium mb-5">
            {idea.text}
          </p>

          {/* Author */}
          <div className="flex items-center gap-3 pb-5 border-b border-gray-100">
            <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center text-lg">
              {author?.avatar || '👤'}
            </div>
            <div>
              <p className="text-[15px] font-medium text-gray-900">{author?.name}</p>
              <p className="text-[13px] text-gray-400">{formatTimeAgo(idea.createdAt)}</p>
            </div>
          </div>

          {/* Position Bar */}
          <div className="pt-5">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-[13px] font-medium text-gray-500">Community Positions</span>
              <span className="text-[13px] text-gray-400">{total} responses</span>
            </div>

            <div className="flex h-2 rounded-full overflow-hidden bg-gray-100 mb-3">
              {counts.agree > 0 && (
                <div
                  className="bg-green-400 transition-all duration-300"
                  style={{ width: `${(counts.agree / total) * 100}%` }}
                />
              )}
              {counts.disagree > 0 && (
                <div
                  className="bg-red-400 transition-all duration-300"
                  style={{ width: `${(counts.disagree / total) * 100}%` }}
                />
              )}
              {counts.dont_know > 0 && (
                <div
                  className="bg-gray-300 transition-all duration-300"
                  style={{ width: `${(counts.dont_know / total) * 100}%` }}
                />
              )}
            </div>

            <div className="flex items-center justify-between text-[12px]">
              <div className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-green-400"></span>
                <span className="text-gray-500">Agree ({counts.agree})</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-red-400"></span>
                <span className="text-gray-500">Disagree ({counts.disagree})</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-gray-300"></span>
                <span className="text-gray-500">Unsure ({counts.dont_know})</span>
              </div>
            </div>
          </div>
        </div>

        {/* Your Position */}
        <div className="bg-white rounded-[20px] p-5 shadow-[0_2px_8px_rgba(0,0,0,0.04)] mb-4">
          <h2 className="text-[13px] font-medium text-gray-500 mb-3">Your Position</h2>
          <div className="flex gap-2">
            <button
              onClick={() => setUserPosition(userPosition === 'agree' ? null : 'agree')}
              className={positionButtonClass('agree')}
            >
              Agree
            </button>
            <button
              onClick={() => setUserPosition(userPosition === 'disagree' ? null : 'disagree')}
              className={positionButtonClass('disagree')}
            >
              Disagree
            </button>
            <button
              onClick={() => setUserPosition(userPosition === 'dont_know' ? null : 'dont_know')}
              className={positionButtonClass('dont_know')}
            >
              Unsure
            </button>
          </div>
        </div>

        {/* Verification Stats */}
        <div className="bg-white rounded-[20px] p-5 shadow-[0_2px_8px_rgba(0,0,0,0.04)] mb-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-[15px] font-semibold text-gray-900">Verified Understanding</h2>
            <div className="flex items-center gap-2 text-[13px] text-gray-500">
              <CheckCircle2 size={14} />
              <span>{idea.verificationCount}</span>
            </div>
          </div>

          {idea.crossDisagreementCount > 0 && (
            <div className="flex items-center gap-2 p-3 bg-blue-50 rounded-xl mb-4">
              <ArrowRightLeft size={16} className="text-[#007AFF]" />
              <span className="text-[13px] text-[#007AFF] font-medium">
                {idea.crossDisagreementCount} verified across disagreement
              </span>
            </div>
          )}

          {/* Verification Pairs */}
          {certifications.length > 0 ? (
            <div className="space-y-3">
              {certifications.map((cert) => {
                const speaker = getUserById(cert.speakerId);
                const listener = getUserById(cert.listenerId);
                const isCrossDisagreement = cert.speakerPosition !== cert.listenerPosition;

                return (
                  <div
                    key={cert.id}
                    className={`flex items-center gap-3 p-3 rounded-xl ${isCrossDisagreement ? 'bg-blue-50/50' : 'bg-gray-50'}`}
                  >
                    <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-sm">
                      {speaker?.avatar}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] text-gray-900 truncate">
                        <span className="font-medium">{listener?.name}</span>
                        <span className="text-gray-400"> verified understanding of </span>
                        <span className="font-medium">{speaker?.name}</span>
                      </p>
                      <p className="text-[11px] text-gray-400">{formatTimeAgo(cert.createdAt)}</p>
                    </div>
                    {isCrossDisagreement && (
                      <ArrowRightLeft size={14} className="text-[#007AFF]" />
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-[13px] text-gray-400 text-center py-4">
              No verifications yet. Be the first!
            </p>
          )}

          <button
            onClick={() => navigate(routes.live, { state: { ideaId: idea.id } })}
            className="w-full mt-4 py-3 min-h-[44px] bg-[#007AFF] text-white rounded-full font-semibold text-[15px] transition-all hover:bg-[#0066DD] active:scale-[0.98]"
          >
            Verify Understanding
          </button>
        </div>

        {/* Comments Section */}
        <div className="bg-white rounded-[20px] p-5 shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
          <div className="flex items-center gap-2 mb-4">
            <MessageCircle size={16} className="text-gray-400" />
            <h2 className="text-[15px] font-semibold text-gray-900">Comments</h2>
            <span className="text-[13px] text-gray-400">{comments.length}</span>
          </div>

          {comments.length > 0 ? (
            <div className="space-y-4">
              {comments.map((comment) => {
                const commenter = getUserById(comment.userId);
                return (
                  <div key={comment.id} className="flex gap-3">
                    <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-sm shrink-0">
                      {commenter?.avatar}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-2 mb-1">
                        <span className="text-[13px] font-medium text-gray-900">{commenter?.name}</span>
                        <span className="text-[11px] text-gray-400">{formatTimeAgo(comment.createdAt)}</span>
                      </div>
                      <p className="text-[14px] text-gray-700 leading-relaxed">{comment.text}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-[13px] text-gray-400 text-center py-4">
              No comments yet
            </p>
          )}

          {/* Comment Input */}
          <div className="flex items-center gap-3 mt-4 pt-4 border-t border-gray-100">
            <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-sm shrink-0">
              {currentUser.avatar}
            </div>
            <div className="flex-1 flex items-center gap-2 bg-gray-100 rounded-full px-4 py-2">
              <input
                type="text"
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && commentText.trim()) {
                    // TODO: Submit comment to backend
                    setCommentText('');
                  }
                }}
                placeholder="Add a comment..."
                aria-label="Add a comment"
                className="flex-1 bg-transparent text-[14px] text-gray-900 placeholder:text-gray-400 outline-none"
              />
              <button
                onClick={() => {
                  if (commentText.trim()) {
                    // TODO: Submit comment to backend
                    setCommentText('');
                  }
                }}
                disabled={!commentText.trim()}
                aria-label="Submit comment"
                className={`min-w-[44px] min-h-[44px] -mr-2 flex items-center justify-center transition-colors ${commentText.trim() ? 'text-[#007AFF]' : 'text-gray-300'}`}
              >
                <Send size={18} aria-hidden="true" />
              </button>
            </div>
          </div>
        </div>
      </main>

      {/* Bottom Navigation */}
      <BottomNav />
    </div>
  );
}
