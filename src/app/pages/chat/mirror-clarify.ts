/**
 * P1722: which messages of the Mirror chat offer Clarify. Only the owner's own typed messages, voice notes and transcribed lines. Never a Clarify root, a forwarded
 * copy, a shared point or story card, the Mirror agent's reply, a private ask made in another chat, or a reply inside a Clarify or canvas-draft thread.
 * Pure (the thread checks are passed in), so the rule is testable without a screen.
 */
import type { ChatMessage } from '@/app/data/chat-service';

export interface MirrorClarifyContext {
  viewerId: string;
  /** True when the message's thread is a Clarify or canvas-draft thread. */
  inDraftThread: (threadRootId: string | null) => boolean;
}

/** An own message in the mirror that the mirror answers: a note or a Clarify (not a deleted one, nor a quiet share with no text, nor a transcribed line). Canvas threads are judged apart. */
export function isAskable(m: ChatMessage, userId: string, mirrorId: string | null): boolean {
  return (
    m.authorId === userId &&
    m.conversationId === mirrorId &&
    (m.kind === 'message' || m.kind === 'clarify') &&
    !m.isDeleted &&
    // P1722: a transcribed line starts no reply (a voice note keeps its own trigger)
    !m.isTranscription &&
    // A share (a point or story with no text) is filed quietly: the server makes no job for it either.
    // A Clarify always gets an answer, even of a shared point with no note.
    !(m.kind === 'message' && m.attachmentId && !(m.body ?? '').trim())
  );
}

/** The root of a Clarify thread (kind 'clarify') or of a canvas draft's thread (its first row is a canvas version). */
export function isDraftThreadRoot(root: ChatMessage | undefined): boolean {
  return !!root && (root.kind === 'clarify' || root.attachmentKind === 'canvas_version');
}

/**
 * Words the server can read from the row (its `_clarify_row_text`): a body with text, or a voice note whose transcript is done and not empty. A voice note still
 * being transcribed, a failed one and a silent one have none, and Clarify on them would only fail.
 */
export function hasClarifyText(m: ChatMessage): boolean {
  if ((m.body ?? '').trim() !== '') return true;
  return !!m.audio && m.audio.transcriptStatus === 'done' && (m.audio.transcript ?? '').trim() !== '';
}

export function mirrorMessageClarifiable(m: ChatMessage, { viewerId, inDraftThread }: MirrorClarifyContext): boolean {
  if (m.authorId !== viewerId || m.isDeleted || m.systemKind) return false;
  if (m.kind !== 'message') return false; // clarify roots, forwards and agent replies
  if (m.forwardedFromMessageId || m.forwardSnapshot) return false;
  if (m.attachmentKind || m.attachmentId) return false; // shared point / story cards
  if (m.contextConversationId) return false;
  if (inDraftThread(m.threadRootId) || inDraftThread(m.id)) return false;
  return hasClarifyText(m);
}
