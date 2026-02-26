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
 *   - Send disabled when content > 5000 chars or during streaming
 *   - AbortController cleans up fetch on unmount
 *   - selectedVisibility defaults to 'private' (NOT the DB default of 'public')
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import type { StoryVisibility } from '@/app/types';
import { useAuth } from '@/auth';
import { ThreadMessage } from './ThreadMessage';
import { DraftCard } from './DraftCard';
import { VisibilityAndSave } from './VisibilityAndSave';
import { SavedStoryChatCard } from './SavedStoryChatCard';
import { PointCardWithLinks } from '@/app/components/social/point-card-with-links';
import type { PointProfileOwner } from '@/app/components/social/point-card-with-links';
import type { Point as PrototypePoint, PositionEntry } from '@/app/prototypes/shared/types';
import { mockStoryGuideStream } from '@/app/data/story-guide-chat-stub';
import { storiesService } from '@/app/data/stories-service';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';

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
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_BRAIN_DUMP_LENGTH = 5000;

const EDGE_FN_URL =
  (import.meta.env.VITE_STORY_GUIDE_EDGE_FN_URL as string | undefined) ??
  `${import.meta.env.VITE_SUPABASE_URL as string}/functions/v1/story-guide-chat`;

const MOCK_AI = import.meta.env.VITE_MOCK_AI === 'true';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getPlaceholder(phase: ChatPhase): string {
  if (phase === 'idle' || phase === 'brain-dump') return "What's on your mind?";
  if (phase === 'rating' || phase === 'iterating') return '0–10, or describe what\'s off...';
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
}: StoryGuideChatProps) {
  const { user, session } = useAuth();
  const authorName = user?.name ?? 'You';

  const [phase, setPhase] = useState<ChatPhase>('idle');
  const [messages, setMessages] = useState<P425Message[]>([]);
  const [streamingContent, setStreamingContent] = useState<string | null>(null);
  const [iterationCount, setIterationCount] = useState(0);
  const [consecutiveFailures, setConsecutiveFailures] = useState(0);
  const [apiError, setApiError] = useState<string | null>(null);
  const [selectedVisibility, setSelectedVisibility] = useState<StoryVisibility>('private');
  const [isSaving, setIsSaving] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [currentDraftVersion, setCurrentDraftVersion] = useState(0);
  const [polishedContent, setPolishedContent] = useState<string | null>(null);
  const [aiDisclosureAcked, setAiDisclosureAcked] = useState(
    () => { try { return localStorage.getItem('ai_disclosure_acked') === 'true'; } catch { return false; } }
  );
  const [visibilitySource, setVisibilitySource] = useState<'polish' | 'escape' | null>(null);

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

  // ---------------------------------------------------------------------------
  // Auto-scroll on new messages / streaming
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (threadRef.current) {
      threadRef.current.scrollTop = threadRef.current.scrollHeight;
    }
  }, [messages, streamingContent]);

  // ---------------------------------------------------------------------------
  // Opening message for position-triggered flow
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (pointId && pointText && messages.length === 0) {
      setMessages([
        {
          id: makeId(),
          role: 'ai',
          content: "What's your experience behind this?\nBrain-dump it — messy is fine.",
          timestamp: Date.now(),
        },
      ]);
      setPhase('brain-dump');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pointId, pointText]);

  // ---------------------------------------------------------------------------
  // AbortController cleanup on unmount
  // ---------------------------------------------------------------------------
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  // ---------------------------------------------------------------------------
  // AI disclosure ack
  // ---------------------------------------------------------------------------
  const handleAckDisclosure = useCallback(() => {
    try { localStorage.setItem('ai_disclosure_acked', 'true'); } catch { /* ignore */ }
    setAiDisclosureAcked(true);
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
          setVisibilitySource('polish');
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
        content: 'How well does this capture what you meant? Type 0–10 or describe what\'s off.',
        timestamp: Date.now(),
      };

      setMessages(prev => [...prev, draftCard, ratingPrompt]);
      setPhase('rating');
    },
    [session, pointText, userPosition]
  );

  // ---------------------------------------------------------------------------
  // Send handler
  // ---------------------------------------------------------------------------
  const handleSend = useCallback(() => {
    const trimmed = inputValue.trim();
    if (!trimmed || phase === 'streaming' || trimmed.length > MAX_BRAIN_DUMP_LENGTH || !aiDisclosureAcked) return;

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
    }

    const updatedMessages = [...messagesRef.current, userMsg];
    setMessages(updatedMessages);

    // Determine current iteration count for the stream call
    const currentIteration = nextPhase === 'brain-dump' ? 0 : iterationCount + (phase === 'rating' ? 1 : 0);

    setPhase(nextPhase);
    void streamAiResponse(updatedMessages, currentIteration);
  }, [inputValue, phase, aiDisclosureAcked, iterationCount, streamAiResponse]);

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
    setVisibilitySource('escape');
    setPhase('visibility');
  }, []);

  const handleKeepRefining = useCallback(() => {
    setIterationCount(0);
  }, []);

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
      // Step 1: Create story
      const story = await storiesService.createStory(user.id, contentToSave, [], selectedVisibility);

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

      // Step 2: Link to point (if position-triggered flow)
      if (pointId) {
        // Check position ownership before linking (security: spec §Security Review)
        const { data: position } = await supabase
          .from('positions')
          .select('id')
          .eq('point_id', pointId)
          .eq('user_id', user.id)
          .maybeSingle();

        if (position) {
          await storiesService.linkPointToStory(story.id, pointId);
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
  }, [user, polishedContent, messages, selectedVisibility, pointId, onStoryConfirmed]);

  // ---------------------------------------------------------------------------
  // Render helpers
  // ---------------------------------------------------------------------------
  const showInputBar = phase !== 'visibility' && phase !== 'saving' && phase !== 'saved';
  const inputDisabled = phase === 'streaming';
  const sendDisabled =
    !inputValue.trim() ||
    phase === 'streaming' ||
    inputValue.length > MAX_BRAIN_DUMP_LENGTH ||
    !aiDisclosureAcked;

  return (
    <div className="flex flex-col h-full" data-testid="story-guide-chat">
      {/* Context card (only when full point data is available) */}
      {contextPoint && (
        <div data-testid="context-card" className="sticky top-16 z-10 bg-background border-b border-border px-4 py-3">
          <PointCardWithLinks
            point={contextPoint as PrototypePoint}
            profileOwner={contextProfileOwner}
          />
        </div>
      )}

      {/* Thread area */}
      <div
        ref={threadRef}
        className="flex-1 overflow-y-auto px-4 py-6 space-y-4"
      >
        {/* AI disclosure (if not acknowledged) */}
        {!aiDisclosureAcked && (
          <div
            className="bg-muted border border-border rounded-lg px-4 py-3 text-sm space-y-2"
            data-testid="ai-disclosure"
          >
            <p className="text-muted-foreground">
              This story is drafted with Gemini AI (Google). Your text is sent to their API.
            </p>
            <button
              type="button"
              onClick={handleAckDisclosure}
              className="text-blue-600 hover:underline text-sm font-medium"
            >
              Acknowledge
            </button>
          </div>
        )}

        {/* Message list */}
        {messages.map(msg => {
          if (msg.isDraftCard) {
            return (
              <DraftCard
                key={msg.id}
                version={msg.draftVersion!}
                content={msg.content}
                status={msg.draftStatus ?? 'draft'}
                linkedPointText={pointText}
                changeNote={msg.changeNote}
              />
            );
          }

          if (msg.isSavedCard) {
            return (
              <SavedStoryChatCard
                key={msg.id}
                storyId={msg.savedStoryId!}
                content={msg.content}
                authorName={authorName}
                visibility={msg.savedVisibility ?? 'private'}
                linkedPointText={pointText}
                createdAt={new Date(msg.timestamp)}
              />
            );
          }

          return (
            <ThreadMessage
              key={msg.id}
              role={msg.role}
              content={msg.content}
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

        {/* Escape hatch (shown after 3 iterations in rating phase) */}
        {phase === 'rating' && iterationCount >= 3 && (
          <div className="flex gap-2 flex-wrap">
            <button
              type="button"
              data-testid="escape-hatch-save"
              onClick={handleEscapeHatchSave}
              className="px-3 py-1.5 rounded-lg border border-border text-sm text-muted-foreground hover:bg-muted transition-colors"
            >
              Save at this version
            </button>
            <button
              type="button"
              data-testid="escape-hatch-keep-refining"
              onClick={handleKeepRefining}
              className="px-3 py-1.5 rounded-lg border border-border text-sm text-muted-foreground hover:bg-muted transition-colors"
            >
              Keep refining
            </button>
          </div>
        )}

        {/* Visibility and save panel (when phase === 'visibility') */}
        {phase === 'visibility' && (
          <VisibilityAndSave
            selectedVisibility={selectedVisibility}
            onVisibilityChange={setSelectedVisibility}
            onSave={handleSave}
            onBack={() => setPhase(visibilitySource === 'escape' ? 'iterating' : 'rating')}
            isSaving={isSaving}
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
              disabled={inputDisabled}
              placeholder={getPlaceholder(phase)}
              onKeyDown={handleKeyDown}
              className="flex-1 resize-none border-0 shadow-none focus-visible:ring-0 bg-transparent text-base placeholder:text-muted-foreground/70 min-h-[24px] max-h-[150px] overflow-y-auto outline-none"
              rows={1}
            />
            <button
              type="button"
              onClick={handleSend}
              disabled={sendDisabled}
              aria-label="Send message"
              className={`p-2 rounded-full transition-colors ${
                !sendDisabled
                  ? 'bg-blue-600 text-white hover:bg-blue-700'
                  : 'bg-muted text-muted-foreground cursor-not-allowed'
              }`}
            >
              →
            </button>
          </div>
          {inputValue.length > MAX_BRAIN_DUMP_LENGTH && (
            <p className="text-xs text-destructive mt-1 px-1">
              {inputValue.length}/{MAX_BRAIN_DUMP_LENGTH} — too long
            </p>
          )}
          {!aiDisclosureAcked && inputValue.trim() && (
            <p className="text-xs text-muted-foreground mt-1 px-1">
              Acknowledge the AI disclosure above to send.
            </p>
          )}
          {phase !== 'idle' && phase !== 'brain-dump' && (
            <p className="text-xs text-muted-foreground mt-1 px-1">
              Shift+Enter for new line
            </p>
          )}
        </div>
      )}
    </div>
  );
}
