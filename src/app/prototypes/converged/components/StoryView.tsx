import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { X, ChevronLeft, ChevronRight, MessageCircle } from 'lucide-react';
import { getUserById, getUserEngagements, getIdeaById, formatTimeAgo, type User } from '../data/mock-data';
import { routes } from '../config';
import { PositionButtons } from './shared/PositionButtons';

export function StoryView() {
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [touchStart, setTouchStart] = useState<number | null>(null);

  const user = getUserById(userId || '');
  const engagements = getUserEngagements(userId || '');

  useEffect(() => {
    // Mark as viewed
    if (user) {
      user.hasUnviewedActivity = false;
    }
  }, [user]);

  const handleClose = () => {
    navigate(routes.feed);
  };

  const handlePrev = useCallback(() => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
    }
  }, [currentIndex]);

  const handleNext = useCallback(() => {
    if (currentIndex < engagements.length - 1) {
      setCurrentIndex(currentIndex + 1);
    } else {
      // Auto-close after last card
      handleClose();
    }
  }, [currentIndex, engagements.length]);

  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchStart(e.touches[0].clientX);
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStart === null) return;
    const touchEnd = e.changedTouches[0].clientX;
    const diff = touchStart - touchEnd;

    if (Math.abs(diff) > 50) {
      if (diff > 0) {
        handleNext();
      } else {
        handlePrev();
      }
    }
    setTouchStart(null);
  };

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'ArrowLeft') handlePrev();
    if (e.key === 'ArrowRight') handleNext();
    if (e.key === 'Escape') handleClose();
  }, [handlePrev, handleNext]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  if (!user || engagements.length === 0) {
    return (
      <div className="fixed inset-0 bg-black flex items-center justify-center">
        <div className="text-white text-center">
          <p className="text-lg mb-4">No recent activity</p>
          <button
            onClick={handleClose}
            className="text-blue-400 hover:underline"
          >
            Go back
          </button>
        </div>
      </div>
    );
  }

  const currentEngagement = engagements[currentIndex];
  const idea = currentEngagement.idea;

  const positionLabel = currentEngagement.engagement.position === 'agree'
    ? 'Agrees'
    : currentEngagement.engagement.position === 'disagree'
      ? 'Disagrees'
      : 'Unsure';

  const handleVerifyInChat = () => {
    navigate(routes.chat(userId || ''));
  };

  return (
    <div
      className="fixed inset-0 bg-black z-50"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Progress indicators */}
      <div className="absolute top-0 left-0 right-0 z-10 px-2 pt-2">
        <div className="flex gap-1">
          {engagements.map((_, idx) => (
            <div
              key={idx}
              className={`h-1 flex-1 rounded-full transition-all duration-300 ${
                idx < currentIndex
                  ? 'bg-white'
                  : idx === currentIndex
                    ? 'bg-white'
                    : 'bg-white/30'
              }`}
            />
          ))}
        </div>
      </div>

      {/* Header */}
      <div className="absolute top-4 left-0 right-0 z-10 px-4 pt-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gray-700 flex items-center justify-center text-xl">
              {user.avatar}
            </div>
            <div>
              <p className="text-white font-semibold text-sm">{user.name}</p>
              <p className="text-white/60 text-xs">
                {formatTimeAgo(currentEngagement.engagement.timestamp)}
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="w-10 h-10 flex items-center justify-center text-white hover:bg-white/10 rounded-full transition-colors"
            aria-label="Close"
          >
            <X size={24} />
          </button>
        </div>
      </div>

      {/* Navigation arrows (desktop) */}
      <button
        onClick={handlePrev}
        disabled={currentIndex === 0}
        className={`absolute left-4 top-1/2 -translate-y-1/2 z-10 w-10 h-10 flex items-center justify-center bg-white/10 hover:bg-white/20 rounded-full transition-colors ${
          currentIndex === 0 ? 'opacity-30 cursor-not-allowed' : ''
        }`}
        aria-label="Previous"
      >
        <ChevronLeft size={24} className="text-white" />
      </button>
      <button
        onClick={handleNext}
        className="absolute right-4 top-1/2 -translate-y-1/2 z-10 w-10 h-10 flex items-center justify-center bg-white/10 hover:bg-white/20 rounded-full transition-colors"
        aria-label="Next"
      >
        <ChevronRight size={24} className="text-white" />
      </button>

      {/* Main content card */}
      <div className="absolute inset-x-4 top-24 bottom-32 flex items-center justify-center">
        <div className="w-full max-w-md bg-white rounded-2xl p-6 shadow-2xl">
          {/* Position badge */}
          <div className="flex items-center gap-2 mb-4">
            <span
              className={`px-3 py-1 rounded-full text-sm font-medium ${
                currentEngagement.engagement.position === 'agree'
                  ? 'bg-emerald-100 text-emerald-700'
                  : currentEngagement.engagement.position === 'disagree'
                    ? 'bg-red-100 text-red-700'
                    : 'bg-gray-100 text-gray-700'
              }`}
            >
              {user.name.split(' ')[0]} {positionLabel}
            </span>
            {currentEngagement.engagement.isVerified && (
              <span className="px-2 py-1 bg-purple-100 text-purple-700 rounded-full text-xs font-medium">
                Verified
              </span>
            )}
          </div>

          {/* Idea text */}
          <p className="text-lg leading-relaxed text-gray-900 mb-6">
            {idea.text}
          </p>

          {/* Stats */}
          <div className="flex items-center gap-4 text-sm text-gray-500 mb-6 pb-4 border-b border-gray-100">
            <span>{idea.engagements.filter(e => e.position === 'agree').length} agree</span>
            <span>{idea.engagements.filter(e => e.position === 'disagree').length} disagree</span>
            <span>{idea.comments.length} comments</span>
          </div>

          {/* Actions */}
          <div className="space-y-3">
            <button
              onClick={handleVerifyInChat}
              className="w-full py-3 bg-blue-500 hover:bg-blue-600 text-white rounded-xl font-medium flex items-center justify-center gap-2 transition-colors"
            >
              <MessageCircle size={18} />
              Verify with {user.name.split(' ')[0]}
            </button>
            <button
              onClick={() => navigate(routes.idea(idea.id))}
              className="w-full py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-medium transition-colors"
            >
              View Full Idea
            </button>
          </div>
        </div>
      </div>

      {/* Bottom hint */}
      <div className="absolute bottom-8 left-0 right-0 text-center">
        <p className="text-white/60 text-sm">
          Swipe or use arrow keys to navigate
        </p>
      </div>
    </div>
  );
}
