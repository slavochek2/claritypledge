/**
 * P1511: the login form's account check, bounded per caller.
 *
 * Answers one of `found | absent | limited | unavailable` for a typed address. Order:
 * validate the body → reserve a slot in the P1225 limiter's IP bucket under this function's own
 * name (so it shares no allowance with the mail-sending functions) → only then call email_exists
 * with the service role. A refused, failed or malformed request performs no lookup.
 *
 * No target bucket, deliberately: keying on the typed address would let a stranger use up a
 * victim's allowance.
 *
 * Reachable without a caller identity — that is the product (the visitor has no session yet).
 * The per-IP limit is what stands in for the identity check; see EXEMPT in
 * scripts/check-edge-function-auth.py.
 */
import { buildCorsHeaders } from '../_shared/cors.ts';
import { type BucketLimit, type RpcClient, ipLimitKey, reserveMailSlot } from '../_shared/mail-rate-limit.ts';

export const FUNCTION_NAME = 'check-login-email';

/** FOUNDER DECISION 2026-10-19 (P1511): 10 checks per 10 minutes per IP. */
export const CHECK_LOGIN_EMAIL_LIMIT: BucketLimit = { limit: 10, windowSeconds: 10 * 60 };

export type CheckResult = 'found' | 'absent' | 'limited' | 'unavailable';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_EMAIL_LENGTH = 254;

export interface CheckLoginEmailDeps {
  db: RpcClient;
  ipHashSecret: string;
}

function reply(
  result: CheckResult | null,
  status: number,
  cors: Record<string, string>,
  extra: Record<string, string> = {},
): Response {
  const body = result ? { result } : { error: 'Invalid request.' };
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json', ...extra },
  });
}

export function createHandler({ db, ipHashSecret }: CheckLoginEmailDeps) {
  return async (req: Request): Promise<Response> => {
    const cors = buildCorsHeaders(req);
    if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
    if (req.method !== 'POST') return reply(null, 405, cors);

    try {
      let email: unknown;
      try {
        email = ((await req.json()) as { email?: unknown } | null)?.email;
      } catch {
        return reply(null, 400, cors);
      }
      if (typeof email !== 'string') return reply(null, 400, cors);
      // Normalized exactly as the login form did before P1511 (api.ts checkEmailExists).
      const normalized = email.toLowerCase().trim();
      if (normalized.length > MAX_EMAIL_LENGTH || !EMAIL_REGEX.test(normalized)) {
        return reply(null, 400, cors);
      }

      // Fails closed: a limiter error is a refusal, never a pass.
      const slot = await reserveMailSlot(
        db, FUNCTION_NAME, 'ip', await ipLimitKey(req, ipHashSecret), CHECK_LOGIN_EMAIL_LIMIT,
      );
      if (!slot.allowed) {
        if ('unavailable' in slot) return reply('unavailable', 503, cors);
        return reply('limited', 200, cors, {
          'Retry-After': String(slot.retryAfterSeconds),
          'Access-Control-Expose-Headers': 'Retry-After',
        });
      }

      const { data, error } = await db.rpc('email_exists', { p_email: normalized });
      if (error || typeof data !== 'boolean') {
        console.error(`[${FUNCTION_NAME}] email_exists failed`, { code: error?.code });
        return reply('unavailable', 503, cors);
      }
      return reply(data ? 'found' : 'absent', 200, cors);
    } catch (err) {
      console.error(`[${FUNCTION_NAME}] unexpected error`, err);
      return reply('unavailable', 503, cors);
    }
  };
}
