/**
 * @file Sift.tsx
 * @description P98 Sifter Prototype - AI-powered thought clarification
 *
 * ChatGPT-style chat interface where user talks to AI to articulate their Story.
 * 0-10 rating (like /live) for how well AI captured their meaning.
 * Final StoryCard shown only at completion.
 *
 * Reuses /live header pattern for consistency.
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
import { Send } from 'lucide-react';

// ============================================================================
// TYPES
// ============================================================================

type MessageRole = 'user' | 'ai';

interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  showRating?: boolean; // AI can request rating
}

type SiftPhase = 'entry' | 'chat' | 'done';

interface SiftState {
  phase: SiftPhase;
  messages: ChatMessage[];
  currentStoryText: string;
  refinementCount: number;
  currentRating: number | null;
}

// ============================================================================
// CONSTANTS
// ============================================================================

// Mock user for preview
const MOCK_USER = {
  name: "Sarah Chen",
  hasPledged: true,
};

// Mock AI responses (simulating refinement)
const MOCK_AI_RESPONSES = [
  {
    interpretation: "So you're saying the commute was draining you both physically and emotionally, affecting your family time?",
    storyText: "I commuted 2 hours daily and felt exhausted.",
  },
  {
    interpretation: "Ah, so the guilt about missing your kids was the real pain, not just the exhaustion. The commute was taking away irreplaceable moments.",
    storyText: "I commuted 2 hours daily. The exhaustion was physical, but the real pain was guilt about missing my kids.",
  },
  {
    interpretation: "I understand now. The physical exhaustion combined with guilt about missing your children made the situation unsustainable.",
    storyText: "I commuted 2 hours daily. I was exhausted, couldn't see my kids, and felt overwhelming guilt.",
  },
];

// Rating options (same as /live)
const RATING_OPTIONS = [
  { value: 0, label: '0' },
  { value: 1, label: '1' },
  { value: 2, label: '2' },
  { value: 3, label: '3' },
  { value: 4, label: '4' },
  { value: 5, label: '5' },
  { value: 6, label: '6' },
  { value: 7, label: '7' },
  { value: 8, label: '8' },
  { value: 9, label: '9' },
  { value: 10, label: '10' },
] as const;

// Rating threshold for "understood"
const UNDERSTOOD_THRESHOLD = 8;

// Max refinement attempts before showing "use anyway" option
const MAX_REFINEMENTS = 3;

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function Sift() {
  const navigate = useNavigate();
  const location = useLocation();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Read initial input from location state (when coming from Profile composer)
  const initialInput = (location.state as { initialInput?: string })?.initialInput || '';

  const [state, setState] = useState<SiftState>({
    phase: 'entry',
    messages: [],
    currentStoryText: '',
    refinementCount: 0,
    currentRating: null,
  });

  const [inputValue, setInputValue] = useState(initialInput);
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const [isAiTyping, setIsAiTyping] = useState(false);
  const [selectedRating, setSelectedRating] = useState<number | null>(null);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [state.messages, isAiTyping]);

  // If initial input provided, auto-submit (with guard for Strict Mode)
  const hasAutoSubmitted = useRef(false);
  useEffect(() => {
    if (initialInput.trim() && state.phase === 'entry' && !hasAutoSubmitted.current) {
      hasAutoSubmitted.current = true;
      handleSendMessage(initialInput);
    }
  }, []);

  // Auto-resize textarea
  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputValue(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = Math.min(e.target.scrollHeight, 200) + 'px';
  };

  // ============================================================================
  // HANDLERS
  // ============================================================================

  const handleSendMessage = (text: string) => {
    if (!text.trim()) return;
    if (isAiTyping) return; // Prevent double-send while AI is responding

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: text,
    };

    setState(prev => ({
      ...prev,
      phase: 'chat',
      messages: [...prev.messages, userMessage],
    }));

    setInputValue('');
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
    }
    setIsAiTyping(true);

    // Simulate AI response after delay
    setTimeout(() => {
      const responseIndex = Math.min(state.refinementCount, MOCK_AI_RESPONSES.length - 1);
      const response = MOCK_AI_RESPONSES[responseIndex];

      const aiMessage: ChatMessage = {
        id: `ai-${Date.now()}`,
        role: 'ai',
        content: response.interpretation,
        showRating: true,
      };

      setState(prev => ({
        ...prev,
        messages: [...prev.messages, aiMessage],
        currentStoryText: response.storyText,
        currentRating: null,
      }));

      setSelectedRating(null);
      setIsAiTyping(false);
    }, 1000);
  };

  const handleRatingSubmit = () => {
    if (selectedRating === null) return;

    if (selectedRating >= UNDERSTOOD_THRESHOLD) {
      // Done - show final story
      setState(prev => ({ ...prev, phase: 'done' }));
    } else {
      // Not understood well - AI asks for clarification
      setIsAiTyping(true);

      // Mark previous message as no longer needing rating
      setState(prev => ({
        ...prev,
        messages: prev.messages.map((m, i) =>
          i === prev.messages.length - 1 ? { ...m, showRating: false } : m
        ),
      }));

      setTimeout(() => {
        const aiMessage: ChatMessage = {
          id: `ai-${Date.now()}`,
          role: 'ai',
          content: `You rated ${selectedRating}/10. What did I miss? Tell me more about what you meant.`,
        };

        setState(prev => ({
          ...prev,
          messages: [...prev.messages, aiMessage],
          refinementCount: prev.refinementCount + 1,
          currentRating: null,
        }));

        setSelectedRating(null);
        setIsAiTyping(false);
      }, 500);
    }
  };

  const handleUseAnyway = () => {
    // User accepts current story even with low rating
    setState(prev => ({ ...prev, phase: 'done' }));
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage(inputValue);
    }
  };

  const handleInviteToVerify = () => {
    navigate('/prototype/linkedin-like/live');
  };

  const handleBackToProfile = () => {
    navigate('/prototype/linkedin-like/profile');
  };

  const handleLeave = () => {
    if (state.phase === 'entry' || state.phase === 'done') {
      navigate('/prototype/linkedin-like/profile');
    } else {
      setShowExitConfirm(true);
    }
  };

  const handleConfirmLeave = () => {
    setShowExitConfirm(false);
    navigate('/prototype/linkedin-like/profile');
  };

  // ============================================================================
  // COMPONENTS
  // ============================================================================

  // Header - matches /live's LiveMeetingHeader pattern
  const SiftHeader = () => (
    <div className="h-14 border-b bg-white shrink-0">
      <div className="max-w-3xl mx-auto px-4 h-full">
        <div className="flex items-center justify-between h-full">
          {/* Logo */}
          <Link to="/prototype/linkedin-like/profile" className="flex items-center gap-2 shrink-0 hover:opacity-80 transition-opacity">
            <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center text-white font-bold text-sm">
              C
            </div>
          </Link>

          {/* Badge - matches /live pattern */}
          <span className="px-3 py-1.5 rounded-full text-sm font-medium bg-gray-100 text-gray-900">
            Clarity AI
          </span>

          {/* Leave button - matches /live */}
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

  // Rating buttons - matches /live's RatingButtons pattern exactly
  const RatingButtons = () => (
    <div className="flex gap-1 w-full">
      {RATING_OPTIONS.map((option) => (
        <button
          key={option.value}
          onClick={() => setSelectedRating(option.value)}
          className={`
            flex-1 min-w-0 py-2.5 rounded-md text-xs font-medium transition-all
            ${
              selectedRating === option.value
                ? 'bg-blue-500 text-white ring-2 ring-blue-500 ring-offset-1'
                : 'bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200'
            }
          `}
        >
          {option.label}
        </button>
      ))}
    </div>
  );

  // ChatGPT-style message (no bubbles)
  const Message = ({ message }: { message: ChatMessage }) => {
    const isUser = message.role === 'user';
    const showUseAnyway = message.showRating && state.refinementCount >= MAX_REFINEMENTS;

    return (
      <div className={`py-6 ${isUser ? 'bg-white' : 'bg-gray-50'}`}>
        <div className="max-w-3xl mx-auto px-4">
          <div className="flex gap-4">
            {/* Avatar */}
            <div className="shrink-0">
              {isUser ? (
                <GravatarAvatar name={MOCK_USER.name} size="sm" />
              ) : (
                <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center text-white text-sm font-bold">
                  C
                </div>
              )}
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <div className="font-medium text-sm text-gray-900 mb-1">
                {isUser ? 'You' : 'Clarity AI'}
              </div>
              <div className="text-gray-700 text-[15px] leading-relaxed whitespace-pre-wrap">
                {message.content}
              </div>

              {/* Rating UI (matches /live pattern) */}
              {message.showRating && (
                <div className="mt-4 p-4 bg-white rounded-lg border border-gray-200">
                  <p className="text-sm text-gray-600 mb-3">
                    How well does this capture what you meant?
                  </p>
                  <RatingButtons />
                  <div className="mt-3 flex gap-2">
                    <Button
                      onClick={handleRatingSubmit}
                      disabled={selectedRating === null}
                      className="flex-1 bg-blue-500 hover:bg-blue-600"
                      size="sm"
                    >
                      Submit
                    </Button>
                    {showUseAnyway && (
                      <Button
                        onClick={handleUseAnyway}
                        variant="outline"
                        size="sm"
                      >
                        Use this anyway
                      </Button>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

  // Typing indicator
  const TypingIndicator = () => (
    <div className="py-6 bg-gray-50">
      <div className="max-w-3xl mx-auto px-4">
        <div className="flex gap-4">
          <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0">
            C
          </div>
          <div className="flex-1">
            <div className="font-medium text-sm text-gray-900 mb-1">Clarity AI</div>
            <div className="flex gap-1 pt-1">
              <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  // ChatGPT-style input bar
  const InputBar = () => (
    <div className="shrink-0 border-t bg-white">
      <div className="max-w-3xl mx-auto px-4 py-3">
        <div className="relative flex items-end gap-2 bg-gray-100 rounded-2xl border border-gray-200 focus-within:border-gray-300 focus-within:ring-1 focus-within:ring-gray-300">
          <textarea
            ref={inputRef}
            value={inputValue}
            onChange={handleTextareaChange}
            onKeyDown={handleKeyDown}
            placeholder="Share what's on your mind..."
            rows={1}
            className="flex-1 bg-transparent px-4 py-3 text-[15px] resize-none focus:outline-none max-h-[200px]"
          />
          <button
            onClick={() => handleSendMessage(inputValue)}
            disabled={!inputValue.trim()}
            aria-label="Send message"
            className={`m-1.5 p-2 rounded-full transition-colors ${
              inputValue.trim()
                ? 'bg-blue-500 text-white hover:bg-blue-600'
                : 'bg-gray-300 text-gray-500'
            }`}
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
        <p className="text-xs text-gray-400 text-center mt-2">
          Clarity AI helps you articulate your thoughts clearly
        </p>
      </div>
    </div>
  );

  // Story Card Preview (shown only at end)
  const StoryCardPreview = ({ text }: { text: string }) => (
    <div className="bg-white rounded-lg shadow-sm border-l-4 border-l-blue-500 border border-gray-200 overflow-hidden">
      <div className="p-4">
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0">
            <GravatarAvatar
              name={MOCK_USER.name}
              size="sm"
              isPledger={MOCK_USER.hasPledged}
            />
          </div>
          <div className="flex-1 min-w-0">
            <span className="font-semibold text-gray-900 text-sm">{MOCK_USER.name}</span>
            <p className="text-gray-900 text-base mt-1">{text}</p>
          </div>
        </div>
      </div>
    </div>
  );

  // Exit confirmation dialog
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
          <Button variant="destructive" onClick={handleConfirmLeave}>
            Leave
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  // ============================================================================
  // RENDER
  // ============================================================================

  // ENTRY PHASE - Initial input (ChatGPT style)
  if (state.phase === 'entry') {
    return (
      <div className="flex flex-col h-screen bg-white">
        <SiftHeader />

        <div className="flex-1 flex flex-col items-center justify-center px-4">
          <div className="w-full max-w-xl text-center mb-8">
            <div className="w-16 h-16 bg-blue-500 rounded-2xl flex items-center justify-center text-white text-2xl font-bold mx-auto mb-4">
              C
            </div>
            <h1 className="text-2xl font-semibold text-gray-900 mb-2">
              What's on your mind?
            </h1>
            <p className="text-gray-500">
              I'll help you articulate your thoughts into a clear Story
            </p>
          </div>
        </div>

        {/* Input at bottom */}
        <div className="shrink-0 border-t bg-white">
          <div className="max-w-3xl mx-auto px-4 py-3">
            <div className="relative flex items-end gap-2 bg-gray-100 rounded-2xl border border-gray-200 focus-within:border-gray-300 focus-within:ring-1 focus-within:ring-gray-300">
              <textarea
                value={inputValue}
                onChange={handleTextareaChange}
                onKeyDown={handleKeyDown}
                placeholder="e.g., I've been thinking about remote work. I used to commute 2 hours daily..."
                rows={1}
                className="flex-1 bg-transparent px-4 py-3 text-[15px] resize-none focus:outline-none max-h-[200px]"
                autoFocus
              />
              <button
                onClick={() => handleSendMessage(inputValue)}
                disabled={!inputValue.trim()}
                aria-label="Send message"
                className={`m-1.5 p-2 rounded-full transition-colors ${
                  inputValue.trim()
                    ? 'bg-blue-500 text-white hover:bg-blue-600'
                    : 'bg-gray-300 text-gray-500'
                }`}
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-gray-400 text-center mt-2">
              Clarity AI helps you articulate your thoughts clearly
            </p>
          </div>
        </div>

        {exitConfirmDialog}
      </div>
    );
  }

  // CHAT PHASE - Conversation with AI
  if (state.phase === 'chat') {
    return (
      <div className="flex flex-col h-screen bg-white">
        <SiftHeader />

        {/* Messages */}
        <div className="flex-1 overflow-y-auto">
          {state.messages.map((message) => (
            <Message key={message.id} message={message} />
          ))}
          {isAiTyping && <TypingIndicator />}
          <div ref={messagesEndRef} />
        </div>

        {/* Input area - only show if last message doesn't need rating */}
        {state.messages.length > 0 && !state.messages[state.messages.length - 1].showRating && (
          <InputBar />
        )}

        {exitConfirmDialog}
      </div>
    );
  }

  // DONE PHASE - Show final story
  if (state.phase === 'done') {
    return (
      <div className="flex flex-col h-screen bg-white">
        <SiftHeader />

        <div className="flex-1 flex flex-col items-center justify-center px-4 pb-6 space-y-6">
          <div className="text-center">
            <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <svg className="w-6 h-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p className="text-gray-600 text-sm">Your Story is ready</p>
          </div>

          <div className="w-full max-w-sm">
            <StoryCardPreview text={state.currentStoryText} />
          </div>

          <div className="w-full max-w-sm space-y-3">
            <Button
              onClick={handleInviteToVerify}
              className="w-full bg-blue-500 hover:bg-blue-600"
            >
              Invite someone to verify
            </Button>
            <Button
              variant="outline"
              onClick={handleBackToProfile}
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

  // Fallback
  return null;
}
