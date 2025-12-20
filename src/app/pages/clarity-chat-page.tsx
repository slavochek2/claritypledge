/**
 * @file clarity-chat-page.tsx
 * @description Clarity Chat MVP - Create/join chat, send messages, paraphrase flow.
 * Reuses session infrastructure from P19.1 (clarity_sessions table).
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Slider } from '@/components/ui/slider';
import {
  createClaritySession,
  joinClaritySession,
  subscribeToClaritySession,
  sendChatMessage,
  getChatMessages,
  subscribeToChatMessages,
  subscribeToChatMessageUpdates,
  createVerification,
  getVerificationsForSession,
  subscribeToVerifications,
  rateVerification,
  setVerificationPosition,
  requestExplanation,
  cancelExplanationRequest,
  type ClaritySession,
  type ChatMessage,
  type Verification,
} from '@/app/data/api';
import { useSpeechToText } from '@/hooks/useSpeechToText';
import { Send, CheckCircle2, ThumbsUp, ThumbsDown, HelpCircle, X, Mic, Square, Play, Pause, Globe, MessageCircle, ChevronDown, ChevronRight, Undo2, RotateCcw, Clock } from 'lucide-react';

type ViewState = 'start' | 'waiting' | 'chat';

// Max audio recording duration (60 seconds)
const MAX_RECORDING_SECONDS = 60;

// Verification thread component with progressive disclosure
// - Collapsed by default after completion (shows summary)
// - Expandable to see full history
// - Hidden when action is needed (to avoid duplicate info with action cards)
// UX IMPROVEMENTS:
// - Clear accordion affordance with visible expand/collapse
// - Better visual boundaries
// - Consistent button styling
function VerificationThread({
  verifications,
  currentUserName,
  messageAuthorName,
  hasPendingAction, // True when rating UI is shown - hides thread to avoid duplication
}: {
  verifications: Verification[];
  currentUserName: string;
  messageAuthorName: string;
  hasPendingAction?: boolean;
}) {
  const [isExpanded, setIsExpanded] = useState(false);

  if (verifications.length === 0) return null;

  // Sort by round number to show chronological order
  const sorted = [...verifications].sort((a, b) => a.roundNumber - b.roundNumber);
  const latestVerification = sorted[sorted.length - 1];
  const isAccepted = latestVerification?.status === 'accepted';
  const isPending = latestVerification?.status === 'pending' && latestVerification?.accuracyRating === undefined;
  const needsRetry = latestVerification?.status === 'needs_retry';
  const totalRounds = sorted.length;

  // When there's a pending action (rating UI visible), only show minimal status
  // The action card already shows the paraphrase text
  if (hasPendingAction) {
    return (
      <div className="mt-2 text-xs text-muted-foreground flex items-center gap-1">
        <MessageCircle className="h-3 w-3" />
        {totalRounds > 1 && <span>Round {totalRounds}</span>}
      </div>
    );
  }

  // Collapsed summary view (for completed or multi-round scenarios)
  // UX FIX: Clear button affordance with hover states and visual feedback
  const CollapsedSummary = () => {
    if (isAccepted) {
      // Check if current user is the verifier (to show their self-rating)
      const isMyVerification = latestVerification.verifierName === currentUserName;
      const showCalibration = isMyVerification && latestVerification.selfRating !== undefined;
      // Green only for 100% (full understanding), blue for accepted-but-imperfect
      const isPerfect = latestVerification.accuracyRating === 100;

      return (
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className={`mt-2 flex items-center gap-1.5 text-xs px-2 py-1 rounded-md border transition-all ${
            isPerfect
              ? 'bg-green-50 text-green-700 hover:bg-green-100 border-green-200'
              : 'bg-blue-50 text-blue-700 hover:bg-blue-100 border-blue-200'
          }`}
          title={isExpanded ? 'Hide details' : 'Show details'}
        >
          {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          <CheckCircle2 className="h-3 w-3" />
          <span className="font-medium">
            {isPerfect ? 'Fully understood' : `${latestVerification.accuracyRating! / 10}/10 understood`}
            {showCalibration && latestVerification.selfRating !== latestVerification.accuracyRating && (
              <span className={`font-normal ml-1 ${isPerfect ? 'text-green-600/70' : 'text-blue-600/70'}`}>
                (guessed {latestVerification.selfRating! / 10}/10)
              </span>
            )}
            {totalRounds > 1 && ` · ${totalRounds} tries`}
          </span>
          {latestVerification.position && (
            <span className={`ml-1 ${
              latestVerification.position === 'agree' ? 'text-green-600' :
              latestVerification.position === 'disagree' ? 'text-red-600' :
              'text-gray-500'
            }`}>
              {latestVerification.position === 'agree' && '👍'}
              {latestVerification.position === 'disagree' && '👎'}
              {latestVerification.position === 'dont_know' && '❓'}
            </span>
          )}
        </button>
      );
    }

    if (isPending) {
      // Check if current user is the verifier (to show their self-rating)
      const isMyVerification = latestVerification.verifierName === currentUserName;
      const showSelfRating = isMyVerification && latestVerification.selfRating !== undefined;

      return (
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="mt-2 flex items-center gap-1.5 text-xs px-2 py-1 rounded-md bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 transition-all"
          title={isExpanded ? 'Hide details' : 'Show details'}
        >
          {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          <span className="animate-pulse text-blue-500">●</span>
          <span>
            Waiting for {messageAuthorName} to rate your understanding
            {showSelfRating && (
              <span className="text-blue-600/70"> · you rated yourself {latestVerification.selfRating! / 10}/10</span>
            )}
            {totalRounds > 1 && ` · attempt ${totalRounds}`}
          </span>
        </button>
      );
    }

    if (needsRetry) {
      // Check if current user is the verifier (to show their self-rating)
      const isMyVerification = latestVerification.verifierName === currentUserName;
      const showCalibration = isMyVerification && latestVerification.selfRating !== undefined;

      return (
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="mt-2 flex items-center gap-1.5 text-xs px-2 py-1 rounded-md bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 transition-all"
          title={isExpanded ? 'Hide details' : 'Show details'}
        >
          {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          <MessageCircle className="h-3 w-3" />
          <span>
            {latestVerification.accuracyRating}% captured · retry needed
            {showCalibration && (
              <span className="text-blue-600/70">
                {' '}(guessed {latestVerification.selfRating}%)
              </span>
            )}
          </span>
        </button>
      );
    }

    return null;
  };

  // For single pending verification with no history, show inline status only
  if (totalRounds === 1 && isPending && !isExpanded) {
    return <CollapsedSummary />;
  }

  return (
    <div className="mt-2">
      <CollapsedSummary />

      {/* Expanded thread content - UX FIX: Clear visual boundary */}
      {isExpanded && (
        <div className="mt-2 ml-1 border-l-2 border-blue-200 pl-3 space-y-3 bg-muted/30 rounded-r-lg py-2 pr-2">
          {sorted.map((v) => {
            const isMyVerification = v.verifierName === currentUserName;
            const showAsVerifier = isMyVerification;

            return (
              <div key={v.id} className="space-y-2">
                {/* Paraphrase attempt */}
                <div className={`p-2 rounded-lg text-sm ${
                  showAsVerifier ? 'bg-background border shadow-sm' : 'bg-muted/50'
                }`}>
                  <div className="flex items-center gap-2 text-xs mb-1">
                    <span className="font-medium">{v.verifierName}</span>
                    {totalRounds > 1 && (
                      <span className="text-muted-foreground bg-muted px-1.5 py-0.5 rounded">Try #{v.roundNumber}</span>
                    )}
                  </div>
                  <p className="text-muted-foreground italic">"{v.paraphraseText}"</p>
                </div>

                {/* Rating response (if rated) - Green only at 10/10, blue otherwise */}
                {v.accuracyRating !== undefined && (() => {
                  const isPerfect = v.accuracyRating === 100;
                  return (
                    <div className={`p-2 rounded-lg text-sm ${
                      isPerfect ? 'bg-green-50 border border-green-200' : 'bg-blue-50 border border-blue-200'
                    }`}>
                      <div className="flex items-center gap-2 text-xs mb-1">
                        <span className="font-medium">{messageAuthorName}</span>
                        <span className={`font-medium px-1.5 py-0.5 rounded ${
                          isPerfect ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'
                        }`}>
                          {v.accuracyRating / 10}/10
                          {v.status === 'accepted' && ' ✓'}
                          {v.status === 'needs_retry' && ' → retry'}
                        </span>
                      </div>
                      {/* Show calibration comparison if self-rating exists */}
                      {v.selfRating !== undefined && (
                        <p className="text-xs text-muted-foreground">
                          {v.verifierName} predicted {v.selfRating / 10}/10; {messageAuthorName} rated {v.accuracyRating! / 10}/10
                          {v.calibrationGap !== undefined && v.calibrationGap !== 0 && (
                            <span className="text-blue-600">
                              {' '}({v.calibrationGap > 0 ? '+' : ''}{v.calibrationGap / 10})
                            </span>
                          )}
                        </p>
                      )}
                      {v.correctionText && (
                        <p className="text-sm mt-1 p-2 bg-background rounded border-l-2 border-blue-300">"{v.correctionText}"</p>
                      )}
                    </div>
                  );
                })()}

                {/* Position (after acceptance) */}
                {v.status === 'accepted' && v.position && (
                  <div className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs border ${
                    v.position === 'agree' ? 'bg-green-50 border-green-200 text-green-700' :
                    v.position === 'disagree' ? 'bg-red-50 border-red-200 text-red-700' :
                    'bg-gray-50 border-gray-200 text-gray-600'
                  }`}>
                    {v.position === 'agree' && <ThumbsUp className="h-3 w-3" />}
                    {v.position === 'disagree' && <ThumbsDown className="h-3 w-3" />}
                    {v.position === 'dont_know' && <HelpCircle className="h-3 w-3" />}
                    {v.verifierName} {v.position === 'agree' ? 'agrees' : v.position === 'disagree' ? 'disagrees' : 'is unsure'}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Supported languages for speech recognition
const SUPPORTED_LANGUAGES = [
  { code: 'en-US', label: 'English' },
  { code: 'ru-RU', label: 'Русский' },
  { code: 'uk-UA', label: 'Українська' },
  { code: 'de-DE', label: 'Deutsch' },
  { code: 'es-ES', label: 'Español' },
  { code: 'fr-FR', label: 'Français' },
  { code: 'it-IT', label: 'Italiano' },
  { code: 'pt-BR', label: 'Português' },
  { code: 'zh-CN', label: '中文' },
  { code: 'ja-JP', label: '日本語' },
  { code: 'ko-KR', label: '한국어' },
  { code: 'ar-SA', label: 'العربية' },
  { code: 'hi-IN', label: 'हिन्दी' },
  { code: 'he-IL', label: 'עברית' },
];

export function ClarityChatPage() {
  // Session state
  const [view, setView] = useState<ViewState>('start');
  const [name, setName] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [session, setSession] = useState<ClaritySession | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isCreator, setIsCreator] = useState(false);

  // Chat state
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [verifications, setVerifications] = useState<Map<string, Verification[]>>(new Map());
  const [messageInput, setMessageInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Language selection for speech recognition
  const [speechLang, setSpeechLang] = useState('en-US');
  const [showLangPicker, setShowLangPicker] = useState(false);

  // Message input recording state (separate from paraphrase recording)
  const [isRecordingMessage, setIsRecordingMessage] = useState(false);
  const [messageRecordingSeconds, setMessageRecordingSeconds] = useState(0);
  const messageMediaRecorderRef = useRef<MediaRecorder | null>(null);
  const messageRecordingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Paraphrase flow state
  const [paraphrasingMessageId, setParaphrasingMessageId] = useState<string | null>(null);
  const [paraphraseInput, setParaphraseInput] = useState('');
  const [selfRating, setSelfRating] = useState<number | null>(null); // null = not yet selected
  const [ratingVerificationId, setRatingVerificationId] = useState<string | null>(null);
  const [rating, setRating] = useState(50);
  const [correctionInput, setCorrectionInput] = useState(''); // Author's correction feedback

  // Audio recording state
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Live transcription (speech-to-text while recording) - uses selected language
  const {
    transcript: liveTranscript,
    interimTranscript,
    isListening: isTranscribing,
    isSupported: speechSupported,
    startListening,
    stopListening,
    resetTranscript,
  } = useSpeechToText(speechLang);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, verifications]);

  // Cleanup audio URL on unmount or when new recording starts
  useEffect(() => {
    return () => {
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    };
  }, [audioUrl]);

  // Cleanup recording intervals on unmount
  useEffect(() => {
    return () => {
      if (recordingIntervalRef.current) clearInterval(recordingIntervalRef.current);
      if (messageRecordingIntervalRef.current) clearInterval(messageRecordingIntervalRef.current);
    };
  }, []);

  // Subscribe to session updates
  useEffect(() => {
    if (!session) return;

    const unsubscribe = subscribeToClaritySession(session.id, (updatedSession) => {
      console.log('Session updated:', updatedSession);
      setSession(updatedSession);

      // When joiner joins, move to chat view
      if (updatedSession.joinerName && view === 'waiting') {
        setView('chat');
      }
    });

    return () => unsubscribe();
  }, [session?.id, view]);

  // Load initial messages and subscribe
  useEffect(() => {
    if (!session || view !== 'chat') return;

    // Load existing messages
    getChatMessages(session.id).then(setMessages);

    // Load existing verifications
    getVerificationsForSession(session.id).then(setVerifications);

    // Subscribe to new messages
    const unsubMessages = subscribeToChatMessages(session.id, (newMessage) => {
      setMessages((prev) => [...prev, newMessage]);
    });

    // Subscribe to message updates (for explanation requests)
    const unsubMessageUpdates = subscribeToChatMessageUpdates(session.id, (updatedMessage) => {
      setMessages((prev) =>
        prev.map((m) => (m.id === updatedMessage.id ? updatedMessage : m))
      );
    });

    // Subscribe to verification updates
    const unsubVerifications = subscribeToVerifications(session.id, (verification, event) => {
      setVerifications((prev) => {
        const newMap = new Map(prev);
        const existing = newMap.get(verification.messageId) || [];

        if (event === 'INSERT') {
          newMap.set(verification.messageId, [...existing, verification]);
        } else {
          // UPDATE - replace the verification
          const updated = existing.map((v) => (v.id === verification.id ? verification : v));
          newMap.set(verification.messageId, updated);
        }

        return newMap;
      });

      // Position selection is now inline on messages - no need to set positionVerificationId
      // (Position buttons appear directly under the message after verification is accepted)
    });

    return () => {
      unsubMessages();
      unsubMessageUpdates();
      unsubVerifications();
    };
  }, [session?.id, view, name]);

  // Create session handler
  const handleCreate = async () => {
    if (!name.trim()) {
      setError('Please enter your name');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const newSession = await createClaritySession(name.trim());
      setSession(newSession);
      setIsCreator(true);
      setView('waiting');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create chat');
    } finally {
      setIsLoading(false);
    }
  };

  // Join session handler
  const handleJoin = async () => {
    if (!name.trim()) {
      setError('Please enter your name');
      return;
    }
    const normalizedCode = roomCode.trim().toUpperCase();
    if (!normalizedCode) {
      setError('Please enter the room code');
      return;
    }
    if (normalizedCode.length !== 6 || !/^[A-Z0-9]+$/.test(normalizedCode)) {
      setError('Room code must be 6 characters (letters and numbers only)');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const joinedSession = await joinClaritySession(roomCode.trim(), name.trim());
      if (!joinedSession) {
        setError('Chat not found or already full');
        return;
      }
      setSession(joinedSession);
      setIsCreator(false);
      setView('chat');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to join chat');
    } finally {
      setIsLoading(false);
    }
  };

  // Send message handler
  const handleSendMessage = async () => {
    if (!session || !messageInput.trim()) return;

    const content = messageInput.trim();
    setMessageInput('');

    try {
      await sendChatMessage(session.id, name, content);
    } catch (err) {
      console.error('Failed to send message:', err);
      setMessageInput(content); // Restore on error
    }
  };

  // Start paraphrasing a message
  const handleStartParaphrase = (messageId: string) => {
    setParaphrasingMessageId(messageId);
    setParaphraseInput('');
    setSelfRating(null); // Reset to unset state
    setAudioBlob(null);
    setAudioUrl(null);
    setRecordingSeconds(0);
    resetTranscript(); // Clear any previous transcription
  };

  // Audio recording handlers (with live transcription)
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        setAudioBlob(blob);
        setAudioUrl(URL.createObjectURL(blob));
        stream.getTracks().forEach(track => track.stop());
        // Stop transcription when recording stops
        if (isTranscribing) {
          stopListening();
        }
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingSeconds(0);

      // Start live transcription if supported
      if (speechSupported) {
        resetTranscript();
        startListening();
      }

      // Timer for recording duration
      recordingIntervalRef.current = setInterval(() => {
        setRecordingSeconds(prev => {
          if (prev >= MAX_RECORDING_SECONDS - 1) {
            stopRecording();
            return MAX_RECORDING_SECONDS;
          }
          return prev + 1;
        });
      }, 1000);
    } catch (err) {
      console.error('Failed to start recording:', err);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      // Copy transcript to input BEFORE stopping (while we still have the values)
      const finalText = liveTranscript + (interimTranscript ? ' ' + interimTranscript : '');
      if (finalText.trim()) {
        setParaphraseInput(finalText.trim());
      }

      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (recordingIntervalRef.current) {
        clearInterval(recordingIntervalRef.current);
        recordingIntervalRef.current = null;
      }
      // Stop transcription
      if (isTranscribing) {
        stopListening();
      }
    }
  };

  const playAudio = () => {
    if (audioUrl && audioRef.current) {
      audioRef.current.play();
      setIsPlaying(true);
    }
  };

  const pauseAudio = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      setIsPlaying(false);
    }
  };

  // Message input recording (for sending messages via voice)
  const startMessageRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      messageMediaRecorderRef.current = mediaRecorder;

      mediaRecorder.onstop = () => {
        stream.getTracks().forEach(track => track.stop());
        // Transcription copy is handled in stopMessageRecording
      };

      mediaRecorder.start();
      setIsRecordingMessage(true);
      setMessageRecordingSeconds(0);

      // Start live transcription if supported
      if (speechSupported) {
        resetTranscript();
        startListening();
      }

      // Timer for recording duration
      messageRecordingIntervalRef.current = setInterval(() => {
        setMessageRecordingSeconds(prev => {
          if (prev >= MAX_RECORDING_SECONDS - 1) {
            stopMessageRecording();
            return MAX_RECORDING_SECONDS;
          }
          return prev + 1;
        });
      }, 1000);
    } catch (err) {
      console.error('Failed to start message recording:', err);
    }
  };

  const stopMessageRecording = () => {
    if (messageMediaRecorderRef.current && isRecordingMessage) {
      // Copy transcript to message input BEFORE stopping
      const finalText = liveTranscript + (interimTranscript ? ' ' + interimTranscript : '');
      if (finalText.trim()) {
        setMessageInput(finalText.trim());
      }

      messageMediaRecorderRef.current.stop();
      setIsRecordingMessage(false);
      if (messageRecordingIntervalRef.current) {
        clearInterval(messageRecordingIntervalRef.current);
        messageRecordingIntervalRef.current = null;
      }
      // Stop transcription
      if (isTranscribing) {
        stopListening();
      }
    }
  };

  // Submit paraphrase (with self-rating, audio is stored separately)
  const handleSubmitParaphrase = async () => {
    if (!paraphrasingMessageId || !paraphraseInput.trim() || selfRating === null) return;

    try {
      // TODO: Upload audio to Supabase Storage and get URL
      // For now, we just submit text + self-rating
      await createVerification(paraphrasingMessageId, name, paraphraseInput.trim(), selfRating);
      setParaphrasingMessageId(null);
      setParaphraseInput('');
      setSelfRating(null);
      setAudioBlob(null);
      setAudioUrl(null);
    } catch (err) {
      console.error('Failed to submit paraphrase:', err);
    }
  };

  // Rate a paraphrase (as message author)
  // If not accepting, can provide correction for retry
  const handleRate = async (accept: boolean) => {
    if (!ratingVerificationId) return;

    try {
      // Pass correction text only if not accepting and there is text
      const correction = !accept && correctionInput.trim() ? correctionInput.trim() : undefined;
      await rateVerification(ratingVerificationId, rating, accept, correction);
      setRatingVerificationId(null);
      setRating(50);
      setCorrectionInput('');
    } catch (err) {
      console.error('Failed to rate:', err);
    }
  };

  // Find pending verification for a message that I need to rate (as author)
  const findPendingRating = useCallback(
    (messageId: string): Verification | undefined => {
      const messageVerifications = verifications.get(messageId) || [];
      return messageVerifications.find(
        (v) => v.status === 'pending' && v.accuracyRating === undefined
      );
    },
    [verifications]
  );

  // START VIEW
  if (view === 'start') {
    const isJoinMode = roomCode.trim().length > 0;

    return (
      <div className="container mx-auto px-4 py-8 md:py-12 max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-serif font-bold mb-2">Clarity Chat</h1>
          <p className="text-muted-foreground">
            Verify understanding before reacting.
          </p>
        </div>

        <div className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="name">Your Name</Label>
            <Input
              id="name"
              placeholder="Enter your name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="space-y-4 pt-4">
            {!isJoinMode && (
              <Button
                onClick={handleCreate}
                disabled={isLoading || !name.trim()}
                className="w-full"
                size="lg"
              >
                {isLoading ? 'Creating...' : 'Start New Chat'}
              </Button>
            )}

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-background px-2 text-muted-foreground">
                  {isJoinMode ? 'Join chat' : 'Or join existing'}
                </span>
              </div>
            </div>

            <div className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="code">Room Code</Label>
                <Input
                  id="code"
                  placeholder="Enter 6-letter code"
                  value={roomCode}
                  onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                  maxLength={6}
                  className="text-center font-mono text-lg"
                />
              </div>
              <Button
                onClick={handleJoin}
                disabled={isLoading || !name.trim() || !roomCode.trim()}
                variant={isJoinMode ? 'default' : 'outline'}
                className="w-full"
                size="lg"
              >
                {isLoading ? 'Joining...' : 'Join Chat'}
              </Button>
            </div>

            {isJoinMode && (
              <Button
                onClick={() => setRoomCode('')}
                variant="ghost"
                className="w-full text-muted-foreground"
                size="sm"
              >
                Or create a new chat instead
              </Button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // WAITING VIEW
  if (view === 'waiting' && session) {
    return (
      <div className="container mx-auto px-4 py-8 md:py-12 max-w-md">
        <div className="text-center space-y-6">
          <h1 className="text-2xl font-serif font-bold">Waiting for Partner</h1>

          <div className="p-6 bg-muted rounded-lg">
            <p className="text-sm text-muted-foreground mb-2">Share this code:</p>
            <p className="text-4xl font-mono font-bold tracking-widest">{session.code}</p>
          </div>

          <p className="text-muted-foreground">
            Ask someone to enter this code to join your chat.
          </p>

          <div className="animate-pulse text-sm text-muted-foreground">
            Waiting...
          </div>
        </div>
      </div>
    );
  }

  // CHAT VIEW
  if (view === 'chat' && session) {
    const partnerName = isCreator ? session.joinerName : session.creatorName;
    const hasMessages = messages.length > 0;

    return (
      <div className="flex flex-col h-[calc(100vh-4rem)] max-w-2xl mx-auto">
        {/* Header - always visible to show human-to-human context */}
        <div className="flex items-center justify-between p-4 border-b">
          <div>
            <h1 className="font-semibold flex items-center gap-2">
              <span className="text-lg">You</span>
              <span className="text-muted-foreground font-normal text-sm">&</span>
              <span className="text-lg">{partnerName}</span>
            </h1>
          </div>
        </div>

        {/* Messages area */}
        <div className={`flex-1 overflow-y-auto p-4 ${!hasMessages ? 'flex flex-col items-center justify-center' : 'space-y-4'}`}>
          {/* GPT-style empty state */}
          {!hasMessages && (
            <div className="text-center max-w-md mx-auto">
              <h2 className="text-2xl font-medium text-foreground mb-2">
                What's on your mind?
              </h2>
              <p className="text-muted-foreground mb-8">
                Share an idea with {partnerName}. They'll explain it back to make sure they understand.
              </p>
              <div className="flex flex-wrap justify-center gap-2 text-sm">
                <button
                  onClick={() => setMessageInput("I've been thinking about...")}
                  className="px-3 py-1.5 rounded-full border border-border hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                >
                  Share a thought
                </button>
                <button
                  onClick={() => setMessageInput("What do you think about...")}
                  className="px-3 py-1.5 rounded-full border border-border hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                >
                  Ask a question
                </button>
                <button
                  onClick={() => setMessageInput("I want to understand your view on...")}
                  className="px-3 py-1.5 rounded-full border border-border hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                >
                  Explore a topic
                </button>
              </div>
            </div>
          )}

          {messages.map((message) => {
            const isOwn = message.authorName === name;
            const canParaphrase = !isOwn; // Any message can be paraphrased
            const messageVerifications = verifications.get(message.id) || [];
            const pendingRating = isOwn ? findPendingRating(message.id) : undefined;
            const acceptedVerification = messageVerifications.find(v => v.status === 'accepted');
            // Check if current user already verified this message
            const myVerification = messageVerifications.find(v => v.verifierName === name);
            // Check if user needs to retry (has needs_retry status)
            const myNeedsRetry = messageVerifications.find(
              v => v.verifierName === name && v.status === 'needs_retry'
            );
            // Check if user has a pending verification awaiting rating
            const myPendingVerification = messageVerifications.find(
              v => v.verifierName === name && v.status === 'pending'
            );
            // Get all previous corrections for this verifier (to show context)
            const myPreviousAttempts = messageVerifications.filter(
              v => v.verifierName === name && v.correctionText
            );

            return (
              <div key={message.id} className={`group flex flex-col ${isOwn ? 'items-end' : 'items-start'}`}>
                {/* Message bubble */}
                <div
                  className={`max-w-[80%] rounded-2xl px-4 py-2.5 ${
                    isOwn ? 'bg-primary text-primary-foreground' : 'bg-muted'
                  }`}
                >
                  <p className="whitespace-pre-wrap break-words">{message.content}</p>
                </div>

                {/* Prominent "Explain back" button for partner's messages - CORE FEATURE */}
                {/* Also shows nudge if the speaker has requested explanation */}
                {canParaphrase && !acceptedVerification && !myVerification && !myNeedsRetry && paraphrasingMessageId !== message.id && (
                  <button
                    onClick={() => handleStartParaphrase(message.id)}
                    className={`mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-full border transition-all ${
                      message.explanationRequestedAt
                        ? 'font-semibold border-blue-500 bg-blue-500 text-white hover:bg-blue-600 shadow-sm'
                        : 'font-medium border-transparent text-muted-foreground hover:text-blue-700 hover:bg-blue-50 hover:border-blue-200'
                    }`}
                  >
                    <Undo2 className="h-3.5 w-3.5" />
                    {message.explanationRequestedAt ? `${message.authorName} asked you to reflect back` : 'Reflect back'}
                  </button>
                )}

                {/* "Ask to explain back" button for own messages (speaker side) */}
                {isOwn && !acceptedVerification && messageVerifications.length === 0 && (
                  message.explanationRequestedAt ? (
                    <div className="mt-2 flex items-center gap-2">
                      <span className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs text-muted-foreground bg-muted/50 rounded-full border">
                        <Clock className="h-3 w-3" />
                        Waiting for {partnerName} to reflect back...
                      </span>
                      <button
                        onClick={async () => {
                          if (!session) return;
                          try {
                            await cancelExplanationRequest(message.id, name);
                          } catch (err) {
                            console.error('Failed to cancel request:', err);
                          }
                        }}
                        className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                        title="Cancel request"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={async () => {
                        if (!session) return;
                        try {
                          await requestExplanation(message.id, session.id, name);
                        } catch (err) {
                          console.error('Failed to request explanation:', err);
                          // If column doesn't exist, the migration hasn't been run
                          alert('This feature requires a database update. Please run the migration.');
                        }
                      }}
                      className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-600 hover:text-blue-700 bg-transparent hover:bg-blue-50 rounded-full border border-blue-200/50 hover:border-blue-300 transition-all"
                    >
                      <MessageCircle className="h-3.5 w-3.5" />
                      Ask {partnerName} to reflect back
                    </button>
                  )
                )}

                {/* Verification Thread - aligned with message (right for own, left for others) */}
                {messageVerifications.length > 0 && (
                  <div className={`w-full max-w-[85%] ${isOwn ? 'self-end' : 'self-start'}`}>
                    <VerificationThread
                      verifications={messageVerifications}
                      currentUserName={name}
                      messageAuthorName={message.authorName}
                      hasPendingAction={!!pendingRating} // Hide when author has pending rating to avoid duplication
                    />

                    {/* Position buttons (for verifier who hasn't set position yet, after acceptance) */}
                    {acceptedVerification && acceptedVerification.verifierName === name && !acceptedVerification.position && (
                      <div className={`mt-3 flex items-center gap-2 ${isOwn ? 'justify-end mr-5' : 'ml-5'}`}>
                        <span className="text-xs text-muted-foreground">Your position:</span>
                        <div className="flex gap-1">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-6 px-2 text-xs"
                            onClick={() => {
                              setVerificationPosition(acceptedVerification.id, 'agree');
                            }}
                          >
                            <ThumbsUp className="h-3 w-3 mr-1" />
                            Agree
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-6 px-2 text-xs"
                            onClick={() => {
                              setVerificationPosition(acceptedVerification.id, 'disagree');
                            }}
                          >
                            <ThumbsDown className="h-3 w-3 mr-1" />
                            Disagree
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-6 px-2 text-xs"
                            onClick={() => {
                              setVerificationPosition(acceptedVerification.id, 'dont_know');
                            }}
                          >
                            <HelpCircle className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    )}

                    {/* Try Again button (for verifier when needs_retry, no pending attempt, and not currently editing) */}
                    {myNeedsRetry && !myPendingVerification && paraphrasingMessageId !== message.id && (() => {
                      // Find the highest round number among all my attempts
                      const myAttempts = messageVerifications.filter(v => v.verifierName === name);
                      const maxRound = Math.max(...myAttempts.map(v => v.roundNumber || 1));
                      return (
                        <div className={`mt-3 ${isOwn ? 'mr-5 text-right' : 'ml-5'}`}>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleStartParaphrase(message.id)}
                          >
                            <MessageCircle className="h-3 w-3 mr-1" />
                            Try again (attempt {maxRound + 1})
                          </Button>
                        </div>
                      );
                    })()}
                  </div>
                )}


                {/* Verify Understanding input (inline) */}
                {paraphrasingMessageId === message.id && (
                  <div className="mt-2 w-full max-w-[80%] self-start space-y-3 p-3 bg-muted/50 rounded-lg border">
                    <p className="text-xs font-medium">
                      {myPreviousAttempts.length > 0
                        ? `Attempt ${myPreviousAttempts.length + 1}: Explain back what you think ${message.authorName} meant`
                        : `Explain back what you think ${message.authorName} meant:`}
                    </p>

                    {/* Text input with mic button */}
                    <div className="relative">
                      <Textarea
                        value={isRecording ? (liveTranscript + (interimTranscript ? ' ' + interimTranscript : '')) : paraphraseInput}
                        onChange={(e) => !isRecording && setParaphraseInput(e.target.value)}
                        placeholder={isRecording ? 'Listening...' : 'In your own words (1-3 sentences)...'}
                        className={`min-h-[80px] pr-12 ${isRecording ? 'bg-muted border-primary' : ''}`}
                        disabled={isRecording}
                      />
                      {/* Mic button inside textarea */}
                      {!audioBlob && (
                        <Button
                          size="icon"
                          variant={isRecording ? 'destructive' : 'ghost'}
                          className="absolute right-2 bottom-2 h-8 w-8"
                          onClick={isRecording ? stopRecording : startRecording}
                        >
                          {isRecording ? <Square className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                        </Button>
                      )}
                    </div>

                    {/* Recording status */}
                    {isRecording && (
                      <div className="flex items-center gap-2 text-sm">
                        <span className="text-red-500 animate-pulse">●</span>
                        <span className="text-muted-foreground">Recording ({MAX_RECORDING_SECONDS - recordingSeconds}s left)</span>
                      </div>
                    )}

                    {/* Audio playback (after recording) */}
                    {audioBlob && (
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={isPlaying ? pauseAudio : playAudio}
                        >
                          {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                        </Button>
                        <span className="text-sm text-muted-foreground">{recordingSeconds}s recorded</span>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setAudioBlob(null);
                            setAudioUrl(null);
                            setRecordingSeconds(0);
                          }}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                        <audio
                          ref={audioRef}
                          src={audioUrl || undefined}
                          onEnded={() => setIsPlaying(false)}
                          className="hidden"
                        />
                      </div>
                    )}

                    {/* Self-rating slider */}
                    <div className={`space-y-2 p-2 rounded-lg transition-all ${selfRating === null ? 'bg-blue-50 border border-blue-200 ring-1 ring-blue-300/50' : 'bg-transparent'}`}>
                      <div className="flex justify-between text-sm">
                        <span className={selfRating === null ? 'text-blue-700 font-medium' : 'text-muted-foreground'}>
                          How well did you capture {message.authorName}'s meaning?
                        </span>
                        <span className={`font-medium ${selfRating === null ? 'text-blue-600' : ''}`}>
                          {selfRating === null ? '5/10' : `${selfRating / 10}/10`}
                        </span>
                      </div>
                      <div className="relative">
                        <Slider
                          value={selfRating === null ? [50] : [selfRating]}
                          onValueChange={([v]) => setSelfRating(v)}
                          min={0}
                          max={100}
                          step={10}
                          className={selfRating === null ? 'opacity-70' : ''}
                        />
                        <div className="flex justify-between text-xs text-muted-foreground mt-1">
                          <span>0</span>
                          <span>10 = Full understanding</span>
                        </div>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-2 items-center">
                      <Button
                        size="sm"
                        onClick={handleSubmitParaphrase}
                        disabled={!paraphraseInput.trim() || selfRating === null}
                      >
                        Ask for feedback
                      </Button>
                      <button
                        type="button"
                        className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                        onClick={() => {
                          setParaphrasingMessageId(null);
                          setAudioBlob(null);
                          setAudioUrl(null);
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {/* Rating UI (for own messages with pending paraphrase) - aligned with message */}
                {pendingRating && ratingVerificationId !== pendingRating.id && (
                  <div className={`mt-2 p-3 bg-blue-50 rounded-lg max-w-[80%] border-l-2 border-l-blue-400 border border-blue-200`}>
                    <p className="text-sm font-medium mb-2 text-blue-900">
                      {pendingRating.verifierName}'s understanding:
                    </p>
                    <p className="text-sm text-blue-700/80 italic mb-3">"{pendingRating.paraphraseText}"</p>
                    <button
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-full border border-blue-300 bg-blue-100 text-blue-800 hover:bg-blue-200 transition-all"
                      onClick={() => {
                        setRatingVerificationId(pendingRating.id);
                        setRating(70); // Start at 70% as more realistic default
                      }}
                    >
                      Did {pendingRating.verifierName} get it right?
                    </button>
                  </div>
                )}

                {/* Rating slider (when rating) - aligned with message */}
                {/* UX IMPROVEMENTS: Better slider with tick marks, clearer button labels, progressive disclosure */}
                {ratingVerificationId && pendingRating?.id === ratingVerificationId && (
                  <div className="mt-2 p-4 bg-background rounded-xl max-w-[85%] space-y-4 border shadow-sm">
                    {/* Header with attempt number */}
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium">
                        Rate {pendingRating.verifierName}'s understanding
                      </p>
                      {pendingRating.roundNumber > 1 && (
                        <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">
                          Try #{pendingRating.roundNumber}
                        </span>
                      )}
                    </div>

                    {/* Their paraphrase - better visual treatment */}
                    <div className="p-3 bg-muted/50 rounded-lg border-l-2 border-primary/30">
                      <p className="text-sm text-muted-foreground italic">"{pendingRating.paraphraseText}"</p>
                    </div>

                    {/* Prediction context ABOVE slider - gives context before rating */}
                    {pendingRating.selfRating !== undefined && (
                      <div className="text-sm text-muted-foreground">
                        {pendingRating.verifierName} predicted: <span className="font-medium text-foreground">{pendingRating.selfRating / 10}/10</span>
                      </div>
                    )}

                    {/* Rating slider - KISS: 0-10 scale (more intuitive than %) */}
                    <div className="space-y-2">
                      {/* Current rating display */}
                      <div className="text-center">
                        <span className="text-2xl font-bold text-blue-600">{rating / 10}/10</span>
                      </div>

                      {/* Simple slider */}
                      <Slider
                        value={[rating]}
                        onValueChange={([v]) => setRating(v)}
                        min={0}
                        max={100}
                        step={10}
                      />

                      {/* Minimal labels - endpoints with explanation at 10 */}
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>0</span>
                        <span>10 = full understanding</span>
                      </div>
                    </div>

                    {/* Correction input - always visible but optional, fixed height */}
                    <div className="space-y-2">
                      <Textarea
                        value={correctionInput}
                        onChange={(e) => setCorrectionInput(e.target.value)}
                        placeholder="Add a note (optional)"
                        className="min-h-[60px] text-sm resize-none"
                      />
                    </div>

                    {/* Action buttons - Design System: blue primary, green only for 100% success */}
                    <div className="flex flex-wrap gap-2 pt-2 border-t">
                      {rating === 100 ? (
                        /* 100% = Accept is primary */
                        <Button
                          size="sm"
                          onClick={() => handleRate(true)}
                          className="bg-blue-500 hover:bg-blue-600 text-white"
                        >
                          <CheckCircle2 className="h-4 w-4 mr-1" />
                          Perfect!
                        </Button>
                      ) : (
                        /* <100% = Retry is primary (blue), Accept is secondary */
                        <>
                          <Button
                            size="sm"
                            onClick={() => handleRate(false)}
                            className="bg-blue-500 hover:bg-blue-600 text-white"
                          >
                            <RotateCcw className="h-4 w-4 mr-1" />
                            Ask to clarify
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleRate(true)}
                            className="border-blue-200 text-blue-700 hover:bg-blue-50"
                          >
                            <CheckCircle2 className="h-4 w-4 mr-1" />
                            Close enough
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          <div ref={messagesEndRef} />
        </div>

        {/* Position modal removed - inline position buttons now appear directly on messages */}

        {/* GPT-style pill input */}
        <div className={`p-4 ${!hasMessages ? '' : 'border-t'}`}>
          <div className="relative flex items-end gap-0 bg-muted/50 border border-border rounded-3xl px-4 py-2 focus-within:border-primary/50 focus-within:ring-1 focus-within:ring-primary/20 transition-all">
            {/* Textarea */}
            <Textarea
              value={isRecordingMessage
                ? (liveTranscript + (interimTranscript ? ' ' + interimTranscript : '')).trim() || ''
                : messageInput}
              onChange={(e) => {
                if (!isRecordingMessage) {
                  setMessageInput(e.target.value);
                  // Auto-resize
                  e.target.style.height = 'auto';
                  e.target.style.height = Math.min(e.target.scrollHeight, 150) + 'px';
                }
              }}
              placeholder={isRecordingMessage
                ? `Listening... (${MAX_RECORDING_SECONDS - messageRecordingSeconds}s)`
                : 'Share your thought...'}
              disabled={isRecordingMessage}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && !isRecordingMessage) {
                  e.preventDefault();
                  handleSendMessage();
                  e.currentTarget.style.height = 'auto';
                }
              }}
              rows={1}
              className={`flex-1 min-h-[24px] max-h-[150px] resize-none overflow-y-auto border-0 bg-transparent shadow-none focus-visible:ring-0 px-0 py-0 text-base placeholder:text-muted-foreground/70 ${isRecordingMessage ? 'text-red-600' : ''}`}
            />

            {/* Right side buttons */}
            <div className="flex-shrink-0 flex items-center gap-1 ml-2">
              {/* Language picker */}
              <div className="relative">
                <button
                  className="p-1.5 rounded-full hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                  onClick={() => setShowLangPicker(!showLangPicker)}
                  title={SUPPORTED_LANGUAGES.find(l => l.code === speechLang)?.label}
                >
                  <Globe className="h-4 w-4" />
                </button>
                {showLangPicker && (
                  <div className="absolute bottom-full right-0 mb-2 bg-background border rounded-xl shadow-lg p-1 min-w-[130px] max-h-[200px] overflow-y-auto z-50">
                    {SUPPORTED_LANGUAGES.map((lang) => (
                      <button
                        key={lang.code}
                        className={`block w-full text-left px-3 py-1.5 text-sm rounded-lg hover:bg-muted transition-colors ${
                          speechLang === lang.code ? 'bg-muted font-medium' : ''
                        }`}
                        onClick={() => {
                          setSpeechLang(lang.code);
                          setShowLangPicker(false);
                        }}
                      >
                        {lang.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Mic button */}
              <button
                className={`p-1.5 rounded-full transition-colors ${
                  isRecordingMessage
                    ? 'bg-red-100 text-red-600 hover:bg-red-200'
                    : 'hover:bg-muted text-muted-foreground hover:text-foreground'
                }`}
                onClick={isRecordingMessage ? stopMessageRecording : startMessageRecording}
                disabled={isRecording}
                title={isRecordingMessage ? 'Stop recording' : 'Voice input'}
              >
                {isRecordingMessage ? <Square className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
              </button>

              {/* Send button - circular, prominent when has content */}
              <button
                onClick={handleSendMessage}
                disabled={(!messageInput.trim() && !isRecordingMessage) || isRecordingMessage}
                className={`p-2 rounded-full transition-all ${
                  messageInput.trim() && !isRecordingMessage
                    ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                    : 'bg-muted text-muted-foreground cursor-not-allowed'
                }`}
                title="Send message"
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Subtle footer text */}
          {!hasMessages && (
            <p className="text-xs text-muted-foreground/60 text-center mt-3">
              Clarity Chat helps you understand each other better
            </p>
          )}
        </div>
      </div>
    );
  }

  return null;
}
