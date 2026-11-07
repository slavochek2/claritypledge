/**
 * P1529: seeds a Sales Mastermind room on the self-hosted TEST server for the founder to look at on localhost. TEST only: the helper
 * refuses any other server before a request goes out. Obviously fake people ("Alma Test", ...; first names first, so the host screen tiles read differently).
 *
 * Usage:  SEED_HOST_EMAIL=<an existing account's email> npx tsx scripts/seed-p1529-host-room.ts
 *         npx tsx scripts/seed-p1529-host-room.ts --cleanup <ledger.json>
 *
 * The host is NOT created: the account must exist (profile looked up by email). The event starts about 2 hours from now with a limit of 24 (12 registered, so seats stay open).
 * Registered: 8 owners (7 with a canvas shared to the event, mixed canvas_before / canvas_at_doors; 1 registered but not shared yet) and
 * 4 observers (home / doors), so the room is full; then 3 people join the waiting list through the real RPC. Phones mix usbc / lightning / other.
 * The ledger (everything created) is written so --cleanup removes exactly that, to the OS temp folder (SEED_LEDGER_DIR overrides),
 * never into the repo. --join <ledger> puts every registered person into the event's room (the host screen lists room members).
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import * as dotenv from 'dotenv';

const LEDGER_DIR = process.env.SEED_LEDGER_DIR ?? tmpdir();
const LEDGER_PATH = join(LEDGER_DIR, 'seed-p1529-ledger.json');

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
const WAITING = [
  { name: 'Mira Test', participation: 'canvas_before', phone: 'usbc', prep: null },
  { name: 'Nils Test', participation: 'observer', phone: 'lightning', prep: 'home' },
  { name: 'Olga Test', participation: 'canvas_at_doors', phone: 'other', prep: null },
];

type Helpers = typeof import('../e2e/helpers/p1529-mastermind.ts');
type Admin = (typeof import('../e2e/helpers/supabase-admin.ts'))['supabaseAdmin'];

/** Everyone registered for the event joins its room; people on the waiting list stay out. */
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

async function main() {
  loadEnv();
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
    const ev = await H.makeEvent(ledger, { user: { id: hostId } } as never, `Sales Mastermind (seed ${H.RUN})`, {
      series: 'sales-mastermind', startsInMs: 2 * 3600_000, maxAttendees: 24,
    });
    save();
    for (const p of PLAN) {
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
    for (const w of WAITING) {
      const person = await H.makeUser(ledger, w.name);
      save();
      const { data, error } = await person.client.rpc('join_event_waitlist', {
        p_slug: ev.slug, p_participation: w.participation, p_phone: w.phone, p_hope: null, p_recording_accepted: true, p_observer_prep: w.prep,
      });
      if (error || data !== 'ok') throw new Error(`waiting list ${w.name}: ${error?.message ?? data}`);
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
