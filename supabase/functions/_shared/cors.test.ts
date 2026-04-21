// Deno test: run with `deno test supabase/functions/_shared/cors.test.ts`
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { resolveAllowedOrigin } from './cors.ts';

function makeReq(origin: string): Request {
  return new Request('https://example.com', {
    headers: origin ? { Origin: origin } : {},
  });
}

Deno.test('prod origin reflects back', () => {
  assertEquals(resolveAllowedOrigin(makeReq('https://claritypledge.com')), 'https://claritypledge.com');
});

Deno.test('w0 localhost:5001 reflects back', () => {
  assertEquals(resolveAllowedOrigin(makeReq('http://localhost:5001')), 'http://localhost:5001');
});

Deno.test('w1 localhost:5100 reflects back', () => {
  assertEquals(resolveAllowedOrigin(makeReq('http://localhost:5100')), 'http://localhost:5100');
});

Deno.test('w2 localhost:5200 reflects back', () => {
  assertEquals(resolveAllowedOrigin(makeReq('http://localhost:5200')), 'http://localhost:5200');
});

Deno.test('w3 localhost:5300 reflects back', () => {
  assertEquals(resolveAllowedOrigin(makeReq('http://localhost:5300')), 'http://localhost:5300');
});

Deno.test('Vercel preview URL reflects back', () => {
  const preview = 'https://claritypledge-abc123.vercel.app';
  assertEquals(resolveAllowedOrigin(makeReq(preview)), preview);
});

Deno.test('unknown origin returns prod default', () => {
  const result = resolveAllowedOrigin(makeReq('https://evil.example.com'));
  assertEquals(result, 'https://claritypledge.com');
});

Deno.test('missing Origin header returns prod default', () => {
  const result = resolveAllowedOrigin(makeReq(''));
  assertEquals(result, 'https://claritypledge.com');
});
