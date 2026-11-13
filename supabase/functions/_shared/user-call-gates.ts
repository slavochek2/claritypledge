/**
 * The opening gates two user-facing model functions share (clarify-draft, mirror-reply): CORS preflight, method, env, the caller's Bearer token and the JSON body.
 * Each returns a ready `Response` when the request stops there, and the value otherwise. Pure of Deno and esm.sh imports, so vitest loads it.
 */

type Cors = Record<string, string>;

function json(body: unknown, status: number, cors: Cors): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...cors } });
}

/** OPTIONS -> 200 ok, anything but POST -> 405, env not ready -> 500; null lets the request go on. */
export function gateRequest(req: Request, d: { cors: Cors; envReady: boolean }): Response | null {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: d.cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405, d.cors);
  if (!d.envReady) return json({ error: 'Service temporarily unavailable' }, 500, d.cors);
  return null;
}

/** The caller's user id and Bearer token, or a 401 `Response`. */
export async function authUserOrResponse(req: Request, d: { cors: Cors; authUser(token: string): Promise<string | null> }): Promise<{ userId: string; token: string } | Response> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401, d.cors);
  const token = authHeader.slice('Bearer '.length);
  const userId = await d.authUser(token);
  if (!userId) return json({ error: 'Unauthorized' }, 401, d.cors);
  return { userId, token };
}

/** The parsed JSON body, or a 400 `Response`. */
export async function readJsonBody<T>(req: Request, cors: Cors): Promise<T | Response> {
  try {
    return (await req.json()) as T;
  } catch {
    return json({ error: 'Invalid request body' }, 400, cors);
  }
}

/**
 * The gates after the body: an availability probe is answered `{ enabled }`; a project where it is off answers 503 DISABLED with `disabledMessage`.
 * Null lets the request go on (the caller's own terms gate, P1544, follows). The terms check stays in each handler: its position before any reservation is pinned there.
 */
export function availabilityOrDisabledResponse(body: { availability?: unknown }, d: { cors: Cors; enabled: boolean }, disabledMessage: string): Response | null {
  if (body.availability === true) return json({ enabled: d.enabled }, 200, d.cors);
  if (!d.enabled) return json({ error: disabledMessage, code: 'DISABLED' }, 503, d.cors);
  return null;
}
