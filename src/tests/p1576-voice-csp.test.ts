/**
 * P1576 Part B: a voice note's signed URLs pass prod's CSP.
 *
 * Playback is an <audio> element (media-src) and the upload is a fetch PUT (connect-src). Prod's CSP
 * allows storage.googleapis.com for both and the dev server sends no CSP at all, so a URL on any other
 * host works locally and is blocked live (seven prior prod-only CSP blocks; P1336 caught one by hand).
 *
 * The URLs here come from the real signer (supabase/functions/chat-voice/gcs.ts), not a literal.
 * Controls: a virtual-hosted-style bucket URL and a Supabase Storage URL must FAIL the same check.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createGcsSigner, signUrl } from '../../supabase/functions/chat-voice/gcs';

function cspSources(directive: string): string[] {
  const vercel = JSON.parse(readFileSync(resolve(process.cwd(), 'vercel.json'), 'utf8')) as {
    headers: { headers: { key: string; value: string }[] }[];
  };
  const csp = vercel.headers.flatMap((h) => h.headers).find((h) => h.key === 'Content-Security-Policy')!.value;
  return (csp.split(';').map((d) => d.trim()).find((d) => d.startsWith(`${directive} `)) ?? '').split(/\s+/).slice(1);
}

function allowedBy(url: string, directive: string): boolean {
  return cspSources(directive).some((src) => {
    if (src.startsWith("'")) return false;
    const pattern = new RegExp(`^${src.replace(/[.]/g, '\\.').replace('*', '[^/.]+')}(/|$)`);
    return pattern.test(url);
  });
}

async function signer() {
  const pair = await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true, ['sign', 'verify'],
  );
  const der = new Uint8Array(await crypto.subtle.exportKey('pkcs8', pair.privateKey));
  const pem = `-----BEGIN PRIVATE KEY-----\n${Buffer.from(der).toString('base64')}\n-----END PRIVATE KEY-----\n`;
  return createGcsSigner({ client_email: 'sa@p.iam.gserviceaccount.com', private_key: pem }, 'claritypledge-chat-voice');
}

describe('P1576 voice note URLs pass the production CSP', () => {
  it('playback (GET) is allowed by media-src and connect-src', async () => {
    const url = await signUrl(await signer(), { method: 'GET', objectPath: 'c/u.wav', expiresSeconds: 600 });
    expect(allowedBy(url, 'media-src')).toBe(true);
    expect(allowedBy(url, 'connect-src')).toBe(true);
  });

  it('upload (PUT) is allowed by connect-src', async () => {
    const url = await signUrl(await signer(), {
      method: 'PUT', objectPath: 'c/u.wav', expiresSeconds: 900,
      extensionHeaders: { 'content-type': 'audio/wav', 'x-goog-content-length-range': '44,3841068' },
    });
    expect(allowedBy(url, 'connect-src')).toBe(true);
  });

  it('controls: a virtual-hosted bucket URL and a Supabase Storage URL are blocked', () => {
    expect(allowedBy('https://claritypledge-chat-voice.storage.googleapis.com/c/u.wav?x=1', 'media-src')).toBe(false);
    expect(allowedBy('https://abc.supabase.co/storage/v1/object/sign/chat/u.wav?token=1', 'media-src')).toBe(false);
    expect(allowedBy('blob:https://claritypledge.com/1234', 'media-src')).toBe(false);
  });
});
