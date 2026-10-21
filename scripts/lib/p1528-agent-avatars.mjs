/**
 * P1528 pure helpers for the agent-avatar backfill (scripts/p1528-agent-avatars-to-media-host.mjs).
 * No I/O, so src/tests/p1528-agent-avatars.test.ts can pin them. The media origin/bucket mirror
 * src/lib/public-media.ts; the test asserts both produce the same URL.
 */
export const MEDIA_ORIGIN = 'https://storage.googleapis.com';
export const MEDIA_BUCKET = 'claritypledge-story-images';
export const CACHE_CONTROL = 'public, max-age=31536000, immutable';
export const AVATAR_SIZE = 256;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (s) => typeof s === 'string' && UUID_RE.test(s);

/** The exact host+path prefix of a Supabase Storage agent-avatars public object. */
export const oldPrefix = (supabaseOrigin) => `${supabaseOrigin}/storage/v1/object/public/agent-avatars/`;

/** Same convention as publicMediaUrl(). */
export const mediaUrl = (path) => `${MEDIA_ORIGIN}/${MEDIA_BUCKET}/${path.replace(/^\/+/, '')}`;

/**
 * Old Supabase URL -> { slug, uuid } or null when it is not exactly an agent-avatars object
 * (wrong host, wrong bucket, query string, extra segments, traversal).
 */
export function parseOldUrl(supabaseOrigin, url) {
  if (typeof url !== 'string' || !url.startsWith(oldPrefix(supabaseOrigin))) return null;
  const key = url.slice(oldPrefix(supabaseOrigin).length);
  const m = /^([a-z0-9][a-z0-9-]*)\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.(?:png|jpe?g|webp)$/i.exec(key);
  return m ? { slug: m[1], uuid: m[2].toLowerCase() } : null;
}

/** Media-bucket object path: prod `agent-avatars/<slug>/<uuid>.webp`, test gets a `test/` prefix. */
export const newObjectPath = (env, { slug, uuid }) =>
  `${env === 'test' ? 'test/' : ''}agent-avatars/${slug}/${uuid}.webp`;

/** Compare the selected profile-id set to the approved manifest. Exact equality or not ok. */
export function checkManifest(selectedIds, manifestIds) {
  const sel = new Set(selectedIds);
  const man = new Set(manifestIds);
  const unexpected = [...sel].filter((i) => !man.has(i));
  const missing = [...man].filter((i) => !sel.has(i));
  return { ok: unexpected.length === 0 && missing.length === 0, unexpected, missing };
}

/** Parse a manifest file body: one UUID per line, `#` comments and blanks ignored; bad line throws. */
export function parseManifest(text) {
  const ids = [];
  for (const raw of text.split('\n')) {
    const line = raw.replace(/#.*/, '').trim();
    if (!line) continue;
    if (!isUuid(line)) throw new Error(`manifest line is not a UUID: ${line}`);
    ids.push(line.toLowerCase());
  }
  if (new Set(ids).size !== ids.length) throw new Error('manifest has duplicate ids');
  return ids;
}

/** Decode the WebP container header (VP8 / VP8L / VP8X). Returns {width,height} or null if not WebP. */
export function webpDimensions(buf) {
  if (buf.length < 30 || buf.toString('latin1', 0, 4) !== 'RIFF' || buf.toString('latin1', 8, 12) !== 'WEBP') return null;
  const fmt = buf.toString('latin1', 12, 16);
  if (fmt === 'VP8 ') {
    if (buf[23] !== 0x9d || buf[24] !== 0x01 || buf[25] !== 0x2a) return null;
    return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
  }
  if (fmt === 'VP8L') {
    if (buf[20] !== 0x2f) return null;
    const b = buf.readUInt32LE(21);
    return { width: (b & 0x3fff) + 1, height: ((b >> 14) & 0x3fff) + 1 };
  }
  if (fmt === 'VP8X') {
    return { width: buf.readUIntLE(24, 3) + 1, height: buf.readUIntLE(27, 3) + 1 };
  }
  return null;
}

/** True only for a WebP of exactly size x size. */
export function isWebpOfSize(buf, size = AVATAR_SIZE) {
  const d = webpDimensions(buf);
  return !!d && d.width === size && d.height === size;
}
