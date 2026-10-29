/**
 * P1576 Part B: voice notes — the client half of the chat-voice edge function.
 *
 * sendVoiceNote = upload (signed PUT for a server-derived key) → PUT the WAV → commit. The server
 * reads the stored clip's own header to bound its duration and inserts the message AS the caller;
 * the client never names a path, a duration or an author. Playback is a short-lived signed URL
 * minted after a membership check (`getVoicePlaybackUrl`); nothing here ever sees a storage path.
 *
 * Only human chats and threads accept voice notes: a mirror conversation is refused server-side
 * (reason 'unsupported'), whatever the UI shows.
 */

import { supabase } from '@/lib/supabase';
import { mapMessageRow, type ChatMessage, type ChatMessageRow } from './chat-mappers';

/**
 * Why a send failed. `bad_audio` (400): the stored recording is not a valid 16 kHz mono WAV, so sending the
 * same audio again cannot work. Like `too_long`, `forbidden` and `unsupported` it carries no `receipt`; use
 * `isFinalVoiceFailure` rather than listing reasons yourself.
 */
export type VoiceNoteFailure = 'too_long' | 'rate' | 'forbidden' | 'unsupported' | 'bad_audio' | 'failed';

/** True when retrying the same recording cannot succeed (the caller should not offer Retry). */
export function isFinalVoiceFailure(e: VoiceNoteError): boolean {
  return e.reason === 'too_long' || e.reason === 'forbidden' || e.reason === 'unsupported' || e.reason === 'bad_audio';
}

/**
 * The uploaded object of a send whose commit did not come back. Hand it to the next attempt
 * (`resume`) so the retry re-commits the SAME object: the server already knows that upload, so a
 * commit whose answer was lost cannot become a second message or a second transcription.
 */
export interface VoiceUploadReceipt {
  conversationId: string;
  objectKey: string;
}

export class VoiceNoteError extends Error {
  constructor(
    readonly reason: VoiceNoteFailure,
    readonly status: number | null,
    message: string,
    /** Present when the audio is stored and retrying the commit can still work (network loss, 5xx, rate). */
    readonly receipt?: VoiceUploadReceipt,
  ) {
    super(message);
    this.name = 'VoiceNoteError';
  }
}

const REASON_BY_STATUS: Record<number, VoiceNoteFailure> = {
  400: 'bad_audio', 403: 'forbidden', 413: 'too_long', 422: 'unsupported', 429: 'rate',
};

/** supabase-js hands a non-2xx back as an error whose `context` is the Response; read status and server text from it. */
async function voiceError(action: string, error: { message: string; context?: unknown }): Promise<VoiceNoteError> {
  const res = error.context instanceof Response ? error.context : null;
  const status = res?.status ?? null;
  let detail = error.message;
  if (res) {
    const body = (await res.json().catch(() => null)) as { error?: unknown } | null;
    if (typeof body?.error === 'string') detail = body.error;
  }
  return new VoiceNoteError((status && REASON_BY_STATUS[status]) || 'failed', status, `voice note ${action} failed: ${detail}`);
}

interface UploadGrant {
  uploadUrl: string;
  uploadHeaders: Record<string, string>;
  objectKey: string;
}

export interface SendVoiceNoteOptions {
  threadRootId?: string;
  replyToId?: string;
  /** The receipt from a previous attempt's VoiceNoteError: skip the upload and re-commit that object. */
  resume?: VoiceUploadReceipt;
}

/** Statuses after which the same stored object cannot succeed, so a receipt would only invite a pointless retry. */
const FINAL_STATUSES = new Set([400, 403, 404, 413, 422]);

/**
 * Sends a recorded WAV (16 kHz mono 16-bit, max 2 minutes) as a voice note. Resolves with the new message.
 * On a failure after the audio was stored, the thrown VoiceNoteError carries a `receipt`; pass it back
 * as `resume` when the user taps Retry.
 */
export async function sendVoiceNote(
  conversationId: string,
  wav: Blob,
  opts: SendVoiceNoteOptions = {},
): Promise<ChatMessage> {
  let receipt = opts.resume?.conversationId === conversationId ? opts.resume : null;
  if (!receipt) {
    const { data: grant, error: upError } = await supabase.functions.invoke('chat-voice', {
      body: { mode: 'upload', conversationId, ...(opts.threadRootId ? { threadRootId: opts.threadRootId } : {}) },
    });
    if (upError || !grant) throw await voiceError('upload', upError ?? { message: 'no upload grant' });
    const { uploadUrl, uploadHeaders, objectKey } = grant as UploadGrant;

    // The signature commits to these exact headers; sending others (or none) is a 403 from storage.
    const put = await fetch(uploadUrl, { method: 'PUT', headers: uploadHeaders, body: wav });
    if (!put.ok) throw new VoiceNoteError('failed', put.status, `voice note upload failed: storage returned ${put.status}`);
    receipt = { conversationId, objectKey };
  }
  const objectKey = receipt.objectKey;

  const { data, error } = await supabase.functions.invoke('chat-voice', {
    body: {
      mode: 'commit',
      conversationId,
      objectKey,
      ...(opts.threadRootId ? { threadRootId: opts.threadRootId } : {}),
      ...(opts.replyToId ? { replyToId: opts.replyToId } : {}),
    },
  });
  if (error || !data?.message) {
    const failure = await voiceError('commit', error ?? { message: 'no message returned' });
    // The object is stored: let the caller retry the commit instead of recording and uploading again.
    throw FINAL_STATUSES.has(failure.status ?? 0)
      ? failure
      : new VoiceNoteError(failure.reason, failure.status, failure.message, receipt);
  }
  return mapMessageRow(data.message as ChatMessageRow);
}

/**
 * A signed URL for a voice note the caller may read, valid for 2 minutes (PLAYBACK_TTL_SECONDS on the
 * server), or null when the audio is gone (30-day retention or the message was deleted). Fetch it when
 * the user presses play, not on render, and do not keep it longer than about 100 seconds: after that,
 * ask again.
 */
export async function getVoicePlaybackUrl(messageId: string): Promise<string | null> {
  const { data, error } = await supabase.functions.invoke('chat-voice', { body: { mode: 'playback', messageId } });
  if (error) {
    const res = (error as { context?: unknown }).context;
    if (res instanceof Response && res.status === 410) return null;
    throw await voiceError('playback', error);
  }
  return (data as { url: string }).url;
}
