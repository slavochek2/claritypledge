/**
 * P1302: the room codes this tab legitimately holds, presented to the database on every REST
 * request as the `x-clarity-room-code` header.
 *
 * A guest joins /live by code with no account, so the database has no identity to authorize them
 * by. Their capability is the room code — the same bearer token `claim_joiner_seat` and
 * `get_session_by_code` already accept. The `clarity_sessions` row policy (and the child tables,
 * through `can_read_clarity_session`) admits an OPEN room to a request presenting its code, so a
 * guest's direct reads and writes keep working while a caller holding no code reads nothing.
 *
 * Codes are registered where a session enters the client (api.ts `mapSessionFromDb`), so no call
 * site has to remember to attach the header — a site that forgot would fail silently, as a
 * zero-row read or a zero-row UPDATE.
 *
 * The header goes to our own REST endpoint only: never to auth, storage, or edge functions.
 * Realtime never sees it (it authorizes from the JWT alone), which is why guests sync through the
 * live page's code-keyed poll rather than postgres_changes.
 */

export const ROOM_CODE_HEADER = 'x-clarity-room-code';

/**
 * The database reads at most this many codes per request, so this is also a brute-force bound:
 * one request tests at most two guesses, never a batch. A tab is in one room at a time; the second
 * slot covers the handover when it moves to another.
 */
export const MAX_HELD_ROOM_CODES = 2;

/**
 * Six alphanumerics. Wider than the P1097 minting alphabet on purpose: rooms minted before it used
 * a different character set, and a guest rejoining one must still present its code. The real
 * constraint is that a code can never contain the `,` separator.
 */
const ROOM_CODE_PATTERN = /^[A-Z0-9]{6}$/;

/** Most recently used first — if anything is ever dropped, it is never the current room. */
const held: string[] = [];

export function holdRoomCode(code: string | null | undefined): void {
  if (!code) return;
  const normalized = code.toUpperCase().trim();
  if (!ROOM_CODE_PATTERN.test(normalized)) return;
  const existing = held.indexOf(normalized);
  if (existing >= 0) held.splice(existing, 1);
  held.unshift(normalized);
  if (held.length > MAX_HELD_ROOM_CODES) held.length = MAX_HELD_ROOM_CODES;
}

export function heldRoomCodes(): readonly string[] {
  return held;
}

/** Test-only. */
export function _resetHeldRoomCodesForTesting(): void {
  held.length = 0;
}

function urlOf(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

/**
 * Matched on origin + path rather than a string prefix, so a trailing slash in the configured URL
 * cannot silently stop the header being sent — a guest would then read and write nothing, with no
 * error anywhere.
 */
function isRestRequest(url: string, origin: string): boolean {
  try {
    const u = new URL(url);
    return u.origin === origin && u.pathname.startsWith('/rest/v1/');
  } catch {
    return false;
  }
}

/**
 * Wraps `baseFetch` so requests to `supabaseUrl`'s REST endpoint carry the held room codes. Every
 * other request — and every request while no code is held — passes through untouched.
 */
export function withRoomCodeHeader(supabaseUrl: string, baseFetch: typeof fetch): typeof fetch {
  const origin = new URL(supabaseUrl).origin;
  return (input, init) => {
    if (held.length === 0 || !isRestRequest(urlOf(input), origin)) {
      return baseFetch(input, init);
    }
    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
    headers.set(ROOM_CODE_HEADER, held.join(','));
    return baseFetch(input, { ...init, headers });
  };
}
