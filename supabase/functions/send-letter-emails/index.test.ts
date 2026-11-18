// Deno test: run with
//   deno test --config supabase/functions/deno.json --allow-env supabase/functions/send-letter-emails/index.test.ts
//
// P1691. Rules under test:
//   - the host of every link in a letter invitation comes from the configured app address; the
//     only other source is a request origin that matches the exact development rule in
//     _shared/cors.ts, and only on a project recognised as a test or local target;
//   - one letter mails one mailbox once, however its deliveries spell the address.
//
// Every request goes through the function's real index.ts (its environment guards, the real
// client library, its mail transport). The socket is an in-memory stand-in
// (_shared/serve-capture.test-util.ts) and the database, auth server and mail provider are
// answered in memory (_shared/http-backend.test-util.ts). No deploy, no network: the test runs
// without network permission.
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { captureStdServe } from '../_shared/serve-capture.test-util.ts';
import { HttpBackend, type SentMail } from '../_shared/http-backend.test-util.ts';
import { FakeSupabase, isAuthServerLink, linksIn, type Row } from '../_shared/fake-supabase.test-util.ts';

const APP = 'https://app.p1691.test';
const PROD_PROJECT = 'https://besjtuodziykmjidubzw.supabase.co';
// The project address a function sees inside a self-hosted or local stack.
const TEST_STACK = 'http://kong:8000';
// A hosted project that is not prod: not recognised as a test target.
const OTHER_HOSTED_PROJECT = 'https://abcdefghijklmnopqrst.supabase.co';
const GENERIC_500 = 'Something went wrong. Please try again.';

Deno.env.set('SUPABASE_URL', PROD_PROJECT);
Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'test-only-not-a-real-key');
Deno.env.set('MAILGUN_API_KEY', 'test-only-not-a-real-key');
Deno.env.set('MAILGUN_DOMAIN', 'mail.p1691.test');
Deno.env.set('APP_URL', APP);

const server = captureStdServe();
await import('./index.ts');

// The function builds a client per request, and each client starts background timers.
const opts = { sanitizeOps: false, sanitizeResources: false };

const SENDER = '11111111-1111-4111-8111-111111111111';
const BYSTANDER = '99999999-9999-4999-8999-999999999999';
const REGISTERED = '22222222-2222-4222-8222-222222222222';
const LETTER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const DELIVERY_NEW = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const DELIVERY_REGISTERED = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const TOKEN_NEW = '0a0a0a0a-0a0a-4a0a-8a0a-0a0a0a0a0a0a';
const TOKEN_REGISTERED = '0b0b0b0b-0b0b-4b0b-8b0b-0b0b0b0b0b0b';
const NEW_ADDRESS = 'new-reader@example.com';
const REGISTERED_ADDRESS = 'known-reader@example.com';

/** Links the invitation template always carries, whatever the request says. */
const FIXED_LINKS = new Set([
  'https://claritypledge.com',
  'https://claritypledge.com/terms-of-service',
  'https://claritypledge.com/privacy-policy',
]);

/** Origins that begin like a development origin and are not one. */
const NOT_DEV_ORIGINS = [
  'http://localhost.elsewhere.example.com',
  'http://localhost:1@elsewhere.example.com',
  'http://localhost:5001.elsewhere.example.com',
  'http://localhost:5001@elsewhere.example.com',
  'http://localhostx:5001',
  'http://localhost:5001/',
  'http://localhost:80',
];

interface SetupOptions {
  /** Replaces the two standard deliveries of the letter. */
  deliveries?: Row[];
  /** What the mail provider answers for each send, in order; it accepts once the list runs out. */
  transport?: boolean[];
}

function delivery(id: string, address: string, createdAt: string, notifiedAt: string | null = null): Row {
  return {
    id, letter_id: LETTER, receiver_email: address, receiver_name: null, invitation_token: `token-${id}`,
    notified_at: notifiedAt, receiver_profile_id: null, created_at: createdAt,
  };
}

function setup(project: string, options: SetupOptions = {}) {
  const db = new FakeSupabase({
    tokens: { 'sender-token': SENDER, 'bystander-token': BYSTANDER },
    authUsers: [{
      id: REGISTERED, email: REGISTERED_ADDRESS, email_confirmed_at: '2026-01-01T00:00:00Z',
      identities: [{ provider: 'email' }],
    }],
    tables: {
      clarity_letters: [{ id: LETTER, sender_id: SENDER, mode: 'one-to-one', status: 'sealed' }],
      profiles: [
        { id: SENDER, name: 'Sam Sender', email: 'sam@example.com' },
        { id: REGISTERED, name: 'Kim Known', email: REGISTERED_ADDRESS },
      ],
      letter_deliveries: options.deliveries ?? [
        {
          id: DELIVERY_NEW, letter_id: LETTER, receiver_email: NEW_ADDRESS, receiver_name: 'Nia New',
          invitation_token: TOKEN_NEW, notified_at: null, receiver_profile_id: null, created_at: '2026-11-01T10:00:00Z',
        },
        {
          id: DELIVERY_REGISTERED, letter_id: LETTER, receiver_email: REGISTERED_ADDRESS, receiver_name: null,
          invitation_token: TOKEN_REGISTERED, notified_at: null, receiver_profile_id: null, created_at: '2026-11-01T10:01:00Z',
        },
      ],
    },
  });
  const backend = new HttpBackend(db);
  backend.transport = [...(options.transport ?? [])];

  /** One request through index.ts, as if the function ran against `project`. */
  const send = (origin: string | null, token: string | null = 'sender-token'): Promise<Response> => {
    if (project === '') Deno.env.delete('SUPABASE_URL');
    else Deno.env.set('SUPABASE_URL', project);
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (origin !== null) headers['Origin'] = origin;
    if (token !== null) headers['Authorization'] = `Bearer ${token}`;
    return backend.during(() =>
      server.dispatch(new Request('https://fn.p1691.test/send-letter-emails', {
        method: 'POST',
        headers,
        body: JSON.stringify({ letterId: LETTER }),
      }))
    );
  };
  const notified = () =>
    db.rows('letter_deliveries').filter((d) => d.notified_at !== null).map((d) => d.id).sort();
  /** `sent`: mail the provider accepted. `attempted`: every mail handed to it. */
  return { db, sent: backend.mail, attempted: backend.attempted, seen: backend.seen, send, notified };
}

function mailTo(sent: SentMail[], address: string): SentMail {
  const mail = sent.find((m) => m.to === address);
  assert(mail, `no mail was sent to ${address}`);
  return mail;
}

/** Every link in both invitations, and every sign-in redirect target, sits under `base`. */
function assertLinksUnder(base: string, ctx: ReturnType<typeof setup>, label: string) {
  assertEquals(ctx.sent.length, 2, `${label}: both recipients are mailed`);
  for (const mail of ctx.sent) {
    const links = [...linksIn(mail.html), ...linksIn(mail.text)];
    assert(links.length > 0, `${label}: the mail carries links`);
    for (const link of links) {
      const ok = link.startsWith(`${base}/`) || FIXED_LINKS.has(link) || isAuthServerLink(link);
      assert(ok, `${label}: link host is not the expected one: ${link}`);
    }
  }
  // The recipient without an account gets the plain invitation address.
  const plain = `${base}/letter/${DELIVERY_NEW}?token=${TOKEN_NEW}`;
  assert(mailTo(ctx.sent, NEW_ADDRESS).text.includes(plain), `${label}: plain invitation link`);
  // The recipient with an account gets a sign-in link that returns to the same kind of address.
  assertEquals(ctx.db.links.length, 1, `${label}: one sign-in link is minted`);
  assertEquals(ctx.db.links[0].redirectTo, `${base}/letter/${DELIVERY_REGISTERED}?token=${TOKEN_REGISTERED}`, label);
}

// ── the entry point itself ────────────────────────────────────────────────────

Deno.test('preflight is answered before any configuration is read', opts, async () => {
  const res = await server.dispatch(new Request('https://fn.p1691.test/send-letter-emails', {
    method: 'OPTIONS', headers: { Origin: 'https://claritypledge.com' },
  }));
  assertEquals(res.status, 200);
  assertEquals(res.headers.get('Access-Control-Allow-Origin'), 'https://claritypledge.com');
});

Deno.test('with the project address missing or unusable, the answer is the generic failure and nothing is requested', opts, async () => {
  for (const project of ['', 'not a url']) {
    const ctx = setup(project);
    const res = await ctx.send('http://localhost:5001');
    assertEquals(res.status, 500, `"${project}"`);
    assertEquals((await res.json()).error, GENERIC_500);
    assert(res.headers.get('Access-Control-Allow-Origin'));
    assertEquals(ctx.seen, [], `nothing is requested for "${project}"`);
    assertEquals(ctx.attempted.length, 0);
  }
});

// ── the legitimate path is kept ───────────────────────────────────────────────

Deno.test('with no request origin, links use the configured app address', opts, async () => {
  const ctx = setup(PROD_PROJECT);
  const res = await ctx.send(null);
  assertEquals(res.status, 200);
  assertEquals(await res.json(), { ok: true, sent: 2 });
  assertLinksUnder(APP, ctx, 'no origin');
});

Deno.test('with the live site as request origin, links use the configured app address', opts, async () => {
  const ctx = setup(PROD_PROJECT);
  const res = await ctx.send('https://claritypledge.com');
  assertEquals(res.status, 200);
  assertLinksUnder(APP, ctx, 'site origin');
});

Deno.test('on a recognised test project with a localhost APP_URL, an exact development origin yields local links', opts, async () => {
  Deno.env.set('APP_URL', 'http://localhost:5001');
  try {
    for (const project of [TEST_STACK, 'https://203-0-113-7.sslip.io', 'https://test-server.tailnet-name.ts.net:8443']) {
      for (const origin of ['http://localhost:5001', 'http://localhost:5200', 'http://localhost:6100']) {
        const ctx = setup(project);
        const res = await ctx.send(origin);
        assertEquals(res.status, 200, `${origin} on ${project}`);
        assertLinksUnder(origin, ctx, `${origin} on ${project}`);
      }
    }
  } finally {
    Deno.env.set('APP_URL', APP);
  }
});

Deno.test('on a recognised test project whose APP_URL is not localhost, an exact development origin yields APP_URL', opts, async () => {
  const ctx = setup(TEST_STACK);
  const res = await ctx.send('http://localhost:5200');
  assertEquals(res.status, 200);
  assertLinksUnder(APP, ctx, 'dev origin, deployed APP_URL');
});

Deno.test('each delivery is mailed once: a second request sends nothing', opts, async () => {
  const ctx = setup(PROD_PROJECT);
  await ctx.send(null);
  const again = await ctx.send(null);
  assertEquals(await again.json(), { ok: true, sent: 0 });
  assertEquals(ctx.sent.length, 2);
});

Deno.test('only the letter\'s sender can trigger its mail', opts, async () => {
  const ctx = setup(PROD_PROJECT);
  assertEquals((await ctx.send(null, null)).status, 401);
  assertEquals((await ctx.send(null, 'nobody')).status, 401);
  assertEquals((await ctx.send(null, 'bystander-token')).status, 404);
  assertEquals(ctx.attempted.length, 0);
  assertEquals(ctx.db.links.length, 0);
});

// ── the link host comes only from configuration or the exact development rule ──

for (const origin of NOT_DEV_ORIGINS) {
  Deno.test(`a request origin that is not an exact development origin never becomes the link host: ${origin}`, opts, async () => {
    for (const project of [PROD_PROJECT, TEST_STACK]) {
      const ctx = setup(project);
      const res = await ctx.send(origin);
      assertEquals(res.status, 200);
      assertLinksUnder(APP, ctx, `${origin} on ${project}`);
    }
  });
}

Deno.test('on the prod project, even an exact development origin yields the configured app address', opts, async () => {
  const ctx = setup(PROD_PROJECT);
  const res = await ctx.send('http://localhost:5001');
  assertEquals(res.status, 200);
  assertLinksUnder(APP, ctx, 'dev origin on prod');
});

Deno.test('on a project that is not a known test project, an exact development origin yields the configured app address', opts, async () => {
  for (const project of [OTHER_HOSTED_PROJECT, 'https://unknown-project.example.com', 'https://besjtuodziykmjidubzw.supabase.co.elsewhere.example.com']) {
    const ctx = setup(project);
    const res = await ctx.send('http://localhost:5001');
    assertEquals(res.status, 200, project);
    assertLinksUnder(APP, ctx, `dev origin on "${project}"`);
  }
});

// ── one mail per address per letter ───────────────────────────────────────────
// A letter can hold several deliveries whose addresses differ only in letter case or outer
// spaces. They reach one mailbox, so the letter mails that mailbox once.

const A1 = 'e1e1e1e1-e1e1-4e1e-8e1e-e1e1e1e1e1e1';
const A2 = 'e2e2e2e2-e2e2-4e2e-8e2e-e2e2e2e2e2e2';
const A3 = 'e3e3e3e3-e3e3-4e3e-8e3e-e3e3e3e3e3e3';
const B1 = 'f1f1f1f1-f1f1-4f1f-8f1f-f1f1f1f1f1f1';

Deno.test('deliveries of one letter whose addresses differ only in case or outer spaces get one mail', opts, async () => {
  const ctx = setup(PROD_PROJECT, {
    deliveries: [
      delivery(A2, 'reader@example.com', '2026-11-01T10:01:00Z'),
      delivery(A1, 'Reader@Example.com', '2026-11-01T10:00:00Z'),
      delivery(A3, ' READER@example.com ', '2026-11-01T10:02:00Z'),
      delivery(B1, 'someone-else@example.com', '2026-11-01T10:03:00Z'),
    ],
  });
  const res = await ctx.send(null);
  assertEquals(await res.json(), { ok: true, sent: 2 });
  assertEquals(ctx.sent.map((m) => m.to).sort(), ['Reader@Example.com', 'someone-else@example.com']);
  // The earliest delivery is the one mailed; the others are not marked as notified.
  assertEquals(ctx.notified(), [A1, B1].sort());

  const again = await ctx.send(null);
  assertEquals(await again.json(), { ok: true, sent: 0 });
  assertEquals(ctx.attempted.length, 2, 'a later request does not mail the held deliveries');
  assertEquals(ctx.notified(), [A1, B1].sort());
});

Deno.test('a delivery added later under another spelling of an address already mailed is not mailed', opts, async () => {
  const ctx = setup(PROD_PROJECT, {
    deliveries: [
      delivery(A1, 'reader@example.com', '2026-11-01T10:00:00Z', '2026-11-01T10:00:05Z'),
      delivery(A2, 'READER@EXAMPLE.COM', '2026-11-02T09:00:00Z'),
      delivery(B1, 'someone-else@example.com', '2026-11-02T09:01:00Z'),
    ],
  });
  const res = await ctx.send(null);
  assertEquals(await res.json(), { ok: true, sent: 1 });
  assertEquals(ctx.sent.map((m) => m.to), ['someone-else@example.com']);
  assertEquals(ctx.notified(), [A1, B1].sort());
});

Deno.test('when a mail is not accepted, the mailbox is still mailed exactly once by a later request', opts, async () => {
  const ctx = setup(PROD_PROJECT, {
    transport: [false],
    deliveries: [
      delivery(A1, 'reader@example.com', '2026-11-01T10:00:00Z'),
      delivery(A2, 'Reader@example.com', '2026-11-01T10:01:00Z'),
    ],
  });
  const first = await ctx.send(null);
  assertEquals(await first.json(), { ok: true, sent: 0 });
  assertEquals(ctx.attempted.length, 1, 'one attempt, not one per spelling');
  assertEquals(ctx.notified(), [], 'a failed send leaves nothing marked as notified');

  const second = await ctx.send(null);
  assertEquals(await second.json(), { ok: true, sent: 1 });
  assertEquals(ctx.sent.length, 1);
  assertEquals(ctx.notified(), [A1]);

  const third = await ctx.send(null);
  assertEquals(await third.json(), { ok: true, sent: 0 });
  assertEquals(ctx.sent.length, 1);
});

/** `count` notified deliveries with distinct addresses, plus one that sorts last. */
function earlierDeliveries(count: number): Row[] {
  const rows: Row[] = [];
  for (let i = 0; i < count; i++) {
    const id = `0000${String(i).padStart(4, '0')}-0000-4000-8000-000000000000`;
    rows.push(delivery(id, `reader-${i}@example.com`, '2026-10-01T10:00:00Z', '2026-10-01T10:00:05Z'));
  }
  rows.push(delivery('ffffffff-0000-4000-8000-000000000000', 'late-match@example.com', '2026-10-01T10:00:00Z', '2026-10-01T10:00:05Z'));
  return rows;
}

Deno.test('the already-mailed check covers every notified delivery of the letter, however many there are', opts, async () => {
  // The matching earlier delivery sorts last, well past one page of results.
  const ctx = setup(PROD_PROJECT, {
    deliveries: [...earlierDeliveries(1200), delivery(A1, 'Late-Match@example.com', '2026-11-02T09:00:00Z')],
  });
  const res = await ctx.send(null);
  assertEquals(await res.json(), { ok: true, sent: 0 });
  assertEquals(ctx.attempted.length, 0);
});

Deno.test('the already-mailed check still reads to the end when the server returns fewer rows per read than asked', opts, async () => {
  const ctx = setup(PROD_PROJECT, {
    deliveries: [...earlierDeliveries(700), delivery(A1, 'Late-Match@example.com', '2026-11-02T09:00:00Z')],
  });
  ctx.db.maxRows = 300; // every read is cut short, so a short page does not mean the last page
  const res = await ctx.send(null);
  assertEquals(await res.json(), { ok: true, sent: 0 });
  assertEquals(ctx.attempted.length, 0);
});

Deno.test('when the already-mailed addresses cannot be read, nothing is mailed and nothing is marked', opts, async () => {
  const ctx = setup(PROD_PROJECT, {
    deliveries: [delivery(A1, 'reader@example.com', '2026-11-01T10:00:00Z')],
  });
  // Reads 1 and 2 list the deliveries still to notify (one page, then the empty page that ends
  // the list); read 3 is the first read of those already notified.
  ctx.db.failNth['select:letter_deliveries'] = 3;
  const res = await ctx.send(null);
  assertEquals(res.status, 500);
  assertEquals((await res.json()).error, GENERIC_500);
  assertEquals(ctx.attempted.length, 0);
  assertEquals(ctx.notified(), []);

  // Once the read works again the delivery is mailed.
  const retry = await ctx.send(null);
  assertEquals(await retry.json(), { ok: true, sent: 1 });
});

Deno.test('held-back deliveries never hide a new recipient, however many of them there are', opts, async () => {
  // 1,000 un-notified spellings of an address already mailed stay un-notified for good. They sort
  // first, so a one-page read of the un-notified list would never reach the new recipient.
  const held: Row[] = [delivery(A1, 'dup@example.com', '2026-10-01T10:00:00Z', '2026-10-01T10:00:05Z')];
  for (let i = 0; i < 1000; i++) {
    const id = `0000${String(i).padStart(4, '0')}-0000-4000-8000-000000000001`;
    held.push(delivery(id, i % 2 ? 'DUP@example.com' : ' dup@EXAMPLE.com', '2026-10-02T10:00:00Z'));
  }
  const ctx = setup(PROD_PROJECT, {
    deliveries: [...held, delivery('ffffffff-0000-4000-8000-000000000001', 'fresh@example.com', '2026-11-02T09:00:00Z')],
  });
  const res = await ctx.send(null);
  assertEquals(await res.json(), { ok: true, sent: 1 });
  assertEquals(ctx.sent.map((m) => m.to), ['fresh@example.com']);
});

Deno.test('when the deliveries still to notify cannot be read, nothing is mailed and nothing is marked', opts, async () => {
  const ctx = setup(PROD_PROJECT, {
    deliveries: [delivery(A1, 'reader@example.com', '2026-11-01T10:00:00Z')],
  });
  ctx.db.failNth['select:letter_deliveries'] = 1;
  const res = await ctx.send(null);
  assertEquals(res.status, 500);
  assertEquals((await res.json()).error, GENERIC_500);
  assertEquals(ctx.attempted.length, 0);
  assertEquals(ctx.notified(), []);
});

Deno.test('deliveries another request claims while the list is being read do not hide the rest', opts, async () => {
  // 1,001 new recipients: the first read returns 1,000. Before the second read, another request
  // claims those 1,000. Reading by offset would then ask for rows past 1,000 of a set that now
  // holds one, get none, and never mail the last recipient.
  const rows: Row[] = [];
  for (let i = 0; i < 1000; i++) {
    const id = `0000${String(i).padStart(4, '0')}-0000-4000-8000-000000000002`;
    rows.push(delivery(id, `reader-${i}@example.com`, '2026-11-02T09:00:00Z'));
  }
  const LAST = 'ffffffff-0000-4000-8000-000000000002';
  rows.push(delivery(LAST, 'last-reader@example.com', '2026-11-02T09:00:00Z'));
  const ctx = setup(PROD_PROJECT, { deliveries: rows });
  ctx.db.beforeQuery['select:letter_deliveries'] = (nth) => {
    if (nth !== 2) return;
    for (const d of ctx.db.rows('letter_deliveries')) {
      if (d.id !== LAST) d.notified_at = '2026-11-02T09:00:01Z';
    }
  };
  const res = await ctx.send(null);
  assertEquals(res.status, 200);
  assert(ctx.sent.some((m) => m.to === 'last-reader@example.com'), 'the last recipient is mailed');
  assert(ctx.notified().includes(LAST), 'the last recipient is marked as notified');
});
