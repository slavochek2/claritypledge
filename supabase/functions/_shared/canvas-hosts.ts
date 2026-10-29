/**
 * P1536: which hosts the canvas engine may fetch (SSRF). Pure and dependency-free.
 *
 * https only is enforced by the caller; here: no private, loopback, link-local, CGNAT, multicast,
 * documentation or otherwise non-global address, IPv4 or IPv6, including IPv4 hidden inside an IPv6 form
 * (::ffff:a.b.c.d, 64:ff9b::/96, 6to4). A host is NOT refused merely because it has an AAAA record: its
 * addresses are vetted like the A ones. DNS rebinding between the lookup and the fetch cannot be pinned in
 * the edge runtime (residual risk, recorded in the spec's decisions).
 */

// ── Addresses ───────────────────────────────────────────────────────────────

/** Strict dotted-decimal IPv4 (four octets, no leading zeros, which some stacks read as octal). */
export function parseIPv4(s: string): number[] | null {
  const parts = s.split('.');
  if (parts.length !== 4) return null;
  const out: number[] = [];
  for (const p of parts) {
    if (!/^(0|[1-9][0-9]{0,2})$/.test(p)) return null;
    const n = Number(p);
    if (n > 255) return null;
    out.push(n);
  }
  return out;
}

/** An IPv6 literal as eight 16-bit groups, or null when it is not one. */
export function parseIPv6(input: string): number[] | null {
  let s = input.trim().toLowerCase();
  const zone = s.indexOf('%');
  if (zone >= 0) s = s.slice(0, zone);
  if (!s.includes(':') || /[^0-9a-f:.]/.test(s)) return null;
  // A dotted IPv4 tail stands for the last two groups.
  const lastColon = s.lastIndexOf(':');
  const tail = s.slice(lastColon + 1);
  if (tail.includes('.')) {
    const v4 = parseIPv4(tail);
    if (!v4) return null;
    s = `${s.slice(0, lastColon + 1)}${((v4[0] << 8) | v4[1]).toString(16)}:${((v4[2] << 8) | v4[3]).toString(16)}`;
  }
  const halves = s.split('::');
  if (halves.length > 2) return null;
  const groups = (part: string): string[] | null => {
    if (part === '') return [];
    const g = part.split(':');
    return g.every((x) => /^[0-9a-f]{1,4}$/.test(x)) ? g : null;
  };
  const head = groups(halves[0]);
  const rest = halves.length === 2 ? groups(halves[1]) : [];
  if (!head || !rest) return null;
  let all: string[];
  if (halves.length === 2) {
    const missing = 8 - head.length - rest.length;
    if (missing < 1) return null;
    all = [...head, ...Array(missing).fill('0'), ...rest];
  } else {
    all = head;
  }
  if (all.length !== 8) return null;
  return all.map((x) => parseInt(x, 16));
}

/** Blocked IPv4 ranges as [first address, prefix length]. */
const BLOCKED_V4: ReadonlyArray<readonly [string, number]> = [
  ['0.0.0.0', 8], // "this network"
  ['10.0.0.0', 8],
  ['100.64.0.0', 10], // CGNAT
  ['127.0.0.0', 8], // loopback
  ['169.254.0.0', 16], // link-local, incl. the cloud metadata address
  ['172.16.0.0', 12],
  ['192.0.0.0', 24], // IETF protocol assignments
  ['192.0.2.0', 24], // documentation
  ['192.88.99.0', 24], // 6to4 relay
  ['192.168.0.0', 16],
  ['198.18.0.0', 15], // benchmarking
  ['198.51.100.0', 24], // documentation
  ['203.0.113.0', 24], // documentation
  ['224.0.0.0', 3], // multicast, reserved, broadcast
];

const toInt = (o: number[]) => (((o[0] << 24) | (o[1] << 16) | (o[2] << 8) | o[3]) >>> 0);
const inRange = (n: number, [first, bits]: readonly [string, number]) => {
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return (n & mask) >>> 0 === (toInt(first.split('.').map(Number)) & mask) >>> 0;
};

/** True for an IPv4 address that is not a public unicast one. */
export function isBlockedIPv4(o: number[]): boolean {
  const n = toInt(o);
  return BLOCKED_V4.some((r) => inRange(n, r));
}

const v4Of = (hi: number, lo: number): number[] => [hi >> 8, hi & 0xff, lo >> 8, lo & 0xff];

/** True for an IPv6 address that is not a global unicast one, or that hides a blocked IPv4 address. */
export function isBlockedIPv6(h: number[]): boolean {
  const zero = (from: number, to: number) => h.slice(from, to).every((x) => x === 0);
  if (zero(0, 6)) return true; // ::/96: unspecified, ::1, and IPv4-compatible forms
  if (zero(0, 5) && h[5] === 0xffff) return isBlockedIPv4(v4Of(h[6], h[7])); // ::ffff:a.b.c.d
  if (h[0] === 0x64 && h[1] === 0xff9b) { // NAT64
    return h[2] === 0 && zero(2, 6) ? isBlockedIPv4(v4Of(h[6], h[7])) : true;
  }
  if (h[0] === 0x2002) return isBlockedIPv4(v4Of(h[1], h[2])); // 6to4
  if (h[0] === 0x2001 && (h[1] === 0 || h[1] === 0xdb8)) return true; // Teredo, documentation
  // Everything outside 2000::/3 is not global unicast: fc00::/7, fe80::/10, fec0::/10, ff00::/8, 100::/64, ...
  return (h[0] & 0xe000) !== 0x2000;
}

const INTERNAL_SUFFIX = /\.(internal|local|localhost|lan|home|corp|intranet|home\.arpa)$/;
/** The last label is numeric: the host is an IP written some way (decimal, hex, short form), never a name. */
const NUMERIC_LAST_LABEL = /^(0x[0-9a-f]*|[0-9]+)$/i;

/** True when the address literal `host` (any spelling the URL parser may leave) is a host we must never fetch. */
export function isBlockedHost(host: string): boolean {
  let h = host.trim().toLowerCase().replace(/\.$/, '');
  if (!h) return true;
  if (h.startsWith('[') && h.endsWith(']')) h = h.slice(1, -1);
  if (h.includes(':')) {
    const v6 = parseIPv6(h);
    return !v6 || isBlockedIPv6(v6);
  }
  const last = h.slice(h.lastIndexOf('.') + 1);
  if (NUMERIC_LAST_LABEL.test(last)) {
    const v4 = parseIPv4(h); // 127.1, 2130706433, 0x7f000001 and octal forms are all refused
    return !v4 || isBlockedIPv4(v4);
  }
  if (!h.includes('.')) return true; // localhost and bare internal names
  return INTERNAL_SUFFIX.test(h);
}

/** A host written as an IP address (so there is nothing to resolve). */
function isIpLiteral(host: string): boolean {
  const h = host.toLowerCase().replace(/^\[|\]$/g, '');
  return h.includes(':') || NUMERIC_LAST_LABEL.test(h.slice(h.lastIndexOf('.') + 1));
}

/** Resolves a name to every address it has (A and AAAA together), or null when it cannot. */
export type Resolver = (host: string) => Promise<string[] | null>;

/**
 * A public host: not blocked by name, and every address it resolves to (IPv4 and IPv6 alike) is public.
 * Having an AAAA record is NOT a reason to refuse; an unresolvable name is, because it cannot be vetted.
 */
export async function hostIsPublic(host: string, resolve: Resolver): Promise<boolean> {
  if (isBlockedHost(host)) return false;
  if (isIpLiteral(host)) return true;
  let addrs: string[] | null;
  try { addrs = await resolve(host); } catch { return false; }
  if (!addrs || addrs.length === 0) return false;
  return addrs.every((a) => !isBlockedHost(a));
}

