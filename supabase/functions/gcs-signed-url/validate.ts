/**
 * P1223 (G6): pure input validation for gcs-signed-url. No Deno / network — unit-testable.
 *
 * The client (src/app/data/api.ts getSignedUploadUrl) sends one of two `sessionCode` shapes:
 *   1. a bare clarity_sessions code            — `ABC234`            (uploadAudioChunk & co.)
 *   2. a room-scoped prefix (P1149 A3)          — `rooms/ABC234/alex-<memberId uuid>`
 *      built by buildRoomAudioPathSegments(); the `<who>` part is the sanitised display
 *      name (`[a-z0-9-]`, possibly empty) joined with the transcribe_room_members.id.
 * Anything else is rejected before it can reach the Cloud Function that assembles the
 * object key. Both alphabets below are SUPERSETS of what the minting code produces
 * (`ABCDEFGHJKLMNPQRSTUVWXYZ23456789`), so no real code is refused.
 */

export const SESSION_CODE_RE = /^[A-Z0-9]{6}$/;

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
export const ROOM_PREFIX_RE = new RegExp(`^rooms/([A-Z0-9]{6})/([a-z0-9-]{0,100})-(${UUID})$`);

// devRecordingFilenamePrefix() ('_dev_') + sanitised name + `_chunk_NNN` / `_events_NNN` /
// `events` + one of two extensions. Lowercase only — the client lowercases before sending.
export const FILE_NAME_RE = /^[a-z0-9_-]{1,160}\.(webm|json)$/;

// use-audio-recorder.ts picks `audio/webm;codecs=opus` → `audio/webm` → `audio/mp4`; the
// events payloads are `application/json`. A Blob's reported type is forwarded verbatim,
// so the codecs parameter must be admitted with a bounded alphabet.
export const CONTENT_TYPE_RE = /^(audio\/(webm|mp4)(;codecs=[a-z0-9.,-]{1,40})?|application\/json)$/;

export type UploadTarget =
  | { kind: 'session'; code: string }
  | { kind: 'room'; code: string; memberId: string };

/** Classifies `sessionCode`; `null` means the shape is not one the client can produce. */
export function parseUploadTarget(sessionCode: unknown): UploadTarget | null {
  if (typeof sessionCode !== 'string') return null;
  if (SESSION_CODE_RE.test(sessionCode)) return { kind: 'session', code: sessionCode };
  const m = ROOM_PREFIX_RE.exec(sessionCode);
  if (m) return { kind: 'room', code: m[1], memberId: m[3] };
  return null;
}

export function isValidFileName(fileName: unknown): fileName is string {
  return typeof fileName === 'string' && FILE_NAME_RE.test(fileName);
}

export function isValidContentType(contentType: unknown): contentType is string {
  return typeof contentType === 'string' && CONTENT_TYPE_RE.test(contentType);
}
