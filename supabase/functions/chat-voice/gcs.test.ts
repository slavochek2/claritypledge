// Deno test: deno test --config supabase/functions/deno.json -A supabase/functions/chat-voice/
// P1576 Part B: V4 signing and the three server-side object calls (head, download, delete).
import { assert, assertEquals, assertMatch, assertRejects } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { createGcsSigner, deleteObject, downloadObject, downloadObjectCapped, putHeaders, readObjectHead, signUrl } from './gcs.ts';

async function testKey() {
  const pair = await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true, ['sign', 'verify'],
  );
  const der = new Uint8Array(await crypto.subtle.exportKey('pkcs8', pair.privateKey));
  let bin = '';
  der.forEach((b) => (bin += String.fromCharCode(b)));
  const pem = `-----BEGIN PRIVATE KEY-----\n${btoa(bin).match(/.{1,64}/g)!.join('\n')}\n-----END PRIVATE KEY-----\n`;
  return { pem, publicKey: pair.publicKey };
}

const hex = (s: string) => Uint8Array.from(s.match(/../g)!.map((h) => parseInt(h, 16)));
const sha256Hex = async (s: string) =>
  [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))].map((b) => b.toString(16).padStart(2, '0')).join('');

Deno.test('signUrl: path-style storage.googleapis.com URL (the only host prod CSP allows)', async () => {
  const { pem } = await testKey();
  const signer = await createGcsSigner({ client_email: 'sa@p.iam.gserviceaccount.com', private_key: pem }, 'my-bucket');
  const url = new URL(await signUrl(signer, { method: 'GET', objectPath: 'c/u.wav', expiresSeconds: 600 }));
  assertEquals(url.origin, 'https://storage.googleapis.com');
  assertEquals(url.pathname, '/my-bucket/c/u.wav');
  assertEquals(url.searchParams.get('X-Goog-Algorithm'), 'GOOG4-RSA-SHA256');
  assertEquals(url.searchParams.get('X-Goog-Expires'), '600');
  assertEquals(url.searchParams.get('X-Goog-SignedHeaders'), 'host');
  assertMatch(url.searchParams.get('X-Goog-Credential')!, /^sa@p\.iam\.gserviceaccount\.com\/\d{8}\/auto\/storage\/goog4_request$/);
  assertMatch(url.searchParams.get('X-Goog-Signature')!, /^[0-9a-f]{512}$/);
});

Deno.test('signUrl: the signature verifies against the public key over the V4 string to sign', async () => {
  const { pem, publicKey } = await testKey();
  const signer = await createGcsSigner({ client_email: 'sa@p.iam.gserviceaccount.com', private_key: pem }, 'my-bucket');
  const now = new Date('2026-10-27T12:00:00Z');
  const headers = { 'content-type': 'audio/wav', host: 'storage.googleapis.com', 'x-goog-content-length-range': '44,100' };
  const url = new URL(await signUrl(signer, { method: 'PUT', objectPath: 'c/u.wav', extensionHeaders: headers, expiresSeconds: 900, now }));

  // rebuild the canonical request independently from the URL the caller receives
  const params = [...url.searchParams.entries()].filter(([k]) => k !== 'X-Goog-Signature')
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
  const canonical = [
    'PUT', '/my-bucket/c/u.wav', params,
    'content-type:audio/wav\nhost:storage.googleapis.com\nx-goog-content-length-range:44,100\n',
    'content-type;host;x-goog-content-length-range', 'UNSIGNED-PAYLOAD',
  ].join('\n');
  const toSign = ['GOOG4-RSA-SHA256', '20261027T120000Z', '20261027/auto/storage/goog4_request', await sha256Hex(canonical)].join('\n');
  const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', publicKey, hex(url.searchParams.get('X-Goog-Signature')!), new TextEncoder().encode(toSign));
  assert(ok, 'signature must verify over the independently rebuilt string to sign');
  assertEquals(url.searchParams.get('X-Goog-SignedHeaders'), 'content-type;host;x-goog-content-length-range');
});

function fakeSigner() {
  return { sign: (o: { method: string; objectPath: string }) => Promise.resolve(`https://storage.googleapis.com/b/${o.objectPath}?m=${o.method}`) };
}

Deno.test('readObjectHead: ranged GET, size from Content-Range', async () => {
  const calls: Array<{ url: string; range: string | null }> = [];
  const fetchImpl = ((url: string, init: RequestInit) => {
    calls.push({ url, range: new Headers(init.headers).get('Range') });
    return Promise.resolve(new Response(new Uint8Array(1024).fill(1), { status: 206, headers: { 'Content-Range': 'bytes 0-1023/3200044' } }));
  }) as unknown as typeof fetch;
  const out = await readObjectHead(fakeSigner(), 'c/u.wav', fetchImpl);
  assertEquals(out!.size, 3200044);
  assertEquals(out!.head.length, 1024);
  assertEquals(calls[0].range, 'bytes=0-1023');
  assertEquals(calls[0].url.includes('m=GET'), true);
});

Deno.test('readObjectHead: small object answered 200 without Content-Range uses its length; 404 is null; 416 is size 0', async () => {
  const f = (r: Response) => (() => Promise.resolve(r)) as unknown as typeof fetch;
  const small = await readObjectHead(fakeSigner(), 'k', f(new Response(new Uint8Array(60), { status: 200 })));
  assertEquals(small!.size, 60);
  assertEquals(await readObjectHead(fakeSigner(), 'k', f(new Response('', { status: 404 }))), null);
  assertEquals((await readObjectHead(fakeSigner(), 'k', f(new Response('', { status: 416 }))))!.size, 0);
});

Deno.test('readObjectHead: any other status throws (a 403 is not "missing")', async () => {
  let threw = false;
  try {
    await readObjectHead(fakeSigner(), 'k', (() => Promise.resolve(new Response('', { status: 403 }))) as unknown as typeof fetch);
  } catch { threw = true; }
  assert(threw);
});

Deno.test('downloadObject: bytes, or null on 404', async () => {
  const f = (r: Response) => (() => Promise.resolve(r)) as unknown as typeof fetch;
  assertEquals(await downloadObject(fakeSigner(), 'k', f(new Response(new Uint8Array([9, 8]), { status: 200 }))), new Uint8Array([9, 8]));
  assertEquals(await downloadObject(fakeSigner(), 'k', f(new Response('', { status: 404 }))), null);
});

Deno.test('deleteObject: 204 deleted, 404 missing, anything else throws', async () => {
  const f = (s: number) => (() => Promise.resolve(new Response(null, { status: s }))) as unknown as typeof fetch;
  assertEquals(await deleteObject(fakeSigner(), 'k', f(204)), 'deleted');
  assertEquals(await deleteObject(fakeSigner(), 'k', f(404)), 'missing');
  let threw = false;
  try { await deleteObject(fakeSigner(), 'k', f(500)); } catch { threw = true; }
  assert(threw);
});

Deno.test('putHeaders: create-only, typed and size-ranged; all three are signed', async () => {
  const h = putHeaders('44,3841068');
  assertEquals(h, {
    'content-type': 'audio/wav',
    'x-goog-content-length-range': '44,3841068',
    // the object may only be CREATED: a replay of this URL after commit cannot overwrite the validated audio
    'x-goog-if-generation-match': '0',
  });
  const { pem } = await testKey();
  const signer = await createGcsSigner({ client_email: 'sa@p.iam.gserviceaccount.com', private_key: pem }, 'b');
  const url = new URL(await signUrl(signer, { method: 'PUT', objectPath: 'c/u/x.wav', extensionHeaders: h, expiresSeconds: 900 }));
  assertEquals(url.searchParams.get('X-Goog-SignedHeaders'), 'content-type;host;x-goog-content-length-range;x-goog-if-generation-match');
});

Deno.test('every server-side storage call carries a deadline (a stalled GCS call cannot hold the sweep)', async () => {
  const signals: Array<AbortSignal | null | undefined> = [];
  const spy = ((_u: string, init?: RequestInit) => {
    signals.push(init?.signal);
    return Promise.resolve(new Response(new Uint8Array(4), { status: 200 }));
  }) as unknown as typeof fetch;
  await readObjectHead(fakeSigner(), 'k', spy);
  await downloadObject(fakeSigner(), 'k', spy);
  await deleteObject(fakeSigner(), 'k', spy);
  assertEquals(signals.length, 3);
  assertEquals(signals.every((s) => s instanceof AbortSignal), true);
});

Deno.test('downloadObjectCapped: an oversized Content-Length is refused without reading the body', async () => {
  let pulled = false;
  const body = new ReadableStream<Uint8Array>({ pull(c) { pulled = true; c.enqueue(new Uint8Array(10)); } }, { highWaterMark: 0 });
  const res = new Response(body, { status: 200, headers: { 'Content-Length': '5000' } });
  const f = (() => Promise.resolve(res)) as unknown as typeof fetch;
  await assertRejects(() => downloadObjectCapped(fakeSigner(), 'k', 1000, f));
  assertEquals(pulled, false);
});

Deno.test('downloadObjectCapped: no Content-Length is cut off once it passes the cap; within the cap returns the bytes; 404 is null', async () => {
  const chunks = (n: number) => new ReadableStream<Uint8Array>({ start(c) { for (let i = 0; i < n; i++) c.enqueue(new Uint8Array(100)); c.close(); } });
  const f = (r: () => Response) => (() => Promise.resolve(r())) as unknown as typeof fetch;
  await assertRejects(() => downloadObjectCapped(fakeSigner(), 'k', 450, f(() => new Response(chunks(10)))));
  assertEquals((await downloadObjectCapped(fakeSigner(), 'k', 450, f(() => new Response(chunks(4)))))!.length, 400);
  assertEquals(await downloadObjectCapped(fakeSigner(), 'k', 450, f(() => new Response('', { status: 404 }))), null);
});
