// Deno test: run with
//   deno test --allow-net --allow-env supabase/functions/generate-banner/entity-type-contract.test.ts
//
// P1189. The e2e case `point: is not a client entity type (400)` in
// e2e/integration/edge-fn-authz-regression.spec.ts calls the TEST project's DEPLOYED
// generate-banner, which still runs the pre-P1189 build — so it reports 403 (the old
// "Point banners can only be generated server-side" service-key guard) and cannot prove
// anything about this branch until someone redeploys.
//
// This file proves the same property against the source in THIS branch, with no deploy and
// no network: it captures the handler `index.ts` hands to `Deno.serve` and calls it directly.
// `validateInput()` runs before the JWT check and before any DB client is used, so a dummy
// env is enough and nothing outbound is contacted.
//
// Discriminating control (this is not a vacuous assertion): running `main`'s pre-fix
// index.ts through the identical probe returns
//   403 {"error":"Point banners can only be generated server-side"}
// where this branch returns
//   400 {"error":"entityType must be one of: event, story, profile"}
// Measured 2026-09-03.
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';

type Handler = (req: Request) => Response | Promise<Response>;

// `Deno.serve` is an accessor on the Deno namespace — assignment throws, defineProperty works.
function swapServe(value: unknown) {
  Object.defineProperty(Deno, 'serve', { configurable: true, writable: true, value });
}

const realServe = Deno.serve;
let handler: Handler | null = null;

Deno.env.set('SUPABASE_URL', 'http://127.0.0.1:1');
Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'test-only-not-a-real-key');
Deno.env.set('SUPABASE_ANON_KEY', 'test-only-not-a-real-key');
Deno.env.set('GEMINI_API_KEY', 'test-only-not-a-real-key');

swapServe((h: Handler) => {
  handler = h;
  return {
    finished: Promise.resolve(),
    shutdown: () => Promise.resolve(),
    ref() {},
    unref() {},
    addr: { transport: 'tcp', hostname: '0.0.0.0', port: 0 },
  };
});
await import('./index.ts');
swapServe(realServe);

if (typeof handler !== 'function') {
  throw new Error('index.ts did not register a handler with Deno.serve');
}
const serve = handler as Handler;

const ENTITY_ID = 'aaaaaaaa-0000-0000-0000-000000000000';

async function post(body: unknown, headers: Record<string, string> = {}) {
  const res = await serve(
    new Request('http://generate-banner.test/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
    }),
  );
  const parsed = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { status: res.status, body: parsed };
}

Deno.test("'point' is not a client entity type — 400 before auth", async () => {
  const { status, body } = await post({ entityType: 'point', entityId: ENTITY_ID });
  assertEquals(status, 400);
  assertEquals(body.error, 'entityType must be one of: event, story, profile');
});

Deno.test("no header revives the deleted point path — 'x-service-key' is ignored", async () => {
  // Pre-fix, a caller presenting the database master key here reached the point branch.
  // The branch is deleted, so the header is now inert: same 400, no 403, no 200.
  for (const value of ['test-only-not-a-real-key', 'anything-at-all', '']) {
    const { status, body } = await post(
      { entityType: 'point', entityId: ENTITY_ID },
      { 'x-service-key': value },
    );
    assertEquals(status, 400, `x-service-key: ${JSON.stringify(value)}`);
    assertEquals(body.error, 'entityType must be one of: event, story, profile');
  }
});

Deno.test('the three real entity types are NOT rejected by validateInput', async () => {
  // False-positive coverage: a guard tested only against inputs it must reject has an
  // unmeasured false-positive rate. Each of these must get PAST validateInput and stop at
  // the JWT gate instead (401), which is the next check in index.ts.
  for (const entityType of ['event', 'story', 'profile']) {
    const { status, body } = await post({ entityType, entityId: ENTITY_ID });
    assertEquals(status, 401, entityType);
    assertEquals(body.error, 'Unauthorized', entityType);
  }
});

Deno.test('the other validateInput rejections are unchanged', async () => {
  assertEquals((await post({ entityId: ENTITY_ID })).status, 400); // missing entityType
  const badId = await post({ entityType: 'event', entityId: 'not-a-uuid' });
  assertEquals(badId.status, 400);
  assertEquals(badId.body.error, 'Invalid entityId format');
});
