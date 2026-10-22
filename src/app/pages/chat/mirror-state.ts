/**
 * P1520: the mirror context's shape and its hook. The provider lives in mirror-provider.tsx (a .ts file
 * for the context object keeps Fast Refresh working, as chat-state.ts does for the chat).
 */
import { createContext, useContext, useEffect } from 'react';
import type { ChatMessage } from '@/app/data/chat-service';
import type { MirrorGender, MirrorProfile } from '@/app/data/mirror-service';

/**
 * What the mirror is doing about one of its owner's messages. Absent = nothing to show (answered, or
 * never asked). `unavailable`: the mirror cannot answer on this project.
 */
export type MirrorReplyStatus = 'thinking' | 'failed' | 'capped';

export type PortraitStatus = 'idle' | 'painting' | 'failed' | 'capped';

export interface MirrorContextValue {
  /** null while unknown. False: the mirror cannot answer here, and no AI control is shown. */
  enabled: boolean | null;
  profile: MirrorProfile | null;
  portraitStatus: PortraitStatus;
  statusFor: (messageId: string) => MirrorReplyStatus | undefined;
  /** Ask (again) for the mirror's answer to one of the owner's own mirror messages. */
  requestReply: (messageId: string) => void;
  /** Looks up the job states of these messages (after a reload, so a failed one offers Try again). */
  loadStatuses: (messageIds: string[]) => void;
  /** A private question from a channel; resolves once it is stored (the answer follows). */
  ask: (channelId: string, body: string) => Promise<ChatMessage>;
  newFace: () => Promise<void>;
  /** The first time the owner opens the mirror and it has no face yet. */
  ensurePortrait: () => void;
  setGender: (gender: MirrorGender | null) => Promise<void>;
}

export const MirrorContext = createContext<MirrorContextValue | null>(null);

/** Null outside the provider (signed out, or a test that does not mount it): callers show no mirror AI. */
export function useMirror(): MirrorContextValue | null {
  return useContext(MirrorContext);
}

/**
 * After a reload, the owner's latest unanswered messages among `rows` say whether the mirror agent is still on
 * them, or failed. Used by the conversation pane and (P1546) the thread panel, whose rows the pane never loads.
 */
export function useRestoreMirrorStatuses(rows: ChatMessage[] | null, userId: string | null | undefined): void {
  const mirror = useMirror();
  const loadStatuses = mirror?.loadStatuses;
  // `enabled` resolves after the rows can have loaded; loadStatuses ignores calls until then, so ask again when it does.
  const enabled = mirror?.enabled === true;
  useEffect(() => {
    if (!rows || !loadStatuses || !enabled) return;
    const answered = new Set(rows.filter((m) => m.kind === 'agent' && m.replyToId).map((m) => m.replyToId));
    const waiting = rows
      .filter((m) => m.authorId === userId && (m.kind === 'message' || m.kind === 'clarify') && !m.isDeleted && !answered.has(m.id))
      .slice(-20)
      .map((m) => m.id);
    loadStatuses(waiting);
  }, [rows, loadStatuses, userId, enabled]);
}
