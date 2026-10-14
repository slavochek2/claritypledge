/**
 * P1225: request limiter for anonymous endpoints that send mail or create accounts.
 *
 * Two buckets, both keyed by a salted SHA-256 (never a raw IP or address):
 *   - `ip`     — the caller's address (`extractClientIp`, first x-forwarded-for hop, which the
 *                hosted edge sets itself — see the P1225 spec's Dev results for the evidence);
 *   - `target` — the normalized email the request would mail.
 *
 * Order in a caller: reserve the IP bucket → do every check that can reject the request without
 * an account lookup (e.g. "does the letter exist") → reserve the target bucket → only then look
 * up / create the account, mint a link or send. A request refused or rejected before the target
 * step never spends that address's allowance, so nobody can exhaust a victim's allowance with
 * requests that could never have mailed them.
 *
 * The decision is made in the database (`reserve_mail_rate_slot`, migration
 * 20261014130000): one call inserts this request's row and counts the window on database time,
 * serialized per key, so exactly `limit` requests pass per window however many arrive at once
 * and the edge runtime's clock takes no part. A refused request keeps its row, so it still
 * counts. Any database error fails CLOSED — `unavailable` is a refusal (`mailLimitResponse` → 500).
 *
 * The decision depends only on how many requests were made, never on whether the address has an
 * account, and both buckets return the same 429 body — a refusal reveals nothing about account
 * existence.
 *
 * The client is typed structurally so this file imports nothing remote; the integration test
 * (e2e/integration/20261014130000_p1225_mail_rate_limits.spec.ts) drives it with supabase-js.
 */
import { extractClientIp, hashIp } from './hash-ip.ts';

export const MAIL_RATE_LIMIT_RPC = 'reserve_mail_rate_slot';

export type MailBucket = 'ip' | 'target';

export interface BucketLimit {
  limit: number;
  windowSeconds: number;
}

export interface MailLimits {
  ip: BucketLimit;
  target: BucketLimit;
}

/** FOUNDER DECISION 2026-10-14 (P1225): 5 per 10 minutes per IP, 3 per hour per target address. */
export const SIGNIN_MAIL_LIMITS: MailLimits = {
  ip: { limit: 5, windowSeconds: 10 * 60 },
  target: { limit: 3, windowSeconds: 60 * 60 },
};

export type MailLimitResult =
  | { allowed: true }
  | { allowed: false; retryAfterSeconds: number; bucket: MailBucket }
  | { allowed: false; unavailable: true };

/** Structural slice of a supabase-js client: only `.rpc` is used. */
export interface RpcClient {
  rpc(
    fn: string,
    args: Record<string, unknown>,
  ): PromiseLike<{ data: unknown; error: { code?: string; message?: string } | null }>;
}

/** Salted hash of the caller's address. */
export function ipLimitKey(req: Request, secret: string): Promise<string> {
  return hashIp(extractClientIp(req), secret);
}

/** Salted hash of the target address, domain-separated so it can never equal an IP key. */
export function targetLimitKey(normalizedEmail: string, secret: string): Promise<string> {
  return hashIp(`target:${normalizedEmail}`, secret);
}

/** Both keys at once, for callers that know the target before any other check. */
export async function mailLimitKeys(
  req: Request,
  normalizedEmail: string,
  secret: string,
): Promise<{ ipHash: string; targetHash: string }> {
  const [ipHash, targetHash] = await Promise.all([
    ipLimitKey(req, secret),
    targetLimitKey(normalizedEmail, secret),
  ]);
  return { ipHash, targetHash };
}

/** Reserve one slot for (fn, bucket, keyHash); the database decides on its own clock. */
export async function reserveMailSlot(
  db: RpcClient,
  fn: string,
  bucket: MailBucket,
  keyHash: string,
  { limit, windowSeconds }: BucketLimit,
): Promise<MailLimitResult> {
  const { data, error } = await db.rpc(MAIL_RATE_LIMIT_RPC, {
    p_function_name: fn,
    p_bucket: bucket,
    p_key_hash: keyHash,
    p_limit: limit,
    p_window_seconds: windowSeconds,
  });
  if (error || typeof data !== 'number' || !Number.isInteger(data) || data < 0) {
    console.error('[mail-rate-limit] reservation failed', { fn, bucket, code: error?.code });
    return { allowed: false, unavailable: true };
  }
  return data === 0 ? { allowed: true } : { allowed: false, retryAfterSeconds: data, bucket };
}

/** IP bucket first; the target bucket is only reserved for a request the IP bucket admitted. */
export async function checkMailLimits(
  db: RpcClient,
  fn: string,
  keys: { ipHash: string; targetHash: string },
  limits: MailLimits,
): Promise<MailLimitResult> {
  const ip = await reserveMailSlot(db, fn, 'ip', keys.ipHash, limits.ip);
  if (!ip.allowed) return ip;
  return reserveMailSlot(db, fn, 'target', keys.targetHash, limits.target);
}

/** The one 429 every bucket returns. Body is identical whichever bucket refused. */
export function rateLimitedResponse(retryAfterSeconds: number, cors: Record<string, string>): Response {
  return new Response(
    JSON.stringify({ error: 'Too many requests. Please wait a while and try again.' }),
    {
      status: 429,
      headers: {
        ...cors,
        'Content-Type': 'application/json',
        'Retry-After': String(retryAfterSeconds),
        'Access-Control-Expose-Headers': 'Retry-After',
      },
    },
  );
}

/** The response for a refusal (429, or a generic 500 when the limiter failed); null when allowed. */
export function mailLimitResponse(result: MailLimitResult, cors: Record<string, string>): Response | null {
  if (result.allowed) return null;
  if ('unavailable' in result) {
    return new Response(JSON.stringify({ error: 'Something went wrong. Please try again.' }), {
      status: 500,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }
  return rateLimitedResponse(result.retryAfterSeconds, cors);
}
