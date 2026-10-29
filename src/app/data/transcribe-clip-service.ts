/**
 * @file transcribe-clip-service.ts
 * @description P1576 Part A: the dictation call. One WAV clip to the `transcribe-clip` edge
 * function, text back. Nothing is stored on the other side.
 */
import { supabase } from '@/lib/supabase';
import { withDeadline } from '@/lib/with-deadline';

/** A 3-minute clip is ~5.8 MB up and a few seconds of Gemini; this bounds a silent network. */
export const TRANSCRIBE_CLIP_TIMEOUT_MS = 45_000;

/** `status` is the HTTP status, or 0 when no response arrived (offline, timeout). */
export class TranscribeClipError extends Error {
  readonly status: number;
  readonly retryAfterSeconds: number | null;
  /** Sending the same clip again can succeed: a network failure, a rate limit, Gemini down. */
  readonly retryable: boolean;

  constructor(message: string, status: number, retryAfterSeconds: number | null = null) {
    super(message);
    this.name = 'TranscribeClipError';
    this.status = status;
    this.retryAfterSeconds = retryAfterSeconds;
    this.retryable = status === 0 || status === 429 || status >= 500;
  }
}

export async function transcribeClip(wav: Uint8Array): Promise<string> {
  const { data: { session } } = await withDeadline(
    supabase.auth.getSession(),
    TRANSCRIBE_CLIP_TIMEOUT_MS,
    'auth.getSession',
  ).catch(() => ({ data: { session: null } }));
  const token = session?.access_token;
  if (!token) throw new TranscribeClipError('Not signed in', 401);

  let response: Response;
  try {
    response = await fetch(`${import.meta.env.VITE_SUPABASE_URL as string}/functions/v1/transcribe-clip`, {
      method: 'POST',
      headers: { 'Content-Type': 'audio/wav', Authorization: `Bearer ${token}` },
      body: wav as BodyInit,
      signal: AbortSignal.timeout(TRANSCRIBE_CLIP_TIMEOUT_MS),
    });
  } catch {
    throw new TranscribeClipError('Network error', 0);
  }

  const body = await withDeadline(response.json(), TRANSCRIBE_CLIP_TIMEOUT_MS, 'transcribe-clip body')
    .catch(() => ({})) as { text?: unknown; error?: unknown };
  if (!response.ok) {
    const retryAfter = Number(response.headers.get('Retry-After'));
    throw new TranscribeClipError(
      typeof body.error === 'string' ? body.error : 'Transcription failed',
      response.status,
      Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : null,
    );
  }
  if (typeof body.text !== 'string') throw new TranscribeClipError('Transcription returned no text', 502);
  return body.text;
}
