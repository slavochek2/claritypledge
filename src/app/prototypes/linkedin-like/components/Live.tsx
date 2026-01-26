/**
 * @file Live.tsx
 * @description Mocked Live Session UI with Card-based Verification (P85)
 *
 * This is a fully interactive mock of the Clarity Live Meeting experience.
 * All state is local - no backend, no Supabase, no audio recording.
 *
 * P85 Flow (Card Verification):
 * 1. Start screen - Create or Join a meeting
 * 2. Waiting room - Show code, wait for partner (mocked)
 * 3. Live mode - "connected" with partner
 * 4. [Pick cards] → Select Story from drawer
 * 5. Card visible during verification flow
 * 6. Rating ≥8 → Points unlocked for position staking
 * 7. Rating <8 → Try again or Speak freely
 * 8. Session history tracks verified cards
 */
import { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Link } from 'react-router-dom';
import { X, Volume2, VolumeX, ArrowLeft, Copy, Check, Users, Plus, LogIn, BookOpen, CheckCircle2, Sparkles, Search, Pin } from 'lucide-react';
import { GravatarAvatar } from '@/components/ui/gravatar-avatar';
import { PrototypeLayout } from './PrototypeLayout';
import { StoryCard } from './StoryCard';
import { PointCard } from './PointCard';
import { mockUsers, currentUser, getStories, getStoryById, getPointsForStory, getStoriesForPoint, getUserById, getPoints } from '../data/mock-data';
import { PositionButtons } from './shared';
import type { PositionType } from '../../shared/types';
import { QRCodeSVG } from 'qrcode.react';
import { Toaster } from '@/components/ui/sonner';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import type { Story, Point } from '../../shared/types';

// ============================================================================
// TYPES
// ============================================================================

type MeetingPhase = 'start' | 'waiting' | 'live';
type RatingPhase = 'idle' | 'rating' | 'waiting' | 'revealed' | 'explain-back' | 'results' | 'perfect';
type FlowType = 'check' | 'prove';
type GapType = 'overconfidence' | 'underconfidence' | 'none';

// P85: Card verification state machine
type CardPhase =
  | 'idle'              // Show Stories/Points with search
  | 'story-selected'    // Story selected, showing rating inline
  | 'point-selected'    // Point selected, showing position + CTA
  | 'in-legacy-flow';   // Card active, using legacy /live flow

// Type of card being discussed
type CardType = 'story' | 'point';

// Perspective toggle for prototype testing
type Perspective = 'checker' | 'partner';

// Partner's view state (expanded for Points)
type PartnerPhase = 'waiting' | 'story-received' | 'point-received';

// P85: Verified card in session history
interface VerifiedCard {
  storyId: string;
  rating: number;
  verified: boolean;
  timestamp: string;
}

// P85: Card verification state
interface CardState {
  phase: CardPhase;
  activeStory: Story | null;
  activePoint: Point | null;
  linkedPoints: Point[];
  sessionHistory: VerifiedCard[];
  // For Point flow - checker's position
  myPosition: PositionType | null;
}

interface MockLiveState {
  ratingPhase: RatingPhase;
  flowType: FlowType | null;
  checkerName: string | null;
  responderName: string | null;
  checkerRating: number | undefined;
  responderRating: number | undefined;
  checkerSubmitted: boolean;
  responderSubmitted: boolean;
  explainBackRatings: number[];
  explainBackDone: boolean;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const CONTENT_LAYOUT = "flex-1 flex flex-col items-center justify-start pt-8 p-6 space-y-6 max-w-lg mx-auto w-full";
const CONTENT_LAYOUT_CENTERED = "flex-1 flex flex-col items-center justify-center px-6 pb-6 space-y-8 max-w-lg mx-auto w-full";
const SESSION_STORAGE_KEY = 'clarity:live:session';
const PARTNER_SIMULATION_DELAY_MS = 1500;

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

// ============================================================================
// UTILITIES
// ============================================================================

function getFirstName(name: string): string {
  const firstName = name.trim().split(' ')[0] || name;
  return firstName.charAt(0).toUpperCase() + firstName.slice(1).toLowerCase();
}


/** Generate a random 6-character meeting code (uppercase alphanumeric) */
function generateMeetingCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

/** Load session history from sessionStorage */
function loadSessionHistory(): VerifiedCard[] {
  try {
    const stored = sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (e) {
    console.error('Failed to load session history:', e);
  }
  return [];
}

/** Save session history to sessionStorage */
function saveSessionHistory(history: VerifiedCard[]): void {
  try {
    sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(history));
  } catch (e) {
    console.error('Failed to save session history:', e);
  }
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function Live() {
  const navigate = useNavigate();
  const { ideaId } = useParams<{ ideaId?: string }>();
  const [searchParams] = useSearchParams();

  // P85: Read query params for entry from StoryCard
  const storyParam = searchParams.get('story');
  const withParam = searchParams.get('with');

  // Get partner from query param or default to Alice
  const resolvedPartner = withParam ? getUserById(withParam) : null;
  const partner = resolvedPartner ?? mockUsers[0];
  const partnerName = partner.name;
  const displayPartnerName = getFirstName(partnerName);

  // Show warning if partner ID was provided but not found
  useEffect(() => {
    if (withParam && !resolvedPartner) {
      toast.warning(`Partner not found, using default`);
    }
  }, [withParam, resolvedPartner]);

  // Meeting phase state (start -> waiting -> live)
  const [meetingPhase, setMeetingPhase] = useState<MeetingPhase>('start');
  const [meetingCode, setMeetingCode] = useState<string>('');
  const [joinCode, setJoinCode] = useState<string>('');
  const [copied, setCopied] = useState(false);

  // Sound toggle state
  const [soundEnabled, setSoundEnabled] = useState(true);

  // P85: Card verification state
  const [cardState, setCardState] = useState<CardState>(() => {
    const history = loadSessionHistory();

    // If story param provided, pre-select it
    if (storyParam) {
      const story = getStoryById(storyParam);
      if (story) {
        const points = getPointsForStory(story.id);
        return {
          phase: 'story-selected',
          activeStory: story,
          activePoint: null,
          linkedPoints: points,
          sessionHistory: history,
          myPosition: null,
        };
      } else {
        // Story not found - show toast after mount
        setTimeout(() => toast.error('Story not found'), 100);
      }
    }

    return {
      phase: 'idle',
      activeStory: null,
      activePoint: null,
      linkedPoints: [],
      sessionHistory: history,
      myPosition: null,
    };
  });

  // Core live state (for legacy flow)
  const [state, setState] = useState<MockLiveState>({
    ratingPhase: 'idle',
    flowType: null,
    checkerName: null,
    responderName: null,
    checkerRating: undefined,
    responderRating: undefined,
    checkerSubmitted: false,
    responderSubmitted: false,
    explainBackRatings: [],
    explainBackDone: false,
  });

  // Local UI state
  const [selectedRating, setSelectedRating] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // DEV: Perspective toggle to test both views
  const [perspective, setPerspective] = useState<Perspective>('checker');
  const [partnerPhase, setPartnerPhase] = useState<PartnerPhase>('waiting');
  const [incomingStory, setIncomingStory] = useState<Story | null>(null);
  const [incomingPoint, setIncomingPoint] = useState<Point | null>(null);
  const [partnerPosition, setPartnerPosition] = useState<PositionType | null>(null);

  // Track simulation timeouts for cleanup
  const simulationTimeoutsRef = useRef<NodeJS.Timeout[]>([]);

  // Get current user's points (points they have a position on)
  const userPoints = useMemo(() => {
    return getPoints().filter(p => p.positions[currentUser.id]);
  }, []);

  // Get current user's stories
  const userStories = useMemo(() => getStories(currentUser.id), []);

  // Determine if current user is the checker (speaker)
  const isChecker = state.checkerName === currentUser.name;

  // Calculate gap
  const gap = state.checkerRating !== undefined && state.responderRating !== undefined
    ? state.responderRating - state.checkerRating
    : 0;
  const gapType: GapType = gap > 0 ? 'overconfidence' : gap < 0 ? 'underconfidence' : 'none';
  const gapPoints = Math.abs(gap);

  // Save session history when it changes
  useEffect(() => {
    saveSessionHistory(cardState.sessionHistory);
  }, [cardState.sessionHistory]);

  // Cleanup simulation timeouts on unmount
  useEffect(() => {
    return () => {
      simulationTimeoutsRef.current.forEach(clearTimeout);
    };
  }, []);

  // ============================================================================
  // MEETING HANDLERS
  // ============================================================================

  const handleCreateMeeting = () => {
    const code = generateMeetingCode();
    setMeetingCode(code);
    setMeetingPhase('waiting');
  };

  const handlePartnerJoined = () => {
    setMeetingPhase('live');
  };

  const handleJoinMeeting = () => {
    if (joinCode.length !== 6) return;
    setMeetingCode(joinCode.toUpperCase());
    setMeetingPhase('live');
  };

  const handleCopyCode = async () => {
    const shareLink = `${window.location.origin}/prototype/linkedin-like/live?code=${meetingCode}`;
    try {
      await navigator.clipboard.writeText(shareLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      await navigator.clipboard.writeText(meetingCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // ============================================================================
  // P85: CARD VERIFICATION HANDLERS
  // ============================================================================

  // STORY handlers
  const handleSelectStory = (story: Story) => {
    const points = getPointsForStory(story.id);
    setCardState(prev => ({
      ...prev,
      phase: 'story-selected',
      activeStory: story,
      activePoint: null,
      linkedPoints: points,
    }));
    setSelectedRating(null);
  };

  // POINT handlers
  const handleSelectPoint = (point: Point) => {
    // Get user's existing position on this point
    const myExistingPosition = point.positions[currentUser.id]?.position || null;
    setCardState(prev => ({
      ...prev,
      phase: 'point-selected',
      activeStory: null,
      activePoint: point,
      linkedPoints: [],
      myPosition: myExistingPosition,
    }));
  };

  const handleDeselect = () => {
    setCardState(prev => ({
      ...prev,
      phase: 'idle',
      activeStory: null,
      activePoint: null,
      linkedPoints: [],
      myPosition: null,
    }));
    setSelectedRating(null);
  };

  // Story: Start verification with rating
  const handleStartWithRating = (rating: number) => {
    setCardState(prev => ({ ...prev, phase: 'in-legacy-flow' }));
    setState(prev => ({
      ...prev,
      ratingPhase: 'waiting',
      flowType: 'check',
      checkerName: currentUser.name,
      responderName: partnerName,
      checkerRating: rating,
      checkerSubmitted: true,
    }));

    // Trigger partner's view
    if (cardState.activeStory) {
      setIncomingStory(cardState.activeStory);
      setPartnerPhase('story-received');
    }

    // Simulate partner response
    const timeoutId = setTimeout(() => {
      const partnerRating = Math.floor(Math.random() * 4) + 6;
      setState(prev => ({
        ...prev,
        responderRating: partnerRating,
        responderSubmitted: true,
        ratingPhase: 'revealed',
      }));
    }, PARTNER_SIMULATION_DELAY_MS);
    simulationTimeoutsRef.current.push(timeoutId);
  };

  // Point: Ask partner's position
  const handleAskPosition = () => {
    if (!cardState.activePoint) return;

    // Trigger partner's view to show Point
    setIncomingPoint(cardState.activePoint);
    setPartnerPhase('point-received');
    setPartnerPosition(null);

    // Move to waiting state
    setCardState(prev => ({ ...prev, phase: 'in-legacy-flow' }));
    setState(prev => ({
      ...prev,
      ratingPhase: 'waiting',
      flowType: 'check',
      checkerName: currentUser.name,
      responderName: partnerName,
    }));

    // Simulate partner's position response after delay
    const timeoutId = setTimeout(() => {
      // Random position: 60% same as checker, 40% different
      const positions: PositionType[] = ['agree', 'disagree', 'unsure'];
      const sameAsChecker = Math.random() < 0.6;
      let simulatedPosition: PositionType;

      if (sameAsChecker && cardState.myPosition) {
        simulatedPosition = cardState.myPosition;
      } else {
        // Pick a random different position
        const otherPositions = positions.filter(p => p !== cardState.myPosition);
        simulatedPosition = otherPositions[Math.floor(Math.random() * otherPositions.length)];
      }

      setPartnerPosition(simulatedPosition);
      setPartnerPhase('waiting');
      setIncomingPoint(null);
      setState(prev => ({
        ...prev,
        ratingPhase: 'revealed',
      }));
    }, PARTNER_SIMULATION_DELAY_MS);
    simulationTimeoutsRef.current.push(timeoutId);
  };

  // Partner: Submit confidence rating (Story)
  const handlePartnerStoryRatingSubmit = (rating: number) => {
    setState(prev => ({
      ...prev,
      responderRating: rating,
      responderSubmitted: true,
      ratingPhase: 'revealed',
    }));
    setPartnerPhase('waiting');
    setIncomingStory(null);
    setSelectedRating(null);
  };

  // Partner: Submit position (Point)
  const handlePartnerPositionSubmit = (position: PositionType) => {
    setPartnerPosition(position);
    setPartnerPhase('waiting');
    setIncomingPoint(null);

    // Simulate revealing both positions
    const timeoutId = setTimeout(() => {
      setState(prev => ({
        ...prev,
        ratingPhase: 'revealed',
      }));
    }, 500);
    simulationTimeoutsRef.current.push(timeoutId);
  };

  const handleSpeakFreely = () => {
    // Reset card state and return to idle
    setCardState(prev => ({
      ...prev,
      phase: 'idle',
      activeStory: null,
      activePoint: null,
      linkedPoints: [],
      myPosition: null,
    }));
    // Reset partner state
    setIncomingStory(null);
    setIncomingPoint(null);
    setPartnerPosition(null);
    setPartnerPhase('waiting');
    // Reset legacy state
    setState({
      ratingPhase: 'idle',
      flowType: null,
      checkerName: null,
      responderName: null,
      checkerRating: undefined,
      responderRating: undefined,
      checkerSubmitted: false,
      responderSubmitted: false,
      explainBackRatings: [],
      explainBackDone: false,
    });
  };

  const handleExit = () => {
    navigate('/prototype/linkedin-like/profile');
  };

  // ============================================================================
  // LEGACY LIVE SESSION HANDLERS
  // ============================================================================

  const handleStartCheck = () => {
    setState(prev => ({
      ...prev,
      ratingPhase: 'rating',
      flowType: 'check',
      checkerName: currentUser.name,
      responderName: partnerName,
    }));
  };

  const handleStartProve = () => {
    setState(prev => ({
      ...prev,
      ratingPhase: 'rating',
      flowType: 'prove',
      checkerName: partnerName,
      responderName: currentUser.name,
    }));
  };

  const handleRatingSubmit = (rating: number) => {
    const amChecker = state.checkerName === currentUser.name;

    setState(prev => ({
      ...prev,
      checkerRating: amChecker ? rating : prev.checkerRating,
      responderRating: !amChecker ? rating : prev.responderRating,
      checkerSubmitted: amChecker ? true : prev.checkerSubmitted,
      responderSubmitted: !amChecker ? true : prev.responderSubmitted,
      ratingPhase: 'waiting',
    }));

    setSelectedRating(null);

    const timeoutId = setTimeout(() => {
      const partnerRating = Math.floor(Math.random() * 4) + 5;
      setState(prev => ({
        ...prev,
        checkerRating: !amChecker ? partnerRating : prev.checkerRating,
        responderRating: amChecker ? partnerRating : prev.responderRating,
        checkerSubmitted: true,
        responderSubmitted: true,
        ratingPhase: 'revealed',
      }));
    }, PARTNER_SIMULATION_DELAY_MS);
    simulationTimeoutsRef.current.push(timeoutId);
  };

  const handleExplainBackStart = () => {
    setState(prev => ({
      ...prev,
      ratingPhase: 'explain-back',
      explainBackDone: false,
    }));
  };

  const handleExplainBackDone = () => {
    setState(prev => ({
      ...prev,
      explainBackDone: true,
    }));
  };

  const handleExplainBackRate = (rating: number) => {
    const newRatings = [...state.explainBackRatings, rating];

    if (rating === 10) {
      setState(prev => ({
        ...prev,
        explainBackRatings: newRatings,
        ratingPhase: 'perfect',
      }));
    } else {
      setState(prev => ({
        ...prev,
        explainBackRatings: newRatings,
        ratingPhase: 'results',
        explainBackDone: false,
      }));
    }

    setSelectedRating(null);
  };

  const handleContinue = () => {
    // If we had an active card, save to session history
    if (cardState.activeStory && cardState.phase === 'in-legacy-flow') {
      const lastRating = state.explainBackRatings.length > 0
        ? state.explainBackRatings[state.explainBackRatings.length - 1]
        : state.checkerRating ?? 0;

      const verifiedCard: VerifiedCard = {
        storyId: cardState.activeStory.id,
        rating: lastRating,
        verified: lastRating >= 8,
        timestamp: new Date().toISOString(),
      };

      setCardState(prev => ({
        ...prev,
        phase: 'idle',
        activeStory: null,
        linkedPoints: [],
        sessionHistory: [...prev.sessionHistory, verifiedCard],
      }));
    } else {
      // Reset card state without saving history
      setCardState(prev => ({
        ...prev,
        phase: 'idle',
        activeStory: null,
        linkedPoints: [],
      }));
    }

    // Reset legacy state
    setState({
      ratingPhase: 'idle',
      flowType: null,
      checkerName: null,
      responderName: null,
      checkerRating: undefined,
      responderRating: undefined,
      checkerSubmitted: false,
      responderSubmitted: false,
      explainBackRatings: [],
      explainBackDone: false,
    });
  };

  // ============================================================================
  // RENDER COMPONENTS
  // ============================================================================

  // Recording indicator
  const RecordingIndicator = () => (
    <div className="flex items-center justify-center gap-2 py-1.5 bg-blue-50 border-b border-blue-200">
      <Sparkles className="w-3.5 h-3.5 text-blue-500" />
      <span className="text-xs text-blue-700">Session recorded for AI Insights</span>
    </div>
  );

  // Header for active meeting
  const LiveMeetingHeader = () => (
    <>
      <div className="h-14 border-b bg-white">
        <div className="max-w-4xl mx-auto px-4 h-full">
          <div className="flex items-center justify-between h-full">
            <Link to="/prototype/linkedin-like/profile" className="flex items-center gap-2 shrink-0 hover:opacity-80 transition-opacity">
              <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center text-white font-bold text-sm">
                C
              </div>
            </Link>

            {/* DEV: Perspective toggle - only shown in development */}
            {import.meta.env.DEV && (
              <button
                onClick={() => {
                  setPerspective(p => p === 'checker' ? 'partner' : 'checker');
                  // Reset partner state when switching
                  setPartnerPhase('waiting');
                  setIncomingStory(null);
                  setIncomingPoint(null);
                  setPartnerPosition(null);
                  setSelectedRating(null);
                }}
                className="px-3 py-1 text-xs font-medium rounded-full bg-gray-100 hover:bg-gray-200 text-gray-600 transition-colors"
              >
                View as: {perspective === 'checker' ? 'You' : displayPartnerName}
              </button>
            )}

            <div className="flex items-center gap-2">
              <button
                className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
                onClick={() => setSoundEnabled(!soundEnabled)}
                title={soundEnabled ? 'Mute sounds' : 'Enable sounds'}
              >
                {soundEnabled ? <Volume2 className="h-5 w-5 text-gray-600" /> : <VolumeX className="h-5 w-5 text-gray-400" />}
              </button>
              <button
                className="px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                onClick={handleExit}
              >
                Leave
              </button>
            </div>
          </div>
        </div>
      </div>
      <RecordingIndicator />
    </>
  );

  // Rating buttons
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
  const RatingDisplay = ({ label, rating }: { label: React.ReactNode; rating: number }) => {
    const filledDots = rating;
    const emptyDots = 10 - rating;

    return (
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm text-muted-foreground">{label}</span>
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
      </div>
    );
  };

  // Pending rating display
  const RatingDisplayPending = ({ label }: { label: React.ReactNode }) => (
    <div className="flex items-center justify-between gap-2">
      <span className="text-sm text-muted-foreground">{label}</span>
      <div className="flex items-center gap-2">
        <span className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
        <span className="text-sm text-muted-foreground italic">Pending...</span>
      </div>
    </div>
  );

  // Journey card
  const JourneyToUnderstanding = ({ variant = 'default' }: { variant?: 'default' | 'success' }) => {
    const bgClass = variant === 'success'
      ? 'bg-green-50 border border-green-200'
      : 'bg-muted/50 border border-border';

    const showRoundNumbers = state.explainBackRatings.length > 0;
    const bothSubmitted = state.checkerSubmitted && state.responderSubmitted;

    const headerText = isChecker
      ? <>{displayPartnerName}'s journey to <span className="font-semibold text-foreground">understand your story</span></>
      : <>Your journey to <span className="font-semibold text-foreground">understand {getFirstName(state.checkerName || partnerName)}'s story</span></>;

    return (
      <div className={`${bgClass} rounded-lg p-4 min-h-[180px] text-left w-full max-w-sm`}>
        <p className="text-sm font-medium text-muted-foreground text-center mb-4 pb-2 border-b border-border">{headerText}</p>

        <div className="space-y-2">
          <div className={showRoundNumbers ? "flex gap-3" : ""}>
            {showRoundNumbers && (
              <div className="w-4 shrink-0 text-xs text-muted-foreground pt-0.5 text-right">0</div>
            )}
            <div className="flex-1 space-y-1">
              {isChecker ? (
                <>
                  {bothSubmitted && state.responderRating !== undefined ? (
                    <RatingDisplay label={<span className="text-muted-foreground">{displayPartnerName}'s confidence</span>} rating={state.responderRating} />
                  ) : (
                    <RatingDisplayPending label={<span className="text-muted-foreground">{displayPartnerName}'s confidence</span>} />
                  )}
                  {state.checkerRating !== undefined ? (
                    <RatingDisplay label={<b className="text-foreground">Your belief</b>} rating={state.checkerRating} />
                  ) : (
                    <RatingDisplayPending label={<b className="text-foreground">Your belief</b>} />
                  )}
                </>
              ) : (
                <>
                  {state.responderRating !== undefined ? (
                    <RatingDisplay label={<span className="text-muted-foreground">Your confidence</span>} rating={state.responderRating} />
                  ) : (
                    <RatingDisplayPending label={<span className="text-muted-foreground">Your confidence</span>} />
                  )}
                  {bothSubmitted && state.checkerRating !== undefined ? (
                    <RatingDisplay label={<b className="text-foreground">{getFirstName(state.checkerName || partnerName)}'s belief</b>} rating={state.checkerRating} />
                  ) : (
                    <RatingDisplayPending label={<b className="text-foreground">{getFirstName(state.checkerName || partnerName)}'s belief</b>} />
                  )}
                </>
              )}
            </div>
          </div>

          {state.explainBackRatings.map((rating, index) => (
            <div key={index} className="flex gap-3 pt-2 border-t">
              <div className="w-4 shrink-0 text-xs text-muted-foreground pt-0.5 text-right">{index + 1}</div>
              <div className="flex-1">
                <RatingDisplay
                  label={isChecker
                    ? <b className="text-foreground">Your belief</b>
                    : <b className="text-foreground">{getFirstName(state.checkerName || partnerName)}'s belief</b>
                  }
                  rating={rating}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  // Waiting indicator
  const WaitingIndicator = ({ message, onSkip, skipLabel = "Speak freely" }: { message: string; onSkip?: () => void; skipLabel?: string }) => (
    <div className="bg-muted rounded-lg px-4 py-3 max-w-xs space-y-3 flex flex-col items-center">
      <div className="flex items-center gap-2">
        <span className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
        <p className="text-sm text-muted-foreground">{message}</p>
      </div>
      {onSkip && (
        <button onClick={onSkip} className="text-sm text-muted-foreground hover:text-foreground">
          {skipLabel}
        </button>
      )}
    </div>
  );

  // Action area wrapper
  const ActionArea = ({ icon, title, subtitle, children }: { icon?: string; title?: React.ReactNode; subtitle?: React.ReactNode; children: React.ReactNode }) => (
    <section className="flex flex-col items-center gap-4 w-full max-w-sm pt-8">
      {(icon || title) && (
        <div className="flex flex-col items-center gap-3">
          {icon && (
            <div className="w-20 h-20 rounded-full bg-blue-50 border-2 border-blue-200 flex items-center justify-center">
              <span className="text-3xl">{icon}</span>
            </div>
          )}
          {title && (
            <p className="text-lg font-semibold text-center max-w-xs whitespace-pre-line">
              {title}
            </p>
          )}
          {subtitle && (
            <p className="text-sm text-muted-foreground text-center">
              {subtitle}
            </p>
          )}
        </div>
      )}
      <div className="flex flex-col gap-3 w-full max-w-xs">
        {children}
      </div>
    </section>
  );

  // Button styles
  const PrimaryButton = ({ onClick, children, disabled }: { onClick: () => void; children: React.ReactNode; disabled?: boolean }) => (
    <button
      onClick={onClick}
      disabled={disabled}
      className="bg-blue-500 hover:bg-blue-600 disabled:bg-blue-300 text-white font-semibold py-3 px-6 rounded-md w-full transition-colors"
    >
      {children}
    </button>
  );

  const OutlineButton = ({ onClick, children }: { onClick: () => void; children: React.ReactNode }) => (
    <button
      onClick={onClick}
      className="border border-input bg-background hover:bg-accent text-foreground font-semibold py-3 px-6 rounded-md w-full transition-colors"
    >
      {children}
    </button>
  );

  const GhostButton = ({ onClick, children }: { onClick: () => void; children: React.ReactNode }) => (
    <button
      onClick={onClick}
      className="text-muted-foreground hover:text-foreground text-sm py-2 transition-colors"
    >
      {children}
    </button>
  );

  // P85: Story Card Preview (compact for picker/selected display)
  const StoryCardPreview = ({ story, onClick, showLinkedPoints = true }: { story: Story; onClick?: () => void; showLinkedPoints?: boolean }) => {
    const points = getPointsForStory(story.id);
    const storyAuthor = getUserById(story.authorId);

    return (
      <button
        onClick={onClick}
        className={`w-full text-left p-4 rounded-lg border-l-4 border-l-blue-500 border border-gray-200 bg-white ${onClick ? 'hover:bg-gray-50 hover:border-gray-300' : ''} transition-colors`}
      >
        <div className="flex items-start gap-3">
          {storyAuthor ? (
            <GravatarAvatar name={storyAuthor.name} size="sm" isPledger={storyAuthor.hasPledged} />
          ) : (
            <BookOpen className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
          )}
          <div className="flex-1 min-w-0">
            <p className="text-sm text-gray-900 line-clamp-2">{story.text}</p>
            {showLinkedPoints && (
              <p className="text-xs text-gray-500 mt-1.5">
                {points.length} {points.length === 1 ? 'point' : 'points'} linked
              </p>
            )}
          </div>
        </div>
      </button>
    );
  };

  // P85: Session History Panel
  const SessionHistoryPanel = () => {
    if (cardState.sessionHistory.length === 0) return null;

    return (
      <div className="w-full max-w-sm bg-gray-50 rounded-lg p-4 space-y-3">
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">This Session</h3>
        <div className="space-y-2">
          {cardState.sessionHistory.map((card) => {
            const story = getStoryById(card.storyId);
            if (!story) return null;

            return (
              <div key={`${card.storyId}-${card.timestamp}`} className="flex items-start gap-2 text-sm">
                {card.verified ? (
                  <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" />
                ) : (
                  <X className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-gray-900 line-clamp-1">
                    <BookOpen className="w-3 h-3 inline mr-1 text-blue-500" />
                    {story.text.slice(0, 30)}...
                  </p>
                  <p className="text-xs text-gray-500">
                    {card.verified ? `Understood (${card.rating}/10)` : `Not yet (${card.rating}/10)`}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  // ============================================================================
  // PHASE RENDERING
  // ============================================================================

  // MEETING START PHASE
  if (meetingPhase === 'start') {
    return (
      <PrototypeLayout>
        <div className={CONTENT_LAYOUT_CENTERED}>
          <div className="text-center space-y-2">
            <div className="w-16 h-16 rounded-full bg-blue-50 border-2 border-blue-200 flex items-center justify-center mx-auto">
              <Users className="w-8 h-8 text-blue-500" />
            </div>
            <h1 className="text-2xl font-semibold text-gray-900">Start a Clarity Meeting</h1>
            <p className="text-gray-500 text-sm max-w-xs mx-auto">
              Verify understanding in real-time with a partner
            </p>
          </div>

          <div className="w-full max-w-xs space-y-6">
            <button
              onClick={handleCreateMeeting}
              className="w-full bg-blue-500 hover:bg-blue-600 text-white font-semibold py-4 px-6 rounded-lg transition-colors flex items-center justify-center gap-3"
            >
              <Plus className="w-5 h-5" />
              Create Meeting
            </button>

            <div className="flex items-center gap-4">
              <div className="flex-1 h-px bg-gray-200" />
              <span className="text-xs text-gray-500">OR</span>
              <div className="flex-1 h-px bg-gray-200" />
            </div>

            <div className="space-y-3">
              <label className="text-sm font-medium text-gray-500">Join with code</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value.toUpperCase().slice(0, 6))}
                  placeholder="ABC123"
                  className="flex-1 px-4 py-3 border border-gray-300 rounded-lg text-center font-mono text-lg tracking-widest uppercase focus:outline-none focus:ring-2 focus:ring-blue-500"
                  maxLength={6}
                />
                <button
                  onClick={handleJoinMeeting}
                  disabled={joinCode.length !== 6}
                  className="px-4 py-3 bg-gray-900 text-white rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
                >
                  <LogIn className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </PrototypeLayout>
    );
  }

  // WAITING PHASE
  if (meetingPhase === 'waiting') {
    const shareLink = `${window.location.origin}/prototype/linkedin-like/live?code=${meetingCode}`;

    return (
      <PrototypeLayout>
        <div className="bg-white border-b border-gray-200">
          <div className="flex items-center gap-3 px-4 py-3 max-w-4xl mx-auto">
            <button
              onClick={() => setMeetingPhase('start')}
              className="flex items-center gap-2 text-sm font-medium text-red-600 hover:text-red-700 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Cancel
            </button>
            <span className="flex-1 text-center text-sm text-gray-500">
              Waiting Room
            </span>
            <div className="w-12" />
          </div>
        </div>

        <div className={CONTENT_LAYOUT_CENTERED}>
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200">
            <QRCodeSVG value={shareLink} size={180} level="M" />
          </div>

          <div className="text-center space-y-2">
            <p className="text-sm text-gray-500">Meeting Code</p>
            <div className="flex items-center justify-center gap-3">
              <span className="text-3xl font-mono font-bold tracking-[0.3em] text-gray-900">{meetingCode}</span>
              <button
                onClick={handleCopyCode}
                className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
                title="Copy link"
              >
                {copied ? (
                  <Check className="w-5 h-5 text-green-500" />
                ) : (
                  <Copy className="w-5 h-5 text-gray-400" />
                )}
              </button>
            </div>
          </div>

          <div className="flex items-center gap-3 px-4 py-3 bg-gray-100 rounded-lg">
            <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
            <span className="text-sm text-gray-500">Waiting for partner to join...</span>
          </div>

          <p className="text-xs text-gray-400 text-center max-w-xs">
            Share the QR code or meeting code with your partner to start the clarity session
          </p>

          <Button
            onClick={handlePartnerJoined}
            className="mt-4 bg-blue-500 hover:bg-blue-600 text-white px-6 py-3"
            size="lg"
          >
            <Check className="w-5 h-5" />
            Simulate: Partner Joined
          </Button>
        </div>
      </PrototypeLayout>
    );
  }

  // ============================================================================
  // LIVE PHASE - P85 Card Verification Flow
  // ============================================================================

  // PARTNER'S PERSPECTIVE - Show what partner sees
  if (perspective === 'partner' && meetingPhase === 'live') {
    return (
      <div className="flex flex-col min-h-screen bg-background">
        <LiveMeetingHeader />

        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Partner's idle view - waiting for request */}
          {partnerPhase === 'waiting' && (
            <div className="flex-1 flex flex-col items-center justify-center px-4">
              <div className="text-center space-y-4">
                <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mx-auto">
                  <Users className="w-8 h-8 text-gray-400" />
                </div>
                <div>
                  <p className="text-lg text-gray-600">Waiting for {getFirstName(currentUser.name)} to share a story</p>
                  <p className="text-sm text-gray-400 mt-1">You'll be asked to confirm your understanding</p>
                </div>

                {/* DEV: Simulate receiving a Story request - only shown in development */}
                {import.meta.env.DEV && (
                  <div className="flex flex-col gap-2 mt-4">
                    <Button
                      onClick={() => {
                        // Pick a random story from current user's stories
                        const stories = getStories(currentUser.id);
                        if (stories.length > 0) {
                          const randomStory = stories[Math.floor(Math.random() * stories.length)];
                          setIncomingStory(randomStory);
                          setPartnerPhase('story-received');
                        } else {
                          toast.error('No stories to simulate');
                        }
                      }}
                      className="bg-blue-500 hover:bg-blue-600 text-white"
                    >
                      <BookOpen className="w-4 h-4 mr-2" />
                      Simulate: Receive Story
                    </Button>
                    <Button
                      onClick={() => {
                        // Pick a random point from current user's points
                        if (userPoints.length > 0) {
                          const randomPoint = userPoints[Math.floor(Math.random() * userPoints.length)];
                          setIncomingPoint(randomPoint);
                          setPartnerPhase('point-received');
                        } else {
                          toast.error('No points to simulate');
                        }
                      }}
                      variant="outline"
                      className="border-amber-300 text-amber-700 hover:bg-amber-50"
                    >
                      <Pin className="w-4 h-4 mr-2 rotate-45" />
                      Simulate: Receive Point
                    </Button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Partner received a Story request - story above, drawer below */}
          {partnerPhase === 'story-received' && incomingStory && (
            <>
              {/* Story card in main area - using actual StoryCard component */}
              <div className="flex-1 bg-gray-100 p-4 flex items-center justify-center overflow-auto">
                <div className="w-full max-w-lg">
                  <StoryCard story={incomingStory} compact context="profile" />
                </div>
              </div>

              {/* Bottom drawer with rating only */}
              <div className="bg-white border-t rounded-t-2xl shadow-lg p-6 pb-8">
                <div className="max-w-lg mx-auto space-y-3">
                  <p className="text-sm font-medium text-center">
                    How confident are you that you understand their story?
                  </p>
                  <div className="flex justify-center gap-1">
                    {RATING_OPTIONS.map((option) => (
                      <button
                        key={option.value}
                        onClick={() => setSelectedRating(option.value)}
                        className={`w-7 h-7 rounded text-xs font-medium transition-all ${
                          selectedRating === option.value
                            ? 'bg-blue-500 text-white'
                            : 'bg-white border border-gray-200 hover:border-blue-300 text-gray-700'
                        }`}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                  <button
                    onClick={() => selectedRating !== null && handlePartnerStoryRatingSubmit(selectedRating)}
                    disabled={selectedRating === null}
                    className="w-full bg-blue-500 hover:bg-blue-600 disabled:bg-blue-300 text-white font-medium py-2.5 rounded-lg transition-colors"
                  >
                    Submit
                  </button>
                  <button
                    onClick={handleSpeakFreely}
                    className="w-full text-sm text-gray-500 hover:text-gray-700"
                  >
                    Speak freely
                  </button>
                </div>
              </div>
            </>
          )}

          {/* Partner received a Point request - point above, position buttons in drawer */}
          {partnerPhase === 'point-received' && incomingPoint && (
            <>
              {/* Point card in main area - using actual PointCard component */}
              <div className="flex-1 bg-gray-100 p-4 flex items-center justify-center overflow-auto">
                <div className="w-full max-w-lg">
                  <PointCard point={incomingPoint} compact />
                </div>
              </div>

              {/* Bottom drawer with position buttons only */}
              <div className="bg-white border-t rounded-t-2xl shadow-lg p-6 pb-8">
                <div className="max-w-lg mx-auto space-y-4">
                  <p className="text-sm font-medium text-center">
                    What's your position on this point?
                  </p>
                  <PositionButtons
                    userPosition={partnerPosition}
                    onPositionClick={(pos) => setPartnerPosition(pos)}
                  />
                  <button
                    onClick={() => partnerPosition && handlePartnerPositionSubmit(partnerPosition)}
                    disabled={!partnerPosition}
                    className="w-full bg-blue-500 hover:bg-blue-600 disabled:bg-blue-300 text-white font-medium py-2.5 rounded-lg transition-colors"
                  >
                    Submit
                  </button>
                  <button
                    onClick={handleSpeakFreely}
                    className="w-full text-sm text-gray-500 hover:text-gray-700"
                  >
                    Speak freely
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
        <Toaster position="top-center" />
      </div>
    );
  }

  // P85: IDLE or SELECTED - Search at top, results below (CHECKER'S VIEW)
  if ((cardState.phase === 'idle' || cardState.phase === 'story-selected' || cardState.phase === 'point-selected') && state.ratingPhase === 'idle') {
    // Filter stories and points based on search query
    const hasSearch = searchQuery.trim().length > 0;
    const filteredStories = hasSearch
      ? userStories.filter(story =>
          story.text.toLowerCase().includes(searchQuery.toLowerCase())
        )
      : [];
    const filteredPoints = hasSearch
      ? userPoints.filter(point =>
          point.text.toLowerCase().includes(searchQuery.toLowerCase())
        )
      : [];

    const hasContent = userStories.length > 0 || userPoints.length > 0;
    const hasResults = filteredStories.length > 0 || filteredPoints.length > 0;

    return (
      <div className="flex flex-col min-h-screen bg-background">
        <LiveMeetingHeader />

        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Top area: Instructions + Search */}
          <div className="px-4 pt-24 pb-4">
            <div className="max-w-lg mx-auto space-y-4">
              {/* Instructions */}
              {hasContent && (
                <p className="text-lg text-gray-600 text-center">
                  Search stories or points to discuss with {displayPartnerName}
                </p>
              )}

              {/* Search input */}
              {hasContent && (
                <div className="relative">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search stories and points..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    autoFocus
                    className="w-full pl-12 pr-4 py-3 text-base border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent shadow-sm bg-white"
                  />
                </div>
              )}
            </div>
          </div>

          {/* Results area */}
          <div className="flex-1 overflow-y-auto px-4 pb-4">
            <div className="max-w-lg mx-auto space-y-3">
              {/* Session history (when no search) */}
              {!hasSearch && cardState.sessionHistory.length > 0 && (
                <SessionHistoryPanel />
              )}

              {/* No content state */}
              {!hasContent && (
                <div className="text-center py-12">
                  <p className="text-gray-500">You don't have any Stories or Points yet.</p>
                  <p className="text-sm text-gray-400 mt-1">Create content first to discuss.</p>
                </div>
              )}

              {/* No results */}
              {hasSearch && !hasResults && (
                <div className="text-center py-12">
                  <p className="text-gray-500">No matches for "{searchQuery}"</p>
                </div>
              )}

              {/* STORIES section */}
              {hasSearch && filteredStories.length > 0 && (
                <>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Stories</p>
                  {filteredStories.map(story => {
                    const isSelected = cardState.activeStory?.id === story.id && cardState.phase === 'story-selected';
                    const points = getPointsForStory(story.id);

                    return (
                      <div key={story.id} className={`bg-white rounded-lg border-l-4 border-l-blue-500 border shadow-sm overflow-hidden transition-all ${
                        isSelected ? 'border-blue-300 ring-2 ring-blue-200' : 'border-gray-200'
                      }`}>
                        {/* Story content */}
                        <div className="p-4">
                          <p className="text-sm text-gray-900">{story.text}</p>
                          <p className="text-xs text-gray-500 mt-2">
                            {points.length} {points.length === 1 ? 'point' : 'points'} · {story.verificationCount} understood
                          </p>
                        </div>

                        {/* CTA or Rating UI */}
                        {isSelected ? (
                          <div className="px-4 pb-4 pt-2 border-t border-gray-100 bg-gray-50">
                            <p className="text-sm font-medium text-center mb-3">
                              How well do you believe {displayPartnerName} understands you?
                            </p>
                            <div className="flex justify-center gap-1 mb-3">
                              {RATING_OPTIONS.map((option) => (
                                <button
                                  key={option.value}
                                  onClick={() => setSelectedRating(option.value)}
                                  className={`w-7 h-7 rounded text-xs font-medium transition-all ${
                                    selectedRating === option.value
                                      ? 'bg-blue-500 text-white'
                                      : 'bg-white border border-gray-200 hover:border-blue-300 text-gray-700'
                                  }`}
                                >
                                  {option.label}
                                </button>
                              ))}
                            </div>
                            <button
                              onClick={() => selectedRating !== null && handleStartWithRating(selectedRating)}
                              disabled={selectedRating === null}
                              className="w-full bg-blue-500 hover:bg-blue-600 disabled:bg-blue-300 text-white font-medium py-2.5 rounded-lg transition-colors"
                            >
                              Submit
                            </button>
                          </div>
                        ) : (
                          <div className="px-4 pb-4">
                            <button
                              onClick={() => handleSelectStory(story)}
                              className="w-full py-2.5 text-sm font-medium text-white bg-blue-500 hover:bg-blue-600 rounded-lg transition-colors"
                            >
                              Does {displayPartnerName} understand you?
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </>
              )}

              {/* POINTS section */}
              {hasSearch && filteredPoints.length > 0 && (
                <>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mt-4">Points</p>
                  {filteredPoints.map(point => {
                    const isSelected = cardState.activePoint?.id === point.id && cardState.phase === 'point-selected';
                    const myPosition = point.positions[currentUser.id]?.position || null;
                    const partnerExistingPosition = point.positions[partner.id]?.position || null;

                    return (
                      <div key={point.id} className={`bg-white rounded-lg border-l-4 border-l-amber-500 border shadow-sm overflow-hidden transition-all ${
                        isSelected ? 'border-amber-300 ring-2 ring-amber-200' : 'border-gray-200'
                      }`}>
                        {/* Point content */}
                        <div className="p-4">
                          <div className="flex items-start gap-3">
                            <Pin className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5 rotate-45" />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm text-gray-900">{point.text}</p>
                              {partnerExistingPosition && (
                                <p className="text-xs text-gray-500 mt-2">
                                  {displayPartnerName}: {partnerExistingPosition}
                                </p>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* CTA or Position UI */}
                        {isSelected ? (
                          <div className="px-4 pb-4 pt-2 border-t border-gray-100 bg-gray-50">
                            <p className="text-sm font-medium text-center mb-3">
                              Your position:
                            </p>
                            <div className="mb-3">
                              <PositionButtons
                                userPosition={cardState.myPosition}
                                onPositionClick={(pos) => setCardState(prev => ({ ...prev, myPosition: pos }))}
                                compact
                              />
                            </div>
                            <button
                              onClick={handleAskPosition}
                              disabled={!cardState.myPosition}
                              className="w-full bg-blue-500 hover:bg-blue-600 disabled:bg-blue-300 text-white font-medium py-2.5 rounded-lg transition-colors"
                            >
                              Does {displayPartnerName} agree?
                            </button>
                          </div>
                        ) : (
                          <div className="px-4 pb-4">
                            <button
                              onClick={() => handleSelectPoint(point)}
                              className="w-full py-2.5 text-sm font-medium text-white bg-blue-500 hover:bg-blue-600 rounded-lg transition-colors"
                            >
                              Does {displayPartnerName} agree?
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </>
              )}
            </div>
          </div>
        </div>
        <Toaster position="top-center" />
      </div>
    );
  }

  // ============================================================================
  // POINT FLOW - Position comparison (P85)
  // ============================================================================

  // Point flow: Waiting for partner's position
  if (state.ratingPhase === 'waiting' && cardState.activePoint) {
    return (
      <div className="flex flex-col min-h-screen bg-background">
        <LiveMeetingHeader />
        <div className={CONTENT_LAYOUT}>
          {/* Show the Point being discussed */}
          <div className="w-full max-w-sm">
            <PointCard point={cardState.activePoint} compact />
          </div>

          {/* Your position indicator */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 w-full max-w-sm">
            <p className="text-sm text-blue-700 text-center">
              Your position: <span className="font-semibold">{cardState.myPosition}</span>
            </p>
          </div>

          <ActionArea>
            <WaitingIndicator
              message={`Waiting for ${displayPartnerName} to share their position...`}
              onSkip={handleSpeakFreely}
              skipLabel="Cancel"
            />
          </ActionArea>
        </div>
        <Toaster position="top-center" />
      </div>
    );
  }

  // Point flow: Positions revealed - comparison
  // Also handle edge case where activePoint is set but partnerPosition is missing
  if (state.ratingPhase === 'revealed' && cardState.activePoint) {
    // If partnerPosition is missing, show loading or reset
    if (!partnerPosition) {
      return (
        <div className="flex flex-col min-h-screen bg-background">
          <LiveMeetingHeader />
          <div className={CONTENT_LAYOUT}>
            <div className="w-full max-w-sm">
              <PointCard point={cardState.activePoint} compact />
            </div>
            <ActionArea>
              <WaitingIndicator
                message={`Loading ${displayPartnerName}'s position...`}
                onSkip={handleSpeakFreely}
                skipLabel="Cancel"
              />
            </ActionArea>
          </div>
          <Toaster position="top-center" />
        </div>
      );
    }
    const positionsMatch = cardState.myPosition === partnerPosition;
    const linkedStories = getStoriesForPoint(cardState.activePoint.id);

    return (
      <div className="flex flex-col min-h-screen bg-background">
        <LiveMeetingHeader />
        <div className={CONTENT_LAYOUT}>
          {/* Show the Point being discussed */}
          <div className="w-full max-w-sm">
            <PointCard point={cardState.activePoint} compact />
          </div>

          {/* Position comparison */}
          <div className="w-full max-w-sm space-y-3">
            <div className="flex gap-3">
              {/* Your position */}
              <div className="flex-1 bg-blue-50 border border-blue-200 rounded-lg p-3 text-center">
                <p className="text-xs text-gray-500 mb-1">You</p>
                <p className="font-semibold text-blue-700">{cardState.myPosition}</p>
              </div>
              {/* Partner's position */}
              <div className="flex-1 bg-gray-50 border border-gray-200 rounded-lg p-3 text-center">
                <p className="text-xs text-gray-500 mb-1">{displayPartnerName}</p>
                <p className="font-semibold text-gray-700">{partnerPosition}</p>
              </div>
            </div>

            {/* Result banner */}
            <div className={`border rounded-lg px-4 py-3 text-center ${
              positionsMatch
                ? 'border-green-200 bg-green-50'
                : 'border-amber-200 bg-amber-50'
            }`}>
              {positionsMatch ? (
                <>
                  <span className="text-green-600 font-semibold">🎉 You both {cardState.myPosition}!</span>
                  <p className="text-sm text-green-700 mt-1">No calibration gap on this point.</p>
                </>
              ) : (
                <>
                  <span className="text-amber-600 font-semibold">📊 Different positions</span>
                  <p className="text-sm text-amber-700 mt-1">
                    Explore linked stories to understand each other's perspective.
                  </p>
                </>
              )}
            </div>
          </div>

          {/* Actions */}
          <ActionArea>
            {!positionsMatch && linkedStories.length > 0 ? (
              <>
                <PrimaryButton onClick={() => {
                  // Reset state before exploring linked stories
                  setState(prev => ({
                    ...prev,
                    ratingPhase: 'idle',
                  }));
                  setPartnerPosition(null);
                  // Switch to exploring linked stories
                  const firstStory = linkedStories[0];
                  handleSelectStory(firstStory);
                }}>
                  Explore {linkedStories.length} linked {linkedStories.length === 1 ? 'story' : 'stories'}
                </PrimaryButton>
                <GhostButton onClick={handleSpeakFreely}>Done with this point</GhostButton>
              </>
            ) : (
              <PrimaryButton onClick={handleSpeakFreely}>
                Continue
              </PrimaryButton>
            )}
          </ActionArea>
        </div>
        <Toaster position="top-center" />
      </div>
    );
  }

  // ============================================================================
  // LEGACY RATING PHASES - Story flow with optional card at top (P85)
  // ============================================================================

  if (state.ratingPhase === 'rating') {
    const prompt = isChecker
      ? `How well do you believe ${displayPartnerName} understands you?`
      : `How confident are you that you understand ${getFirstName(state.checkerName || partnerName)}?`;

    return (
      <div className="flex flex-col min-h-screen bg-background">
        <LiveMeetingHeader />
        <div className={CONTENT_LAYOUT}>
          {/* Show active card at top if present (P85) */}
          {cardState.activeStory && (
            <StoryCardPreview story={cardState.activeStory} showLinkedPoints />
          )}
        </div>

        <div className="fixed bottom-0 left-0 right-0 bg-background border-t rounded-t-2xl shadow-lg p-6 pb-8 z-50">
          <div className="bg-white rounded-lg p-5 space-y-4 shadow-sm border-l-4 border-l-blue-500">
            <h2 className="text-lg font-semibold text-center">{prompt}</h2>

            <div className="flex flex-col items-center space-y-3 pt-3 border-t">
              <div className="flex justify-between text-xs text-muted-foreground w-full max-w-sm">
                <span>Not at all</span>
                <span>Complete cognitive understanding</span>
              </div>
              <RatingButtons selectedValue={selectedRating} onSelect={setSelectedRating} />
              <PrimaryButton onClick={() => selectedRating !== null && handleRatingSubmit(selectedRating)} disabled={selectedRating === null}>
                Submit
              </PrimaryButton>
              <GhostButton onClick={handleContinue}>Back</GhostButton>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (state.ratingPhase === 'waiting') {
    const waitingMessage = isChecker
      ? `Waiting for ${displayPartnerName} to share their confidence...`
      : `Waiting for ${getFirstName(state.checkerName || partnerName)} to share their belief...`;

    return (
      <div className="flex flex-col min-h-screen bg-background">
        <LiveMeetingHeader />
        <div className={CONTENT_LAYOUT}>
          {/* Show active card at top if present (P85) */}
          {cardState.activeStory && (
            <StoryCardPreview story={cardState.activeStory} showLinkedPoints />
          )}
          <JourneyToUnderstanding />
          <ActionArea>
            <WaitingIndicator message={waitingMessage} onSkip={handleContinue} skipLabel="Cancel" />
          </ActionArea>
        </div>
      </div>
    );
  }

  if (state.ratingPhase === 'revealed') {
    const isCalibrated = gapPoints === 0;
    const pointLabel = gapPoints === 1 ? 'point' : 'points';

    const insightMessage = isCalibrated
      ? (isChecker
          ? <>You believe {displayPartnerName} understands <span className="font-bold">exactly as much</span> as they think</>
          : <>{getFirstName(state.checkerName || partnerName)} believes you understand <span className="font-bold">exactly as much</span> as you think</>)
      : gapType === 'overconfidence'
        ? (isChecker
            ? <>You think {displayPartnerName} understands <span className="font-bold">less</span> than they think</>
            : <>{getFirstName(state.checkerName || partnerName)} thinks you understand <span className="font-bold">less</span> than you think</>)
        : (isChecker
            ? <>You think {displayPartnerName} understands <span className="font-bold">more</span> than they think</>
            : <>{getFirstName(state.checkerName || partnerName)} thinks you understand <span className="font-bold">more</span> than you think</>);

    return (
      <div className="flex flex-col min-h-screen bg-background">
        <LiveMeetingHeader />
        <div className={CONTENT_LAYOUT}>
          {/* Show active card at top if present (P85) */}
          {cardState.activeStory && (
            <StoryCardPreview story={cardState.activeStory} showLinkedPoints />
          )}
          <JourneyToUnderstanding />

          <div className={`border rounded-lg px-4 py-3 w-full max-w-sm ${isCalibrated ? 'border-input bg-muted/50' : 'border-blue-200 bg-blue-50'}`}>
            <div className="flex items-center justify-center gap-2 mb-1">
              <span className={`text-white text-xs font-semibold px-2 py-0.5 rounded-full ${isCalibrated ? 'bg-green-500' : 'bg-blue-500'}`}>
                {isCalibrated ? 'Perfectly calibrated' : `${gapPoints} ${pointLabel} gap`}
              </span>
            </div>
            <p className={`text-sm text-center ${isCalibrated ? 'text-muted-foreground' : 'text-blue-700'}`}>{insightMessage}</p>
          </div>

          <ActionArea
            title={!isChecker ? `Help ${getFirstName(state.checkerName || partnerName)} understand you better. Withhold premature judgment.` : undefined}
          >
            {isChecker ? (
              <WaitingIndicator
                message={`${displayPartnerName} is deciding whether to listen actively...`}
                onSkip={handleSpeakFreely}
              />
            ) : (
              <>
                <PrimaryButton onClick={handleExplainBackStart}>
                  Explain back what I heard
                </PrimaryButton>
                <GhostButton onClick={handleSpeakFreely}>Speak freely</GhostButton>
              </>
            )}
          </ActionArea>
        </div>
      </div>
    );
  }

  if (state.ratingPhase === 'explain-back') {
    if (isChecker) {
      if (!state.explainBackDone) {
        return (
          <div className="flex flex-col min-h-screen bg-background">
            <LiveMeetingHeader />
            <div className={CONTENT_LAYOUT}>
              {cardState.activeStory && <StoryCardPreview story={cardState.activeStory} showLinkedPoints />}
              <JourneyToUnderstanding />
              <ActionArea icon="👂" title="Hear what's missing for a perfect 10">
                <WaitingIndicator
                  message={`Waiting for ${displayPartnerName} to finish clarifying...`}
                  onSkip={handleSpeakFreely}
                />
              </ActionArea>
            </div>
          </div>
        );
      }

      const explainBackPrompt = `How well do you believe ${displayPartnerName} understands your intention?`;

      return (
        <div className="flex flex-col min-h-screen bg-background">
          <LiveMeetingHeader />
          <div className={CONTENT_LAYOUT}>
            {cardState.activeStory && <StoryCardPreview story={cardState.activeStory} showLinkedPoints />}
            <JourneyToUnderstanding />
          </div>

          <div className="fixed bottom-0 left-0 right-0 bg-background border-t rounded-t-2xl shadow-lg p-6 pb-8 z-50">
            <div className="text-center text-sm text-muted-foreground mb-4">
              {displayPartnerName} finished listening actively to you
            </div>
            <div className="bg-white rounded-lg p-5 space-y-4 shadow-sm border-l-4 border-l-blue-500">
              <h2 className="text-lg font-semibold text-center">{explainBackPrompt}</h2>

              <div className="flex flex-col items-center space-y-3 pt-3 border-t">
                <div className="flex justify-between text-xs text-muted-foreground w-full max-w-sm">
                  <span>Not at all</span>
                  <span>Complete cognitive understanding</span>
                </div>
                <RatingButtons selectedValue={selectedRating} onSelect={setSelectedRating} />
                <PrimaryButton onClick={() => selectedRating !== null && handleExplainBackRate(selectedRating)} disabled={selectedRating === null}>
                  Submit
                </PrimaryButton>
                <GhostButton onClick={handleSpeakFreely}>Speak freely</GhostButton>
              </div>
            </div>
          </div>
        </div>
      );
    }

    if (state.explainBackDone) {
      return (
        <div className="flex flex-col min-h-screen bg-background">
          <LiveMeetingHeader />
          <div className={CONTENT_LAYOUT}>
            {cardState.activeStory && <StoryCardPreview story={cardState.activeStory} showLinkedPoints />}
            <JourneyToUnderstanding />
            <ActionArea>
              <WaitingIndicator
                message={`Waiting for ${getFirstName(state.checkerName || partnerName)} to evaluate how well you captured their idea...`}
                onSkip={handleSpeakFreely}
              />
            </ActionArea>
          </div>
        </div>
      );
    }

    return (
      <div className="flex flex-col min-h-screen bg-background">
        <LiveMeetingHeader />
        <div className={CONTENT_LAYOUT}>
          {cardState.activeStory && <StoryCardPreview story={cardState.activeStory} showLinkedPoints />}
          <JourneyToUnderstanding />
          <ActionArea icon="🎤" title={<>Explain back what you heard<br />OR ask a clarifying question</>}>
            <PrimaryButton onClick={handleExplainBackDone}>
              I'm done with active listening
            </PrimaryButton>
            <GhostButton onClick={handleSpeakFreely}>Speak freely</GhostButton>
          </ActionArea>
        </div>
      </div>
    );
  }

  if (state.ratingPhase === 'results') {
    return (
      <div className="flex flex-col min-h-screen bg-background">
        <LiveMeetingHeader />
        <div className={CONTENT_LAYOUT}>
          {cardState.activeStory && <StoryCardPreview story={cardState.activeStory} showLinkedPoints />}
          <JourneyToUnderstanding />
          <ActionArea
            title={!isChecker ? `Help ${getFirstName(state.checkerName || partnerName)} understand you better. Withhold premature judgment.` : undefined}
          >
            {isChecker ? (
              <>
                <PrimaryButton onClick={() => setState(prev => ({ ...prev, ratingPhase: 'explain-back', explainBackDone: false }))}>
                  Share what's missing
                </PrimaryButton>
                <GhostButton onClick={handleSpeakFreely}>Speak freely</GhostButton>
              </>
            ) : (
              <>
                <PrimaryButton onClick={handleExplainBackStart}>
                  Explain back what I heard
                </PrimaryButton>
                <GhostButton onClick={handleSpeakFreely}>Speak freely</GhostButton>
              </>
            )}
          </ActionArea>
        </div>
      </div>
    );
  }

  if (state.ratingPhase === 'perfect') {
    const roundCount = state.explainBackRatings.length;
    const headline = isChecker
      ? `${displayPartnerName} understood you perfectly!`
      : `You understood ${getFirstName(state.checkerName || partnerName)} perfectly!`;

    const roundsMessage = roundCount > 0
      ? `Achieved in ${roundCount} explain-back ${roundCount === 1 ? 'round' : 'rounds'}`
      : null;

    return (
      <div className="flex flex-col min-h-screen bg-background">
        <LiveMeetingHeader />
        <div className={CONTENT_LAYOUT}>
          {cardState.activeStory && <StoryCardPreview story={cardState.activeStory} showLinkedPoints />}
          <div className="text-center space-y-2">
            <div className="text-4xl">🎉</div>
            <h2 className="text-xl font-semibold text-green-600">{headline}</h2>
            {roundsMessage && (
              <p className="text-sm text-muted-foreground">{roundsMessage}</p>
            )}
          </div>

          <JourneyToUnderstanding variant="success" />

          <ActionArea subtitle={isChecker ? `Help ${displayPartnerName} learn what clicked for you?` : undefined}>
            <PrimaryButton onClick={handleContinue}>
              Continue
            </PrimaryButton>
          </ActionArea>
        </div>
      </div>
    );
  }

  // Fallback
  return (
    <div className="flex flex-col min-h-screen bg-background">
      <LiveMeetingHeader />
      <div className={CONTENT_LAYOUT_CENTERED}>
        <p>Unknown state</p>
        <PrimaryButton onClick={handleSpeakFreely}>Reset</PrimaryButton>
      </div>
    </div>
  );
}
