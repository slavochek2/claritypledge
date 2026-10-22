/**
 * @file p1544-terms-gate-live.spec.ts
 * @description P1544: mirror-reply and mirror-portrait refuse a caller who has not accepted the
 * current terms, before any job, reservation or model call — against the deployed functions on test.
 *
 * Control (P1512 canary rule): the same calls by a user on the current version are NOT refused with
 * terms_not_accepted. The reply call uses a random message id, so the control ends at NOT_AVAILABLE
 * and never reaches the model: this file costs nothing. mirror-portrait has no current-version control
 * on purpose — passing its gate starts a real portrait run (portrait_max_usd reserved). Its gate is
 * pinned by src/tests/p1544-terms-gate.test.ts and exercised for real by the prod portrait check.
 */
import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/test-user';
import { RUN, signIn, type SignedIn } from '../helpers/test-chat';
import { SERVER_CURRENT_TERMS_VERSION } from '../../supabase/functions/_shared/terms-version';

const service = createClient(process.env.VITE_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { autoRefreshToken: false, persistSession: false },
});

let stale: TestUser;
let current: TestUser;
let sStale: SignedIn;
let sCurrent: SignedIn;

async function call(who: SignedIn, fn: string, body: Record<string, unknown>) {
  const { data, error } = await who.client.functions.invoke(fn, { body });
  if (!error) return { status: 200, body: data ?? {} };
  const res = (error as { context?: unknown }).context;
  // A transport failure has no Response: fail loudly rather than read as a status.
  if (!(res instanceof Response)) throw new Error(`${fn} unreachable: ${(error as Error).message}`);
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

async function rowsFor(table: string, owner: string): Promise<number> {
  const { count, error } = await service.from(table).select('*', { count: 'exact', head: true }).eq('owner_id', owner);
  if (error) throw new Error(`${table}: ${error.message}`);
  return count ?? -1;
}

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  stale = await createTestUser({ name: `Terms Stale ${RUN}` });
  current = await createTestUser({ name: `Terms Current ${RUN}` });
  const { error } = await service.from('profiles').update({ accepted_terms_version: 'v1.4' }).eq('id', stale.user.id);
  if (error) throw new Error(error.message);
  const { data } = await service.from('profiles').select('accepted_terms_version').eq('id', stale.user.id).single();
  expect(data?.accepted_terms_version).toBe('v1.4'); // the fixture really is stale
  const { data: cur } = await service.from('profiles').select('accepted_terms_version').eq('id', current.user.id).single();
  expect(cur?.accepted_terms_version).toBe(SERVER_CURRENT_TERMS_VERSION); // and the control really is current
  sStale = await signIn(stale);
  sCurrent = await signIn(current);
});

test.afterAll(async () => {
  const results = await Promise.allSettled([stale, current].filter(Boolean).map((u) => deleteTestUser(u.user.id)));
  const failed = results.filter((r) => r.status === 'rejected');
  if (failed.length) throw new Error(`cleanup failed for ${failed.length} user(s)`);
});

test('mirror-reply refuses a caller on an old terms version', async () => {
  const r = await call(sStale, 'mirror-reply', { message_id: randomUUID() });
  expect(r.status).toBe(409);
  expect(r.body).toEqual({ error: 'terms_not_accepted', code: 'TERMS_NOT_ACCEPTED' });
  expect(await rowsFor('mirror_jobs', stale.user.id)).toBe(0);
  expect(await rowsFor('mirror_ai_spend', stale.user.id)).toBe(0);
});

test('control: mirror-reply does not refuse a caller on the current version', async () => {
  expect(SERVER_CURRENT_TERMS_VERSION).toBe('v1.5');
  const r = await call(sCurrent, 'mirror-reply', { message_id: randomUUID() });
  expect(r.status).toBe(404); // past the gate, stopped before any model call
  expect(r.body?.code).toBe('NOT_AVAILABLE'); // the function's own 404, not a gateway's
  expect(await rowsFor('mirror_ai_spend', current.user.id)).toBe(0);
});

test('mirror-portrait refuses a caller on an old terms version', async () => {
  const r = await call(sStale, 'mirror-portrait', {});
  expect(r.status).toBe(409);
  expect(r.body).toEqual({ error: 'terms_not_accepted', code: 'TERMS_NOT_ACCEPTED' });
  expect(await rowsFor('mirror_jobs', stale.user.id)).toBe(0); // no portrait job begun
  expect(await rowsFor('mirror_ai_spend', stale.user.id)).toBe(0); // nothing reserved
});
