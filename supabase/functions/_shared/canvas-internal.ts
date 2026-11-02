/**
 * P1536 section 3c, X9: the internal, service-only route by which the DATABASE starts a canvas run.
 *
 * When a voice note's transcript lands, a trigger on chat_messages.transcript_status calls canvas-draft over pg_net with the queued
 * run's id (migration 20261102100000), so the run begins whether or not the owner's tab is open. The route is P1576's pattern for the
 * mirror reply: a shared secret in a header (never a JWT), and a request that carries the header is internal ONLY and never falls
 * back to the JWT path.
 *
 * The body is {run_id, owner_id}: the trigger knows both. The route reads no table. The run handler's begin
 * (`_canvas_draft_run_begin(p_run, p_owner)`) proves the run is that owner's, and answers `gone` for any other pair, exactly as it does for
 * the browser's start request, so the secret alone cannot start a run for the wrong person.
 *
 * Gate order: the secret (401), the body (400), drafting enabled (503), that owner's terms (409, P1544), then the same run handler the
 * browser's start request uses, acting for that owner. A failed transcript is not handled here: the database settles it (no model call,
 * no charge), so this route is only ever asked to START a run.
 *
 * Everything the route needs is a seam, so it carries no Deno or esm.sh import (src/tests/p1536-x9-internal-route.test.ts).
 */

import { TERMS_NOT_ACCEPTED_BODY, TERMS_NOT_ACCEPTED_STATUS } from './terms-gate.ts';

export const INTERNAL_HEADER = 'x-canvas-draft-internal';
/** The secret's value while it is not configured: the route is closed (401 for every caller). */
export const INTERNAL_SECRET_OFF = 'not-configured';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface InternalDeps {
  /** CANVAS_DRAFT_INTERNAL_SECRET, or INTERNAL_SECRET_OFF. */
  secret: string;
  /** Canvas drafting is on for this project (the same switch the browser's route reads). */
  enabled: boolean;
  cors: Record<string, string>;
  hasTerms: (ownerId: string) => Promise<boolean>;
  /** The run handler (handleRun) acting for `ownerId`; its begin refuses a run that is not that owner's. Only the run id is handed on. */
  handle: (ownerId: string, body: { run_id: string }) => Promise<Response>;
}

/** Constant-time string equality (length is not secret here). */
export function safeEqual(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a);
  const y = new TextEncoder().encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

export async function handleInternalRun(req: Request, d: InternalDeps): Promise<Response> {
  const json = (body: unknown, status: number) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...d.cors } });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const header = req.headers.get(INTERNAL_HEADER) ?? '';
  if (d.secret === INTERNAL_SECRET_OFF || d.secret === '' || !safeEqual(header, d.secret)) return json({ error: 'Unauthorized' }, 401);

  let body: { run_id?: unknown; owner_id?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid request body', code: 'BAD_REQUEST' }, 400);
  }
  const runId = typeof body?.run_id === 'string' && UUID_RE.test(body.run_id) ? body.run_id : null;
  const owner = typeof body?.owner_id === 'string' && UUID_RE.test(body.owner_id) ? body.owner_id : null;
  if (!runId || !owner) return json({ error: 'run_id and owner_id are required', code: 'BAD_REQUEST' }, 400);
  if (!d.enabled) return json({ error: 'Canvas drafting is not available yet', code: 'DISABLED' }, 503);
  if (!(await d.hasTerms(owner))) return json(TERMS_NOT_ACCEPTED_BODY, TERMS_NOT_ACCEPTED_STATUS);
  return await d.handle(owner, { run_id: runId });
}
