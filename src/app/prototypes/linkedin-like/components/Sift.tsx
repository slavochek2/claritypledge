/**
 * @file Sift.tsx
 * @description P98 Sifter Prototype - AI-powered thought clarification
 *
 * Flow:
 * 1. Entry - User dumps thoughts in text input
 * 2. Processing - Fake 2-3 sec loading animation
 * 3. Story Review - Live StoryCard preview, rate how well AI understood, refine until 10/10
 * 4. Done - Celebration, invite to verify or back to profile
 *
 * All state is local - no backend, no real AI calls.
 *
 * Design patterns borrowed from /live:
 * - Drawer for focused rating UX
 * - JourneyToUnderstanding-style history (only when ratings exist)
 * - RatingCard with select + submit pattern
 * - Easy exit at every step
 */
import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { X, Sparkles, MessageCircle, Radio } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { PrototypeLayout } from './PrototypeLayout';
import { GravatarAvatar } from '@/components/ui/gravatar-avatar';
import { MobileTooltip } from './shared/MobileTooltip';
import { VisibilityBadge } from './shared';

// ============================================================================
// TYPES
// ============================================================================

type SiftPhase = 'entry' | 'processing' | 'story-review' | 'done';

interface StoryVersion {
  text: string;
  rating: number | null; // null = current (not yet rated)
  aiMessage?: string; // AI's message for this version
}

interface SiftState {
  phase: SiftPhase;
  rawInput: string;
  storyVersions: StoryVersion[];
  currentRating: number | null;
  selectedOption: string | null;
  customInput: string;
  points: string[];
  showRatingDrawer: boolean; // Show rating drawer
  showOptionsDrawer: boolean; // Show refinement options drawer
}

// ============================================================================
// CONSTANTS
// ============================================================================

const CONTENT_LAYOUT = "flex-1 flex flex-col items-center justify-start pt-6 p-4 space-y-4 max-w-lg mx-auto w-full";
const CONTENT_LAYOUT_CENTERED = "flex-1 flex flex-col items-center justify-center px-4 pb-6 space-y-6 max-w-lg mx-auto w-full";

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

// Mock AI conversation
const MOCK_AI_MESSAGES = [
  "I think I understand. You're saying that your commute was draining both physically and emotionally, affecting your family time?",
  "Ah, so the guilt about missing your kids was the real pain point, not just the exhaustion itself. The commute was taking away irreplaceable moments.",
  "I understand now. The physical exhaustion combined with the guilt of missing your children created a situation that was unsustainable for your wellbeing.",
];

// Mock data for prototype
const MOCK_REFINEMENTS = [
  {
    text: "I commuted 2 hours daily and felt exhausted.",
    aiMessage: MOCK_AI_MESSAGES[0],
    aiUncertainty: "I'm uncertain whether the core issue was physical exhaustion or guilt about missing family time.",
    options: [
      "It was mainly about guilt for not being present",
      "The exhaustion was physical, not emotional",
      "There's a work culture element I missed",
    ]
  },
  {
    text: "I commuted 2 hours daily. The exhaustion was physical, but the real pain was guilt about missing my kids.",
    aiMessage: MOCK_AI_MESSAGES[1],
    aiUncertainty: "Did I capture the health impact correctly?",
    options: [
      "Yes, add that my health suffered",
      "The phrasing could be stronger",
    ]
  },
  {
    text: "I commuted 2 hours daily. I was exhausted, couldn't see my kids, and my health suffered. The guilt was overwhelming.",
    aiMessage: MOCK_AI_MESSAGES[2],
    aiUncertainty: null,
    options: []
  }
];

const MOCK_POINTS = [
  "Remote work improves wellbeing for knowledge workers",
  "Long commutes negatively impact family life and health"
];

const PROCESSING_STEPS = [
  { text: "Reading your thoughts...", delay: 500 },
  { text: "Finding the core experience...", delay: 600 },
  { text: "Extracting claims...", delay: 500 },
  { text: "Preparing to verify understanding...", delay: 500 },
];

// Mock user for preview
const MOCK_USER = {
  name: "You",
  role: "Sharing your experience",
  hasPledged: true,
};

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function Sift() {
  const navigate = useNavigate();
  const location = useLocation();

  // Read initial input from location state (when coming from Profile composer)
  const initialInput = (location.state as { initialInput?: string })?.initialInput || '';

  // If initial input provided, skip entry and go straight to processing
  const [state, setState] = useState<SiftState>({
    phase: initialInput.trim() ? 'processing' : 'entry',
    rawInput: initialInput,
    storyVersions: [],
    currentRating: null,
    selectedOption: null,
    customInput: '',
    points: [],
    showRatingDrawer: false,
    showOptionsDrawer: false,
  });

  const [selectedRating, setSelectedRating] = useState<number | null>(null);
  const [processingStep, setProcessingStep] = useState(0);
  const [showExitConfirm, setShowExitConfirm] = useState(false);

  // Processing animation
  useEffect(() => {
    if (state.phase !== 'processing') return;

    if (processingStep < PROCESSING_STEPS.length) {
      const timer = setTimeout(() => {
        setProcessingStep(prev => prev + 1);
      }, PROCESSING_STEPS[processingStep].delay);
      return () => clearTimeout(timer);
    } else {
      // Processing complete - transition to story-review
      const timer = setTimeout(() => {
        setState(prev => ({
          ...prev,
          phase: 'story-review',
          storyVersions: [{
            text: MOCK_REFINEMENTS[0].text,
            rating: null,
            aiMessage: MOCK_REFINEMENTS[0].aiMessage,
          }],
          points: MOCK_POINTS,
          showRatingDrawer: true,
        }));
      }, 400);
      return () => clearTimeout(timer);
    }
  }, [state.phase, processingStep]);

  // ============================================================================
  // HANDLERS
  // ============================================================================

  const handleStartSift = () => {
    if (!state.rawInput.trim()) return;
    setProcessingStep(0);
    setState(prev => ({ ...prev, phase: 'processing' }));
  };

  const handleRatingSubmit = () => {
    if (selectedRating === null) return;

    // Update current version with rating
    const updatedVersions = [...state.storyVersions];
    const currentIndex = updatedVersions.length - 1;
    updatedVersions[currentIndex] = {
      ...updatedVersions[currentIndex],
      rating: selectedRating,
    };

    if (selectedRating === 10) {
      // Perfect! Go to done phase
      setState(prev => ({
        ...prev,
        phase: 'done',
        storyVersions: updatedVersions,
        currentRating: selectedRating,
        showRatingDrawer: false,
        showOptionsDrawer: false,
      }));
    } else {
      // Show options for refinement
      setState(prev => ({
        ...prev,
        storyVersions: updatedVersions,
        currentRating: selectedRating,
        showRatingDrawer: false,
        showOptionsDrawer: true,
      }));
    }
    setSelectedRating(null);
  };

  const handleOptionSelect = (option: string) => {
    setState(prev => ({ ...prev, selectedOption: option }));
  };

  const handleContinueRefinement = () => {
    // Get next mock refinement or use final one
    const nextIndex = Math.min(state.storyVersions.length, MOCK_REFINEMENTS.length - 1);
    const nextRefinement = MOCK_REFINEMENTS[nextIndex];

    setState(prev => ({
      ...prev,
      storyVersions: [...prev.storyVersions, {
        text: nextRefinement.text,
        rating: null,
        aiMessage: nextRefinement.aiMessage,
      }],
      selectedOption: null,
      customInput: '',
      showOptionsDrawer: false,
      showRatingDrawer: true,
    }));
  };

  const handleSpeakFreely = () => {
    // Close drawer and continue without rating
    setState(prev => ({
      ...prev,
      showRatingDrawer: false,
      showOptionsDrawer: false,
    }));
  };

  const handleInviteToVerify = () => {
    navigate('/prototype/linkedin-like/live');
  };

  const handleBackToProfile = () => {
    navigate('/prototype/linkedin-like/profile');
  };

  const handleExit = () => {
    if (state.phase === 'entry' || state.phase === 'done') {
      navigate('/prototype/linkedin-like/profile');
    } else {
      setShowExitConfirm(true);
    }
  };

  const handleConfirmExit = () => {
    setShowExitConfirm(false);
    navigate('/prototype/linkedin-like/profile');
  };

  // ============================================================================
  // SHARED COMPONENTS
  // ============================================================================

  // Rating buttons (reused from Live.tsx pattern)
  const RatingButtons = ({ selectedValue, onSelect }: { selectedValue: number | null; onSelect: (v: number) => void }) => (
    <div className="flex gap-1 w-full max-w-sm">
      {RATING_OPTIONS.map((option) => (
        <button
          key={option.value}
          onClick={() => onSelect(option.value)}
          className={`
            flex-1 min-w-0 py-2.5 rounded-md text-xs font-medium transition-all
            ${
              selectedValue === option.value
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

  // Rating display dots
  const RatingDisplay = ({ rating }: { rating: number }) => {
    const filledDots = rating;
    const emptyDots = 10 - rating;

    return (
      <div className="flex items-center gap-2">
        <div className="flex gap-0.5">
          {Array.from({ length: filledDots }).map((_, i) => (
            <span key={`filled-${i}`} className="w-2 h-2 rounded-full bg-foreground" />
          ))}
          {Array.from({ length: emptyDots }).map((_, i) => (
            <span key={`empty-${i}`} className="w-2 h-2 rounded-full bg-muted-foreground/30" />
          ))}
        </div>
        <span className="text-sm font-semibold tabular-nums w-5 text-right">{rating}</span>
      </div>
    );
  };

  // Story Card Preview - matches actual StoryCard styling
  const StoryCardPreview = ({ text, isLive = false }: { text: string; isLive?: boolean }) => (
    <div className={`bg-white rounded-lg shadow-sm border-l-4 border-l-blue-500 border border-gray-200 overflow-hidden ${isLive ? 'ring-2 ring-blue-500 ring-offset-2' : ''}`}>
      <div className="p-4">
        <div className="flex items-start gap-3">
          {/* Avatar */}
          <div className="flex-shrink-0">
            <GravatarAvatar
              name={MOCK_USER.name}
              size="sm"
              isPledger={MOCK_USER.hasPledged}
            />
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            {/* Author info */}
            <div className="mb-2">
              <div className="flex items-center gap-1.5">
                <span className="font-semibold text-gray-900 text-sm">{MOCK_USER.name}</span>
              </div>
              <p className="text-xs text-gray-500 flex items-center gap-1">
                <span>{MOCK_USER.role} · Just now</span>
                <VisibilityBadge visibility="public" />
              </p>
            </div>

            {/* Story text */}
            <p className="text-gray-900 text-base">{text}</p>

            {/* Stats row */}
            <div className="flex items-center mt-3">
              <MobileTooltip content="No one has verified understanding yet">
                <span className="px-2.5 py-1 bg-gray-100 rounded-full text-sm text-gray-600">
                  0 understood
                </span>
              </MobileTooltip>
            </div>
          </div>
        </div>
      </div>

      {/* CTA */}
      <div className="border-t border-gray-100 px-4 py-3">
        <button
          disabled
          className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-blue-400 rounded-lg cursor-not-allowed opacity-75"
        >
          <Radio size={16} />
          Start a Clarity Session
        </button>
      </div>
    </div>
  );

  // AI Message bubble
  const AIMessageBubble = ({ message }: { message: string }) => (
    <div className="flex gap-3 items-start">
      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center flex-shrink-0">
        <Sparkles size={16} className="text-white" />
      </div>
      <div className="flex-1 bg-gray-100 rounded-2xl rounded-tl-sm px-4 py-3">
        <p className="text-sm text-gray-800">{message}</p>
      </div>
    </div>
  );

  // Journey history - only shown when there are completed ratings
  const JourneyHistory = ({ versions }: { versions: StoryVersion[] }) => {
    // Only show versions with ratings
    const ratedVersions = versions.filter(v => v.rating !== null);
    if (ratedVersions.length === 0) return null;

    return (
      <div className="bg-muted/50 border border-border rounded-lg p-4 w-full">
        <p className="text-sm font-medium text-muted-foreground text-center mb-3 pb-2 border-b border-border">
          AI Journey to understand you
        </p>
        <div className="space-y-2">
          {ratedVersions.map((version, index) => (
            <div key={index} className="flex items-center gap-3">
              <div className="w-6 shrink-0 text-xs text-muted-foreground text-right">
                {index + 1}
              </div>
              <div className="flex-1 flex items-center justify-between">
                <RatingDisplay rating={version.rating!} />
                {version.rating === 10 && <span className="text-green-500">✓</span>}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  // Header with exit button
  const SiftHeader = ({ title, onExit }: { title: string; onExit: () => void }) => (
    <div className="bg-white border-b border-gray-200">
      <div className="flex items-center justify-between px-4 py-3 max-w-4xl mx-auto">
        <button
          onClick={onExit}
          className="flex items-center gap-2 text-sm font-medium text-gray-600 hover:text-gray-800 transition-colors"
        >
          <X className="w-4 h-4" />
          Exit
        </button>
        <span className="text-sm font-medium text-gray-900">{title}</span>
        <div className="w-12" /> {/* Spacer for centering */}
      </div>
    </div>
  );

  // Exit confirmation dialog
  const exitConfirmDialog = (
    <Dialog open={showExitConfirm} onOpenChange={setShowExitConfirm}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Exit Sifter?</DialogTitle>
          <DialogDescription>
            Your progress will be lost. You can start over anytime.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex-row gap-2 sm:justify-end">
          <Button variant="outline" onClick={() => setShowExitConfirm(false)}>
            Keep going
          </Button>
          <Button variant="destructive" onClick={handleConfirmExit}>
            Exit
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  // ============================================================================
  // PHASE RENDERING
  // ============================================================================

  // ENTRY PHASE
  if (state.phase === 'entry') {
    return (
      <PrototypeLayout>
        <SiftHeader title="Clarity Sifter" onExit={handleExit} />
        <div className={CONTENT_LAYOUT_CENTERED}>
          <div className="text-center space-y-2">
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center mx-auto mb-4">
              <Sparkles size={24} className="text-white" />
            </div>
            <h1 className="text-xl font-semibold text-gray-900">AI Journey to understand you</h1>
            <p className="text-gray-500 text-sm">
              Dump your thoughts. I'll help untangle them<br />
              until I understand you perfectly.
            </p>
          </div>

          <div className="w-full max-w-sm space-y-4">
            <textarea
              value={state.rawInput}
              onChange={(e) => setState(prev => ({ ...prev, rawInput: e.target.value }))}
              placeholder={`e.g., "I've been thinking about remote work. I used to commute 2 hours daily and it was killing me..."`}
              className="w-full h-32 p-4 border border-gray-300 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              autoFocus
            />
            <Button
              onClick={handleStartSift}
              disabled={!state.rawInput.trim()}
              className="w-full bg-blue-500 hover:bg-blue-600"
            >
              Start the journey
            </Button>
          </div>
        </div>
        {exitConfirmDialog}
      </PrototypeLayout>
    );
  }

  // PROCESSING PHASE
  if (state.phase === 'processing') {
    return (
      <PrototypeLayout>
        <SiftHeader title="Processing..." onExit={handleExit} />
        <div className={CONTENT_LAYOUT_CENTERED}>
          <div className="text-center space-y-6">
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center mx-auto animate-pulse">
              <Sparkles size={24} className="text-white" />
            </div>

            <div className="space-y-3 text-left max-w-xs mx-auto">
              {PROCESSING_STEPS.map((step, index) => (
                <div key={index} className="flex items-center gap-3">
                  {index < processingStep ? (
                    <span className="text-green-500 w-4">✓</span>
                  ) : index === processingStep ? (
                    <span className="w-2 h-2 bg-blue-500 rounded-full animate-pulse ml-1" />
                  ) : (
                    <span className="w-2 h-2 bg-gray-300 rounded-full ml-1" />
                  )}
                  <span className={index <= processingStep ? 'text-gray-900 text-sm' : 'text-gray-400 text-sm'}>
                    {step.text}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
        {exitConfirmDialog}
      </PrototypeLayout>
    );
  }

  // Get current refinement data
  const currentVersionIndex = state.storyVersions.length - 1;
  const mockIndex = Math.min(currentVersionIndex, MOCK_REFINEMENTS.length - 1);
  const currentRefinement = MOCK_REFINEMENTS[mockIndex];
  const currentVersion = state.storyVersions[currentVersionIndex];

  // STORY REVIEW PHASE
  if (state.phase === 'story-review') {
    // Check if we have any completed ratings to show history
    const hasHistory = state.storyVersions.some(v => v.rating !== null);

    return (
      <div className="flex flex-col min-h-screen bg-background">
        <SiftHeader title="Story Review" onExit={handleExit} />

        <div className={`${CONTENT_LAYOUT} pb-80`}>
          {/* Journey history - only show when there are completed ratings */}
          {hasHistory && (
            <JourneyHistory versions={state.storyVersions} />
          )}

          {/* AI conversation */}
          {currentVersion?.aiMessage && (
            <AIMessageBubble message={currentVersion.aiMessage} />
          )}

          {/* Story Card Preview - live updating */}
          <div className="w-full">
            <p className="text-xs text-muted-foreground uppercase tracking-wide mb-2 text-center">
              Your Story (Preview)
            </p>
            <StoryCardPreview text={currentVersion?.text || ''} isLive={true} />
          </div>
        </div>

        {/* Fixed bottom panel - Rating */}
        {state.showRatingDrawer && (
          <div className="fixed bottom-0 left-0 right-0 bg-background border-t rounded-t-2xl shadow-lg z-50">
            <div className="p-4 pb-8 max-w-lg mx-auto">
              <div className="text-center mb-4">
                <p className="text-sm text-muted-foreground">
                  AI is trying to understand your experience
                </p>
                <h2 className="text-lg font-semibold">
                  How well does this capture what you meant?
                </h2>
              </div>
              <div className="flex flex-col items-center space-y-3">
                <div className="flex justify-between text-xs text-muted-foreground w-full max-w-sm">
                  <span>Not at all</span>
                  <span>Perfectly understood</span>
                </div>
                <RatingButtons selectedValue={selectedRating} onSelect={setSelectedRating} />
                <Button
                  className="bg-blue-500 hover:bg-blue-600 w-full max-w-[200px] mt-2"
                  disabled={selectedRating === null}
                  onClick={handleRatingSubmit}
                >
                  Submit
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleSpeakFreely}
                  className="text-muted-foreground"
                >
                  Skip for now
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Fixed bottom panel - Refinement Options */}
        {state.showOptionsDrawer && (
          <div className="fixed bottom-0 left-0 right-0 bg-background border-t rounded-t-2xl shadow-lg z-50 max-h-[70vh] overflow-y-auto">
            <div className="p-4 pb-8 max-w-lg mx-auto">
              <div className="text-center mb-4">
                <p className="text-sm text-muted-foreground">
                  You rated {state.currentRating}/10
                </p>
                <h2 className="text-lg font-semibold">
                  What did I miss?
                </h2>
              </div>
              <div className="space-y-4">
                {/* AI uncertainty */}
                {currentRefinement.aiUncertainty && (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                    <p className="text-sm text-blue-700">"{currentRefinement.aiUncertainty}"</p>
                  </div>
                )}

                {/* Options */}
                <div className="space-y-2">
                  {currentRefinement.options.map((option, index) => (
                    <button
                      key={index}
                      onClick={() => handleOptionSelect(option)}
                      className={`w-full text-left p-3 rounded-lg border transition-colors text-sm ${
                        state.selectedOption === option
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-gray-200 hover:bg-gray-50'
                      }`}
                    >
                      {option}
                    </button>
                  ))}
                </div>

                {/* Custom input */}
                <input
                  type="text"
                  value={state.customInput}
                  onChange={(e) => setState(prev => ({ ...prev, customInput: e.target.value, selectedOption: null }))}
                  placeholder="Or tell me what's off..."
                  className="w-full p-3 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />

                <Button
                  onClick={handleContinueRefinement}
                  disabled={!state.selectedOption && !state.customInput.trim()}
                  className="w-full bg-blue-500 hover:bg-blue-600"
                >
                  Help AI understand better
                </Button>
              </div>
            </div>
          </div>
        )}

        {exitConfirmDialog}
      </div>
    );
  }

  // DONE PHASE
  if (state.phase === 'done') {
    const roundCount = state.storyVersions.length;
    const finalVersion = state.storyVersions[state.storyVersions.length - 1];

    return (
      <PrototypeLayout>
        <SiftHeader title="Complete!" onExit={handleExit} />

        <div className={CONTENT_LAYOUT}>
          {/* Celebration */}
          <div className="text-center space-y-2">
            <div className="text-4xl">🎉</div>
            <h2 className="text-xl font-semibold text-green-600">AI understood you perfectly!</h2>
            <p className="text-sm text-muted-foreground">
              Achieved in {roundCount} {roundCount === 1 ? 'round' : 'rounds'}
            </p>
          </div>

          {/* Journey summary */}
          <JourneyHistory versions={state.storyVersions} />

          {/* Final Story Card */}
          <div className="w-full">
            <p className="text-xs text-muted-foreground uppercase tracking-wide mb-2 text-center">
              Your Story (Ready to share)
            </p>
            <StoryCardPreview text={finalVersion?.text || ''} />
          </div>

          {/* Points extracted */}
          {state.points.length > 0 && (
            <p className="text-sm text-muted-foreground text-center">
              {state.points.length} Points extracted (you can review these later)
            </p>
          )}

          {/* Action buttons */}
          <div className="w-full max-w-sm space-y-3">
            <Button
              onClick={handleInviteToVerify}
              className="w-full bg-blue-500 hover:bg-blue-600"
            >
              <MessageCircle size={16} className="mr-2" />
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
      </PrototypeLayout>
    );
  }

  // Fallback
  return (
    <PrototypeLayout>
      <SiftHeader title="Sifter" onExit={handleExit} />
      <div className={CONTENT_LAYOUT_CENTERED}>
        <p>Unknown state</p>
        <Button onClick={() => setState(prev => ({ ...prev, phase: 'entry' }))}>Reset</Button>
      </div>
      {exitConfirmDialog}
    </PrototypeLayout>
  );
}
