import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { ArrowLeft, Mic, MicOff, Play, Square, Star, CheckCircle, Plus } from 'lucide-react';
import { getUserById, users } from '../data/mock-data';
import { routes } from '../config';
import { BottomNav } from './BottomNav';
import { CreateIdeaModal } from './CreateIdeaModal';

type Phase = 'select-partner' | 'select-role' | 'speaking' | 'playback' | 'rating' | 'result';
type Role = 'speaker' | 'listener';

interface LocationState {
  partnerId?: string;
  ideaId?: string;
  ideaText?: string;
  messageId?: string;
  messageText?: string;
  convertToIdea?: boolean;
  myPosition?: string | null;
  theirPosition?: string;
}

export function LiveSession() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();

  // Extract context from both query params and navigation state
  const state = location.state as LocationState | undefined;
  const preselectedUserId = searchParams.get('with') || state?.partnerId;

  // Context available from navigation:
  // - ideaId, ideaText: from EngagerList (verifying an idea)
  // - messageId, messageText, convertToIdea: from ChatConversation (verifying a message)
  // - myPosition, theirPosition: from EngagerList (positions on the idea)

  const [phase, setPhase] = useState<Phase>(preselectedUserId ? 'select-role' : 'select-partner');
  const [selectedPartner, setSelectedPartner] = useState<string | null>(preselectedUserId);
  const [role, setRole] = useState<Role | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [speakingTime, setSpeakingTime] = useState(0);
  const [confidenceRating, setConfidenceRating] = useState(7);
  const [accuracyRating, setAccuracyRating] = useState(7);
  const [showCreateModal, setShowCreateModal] = useState(false);

  const partner = getUserById(selectedPartner || '');
  const availablePartners = users.filter(u => u.id !== 'current');

  // Speaking timer
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (phase === 'speaking' && isRecording) {
      interval = setInterval(() => {
        setSpeakingTime(prev => prev + 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [phase, isRecording]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleSelectPartner = (userId: string) => {
    setSelectedPartner(userId);
    setPhase('select-role');
  };

  const handleSelectRole = (selectedRole: Role) => {
    setRole(selectedRole);
    setPhase('speaking');
  };

  const handleStartRecording = () => {
    setIsRecording(true);
  };

  const handleStopRecording = () => {
    setIsRecording(false);
    setPhase('playback');
  };

  const handleFinishPlayback = () => {
    setPhase('rating');
  };

  const handleSubmitRatings = () => {
    setPhase('result');
  };

  const renderSelectPartner = () => (
    <div className="flex-1 px-4 py-6">
      <h2 className="text-xl font-bold text-gray-900 mb-2">Start Live Verification</h2>
      <p className="text-gray-500 mb-6">Choose someone to verify understanding with</p>

      <div className="space-y-2">
        {availablePartners.map((user) => (
          <button
            key={user.id}
            onClick={() => handleSelectPartner(user.id)}
            className="w-full p-4 bg-white rounded-xl flex items-center gap-3 hover:bg-gray-50 transition-colors text-left"
          >
            <div className="w-12 h-12 rounded-full bg-gray-200 flex items-center justify-center text-xl">
              {user.avatar}
            </div>
            <div className="flex-1">
              <p className="font-semibold text-gray-900">{user.name}</p>
              <p className="text-sm text-gray-500">{user.role}</p>
            </div>
            <div className="text-right">
              <p className="text-sm font-medium text-purple-600">
                {user.verifiedListenerScore.toFixed(1)}
              </p>
              <p className="text-xs text-gray-400">listener score</p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );

  const renderSelectRole = () => (
    <div className="flex-1 px-4 py-6 flex flex-col items-center justify-center">
      <div className="w-20 h-20 rounded-full bg-gray-200 flex items-center justify-center text-4xl mb-4">
        {partner?.avatar}
      </div>
      <h2 className="text-xl font-bold text-gray-900 mb-1">
        Session with {partner?.name}
      </h2>
      <p className="text-gray-500 mb-8">Choose your role</p>

      <div className="w-full max-w-sm space-y-3">
        <button
          onClick={() => handleSelectRole('speaker')}
          className="w-full p-4 bg-blue-500 hover:bg-blue-600 text-white rounded-xl font-semibold transition-colors"
        >
          I'll explain my position
        </button>
        <button
          onClick={() => handleSelectRole('listener')}
          className="w-full p-4 bg-white hover:bg-gray-50 text-gray-900 rounded-xl font-semibold border border-gray-200 transition-colors"
        >
          I'll listen first
        </button>
      </div>
    </div>
  );

  const renderSpeaking = () => (
    <div className="flex-1 px-4 py-6 flex flex-col items-center justify-center">
      {/* Timer */}
      <div className="text-5xl font-mono font-bold text-gray-900 mb-4">
        {formatTime(speakingTime)}
      </div>

      {/* Status */}
      <p className="text-gray-500 mb-8">
        {role === 'speaker'
          ? isRecording ? 'Explaining your position...' : 'Ready to explain'
          : isRecording ? 'Listening...' : 'Ready to listen'
        }
      </p>

      {/* Recording indicator */}
      {isRecording && (
        <div className="flex items-center gap-2 mb-8">
          <span className="w-3 h-3 bg-red-500 rounded-full animate-pulse" />
          <span className="text-red-500 font-medium">Recording</span>
        </div>
      )}

      {/* Controls */}
      <div className="flex items-center gap-4">
        {!isRecording ? (
          <button
            onClick={handleStartRecording}
            className="w-20 h-20 bg-red-500 hover:bg-red-600 rounded-full flex items-center justify-center text-white transition-colors shadow-lg"
            aria-label="Start recording"
          >
            <Mic size={32} />
          </button>
        ) : (
          <button
            onClick={handleStopRecording}
            className="w-20 h-20 bg-gray-800 hover:bg-gray-900 rounded-full flex items-center justify-center text-white transition-colors shadow-lg"
            aria-label="Stop recording"
          >
            <Square size={32} />
          </button>
        )}
      </div>

      {/* Partner status */}
      <div className="mt-8 flex items-center gap-2 text-gray-500">
        <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-sm">
          {partner?.avatar}
        </div>
        <span>{partner?.name} is {role === 'speaker' ? 'listening' : 'speaking'}...</span>
      </div>
    </div>
  );

  const renderPlayback = () => (
    <div className="flex-1 px-4 py-6 flex flex-col items-center justify-center">
      <h2 className="text-xl font-bold text-gray-900 mb-2">Playback Phase</h2>
      <p className="text-gray-500 mb-8 text-center">
        {role === 'speaker'
          ? `${partner?.name} will now explain what they understood`
          : 'Now explain what you understood from their explanation'
        }
      </p>

      <button
        onClick={handleFinishPlayback}
        className="px-8 py-3 bg-blue-500 hover:bg-blue-600 text-white rounded-xl font-semibold transition-colors"
      >
        <Play size={20} className="inline mr-2" />
        Continue to Rating
      </button>
    </div>
  );

  const renderRating = () => (
    <div className="flex-1 px-4 py-6">
      <h2 className="text-xl font-bold text-gray-900 mb-2 text-center">Rate the Session</h2>
      <p className="text-gray-500 mb-8 text-center">How well was understanding verified?</p>

      <div className="space-y-8 max-w-sm mx-auto">
        {/* Confidence rating (listener gives) */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-3">
            Your confidence in your understanding
          </label>
          <div className="flex items-center justify-between gap-2">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
              <button
                key={n}
                onClick={() => setConfidenceRating(n)}
                className={`
                  w-8 h-8 rounded-full text-sm font-medium transition-colors
                  ${confidenceRating === n
                    ? 'bg-blue-500 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }
                `}
              >
                {n}
              </button>
            ))}
          </div>
        </div>

        {/* Accuracy rating (speaker gives) */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-3">
            How accurately was your position understood?
          </label>
          <div className="flex items-center justify-between gap-2">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
              <button
                key={n}
                onClick={() => setAccuracyRating(n)}
                className={`
                  w-8 h-8 rounded-full text-sm font-medium transition-colors
                  ${accuracyRating === n
                    ? 'bg-purple-500 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }
                `}
              >
                {n}
              </button>
            ))}
          </div>
        </div>

        <button
          onClick={handleSubmitRatings}
          className="w-full py-3 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl font-semibold transition-colors"
        >
          Submit Ratings
        </button>
      </div>
    </div>
  );

  const renderResult = () => {
    const gap = Math.abs(confidenceRating - accuracyRating);
    const isSuccess = gap <= 2;

    return (
      <div className="flex-1 px-4 py-6 flex flex-col items-center justify-center">
        <div className={`w-20 h-20 rounded-full flex items-center justify-center mb-4 ${
          isSuccess ? 'bg-emerald-100' : 'bg-amber-100'
        }`}>
          {isSuccess ? (
            <CheckCircle size={40} className="text-emerald-600" />
          ) : (
            <Star size={40} className="text-amber-600" />
          )}
        </div>

        <h2 className="text-2xl font-bold text-gray-900 mb-2">
          {isSuccess ? 'Understanding Verified!' : 'Good Progress'}
        </h2>

        <p className="text-gray-500 mb-6 text-center max-w-xs">
          {isSuccess
            ? `You and ${partner?.name} achieved mutual understanding`
            : `The gap between confidence and accuracy was ${gap} points. Consider another round.`
          }
        </p>

        <div className="flex items-center gap-6 mb-8">
          <div className="text-center">
            <p className="text-3xl font-bold text-blue-500">{confidenceRating}</p>
            <p className="text-sm text-gray-500">Confidence</p>
          </div>
          <div className="text-center">
            <p className="text-3xl font-bold text-purple-500">{accuracyRating}</p>
            <p className="text-sm text-gray-500">Accuracy</p>
          </div>
        </div>

        <div className="flex gap-3">
          <button
            onClick={() => navigate(routes.feed)}
            className="px-6 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-semibold transition-colors"
          >
            Back to Feed
          </button>
          {!isSuccess && (
            <button
              onClick={() => {
                setPhase('speaking');
                setSpeakingTime(0);
              }}
              className="px-6 py-3 bg-blue-500 hover:bg-blue-600 text-white rounded-xl font-semibold transition-colors"
            >
              Try Again
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col pb-20">
      {/* Header */}
      <header className="bg-white border-b border-gray-100 sticky top-0 z-40">
        <div className="flex items-center justify-between px-4 py-3">
          <button
            onClick={() => navigate(-1)}
            className="w-10 h-10 flex items-center justify-center text-gray-600 hover:bg-gray-100 rounded-full transition-colors"
            aria-label="Go back"
          >
            <ArrowLeft size={20} />
          </button>
          <h1 className="text-lg font-semibold text-gray-900">Live Session</h1>
          <div className="w-10" />
        </div>
      </header>

      {/* Content based on phase */}
      {phase === 'select-partner' && renderSelectPartner()}
      {phase === 'select-role' && renderSelectRole()}
      {phase === 'speaking' && renderSpeaking()}
      {phase === 'playback' && renderPlayback()}
      {phase === 'rating' && renderRating()}
      {phase === 'result' && renderResult()}

      {/* FAB: + New Idea */}
      <button
        onClick={() => setShowCreateModal(true)}
        className="fixed bottom-24 right-4 w-14 h-14 bg-blue-500 text-white rounded-full shadow-lg flex items-center justify-center hover:bg-blue-600 transition-colors z-10"
        aria-label="Create new idea"
      >
        <Plus className="w-6 h-6" />
      </button>

      {/* Create Idea Modal */}
      <CreateIdeaModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onIdeaCreated={() => {
          setShowCreateModal(false);
        }}
      />

      <BottomNav />
    </div>
  );
}
