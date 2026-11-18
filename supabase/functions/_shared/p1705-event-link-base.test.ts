// Deno test: run with
//   deno test --config supabase/functions/deno.json --allow-env supabase/functions/_shared/p1705-event-link-base.test.ts
//
// P1705 A. Event mail links (confirmation, ticket button, event page, starting-soon fallback)
// take their base from _shared/link-base.ts. These tests exercise the exported builders and
// mintEmailLink that send-event-emails, event-dispatch and starting-soon call. They do NOT go
// through send-event-emails/index.ts: that handler needs auth, RSVP, series and mail-log tables
// that no in-memory stand-in in this repo covers, so the wiring (index.ts passes linkBaseFor(req)
// to the builders and req to mintEmailLink) is checked by deno check and by the source guard.
import { assert, assertEquals, assertFalse } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { buildCancellation, buildConfirmation, buildStartingSoon, buildUncancel, buildUpdate, type EventRow } from './email-helpers.ts';
import { mintEmailLink } from './event-links.ts';
import { linkBaseFor } from './link-base.ts';

const PROD_PROJECT = 'https://besjtuodziykmjidubzw.supabase.co';
const TEST_STACK = 'http://kong:8000';
const DEPLOYED_APP = 'https://app.p1705.test';
const LOCAL_APP = 'http://localhost:5001';
const DEV = 'http://localhost:5200';

const event: EventRow = {
  id: 'e1',
  title: 'Night',
  datetime: '2099-11-20T11:30:00Z',
  duration_minutes: 120,
  timezone: 'Asia/Bangkok',
  location: 'Somewhere 12',
  description: null,
  slug: 'night',
  host_id: 'h',
  preparation_enabled: true,
} as EventRow;

function request(origin: string | null): Request {
  return new Request('https://fn.p1705.test/', { headers: origin === null ? {} : { Origin: origin } });
}

/** Runs `fn` under the given APP_URL and SUPABASE_URL, then restores both. */
async function under<T>(appUrl: string, project: string, fn: () => Promise<T> | T): Promise<T> {
  const saved = { app: Deno.env.get('APP_URL'), project: Deno.env.get('SUPABASE_URL') };
  Deno.env.set('APP_URL', appUrl);
  Deno.env.set('SUPABASE_URL', project);
  try {
    return await fn();
  } finally {
    for (const [k, v] of [['APP_URL', saved.app], ['SUPABASE_URL', saved.project]] as const) {
      if (v === undefined) Deno.env.delete(k);
      else Deno.env.set(k, v);
    }
  }
}

/** A client that only records the ticket insert mintEmailLink makes. */
function fakeClient() {
  // deno-lint-ignore no-explicit-any
  return { from: () => ({ insert: async () => ({ error: null }) }) } as any;
}

/** Everything a confirmation for `req` carries: the ticket button and the event page link. */
async function confirmationFor(req: Request) {
  const prepareUrl = await mintEmailLink(fakeClient(), 'rsvp1', 'prepare', event, req);
  assert(prepareUrl, 'a ticket link is minted');
  const plain = buildConfirmation({ ...event, preparation_enabled: false }, 'Ann', null, linkBaseFor(req));
  const prep = buildConfirmation(event, 'Ann', prepareUrl, linkBaseFor(req));
  return { prepareUrl, plain, prep };
}

Deno.test('a confirmation for a non-main dev port on a test project uses that port', async () => {
  await under(LOCAL_APP, TEST_STACK, async () => {
    const { prepareUrl, plain, prep } = await confirmationFor(request(DEV));
    assert(prepareUrl.startsWith(`${DEV}/auth/event-link?ticket=`), prepareUrl);
    assert(plain.html.includes(`${DEV}/events/night`));
    assert(prep.html.includes(`${DEV}/events/night`));
    assert(prep.text.includes(`Prepare now: ${DEV}/auth/event-link?ticket=`));
  });
});

Deno.test('a confirmation with a deployed APP_URL, a prod-shaped project or an unlisted origin uses APP_URL, whatever the Origin', async () => {
  const cases: Array<[string, string, string | null]> = [
    [DEPLOYED_APP, TEST_STACK, DEV],
    [LOCAL_APP, PROD_PROJECT, DEV],
    [LOCAL_APP, TEST_STACK, 'http://localhost:6000'],
    [LOCAL_APP, TEST_STACK, 'http://localhost:3000'],
    [LOCAL_APP, TEST_STACK, null],
  ];
  for (const [app, project, origin] of cases) {
    await under(app, project, async () => {
      const { prepareUrl, plain } = await confirmationFor(request(origin));
      assert(prepareUrl.startsWith(`${app}/auth/event-link?ticket=`), `${app} ${project} ${origin}: ${prepareUrl}`);
      assert(plain.html.includes(`${app}/events/night`));
      assertFalse(plain.html.includes(`${DEV}/events/`));
    });
  }
});

Deno.test('cancel, uncancel and update mails take the same base', async () => {
  await under(LOCAL_APP, TEST_STACK, () => {
    for (const build of [buildCancellation, buildUncancel, buildUpdate]) {
      assert(build(event, 'Ann', linkBaseFor(request(DEV))).html.includes(`${DEV}/events/night`));
    }
  });
});

Deno.test('a starting-soon fallback link and its tickets use APP_URL when sent with no request', async () => {
  await under(LOCAL_APP, TEST_STACK, async () => {
    // Scheduled senders call with no request: the dev origin never applies.
    const room = await mintEmailLink(fakeClient(), 'rsvp1', 'room', event);
    assert(room?.startsWith(`${LOCAL_APP}/auth/event-link?ticket=`), String(room));
    const noButton = buildStartingSoon(
      { ...event, location: 'https://meet.google.com/x' },
      'Ann',
      { arrivedUrl: null, notYetUrl: null, roomUrl: null },
      linkBaseFor(),
    );
    assert(noButton.html.includes(`${LOCAL_APP}/events/night`), 'the Join fallback is the event page under APP_URL');
  });
  await under(DEPLOYED_APP, TEST_STACK, () => {
    const m = buildStartingSoon({ ...event, slug: null }, 'Ann', { arrivedUrl: null, notYetUrl: null, roomUrl: null });
    assert(m.html.includes(`${DEPLOYED_APP}/events`), 'with no slug the fallback is the events list under APP_URL');
    assertFalse(m.html.includes('https://claritypledge.com/events'));
  });
});

Deno.test('static footer links stay on the prod address', async () => {
  await under(LOCAL_APP, TEST_STACK, () => {
    const m = buildConfirmation({ ...event, preparation_enabled: false }, 'Ann', null, DEV);
    assertEquals(m.html.includes('https://claritypledge.com'), true);
  });
});
