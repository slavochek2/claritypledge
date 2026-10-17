/**
 * @file persona-session-plugin.ts
 * @description P1509 v16: dev-server-only sign-in for the seeded test personas. The prototype POSTs a persona id
 * to PERSONA_SESSION_ENDPOINT; this middleware reads that persona's password from the secrets file the seed
 * script writes outside the repo (persona-secrets.ts), signs in against the TEST project and returns only the
 * session tokens. The password never reaches the browser and is not in any source file or VITE_ variable.
 *
 * `apply: 'serve'`: Vite never loads this plugin for `vite build`, so the endpoint does not exist in production.
 *
 * Request checks (`rejectReason`). Vite runs plugin middlewares BEFORE its own CORS and host-check middlewares,
 * so none of Vite's protections apply here and every one is done in this file:
 * - the socket is loopback (the dev server binds every interface, so LAN peers reach it);
 * - no proxy or forwarding header: a tunnel agent (ngrok, cloudflared, tailscale serve…) connects from loopback
 *   and can rewrite Host, after which a remote non-browser client could set every other header itself;
 * - `Host` is a loopback name on this server's own port, which defeats DNS rebinding (a rebound page still sends
 *   its own hostname);
 * - `Origin` is present and equals `http://<Host>`, and `Sec-Fetch-Site`, when the browser sends it, is
 *   `same-origin`: another page in the same browser cannot use the endpoint;
 * - `Content-Type` is `application/json`, so a cross-site request needs a CORS preflight, which gets no answer.
 * Known limit: a tunnel that rewrites Host AND strips every forwarding header is indistinguishable from a local
 * client. Never expose this dev server through such a tunnel while personas are seeded.
 */
import type { IncomingHttpHeaders, IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';
import { createClient } from '@supabase/supabase-js';
import { isTestProject, PERSONA_IDS, PERSONA_SESSION_ENDPOINT, personaEmail } from './personas';
import { readPersonaSecrets } from './persona-secrets';
import type { PersonId } from './mock-data';

const LOOPBACK_ADDRESSES = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
const LOOPBACK_HOSTNAMES = ['localhost', '127.0.0.1', '[::1]'];
const PROXY_HEADERS = ['forwarded', 'x-forwarded-for', 'x-forwarded-host', 'x-forwarded-proto', 'x-real-ip', 'cf-connecting-ip', 'true-client-ip', 'tailscale-user-login', 'x-original-host', 'via'];
const MAX_BODY_BYTES = 200;

/** Why a request must be refused, or null when it may proceed. Pure, so every branch is unit-tested. */
export function rejectReason(req: { method?: string; headers: IncomingHttpHeaders; remoteAddress?: string; localPort?: number }): string | null {
  if (req.method !== 'POST') return 'POST only';
  if (!LOOPBACK_ADDRESSES.has(req.remoteAddress ?? '')) return 'loopback only';
  if (PROXY_HEADERS.some((h) => req.headers[h] !== undefined)) return 'proxied request';
  const host = req.headers.host ?? '';
  if (!req.localPort || !LOOPBACK_HOSTNAMES.some((h) => host === `${h}:${req.localPort}`)) return 'host not allowed';
  if (req.headers.origin !== `http://${host}`) return 'origin not allowed';
  const site = req.headers['sec-fetch-site'];
  if (site !== undefined && site !== 'same-origin') return 'cross-site request';
  if (!/^application\/json\b/i.test(req.headers['content-type'] ?? '')) return 'JSON only';
  return null;
}

export interface PersonaSessionEnv { supabaseUrl?: string; anonKey?: string; readSecrets?: () => Record<string, string> | null }

/** The connect handler, mounted at PERSONA_SESSION_ENDPOINT. Exported so tests run it on a real HTTP server. */
export function personaSessionHandler(env: () => PersonaSessionEnv) {
  return (req: IncomingMessage, res: ServerResponse) => {
    const send = (status: number, body: unknown) => {
      if (res.headersSent || res.writableEnded) return;
      res.statusCode = status;
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Cache-Control', 'no-store');
      res.end(JSON.stringify(body));
    };
    // connect mounts by prefix; only the exact endpoint is served.
    if (req.url !== '/' && req.url !== '') return send(404, { error: 'not found' });
    const refused = rejectReason({ method: req.method, headers: req.headers, remoteAddress: req.socket.remoteAddress, localPort: req.socket.localPort });
    if (refused) return send(403, { error: refused });
    const { supabaseUrl, anonKey, readSecrets = readPersonaSecrets } = env();
    if (!isTestProject(supabaseUrl) || !anonKey) return send(403, { error: 'test project only' });

    const chunks: Buffer[] = [];
    let bytes = 0;
    let aborted = false;
    req.on('data', (c: Buffer) => {
      if (aborted) return;
      bytes += c.byteLength;
      if (bytes > MAX_BODY_BYTES) {
        aborted = true;
        // Close only after the 413 is flushed; destroying first drops the response ("socket hang up").
        res.setHeader('Connection', 'close');
        res.once('finish', () => req.destroy());
        send(413, { error: 'body too large' });
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      if (aborted) return;
      void (async () => {
        let id: unknown;
        try { id = JSON.parse(Buffer.concat(chunks).toString('utf8'))?.id; } catch { /* handled below */ }
        if (typeof id !== 'string' || !PERSONA_IDS.includes(id as PersonId)) return send(400, { error: 'unknown persona' });
        const passwords = readSecrets();
        if (!passwords) return send(409, { error: 'Personas not seeded. Run: npx tsx scripts/p1509-seed-personas.ts' });
        const password = Object.hasOwn(passwords, id) ? passwords[id] : undefined;
        if (typeof password !== 'string' || !password) return send(409, { error: 'Persona missing from the seed file. Re-run the seed script.' });
        const client = createClient(supabaseUrl!, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
        const { data, error } = await client.auth.signInWithPassword({ email: personaEmail(id as PersonId), password });
        if (error?.status === 429) return send(429, { error: 'Too many sign-ins. Wait a minute and try again.' });
        if (error || !data.session) return send(401, { error: 'Sign-in failed. Re-run the seed script.' });
        send(200, { access_token: data.session.access_token, refresh_token: data.session.refresh_token });
      })().catch(() => send(500, { error: 'Sign-in failed (network). Try again.' }));
    });
  };
}

export function p1509PersonaSessionPlugin(): Plugin {
  return {
    name: 'p1509-persona-session',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(
        PERSONA_SESSION_ENDPOINT,
        personaSessionHandler(() => ({
          supabaseUrl: server.config.env.VITE_SUPABASE_URL as string | undefined,
          anonKey: server.config.env.VITE_SUPABASE_ANON_KEY as string | undefined,
        })),
      );
    },
  };
}
