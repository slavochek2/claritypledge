/**
 * P1691: the base address of links in mail we send.
 *
 * It is the configured app address (APP_URL). The one exception lets local development get local
 * links: a request origin that matches the exact development rule in cors.ts, on a project that
 * is positively known not to be prod. Any other request value never reaches a link, and a
 * project address that is unset, unreadable or simply not recognised counts as prod.
 *
 * Every function that puts a link in mail takes its base from here and reads no request header
 * for that purpose itself (src/tests/p1691-link-host-source.test.ts keeps it so).
 *
 * The development rule is reused through resolveAllowedOrigin rather than copied: it returns the
 * request's own origin only when one of its exact rules matched, and the other two rules are
 * https, so an http origin that comes back unchanged matched the development rule.
 *
 * No project is named here. Prod is recognised by the one place that names it (isProdProject),
 * and a test target is recognised by the kind of address a self-hosted or local stack has, which
 * a hosted project never has. A hosted project other than prod is therefore not recognised and
 * gets the configured app address, like prod.
 */
import { resolveAllowedOrigin } from './cors.ts';
import { isProdProject } from './nonprod-image-guard.ts';

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

/** The request's origin when it is an exact development origin, otherwise null. */
function exactDevOrigin(req: Request): string | null {
  const origin = req.headers.get('Origin') ?? '';
  // The scheme test only tells the development rule apart from the two https rules; whether the
  // origin is accepted at all is decided by cors.ts, whose rules are anchored at both ends.
  if (!origin.startsWith('http://')) return null;
  return resolveAllowedOrigin(req) === origin ? origin : null;
}

/**
 * Base address for links in mail: `appUrl`, or the request's development origin on a known
 * test or local project.
 */
export function resolveLinkBase(req: Request, appUrl: string, supabaseUrl: string | null | undefined): string {
  if (!isKnownNonProdProject(supabaseUrl)) return appUrl;
  return exactDevOrigin(req) ?? appUrl;
}
