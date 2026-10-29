/**
 * P1576 Part B: in-process GCS V4 signing, plus the three server-side object calls chat-voice needs.
 *
 * Signing is modeled on explain-back-signed-url/index.ts (not the external gcs-signed-url function,
 * which cannot sign x-goog-content-length-range). URLs are PATH-STYLE
 * (`https://storage.googleapis.com/<bucket>/<object>`): that is the one host prod CSP allows in
 * media-src and connect-src, and a virtual-hosted URL (`<bucket>.storage.googleapis.com`) would pass
 * every local run and be blocked live.
 *
 * Server-side reads and deletes go through short-lived signed URLs too, so the function needs no
 * OAuth token exchange: the service-account key it already holds is the only credential.
 */

export interface GcsServiceAccountKey {
  client_email: string;
  private_key: string;
}

export interface GcsSigner {
  bucket: string;
  clientEmail: string;
  privateKey: CryptoKey;
}

export const GCS_HOST = 'storage.googleapis.com';

export async function createGcsSigner(key: GcsServiceAccountKey, bucket: string): Promise<GcsSigner> {
  const pemContents = key.private_key
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s/g, '');
  const der = Uint8Array.from(atob(pemContents), (c) => c.charCodeAt(0));
  const privateKey = await crypto.subtle.importKey(
    'pkcs8', der.buffer, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign'],
  );
  return { bucket, clientEmail: key.client_email, privateKey };
}

const toHex = (buf: Uint8Array) => Array.from(buf).map((b) => b.toString(16).padStart(2, '0')).join('');

async function sha256Hex(data: string): Promise<string> {
  return toHex(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(data))));
}

function rfc3986(str: string): string {
  return encodeURIComponent(str).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

export interface SignOptions {
  method: 'GET' | 'PUT' | 'DELETE';
  objectPath: string;
  /** Lower-case header names. `host` is added when absent. */
  extensionHeaders?: Record<string, string>;
  expiresSeconds: number;
  now?: Date;
}

/** https://cloud.google.com/storage/docs/authentication/signatures */
export async function signUrl(signer: Pick<GcsSigner, 'bucket' | 'clientEmail' | 'privateKey'>, opts: SignOptions): Promise<string> {
  const now = opts.now ?? new Date();
  const timestamp = stamp(now);
  const scope = `${timestamp.slice(0, 8)}/auto/storage/goog4_request`;
  const headers: Record<string, string> = { host: GCS_HOST, ...(opts.extensionHeaders ?? {}) };
  const names = Object.keys(headers).sort();
  const canonicalHeaders = names.map((k) => `${k}:${headers[k]}`).join('\n') + '\n';
  const signedHeaders = names.join(';');

  const query: Record<string, string> = {
    'X-Goog-Algorithm': 'GOOG4-RSA-SHA256',
    'X-Goog-Credential': `${signer.clientEmail}/${scope}`,
    'X-Goog-Date': timestamp,
    'X-Goog-Expires': String(opts.expiresSeconds),
    'X-Goog-SignedHeaders': signedHeaders,
  };
  const canonicalQuery = Object.keys(query).sort().map((k) => `${rfc3986(k)}=${rfc3986(query[k])}`).join('&');
  const resource = `/${signer.bucket}/${opts.objectPath}`;
  const canonicalRequest = [opts.method, resource, canonicalQuery, canonicalHeaders, signedHeaders, 'UNSIGNED-PAYLOAD'].join('\n');
  const stringToSign = ['GOOG4-RSA-SHA256', timestamp, scope, await sha256Hex(canonicalRequest)].join('\n');
  const signature = toHex(new Uint8Array(
    await crypto.subtle.sign('RSASSA-PKCS1-v1_5', signer.privateKey, new TextEncoder().encode(stringToSign)),
  ));
  return `https://${GCS_HOST}${resource}?${canonicalQuery}&X-Goog-Signature=${signature}`;
}

/**
 * The headers an upload URL signs, and the headers the client must therefore send verbatim.
 * `x-goog-if-generation-match: 0` makes the PUT create-only: once the object exists, the same signed
 * URL (valid for its whole TTL) is refused with 412, so the uploader cannot swap in different audio
 * after commit validated it.
 */
export function putHeaders(contentLengthRange: string): Record<string, string> {
  return {
    'content-type': 'audio/wav',
    'x-goog-content-length-range': contentLengthRange,
    'x-goog-if-generation-match': '0',
  };
}

// ── server-side object calls ──────────────────────────────────────────────────

/** What the three calls below need from a signer: one method, so tests can fake it. */
export interface UrlSigner {
  sign: (opts: { method: 'GET' | 'DELETE'; objectPath: string }) => Promise<string>;
}

export function urlSignerFor(signer: GcsSigner, expiresSeconds = 300): UrlSigner {
  return { sign: (o) => signUrl(signer, { method: o.method, objectPath: o.objectPath, expiresSeconds }) };
}

const HEAD_BYTES = 1024;
/** Deadline for one server-side read (head, download). */
const STORAGE_TIMEOUT_MS = 30_000;
/** Deadline for one storage DELETE: short, so a single stuck call cannot use up the sweep's purge share. */
export const STORAGE_DELETE_TIMEOUT_MS = 10_000;

/** First bytes plus total size. null = no such object. Any status other than 200/206/404/416 throws. */
export async function readObjectHead(
  signer: UrlSigner, objectPath: string, fetchImpl: typeof fetch = fetch,
): Promise<{ head: Uint8Array; size: number } | null> {
  const url = await signer.sign({ method: 'GET', objectPath });
  const res = await fetchImpl(url, { headers: { Range: `bytes=0-${HEAD_BYTES - 1}` }, signal: AbortSignal.timeout(STORAGE_TIMEOUT_MS) });
  if (res.status === 404) return null;
  if (res.status === 416) return { head: new Uint8Array(0), size: 0 }; // empty object
  if (res.status !== 200 && res.status !== 206) throw new Error(`GCS head returned ${res.status}`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  const total = /\/(\d+)\s*$/.exec(res.headers.get('Content-Range') ?? '')?.[1];
  // 200 means the server ignored the range and sent the whole (small) object.
  const size = total !== undefined ? Number(total) : bytes.length;
  return { head: bytes.subarray(0, HEAD_BYTES), size };
}

/** A signed GET of the whole object: null when it does not exist, throws on any other failure. */
async function signedGet(signer: UrlSigner, objectPath: string, fetchImpl: typeof fetch): Promise<Response | null> {
  const res = await fetchImpl(await signer.sign({ method: 'GET', objectPath }), { signal: AbortSignal.timeout(STORAGE_TIMEOUT_MS) });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GCS download returned ${res.status}`);
  return res;
}

export async function downloadObject(
  signer: UrlSigner, objectPath: string, fetchImpl: typeof fetch = fetch,
): Promise<Uint8Array | null> {
  const res = await signedGet(signer, objectPath, fetchImpl);
  return res ? new Uint8Array(await res.arrayBuffer()) : null;
}

export async function deleteObject(
  signer: UrlSigner, objectPath: string, fetchImpl: typeof fetch = fetch,
): Promise<'deleted' | 'missing'> {
  const res = await fetchImpl(await signer.sign({ method: 'DELETE', objectPath }), { method: 'DELETE', signal: AbortSignal.timeout(STORAGE_DELETE_TIMEOUT_MS) });
  if (res.status === 404) return 'missing';
  if (res.status === 204 || res.status === 200) return 'deleted';
  throw new Error(`GCS delete returned ${res.status}`);
}

/**
 * The whole object, but never more than `maxBytes`: a declared Content-Length over the cap is refused before
 * the body is read, and a body without one is cut off as soon as it passes the cap. Throws when over.
 */
export async function downloadObjectCapped(
  signer: UrlSigner, objectPath: string, maxBytes: number, fetchImpl: typeof fetch = fetch,
): Promise<Uint8Array | null> {
  const res = await signedGet(signer, objectPath, fetchImpl);
  if (!res) return null;
  const declared = Number(res.headers.get('Content-Length'));
  if (Number.isFinite(declared) && declared > maxBytes) {
    await res.body?.cancel();
    throw new Error('GCS object larger than the voice cap');
  }
  const reader = res.body?.getReader();
  if (!reader) return new Uint8Array(0);
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > maxBytes) {
      await reader.cancel();
      throw new Error('GCS object larger than the voice cap');
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) { out.set(c, at); at += c.length; }
  return out;
}
