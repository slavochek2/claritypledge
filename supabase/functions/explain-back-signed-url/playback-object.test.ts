// Deno test: run with
//   deno test --config supabase/functions/deno.json --allow-env supabase/functions/explain-back-signed-url/playback-object.test.ts
//
// P1691. Rule under test: a playback link names the object that belongs to the explain-back row
// itself, {delivery_id}/{story_id}.webm. The location stored in the row's audio_storage_path
// column is used only when it has exactly that shape and its two ids are the row's own delivery
// and story ids (in any letter case); otherwise the link is built from the row's ids. New
// uploads are always named with lower-case ids.
//
// No deploy and no network: the test captures the handler index.ts hands to Deno.serve (the
// technique of generate-banner/entity-type-contract.test.ts) and answers the function's own
// database and auth requests from an in-memory table set. The stand-in honours `select=`, so a
// column the function does not ask for is not handed to it. The signing key is generated here.
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';

type Handler = (req: Request) => Response | Promise<Response>;
type Row = Record<string, unknown>;

const SUPABASE_URL = 'http://supabase.p1691.test';
const BUCKET = 'p1691-explain-backs';

const SENDER = '11111111-1111-4111-8111-111111111111';
const RECEIVER = '22222222-2222-4222-8222-222222222222';
const OTHER_RECEIVER = '33333333-3333-4333-8333-333333333333';
const OUTSIDER = '44444444-4444-4444-8444-444444444444';
const LETTER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const STORY = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const DELIVERY = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const OTHER_DELIVERY = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const EXPLAIN_BACK = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const TEXT_EXPLAIN_BACK = 'ffffffff-ffff-4fff-8fff-ffffffffffff';

const OWN_OBJECT = `${DELIVERY}/${STORY}.webm`;
const OTHER_OBJECT = `${OTHER_DELIVERY}/${STORY}.webm`;

const USERS: Record<string, string> = {
  'sender-token': SENDER,
  'receiver-token': RECEIVER,
  'other-receiver-token': OTHER_RECEIVER,
  'outsider-token': OUTSIDER,
};

function freshTables(): Record<string, Row[]> {
  return {
    clarity_letters: [{ id: LETTER, sender_id: SENDER }],
    letter_deliveries: [
      { id: DELIVERY, letter_id: LETTER, receiver_profile_id: RECEIVER },
      { id: OTHER_DELIVERY, letter_id: LETTER, receiver_profile_id: OTHER_RECEIVER },
    ],
    story_explain_backs: [
      {
        id: EXPLAIN_BACK, letter_id: LETTER, story_id: STORY, delivery_id: DELIVERY, recorder_id: RECEIVER,
        medium: 'audio', audio_storage_path: `gs://${BUCKET}/${OWN_OBJECT}`, text_fallback: null,
      },
      {
        id: TEXT_EXPLAIN_BACK, letter_id: LETTER, story_id: STORY, delivery_id: OTHER_DELIVERY, recorder_id: OTHER_RECEIVER,
        medium: 'text', audio_storage_path: null, text_fallback: 'typed instead',
      },
    ],
  };
}

let tables = freshTables();
let afterDeliveryLookup: (() => void) | null = null;

function jsonRes(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

/** In-memory stand-in for the two services the function calls: auth (who is this token) and REST reads. */
function backend(input: string | URL | Request, init?: RequestInit): Promise<Response> {
  const req = input instanceof Request ? input : new Request(String(input), init);
  const url = new URL(req.url);
  if (url.origin !== SUPABASE_URL) {
    return Promise.reject(new Error(`unexpected outbound request: ${url.origin}${url.pathname}`));
  }

  if (url.pathname === '/auth/v1/user') {
    const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
    const id = USERS[token];
    if (!id) return Promise.resolve(jsonRes({ code: 401, msg: 'invalid token' }, 401));
    return Promise.resolve(jsonRes({ id, aud: 'authenticated', role: 'authenticated', email: `${token}@example.com` }));
  }

  const rest = /^\/rest\/v1\/([a-z_]+)$/.exec(url.pathname);
  if (rest && req.method === 'GET') {
    const table = tables[rest[1]];
    if (!table) return Promise.resolve(jsonRes({ code: '42P01', message: `no table ${rest[1]}` }, 404));
    let rows = table;
    let columns: string[] | null = null;
    for (const [key, value] of url.searchParams) {
      if (key === 'select') {
        columns = value === '*' ? null : value.split(',').map((c) => c.trim());
      } else if (value.startsWith('eq.')) {
        // Every filtered column here is a uuid, and the database matches a uuid in any letter case.
        rows = rows.filter((r) => String(r[key]).toLowerCase() === value.slice(3).toLowerCase());
      } else {
        return Promise.resolve(jsonRes({ code: 'TEST', message: `unsupported filter ${key}=${value}` }, 400));
      }
    }
    const projected = rows.map((r) => (columns ? Object.fromEntries(columns.map((c) => [c, r[c]])) : r));
    // Lets a test change the table between the function's first read of a row (which delivery
    // it belongs to) and its second (the row itself). The answer to the first read is already built.
    if (rest[1] === 'story_explain_backs' && columns?.join(',') === 'delivery_id' && afterDeliveryLookup) {
      const change = afterDeliveryLookup;
      afterDeliveryLookup = null;
      change();
    }
    const single = (req.headers.get('Accept') ?? '').includes('application/vnd.pgrst.object+json');
    if (!single) return Promise.resolve(jsonRes(projected));
    if (projected.length !== 1) {
      return Promise.resolve(jsonRes({ code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' }, 406));
    }
    return Promise.resolve(jsonRes(projected[0]));
  }

  return Promise.reject(new Error(`unexpected request: ${req.method} ${url.pathname}`));
}

async function testSigningKeyPem(): Promise<string> {
  const pair = await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['sign', 'verify'],
  );
  const der = new Uint8Array(await crypto.subtle.exportKey('pkcs8', pair.privateKey));
  let binary = '';
  for (const b of der) binary += String.fromCharCode(b);
  const b64 = btoa(binary).replace(/(.{64})/g, '$1\n');
  return `-----BEGIN PRIVATE KEY-----\n${b64}\n-----END PRIVATE KEY-----\n`;
}

Deno.env.set('SUPABASE_URL', SUPABASE_URL);
Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'test-only-not-a-real-key');
Deno.env.set('SUPABASE_ANON_KEY', 'test-only-not-a-real-key');
Deno.env.set('GCS_EXPLAIN_BACK_BUCKET', BUCKET);
Deno.env.set(
  'GCS_SERVICE_ACCOUNT_KEY',
  JSON.stringify({ client_email: 'signer@example.com', private_key: await testSigningKeyPem() }),
);

function swapServe(value: unknown) {
  Object.defineProperty(Deno, 'serve', { configurable: true, writable: true, value });
}

const realServe = Deno.serve;
let captured: Handler | null = null;
swapServe((h: Handler) => {
  captured = h;
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
if (typeof captured !== 'function') throw new Error('index.ts did not register a handler with Deno.serve');
const handler = captured as Handler;

// The function builds its clients per request, and each client starts background timers.
const opts = { sanitizeOps: false, sanitizeResources: false };

async function call(token: string, body: unknown): Promise<{ status: number; body: Row }> {
  const realFetch = globalThis.fetch;
  globalThis.fetch = backend as typeof fetch;
  try {
    const res = await handler(
      new Request('http://explain-back-signed-url.test/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      }),
    );
    return { status: res.status, body: (await res.json().catch(() => ({}))) as Row };
  } finally {
    globalThis.fetch = realFetch;
  }
}

/** The object a signed link addresses: the URL path with the bucket removed. */
function signedObject(signedUrl: unknown): string {
  assert(typeof signedUrl === 'string', 'expected a signed URL');
  const url = new URL(signedUrl);
  assertEquals(url.origin, 'https://storage.googleapis.com');
  assert(url.pathname.startsWith(`/${BUCKET}/`), `link is outside the bucket: ${url.pathname}`);
  return url.pathname.slice(`/${BUCKET}/`.length);
}

function setStoredPath(path: string | null) {
  tables = freshTables();
  const row = tables.story_explain_backs.find((r) => r.id === EXPLAIN_BACK);
  if (!row) throw new Error('fixture row missing');
  row.audio_storage_path = path;
}

// ── the legitimate path is kept ───────────────────────────────────────────────

Deno.test('receiver playback signs the object named by the row\'s delivery and story', opts, async () => {
  tables = freshTables();
  const { status, body } = await call('receiver-token', { mode: 'playback', explainBackId: EXPLAIN_BACK });
  assertEquals(status, 200);
  assertEquals(signedObject(body.signedUrl), OWN_OBJECT);
});

Deno.test('sender playback signs the same object', opts, async () => {
  tables = freshTables();
  const { status, body } = await call('sender-token', { mode: 'playback', explainBackId: EXPLAIN_BACK });
  assertEquals(status, 200);
  assertEquals(signedObject(body.signedUrl), OWN_OBJECT);
});

Deno.test('a caller who is neither sender nor receiver of the row\'s delivery gets no link', opts, async () => {
  tables = freshTables();
  const { status, body } = await call('outsider-token', { mode: 'playback', explainBackId: EXPLAIN_BACK });
  assertEquals(status, 403);
  assertEquals(body.signedUrl, undefined);
});

Deno.test('a row with no audio gets no link', opts, async () => {
  tables = freshTables();
  const typed = await call('other-receiver-token', { mode: 'playback', explainBackId: TEXT_EXPLAIN_BACK });
  assertEquals(typed.status, 404);
  setStoredPath(null);
  const empty = await call('receiver-token', { mode: 'playback', explainBackId: EXPLAIN_BACK });
  assertEquals(empty.status, 404);
  assertEquals(empty.body.signedUrl, undefined);
});

Deno.test('upload still names {delivery}/{story}.webm for the delivery\'s receiver only', opts, async () => {
  tables = freshTables();
  const upload = { mode: 'upload', deliveryId: DELIVERY, storyId: STORY, contentType: 'audio/webm' };
  const mine = await call('receiver-token', upload);
  assertEquals(mine.status, 200);
  assertEquals(signedObject(mine.body.signedUrl), OWN_OBJECT);
  assertEquals(mine.body.storagePath, `gs://${BUCKET}/${OWN_OBJECT}`);
  const sender = await call('sender-token', upload);
  assertEquals(sender.status, 403);
  const other = await call('other-receiver-token', upload);
  assertEquals(other.status, 403);
});

Deno.test('a recording stored under another spelling of the row\'s own ids still plays', opts, async () => {
  // The database returns ids in lower case; an object uploaded through a request that spelled
  // them in upper case exists under that spelling only, and object names are case-sensitive.
  const upperObject = `${DELIVERY.toUpperCase()}/${STORY.toUpperCase()}.webm`;
  const mixedObject = `${DELIVERY.toUpperCase()}/${STORY}.webm`;
  for (const object of [upperObject, mixedObject]) {
    setStoredPath(`gs://${BUCKET}/${object}`);
    for (const token of ['receiver-token', 'sender-token']) {
      const { status, body } = await call(token, { mode: 'playback', explainBackId: EXPLAIN_BACK });
      assertEquals(status, 200, object);
      assertEquals(signedObject(body.signedUrl), object, object);
    }
  }
});

// ── new uploads are named in one spelling ─────────────────────────────────────

Deno.test('upload names the object in lower case whatever spelling the request used', opts, async () => {
  tables = freshTables();
  const { status, body } = await call('receiver-token', {
    mode: 'upload', deliveryId: DELIVERY.toUpperCase(), storyId: STORY.toUpperCase(), contentType: 'audio/webm',
  });
  assertEquals(status, 200);
  assertEquals(signedObject(body.signedUrl), OWN_OBJECT);
  assertEquals(body.storagePath, `gs://${BUCKET}/${OWN_OBJECT}`);
});

// ── the stored location is used only when it names the row's own object ───────

Deno.test('a stored path naming another delivery\'s folder does not change the signed object', opts, async () => {
  setStoredPath(`gs://${BUCKET}/${OTHER_OBJECT}`);
  const { status, body } = await call('receiver-token', { mode: 'playback', explainBackId: EXPLAIN_BACK });
  assertEquals(status, 200);
  assertEquals(signedObject(body.signedUrl), OWN_OBJECT);
});

Deno.test('a stored path naming any other object in the bucket does not change the signed object', opts, async () => {
  for (const stored of [
    `gs://${BUCKET}/${DELIVERY}/../${OTHER_OBJECT}`,
    `gs://${BUCKET}/unrelated/file.bin`,
    `gs://${BUCKET}/${OWN_OBJECT}?generation=1`,
    `gs://${BUCKET}/${DELIVERY}/${STORY}.mp4`,
    `gs://${BUCKET}/${DELIVERY}/${STORY}.webm/extra`,
    `gs://${BUCKET}/${DELIVERY}/extra/${STORY}.webm`,
    `gs://${BUCKET}/${DELIVERY.toUpperCase()}/${OTHER_DELIVERY}.webm`,
    `gs://${BUCKET}//${OWN_OBJECT}`,
  ]) {
    setStoredPath(stored);
    const { status, body } = await call('receiver-token', { mode: 'playback', explainBackId: EXPLAIN_BACK });
    assertEquals(status, 200, stored);
    assertEquals(signedObject(body.signedUrl), OWN_OBJECT, stored);
  }
});

Deno.test('a row that no longer belongs to the delivery the caller was checked against gets no link', opts, async () => {
  // The caller is checked against the delivery the row belonged to at the first read. If the
  // row belongs to another delivery by the time it is read in full, nothing is signed: the
  // caller was never checked against that one.
  tables = freshTables();
  afterDeliveryLookup = () => {
    const row = tables.story_explain_backs.find((r) => r.id === EXPLAIN_BACK)!;
    row.delivery_id = OTHER_DELIVERY;
    row.audio_storage_path = `gs://${BUCKET}/${OTHER_OBJECT}`;
  };
  const { status, body } = await call('receiver-token', { mode: 'playback', explainBackId: EXPLAIN_BACK });
  assertEquals(afterDeliveryLookup, null, 'the row changed between the two reads');
  assertEquals(status, 404);
  assertEquals(body.signedUrl, undefined);
});

Deno.test('the sender\'s link for such a row is the row\'s own object too', opts, async () => {
  setStoredPath(`gs://${BUCKET}/${OTHER_OBJECT}`);
  const { status, body } = await call('sender-token', { mode: 'playback', explainBackId: EXPLAIN_BACK });
  assertEquals(status, 200);
  assertEquals(signedObject(body.signedUrl), OWN_OBJECT);
});
