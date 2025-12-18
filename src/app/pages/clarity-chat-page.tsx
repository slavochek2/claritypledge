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
  createVerification,
  getVerificationsForSession,
  subscribeToVerifications,
  rateVerification,
  setVerificationPosition,
  type ClaritySession,
  type ChatMessage,
  type Verification,
  type ChatPosition,
} from '@/app/data/api';
import { useSpeechToText } from '@/hooks/useSpeechToText';
import { Send, MessageSquare, CheckCircle2, ThumbsUp, ThumbsDown, HelpCircle, X, Mic, Square, Play, Pause, Globe, ChevronDown, ChevronUp, MessageCircle } from 'lucide-react';

type ViewState = 'start' | 'waiting' | 'chat';

// Max audio recording duration (60 seconds)
const MAX_RECORDING_SECONDS = 60;

// Expandable verification/paraphrase log component
function VerificationLog({ verifications, isOwn }: { verifications: Verification[]; isOwn: boolean }) {
  const [isExpanded, setIsExpanded] = useState(false);

  if (verifications.length === 0) return null;

  return (
    <div className="w-full">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        {verifications.length} paraphrase{verifications.length !== 1 ? 's' : ''}
      </button>

      {isExpanded && (
        <div className="mt-2 space-y-2 p-2 bg-muted/30 rounded-lg border text-xs">
          {verifications.map((v) => (
            <div key={v.id} className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="font-medium">{v.verifierName}</span>
                {v.status === 'accepted' && (
                  <span className="text-green-600">
                    <CheckCircle2 className="h-3 w-3 inline" /> Accepted
                  </span>
                )}
                {v.status === 'pending' && (
                  <span className="text-amber-600">Pending</span>
                )}
                {v.accuracyRating !== undefined && (
                  <span className="text-muted-foreground">
                    {v.accuracyRating}% accuracy
                  </span>
                )}
                {v.selfRating !== undefined && v.accuracyRating !== undefined && (
                  <span className={`${
                    (v.accuracyRating - v.selfRating) > 10 ? 'text-green-600' :
                    (v.accuracyRating - v.selfRating) < -10 ? 'text-red-600' :
                    'text-muted-foreground'
                  }`}>
                    (gap: {v.accuracyRating - v.selfRating > 0 ? '+' : ''}{v.accuracyRating - v.selfRating})
                  </span>
                )}
              </div>
              <p className="text-muted-foreground italic">"{v.paraphraseText}"</p>
              {v.position && (
                <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] ${
                  v.position === 'agree' ? 'bg-green-100 text-green-700' :
                  v.position === 'disagree' ? 'bg-red-100 text-red-700' :
                  'bg-gray-100 text-gray-600'
                }`}>
                  {v.position === 'agree' && <ThumbsUp className="h-2.5 w-2.5" />}
                  {v.position === 'disagree' && <ThumbsDown className="h-2.5 w-2.5" />}
                  {v.position === 'dont_know' && <HelpCircle className="h-2.5 w-2.5" />}
                  {v.position.replace('_', ' ')}
                </span>
              )}
            </div>
          ))}
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
  const [selfRating, setSelfRating] = useState(50); // Verifier's self-assessment
  const [ratingVerificationId, setRatingVerificationId] = useState<string | null>(null);
  const [rating, setRating] = useState(50);
  const [positionVerificationId, setPositionVerificationId] = useState<string | null>(null);

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
    setSelfRating(50);
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
    if (!paraphrasingMessageId || !paraphraseInput.trim()) return;

    try {
      // TODO: Upload audio to Supabase Storage and get URL
      // For now, we just submit text + self-rating
      await createVerification(paraphrasingMessageId, name, paraphraseInput.trim(), selfRating);
      setParaphrasingMessageId(null);
      setParaphraseInput('');
      setSelfRating(50);
      setAudioBlob(null);
      setAudioUrl(null);
    } catch (err) {
      console.error('Failed to submit paraphrase:', err);
    }
  };

  // Rate a paraphrase (as message author)
  const handleRate = async (accept: boolean) => {
    if (!ratingVerificationId) return;

    try {
      await rateVerification(ratingVerificationId, rating, accept);
      setRatingVerificationId(null);
      setRating(50);
    } catch (err) {
      console.error('Failed to rate:', err);
    }
  };

  // Set position (as verifier, after acceptance)
  const handleSetPosition = async (position: ChatPosition) => {
    if (!positionVerificationId) return;

    try {
      await setVerificationPosition(positionVerificationId, position);
      setPositionVerificationId(null);
    } catch (err) {
      console.error('Failed to set position:', err);
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

    return (
      <div className="flex flex-col h-[calc(100vh-4rem)] max-w-2xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <div>
            <h1 className="font-semibold">Clarity Chat</h1>
            <p className="text-sm text-muted-foreground">
              with {partnerName}
            </p>
          </div>
          <div className="text-xs text-muted-foreground font-mono">
            {session.code}
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.length === 0 && (
            <div className="text-center text-muted-foreground py-8">
              <MessageSquare className="h-12 w-12 mx-auto mb-2 opacity-50" />
              <p>No messages yet. Share an idea!</p>
            </div>
          )}

          {messages.map((message) => {
            const isOwn = message.authorName === name;
            const canParaphrase = !isOwn; // Any message can be paraphrased
            const messageVerifications = verifications.get(message.id) || [];
            const latestVerification = messageVerifications[messageVerifications.length - 1];
            const pendingRating = isOwn ? findPendingRating(message.id) : undefined;
            const acceptedVerification = messageVerifications.find(v => v.status === 'accepted');
            // Check if current user already verified this message
            const myVerification = messageVerifications.find(v => v.verifierName === name);

            return (
              <div key={message.id} className={`flex flex-col ${isOwn ? 'items-end' : 'items-start'}`}>
                {/* Message bubble */}
                <div
                  className={`max-w-[80%] rounded-lg p-3 ${
                    isOwn ? 'bg-primary text-primary-foreground' : 'bg-muted'
                  }`}
                >
                  <p className="text-xs font-medium mb-1 opacity-70">{message.authorName}</p>
                  <p className="whitespace-pre-wrap break-words">{message.content}</p>
                </div>

                {/* Inline position buttons (after verification accepted) */}
                {acceptedVerification && (
                  <div className="mt-2 flex flex-wrap items-center gap-2 max-w-[80%]">
                    {/* Verification badge */}
                    <span className="inline-flex items-center gap-1 text-xs text-green-600">
                      <CheckCircle2 className="h-3 w-3" />
                      Understood
                    </span>

                    {/* Position buttons (for verifier who hasn't set position yet) */}
                    {acceptedVerification.verifierName === name && !acceptedVerification.position && (
                      <>
                        <span className="text-xs text-muted-foreground">Your position:</span>
                        <div className="flex gap-1">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-6 px-2 text-xs bg-green-50 hover:bg-green-100 text-green-700 border-green-200"
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
                            className="h-6 px-2 text-xs bg-red-50 hover:bg-red-100 text-red-700 border-red-200"
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
                      </>
                    )}

                    {/* Show position if already set */}
                    {acceptedVerification.position && (
                      <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${
                        acceptedVerification.position === 'agree' ? 'bg-green-100 text-green-700' :
                        acceptedVerification.position === 'disagree' ? 'bg-red-100 text-red-700' :
                        'bg-gray-100 text-gray-600'
                      }`}>
                        {acceptedVerification.position === 'agree' && <ThumbsUp className="h-3 w-3" />}
                        {acceptedVerification.position === 'disagree' && <ThumbsDown className="h-3 w-3" />}
                        {acceptedVerification.position === 'dont_know' && <HelpCircle className="h-3 w-3" />}
                        {acceptedVerification.verifierName}
                        {acceptedVerification.position === 'agree' && ' agrees'}
                        {acceptedVerification.position === 'disagree' && ' disagrees'}
                        {acceptedVerification.position === 'dont_know' && ' unsure'}
                      </span>
                    )}

                    {/* Expandable paraphrase log */}
                    {messageVerifications.length > 0 && (
                      <VerificationLog verifications={messageVerifications} isOwn={isOwn} />
                    )}
                  </div>
                )}

                {/* Verification pending status */}
                {latestVerification && latestVerification.status === 'pending' && !acceptedVerification && (
                  <div className="mt-1 text-xs text-amber-600">
                    Verification pending...
                  </div>
                )}

                {/* Explain Back button (for partner's messages without accepted verification) */}
                {canParaphrase && !acceptedVerification && !myVerification && paraphrasingMessageId !== message.id && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-2 h-7 text-xs border-blue-200 text-blue-600 hover:bg-blue-50 hover:text-blue-700"
                    onClick={() => handleStartParaphrase(message.id)}
                  >
                    <MessageCircle className="h-3 w-3 mr-1" />
                    Explain Back
                  </Button>
                )}

                {/* Verify Understanding input (inline) */}
                {paraphrasingMessageId === message.id && (
                  <div className="mt-2 w-full max-w-[80%] space-y-3 p-3 bg-muted/50 rounded-lg border">
                    <p className="text-xs text-muted-foreground font-medium">Explain what you understood:</p>

                    {/* Text input with mic button */}
                    <div className="relative">
                      <Textarea
                        value={isRecording ? (liveTranscript + (interimTranscript ? ' ' + interimTranscript : '')) : paraphraseInput}
                        onChange={(e) => !isRecording && setParaphraseInput(e.target.value)}
                        placeholder={isRecording ? 'Listening...' : 'In your own words (1-3 sentences)...'}
                        className={`min-h-[80px] pr-12 ${isRecording ? 'bg-blue-50 border-blue-300' : ''}`}
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
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">How well do you think you understood?</span>
                        <span className="font-medium">{selfRating}%</span>
                      </div>
                      <Slider
                        value={[selfRating]}
                        onValueChange={([v]) => setSelfRating(v)}
                        min={0}
                        max={100}
                        step={10}
                      />
                    </div>

                    {/* Actions */}
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        onClick={handleSubmitParaphrase}
                        disabled={!paraphraseInput.trim()}
                      >
                        Submit Paraphrase
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setParaphrasingMessageId(null);
                          setAudioBlob(null);
                          setAudioUrl(null);
                        }}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}

                {/* Rating UI (for own messages with pending paraphrase) */}
                {pendingRating && ratingVerificationId !== pendingRating.id && (
                  <div className="mt-2 p-3 bg-amber-50 border border-amber-200 rounded-lg max-w-[80%]">
                    <p className="text-sm font-medium text-amber-800 mb-2">
                      {pendingRating.verifierName} paraphrased:
                    </p>
                    <p className="text-sm text-amber-900 mb-3">{pendingRating.paraphraseText}</p>
                    <Button
                      size="sm"
                      onClick={() => {
                        setRatingVerificationId(pendingRating.id);
                        setRating(50);
                      }}
                    >
                      Rate Understanding
                    </Button>
                  </div>
                )}

                {/* Rating slider (when rating) */}
                {ratingVerificationId && pendingRating?.id === ratingVerificationId && (
                  <div className="mt-2 p-3 bg-muted rounded-lg max-w-[80%] space-y-3">
                    <p className="text-sm font-medium">How well did they understand?</p>
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span>Understanding</span>
                        <span className="font-bold">{rating}/100</span>
                      </div>
                      <Slider
                        value={[rating]}
                        onValueChange={([v]) => setRating(v)}
                        min={0}
                        max={100}
                        step={10}
                      />
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => handleRate(true)}>
                        <CheckCircle2 className="h-4 w-4 mr-1" />
                        Accept
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setRatingVerificationId(null)}>
                        <X className="h-4 w-4 mr-1" />
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          <div ref={messagesEndRef} />
        </div>

        {/* Position modal removed - inline position buttons now appear directly on messages */}

        {/* Message input - clean single-line design */}
        <div className="p-4 border-t">
          <div className="flex gap-2 items-center">
            {/* Input field with mic inside */}
            <div className="relative flex-1">
              <Input
                value={isRecordingMessage
                  ? (liveTranscript + (interimTranscript ? ' ' + interimTranscript : '')).trim() || ''
                  : messageInput}
                onChange={(e) => !isRecordingMessage && setMessageInput(e.target.value)}
                placeholder={isRecordingMessage
                  ? `🎤 Listening... (${MAX_RECORDING_SECONDS - messageRecordingSeconds}s)`
                  : 'Share an idea...'}
                disabled={isRecordingMessage}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey && !isRecordingMessage) {
                    e.preventDefault();
                    handleSendMessage();
                  }
                }}
                className={`pr-20 ${isRecordingMessage ? 'bg-red-50 border-red-300 text-red-900' : ''}`}
              />
              {/* Language + Mic buttons inside input */}
              <div className="absolute right-1 top-1/2 -translate-y-1/2 flex gap-1">
                {/* Language picker (small) */}
                <div className="relative">
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7"
                    onClick={() => setShowLangPicker(!showLangPicker)}
                    title={SUPPORTED_LANGUAGES.find(l => l.code === speechLang)?.label}
                  >
                    <Globe className="h-3.5 w-3.5" />
                  </Button>
                  {showLangPicker && (
                    <div className="absolute bottom-full right-0 mb-1 bg-background border rounded-lg shadow-lg p-1 min-w-[120px] max-h-[200px] overflow-y-auto z-50">
                      {SUPPORTED_LANGUAGES.map((lang) => (
                        <button
                          key={lang.code}
                          className={`block w-full text-left px-2 py-1 text-xs rounded hover:bg-muted ${
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
                <Button
                  size="icon"
                  variant={isRecordingMessage ? 'destructive' : 'ghost'}
                  className="h-7 w-7"
                  onClick={isRecordingMessage ? stopMessageRecording : startMessageRecording}
                  disabled={isRecording}
                >
                  {isRecordingMessage ? <Square className="h-3.5 w-3.5" /> : <Mic className="h-3.5 w-3.5" />}
                </Button>
              </div>
            </div>

            {/* Send button */}
            <Button
              onClick={handleSendMessage}
              disabled={(!messageInput.trim() && !isRecordingMessage) || isRecordingMessage}
              size="icon"
              className="h-10 w-10"
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
