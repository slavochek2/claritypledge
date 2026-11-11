/**
 * P1529: seeds a Sales Mastermind room on the self-hosted TEST server for the founder to look at on localhost. TEST only: the helper
 * refuses any other server before a request goes out. Obviously fake people ("Alma Test", ...; first names first, so the host screen tiles read differently).
 *
 * Usage:  SEED_HOST_EMAIL=<an existing account's email> npx tsx scripts/seed-p1529-host-room.ts
 *         SEED_HOST_EMAIL=<email> npx tsx scripts/seed-p1529-host-room.ts --event <existing slug>   (7 owners + 3 observers into it)
 *         SEED_HOST_EMAIL=<email> npx tsx scripts/seed-p1529-host-room.ts --fresh   (NEW event sales-mastermind-test-<MMDD-HHMM>, starts in ~1 h, limit 12,
 *             host not registered; 7 canvas owners shared to it + 3 observers; prints the event/host URLs and one sign-in link per person)
 *         npx tsx scripts/seed-p1529-host-room.ts --cleanup <ledger.json>
 *
 * The host is NOT created: the account must exist (profile looked up by email). The event starts 7 days from now with a limit of 24 (12 registered, so seats stay open).
 * Registered: 8 owners (7 with a canvas shared to the event, mixed canvas_before / canvas_at_doors; 1 registered but not shared yet) and
 * 4 observers (home / doors), with seats left, so no waiting list. Phones mix usbc / lightning / other.
 * The ledger (everything created) is written so --cleanup removes exactly that, to the OS temp folder (SEED_LEDGER_DIR overrides),
 * never into the repo. --join <ledger> puts every registered person into the event's room (the host screen lists room members).
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import * as dotenv from 'dotenv';

const LEDGER_DIR = process.env.SEED_LEDGER_DIR ?? tmpdir();
// One ledger file per run, so a new run never overwrites an earlier run's entries.
const LEDGER_PATH = join(LEDGER_DIR, `seed-p1529-ledger-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);

/** Network-level failures only (never an HTTP error response): fetch failed / connection reset. */
function isNetworkError(e: unknown): boolean {
  const c = (e as { cause?: { code?: string } })?.cause;
  return (e instanceof TypeError && /fetch failed/i.test(e.message)) || c?.code === 'ECONNRESET' || /ECONNRESET/.test(String((e as Error)?.message));
}

/** Wraps the global fetch (every Supabase client resolves it per call): up to 4 attempts, 2s/4s/8s backoff, each retry logged. */
function installRetryingFetch(): void {
  const base = globalThis.fetch;
  globalThis.fetch = (async (...args: Parameters<typeof fetch>) => {
    for (let attempt = 1; ; attempt++) {
      try { return await base(...args); } catch (e) {
        if (!isNetworkError(e) || attempt >= 4) throw e;
        const wait = 2000 * 2 ** (attempt - 1);
        console.log(`[retry] network error (${(e as Error).message}), attempt ${attempt} of 4, waiting ${wait / 1000}s`);
        await new Promise(r => setTimeout(r, wait));
      }
    }
  }) as typeof fetch;
}

/** .env.test.local from here or the nearest parent (a worktree has none of its own). */
function loadEnv(): void {
  for (let dir = process.cwd(), i = 0; i < 6; i++, dir = dirname(dir)) {
    const f = join(dir, '.env.test.local');
    if (existsSync(f)) { dotenv.config({ path: f }); return; }
  }
}

const PLAN: Array<{ name: string; kind: 'owner' | 'owner-unshared' | 'observer'; participation: string; phone: string; prep?: string }> = [
  { name: 'Alma Test', kind: 'owner', participation: 'canvas_before', phone: 'usbc' },
  { name: 'Boris Test', kind: 'owner', participation: 'canvas_before', phone: 'lightning' },
  { name: 'Chiara Test', kind: 'owner', participation: 'canvas_at_doors', phone: 'usbc' },
  { name: 'Dmitri Test', kind: 'owner', participation: 'canvas_before', phone: 'other' },
  { name: 'Elena Test', kind: 'owner', participation: 'canvas_at_doors', phone: 'lightning' },
  { name: 'Farid Test', kind: 'owner', participation: 'canvas_before', phone: 'usbc' },
  { name: 'Greta Test', kind: 'owner', participation: 'canvas_at_doors', phone: 'other' },
  { name: 'Hugo Test', kind: 'owner-unshared', participation: 'canvas_before', phone: 'usbc' },
  { name: 'Ines Test', kind: 'observer', participation: 'observer', phone: 'usbc', prep: 'home' },
  { name: 'Jonas Test', kind: 'observer', participation: 'observer', phone: 'lightning', prep: 'doors' },
  { name: 'Kira Test', kind: 'observer', participation: 'observer', phone: 'other', prep: 'home' },
  { name: 'Leo Test', kind: 'observer', participation: 'observer', phone: 'usbc', prep: 'doors' },
];

type Helpers = typeof import('../e2e/helpers/p1529-mastermind.ts');
type Admin = (typeof import('../e2e/helpers/supabase-admin.ts'))['supabaseAdmin'];

/** Everyone registered for the event joins its room. */
async function joinAll(H: Helpers, admin: Admin, ledger: import('../e2e/helpers/p1529-mastermind.ts').Ledger, ev: { id: string }): Promise<void> {
  const { data, error } = await admin.from('event_rsvps').select('profile_id').eq('event_id', ev.id);
  if (error) throw new Error(`rsvps: ${error.message}`);
  const registered = new Set((data ?? []).map(r => r.profile_id as string));
  const transcribeRoom = await H.makeTranscribeRoom(ledger, ev as never);
  let n = 0;
  for (const u of ledger.users) {
    if (!registered.has(u.user.id)) continue;
    await H.joinRoom(ledger, { user: u, room: new Map(), tmember: new Map() } as never, ev as never, { transcribeRoom });
    n++;
  }
  console.log(`Joined the room: ${n}`);
}

const FRESH_BASE = process.env.SEED_BASE_URL ?? 'http://localhost:5001';

/** One magic link per person (admin generateLink, redirected to the event page), labelled by role. */
async function printLinks(admin: Admin, ledger: import('../e2e/helpers/p1529-mastermind.ts').Ledger, slug: string, roles: Map<string, string>): Promise<void> {
  console.log('\nSign-in links (each logs the browser in as that person; use a separate browser profile per person):');
  for (const u of ledger.users) {
    const { data, error } = await admin.auth.admin.generateLink({ type: 'magiclink', email: u.email, options: { redirectTo: `${FRESH_BASE}/events/${slug}` } });
    if (error || !data?.properties?.action_link) throw new Error(`magic link ${u.name}: ${error?.message ?? 'no link'}`);
    console.log(`  ${u.name} (${roles.get(u.email)}): ${data.properties.action_link}`);
  }
}

/** --fresh: a brand-new event for a from-the-start test run. The host is not registered; 7 canvas owners + 3 observers are. */
async function seedFresh(H: Helpers, admin: Admin, ledger: import('../e2e/helpers/p1529-mastermind.ts').Ledger, hostId: string, save: () => void): Promise<void> {
  const ev = await H.makeEvent(ledger, { user: { id: hostId } } as never, 'Sales Mastermind (test run)', {
    series: 'sales-mastermind', startsInMs: 3600_000, maxAttendees: 12,
  });
  const d = new Date();
  const two = (n: number) => String(n).padStart(2, '0');
  const slug = `sales-mastermind-test-${two(d.getMonth() + 1)}${two(d.getDate())}-${two(d.getHours())}${two(d.getMinutes())}`;
  const upd = await admin.from('events').update({ slug }).eq('id', ev.id);
  if (upd.error) throw new Error(`slug: ${upd.error.message}`);
  ev.slug = slug; // the ledger entry carries the new slug, so --cleanup still finds the event
  save();
  const roles = new Map<string, string>();
  for (const p of PLAN.filter(x => (x.kind === 'owner' || x.kind === 'observer') && x.name !== 'Leo Test')) {
    const person = await H.makeUser(ledger, p.name);
    save();
    if (p.kind === 'owner') { await H.publishCanvas(ledger, person, `${p.name.replace(' Test', '')}'s business`); save(); }
    const { data, error } = await person.client.rpc('register_for_event', {
      p_slug: slug, p_participation: p.participation, p_phone: p.phone, p_hope: null, p_recording_accepted: true, p_observer_prep: p.prep ?? null,
    });
    if (error || data !== 'ok') throw new Error(`register ${p.name}: ${error?.message ?? data}`);
    if (p.kind === 'owner') await H.shareForEvent(person, ev.id);
    roles.set(person.user.email, p.kind === 'owner' ? 'canvas owner' : 'observer');
  }
  save();
  console.log(`Event page:  ${FRESH_BASE}/events/${slug}`);
  console.log(`Host screen: ${FRESH_BASE}/events/${slug}/host`);
  await printLinks(admin, ledger, slug, roles);
  console.log(`\nLedger:      ${LEDGER_PATH}`);
  console.log(`Cleanup:     npx tsx scripts/seed-p1529-host-room.ts --cleanup ${LEDGER_PATH}`);
}

async function main() {
  loadEnv();
  installRetryingFetch();
  const H = await import('../e2e/helpers/p1529-mastermind.ts');
  const { supabaseAdmin } = await import('../e2e/helpers/supabase-admin.ts');

  const ci = process.argv.indexOf('--cleanup');
  if (ci > -1) {
    const file = process.argv[ci + 1];
    if (!file) throw new Error('--cleanup needs the ledger file');
    const ledger = JSON.parse(readFileSync(resolve(file), 'utf8')) as import('../e2e/helpers/p1529-mastermind.ts').Ledger;
    for (const r of await H.cleanup(ledger)) console.log(`${r.step}: ${r.count}`);
    console.log('left over:', await H.leftovers(ledger));
    return;
  }

  // --join <ledger>: put every registered person of a seeded event into its room (the host screen lists room members).
  const ji = process.argv.indexOf('--join');
  if (ji > -1) {
    H.assertSelfHostedTest();
    const file = process.argv[ji + 1];
    if (!file) throw new Error('--join needs the ledger file');
    const ledger = JSON.parse(readFileSync(resolve(file), 'utf8')) as import('../e2e/helpers/p1529-mastermind.ts').Ledger;
    await joinAll(H, supabaseAdmin, ledger, ledger.events[0] as never);
    writeFileSync(resolve(file), JSON.stringify(ledger, null, 2));
    return;
  }

  H.assertSelfHostedTest();
  const email = process.env.SEED_HOST_EMAIL;
  if (!email) throw new Error('Set SEED_HOST_EMAIL to the email of an existing account (the host is not created).');
  const prof = await supabaseAdmin.from('profiles').select('id, name').ilike('email', email).maybeSingle();
  if (prof.error) throw new Error(`host lookup: ${prof.error.message}`);
  if (!prof.data) throw new Error(`No profile with email ${email} on this server. Sign up there first; the seed does not create the host.`);
  const hostId = prof.data.id as string;

  const ledger = H.newLedger();
  const save = () => writeFileSync(LEDGER_PATH, JSON.stringify(ledger, null, 2));
  try {
    // --event <slug>: fill an EXISTING event (never added to the ledger, so --cleanup leaves it and removes only the seeded people).
    if (process.argv.includes('--fresh')) { await seedFresh(H, supabaseAdmin, ledger, hostId, save); return; }
    const ei = process.argv.indexOf('--event');
    const existing = ei > -1 ? process.argv[ei + 1] : null;
    let ev: { id: string; slug: string };
    if (existing) {
      const found = await supabaseAdmin.from('events').select('id, slug, max_attendees').eq('slug', existing).maybeSingle();
      if (found.error || !found.data) throw new Error(`event ${existing}: ${found.error?.message ?? 'not found'}`);
      ev = found.data as { id: string; slug: string };
    } else {
      ev = await H.makeEvent(ledger, { user: { id: hostId } } as never, `Sales Mastermind (seed ${H.RUN})`, {
        series: 'sales-mastermind', startsInMs: 7 * 24 * 3600_000, maxAttendees: 24,
      });
    }
    save();
    // An existing event keeps one place free: 7 canvas owners and 3 observers.
    const plan = existing ? PLAN.filter(p => p.kind !== 'owner-unshared' && p.name !== 'Leo Test') : PLAN;
    for (const p of plan) {
      const person = await H.makeUser(ledger, p.name);
      save();
      if (p.kind !== 'observer') {
        await H.publishCanvas(ledger, person, `${p.name.replace(' Test', '')}'s business`);
        save();
      }
      const { data, error } = await person.client.rpc('register_for_event', {
        p_slug: ev.slug, p_participation: p.participation, p_phone: p.phone, p_hope: null, p_recording_accepted: true,
        p_observer_prep: p.prep ?? null,
      });
      if (error || data !== 'ok') throw new Error(`register ${p.name}: ${error?.message ?? data}`);
      if (p.kind === 'owner') await H.shareForEvent(person, ev.id);
    }
    save();
    await joinAll(H, supabaseAdmin, ledger, ev);
    save();
    console.log(`Event page:  /events/${ev.slug}`);
    console.log(`Host screen: /events/${ev.slug}/host`);
    console.log(`Ledger:      ${LEDGER_PATH}`);
    console.log(`Cleanup:     npx tsx scripts/seed-p1529-host-room.ts --cleanup ${LEDGER_PATH}`);
  } catch (e) {
    save();
    console.error(`Seed failed; the ledger holds what was created: ${LEDGER_PATH}`);
    throw e;
  }
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
