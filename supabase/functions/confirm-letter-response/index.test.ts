// Deno test: run with
//   deno test --config supabase/functions/deno.json --allow-env supabase/functions/confirm-letter-response/index.test.ts
//
// P1691. Rule under test: confirming a stored letter response writes ratings only for stories of
// that letter and positions only for points sealed into that letter (the letter's snapshot is
// the record of both). Anything else in the stored response is left out, each id counts once,
// and a complete response to the letter is written completely.
//
// Every request goes through the function's real index.ts (its environment guard, the real
// client library, both of its clients). The socket is an in-memory stand-in
// (_shared/serve-capture.test-util.ts) and the database and auth server are answered in memory
// (_shared/http-backend.test-util.ts). No deploy, no network: the test runs without network
// permission.
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { captureStdServe } from '../_shared/serve-capture.test-util.ts';
import { HttpBackend } from '../_shared/http-backend.test-util.ts';
import { FakeSupabase, type Row } from '../_shared/fake-supabase.test-util.ts';

const PROJECT = 'http://kong:8000';
const GENERIC_500 = 'Something went wrong. Please try again.';

Deno.env.set('SUPABASE_URL', PROJECT);
Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'test-only-not-a-real-key');
Deno.env.set('SUPABASE_ANON_KEY', 'test-only-not-a-real-key');
Deno.env.set('IP_HASH_SECRET', 'p1691-test-salt');

const server = captureStdServe();
await import('./index.ts');

// The function builds its clients per request, and each client starts background timers.
const opts = { sanitizeOps: false, sanitizeResources: false };

const SENDER = '11111111-1111-4111-8111-111111111111';
const READER = '22222222-2222-4222-8222-222222222222';
const LETTER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTHER_LETTER = 'abababab-abab-4bab-8bab-abababababab';
const STORY_1 = 'b1b1b1b1-b1b1-4b1b-8b1b-b1b1b1b1b1b1';
const STORY_2 = 'b2b2b2b2-b2b2-4b2b-8b2b-b2b2b2b2b2b2';
const VERSION_1 = 'c1c1c1c1-c1c1-4c1c-8c1c-c1c1c1c1c1c1';
const VERSION_2 = 'c2c2c2c2-c2c2-4c2c-8c2c-c2c2c2c2c2c2';
const POINT_1 = 'd1d1d1d1-d1d1-4d1d-8d1d-d1d1d1d1d1d1';
const POINT_2 = 'd2d2d2d2-d2d2-4d2d-8d2d-d2d2d2d2d2d2';
const POINT_3 = 'd3d3d3d3-d3d3-4d3d-8d3d-d3d3d3d3d3d3';
const POINT_SHARED = 'd4d4d4d4-d4d4-4d4d-8d4d-d4d4d4d4d4d4';
// Real rows elsewhere in the product, not part of this letter.
const OUTSIDE_STORY = 'e1e1e1e1-e1e1-4e1e-8e1e-e1e1e1e1e1e1';
const OUTSIDE_POINT = 'e2e2e2e2-e2e2-4e2e-8e2e-e2e2e2e2e2e2';
const OTHER_LETTER_STORY = 'f1f1f1f1-f1f1-4f1f-8f1f-f1f1f1f1f1f1';
const OTHER_LETTER_POINT = 'f2f2f2f2-f2f2-4f2f-8f2f-f2f2f2f2f2f2';

interface Stored {
  ratings: Array<{ storyId: string; rating: number }>;
  positions: Array<{ pointId: string; position: number }>;
}

const FULL_RESPONSE: Stored = {
  ratings: [{ storyId: STORY_1, rating: 8 }, { storyId: STORY_2, rating: 5 }],
  positions: [
    { pointId: POINT_1, position: 2 },
    { pointId: POINT_2, position: -1 },
    { pointId: POINT_3, position: 0 },
  ],
};

interface Extra {
  expiresAt?: string;
  alreadyConfirmed?: boolean;
  /** Seal POINT_SHARED into both stories, as happens when one point is linked to two stories. */
  sharedPoint?: boolean;
  /** Replace the second story's sealed data with this value (a snapshot with no usable point list). */
  secondStoryConfig?: unknown;
}

function setup(stored: Stored | null, extra: Extra = {}) {
  const sealedPoint = (id: string) => ({ id, text: 'a point', authorPosition: 'agree' });
  const shared = extra.sharedPoint ? [sealedPoint(POINT_SHARED)] : [];
  const db = new FakeSupabase({
    tokens: { 'reader-token': READER },
    authUsers: [{ id: READER, email: 'rae@example.com' }],
    tables: {
      clarity_letters: [
        { id: LETTER, sender_id: SENDER, mode: 'one-to-many', status: 'sealed' },
        { id: OTHER_LETTER, sender_id: SENDER, mode: 'one-to-many', status: 'sealed' },
      ],
      letter_story_snapshots: [
        {
          letter_id: LETTER, story_id: STORY_1, version_id: VERSION_1, position: 0,
          point_config: { storyText: 's1', points: [sealedPoint(POINT_1), sealedPoint(POINT_2), ...shared], order: [], hidden: [] },
        },
        {
          letter_id: LETTER, story_id: STORY_2, version_id: VERSION_2, position: 1,
          point_config: 'secondStoryConfig' in extra
            ? extra.secondStoryConfig
            : { storyText: 's2', points: [sealedPoint(POINT_3), ...shared], order: [], hidden: [] },
        },
        {
          letter_id: OTHER_LETTER, story_id: OTHER_LETTER_STORY, version_id: VERSION_2, position: 0,
          point_config: { storyText: 'other', points: [sealedPoint(OTHER_LETTER_POINT)], order: [], hidden: [] },
        },
      ],
      letter_response_pending: stored
        ? [{
          user_id: READER, letter_id: LETTER, name: 'Rae Reader',
          ratings_json: stored.ratings, positions_json: stored.positions,
          terms_version: 'v1.8', expires_at: extra.expiresAt ?? '2099-01-01T00:00:00Z',
        }]
        : [],
      letter_deliveries: extra.alreadyConfirmed
        ? [{ id: 'existing-delivery', letter_id: LETTER, receiver_profile_id: READER }]
        : [],
    },
  });
  const backend = new HttpBackend(db);

  /** One request through index.ts. */
  const send = (token: string | null = 'reader-token'): Promise<Response> => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token !== null) headers['Authorization'] = `Bearer ${token}`;
    return backend.during(() =>
      server.dispatch(new Request('https://fn.p1691.test/confirm-letter-response', {
        method: 'POST',
        headers,
        body: JSON.stringify({ letterId: LETTER }),
      }))
    );
  };
  return { db, seen: backend.seen, send };
}

const storyIds = (rows: Row[]) => rows.map((r) => r.story_id);
const pointIds = (rows: Row[]) => rows.map((r) => r.point_id);

async function confirm(stored: Stored, extra: Extra = {}) {
  const ctx = setup(stored, extra);
  const res = await ctx.send();
  return {
    status: res.status,
    verifications: ctx.db.written('story_verifications', 'insert'),
    pointResponses: ctx.db.written('letter_point_responses', 'insert'),
    livePositions: ctx.db.written('point_positions', 'upsert'),
    deliveries: ctx.db.written('letter_deliveries', 'insert'),
    db: ctx.db,
  };
}

// ── the entry point itself ────────────────────────────────────────────────────

Deno.test('preflight is answered before any configuration is read', opts, async () => {
  const res = await server.dispatch(new Request('https://fn.p1691.test/confirm-letter-response', {
    method: 'OPTIONS', headers: { Origin: 'https://claritypledge.com' },
  }));
  assertEquals(res.status, 200);
  assertEquals(res.headers.get('Access-Control-Allow-Origin'), 'https://claritypledge.com');
});

Deno.test('with the project address missing, the answer is the generic failure and nothing is requested', opts, async () => {
  Deno.env.delete('SUPABASE_URL');
  try {
    const ctx = setup(FULL_RESPONSE);
    const res = await ctx.send();
    assertEquals(res.status, 500);
    assertEquals((await res.json()).error, GENERIC_500);
    assert(res.headers.get('Access-Control-Allow-Origin'));
    assertEquals(ctx.seen, []);
  } finally {
    Deno.env.set('SUPABASE_URL', PROJECT);
  }
});

// ── the legitimate path is kept ───────────────────────────────────────────────

Deno.test('a complete response to the letter is written completely', opts, async () => {
  const out = await confirm(FULL_RESPONSE);
  assertEquals(out.status, 200);

  assertEquals(out.deliveries.length, 1);
  assertEquals(out.deliveries[0].receiver_profile_id, READER);
  assertEquals(out.deliveries[0].receiver_email, 'rae@example.com');
  assertEquals(out.deliveries[0].letter_id, LETTER);
  const deliveryId = out.deliveries[0].id;

  assertEquals(
    out.verifications.map((r) => [r.story_id, r.version_id, r.speaker_id, r.listener_id, r.listener_rating, r.sort_order]),
    [
      [STORY_1, VERSION_1, SENDER, READER, 8, 0],
      [STORY_2, VERSION_2, SENDER, READER, 5, 1],
    ],
  );
  assertEquals(
    out.pointResponses.map((r) => [r.delivery_id, r.point_id, r.position]),
    [
      [deliveryId, POINT_1, 'agree'],
      [deliveryId, POINT_2, 'somewhat_disagree'],
      [deliveryId, POINT_3, 'unsure'],
    ],
  );
  assertEquals(
    out.livePositions.map((r) => [r.point_id, r.user_id, r.position]),
    [
      [POINT_1, READER, 'agree'],
      [POINT_2, READER, 'somewhat_disagree'],
      [POINT_3, READER, 'unsure'],
    ],
  );
  assertEquals(out.db.written('terms_acceptances', 'upsert').length, 1);
  assertEquals(out.db.rows('letter_response_pending').length, 0, 'the stored response is removed once confirmed');
});

Deno.test('a response that answers only part of the letter is written as given', opts, async () => {
  const out = await confirm({ ratings: [{ storyId: STORY_2, rating: 3 }], positions: [{ pointId: POINT_3, position: 3 }] });
  assertEquals(out.status, 200);
  assertEquals(storyIds(out.verifications), [STORY_2]);
  assertEquals(out.verifications[0].version_id, VERSION_2);
  assertEquals(pointIds(out.pointResponses), [POINT_3]);
  assertEquals(pointIds(out.livePositions), [POINT_3]);
});

Deno.test('who may confirm, and when, is unchanged', opts, async () => {
  const signedOut = setup(FULL_RESPONSE);
  assertEquals((await signedOut.send(null)).status, 401);
  assertEquals((await signedOut.send('someone-else')).status, 401);
  assertEquals(signedOut.db.writes.length, 0);
  assertEquals(signedOut.seen.filter((s) => s.includes('/rest/v1/')).length, 0, 'no table is read for an unknown caller');

  const nothingStored = setup(null);
  const expiredAnswer = await nothingStored.send();
  assertEquals(expiredAnswer.status, 410);
  assertEquals((await expiredAnswer.json()).error, 'expired');

  const expired = setup(FULL_RESPONSE, { expiresAt: '2020-01-01T00:00:00Z' });
  assertEquals((await expired.send()).status, 410);
  assertEquals(expired.db.writes.length, 0);

  const repeat = setup(FULL_RESPONSE, { alreadyConfirmed: true });
  assertEquals((await repeat.send()).status, 200);
  assertEquals(repeat.db.writes.length, 0, 'a second confirmation writes nothing');
});

Deno.test('when the letter\'s sealed stories cannot be read, the answer is the generic failure and nothing is written', opts, async () => {
  const ctx = setup(FULL_RESPONSE);
  ctx.db.failures['select:letter_story_snapshots'] = 'unavailable';
  const res = await ctx.send();
  assertEquals(res.status, 500);
  assertEquals((await res.json()).error, GENERIC_500);
  assertEquals(ctx.db.writes.length, 0);
});

// ── only what belongs to the letter is written ────────────────────────────────

Deno.test('a rating for a story outside the letter is left out; the letter\'s own is written', opts, async () => {
  const out = await confirm({
    ratings: [{ storyId: STORY_1, rating: 8 }, { storyId: OUTSIDE_STORY, rating: 9 }],
    positions: [],
  });
  assertEquals(out.status, 200);
  assertEquals(storyIds(out.verifications), [STORY_1]);
  assertEquals(out.verifications[0].version_id, VERSION_1);
});

Deno.test('a position on a point outside the letter is left out of both stores', opts, async () => {
  const out = await confirm({
    ratings: [],
    positions: [{ pointId: POINT_1, position: 2 }, { pointId: OUTSIDE_POINT, position: 3 }],
  });
  assertEquals(out.status, 200);
  assertEquals(pointIds(out.pointResponses), [POINT_1]);
  assertEquals(pointIds(out.livePositions), [POINT_1]);
});

Deno.test('a story or point of another letter does not count as this letter\'s', opts, async () => {
  const out = await confirm({
    ratings: [{ storyId: OTHER_LETTER_STORY, rating: 7 }],
    positions: [{ pointId: OTHER_LETTER_POINT, position: 1 }],
  });
  assertEquals(out.status, 200);
  assertEquals(out.verifications, []);
  assertEquals(out.pointResponses, []);
  assertEquals(out.livePositions, []);
  assertEquals(out.deliveries.length, 1, 'the reader is still recorded as having responded');
});

Deno.test('a story id is not accepted as a point id, nor a point id as a story id', opts, async () => {
  const out = await confirm({
    ratings: [{ storyId: POINT_1, rating: 7 }],
    positions: [{ pointId: STORY_1, position: 1 }],
  });
  assertEquals(out.status, 200);
  assertEquals(out.verifications, []);
  assertEquals(out.pointResponses, []);
  assertEquals(out.livePositions, []);
});

Deno.test('a point sealed under two stories is answered once per story by the reader and written once', opts, async () => {
  // The reading page sends one position per story and point, so a complete response names such a
  // point twice. Each store holds one row per point, so it is written once and nothing else is lost.
  const out = await confirm({
    ratings: FULL_RESPONSE.ratings,
    positions: [
      { pointId: POINT_1, position: 2 },
      { pointId: POINT_2, position: -1 },
      { pointId: POINT_SHARED, position: 3 },
      { pointId: POINT_3, position: 0 },
      { pointId: POINT_SHARED, position: 3 },
    ],
  }, { sharedPoint: true });
  assertEquals(out.status, 200);
  assertEquals(storyIds(out.verifications), [STORY_1, STORY_2]);
  assertEquals(out.pointResponses.map((r) => [r.point_id, r.position]), [
    [POINT_1, 'agree'], [POINT_2, 'somewhat_disagree'], [POINT_SHARED, 'strongly_agree'], [POINT_3, 'unsure'],
  ]);
  assertEquals(pointIds(out.livePositions), [POINT_1, POINT_2, POINT_SHARED, POINT_3]);
});

Deno.test('an id spelled in another letter case is the same story or point, written in the sealed spelling', opts, async () => {
  const out = await confirm({
    ratings: [{ storyId: STORY_2.toUpperCase(), rating: 6 }],
    positions: [{ pointId: POINT_3.toUpperCase(), position: 1 }],
  });
  assertEquals(out.status, 200);
  assertEquals(out.verifications.map((r) => [r.story_id, r.version_id, r.listener_rating]), [[STORY_2, VERSION_2, 6]]);
  assertEquals(out.pointResponses.map((r) => [r.point_id, r.position]), [[POINT_3, 'somewhat_agree']]);
  assertEquals(out.livePositions.map((r) => [r.point_id, r.position]), [[POINT_3, 'somewhat_agree']]);
});

Deno.test('when the first of two entries for one id is the upper-case spelling, it is the one kept', opts, async () => {
  const out = await confirm({
    ratings: [{ storyId: STORY_1.toUpperCase(), rating: 8 }, { storyId: STORY_1, rating: 1 }],
    positions: [{ pointId: POINT_1.toUpperCase(), position: 2 }, { pointId: POINT_1, position: -3 }],
  });
  assertEquals(out.status, 200);
  assertEquals(out.verifications.map((r) => [r.story_id, r.version_id, r.listener_rating]), [[STORY_1, VERSION_1, 8]]);
  assertEquals(out.pointResponses.map((r) => [r.point_id, r.position]), [[POINT_1, 'agree']]);
  assertEquals(out.livePositions.map((r) => [r.point_id, r.position]), [[POINT_1, 'agree']]);
});

Deno.test('a story sealed without a usable point list has no points; its rating is still written', opts, async () => {
  for (const config of [null, {}, { points: null }, { points: 'none' }, { points: [null, 7, { id: 5 }, {}] }]) {
    const out = await confirm({
      ratings: FULL_RESPONSE.ratings,
      positions: [{ pointId: POINT_1, position: 2 }, { pointId: POINT_3, position: 0 }],
    }, { secondStoryConfig: config });
    assertEquals(out.status, 200, JSON.stringify(config));
    assertEquals(storyIds(out.verifications), [STORY_1, STORY_2]);
    assertEquals(pointIds(out.pointResponses), [POINT_1], JSON.stringify(config));
    assertEquals(pointIds(out.livePositions), [POINT_1]);
  }
});

Deno.test('an id named more than once counts once', opts, async () => {
  const out = await confirm({
    ratings: [{ storyId: STORY_1, rating: 8 }, { storyId: STORY_1, rating: 1 }, { storyId: STORY_1.toUpperCase(), rating: 2 }],
    positions: [{ pointId: POINT_1, position: 2 }, { pointId: POINT_1, position: -3 }, { pointId: POINT_1.toUpperCase(), position: 0 }],
  });
  assertEquals(out.status, 200);
  assertEquals(out.verifications.map((r) => [r.story_id, r.listener_rating]), [[STORY_1, 8]]);
  assertEquals(out.pointResponses.map((r) => [r.point_id, r.position]), [[POINT_1, 'agree']]);
  assertEquals(out.livePositions.map((r) => [r.point_id, r.position]), [[POINT_1, 'agree']]);
});

Deno.test('a letter whose sealed stories take more than one read is still answered in full', opts, async () => {
  const ctx = setup(FULL_RESPONSE);
  ctx.db.maxRows = 1; // every read returns one row, so a one-read lookup would see only the first story
  const res = await ctx.send();
  assertEquals(res.status, 200);
  assertEquals(storyIds(ctx.db.written('story_verifications', 'insert')), [STORY_1, STORY_2]);
  assertEquals(pointIds(ctx.db.written('letter_point_responses', 'insert')), [POINT_1, POINT_2, POINT_3]);
});
