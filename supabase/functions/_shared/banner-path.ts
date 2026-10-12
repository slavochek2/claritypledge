// P1454: the banner functions delete the entity's previous banner with the service role. The
// previous banner's URL comes from a row column the client can write, so it must never be trusted
// to name the file to delete: only a path inside the entity's own folder qualifies.

const SAFE_SEGMENT = /^[A-Za-z0-9_-][A-Za-z0-9._-]*$/;

/**
 * Return the storage path inside `bucket` that `url` names, but only when that path sits directly
 * in `ownFolder` (e.g. `profile/<id>/`) and is a single plain filename. Anything else — another
 * entity's folder, `..`, encoded characters, a query string, a nested path — returns null, which
 * callers treat as "nothing to clean up".
 */
export function ownedBannerPath(
  url: string | null | undefined,
  publicBucketPrefix: string,
  ownFolder: string,
): string | null {
  if (!url || !publicBucketPrefix || !ownFolder.endsWith('/')) return null;
  if (!url.startsWith(publicBucketPrefix)) return null;
  const path = url.slice(publicBucketPrefix.length);
  // UUIDs are case-insensitive; compare the folder canonically, but return the real stored path.
  if (!path.toLowerCase().startsWith(ownFolder.toLowerCase())) return null;
  const file = path.slice(ownFolder.length);
  if (!SAFE_SEGMENT.test(file) || file.includes('..')) return null;
  return path;
}
