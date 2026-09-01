/**
 * P1223 (G6): pure input validation for gcs-signed-url. No Deno / network — unit-testable.
 *
 * The client (src/app/data/api.ts getSignedUploadUrl) sends one of two `sessionCode` shapes:
 *   1. a bare clarity_sessions code            — `ABC234`            (uploadSingleChunk & co.)
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

/**
 * Extension ↔ content-type binding (Codex review, P1223): `.json` may only be declared as
 * `application/json` and `.webm` only as a permitted `audio/*`. Without this a caller can
 * store an `audio/*`-typed blob under `events.json` (or JSON under a `.webm` key) and the
 * downstream reader trusts whichever of the two it looks at first.
 */
export function isConsistentFileType(fileName: string, contentType: string): boolean {
  if (fileName.endsWith('.json')) return contentType === 'application/json';
  if (fileName.endsWith('.webm')) return contentType.startsWith('audio/');
  return false;
}

// Object names the /live client produces under `sessions/<code>/` (api.ts: uploadSingleChunk,
// uploadAudioChunk, uploadEventsSnapshot, uploadSessionRecording), with the optional P809
// `_dev_` prefix. `events.json` carries no participant segment — it is the session-level
// events file that EITHER participant may (over)write.
const DEV_PREFIX = '_dev_';
const SESSION_OWNED_RE = /^(.+?)(?:_chunk_\d{3}\.webm|\.webm|_events_\d{3}\.json)$/;
const SESSION_SHARED_RE = /^events\.json$/;

export type SessionObject =
  | { kind: 'owned'; owner: string }
  | { kind: 'shared' };

/**
 * Splits a /live object name into its owner segment. `null` = not a shape the /live client
 * produces (even if it passes FILE_NAME_RE), and is rejected.
 */
export function parseSessionObject(fileName: string): SessionObject | null {
  const bare = fileName.startsWith(DEV_PREFIX) ? fileName.slice(DEV_PREFIX.length) : fileName;
  if (SESSION_SHARED_RE.test(bare)) return { kind: 'shared' };
  const m = SESSION_OWNED_RE.exec(bare);
  if (!m || !m[1]) return null;
  return { kind: 'owned', owner: m[1] };
}

// Under `rooms/<code>/<who>-<memberId>/` the client (uploadRoomAudioChunk) only ever writes
// `chunk_NNN.webm` — the member identity already lives in the prefix, so no name segment.
export const ROOM_FILE_NAME_RE = /^(?:_dev_)?chunk_\d{3}\.webm$/;
