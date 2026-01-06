import { useState } from 'react';
import { X, Check } from 'lucide-react';

interface CreateIdeaProps {
  onClose: () => void;
}

const MAX_CHARS = 280;

export function CreateIdea({ onClose }: CreateIdeaProps) {
  const [text, setText] = useState('');

  const handleSubmit = () => {
    if (text.trim().length === 0) return;
    // In a real app, this would create the idea and add user's "agree" position
    onClose();
  };

  const charCount = text.length;
  const isOverLimit = charCount > MAX_CHARS;
  const isEmpty = text.trim().length === 0;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-lg bg-white rounded-t-2xl sm:rounded-2xl max-h-[90vh] overflow-hidden animate-in slide-in-from-bottom duration-300">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <button
            onClick={onClose}
            className="w-10 h-10 flex items-center justify-center text-gray-500 hover:bg-gray-100 rounded-full transition-colors"
            aria-label="Close"
          >
            <X size={20} />
          </button>
          <h2 className="text-lg font-semibold text-gray-900">Share an Idea</h2>
          <div className="w-10" /> {/* Spacer for centering */}
        </div>

        {/* Content */}
        <div className="p-4">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="What idea do you want to explore with others?"
            className="w-full h-40 p-3 text-[16px] leading-relaxed resize-none focus:outline-none placeholder:text-gray-400"
            autoFocus
          />

          {/* Character count */}
          <div className="flex justify-end mb-4">
            <span className={`text-sm ${isOverLimit ? 'text-red-500' : 'text-gray-400'}`}>
              {charCount}/{MAX_CHARS}
            </span>
          </div>

          {/* Info text */}
          <div className="bg-blue-50 rounded-xl p-4 mb-4">
            <p className="text-sm text-blue-700">
              <strong>Note:</strong> Posting an idea means you agree with it. You cannot post something you disagree with.
            </p>
          </div>

          {/* Submit button */}
          <button
            onClick={handleSubmit}
            disabled={isEmpty || isOverLimit}
            className={`
              w-full py-3 rounded-xl font-semibold text-white
              flex items-center justify-center gap-2
              transition-all duration-200
              ${isEmpty || isOverLimit
                ? 'bg-gray-300 cursor-not-allowed'
                : 'bg-emerald-500 hover:bg-emerald-600 active:scale-[0.98]'
              }
            `}
          >
            <Check size={20} />
            <span>Post & Agree</span>
          </button>
        </div>

        {/* Safe area for iOS */}
        <div className="h-safe-area-inset-bottom" />
      </div>
    </div>
  );
}
