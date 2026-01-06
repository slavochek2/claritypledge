import { useState, useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { type Position, createIdea } from '../data/mock-data';

export interface CreateIdeaModalProps {
  isOpen: boolean;
  onClose: () => void;
  onIdeaCreated?: (ideaId: string) => void;
  prefillText?: string;
  defaultPosition?: Position;
}

const MAX_CHARS = 280;

export function CreateIdeaModal({
  isOpen,
  onClose,
  onIdeaCreated,
  prefillText = '',
  defaultPosition = 'agree',
}: CreateIdeaModalProps) {
  const [text, setText] = useState(prefillText);
  const [position, setPosition] = useState<Position>(defaultPosition);
  const [isPosting, setIsPosting] = useState(false);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Reset state when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      setText(prefillText);
      setPosition(defaultPosition);
      setShowDiscardConfirm(false);
      // Auto-focus text area
      setTimeout(() => textareaRef.current?.focus(), 100);
    }
  }, [isOpen, prefillText, defaultPosition]);

  // Handle Escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        handleCloseAttempt();
      }
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isOpen, text]);

  const charCount = text.length;
  const isOverLimit = charCount > MAX_CHARS;
  const isEmpty = text.trim().length === 0;
  const isValid = !isEmpty && !isOverLimit;

  const handleCloseAttempt = () => {
    if (text.trim().length > 10) {
      setShowDiscardConfirm(true);
    } else {
      onClose();
    }
  };

  const handleConfirmDiscard = () => {
    setShowDiscardConfirm(false);
    onClose();
  };

  const handlePost = async () => {
    if (!isValid || !position) return;

    setIsPosting(true);
    try {
      // Create the idea with the selected position
      const newIdea = createIdea(text.trim(), position);

      // Call callback if provided
      onIdeaCreated?.(newIdea.id);

      // Close modal
      onClose();
    } catch (error) {
      console.error('Failed to create idea:', error);
    } finally {
      setIsPosting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={handleCloseAttempt}
      />

      {/* Discard Confirmation */}
      {showDiscardConfirm && (
        <div className="absolute inset-0 z-10 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg p-6 max-w-sm w-full shadow-xl">
            <h3 className="text-lg font-semibold mb-2">Discard draft?</h3>
            <p className="text-gray-600 mb-4">Your idea won't be saved.</p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowDiscardConfirm(false)}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50 font-medium"
              >
                Keep editing
              </button>
              <button
                onClick={handleConfirmDiscard}
                className="flex-1 px-4 py-2 bg-red-500 text-white rounded-md hover:bg-red-600 font-medium"
              >
                Discard
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal */}
      <div className="relative w-full max-w-[500px] bg-white rounded-t-2xl sm:rounded-2xl shadow-xl overflow-hidden animate-in slide-in-from-bottom duration-300">
        {/* Header */}
        <div className="flex items-center justify-between px-5 sm:px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900">New Idea</h2>
          <button
            onClick={handleCloseAttempt}
            className="w-8 h-8 flex items-center justify-center text-gray-500 hover:bg-gray-100 rounded-full transition-colors"
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 sm:p-6 space-y-4">
          {/* Text Area */}
          <div className="relative">
            <textarea
              ref={textareaRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Write your idea..."
              className="w-full min-h-[120px] max-h-[200px] p-3 text-base sm:text-sm leading-relaxed resize-none border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder:text-gray-400"
              rows={4}
            />
            {/* Character Counter */}
            <div className="flex justify-end mt-2">
              <span className={`text-[13px] ${isOverLimit ? 'text-red-500 font-medium' : 'text-gray-500'}`}>
                {charCount} / {MAX_CHARS}
              </span>
            </div>
            {/* Validation Messages */}
            {isEmpty && (
              <p className="text-xs text-gray-500 mt-1">Write your idea</p>
            )}
            {isOverLimit && (
              <p className="text-xs text-red-500 mt-1">Too long</p>
            )}
          </div>

          {/* Position Selector */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">
              My position on this idea:
            </label>
            <div className="flex gap-4">
              <button
                onClick={() => setPosition('agree')}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg border-2 transition-all ${
                  position === 'agree'
                    ? 'border-blue-500 bg-blue-50 text-blue-700'
                    : 'border-gray-200 hover:border-gray-300 text-gray-700'
                }`}
              >
                <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                  position === 'agree' ? 'border-blue-500' : 'border-gray-400'
                }`}>
                  {position === 'agree' && (
                    <div className="w-2 h-2 rounded-full bg-blue-500" />
                  )}
                </div>
                <span className="text-sm font-medium">Agree</span>
              </button>

              <button
                onClick={() => setPosition('disagree')}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg border-2 transition-all ${
                  position === 'disagree'
                    ? 'border-blue-500 bg-blue-50 text-blue-700'
                    : 'border-gray-200 hover:border-gray-300 text-gray-700'
                }`}
              >
                <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                  position === 'disagree' ? 'border-blue-500' : 'border-gray-400'
                }`}>
                  {position === 'disagree' && (
                    <div className="w-2 h-2 rounded-full bg-blue-500" />
                  )}
                </div>
                <span className="text-sm font-medium">Disagree</span>
              </button>

              <button
                onClick={() => setPosition('unsure')}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg border-2 transition-all ${
                  position === 'unsure'
                    ? 'border-blue-500 bg-blue-50 text-blue-700'
                    : 'border-gray-200 hover:border-gray-300 text-gray-700'
                }`}
              >
                <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                  position === 'unsure' ? 'border-blue-500' : 'border-gray-400'
                }`}>
                  {position === 'unsure' && (
                    <div className="w-2 h-2 rounded-full bg-blue-500" />
                  )}
                </div>
                <span className="text-sm font-medium">Unsure</span>
              </button>
            </div>
          </div>

          {/* Post Button */}
          <button
            onClick={handlePost}
            disabled={!isValid || isPosting}
            className={`
              w-full sm:w-[200px] sm:ml-auto h-11 sm:h-10 rounded-lg font-semibold text-white
              flex items-center justify-center
              transition-all duration-200
              ${!isValid || isPosting
                ? 'bg-gray-300 cursor-not-allowed'
                : 'bg-blue-500 hover:bg-blue-600 active:scale-[0.98]'
              }
            `}
          >
            {isPosting ? 'Posting...' : 'Post Idea'}
          </button>
        </div>
      </div>
    </div>
  );
}
