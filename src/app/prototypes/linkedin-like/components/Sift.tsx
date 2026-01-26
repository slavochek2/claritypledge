/**
 * @file Sift.tsx
 * @description P98 Sifter Prototype - AI-powered thought clarification
 *
 * Flow:
 * 1. Entry - User dumps thoughts in text input
 * 2. Processing - Fake 2-3 sec loading animation
 * 3. Story Review - Rate how well AI understood, refine until 10/10
 * 4. Done - Celebration, invite to verify or back to profile
 *
 * All state is local - no backend, no real AI calls.
 */
import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { PrototypeLayout } from './PrototypeLayout';

// ============================================================================
// TYPES
// ============================================================================

type SiftPhase = 'entry' | 'processing' | 'story-review' | 'done';

interface StoryVersion {
  text: string;
  rating: number | null; // null = current (not yet rated)
}

interface SiftState {
  phase: SiftPhase;
  rawInput: string;
  storyVersions: StoryVersion[];
  currentRating: number | null;
  selectedOption: string | null;
  customInput: string;
  points: string[];
  showOptions: boolean; // Show refinement options after rating <10
}

// ============================================================================
// CONSTANTS
// ============================================================================

const CONTENT_LAYOUT = "flex-1 flex flex-col items-center justify-start pt-8 p-6 space-y-6 max-w-lg mx-auto w-full";
const CONTENT_LAYOUT_CENTERED = "flex-1 flex flex-col items-center justify-center px-6 pb-6 space-y-8 max-w-lg mx-auto w-full";

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

// Mock data for prototype
const MOCK_REFINEMENTS = [
  {
    text: "I commuted 2 hours daily and felt exhausted.",
    aiUncertainty: "I'm uncertain whether the core issue was physical exhaustion or guilt about missing family time.",
    options: [
      "A. It was mainly about guilt for not being present",
      "B. The exhaustion was physical, not emotional",
      "C. There's a work culture element I missed",
    ]
  },
  {
    text: "I commuted 2 hours daily. The exhaustion was physical, but the real pain was guilt about missing my kids.",
    aiUncertainty: "Did I capture the health impact correctly?",
    options: [
      "A. Yes, add that my health suffered",
      "B. The phrasing could be stronger",
    ]
  },
  {
    text: "I commuted 2 hours daily. I was exhausted, couldn't see my kids, and my health suffered. The guilt was overwhelming.",
    aiUncertainty: null,
    options: []
  }
];

const MOCK_POINTS = [
  "Remote work improves wellbeing for knowledge workers",
  "Long commutes negatively impact family life and health"
];

const PROCESSING_STEPS = [
  { text: "Finding your Stories...", delay: 600 },
  { text: "Finding your Points...", delay: 600 },
  { text: "Hardening claims...", delay: 600 },
  { text: "Preparing overview...", delay: 600 },
];

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function Sift() {
  const navigate = useNavigate();
  const location = useLocation();

  // Read initial input from location state (when coming from Profile composer)
  const initialInput = (location.state as { initialInput?: string })?.initialInput || '';

  const [state, setState] = useState<SiftState>({
    phase: 'entry',
    rawInput: initialInput,
    storyVersions: [],
    currentRating: null,
    selectedOption: null,
    customInput: '',
    points: [],
    showOptions: false,
  });

  const [selectedRating, setSelectedRating] = useState<number | null>(null);
  const [processingStep, setProcessingStep] = useState(0);

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
          storyVersions: [{ text: MOCK_REFINEMENTS[0].text, rating: null }],
          points: MOCK_POINTS,
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
        showOptions: false,
      }));
    } else {
      // Show options for refinement
      setState(prev => ({
        ...prev,
        storyVersions: updatedVersions,
        currentRating: selectedRating,
        showOptions: true,
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
      storyVersions: [...prev.storyVersions, { text: nextRefinement.text, rating: null }],
      selectedOption: null,
      customInput: '',
      showOptions: false,
    }));
  };

  const handleInviteToVerify = () => {
    navigate('/prototype/linkedin-like/live');
  };

  const handleBackToProfile = () => {
    navigate('/prototype/linkedin-like/profile');
  };

  const handleBack = () => {
    if (state.phase === 'story-review' && state.showOptions) {
      setState(prev => ({ ...prev, showOptions: false }));
    } else if (state.phase === 'story-review') {
      setState(prev => ({ ...prev, phase: 'entry' }));
    } else {
      navigate('/prototype/linkedin-like/profile');
    }
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

  // Rating display dots (reused from Live.tsx pattern)
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

  // Primary button
  const PrimaryButton = ({ onClick, children, disabled }: { onClick: () => void; children: React.ReactNode; disabled?: boolean }) => (
    <button
      onClick={onClick}
      disabled={disabled}
      className="bg-blue-500 hover:bg-blue-600 disabled:bg-blue-300 disabled:cursor-not-allowed text-white font-semibold py-3 px-6 rounded-md w-full transition-colors"
    >
      {children}
    </button>
  );

  // Secondary button
  const SecondaryButton = ({ onClick, children }: { onClick: () => void; children: React.ReactNode }) => (
    <button
      onClick={onClick}
      className="border border-input bg-background hover:bg-accent text-foreground font-semibold py-3 px-6 rounded-md w-full transition-colors"
    >
      {children}
    </button>
  );

  // Journey with versions
  const JourneyWithVersions = ({ versions, variant = 'default' }: { versions: StoryVersion[]; variant?: 'default' | 'success' }) => {
    const bgClass = variant === 'success'
      ? 'bg-green-50 border border-green-200'
      : 'bg-muted/50 border border-border';

    return (
      <div className={`${bgClass} rounded-lg p-4 w-full max-w-sm`}>
        <p className="text-sm font-medium text-muted-foreground text-center mb-3 pb-2 border-b border-border">
          Your journey
        </p>
        <div className="space-y-2">
          {versions.map((version, index) => (
            <div key={index} className="flex items-start gap-3">
              <div className="w-4 shrink-0 text-xs text-muted-foreground pt-0.5 text-right">{index}</div>
              <div className="flex-1 space-y-1">
                {version.rating !== null ? (
                  <div className="flex items-center justify-between">
                    <RatingDisplay rating={version.rating} />
                    {version.rating === 10 && <span className="text-green-500">✓</span>}
                  </div>
                ) : (
                  <span className="text-xs text-muted-foreground italic">← rating now</span>
                )}
                <p className="text-xs text-muted-foreground truncate" title={version.text}>
                  "{version.text.slice(0, 30)}..."
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  // ============================================================================
  // PHASE RENDERING
  // ============================================================================

  // ENTRY PHASE
  if (state.phase === 'entry') {
    return (
      <PrototypeLayout>
        <div className={CONTENT_LAYOUT_CENTERED}>
          <div className="text-center space-y-2">
            <h1 className="text-2xl font-semibold text-gray-900">Clarity Sifter</h1>
            <p className="text-gray-500">
              Dump your thoughts.<br />
              I'll help untangle them.
            </p>
          </div>

          <div className="w-full max-w-sm space-y-4">
            <textarea
              value={state.rawInput}
              onChange={(e) => setState(prev => ({ ...prev, rawInput: e.target.value }))}
              placeholder={`e.g., "I've been thinking about remote work. I used to commute 2 hours..."`}
              className="w-full h-40 p-4 border border-gray-300 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            />
            <PrimaryButton onClick={handleStartSift} disabled={!state.rawInput.trim()}>
              Sift my thoughts
            </PrimaryButton>
          </div>
        </div>
      </PrototypeLayout>
    );
  }

  // PROCESSING PHASE
  if (state.phase === 'processing') {
    return (
      <PrototypeLayout>
        <div className={CONTENT_LAYOUT_CENTERED}>
          <div className="text-center space-y-6">
            <h2 className="text-xl font-semibold text-gray-900">Sifting your thoughts...</h2>

            <div className="space-y-3 text-left max-w-xs mx-auto">
              {PROCESSING_STEPS.map((step, index) => (
                <div key={index} className="flex items-center gap-3">
                  {index < processingStep ? (
                    <span className="text-green-500">✓</span>
                  ) : index === processingStep ? (
                    <span className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
                  ) : (
                    <span className="w-2 h-2 bg-gray-300 rounded-full" />
                  )}
                  <span className={index <= processingStep ? 'text-gray-900' : 'text-gray-400'}>
                    {step.text}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </PrototypeLayout>
    );
  }

  // Get current refinement data
  const currentVersionIndex = state.storyVersions.length - 1;
  const mockIndex = Math.min(currentVersionIndex, MOCK_REFINEMENTS.length - 1);
  const currentRefinement = MOCK_REFINEMENTS[mockIndex];
  const currentVersion = state.storyVersions[currentVersionIndex];

  // STORY REVIEW PHASE - Show options after rating <10
  if (state.phase === 'story-review' && state.showOptions) {
    return (
      <PrototypeLayout>
        {/* Sub-header */}
        <div className="bg-white border-b border-gray-200">
          <div className="flex items-center gap-3 px-4 py-3 max-w-4xl mx-auto">
            <button
              onClick={handleBack}
              className="flex items-center gap-2 text-sm font-medium text-gray-600 hover:text-gray-800 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Back
            </button>
            <span className="flex-1 text-center text-sm text-gray-500">
              Refining
            </span>
            <div className="w-12" />
          </div>
        </div>

        <div className={CONTENT_LAYOUT}>
          {/* Rating badge */}
          <div className="text-center">
            <span className="text-sm text-muted-foreground">You rated {state.currentRating}/10</span>
          </div>

          {/* AI uncertainty */}
          {currentRefinement.aiUncertainty && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 w-full max-w-sm">
              <p className="text-sm font-medium text-blue-900 mb-2">Here's what I'm uncertain about:</p>
              <p className="text-sm text-blue-700">"{currentRefinement.aiUncertainty}"</p>
            </div>
          )}

          {/* Options */}
          <div className="w-full max-w-sm space-y-3">
            <p className="text-sm text-muted-foreground">What's closer?</p>
            {currentRefinement.options.map((option, index) => (
              <button
                key={index}
                onClick={() => handleOptionSelect(option)}
                className={`w-full text-left p-3 rounded-lg border transition-colors ${
                  state.selectedOption === option
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-200 hover:bg-gray-50'
                }`}
              >
                <span className="text-sm">{option}</span>
              </button>
            ))}

            {/* Custom input */}
            <input
              type="text"
              value={state.customInput}
              onChange={(e) => setState(prev => ({ ...prev, customInput: e.target.value, selectedOption: null }))}
              placeholder="Tell me what's off..."
              className="w-full p-3 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />

            <PrimaryButton
              onClick={handleContinueRefinement}
              disabled={!state.selectedOption && !state.customInput.trim()}
            >
              Continue
            </PrimaryButton>
          </div>
        </div>
      </PrototypeLayout>
    );
  }

  // STORY REVIEW PHASE - Rating screen
  if (state.phase === 'story-review') {
    return (
      <PrototypeLayout>
        {/* Sub-header */}
        <div className="bg-white border-b border-gray-200">
          <div className="flex items-center gap-3 px-4 py-3 max-w-4xl mx-auto">
            <button
              onClick={handleBack}
              className="flex items-center gap-2 text-sm font-medium text-gray-600 hover:text-gray-800 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Back
            </button>
            <span className="flex-1 text-center text-sm text-gray-500">
              Story Review
            </span>
            <div className="w-12" />
          </div>
        </div>

        <div className={CONTENT_LAYOUT}>
          {/* Journey with versions */}
          {state.storyVersions.length > 0 && (
            <JourneyWithVersions versions={state.storyVersions} />
          )}

          {/* Current version card */}
          <div className="bg-white border border-gray-200 rounded-lg p-4 w-full max-w-sm">
            <p className="text-xs text-muted-foreground uppercase tracking-wide mb-2">Current Version</p>
            <p className="text-sm text-gray-900">{currentVersion?.text}</p>
          </div>

          {/* Rating section */}
          <div className="w-full max-w-sm space-y-4">
            <p className="text-center font-medium">Do you feel understood?</p>
            <RatingButtons selectedValue={selectedRating} onSelect={setSelectedRating} />
            <PrimaryButton onClick={handleRatingSubmit} disabled={selectedRating === null}>
              Submit
            </PrimaryButton>
          </div>
        </div>
      </PrototypeLayout>
    );
  }

  // DONE PHASE
  if (state.phase === 'done') {
    const roundCount = state.storyVersions.length;

    return (
      <PrototypeLayout>
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
          <JourneyWithVersions versions={state.storyVersions} variant="success" />

          {/* Final story */}
          <div className="bg-white border border-gray-200 rounded-lg p-4 w-full max-w-sm">
            <p className="text-xs text-muted-foreground uppercase tracking-wide mb-2">Final Story</p>
            <p className="text-sm text-gray-900">{state.storyVersions[state.storyVersions.length - 1]?.text}</p>
          </div>

          {/* Points extracted */}
          {state.points.length > 0 && (
            <p className="text-sm text-muted-foreground">
              {state.points.length} Points extracted (unreviewed)
            </p>
          )}

          {/* Action buttons */}
          <div className="w-full max-w-sm space-y-3">
            <PrimaryButton onClick={handleInviteToVerify}>
              Invite someone to verify →
            </PrimaryButton>
            <SecondaryButton onClick={handleBackToProfile}>
              Back to profile
            </SecondaryButton>
          </div>
        </div>
      </PrototypeLayout>
    );
  }

  // Fallback
  return (
    <PrototypeLayout>
      <div className={CONTENT_LAYOUT_CENTERED}>
        <p>Unknown state</p>
        <PrimaryButton onClick={() => setState(prev => ({ ...prev, phase: 'entry' }))}>Reset</PrimaryButton>
      </div>
    </PrototypeLayout>
  );
}
