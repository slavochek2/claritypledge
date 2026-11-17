// Deno test: run with
//   deno test --config supabase/functions/deno.json --allow-env supabase/functions/request-letter-response-signin/index.test.ts
//
// P1691. Rule under test: a letter response is stored only when it is no larger than the letter
// itself: at most one rating per story of the letter and one position per story and point sealed
// into it. A larger payload is refused with the generic 400 before the address's mail allowance
// is spent, before any account is created and before anything is stored or mailed. A response
// that fits the letter goes through, and only the two expected fields of each entry are stored.
//
// Every request goes through the function's real index.ts (its environment guards, the real
// client library, its email template and mail transport). The socket is an in-memory stand-in
// (_shared/serve-capture.test-util.ts) and the database, auth server and mail provider are
// answered in memory (_shared/http-backend.test-util.ts). No deploy, no network: the test runs
// without network permission.
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { captureStdServe } from '../_shared/serve-capture.test-util.ts';
import { HttpBackend } from '../_shared/http-backend.test-util.ts';
import { FakeSupabase, linksIn } from '../_shared/fake-supabase.test-util.ts';
import { SERVER_CURRENT_TERMS_VERSION } from '../_shared/terms-version.ts';

const PROJECT = 'http://kong:8000';
const APP = 'https://app.p1691.test';
const GENERIC_500 = 'Something went wrong. Please try again.';
const GENERIC_400 = 'Invalid request. Please check your input and try again.';

Deno.env.set('SUPABASE_URL', PROJECT);
Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'test-only-not-a-real-key');
Deno.env.set('MAILGUN_API_KEY', 'test-only-not-a-real-key');
Deno.env.set('MAILGUN_DOMAIN', 'mail.p1691.test');
Deno.env.set('APP_URL', APP);
Deno.env.set('IP_HASH_SECRET', 'p1691-test-salt');

const server = captureStdServe();
await import('./index.ts');

// The function builds a client per request, and each client starts background timers.
const opts = { sanitizeOps: false, sanitizeResources: false };

const SENDER = '11111111-1111-4111-8111-111111111111';
const LETTER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const PRIVATE_LETTER = 'abababab-abab-4bab-8bab-abababababab';
const STORY_1 = 'b1b1b1b1-b1b1-4b1b-8b1b-b1b1b1b1b1b1';
const STORY_2 = 'b2b2b2b2-b2b2-4b2b-8b2b-b2b2b2b2b2b2';
const POINT_1 = 'd1d1d1d1-d1d1-4d1d-8d1d-d1d1d1d1d1d1';
const POINT_2 = 'd2d2d2d2-d2d2-4d2d-8d2d-d2d2d2d2d2d2';
const POINT_3 = 'd3d3d3d3-d3d3-4d3d-8d3d-d3d3d3d3d3d3';
const POINT_SHARED = 'd4d4d4d4-d4d4-4d4d-8d4d-d4d4d4d4d4d4';
const READER_ADDRESS = 'new-reader@example.com';

/** A well-formed id that is not part of the letter; the size rule does not depend on what the ids are. */
function someId(n: number): string {
  return `eeeeeeee-eeee-4eee-8eee-${String(n).padStart(12, '0')}`;
}

const FULL_RESPONSE = {
  ratings: [{ storyId: STORY_1, rating: 8 }, { storyId: STORY_2, rating: 5 }],
  positions: [
    { pointId: POINT_1, position: 2 },
    { pointId: POINT_2, position: -1 },
    { pointId: POINT_3, position: 0 },
  ],
};

interface Extra {
  rpc?: Record<string, (args: Record<string, unknown>) => unknown>;
  /** Seal POINT_SHARED into both stories, as happens when one point is linked to two stories. */
  sharedPoint?: boolean;
  /** Replace the second story's sealed data with this value (a snapshot with no usable point list). */
  secondStoryConfig?: unknown;
}

function setup(extra: Extra = {}) {
  const sealedPoint = (id: string) => ({ id, text: 'a point', authorPosition: 'agree' });
  const shared = extra.sharedPoint ? [sealedPoint(POINT_SHARED)] : [];
  const db = new FakeSupabase({
    rpc: extra.rpc ?? {},
    tables: {
      clarity_letters: [
        { id: LETTER, sender_id: SENDER, mode: 'one-to-many', status: 'sealed' },
        { id: PRIVATE_LETTER, sender_id: SENDER, mode: 'one-to-one', status: 'sealed' },
      ],
      letter_story_snapshots: [
        {
          letter_id: LETTER, story_id: STORY_1, version_id: 'v1', position: 0,
          point_config: { storyText: 's1', points: [sealedPoint(POINT_1), sealedPoint(POINT_2), ...shared], order: [], hidden: [] },
        },
        {
          letter_id: LETTER, story_id: STORY_2, version_id: 'v2', position: 1,
          point_config: 'secondStoryConfig' in extra
            ? extra.secondStoryConfig
            : { storyText: 's2', points: [sealedPoint(POINT_3), ...shared], order: [], hidden: [] },
        },
      ],
      profiles: [],
      letter_response_pending: [],
    },
  });
  const backend = new HttpBackend(db);

  /** One request through index.ts; `overrides` replace fields of a complete, well-formed body. */
  const send = (overrides: Record<string, unknown> = {}): Promise<Response> =>
    backend.during(() =>
      server.dispatch(new Request('https://fn.p1691.test/request-letter-response-signin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '203.0.113.7' },
        body: JSON.stringify({
          letterId: LETTER,
          name: 'Rae Reader',
          email: READER_ADDRESS,
          termsAccepted: true,
          termsVersion: SERVER_CURRENT_TERMS_VERSION,
          ...FULL_RESPONSE,
          ...overrides,
        }),
      }))
    );
  return { db, sent: backend.mail, seen: backend.seen, send };
}

function reservations(ctx: ReturnType<typeof setup>, bucket: 'ip' | 'target'): number {
  return ctx.db.rpcCalls.filter((c) => c.fn === 'reserve_mail_rate_slot' && c.args.p_bucket === bucket).length;
}

/** The request was refused as oversize, and nothing happened beyond the per-IP reservation. */
async function assertRefusedBeforeAnyEffect(ctx: ReturnType<typeof setup>, res: Response, label: string) {
  assertEquals(res.status, 400, label);
  assertEquals((await res.json()).error, GENERIC_400, label);
  assertEquals(reservations(ctx, 'ip'), 1, `${label}: the per-IP allowance is still spent`);
  assertEquals(reservations(ctx, 'target'), 0, `${label}: the address's mail allowance is not spent`);
  assertEquals(ctx.db.writes.length, 0, `${label}: nothing is stored`);
  assertEquals(ctx.db.createdUsers.length, 0, `${label}: no account is created`);
  assertEquals(ctx.db.links.length, 0, `${label}: no sign-in link is minted`);
  assertEquals(ctx.sent.length, 0, `${label}: no mail is sent`);
}

// ── the entry point itself ────────────────────────────────────────────────────

Deno.test('preflight is answered before any configuration is read', opts, async () => {
  const res = await server.dispatch(new Request('https://fn.p1691.test/request-letter-response-signin', {
    method: 'OPTIONS', headers: { Origin: 'https://claritypledge.com' },
  }));
  assertEquals(res.status, 200);
  assertEquals(res.headers.get('Access-Control-Allow-Origin'), 'https://claritypledge.com');
});

Deno.test('with the project address or the limiter salt missing, the answer is the generic failure and nothing is requested', opts, async () => {
  for (const name of ['SUPABASE_URL', 'IP_HASH_SECRET']) {
    const value = Deno.env.get(name)!;
    Deno.env.delete(name);
    try {
      const ctx = setup();
      const res = await ctx.send();
      assertEquals(res.status, 500, name);
      assertEquals((await res.json()).error, GENERIC_500);
      assert(res.headers.get('Access-Control-Allow-Origin'));
      assertEquals(ctx.seen, [], `nothing is requested without ${name}`);
    } finally {
      Deno.env.set(name, value);
    }
  }
});

// ── the legitimate path is kept ───────────────────────────────────────────────

Deno.test('a complete response to the letter is stored and the reader is mailed a link on the app address', opts, async () => {
  const ctx = setup();
  const res = await ctx.send();
  assertEquals(res.status, 200);
  assertEquals(await res.json(), { ok: true });

  const stored = ctx.db.rows('letter_response_pending');
  assertEquals(stored.length, 1);
  assertEquals(stored[0].letter_id, LETTER);
  assertEquals(stored[0].ratings_json, FULL_RESPONSE.ratings);
  assertEquals(stored[0].positions_json, FULL_RESPONSE.positions);

  assertEquals(ctx.sent.length, 1);
  assertEquals(ctx.sent[0].to, READER_ADDRESS);
  const confirmLink = linksIn(ctx.sent[0].text).find((l) => l.includes('/confirm?token_hash='));
  assert(confirmLink?.startsWith(`${APP}/letter/${LETTER}/confirm?token_hash=`), ctx.sent[0].text);
  assertEquals(ctx.db.createdUsers.map((u) => u.email), [READER_ADDRESS]);
  assertEquals(reservations(ctx, 'ip'), 1);
  assertEquals(reservations(ctx, 'target'), 1);
});

Deno.test('a response that answers only part of the letter, or nothing yet, is stored', opts, async () => {
  for (const partial of [
    { ratings: [{ storyId: STORY_2, rating: 3 }], positions: [] },
    { ratings: [], positions: [{ pointId: POINT_3, position: 3 }] },
    { ratings: [], positions: [] },
  ]) {
    const ctx = setup();
    const res = await ctx.send(partial);
    assertEquals(res.status, 200, JSON.stringify(partial));
    assertEquals(ctx.db.rows('letter_response_pending')[0].ratings_json, partial.ratings);
    assertEquals(ctx.sent.length, 1);
  }
});

Deno.test('the checks that already refuse a request still do', opts, async () => {
  const notPublic = setup();
  const res = await notPublic.send({ letterId: PRIVATE_LETTER });
  assertEquals(res.status, 400);
  assertEquals((await res.json()).error, GENERIC_500, 'a letter that is not public keeps its own generic answer');
  assertEquals(notPublic.sent.length, 0);
  assertEquals(reservations(notPublic, 'target'), 0);

  const badShape = setup();
  assertEquals((await badShape.send({ ratings: [{ storyId: 'not-an-id', rating: 5 }] })).status, 400);
  assertEquals((await badShape.send({ termsAccepted: 'yes' })).status, 400);
  assertEquals(badShape.seen, [], 'a malformed request reaches no limiter and no lookup');

  const limited = setup({ rpc: { reserve_mail_rate_slot: (args) => (args.p_bucket === 'target' ? 3600 : 0) } });
  const refused = await limited.send();
  assertEquals(refused.status, 429);
  assertEquals(limited.sent.length, 0);
  assertEquals(limited.db.writes.length, 0);
});

Deno.test('a point sealed under two stories may be answered once per story', opts, async () => {
  // The reading page sends one position per story and point, so a complete response to this
  // letter carries five positions for four distinct points.
  const positions = [
    { pointId: POINT_1, position: 2 },
    { pointId: POINT_2, position: -1 },
    { pointId: POINT_SHARED, position: 3 },
    { pointId: POINT_3, position: 0 },
    { pointId: POINT_SHARED, position: 3 },
  ];
  const ctx = setup({ sharedPoint: true });
  const res = await ctx.send({ positions });
  assertEquals(res.status, 200);
  assertEquals(ctx.db.rows('letter_response_pending')[0].positions_json, positions);
  assertEquals(ctx.sent.length, 1);

  const oneMore = setup({ sharedPoint: true });
  await assertRefusedBeforeAnyEffect(
    oneMore,
    await oneMore.send({ positions: [...positions, { pointId: POINT_1, position: 1 }] }),
    '6 positions, 5 sealed point entries',
  );
});

Deno.test('a story sealed without a usable point list counts as having no points', opts, async () => {
  for (const config of [null, {}, { points: null }, { points: 'none' }]) {
    const label = JSON.stringify(config);
    const within = setup({ secondStoryConfig: config });
    const ok = await within.send({ positions: FULL_RESPONSE.positions.slice(0, 2) });
    assertEquals(ok.status, 200, label);

    const over = setup({ secondStoryConfig: config });
    await assertRefusedBeforeAnyEffect(over, await over.send(), `3 positions, 2 sealed points, ${label}`);
  }
});

Deno.test('when the letter\'s sealed stories cannot be read, the answer is the generic failure and nothing is stored', opts, async () => {
  const ctx = setup();
  ctx.db.failures['select:letter_story_snapshots'] = 'unavailable';
  const res = await ctx.send();
  assertEquals(res.status, 500);
  assertEquals((await res.json()).error, GENERIC_500);
  assertEquals(ctx.db.writes.length, 0);
  assertEquals(ctx.sent.length, 0);
  assertEquals(reservations(ctx, 'target'), 0);
});

// ── only the two expected fields of each entry are stored ─────────────────────

Deno.test('what is stored is rebuilt from each entry\'s two fields; anything else the caller sent is not kept', opts, async () => {
  const ctx = setup();
  const padding = 'x'.repeat(50_000);
  const res = await ctx.send({
    ratings: [
      { storyId: STORY_1, rating: 8, note: padding, nested: { a: [1, 2, 3] } },
      { storyId: STORY_2, rating: 5, version_id: 'chosen-by-the-caller' },
    ],
    positions: [{ pointId: POINT_1, position: 2, extra: padding }],
  });
  assertEquals(res.status, 200);
  const stored = ctx.db.rows('letter_response_pending')[0];
  assertEquals(stored.ratings_json, [{ storyId: STORY_1, rating: 8 }, { storyId: STORY_2, rating: 5 }]);
  assertEquals(stored.positions_json, [{ pointId: POINT_1, position: 2 }]);
  assert(JSON.stringify(stored).length < 2_000, 'the stored row does not grow with what the caller appended');
});

// ── a response larger than the letter is refused before anything happens ──────

Deno.test('more ratings than the letter has stories is refused', opts, async () => {
  const ctx = setup();
  const ratings = [...FULL_RESPONSE.ratings, { storyId: someId(1), rating: 4 }];
  await assertRefusedBeforeAnyEffect(ctx, await ctx.send({ ratings }), '3 ratings, 2 stories');
});

Deno.test('more positions than the letter has sealed points is refused', opts, async () => {
  const ctx = setup();
  const positions = [...FULL_RESPONSE.positions, { pointId: someId(2), position: 1 }];
  await assertRefusedBeforeAnyEffect(ctx, await ctx.send({ positions }), '4 positions, 3 points');
});

Deno.test('the size rule counts entries, whichever ids they name', opts, async () => {
  const many = Array.from({ length: 500 }, (_, i) => i);
  const bigRatings = setup();
  await assertRefusedBeforeAnyEffect(
    bigRatings,
    await bigRatings.send({ ratings: many.map((i) => ({ storyId: someId(i), rating: 5 })), positions: [] }),
    '500 ratings',
  );
  const repeated = setup();
  await assertRefusedBeforeAnyEffect(
    repeated,
    await repeated.send({ ratings: [], positions: many.slice(0, 4).map(() => ({ pointId: POINT_1, position: 1 })) }),
    'one point named 4 times, 3 points',
  );
});

Deno.test('a full response to a letter whose sealed stories take more than one read is not refused as too large', opts, async () => {
  const ctx = setup();
  ctx.db.maxRows = 1; // every read returns one row, so a one-read lookup would count only the first story
  const res = await ctx.send();
  assertEquals(res.status, 200);
  assertEquals(ctx.db.rows('letter_response_pending').length, 1);
});
