// Deno test: run with
//   deno test --config supabase/functions/deno.json supabase/functions/_shared/link-base.test.ts
//
// P1691. The base address of mailed links is the configured app address; a request origin is used
// only when it is an exact development origin AND the project address has the shape of a
// self-hosted or local stack. An unset, empty, unreadable or unrecognised project address, and
// any hosted project, counts as prod.
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { isKnownNonProdProject, linkBaseFor } from './link-base.ts';

const APP = 'https://app.p1691.test';
const PROD = 'https://besjtuodziykmjidubzw.supabase.co';
const DEV = 'http://localhost:5001';
const LOCAL_APP = 'http://localhost:5001';

/** Runs `fn` with APP_URL and SUPABASE_URL set (null/undefined = unset), then restores both. */
function withEnv<T>(appUrl: string | null, project: string | null | undefined, fn: () => T): T {
  const saved = { app: Deno.env.get('APP_URL'), project: Deno.env.get('SUPABASE_URL') };
  const put = (k: string, v: string | null | undefined) => (v == null ? Deno.env.delete(k) : Deno.env.set(k, v));
  put('APP_URL', appUrl);
  put('SUPABASE_URL', project);
  try {
    return fn();
  } finally {
    put('APP_URL', saved.app);
    put('SUPABASE_URL', saved.project);
  }
}

/** The link base for `request` under the given configuration. */
function resolve(request: Request | undefined, appUrl: string | null, project: string | null | undefined): string {
  return withEnv(appUrl, project, () => linkBaseFor(request));
}

function req(origin: string | null): Request {
  return new Request('https://fn.p1691.test/', { headers: origin === null ? {} : { Origin: origin } });
}

const SELF_HOSTED_OR_LOCAL = [
  'http://kong:8000',
  'http://localhost:54321',
  'http://127.0.0.1:54321',
  'https://203-0-113-7.sslip.io',
  'https://test-server.tailnet-name.ts.net:8443',
  'https://TEST-SERVER.Tailnet-Name.TS.NET:8443',
];

const NOT_KNOWN_AS_TEST: Array<string | null | undefined> = [
  undefined,
  null,
  '',
  '   ',
  'not a url',
  'besjtuodziykmjidubzw.supabase.co',
  PROD,
  `${PROD}/`,
  'https://BESJTUODZIYKMJIDUBZW.supabase.co',
  // Any hosted project that is not prod is still not a recognised test target.
  'https://abcdefghijklmnopqrst.supabase.co',
  'https://api.claritypledge.com',
  'https://unknown-api.example.com',
  'https://kong.elsewhere.example.com',
  'https://localhost.elsewhere.example.com',
  'https://ts.net',
  'https://sslip.io',
  'https://elsewhere.example.com/?h=.ts.net',
  'https://elsewhere.example.com/203-0-113-7.sslip.io',
  'https://203-0-113-7.sslip.io.elsewhere.example.com',
];

Deno.test('an address with the shape of a self-hosted or local stack is known not to be prod', () => {
  for (const url of SELF_HOSTED_OR_LOCAL) assertEquals(isKnownNonProdProject(url), true, url);
});

Deno.test('an unset, empty, unreadable, hosted or unrecognised project address is not treated as a test target', () => {
  for (const url of NOT_KNOWN_AS_TEST) assertEquals(isKnownNonProdProject(url), false, String(url));
});

Deno.test('on a known test target with a localhost APP_URL an exact development origin becomes the link base', () => {
  for (const url of SELF_HOSTED_OR_LOCAL) {
    for (const origin of [DEV, 'http://localhost:5100', 'http://localhost:5889', 'http://localhost:5898', 'http://localhost:6050', 'http://localhost:6900', 'http://localhost:9909']) {
      assertEquals(resolve(req(origin), LOCAL_APP, url), origin, `${origin} on ${url}`);
    }
  }
  assertEquals(resolve(req('http://localhost:5100'), 'http://127.0.0.1:5001/', SELF_HOSTED_OR_LOCAL[0]), 'http://localhost:5100');
});

Deno.test('APP_URL that is not a localhost address is the link base, whatever the origin and project', () => {
  for (const appUrl of [APP, 'https://localhost:5001', 'http://localhost.elsewhere.example.com', 'https://claritypledge.com', 'not a url', '']) {
    for (const url of SELF_HOSTED_OR_LOCAL) {
      assertEquals(resolve(req(DEV), appUrl, url), appUrl, `${appUrl} on ${url}`);
    }
  }
});

Deno.test('an unset APP_URL is the prod address, trailing slashes are stripped', () => {
  assertEquals(resolve(undefined, null, PROD), 'https://claritypledge.com');
  assertEquals(resolve(req(DEV), null, SELF_HOSTED_OR_LOCAL[0]), 'https://claritypledge.com');
  assertEquals(resolve(undefined, 'https://app.p1691.test///', PROD), APP);
});

Deno.test('on anything not known as a test target the link base is APP_URL, even with a localhost APP_URL', () => {
  for (const url of NOT_KNOWN_AS_TEST) {
    assertEquals(resolve(req(DEV), LOCAL_APP, url), LOCAL_APP, String(url));
    assertEquals(resolve(req('http://localhost:5100'), LOCAL_APP, url), LOCAL_APP, String(url));
  }
  assertEquals(resolve(req('http://localhost:5100'), LOCAL_APP, PROD), LOCAL_APP);
});

Deno.test('no request (a scheduled send) gets APP_URL', () => {
  for (const url of [...SELF_HOSTED_OR_LOCAL, PROD]) assertEquals(resolve(undefined, LOCAL_APP, url), LOCAL_APP);
  assertEquals(resolve(undefined, APP, SELF_HOSTED_OR_LOCAL[0]), APP);
});

Deno.test('an origin that is not in the dev set is never the link base, on any project', () => {
  const origins = [
    null,
    '',
    'null',
    'http://localhost',
    'http://localhost:80',
    'http://localhost:3000',
    'http://localhost:5000',
    'http://localhost:6000',
    'http://localhost:7000',
    'http://localhost:10000',
    'http://localhost:5150',
    'http://localhost:5899', // P1705: was a named port; the named range now ends at 5889 (+9 load-test = 5898)
    'http://localhost:5001/',
    'http://localhost:5001/path',
    'http://localhost:50010',
    'http://localhost:5001.elsewhere.example.com',
    'http://localhost:5001@elsewhere.example.com',
    'http://localhost.elsewhere.example.com',
    'http://localhost:1@elsewhere.example.com',
    'http://localhostx:5001',
    'http://LOCALHOST:5001',
    'https://localhost:5001',
    'http://127.0.0.1:5001',
    'http://elsewhere.example.com',
    'https://elsewhere.example.com',
    // Accepted for CORS, never as a link base: these are https rules, not the dev set.
    'https://claritypledge.com',
    'https://claritypledge-preview-abc.vercel.app',
  ];
  for (const url of [...SELF_HOSTED_OR_LOCAL, PROD, '']) {
    for (const origin of origins) {
      assertEquals(resolve(req(origin), LOCAL_APP, url), LOCAL_APP, `${origin} on ${url}`);
    }
  }
});
