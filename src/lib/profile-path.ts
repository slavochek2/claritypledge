/**
 * @file profile-path.ts
 * @description The one place that turns data into an address segment (P1692).
 *
 * A handle, an id or any other value placed in an address is DATA: it must stay exactly one segment, whatever it
 * contains. Interpolating it raw lets a `/`, `?`, `#` or `..` inside the value change which page the address
 * names. Every address built from a handle goes through `profilePath` / `comparePath`; any other value placed
 * in a path goes through `pathSegment`. src/tests/p1692-profile-links.test.tsx fails when a file builds a profile
 * or compare address by hand.
 *
 * Ordinary values are unchanged: letters, digits and `- . _ ~` produce the byte-identical address they always had,
 * and a value in another script lands on the same address as before (the browser encodes it the same way).
 *
 * Two limits no encoding can remove, both for values the handle rule will forbid (P1651):
 *   - a value that is only `.` or `..` cannot be a segment (the browser reads `%2e%2e` as `..` too). It gets a
 *     double-encoded segment, which stays where it is and names no other page;
 *   - the router decodes the sequence `%2F` a second time inside a route parameter, so a value that contains that
 *     literal text reads back with `/` in its place.
 *
 * Never use this to validate, reject or rewrite a stored handle: it only encodes for the address.
 */

/**
 * What a call site may hand over. A missing value is written the way a template literal wrote it before
 * (`null` → "null"), so no address changes for a site whose guard lives elsewhere.
 */
type SegmentValue = string | null | undefined;

/** `value` as exactly one address segment. */
export function pathSegment(value: SegmentValue): string {
  const encoded = encodeURIComponent(String(value));
  return encoded === '.' || encoded === '..' ? encoded.replace(/\./g, '%252E') : encoded;
}

/** The address of a profile. Append a sub-page as `${profilePath(handle)}/partners`. Accepts a handle or a profile id. */
export function profilePath(handle: SegmentValue): string {
  return `/p/${pathSegment(handle)}`;
}

/** The address of the compare page for a handle. */
export function comparePath(handle: SegmentValue): string {
  return `/compare/${pathSegment(handle)}`;
}
