/**
 * @file Sift.tsx
 * @description Sifter Prototype - AI-powered thought clarification
 *
 * Flow:
 * 1. User types thought
 * 2. AI paraphrases → User rates 0-10
 * 3. If 10: Done
 * 4. If < 10: AI shows options to pick from + "Add more details"
 * 5. User picks or clarifies → repeat
 */
import { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { GravatarAvatar } from '@/components/ui/gravatar-avatar';
import { Send, Check } from 'lucide-react';

// ============================================================================
// TYPES
// ============================================================================

interface InterpretationOption {
  id: string;
  text: string;
  storyText: string;
}

type SiftPhase = 'entry' | 'rating' | 'choosing' | 'done';

interface SiftState {
  phase: SiftPhase;
  userInput: string;
  currentParaphrase: string;
  currentStoryText: string;
  options: InterpretationOption[];
  refinementCount: number;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const MOCK_USER = {
  name: "Sarah Chen",
  hasPledged: true,
};

// Initial paraphrase
const MOCK_PARAPHRASE = {
  text: "So you're saying the commute was draining you both physically and emotionally, affecting your family time?",
  storyText: "I commuted 2 hours daily and felt exhausted.",
};

// Options shown after rating < 10
const MOCK_OPTIONS: InterpretationOption[] = [
  {
    id: 'a',
    text: "The physical exhaustion was the main issue",
    storyText: "I commuted 2 hours daily. The physical exhaustion was overwhelming.",
  },
  {
    id: 'b',
    text: "Missing time with family was the real cost",
    storyText: "I commuted 2 hours daily. The real cost was missing time with my kids.",
  },
  {
    id: 'c',
    text: "The guilt about work-life balance was the deeper pain",
    storyText: "I commuted 2 hours daily. I felt guilty about choosing work over family.",
  },
];

const RATING_OPTIONS = Array.from({ length: 11 }, (_, i) => ({ value: i, label: String(i) }));

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function Sift() {
  const navigate = useNavigate();
  const location = useLocation();
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const initialInput = (location.state as { initialInput?: string })?.initialInput || '';

  const [state, setState] = useState<SiftState>({
    phase: 'entry',
    userInput: '',
    currentParaphrase: '',
    currentStoryText: '',
    options: [],
    refinementCount: 0,
  });

  const [inputValue, setInputValue] = useState(initialInput);
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const [isAiTyping, setIsAiTyping] = useState(false);
  const [selectedRating, setSelectedRating] = useState<number | null>(null);

  // Auto-submit if initial input provided
  const hasAutoSubmitted = useRef(false);
  useEffect(() => {
    if (initialInput.trim() && state.phase === 'entry' && !hasAutoSubmitted.current) {
      hasAutoSubmitted.current = true;
      handleSubmitThought(initialInput);
    }
  }, []);

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputValue(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = Math.min(e.target.scrollHeight, 200) + 'px';
  };

  const handleSubmitThought = (text: string) => {
    if (!text.trim() || isAiTyping) return;

    setState(prev => ({ ...prev, userInput: text }));
    setInputValue('');
    setIsAiTyping(true);

    // Simulate AI paraphrasing
    setTimeout(() => {
      setState(prev => ({
        ...prev,
        phase: 'rating',
        currentParaphrase: MOCK_PARAPHRASE.text,
        currentStoryText: MOCK_PARAPHRASE.storyText,
      }));
      setIsAiTyping(false);
    }, 1000);
  };

  const handleRatingSubmit = () => {
    if (selectedRating === null) return;

    if (selectedRating === 10) {
      // Perfect - done
      setState(prev => ({ ...prev, phase: 'done' }));
    } else {
      // Show options to refine
      setIsAiTyping(true);
      setTimeout(() => {
        setState(prev => ({
          ...prev,
          phase: 'choosing',
          options: MOCK_OPTIONS,
        }));
        setIsAiTyping(false);
      }, 500);
    }
    setSelectedRating(null);
  };

  const handleSelectOption = (option: InterpretationOption) => {
    // Selected an option - go back to rating with new paraphrase
    setIsAiTyping(true);
    setTimeout(() => {
      setState(prev => ({
        ...prev,
        phase: 'rating',
        currentParaphrase: option.text,
        currentStoryText: option.storyText,
        refinementCount: prev.refinementCount + 1,
      }));
      setIsAiTyping(false);
    }, 500);
  };

  const handleAddMoreDetails = () => {
    // Go back to entry for more input
    setState(prev => ({
      ...prev,
      phase: 'entry',
      refinementCount: prev.refinementCount + 1,
    }));
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmitThought(inputValue);
    }
  };

  const handleLeave = () => {
    if (state.phase === 'entry' || state.phase === 'done') {
      navigate('/prototype/linkedin-like/profile');
    } else {
      setShowExitConfirm(true);
    }
  };

  // ============================================================================
  // RENDER HELPERS
  // ============================================================================

  const header = (
    <div className="h-14 border-b bg-white shrink-0">
      <div className="max-w-3xl mx-auto px-4 h-full">
        <div className="flex items-center justify-between h-full">
          <Link to="/prototype/linkedin-like/profile" className="flex items-center gap-2 shrink-0 hover:opacity-80 transition-opacity">
            <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center text-white font-bold text-sm">
              C
            </div>
          </Link>
          <span className="px-3 py-1.5 rounded-full text-sm font-medium bg-gray-100 text-gray-900">
            Clarity AI
          </span>
          <button
            className="px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 rounded-lg transition-colors"
            onClick={handleLeave}
          >
            Leave
          </button>
        </div>
      </div>
    </div>
  );

  const exitConfirmDialog = (
    <Dialog open={showExitConfirm} onOpenChange={setShowExitConfirm}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Leave session?</DialogTitle>
          <DialogDescription>
            Your progress will be lost. You can start over anytime.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex-row gap-2 sm:justify-end">
          <Button variant="outline" onClick={() => setShowExitConfirm(false)}>
            Keep going
          </Button>
          <Button variant="destructive" onClick={() => { setShowExitConfirm(false); navigate('/prototype/linkedin-like/profile'); }}>
            Leave
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  const typingIndicator = (
    <div className="flex gap-1 py-2">
      <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
      <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
      <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
    </div>
  );

  // ============================================================================
  // PHASES
  // ============================================================================

  // ENTRY PHASE
  if (state.phase === 'entry') {
    return (
      <div className="flex flex-col min-h-screen bg-white">
        {header}

        <div className="flex-1 flex flex-col items-center justify-center px-4">
          <div className="w-full max-w-xl text-center mb-6">
            <div className="w-16 h-16 bg-blue-500 rounded-2xl flex items-center justify-center text-white text-2xl font-bold mx-auto mb-4">
              C
            </div>
            <h1 className="text-2xl font-semibold text-gray-900 mb-2">
              {state.refinementCount === 0 ? "What's on your mind?" : "Tell me more"}
            </h1>
            <p className="text-gray-500">
              {state.refinementCount === 0
                ? "I'll help you articulate your thought clearly"
                : "Add details to help me understand better"
              }
            </p>
          </div>

          {/* Input */}
          <div className="w-full max-w-xl">
            <div className="relative flex items-end gap-2 bg-gray-100 rounded-2xl border border-gray-200 focus-within:border-gray-300 focus-within:ring-1 focus-within:ring-gray-300">
              <textarea
                ref={inputRef}
                value={inputValue}
                onChange={handleTextareaChange}
                onKeyDown={handleKeyDown}
                placeholder="e.g., I've been thinking about remote work..."
                rows={1}
                className="flex-1 bg-transparent px-4 py-3 text-[15px] resize-none focus:outline-none max-h-[200px]"
                autoFocus
              />
              <button
                onClick={() => handleSubmitThought(inputValue)}
                disabled={!inputValue.trim()}
                aria-label="Send"
                className={`m-1.5 p-2 rounded-full transition-colors ${
                  inputValue.trim()
                    ? 'bg-blue-500 text-white hover:bg-blue-600'
                    : 'bg-gray-300 text-gray-500'
                }`}
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {exitConfirmDialog}
      </div>
    );
  }

  // RATING PHASE - AI paraphrased, user rates
  if (state.phase === 'rating') {
    return (
      <div className="flex flex-col min-h-screen bg-gray-50">
        {header}

        <div className="flex-1 overflow-y-auto">
          <div className="max-w-2xl mx-auto px-4 py-6">
            {/* User's input */}
            <div className="flex gap-3 mb-6">
              <GravatarAvatar name={MOCK_USER.name} size="sm" />
              <div className="flex-1 bg-white rounded-lg p-4 border border-gray-200">
                <p className="text-gray-900">{state.userInput}</p>
              </div>
            </div>

            {/* AI paraphrase */}
            <div className="flex gap-3">
              <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0">
                C
              </div>
              <div className="flex-1">
                {isAiTyping ? typingIndicator : (
                  <div className="bg-white rounded-lg p-4 border border-gray-200">
                    <p className="text-gray-900 mb-4">{state.currentParaphrase}</p>

                    {/* Rating */}
                    <div className="border-t pt-4">
                      <p className="text-sm text-gray-600 mb-3">How well does this capture what you meant?</p>
                      <div className="flex gap-1 mb-3">
                        {RATING_OPTIONS.map((option) => (
                          <button
                            key={option.value}
                            onClick={() => setSelectedRating(option.value)}
                            className={`flex-1 py-2 rounded text-xs font-medium transition-all ${
                              selectedRating === option.value
                                ? 'bg-blue-500 text-white'
                                : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                            }`}
                          >
                            {option.label}
                          </button>
                        ))}
                      </div>
                      <Button
                        onClick={handleRatingSubmit}
                        disabled={selectedRating === null}
                        className="w-full bg-blue-500 hover:bg-blue-600"
                        size="sm"
                      >
                        {selectedRating === 10 ? "Perfect! Use this" : "Submit"}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {exitConfirmDialog}
      </div>
    );
  }

  // CHOOSING PHASE - Pick from options or add details
  if (state.phase === 'choosing') {
    return (
      <div className="flex flex-col min-h-screen bg-gray-50">
        {header}

        <div className="flex-1 overflow-y-auto">
          <div className="max-w-2xl mx-auto px-4 py-6">
            {/* AI message with options */}
            <div className="flex gap-3">
              <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0">
                C
              </div>
              <div className="flex-1">
                {isAiTyping ? typingIndicator : (
                  <>
                    <p className="text-sm text-gray-900 mb-3">
                      What was the main thing I missed? Pick one or add more details:
                    </p>
                    <div className="bg-white rounded-lg border border-gray-200 divide-y divide-gray-100">
                      {state.options.map((option, index) => (
                        <button
                          key={option.id}
                          onClick={() => handleSelectOption(option)}
                          className="w-full text-left px-4 py-3 flex items-start gap-3 hover:bg-blue-50 transition-colors group"
                        >
                          <span className="w-6 h-6 rounded-full border-2 border-gray-300 group-hover:border-blue-500 flex items-center justify-center text-xs font-medium text-gray-500 group-hover:text-blue-600 shrink-0 mt-0.5">
                            {String.fromCharCode(65 + index)}
                          </span>
                          <p className="text-gray-700 group-hover:text-gray-900 text-sm">
                            {option.text}
                          </p>
                        </button>
                      ))}
                      <button
                        onClick={handleAddMoreDetails}
                        className="w-full text-left px-4 py-3 flex items-center gap-3 text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-colors"
                      >
                        <span className="w-6 h-6 rounded-full border-2 border-dashed border-gray-300 flex items-center justify-center text-xs shrink-0">
                          +
                        </span>
                        <span className="text-sm">Add more details...</span>
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        {exitConfirmDialog}
      </div>
    );
  }

  // DONE PHASE
  if (state.phase === 'done') {
    return (
      <div className="flex flex-col min-h-screen bg-white">
        {header}

        <div className="flex-1 flex flex-col items-center justify-center px-4 pb-6 space-y-6">
          <div className="text-center">
            <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <Check className="w-6 h-6 text-green-600" />
            </div>
            <p className="text-gray-600 text-sm">Your Story is ready</p>
          </div>

          <div className="w-full max-w-sm">
            <div className="bg-white rounded-lg shadow-sm border-l-4 border-l-blue-500 border border-gray-200 overflow-hidden">
              <div className="p-4">
                <div className="flex items-start gap-3">
                  <GravatarAvatar name={MOCK_USER.name} size="sm" isPledger={MOCK_USER.hasPledged} />
                  <div className="flex-1 min-w-0">
                    <span className="font-semibold text-gray-900 text-sm">{MOCK_USER.name}</span>
                    <p className="text-gray-900 text-base mt-1">{state.currentStoryText}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="w-full max-w-sm space-y-3">
            <Button
              onClick={() => navigate('/prototype/linkedin-like/live')}
              className="w-full bg-blue-500 hover:bg-blue-600"
            >
              Invite someone to verify
            </Button>
            <Button
              variant="outline"
              onClick={() => navigate('/prototype/linkedin-like/profile')}
              className="w-full"
            >
              Back to profile
            </Button>
          </div>
        </div>

        {exitConfirmDialog}
      </div>
    );
  }

  return null;
}
