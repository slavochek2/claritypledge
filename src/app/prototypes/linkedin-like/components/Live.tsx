/**
 * @file Live.tsx
 * @description Mocked Live Session UI - Cloned from main /live for prototyping
 *
 * This is a fully interactive mock of the Clarity Live Meeting experience.
 * All state is local - no backend, no Supabase, no audio recording.
 *
 * Flow:
 * 1. Start screen - Create or Join a meeting
 * 2. Waiting room - Show code, wait for partner (mocked)
 * 3. Live mode - "connected" with partner
 * 4. User taps "Did you understand me?" or "Did I understand you?"
 * 5. Rating screen - 0-10 scale
 * 6. Partner "submits" (simulated after delay)
 * 7. Gap revealed OR calibrated
 * 8. Explain-back option
 * 9. After explain-back: re-rate
 * 10. Perfect understanding celebration OR another round
 */
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Link } from 'react-router-dom';
import { X, Volume2, VolumeX, ArrowLeft, Copy, Check, Users, Plus, LogIn, Lightbulb } from 'lucide-react';
import { PrototypeLayout } from './PrototypeLayout';
import { mockUsers, currentUser, getInitialYourIdeasQueue } from '../data/mock-data';
import { QRCodeSVG } from 'qrcode.react';
import { Toaster } from '@/components/ui/sonner';
import { YourIdeasQueue, TheirIdeas, SurfaceIdeaDrawer } from './ideas';

// ============================================================================
// TYPES (mirroring main LiveSessionState structure)
// ============================================================================

type MeetingPhase = 'start' | 'waiting' | 'live';
type RatingPhase = 'idle' | 'rating' | 'waiting' | 'revealed' | 'explain-back' | 'results' | 'perfect';
type FlowType = 'check' | 'prove';
type GapType = 'overconfidence' | 'underconfidence' | 'none';
type LiveTab = 'meeting' | 'ideas';
type IdeasSubTab = 'your-ideas' | 'their-ideas';

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
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Exclude confusing chars: I, O, 0, 1
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function Live() {
  const navigate = useNavigate();
  const { ideaId } = useParams<{ ideaId?: string }>();
  const partner = mockUsers[0]; // Alice Chen
  const partnerName = partner.name;
  const displayPartnerName = getFirstName(partnerName);

  // Meeting phase state (start -> waiting -> live)
  const [meetingPhase, setMeetingPhase] = useState<MeetingPhase>('start');
  const [meetingCode, setMeetingCode] = useState<string>('');
  const [joinCode, setJoinCode] = useState<string>('');
  const [userName, setUserName] = useState<string>(currentUser.name);
  const [isCreator, setIsCreator] = useState<boolean>(false);
  const [copied, setCopied] = useState(false);

  // Sound toggle state
  const [soundEnabled, setSoundEnabled] = useState(true);

  // Core live state
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
  const [showExitDialog, setShowExitDialog] = useState(false);
  const [activeTab, setActiveTab] = useState<LiveTab>('meeting');

  // P55: Ideas tab state
  const [ideasSubTab, setIdeasSubTab] = useState<IdeasSubTab>('your-ideas');
  const [surfaceDrawerOpen, setSurfaceDrawerOpen] = useState(false);

  // Ideas badge count - get from queue
  const ideasCount = getInitialYourIdeasQueue().filter(i => !i.actioned).length;

  // Determine if current user is the checker (speaker)
  const isChecker = state.checkerName === currentUser.name;

  // Calculate gap
  const gap = state.checkerRating !== undefined && state.responderRating !== undefined
    ? state.responderRating - state.checkerRating
    : 0;
  const gapType: GapType = gap > 0 ? 'overconfidence' : gap < 0 ? 'underconfidence' : 'none';
  const gapPoints = Math.abs(gap);

  // Latest rating for perfect detection
  const latestCheckerRating = state.explainBackRatings.length > 0
    ? state.explainBackRatings[state.explainBackRatings.length - 1]
    : state.checkerRating;

  // ============================================================================
  // MEETING HANDLERS
  // ============================================================================

  const handleCreateMeeting = () => {
    const code = generateMeetingCode();
    setMeetingCode(code);
    setIsCreator(true);
    setMeetingPhase('waiting');
  };

  const handlePartnerJoined = () => {
    setMeetingPhase('live');
  };

  const handleJoinMeeting = () => {
    if (joinCode.length !== 6) return;
    setMeetingCode(joinCode.toUpperCase());
    setIsCreator(false);
    setMeetingPhase('live'); // Direct to live since we're "joining"
  };

  const handleCopyCode = async () => {
    const shareLink = `${window.location.origin}/prototype/linkedin-like/live?code=${meetingCode}`;
    try {
      await navigator.clipboard.writeText(shareLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback: copy just the code
      await navigator.clipboard.writeText(meetingCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // ============================================================================
  // LIVE SESSION HANDLERS
  // ============================================================================

  const handleStartCheck = () => {
    // User becomes checker (speaker) - "Did you understand me?"
    setState(prev => ({
      ...prev,
      ratingPhase: 'rating',
      flowType: 'check',
      checkerName: currentUser.name,
      responderName: partnerName,
    }));
  };

  const handleStartProve = () => {
    // User becomes responder - "Did I understand you?"
    setState(prev => ({
      ...prev,
      ratingPhase: 'rating',
      flowType: 'prove',
      checkerName: partnerName, // Partner is the one being understood
      responderName: currentUser.name, // User is proving they understand
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

    // Simulate partner submitting after a delay
    setTimeout(() => {
      const partnerRating = Math.floor(Math.random() * 4) + 5; // Random 5-8 rating
      setState(prev => ({
        ...prev,
        checkerRating: !amChecker ? partnerRating : prev.checkerRating,
        responderRating: amChecker ? partnerRating : prev.responderRating,
        checkerSubmitted: true,
        responderSubmitted: true,
        ratingPhase: 'revealed',
      }));
    }, 1500);
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
      // Perfect! Celebration
      setState(prev => ({
        ...prev,
        explainBackRatings: newRatings,
        ratingPhase: 'perfect',
      }));
    } else {
      // Go to results, can do another round
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
    // Reset for new round
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

  const handleSpeakFreely = () => {
    // Skip to idle, simulating "speak freely" action
    handleContinue();
  };

  const handleExit = () => {
    navigate('/prototype/linkedin-like/profile');
  };

  // ============================================================================
  // RENDER PHASES
  // ============================================================================

  // Recording indicator (mocked - always on)
  const RecordingIndicator = () => (
    <div className="flex items-center justify-center gap-2 py-1.5 bg-red-50 border-b border-red-200">
      <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
      <span className="text-xs text-red-700">Recording session</span>
    </div>
  );

  // Header for active meeting (simplified - no hamburger, inline controls)
  const LiveMeetingHeader = () => (
    <>
      <div className="h-14 border-b bg-white">
        <div className="max-w-4xl mx-auto px-4 h-full">
          <div className="flex items-center justify-between h-full">
            {/* Left: Logo */}
            <Link to="/prototype/linkedin-like/profile" className="flex items-center gap-2 shrink-0 hover:opacity-80 transition-opacity">
              <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center text-white font-bold text-sm">
                C
              </div>
            </Link>

            {/* Center: Tab navigation */}
            <div className="flex items-center gap-1">
              <button
                onClick={() => setActiveTab('meeting')}
                className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                  activeTab === 'meeting'
                    ? 'bg-gray-100 text-gray-900'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                Meeting
              </button>
              <button
                onClick={() => setActiveTab('ideas')}
                className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors flex items-center gap-1.5 ${
                  activeTab === 'ideas'
                    ? 'bg-blue-100 text-blue-700'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                <Lightbulb className="w-4 h-4" />
                Ideas
                {ideasCount > 0 && (
                  <span className={`px-1.5 py-0.5 rounded-full text-xs font-semibold ${
                    activeTab === 'ideas'
                      ? 'bg-blue-500 text-white'
                      : 'bg-gray-200 text-gray-700'
                  }`}>
                    {ideasCount}
                  </span>
                )}
              </button>
            </div>

            {/* Right: Sound toggle + Leave */}
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
      {activeTab === 'meeting' && <RecordingIndicator />}
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
      ? <>{displayPartnerName}'s journey to <span className="font-semibold text-foreground">make you feel understood</span></>
      : <>Your journey to <span className="font-semibold text-foreground">make {getFirstName(state.checkerName || partnerName)} feel understood</span></>;

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
                    <RatingDisplay label={<b className="text-foreground">Your feeling</b>} rating={state.checkerRating} />
                  ) : (
                    <RatingDisplayPending label={<b className="text-foreground">Your feeling</b>} />
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
                    <RatingDisplay label={<b className="text-foreground">{getFirstName(state.checkerName || partnerName)}'s feeling</b>} rating={state.checkerRating} />
                  ) : (
                    <RatingDisplayPending label={<b className="text-foreground">{getFirstName(state.checkerName || partnerName)}'s feeling</b>} />
                  )}
                </>
              )}
            </div>
          </div>

          {/* Explain-back rounds */}
          {state.explainBackRatings.map((rating, index) => (
            <div key={index} className="flex gap-3 pt-2 border-t">
              <div className="w-4 shrink-0 text-xs text-muted-foreground pt-0.5 text-right">{index + 1}</div>
              <div className="flex-1">
                <RatingDisplay
                  label={isChecker
                    ? <b className="text-foreground">Your feeling</b>
                    : <b className="text-foreground">{getFirstName(state.checkerName || partnerName)}'s feeling</b>
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

  // Primary button style
  const PrimaryButton = ({ onClick, children, disabled }: { onClick: () => void; children: React.ReactNode; disabled?: boolean }) => (
    <button
      onClick={onClick}
      disabled={disabled}
      className="bg-blue-500 hover:bg-blue-600 disabled:bg-blue-300 text-white font-semibold py-3 px-6 rounded-md w-full transition-colors"
    >
      {children}
    </button>
  );

  // Outline button
  const OutlineButton = ({ onClick, children }: { onClick: () => void; children: React.ReactNode }) => (
    <button
      onClick={onClick}
      className="border border-input bg-background hover:bg-accent text-foreground font-semibold py-3 px-6 rounded-md w-full transition-colors"
    >
      {children}
    </button>
  );

  // Ghost button
  const GhostButton = ({ onClick, children }: { onClick: () => void; children: React.ReactNode }) => (
    <button
      onClick={onClick}
      className="text-muted-foreground hover:text-foreground text-sm py-2 transition-colors"
    >
      {children}
    </button>
  );

  // ============================================================================
  // PHASE RENDERING
  // ============================================================================

  // MEETING START PHASE - Create or Join (uses PrototypeLayout)
  if (meetingPhase === 'start') {
    return (
      <PrototypeLayout>
        <div className={CONTENT_LAYOUT_CENTERED}>
          {/* Hero section */}
          <div className="text-center space-y-2">
            <div className="w-16 h-16 rounded-full bg-blue-50 border-2 border-blue-200 flex items-center justify-center mx-auto">
              <Users className="w-8 h-8 text-blue-500" />
            </div>
            <h1 className="text-2xl font-semibold text-gray-900">Start a Clarity Meeting</h1>
            <p className="text-gray-500 text-sm max-w-xs mx-auto">
              Verify understanding in real-time with a partner
            </p>
          </div>

          {/* Create meeting button */}
          <div className="w-full max-w-xs space-y-6">
            <button
              onClick={handleCreateMeeting}
              className="w-full bg-blue-500 hover:bg-blue-600 text-white font-semibold py-4 px-6 rounded-lg transition-colors flex items-center justify-center gap-3"
            >
              <Plus className="w-5 h-5" />
              Create Meeting
            </button>

            {/* Divider */}
            <div className="flex items-center gap-4">
              <div className="flex-1 h-px bg-gray-200" />
              <span className="text-xs text-gray-500">OR</span>
              <div className="flex-1 h-px bg-gray-200" />
            </div>

            {/* Join meeting */}
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

  // WAITING PHASE - Creator waiting for partner (uses PrototypeLayout with sub-header)
  if (meetingPhase === 'waiting') {
    const shareLink = `${window.location.origin}/prototype/linkedin-like/live?code=${meetingCode}`;

    return (
      <PrototypeLayout>
        {/* Sub-header for waiting room */}
        <div className="bg-white border-b border-gray-200">
          <div className="flex items-center gap-3 px-4 py-3 max-w-4xl mx-auto">
            <button
              onClick={() => setMeetingPhase('start')}
              className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-900 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Back
            </button>
            <span className="flex-1 text-center text-sm text-gray-500">
              Waiting Room
            </span>
            <div className="w-12" /> {/* Spacer for balance */}
          </div>
        </div>

        <div className={CONTENT_LAYOUT_CENTERED}>
          {/* QR Code */}
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200">
            <QRCodeSVG value={shareLink} size={180} level="M" />
          </div>

          {/* Meeting code */}
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

          {/* Waiting indicator */}
          <div className="flex items-center gap-3 px-4 py-3 bg-gray-100 rounded-lg">
            <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
            <span className="text-sm text-gray-500">Waiting for partner to join...</span>
          </div>

          {/* Instructions */}
          <p className="text-xs text-gray-400 text-center max-w-xs">
            Share the QR code or meeting code with your partner to start the clarity session
          </p>

          {/* Simulate partner joined button (for prototype) */}
          <button
            onClick={handlePartnerJoined}
            className="mt-4 px-6 py-3 bg-blue-500 hover:bg-blue-600 text-white font-semibold rounded-lg transition-colors flex items-center justify-center gap-2"
          >
            <Check className="w-5 h-5" />
            Simulate: Partner Joined
          </button>
        </div>
      </PrototypeLayout>
    );
  }

  // ============================================================================
  // LIVE PHASE RENDERING (existing code)
  // ============================================================================

  // Ideas Tab Content Component
  const IdeasTabContent = () => (
    <div className="flex-1 flex flex-col bg-gray-50">
      {/* Sub-tabs for Your Ideas / Their Ideas */}
      <div className="bg-white border-b border-gray-200 px-4 py-2">
        <div className="flex items-center gap-1">
          <button
            onClick={() => setIdeasSubTab('your-ideas')}
            className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              ideasSubTab === 'your-ideas'
                ? 'bg-blue-50 text-blue-700'
                : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
            }`}
          >
            Your Ideas
            {ideasCount > 0 && (
              <span className="ml-1.5 px-1.5 py-0.5 rounded-full text-xs bg-blue-500 text-white">
                {ideasCount}
              </span>
            )}
          </button>
          <button
            onClick={() => setIdeasSubTab('their-ideas')}
            className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              ideasSubTab === 'their-ideas'
                ? 'bg-blue-50 text-blue-700'
                : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
            }`}
          >
            Their Ideas
          </button>
        </div>
      </div>

      {/* Content based on sub-tab */}
      {ideasSubTab === 'your-ideas' ? (
        <YourIdeasQueue partnerName={displayPartnerName} />
      ) : (
        <TheirIdeas
          partnerName={displayPartnerName}
          onSurfaceIdea={() => setSurfaceDrawerOpen(true)}
        />
      )}

      {/* Surface Idea Drawer */}
      <SurfaceIdeaDrawer
        open={surfaceDrawerOpen}
        onOpenChange={setSurfaceDrawerOpen}
        partnerName={displayPartnerName}
        onSubmit={(text) => {
          // Creator automatically agrees with their own idea
          console.log('New idea:', text, 'Position: agree (auto)');
          // In a real app, this would add to the ideas list with position: 'agree'
        }}
      />

      {/* Toaster for notifications */}
      <Toaster position="top-center" />
    </div>
  );

  // IDLE PHASE - Start screen (now within live meeting)
  if (state.ratingPhase === 'idle') {
    const hasHistory = state.explainBackRatings.length > 0 || state.checkerRating !== undefined;

    return (
      <div className="flex flex-col min-h-screen bg-background">
        <LiveMeetingHeader />
        {activeTab === 'ideas' ? (
          <IdeasTabContent />
        ) : (
          <div className={hasHistory ? CONTENT_LAYOUT : CONTENT_LAYOUT_CENTERED}>
            {hasHistory && <JourneyToUnderstanding />}

            <ActionArea title="Verify cognitive understanding">
              <PrimaryButton onClick={handleStartCheck}>
                Did <span className="font-bold">you</span> understand me?
              </PrimaryButton>
              <OutlineButton onClick={handleStartProve}>
                Did <span className="font-bold">I</span> understand you?
              </OutlineButton>
            </ActionArea>
          </div>
        )}
      </div>
    );
  }

  // RATING PHASE - User is rating
  if (state.ratingPhase === 'rating') {
    const prompt = isChecker
      ? `How well do you feel ${displayPartnerName} understands you?`
      : `How confident are you that you understand ${getFirstName(state.checkerName || partnerName)}?`;

    return (
      <div className="flex flex-col min-h-screen bg-background">
        <LiveMeetingHeader />
        <div className={CONTENT_LAYOUT}>
          {/* Rating card as drawer-like element at bottom */}
        </div>

        {/* Rating drawer */}
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

  // WAITING PHASE - Waiting for partner
  if (state.ratingPhase === 'waiting') {
    const waitingMessage = isChecker
      ? `Waiting for ${displayPartnerName} to share their confidence...`
      : `Waiting for ${getFirstName(state.checkerName || partnerName)} to share their feeling...`;

    return (
      <div className="flex flex-col min-h-screen bg-background">
        <LiveMeetingHeader />
        <div className={CONTENT_LAYOUT}>
          <JourneyToUnderstanding />
          <ActionArea>
            <WaitingIndicator message={waitingMessage} onSkip={handleContinue} skipLabel="Cancel" />
          </ActionArea>
        </div>
      </div>
    );
  }

  // REVEALED PHASE - Gap revealed or calibrated
  if (state.ratingPhase === 'revealed') {
    const isCalibrated = gapPoints === 0;
    const pointLabel = gapPoints === 1 ? 'point' : 'points';

    const insightMessage = isCalibrated
      ? (isChecker
          ? <>You feel {displayPartnerName} understands <span className="font-bold">exactly as much</span> as they think</>
          : <>{getFirstName(state.checkerName || partnerName)} feels you understand <span className="font-bold">exactly as much</span> as you think</>)
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
          <JourneyToUnderstanding />

          {/* Gap/Calibration badge */}
          <div className={`border rounded-lg px-4 py-3 w-full max-w-sm ${isCalibrated ? 'border-input bg-muted/50' : 'border-blue-200 bg-blue-50'}`}>
            <div className="flex items-center justify-center gap-2 mb-1">
              <span className={`text-white text-xs font-semibold px-2 py-0.5 rounded-full ${isCalibrated ? 'bg-green-500' : 'bg-blue-500'}`}>
                {isCalibrated ? 'Perfectly calibrated' : `${gapPoints} ${pointLabel} gap`}
              </span>
            </div>
            <p className={`text-sm text-center ${isCalibrated ? 'text-muted-foreground' : 'text-blue-700'}`}>{insightMessage}</p>
          </div>

          <ActionArea
            title={!isChecker ? `Help ${getFirstName(state.checkerName || partnerName)} feel more understood. Withhold premature judgment.` : undefined}
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

  // EXPLAIN-BACK PHASE
  if (state.ratingPhase === 'explain-back') {
    // Speaker view
    if (isChecker) {
      if (!state.explainBackDone) {
        return (
          <div className="flex flex-col min-h-screen bg-background">
            <LiveMeetingHeader />
            <div className={CONTENT_LAYOUT}>
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

      // Listener tapped done - show rating drawer
      const explainBackPrompt = `How well did ${displayPartnerName} capture the intention behind your idea?`;

      return (
        <div className="flex flex-col min-h-screen bg-background">
          <LiveMeetingHeader />
          <div className={CONTENT_LAYOUT}>
            <JourneyToUnderstanding />
          </div>

          {/* Rating drawer */}
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

    // Listener view - explaining back
    if (state.explainBackDone) {
      return (
        <div className="flex flex-col min-h-screen bg-background">
          <LiveMeetingHeader />
          <div className={CONTENT_LAYOUT}>
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

  // RESULTS PHASE - After explain-back, can do another round
  if (state.ratingPhase === 'results') {
    return (
      <div className="flex flex-col min-h-screen bg-background">
        <LiveMeetingHeader />
        <div className={CONTENT_LAYOUT}>
          <JourneyToUnderstanding />
          <ActionArea
            title={!isChecker ? `Help ${getFirstName(state.checkerName || partnerName)} feel more understood. Withhold premature judgment.` : undefined}
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

  // PERFECT PHASE - Celebration
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
          {/* Celebration header */}
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
        <PrimaryButton onClick={handleContinue}>Reset</PrimaryButton>
      </div>
    </div>
  );
}
