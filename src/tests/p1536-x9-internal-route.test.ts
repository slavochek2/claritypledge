/**
 * P1536 section 3c, X9 (S3c.6): the internal, service-only route by which the database starts a canvas run when a voice note's
 * transcript lands (supabase/functions/_shared/canvas-internal.ts, wired in canvas-draft/index.ts). The pattern is P1576's for the
 * mirror reply: a shared secret in a header, never a JWT, and a request that carries the header never falls back to the JWT path.
 *
 * The body is {run_id, owner_id} (the trigger knows both); the route reads no table, and the run's begin proves the pair.
 * Gate order, pinned here: secret, body, enabled, the owner's terms, then the SAME run handler the browser's start request uses,
 * acting for that owner. Each refusal sits beside the call succeeding (the control).
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  INTERNAL_HEADER, INTERNAL_SECRET_OFF, handleInternalRun, type InternalDeps,
} from '../../supabase/functions/_shared/canvas-internal';
import { handleRun, type HandlerCtx } from '../../supabase/functions/_shared/canvas-handlers';
import { stubCaller } from '../../supabase/functions/_shared/canvas-model';

const SECRET = 'internal-secret-value';
const RUN = '11111111-1111-4111-8111-111111111111';
const OWNER = '22222222-2222-4222-8222-222222222222';
const read = (rel: string) => readFileSync(resolve(process.cwd(), rel), 'utf8');

interface Spy { terms: string[]; handled: Array<{ owner: string; body: Record<string, unknown> }> }
function deps(over: Partial<InternalDeps> = {}): InternalDeps & { spy: Spy } {
  const spy: Spy = { terms: [], handled: [] };
  return {
    spy,
    secret: SECRET,
    enabled: true,
    cors: {},
    hasTerms: (id) => { spy.terms.push(id); return Promise.resolve(true); },
    handle: (owner, body) => {
      spy.handled.push({ owner, body });
      return Promise.resolve(new Response(JSON.stringify({ state: 'running', run_id: body.run_id }), { status: 202 }));
    },
    ...over,
  };
}
const BODY = { run_id: RUN, owner_id: OWNER };
const post = (body: unknown, header: string | null = SECRET) => new Request('https://example.com/functions/v1/canvas-draft', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', ...(header === null ? {} : { [INTERNAL_HEADER]: header }) },
  body: typeof body === 'string' ? body : JSON.stringify(body),
});
const call = async (d: InternalDeps, req: Request) => { const r = await handleInternalRun(req, d); return { status: r.status, json: await r.json().catch(() => ({})) }; };

describe('X9 internal route: who may call it', () => {
  it('CONTROL: the right secret and a known run hand the run to the handler, for the run\'s owner', async () => {
    const d = deps();
    const r = await call(d, post(BODY));
    expect(r).toEqual({ status: 202, json: { state: 'running', run_id: RUN } });
    expect(d.spy.handled).toEqual([{ owner: OWNER, body: { run_id: RUN } }]);
    expect(d.spy.terms).toEqual([OWNER]);
  });

  it('a wrong secret, an empty one and a missing header are 401, and nothing is looked up or run', async () => {
    for (const header of ['wrong', '', INTERNAL_SECRET_OFF, SECRET.slice(0, -1), `${SECRET}x`]) {
      const d = deps();
      expect((await call(d, post(BODY, header))).status, JSON.stringify(header)).toBe(401);
      expect(d.spy.terms.length + d.spy.handled.length, JSON.stringify(header)).toBe(0);
    }
  });

  it('while the secret is not configured the route is closed, even to a caller who sends the off value', async () => {
    for (const secret of [INTERNAL_SECRET_OFF, '']) {
      const d = deps({ secret });
      expect((await call(d, post(BODY, secret))).status, JSON.stringify(secret)).toBe(401);
      expect(d.spy.handled.length).toBe(0);
    }
  });
});

describe('X9 internal route: the run it may start', () => {
  it('a body that is not JSON, or lacks a run id or an owner id, or has one that is not a uuid, is 400', async () => {
    for (const body of ['not json', {}, { run_id: RUN }, { owner_id: OWNER }, { run_id: 5, owner_id: OWNER }, { run_id: 'x', owner_id: OWNER }, { run_id: RUN, owner_id: 'x' }, { job_id: RUN, owner_id: OWNER }]) {
      const d = deps();
      expect((await call(d, post(body))).status, JSON.stringify(body)).toBe(400);
      expect(d.spy.handled.length).toBe(0);
    }
  });

  it('only the run id travels on to the handler, for the owner the trigger named', async () => {
    const d = deps();
    await call(d, post({ ...BODY, extra: 'x', p_owner: '33333333-3333-4333-8333-333333333333' }));
    expect(d.spy.handled).toEqual([{ owner: OWNER, body: { run_id: RUN } }]);
  });

  it('drafting switched off is 503 DISABLED before the run is even looked up', async () => {
    const d = deps({ enabled: false });
    const r = await call(d, post(BODY));
    expect(r).toMatchObject({ status: 503, json: { code: 'DISABLED' } });
    expect(d.spy.terms.length + d.spy.handled.length).toBe(0);
  });

  it('an owner who has not accepted the current terms is 409 and no run is begun (P1544)', async () => {
    const d = deps({ hasTerms: () => Promise.resolve(false) });
    const r = await call(d, post(BODY));
    expect(r).toMatchObject({ status: 409, json: { code: 'TERMS_NOT_ACCEPTED' } });
    expect(d.spy.handled.length).toBe(0);
  });

  it('only POST is served', async () => {
    const d = deps();
    const r = await handleInternalRun(new Request('https://example.com', { method: 'GET', headers: { [INTERNAL_HEADER]: SECRET } }), d);
    expect(r.status).toBe(405);
    expect(d.spy.handled.length).toBe(0);
  });
});

describe('X9 internal route: it starts the run exactly as the browser\'s start does', () => {
  const ctx = (rpc: HandlerCtx['service']['rpc']): HandlerCtx => ({
    userId: 'unused', model: stubCaller(), cors: {}, afterResponse: () => undefined, readLink: () => Promise.resolve(null), service: { rpc },
  });
  it('through handleRun: begin is asked for the named owner, and a run that is already going is not begun twice', async () => {
    const begins: Array<Record<string, unknown>> = [];
    const c = ctx((name, args) => { begins.push({ name, ...args }); return Promise.resolve({ data: { status: 'running', run_id: RUN }, error: null }); });
    const d = deps({ handle: (owner, body) => handleRun({ ...c, userId: owner }, body) });
    const res = await call(d, post(BODY));
    expect(res.status).toBe(202); // 'running' on a run that is already going: no second model call
    expect(begins).toHaveLength(1);
    expect(begins[0]).toMatchObject({ name: '_canvas_draft_run_begin', p_run: RUN, p_owner: OWNER });
  });
  it('a pair that is not a run and its owner (begin says gone) starts nothing: the secret alone cannot start another person\'s run', async () => {
    const c = ctx(() => Promise.resolve({ data: { status: 'gone' }, error: null }));
    const d = deps({ handle: (owner, body) => handleRun({ ...c, userId: owner }, body) });
    const res = await call(d, post({ run_id: RUN, owner_id: '33333333-3333-4333-8333-333333333333' }));
    expect(res).toMatchObject({ status: 409, json: { code: 'GONE' } });
  });
});

describe('X9 internal route: wiring in canvas-draft/index.ts', () => {
  const src = read('supabase/functions/canvas-draft/index.ts');
  const at = (t: string) => src.indexOf(t);
  it('a request that carries the header is internal only: it is answered before any JWT is read, and never falls through to it', () => {
    expect(at(`req.headers.get(INTERNAL_HEADER)`)).toBeGreaterThan(-1);
    expect(at(`req.headers.get(INTERNAL_HEADER)`)).toBeLessThan(at('await verifiedUser(req)')); // the only place a JWT is read
    expect(src).toContain('return await handleInternalRun(req, internalDeps(cors))');
  });
  it('the secret has the explicit off default, read from its own env name, and the internal run uses the same gates as the browser\'s', () => {
    expect(src).toContain("Deno.env.get('CANVAS_DRAFT_INTERNAL_SECRET') ?? INTERNAL_SECRET_OFF");
    expect(src).toContain('callerHasCurrentTerms(service,'); // the browser's own gates stay
    expect(src).toContain('resolveEnabled(ENABLED_FLAG');
  });
  it('the internal route never uses the stub model: it has no stub header to send, and its seams are the real model, the same switch and the terms gate', () => {
    const internal = src.slice(at('function internalDeps('), at('Deno.serve('));
    expect(internal).toContain('geminiCaller(GEMINI_KEY)');
    expect(internal).toContain('resolveEnabled(ENABLED_FLAG, GEMINI_KEY !== KEY_OFF, false)');
    expect(internal).toContain('callerHasCurrentTerms(svc,');
    expect(internal).not.toMatch(/stubCaller|stubAllowed|STUB_HEADER/);
    expect(internal).not.toMatch(/\.from\(/); // reads no table
  });

});
