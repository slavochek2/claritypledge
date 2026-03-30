/**
 * @file StoryGuideChat.tsx
 * @description P425: Core stateful component for AI-guided story creation.
 * Owns the phase machine, message history, and AI streaming.
 *
 * Phase machine:
 *   idle → brain-dump → streaming → rating → iterating → polish → visibility → saving → saved
 *
 * Controls:
 *   - Ctrl+Enter sends (plain Enter creates newline — brain dump needs multiline)
 *   - Send button disabled when content > 5000 chars or during streaming (textarea stays enabled)
 *   - AbortController cleans up fetch on unmount
 *   - selectedVisibility defaults to 'private' (NOT the DB default of 'public')
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { extractHashtags } from '@/lib/utils';
import { useNavigate } from 'react-router-dom';
import type { StoryVisibility, Story } from '@/app/types';
import { useAuth } from '@/auth';
import { ThreadMessage } from './ThreadMessage';
import { ChatContextHeader } from './ChatContextHeader';
import { DraftCard } from './DraftCard';
import { VisibilityAndSave } from './VisibilityAndSave';
import { SavedStoryChatCard } from './SavedStoryChatCard';
import type { PointProfileOwner } from '@/app/components/social/point-card-with-links';
import type { PositionEntry, Position } from '@/app/components/shared/prototype-types';
import { mockStoryGuideStream } from '@/app/data/story-guide-chat-stub';
import { storiesService } from '@/app/data/stories-service';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { RatingButtons } from '@/app/components/partners/shared';
import { RemovePositionDialog, useRemovePositionGuard } from '@/app/components/shared/remove-position-dialog';

// ---------------------------------------------------------------------------
// Types (local — do NOT import from clarity-chat-page)
// ---------------------------------------------------------------------------

type ChatPhase =
  | 'idle'
  | 'brain-dump'
  | 'streaming'
  | 'rating'
  | 'iterating'
  | 'polish'
  | 'visibility'
  | 'saving'
  | 'saved';

type P425Message = {
  id: string;
  role: 'user' | 'ai';
  content: string;
  isDraftCard?: boolean;
  draftVersion?: number;
  draftStatus?: 'draft' | 'polish';
  changeNote?: string;
  isSavedCard?: boolean;
  savedStoryId?: string;
  savedVisibility?: StoryVisibility;
  /** P467: Rating prompt bubble — renders with inline 0–10 buttons as children. */
  isRatingPrompt?: boolean;
  timestamp: number;
};

export interface StoryDraft {
  storyId: string;
  content: string;
  pointId?: string;
  visibility: StoryVisibility;
}

/** Minimal Point shape for card display — adapted from PointWithUserPosition in the page. */
export interface ContextPoint {
  id: string;
  text: string;
  createdAt: string;
  positions: Record<string, PositionEntry>;
  linkedStoryIds: string[];
}

/** Profile owner shape for the context card header badge. */
export type ContextProfileOwner = PointProfileOwner;

export interface StoryGuideChatProps {
  pointId?: string;
  /** PositionType as string */
  userPosition?: string;
  pointText?: string;
  /** Adapted point for the context card at the top of the chat. */
  contextPoint?: ContextPoint;
  /** Profile owner for the context card position badge. */
  contextProfileOwner?: ContextProfileOwner;
  onStoryConfirmed: (draft: StoryDraft) => void;
  onDismiss?: () => void;
  /** If present, open in edit mode: pre-populate polish phase with existing story content. */
  existingStory?: Story;
  /** P607: Point's visibility — used as default when creating a new story from a point. */
  pointVisibility?: StoryVisibility;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_BRAIN_DUMP_LENGTH = 5000;

// ---------------------------------------------------------------------------
// sessionStorage persistence helpers (P446)
// ---------------------------------------------------------------------------

type PersistedChatState = {
  messages: P425Message[];
  phase: ChatPhase;
  iterationCount: number;
  currentDraftVersion: number;
  polishedContent: string | null;
  selectedVisibility: StoryVisibility;
};

// Phases that are safe to persist. Transient phases (streaming, saving) are excluded
// because restoring into them yields a broken UI with no active fetch or save in flight.
const PERSISTABLE_PHASES = new Set<ChatPhase>(['idle', 'brain-dump', 'rating', 'iterating', 'polish', 'visibility']);

function storageKey(pointId: string | undefined): string | null {
  if (!pointId) return null; // Don't persist across point-less sessions — shared key causes collision
  return `story-chat-${pointId}`;
}

function loadChatState(pointId: string | undefined): PersistedChatState | null {
  const key = storageKey(pointId);
  if (!key) return null;
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as PersistedChatState;
  } catch {
    return null;
  }
}

function saveChatState(pointId: string | undefined, state: PersistedChatState): void {
  const key = storageKey(pointId);
  if (!key) return;
  try {
    sessionStorage.setItem(key, JSON.stringify(state));
  } catch {
    // sessionStorage quota exceeded or unavailable — silently ignore
  }
}

function clearChatState(pointId: string | undefined): void {
  const key = storageKey(pointId);
  if (!key) return;
  try {
    sessionStorage.removeItem(key);
  } catch {
    // ignore
  }
}

const EDGE_FN_URL =
  (import.meta.env.VITE_STORY_GUIDE_EDGE_FN_URL as string | undefined) ??
  `${import.meta.env.VITE_SUPABASE_URL as string}/functions/v1/story-guide-chat`;

const MOCK_AI = import.meta.env.VITE_MOCK_AI === 'true';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getPlaceholder(phase: ChatPhase): string {
  if (phase === 'idle' || phase === 'brain-dump') return "Tell me so I understand you";
  if (phase === 'rating' || phase === 'iterating') return "What's off? Or type 0–10...";
  if (phase === 'streaming') return 'Thinking...';
  return '';
}

function makeId(): string {
  return crypto.randomUUID();
}

/** Strip trailing rating question the AI appends after the draft story text. */
function stripTrailingRatingQuestion(text: string): string {
  return text.replace(/\n*(?:how well does this|on a scale of|rate this)[^\n]*\?[^\n]*$/im, '').trim();
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function StoryGuideChat({
  pointId,
  userPosition,
  pointText,
  contextPoint,
  contextProfileOwner,
  onStoryConfirmed,
  onDismiss: _onDismiss,
  existingStory,
  pointVisibility,
}: StoryGuideChatProps) {
  const { user, session } = useAuth();
  const authorName = user?.name ?? 'You';
  const navigate = useNavigate();

  // Local position state — keeps context card badge + buttons in sync after position changes
  const [localPosition, setLocalPosition] = useState<Position>(
    contextProfileOwner?.position ?? null
  );

  // Sync localPosition when parent re-fetches and passes a new contextProfileOwner
  useEffect(() => {
    setLocalPosition(contextProfileOwner?.position ?? null);
  }, [contextProfileOwner?.position]);

  // P451: Guard position removal with linked-stories warning + exit chat on confirm
  const { dialogProps } = useRemovePositionGuard({
    userId: user?.id ?? '',
    onAfterRemove: () => {
      navigate(-1); // Exit chat — telling a story about a removed position makes no sense
    },
  });

  // P446: Restore persisted chat state on mount (create mode only — not edit mode).
  // Use a ref to load once at mount; lazy useState initialisers run only on first render
  // but calling loadChatState() independently in each initialiser would parse JSON 5×.
  const persistedStateRef = useRef<PersistedChatState | null | undefined>(undefined);
  function getPersistedState(): PersistedChatState | null {
    if (persistedStateRef.current === undefined) {
      persistedStateRef.current = !existingStory ? loadChatState(pointId) : null;
    }
    return persistedStateRef.current;
  }

  const [phase, setPhase] = useState<ChatPhase>(() => {
    if (existingStory) return 'polish';
    return getPersistedState()?.phase ?? 'idle';
  });
  const [messages, setMessages] = useState<P425Message[]>(() => getPersistedState()?.messages ?? []);
  const [streamingContent, setStreamingContent] = useState<string | null>(null);
  const [iterationCount, setIterationCount] = useState(() => getPersistedState()?.iterationCount ?? 0);
  const [consecutiveFailures, setConsecutiveFailures] = useState(0);
  const [apiError, setApiError] = useState<string | null>(null);
  const [selectedVisibility, setSelectedVisibility] = useState<StoryVisibility>(() => {
    if (existingStory) return existingStory.visibility ?? 'private';
    // P607: inherit point visibility when creating from a point, else private
    return getPersistedState()?.selectedVisibility ?? pointVisibility ?? 'private';
  });
  const [isSaving, setIsSaving] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [currentDraftVersion, setCurrentDraftVersion] = useState(() => getPersistedState()?.currentDraftVersion ?? 0);
  const [polishedContent, setPolishedContent] = useState<string | null>(() => {
    if (existingStory) return existingStory.content ?? null;
    return getPersistedState()?.polishedContent ?? null;
  });
  const [ratingValue, setRatingValue] = useState<number | null>(null);
  /** P467: ID of the rating message whose buttons are currently frozen (rating submitted). */
  const [frozenRatingId, setFrozenRatingId] = useState<string | null>(null);
  /** P467: ID of the currently-active (latest) rating prompt message.
   * On session restore, derive from the last rating prompt in restored messages
   * so buttons are interactive when phase is 'rating' or 'iterating'. */
  const [activeRatingId, setActiveRatingId] = useState<string | null>(() => {
    const persisted = getPersistedState();
    if (!persisted) return null;
    if (persisted.phase !== 'rating' && persisted.phase !== 'iterating') return null;
    const msgs = persisted.messages;
    const lastRating = [...msgs].reverse().find(m => m.isRatingPrompt);
    return lastRating?.id ?? null;
  });
  /** P467: aria-live announcement text after rating button click. */
  const [ratingAnnouncement, setRatingAnnouncement] = useState<string>('');

  const threadRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Auto-resize textarea as content grows (up to max-h-[150px])
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 150)}px`;
  }, [inputValue]);

  // Track messages in a ref so streaming handler can access latest without stale closures
  const messagesRef = useRef<P425Message[]>(messages);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  // Track currentDraftVersion in a ref for the same reason — streaming callbacks are stale closures
  const currentDraftVersionRef = useRef(currentDraftVersion);
  useEffect(() => {
    currentDraftVersionRef.current = currentDraftVersion;
  }, [currentDraftVersion]);

  // P446: Persist chat state to sessionStorage (create mode only)
  // Only persist stable phases — streaming/saving are transient; restoring them yields broken UI.
  useEffect(() => {
    if (existingStory) return; // Edit mode — story is in DB, no need to persist
    if (phase === 'saved') {
      clearChatState(pointId);
      return;
    }
    if (messages.length === 0) {
      clearChatState(pointId); // Clear any stale entry so restored state can't bleed through
      return;
    }
    if (!PERSISTABLE_PHASES.has(phase)) return; // Skip transient phases (streaming, saving)
    saveChatState(pointId, { messages, phase, iterationCount, currentDraftVersion, polishedContent, selectedVisibility });
  }, [messages, phase, iterationCount, currentDraftVersion, polishedContent, selectedVisibility, pointId, existingStory]);

  // ---------------------------------------------------------------------------
  // Auto-scroll on new messages / streaming
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (threadRef.current) {
      threadRef.current.scrollTop = threadRef.current.scrollHeight;
    }
  }, [messages, streamingContent]);

  // ---------------------------------------------------------------------------
  // Opening message — either create mode or edit mode
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (existingStory) {
      // Edit mode: show existing story as a draft card + heading message
      setMessages([
        {
          id: makeId(),
          role: 'ai',
          content: 'Edit your story',
          timestamp: Date.now(),
        },
        {
          id: makeId(),
          role: 'ai',
          content: existingStory.content,
          isDraftCard: true,
          draftVersion: 1,
          draftStatus: 'polish',
          timestamp: Date.now() + 1,
        },
      ]);
      return;
    }

    // P446: Skip opening message if we restored persisted state
    if (messages.length > 0) return;

    setMessages([
      {
        id: makeId(),
        role: 'ai',
        content: "What's your experience behind this?\nBrain-dump it — messy is fine.",
        timestamp: Date.now(),
      },
    ]);
    setPhase('brain-dump');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------------------------------------------------------------------------
  // AbortController cleanup on unmount
  // ---------------------------------------------------------------------------
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  // ---------------------------------------------------------------------------
  // Stream from edge function (or mock)
  // ---------------------------------------------------------------------------
  const streamAiResponse = useCallback(
    async (allMessages: P425Message[], iteration: number, _pointText?: string, _userPosition?: string) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setStreamingContent('');
      setPhase('streaming');

      const apiMessages = allMessages.map(m => ({ role: m.role === 'ai' ? 'assistant' : 'user', content: m.content }));

      let accumulated = '';

      try {
        if (MOCK_AI) {
          // Mock path: use stub generator
          const stream = mockStoryGuideStream(apiMessages, iteration);
          for await (const chunk of stream) {
            if (controller.signal.aborted) break;
            if (chunk.type === 'delta' && chunk.text) {
              accumulated += chunk.text;
              setStreamingContent(accumulated);
            } else if (chunk.type === 'done') {
              break;
            }
          }
        } else {
          // Real edge function path: SSE stream
          const response = await fetch(EDGE_FN_URL, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${session?.access_token ?? ''}`,
            },
            body: JSON.stringify({ messages: apiMessages, pointText, userPosition, iteration }),
            signal: controller.signal,
          });

          if (!response.ok) {
            throw new Error(`Edge function error: ${response.status}`);
          }

          const reader = response.body?.getReader();
          if (!reader) throw new Error('No response body');

          const decoder = new TextDecoder();
          let buffer = '';
          let streamDone = false;

          while (true) {
            if (controller.signal.aborted) break;
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() ?? '';

            for (const line of lines) {
              if (line.startsWith('data: ')) {
                const data = line.slice(6).trim();
                if (data === '[DONE]') { streamDone = true; break; }
                try {
                  const parsed = JSON.parse(data) as { type?: string; text?: string };
                  if (parsed.type === 'delta' && parsed.text) {
                    accumulated += parsed.text;
                    setStreamingContent(accumulated);
                  }
                } catch {
                  // ignore malformed SSE lines
                }
              }
            }
            if (streamDone) break;
          }
        }
      } catch (err) {
        if ((err as Error).name === 'AbortError') return;
        // Don't surface error as AI message — surface as inline error UI
        setStreamingContent(null);
        setPhase('brain-dump'); // Reset to allow retry
        setConsecutiveFailures(prev => prev + 1);
        setApiError('Something went wrong with the AI. Try again?');
        setRatingValue(null);
        return; // Don't commit accumulated content as a message
      }

      // Success — clear any previous error
      setApiError(null);
      setConsecutiveFailures(0);

      // Done streaming — clear streaming indicator and commit message
      setStreamingContent(null);

      if (!accumulated) return;

      // Detect polish phase: AI responded with polished content
      const polishTrigger = /^here'?s? (?:is )?the polished version/i;
      const isPolishResponse = polishTrigger.test(accumulated.trimStart());

      if (isPolishResponse) {
        // Extract the content between the header line and the change note
        const lines = accumulated.split('\n');
        // Skip "Here's the polished version..." line and blank line
        const blankIdx = lines.findIndex(l => l.trim() === '');
        const contentStart = blankIdx === -1 ? 1 : blankIdx + 1;
        const contentLines: string[] = [];
        for (let i = contentStart; i < lines.length; i++) {
          if (lines[i].trimStart().startsWith('Changes:')) break;
          contentLines.push(lines[i]);
        }
        const extracted = contentLines.join('\n').trim();
        const extractionLooksValid = extracted.length > 0 && !polishTrigger.test(extracted);

        if (extractionLooksValid) {
          const changeNote = lines.find(l => l.trimStart().startsWith('Changes:'))?.replace(/^\s*Changes:\s*/, '').trim();

          const newVersion = currentDraftVersionRef.current + 1;
          setCurrentDraftVersion(newVersion);
          setPolishedContent(extracted);

          const polishCard: P425Message = {
            id: makeId(),
            role: 'ai',
            content: extracted,
            isDraftCard: true,
            draftVersion: newVersion,
            draftStatus: 'polish',
            changeNote,
            timestamp: Date.now(),
          };

          setMessages(prev => [...prev, polishCard]);
          setPhase('visibility');
          return;
        } else {
          // Extraction failed — treat as regular response
          console.warn('Polish extraction failed, treating as regular response');
          // Fall through to regular draft handling below
        }
      }

      // Regular draft response
      const newVersion = iteration === 0 ? 1 : currentDraftVersionRef.current + 1;
      if (iteration === 0) {
        setCurrentDraftVersion(1);
      } else {
        setCurrentDraftVersion(newVersion);
      }

      const draftCard: P425Message = {
        id: makeId(),
        role: 'ai',
        content: stripTrailingRatingQuestion(accumulated),
        isDraftCard: true,
        draftVersion: newVersion,
        draftStatus: 'draft',
        timestamp: Date.now(),
      };

      const ratingPrompt: P425Message = {
        id: makeId(),
        role: 'ai',
        content: 'How well does this capture what you meant?',
        isRatingPrompt: true,
        timestamp: Date.now(),
      };

      setMessages(prev => [...prev, draftCard, ratingPrompt]);
      setActiveRatingId(ratingPrompt.id);
      setRatingValue(null); // reset so new bubble starts unselected
      setPhase('rating');
    },
    [session, pointText, userPosition]
  );

  // ---------------------------------------------------------------------------
  // Send handler
  // ---------------------------------------------------------------------------
  const handleSend = useCallback((override?: string) => {
    const trimmed = (override ?? inputValue).trim();
    if (!trimmed || phase === 'streaming' || trimmed.length > MAX_BRAIN_DUMP_LENGTH) return;

    // Clear any previous error state on new user send
    setConsecutiveFailures(0);
    setApiError(null);

    const userMsg: P425Message = {
      id: makeId(),
      role: 'user',
      content: trimmed,
      timestamp: Date.now(),
    };

    setInputValue('');

    let nextPhase: ChatPhase = phase;
    if (phase === 'idle') {
      nextPhase = 'brain-dump';
    } else if (phase === 'rating') {
      nextPhase = 'iterating';
      setIterationCount(prev => prev + 1);
    } else if (phase === 'iterating') {
      setIterationCount(prev => prev + 1);
    }

    const updatedMessages = [...messagesRef.current, userMsg];
    setMessages(updatedMessages);

    // Determine current iteration count for the stream call
    const currentIteration = nextPhase === 'brain-dump' ? 0 : iterationCount + (phase === 'rating' ? 1 : 0);

    setPhase(nextPhase);
    void streamAiResponse(updatedMessages, currentIteration);
  }, [inputValue, phase, iterationCount, streamAiResponse]);

  // ---------------------------------------------------------------------------
  // Keyboard handler
  // ---------------------------------------------------------------------------
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  // ---------------------------------------------------------------------------
  // Escape hatch handlers
  // ---------------------------------------------------------------------------
  const handleEscapeHatchSave = useCallback(() => {
    setPhase('visibility');
  }, []);

  // ---------------------------------------------------------------------------
  // P467: Inline rating button click — immediately sends the rating
  // ---------------------------------------------------------------------------
  const handleInlineRatingSelect = useCallback((ratingMsgId: string, value: number) => {
    // Highlight the selected button before sending
    setRatingValue(value);
    // Freeze the button row immediately
    setFrozenRatingId(ratingMsgId);
    setActiveRatingId(null);
    // Announce to screen readers
    setRatingAnnouncement(`Rating ${value} sent`);
    // Clear announcement after a short delay so it can be re-announced if needed
    setTimeout(() => setRatingAnnouncement(''), 3000);
    // Send the rating as a user message, then reset so next rating bubble starts fresh
    handleSend(String(value));
  }, [handleSend]);

  // ---------------------------------------------------------------------------
  // Save handler
  // ---------------------------------------------------------------------------
  const handleSave = useCallback(async () => {
    if (!user) return;

    const contentToSave = polishedContent ?? (
      [...messages].reverse().find(m => m.isDraftCard)?.content ?? ''
    );

    if (!contentToSave) {
      toast.error('No draft to save. Please write a story first.');
      return;
    }

    setIsSaving(true);
    setPhase('saving');

    try {
      // Step 1: Create or update story
      const story = existingStory
        ? await storiesService.updateStory(existingStory.id, { content: contentToSave, tags: extractHashtags(contentToSave) })
        : await storiesService.createStory(user.id, contentToSave, extractHashtags(contentToSave), selectedVisibility);

      if (!story) {
        // Save failed — re-enable UI
        setIsSaving(false);
        setPhase('visibility');
        setMessages(prev => [...prev, {
          id: makeId(),
          role: 'ai' as const,
          content: 'Failed to save your story. Please try again.',
          timestamp: Date.now(),
        }]);
        return;
      }

      // Step 2: Link to point (if position-triggered flow and NOT editing an existing story)
      // Existing story is already linked — skip to avoid duplicate links.
      if (pointId && !existingStory) {
        // Check position ownership before linking (security: spec §Security Review)
        const { data: position } = await supabase
          .from('positions')
          .select('id')
          .eq('point_id', pointId)
          .eq('user_id', user.id)
          .maybeSingle();

        if (position) {
          await storiesService.linkPointToStory(story.id, pointId, user.id);
        }
        // If no position found, still save the story — just without the point link
      }

      // Step 3: Update thread — replace visibility panel with saved card
      const savedCard: P425Message = {
        id: makeId(),
        role: 'ai',
        content: contentToSave,
        isSavedCard: true,
        savedStoryId: story.id,
        savedVisibility: selectedVisibility,
        timestamp: Date.now(),
      };

      setMessages(prev => [...prev, savedCard]);
      setIsSaving(false);
      setPhase('saved');

      // Step 4: Toast
      toast.success('Story saved.');

      // Step 5: Notify parent
      onStoryConfirmed({
        storyId: story.id,
        content: contentToSave,
        pointId,
        visibility: selectedVisibility,
      });
    } catch (err) {
      console.error('[StoryGuideChat] handleSave error:', err);
      setIsSaving(false);
      setPhase('visibility');
      toast.error('Failed to save story. Please try again.');
    }
  }, [user, polishedContent, messages, selectedVisibility, pointId, onStoryConfirmed, existingStory]);

  // ---------------------------------------------------------------------------
  // Render helpers
  // ---------------------------------------------------------------------------
  const showInputBar =
    phase !== 'visibility' &&
    phase !== 'saving' &&
    phase !== 'saved';
  const sendDisabled =
    !inputValue.trim() ||
    phase === 'streaming' ||
    inputValue.length > MAX_BRAIN_DUMP_LENGTH;

  return (
    <div className="flex flex-col h-full" data-testid="story-guide-chat">
      {/* P467: Slim context header (replaces PointCardWithLinks) */}
      {contextPoint && (
        <ChatContextHeader
          pointId={contextPoint.id}
          pointText={contextPoint.text}
          userPosition={localPosition as 'agree' | 'disagree' | 'unsure' | null | undefined}
        />
      )}

      {/* P467: aria-live region for rating announcements */}
      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {ratingAnnouncement}
      </div>

      {/* Thread area */}
      <div
        ref={threadRef}
        className="flex-1 overflow-y-auto px-4 py-6 space-y-4"
      >
        {/* Message list */}
        {messages.map(msg => {
          if (msg.isDraftCard) {
            return (
              <DraftCard
                key={msg.id}
                version={msg.draftVersion ?? 1}
                content={msg.content}
                status={msg.draftStatus ?? 'draft'}
                linkedPointText={pointText}
                changeNote={msg.changeNote}
              />
            );
          }

          if (msg.isSavedCard) {
            if (!msg.savedStoryId) return null; // Domain invariant: saved cards always have a storyId
            return (
              <SavedStoryChatCard
                key={msg.id}
                storyId={msg.savedStoryId}
                content={msg.content}
                authorName={authorName}
                visibility={msg.savedVisibility ?? 'private'}
                linkedPointText={pointText}
                createdAt={new Date(msg.timestamp)}
              />
            );
          }

          if (msg.isRatingPrompt) {
            const isActive = msg.id === activeRatingId;
            const isFrozen = msg.id === frozenRatingId || !isActive;
            return (
              <ThreadMessage
                key={msg.id}
                role="ai"
                content={msg.content}
                data-testid={`rating-bubble-${msg.id}`}
              >
                <div className="mt-3">
                  <RatingButtons
                    selectedValue={ratingValue}
                    onSelect={(value) => handleInlineRatingSelect(msg.id, value)}
                    disabled={isFrozen}
                    fullWidth
                  />
                  <div className="flex justify-between text-xs text-muted-foreground mt-1" aria-hidden="true">
                    <span aria-hidden="true">not at all</span>
                    <span aria-hidden="true">perfectly</span>
                  </div>
                  {iterationCount >= 1 && isActive && (
                    <button
                      type="button"
                      data-testid="escape-hatch-save"
                      onClick={handleEscapeHatchSave}
                      className="mt-3 text-sm text-muted-foreground underline-offset-2 hover:underline py-2 block"
                    >
                      Save as-is <span aria-hidden="true">→</span>
                    </button>
                  )}
                </div>
              </ThreadMessage>
            );
          }

          return (
            <ThreadMessage
              key={msg.id}
              role={msg.role}
              content={msg.content}
              data-testid={msg.content === 'Edit your story' ? 'edit-story-heading' : undefined}
            />
          );
        })}

        {/* Streaming indicator */}
        {streamingContent !== null && (
          <ThreadMessage
            role="ai"
            content={streamingContent}
            isStreaming={streamingContent === ''}
          />
        )}

        {/* API error with retry / escape hatch */}
        {apiError && (
          <div className="flex flex-col gap-2 text-sm" data-testid="api-error">
            <p className="text-muted-foreground">{apiError}</p>
            {consecutiveFailures < 2 ? (
              <button
                type="button"
                className="text-blue-600 hover:underline self-start"
                onClick={() => {
                  setApiError(null);
                  const lastUserMsg = [...messages].reverse().find(m => m.role === 'user');
                  if (lastUserMsg) {
                    void streamAiResponse(messages, iterationCount);
                  }
                }}
              >
                [Try again]
              </button>
            ) : (
              <a
                href={pointId ? `/create?pointId=${pointId}` : '/create'}
                className="text-blue-600 hover:underline self-start"
                data-testid="write-without-ai"
              >
                Write without AI →
              </a>
            )}
          </div>
        )}

        {/* Visibility and save panel (when phase === 'visibility') */}
        {phase === 'visibility' && (
          <VisibilityAndSave
            selectedVisibility={selectedVisibility}
            onVisibilityChange={setSelectedVisibility}
            onSave={handleSave}
            onBack={() => setPhase('brain-dump')}
            isSaving={isSaving}
            isEditMode={!!existingStory}
          />
        )}
      </div>

      {/* Input bar (hidden during visibility/saving/saved phases) */}
      {showInputBar && (
        <div className="sticky bottom-0 bg-background border-t border-border px-4 py-3 pb-safe">
          <div className="rounded-2xl border border-border bg-background shadow-sm px-4 py-3 flex items-end gap-2">
            <textarea
              data-testid="story-guide-input"
              ref={inputRef}
              value={inputValue}
              onChange={e => setInputValue(e.target.value)}
              placeholder={getPlaceholder(phase)}
              onKeyDown={handleKeyDown}
              className="flex-1 resize-none border-0 shadow-none focus-visible:ring-0 bg-transparent text-base placeholder:text-muted-foreground/70 min-h-[24px] max-h-[150px] overflow-y-auto outline-none"
              rows={1}
            />
            <button
              type="button"
              onClick={() => handleSend()}
              disabled={sendDisabled}
              aria-label="Send message"
              className="p-2 rounded-full transition-colors bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              →
            </button>
          </div>
          {inputValue.length > MAX_BRAIN_DUMP_LENGTH && (
            <p className="text-xs text-destructive mt-1 px-1">
              {inputValue.length}/{MAX_BRAIN_DUMP_LENGTH} — too long
            </p>
          )}
          {phase !== 'idle' && phase !== 'brain-dump' && (
            <p className="text-xs text-muted-foreground mt-1 px-1">
              Shift+Enter for new line
            </p>
          )}
        </div>
      )}

      {/* P451: Remove position warning dialog */}
      <RemovePositionDialog {...dialogProps} />
    </div>
  );
}
