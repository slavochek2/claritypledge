/**
 * P1691 / P1705: the base address of links in mail we send.
 *
 * This is the ONLY module that reads APP_URL. Every function that puts an action link in mail
 * takes its base from linkBaseFor() and reads no request header or body field for that purpose
 * itself (src/tests/p1691-link-host-source.test.ts keeps it so).
 *
 * The result is APP_URL (default https://claritypledge.com, trailing slashes stripped) in every
 * case except one. The request's Origin is returned only when ALL of these hold:
 *   1. a request is given (scheduled senders pass none);
 *   2. its Origin is exactly one of the allocator's dev origins (_shared/dev-origins.ts);
 *   3. the project address is positively known not to be prod (isKnownNonProdProject);
 *   4. APP_URL itself is a localhost address (http, host localhost or 127.0.0.1).
 * Gates 3 and 4 are independent: a prod-shaped or unrecognised project address, or a deployed
 * APP_URL, keeps the configured address whatever the request says.
 *
 * No project is named here. Prod is recognised by the one place that names it (isProdProject),
 * and a test target is recognised by the kind of address a self-hosted or local stack has, which
 * a hosted project never has. A hosted project other than prod is therefore not recognised and
 * gets the configured app address, like prod.
 */
import { isDevOrigin } from './dev-origins.ts';
import { isProdProject } from './nonprod-image-guard.ts';

const DEFAULT_APP_URL = 'https://claritypledge.com';

// Inside a self-hosted or local stack a function reaches its project through the gateway
// service or the loopback address.
const IN_STACK_HOSTS = new Set(['kong', 'localhost', '127.0.0.1']);
// A stack addressed from outside by a private network name (isolated test lanes:
// scripts/selfhosted/lanes/vm/lanectl.py, origin()) or by a name that is only its IP address
// (the self-hosted test server).
const SELF_HOSTED_SUFFIXES = ['.ts.net', '.sslip.io'];

/** True only for a project address that has the shape of a self-hosted or local stack. */
export function isKnownNonProdProject(supabaseUrl: string | null | undefined): boolean {
  let host: string;
  try {
    host = new URL(supabaseUrl ?? '').hostname.toLowerCase();
  } catch {
    return false;
  }
  if (isProdProject(supabaseUrl)) return false;
  return IN_STACK_HOSTS.has(host) || SELF_HOSTED_SUFFIXES.some((suffix) => host.endsWith(suffix));
}

/** True only for an http address on localhost or 127.0.0.1. */
function isLocalhostAddress(address: string): boolean {
  try {
    const url = new URL(address);
    return url.protocol === 'http:' && (url.hostname === 'localhost' || url.hostname === '127.0.0.1');
  } catch {
    return false;
  }
}

/**
 * Base address for links in mail: APP_URL, or the request's dev origin on a known test or local
 * project whose APP_URL is itself a localhost address. Pass no request for a scheduled send.
 */
export function linkBaseFor(req?: Request): string {
  const appUrl = (Deno.env.get('APP_URL') ?? DEFAULT_APP_URL).replace(/\/+$/, '');
  if (!req) return appUrl;
  const origin = req.headers.get('Origin') ?? '';
  if (!isDevOrigin(origin)) return appUrl;
  if (!isKnownNonProdProject(Deno.env.get('SUPABASE_URL'))) return appUrl;
  if (!isLocalhostAddress(appUrl)) return appUrl;
  return origin;
}
