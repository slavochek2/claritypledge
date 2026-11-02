/**
 * P1536 S1.1 fault injection: "one Send = one message + one queued run, in ONE transaction". A rolled-back block needs raw SQL (a trigger that raises
 * BETWEEN the two inserts), which a PostgREST client cannot send, so this test reaches the database the way scripts/selfhosted/migrate.sh does: psql inside
 * the supabase-db container on the self-hosted TEST VM, over an IAP ssh session, as postgres.
 *   npm run test:integration -- src/tests/integration/p1536-s1-1-atomicity.test.ts
 *
 * NOTHING PERSISTS. One psql session, one transaction: the trigger and its function are created inside it, the faulted Send runs in a sub-block that
 * must raise, the counts inside the same transaction must equal the counts before it, a CONTROL Send with the fault switched off must write, and the
 * whole transaction is then ROLLED BACK (lock_timeout 3s, so it never stalls other sessions). No DROP is issued.
 *
 * Skips, naming the reason, when: the active TEST database is not the self-hosted one (hosted has no ssh route), or gcloud has no valid login.
 */
import { describe, it, expect, afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { createTestUser, deleteTestUsers, type TestUser } from '../../../e2e/helpers/test-user';

const SELFHOSTED_URL = 'https://136-85-1-126.sslip.io';
const PROJECT = 'gen-lang-client-0869694595';
const VM = 'cp-test-supabase';
const ZONE = 'asia-southeast1-a';
const env = { ...process.env, PATH: `/opt/homebrew/share/google-cloud-sdk/bin:${process.env.PATH ?? ''}` };
const users: TestUser[] = [];

afterAll(async () => {
  if (users.length) expect((await deleteTestUsers(users.map((u) => u.user.id))).failed, 'every test user was deleted').toBe(0);
}, 120_000);

function gcloudLoginOk(): boolean {
  try { execFileSync('gcloud', ['auth', 'print-access-token'], { env, stdio: 'pipe', timeout: 30_000 }); return true; } catch { return false; }
}
function psql(sql: string): string {
  return execFileSync('gcloud', ['compute', 'ssh', VM, `--project=${PROJECT}`, `--zone=${ZONE}`, '--tunnel-through-iap', '--quiet',
    '--command', 'sudo docker exec -i supabase-db psql -U postgres -d postgres -X -q -t -A -v ON_ERROR_STOP=1'],
  { env, input: sql, encoding: 'utf8', timeout: 180_000, stdio: ['pipe', 'pipe', 'pipe'] });
}

const sqlFor = (uid: string) => `
BEGIN;
SET LOCAL lock_timeout = '3s';
CREATE FUNCTION public._p1536_fault() RETURNS trigger LANGUAGE plpgsql AS $f$
BEGIN
  IF current_setting('p1536.fault', true) = 'on' THEN RAISE EXCEPTION 'p1536 injected fault'; END IF;
  RETURN NEW;
END $f$;
CREATE TRIGGER p1536_fault BEFORE INSERT ON public.canvas_draft_runs FOR EACH ROW EXECUTE FUNCTION public._p1536_fault();
DO $do$
DECLARE
  u uuid := '${uid}';
  before_c text; mid_c text; after_c text;
  r jsonb;
  counts text := $q$SELECT concat_ws('/',
      (SELECT count(*) FROM public.canvases WHERE owner_id = %L),
      (SELECT count(*) FROM public.canvas_versions v JOIN public.canvases c ON c.id = v.canvas_id WHERE c.owner_id = %L),
      (SELECT count(*) FROM public.canvas_drafts WHERE owner_id = %L),
      (SELECT count(*) FROM public.canvas_draft_runs WHERE owner_id = %L),
      (SELECT count(*) FROM public.chat_conversations WHERE owner_id = %L AND kind = 'mirror'),
      (SELECT count(*) FROM public.chat_messages m JOIN public.chat_conversations cv ON cv.id = m.conversation_id WHERE cv.owner_id = %L),
      (SELECT count(*) FROM public.mirror_ai_spend WHERE owner_id = %L))$q$;
BEGIN
  EXECUTE format(counts, u, u, u, u, u, u, u) INTO before_c;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', u::text, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', u::text, true);
  PERFORM set_config('p1536.fault', 'on', true);
  SET LOCAL ROLE authenticated;
  BEGIN
    r := public.canvas_workspace_send(NULL::uuid, NULL::uuid, NULL::uuid, NULL::integer, false, 'fault text', NULL::text[], NULL::jsonb, gen_random_uuid());
    RAISE EXCEPTION 'ASSERT: the faulted Send returned % instead of raising', r;
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'p1536 injected fault' THEN RAISE EXCEPTION 'ASSERT: wrong error: %', SQLERRM; END IF;
  END;
  RESET ROLE;
  EXECUTE format(counts, u, u, u, u, u, u, u) INTO mid_c;
  IF mid_c <> before_c THEN RAISE EXCEPTION 'ASSERT: the fault between the inserts left rows behind: before % after %', before_c, mid_c; END IF;
  -- CONTROL: the same call with the fault switched off writes (one canvas, version, draft, run, mirror, a message)
  PERFORM set_config('p1536.fault', 'off', true);
  SET LOCAL ROLE authenticated;
  r := public.canvas_workspace_send(NULL::uuid, NULL::uuid, NULL::uuid, NULL::integer, false, 'control text', NULL::text[], NULL::jsonb, gen_random_uuid());
  RESET ROLE;
  IF r ->> 'status' <> 'ok' THEN RAISE EXCEPTION 'ASSERT: control Send did not succeed: %', r; END IF;
  EXECUTE format(counts, u, u, u, u, u, u, u) INTO after_c;
  IF after_c = before_c THEN RAISE EXCEPTION 'ASSERT: the control Send wrote nothing, so the counts prove nothing: %', after_c; END IF;
  RAISE NOTICE 'P1536_COUNTS before=% after_fault=% after_control=%', before_c, mid_c, after_c;
END
$do$;
SELECT 'P1536_FAULT_OK';
ROLLBACK;
`;

describe('S1.1 atomicity: a fault between the inserts of a Send leaves nothing behind', () => {
  it('the Send is one transaction (message, run, draft, canvas all roll back together); a control with the fault off writes', async (ctx) => {
    if ((process.env.VITE_SUPABASE_URL ?? '') !== SELFHOSTED_URL) {
      console.warn(`S1.1 fault injection NOT run: the active TEST database is not the self-hosted one (${process.env.VITE_SUPABASE_URL ?? 'unset'}); only that server has an IAP psql route`);
      return ctx.skip();
    }
    if (!gcloudLoginOk()) {
      console.warn('S1.1 fault injection NOT run: gcloud has no valid login (run: gcloud auth login)');
      return ctx.skip();
    }
    const u = await createTestUser({ name: `P1536s11 ${Date.now().toString(36)}` });
    users.push(u);
    const out = psql(sqlFor(u.user.id));
    expect(out).toContain('P1536_FAULT_OK');
  }, 300_000);
});
