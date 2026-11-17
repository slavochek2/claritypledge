// Deno test: run with
//   deno test --config supabase/functions/deno.json supabase/functions/_shared/link-base.test.ts
//
// P1691. The base address of mailed links is the configured app address; a request origin is used
// only when it is an exact development origin AND the project address has the shape of a
// self-hosted or local stack. An unset, empty, unreadable or unrecognised project address, and
// any hosted project, counts as prod.
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { isKnownNonProdProject, resolveLinkBase } from './link-base.ts';

const APP = 'https://app.p1691.test';
const PROD = 'https://besjtuodziykmjidubzw.supabase.co';
const DEV = 'http://localhost:5001';

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

Deno.test('on a known test target an exact development origin becomes the link base', () => {
  for (const url of SELF_HOSTED_OR_LOCAL) {
    for (const origin of [DEV, 'http://localhost:5100', 'http://localhost:5899', 'http://localhost:6050', 'http://localhost:6900']) {
      assertEquals(resolveLinkBase(req(origin), APP, url), origin, `${origin} on ${url}`);
    }
  }
});

Deno.test('on anything not known as a test target the link base is the configured app address', () => {
  for (const url of NOT_KNOWN_AS_TEST) {
    assertEquals(resolveLinkBase(req(DEV), APP, url), APP, String(url));
  }
});

Deno.test('an origin that is not an exact development origin is never the link base, on any project', () => {
  const origins = [
    null,
    '',
    'null',
    'http://localhost',
    'http://localhost:80',
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
    // Accepted for CORS, never as a link base: these are https rules, not the development rule.
    'https://claritypledge.com',
    'https://claritypledge-preview-abc.vercel.app',
  ];
  for (const url of [...SELF_HOSTED_OR_LOCAL, PROD, '']) {
    for (const origin of origins) {
      assertEquals(resolveLinkBase(req(origin), APP, url), APP, `${origin} on ${url}`);
    }
  }
});
