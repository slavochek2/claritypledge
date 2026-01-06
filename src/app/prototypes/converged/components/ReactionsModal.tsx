import { useState, useEffect } from 'react';
import { X, HelpCircle, CheckCircle } from 'lucide-react';
import type { Idea, Position } from '../data/mock-data';
import { getUserById } from '../data/mock-data';

interface ReactionsModalProps {
  idea: Idea;
  filter: Position;
  onClose: () => void;
}

export function ReactionsModal({ idea, filter, onClose }: ReactionsModalProps) {
  const [isLoading, setIsLoading] = useState(true);
  const reactions = idea.engagements.filter(e => e.position === filter);

  // Simulate loading (remove in production with real data)
  useEffect(() => {
    const timer = setTimeout(() => setIsLoading(false), 300);
    return () => clearTimeout(timer);
  }, []);

  // Close on Escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  const getTitle = () => {
    if (filter === 'agree') return 'Agreed';
    if (filter === 'disagree') return 'Disagreed';
    if (filter === 'unsure') return 'Unsure';
    return '';
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center"
      onClick={onClose}
    >
      <div
        className="bg-white w-full sm:max-w-md sm:rounded-lg rounded-t-2xl max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <h3 className="font-semibold text-lg">{getTitle()}</h3>
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-gray-500 hover:text-gray-700"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto p-4">
          {isLoading ? (
            /* Loading skeleton */
            <div className="space-y-3">
              {[1, 2, 3].map(i => (
                <div key={i} className="flex items-center gap-3 animate-pulse">
                  <div className="w-10 h-10 rounded-full bg-gray-200" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 bg-gray-200 rounded w-32" />
                    <div className="h-3 bg-gray-200 rounded w-24" />
                  </div>
                </div>
              ))}
            </div>
          ) : reactions.length === 0 ? (
            /* Empty state */
            <div className="flex flex-col items-center justify-center py-8">
              <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mb-3">
                <HelpCircle className="w-8 h-8 text-gray-400" />
              </div>
              <p className="text-sm text-gray-500">No one yet</p>
            </div>
          ) : (
            /* Loaded content */
            <div className="space-y-3">
              {reactions.map(engagement => {
                const user = getUserById(engagement.userId);
                return (
                  <div key={engagement.id} className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center">
                      <span className="text-lg">{user?.avatar}</span>
                    </div>
                    <div className="flex-1">
                      <p className="font-medium text-sm">{user?.name}</p>
                      <p className="text-xs text-gray-500">{user?.role}</p>
                    </div>
                    {engagement.isVerified && (
                      <CheckCircle className="w-4 h-4 text-green-600" />
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
