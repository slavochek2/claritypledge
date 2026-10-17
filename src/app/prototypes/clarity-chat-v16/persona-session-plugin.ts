/**
 * @file persona-session-plugin.ts
 * @description P1509 v16: dev-server-only sign-in for the seeded test personas. The prototype POSTs a persona id
 * to PERSONA_SESSION_ENDPOINT; this middleware reads that persona's password from the git-ignored file the seed
 * script writes, signs in against the TEST project and returns only the session tokens. The password never
 * reaches the browser and is not in any source file or VITE_ variable.
 *
 * `apply: 'serve'`: Vite never loads this plugin for `vite build`, so the endpoint does not exist in production.
 * It also refuses unless the configured Supabase URL is the test project and the request comes from loopback.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { Plugin } from 'vite';
import { createClient } from '@supabase/supabase-js';
import { isTestProject, PERSONA_IDS, PERSONA_SECRETS_PATH, PERSONA_SESSION_ENDPOINT, personaEmail } from './personas';
import type { PersonId } from './mock-data';

const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

export function p1509PersonaSessionPlugin(root: string): Plugin {
  return {
    name: 'p1509-persona-session',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(PERSONA_SESSION_ENDPOINT, (req, res) => {
        const send = (status: number, body: unknown) => {
          res.statusCode = status;
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Cache-Control', 'no-store');
          res.end(JSON.stringify(body));
        };
        if (req.method !== 'POST') return send(405, { error: 'POST only' });
        if (!LOOPBACK.has(req.socket.remoteAddress ?? '')) return send(403, { error: 'loopback only' });
        const url = server.config.env.VITE_SUPABASE_URL as string | undefined;
        const anon = server.config.env.VITE_SUPABASE_ANON_KEY as string | undefined;
        if (!isTestProject(url) || !anon) return send(403, { error: 'test project only' });

        let raw = '';
        req.on('data', (c) => { raw += c; if (raw.length > 200) req.destroy(); });
        req.on('end', async () => {
          let id: string | undefined;
          try { id = JSON.parse(raw)?.id; } catch { /* handled below */ }
          if (!id || !PERSONA_IDS.includes(id as PersonId)) return send(400, { error: 'unknown persona' });
          let passwords: Record<string, string>;
          try {
            passwords = JSON.parse(readFileSync(path.join(root, PERSONA_SECRETS_PATH), 'utf8')).passwords ?? {};
          } catch {
            return send(409, { error: 'Personas not seeded. Run: npx tsx scripts/p1509-seed-personas.ts' });
          }
          const password = passwords[id];
          if (!password) return send(409, { error: 'Persona missing from the seed file. Re-run the seed script.' });
          const client = createClient(url!, anon, { auth: { persistSession: false, autoRefreshToken: false } });
          const { data, error } = await client.auth.signInWithPassword({ email: personaEmail(id as PersonId), password });
          if (error || !data.session) return send(401, { error: error?.message ?? 'sign-in failed' });
          send(200, { access_token: data.session.access_token, refresh_token: data.session.refresh_token });
        });
      });
    },
  };
}
