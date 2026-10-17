/**
 * @file p1509-v16-seed-guard.test.ts
 * @description P1509 v16: pins the safety properties of scripts/p1509-seed-personas.ts. Offline: nothing here
 * reaches a database. The script's guards and filter builders are pure functions, imported without running main().
 */
import { describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  RESET_ORDER,
  SeedGuardError,
  assertTestProject,
  buildResetFilters,
  expandCounts,
  freshPassword,
  isPersonaAccountEmail,
  matchPersonaUsers,
  planEvents,
  planMemberships,
  planPositions,
  profileRow,
  readSeedEnv,
  REJECTED_ADDRESS_CODES,
} from '../../scripts/p1509-seed-personas';
import {
  PERSONA_DOMAIN,
  PERSONA_IDS,
  TEST_PROJECT_REF,
  isSeededPersonaEmail,
  personaEmail,
} from '../app/prototypes/clarity-chat-v16/personas';
import { PERSONA_SECRETS_FILE, PersonaSecretsError, assertOutside, readPersonaSecrets, writePersonaSecrets } from '../app/prototypes/clarity-chat-v16/persona-secrets';
import { GROUPS } from '../app/prototypes/clarity-chat-v16/mock-data';
import { SEED_SHAREABLE } from '../app/prototypes/clarity-chat-v16/seed-world';

const SCRIPT = path.resolve(__dirname, '../../scripts/p1509-seed-personas.ts');
const source = readFileSync(SCRIPT, 'utf8');
const PROD_URL = 'https://besjtuodziykmjidubzw.supabase.co';
const TEST_URL = `https://${TEST_PROJECT_REF}.supabase.co`;
/** Built from parts so no literal address sits in a committed file (the privacy gate). */
const addr = (local: string, domain: string) => [local, domain].join('@');
const U1 = '11111111-1111-4111-8111-111111111111';
const U2 = '22222222-2222-4222-8222-222222222222';

describe('seed script source', () => {
  it('never invokes an edge function', () => {
    expect(source).not.toMatch(/functions\s*\.\s*invoke/);
    expect(source).not.toMatch(/\.invoke\s*\(/);
  });

  it('never references a production credential or the production env file', () => {
    expect(source).not.toContain('PROD_');
    expect(source).not.toContain('.env.prod');
  });

  it('reads the service key from the test variable and the env from .env.local only', () => {
    expect(source).toContain('TEST_SUPABASE_SERVICE_ROLE_KEY');
    expect(source).toContain("'.env.local'");
    expect(source).not.toMatch(/process\.env/);
  });

  it('writes message ids only through the RPC, never by updating the column', () => {
    expect(source).toContain('set_rsvp_message_ids');
    expect(source).not.toMatch(/\.update\s*\(\s*\{[^}]*mailgun_message_ids/);
  });
});

describe('test-project guard', () => {
  it('aborts for the production host', () => {
    expect(() => assertTestProject(PROD_URL)).toThrow(SeedGuardError);
    expect(() => readSeedEnv(`VITE_SUPABASE_URL=${PROD_URL}\nTEST_SUPABASE_SERVICE_ROLE_KEY=k`)).toThrow(SeedGuardError);
  });

  it('aborts for an undefined, empty, malformed or look-alike URL', () => {
    expect(() => assertTestProject(undefined)).toThrow(SeedGuardError);
    expect(() => assertTestProject('')).toThrow(SeedGuardError);
    expect(() => assertTestProject('not a url')).toThrow(SeedGuardError);
    expect(() => assertTestProject(`https://${TEST_PROJECT_REF}.supabase.co.evil.com`)).toThrow(SeedGuardError);
    expect(() => assertTestProject(`https://evil.com/${TEST_PROJECT_REF}.supabase.co`)).toThrow(SeedGuardError);
  });

  it('accepts the test project and returns its credentials', () => {
    expect(() => assertTestProject(TEST_URL)).not.toThrow();
    expect(readSeedEnv(`VITE_SUPABASE_URL=${TEST_URL}\nTEST_SUPABASE_SERVICE_ROLE_KEY=abc`)).toEqual({ url: TEST_URL, serviceKey: 'abc' });
  });

  it('aborts when the service key is missing, and ignores a production key sitting in the same file', () => {
    expect(() => readSeedEnv(`VITE_SUPABASE_URL=${TEST_URL}`)).toThrow(SeedGuardError);
    expect(() => readSeedEnv(`VITE_SUPABASE_URL=${TEST_URL}\nSUPABASE_SERVICE_ROLE_KEY=other`)).toThrow(SeedGuardError);
  });

  it('the guard message never contains a key', () => {
    try {
      readSeedEnv(`VITE_SUPABASE_URL=${PROD_URL}\nTEST_SUPABASE_SERVICE_ROLE_KEY=SECRET-VALUE`);
    } catch (e) {
      expect((e as Error).message).not.toContain('SECRET-VALUE');
    }
  });
});

describe('persona address matching', () => {
  it('accepts every persona address', () => {
    for (const id of PERSONA_IDS) {
      expect(isSeededPersonaEmail(personaEmail(id))).toBe(true);
      expect(isPersonaAccountEmail(personaEmail(id))).toBe(true);
    }
  });

  it.each([
    addr('bob', 'gmail.com'),
    addr('BOB', `${PERSONA_DOMAIN}.evil.com`),
    addr('bob', `${PERSONA_DOMAIN}.evil.com`),
    addr('bob', `${PERSONA_DOMAIN}x`),
    `${personaEmail('bob')} junk`,
    `${personaEmail('bob')},${addr('eve', 'gmail.com')}`,
    `x${personaEmail('bob')}`,
    `${addr('bob', 'evil.com')}@${PERSONA_DOMAIN}`,
    '',
  ])('rejects %j', (email) => {
    expect(isSeededPersonaEmail(email)).toBe(false);
    expect(isPersonaAccountEmail(email)).toBe(false);
  });

  it('rejects null and undefined', () => {
    expect(isSeededPersonaEmail(null)).toBe(false);
    expect(isPersonaAccountEmail(undefined)).toBe(false);
  });

  it('reset matching is stricter than the invite guard: no trimming, no case folding', () => {
    expect(isPersonaAccountEmail(` ${personaEmail('bob')}`)).toBe(false);
    expect(isPersonaAccountEmail(`${personaEmail('bob')} `)).toBe(false);
    expect(isPersonaAccountEmail(addr('Bob', PERSONA_DOMAIN))).toBe(false);
  });

  it('finds only persona accounts among other users', () => {
    const found = matchPersonaUsers([
      { id: U1, email: personaEmail('bob') },
      { id: U2, email: addr('bob', 'gmail.com') },
      { id: '33333333-3333-4333-8333-333333333333', email: addr('BOB', `${PERSONA_DOMAIN}.evil.com`) },
      { id: '44444444-4444-4444-8444-444444444444', email: null },
    ]);
    expect([...found.entries()]).toEqual([['bob', U1]]);
  });
});

describe('reset filters', () => {
  it('are built only from the persona id list: every filter carries exactly that list', () => {
    const filters = buildResetFilters([U1, U2]);
    expect(filters.length).toBe(RESET_ORDER.length);
    for (const f of filters) expect(f.values).toEqual([U1, U2]);
  });

  it('does not alias the caller list', () => {
    const ids = [U1];
    const filters = buildResetFilters(ids);
    filters[0]!.values.push('x');
    expect(ids).toEqual([U1]);
  });

  it('is empty for an empty list, never an unfiltered delete', () => {
    expect(buildResetFilters([])).toEqual([]);
  });

  it.each(['', 'bob', "1' or '1'='1", '*', U1 + ',' + U2, '(11111111-1111-4111-8111-111111111111)'])('refuses the non-uuid id %j', (bad) => {
    expect(() => buildResetFilters([U1, bad])).toThrow(SeedGuardError);
  });

  it('only ever targets owner columns, never groups, accounts of others or global tables', () => {
    const tables = RESET_ORDER.map((s) => s.table);
    expect(tables).not.toContain('organization');
    expect(tables).not.toContain('profiles');
    expect(tables).not.toContain('email_send_log');
    const owners = RESET_ORDER.map((s) => `${s.table}.${s.column}`);
    expect(owners).toEqual([
      'clarity_letters.sender_id', 'clarity_docs.owner_id', 'clarity_agreements.creator_profile_id', 'event_preparations.profile_id',
      'event_rsvps.profile_id',
      'events.host_id', 'point_positions.user_id', 'story_points.author_id', 'stories.author_id', 'points.first_validator_id',
      'membership.user_id',
    ]);
  });

  it('deletes children before parents', () => {
    const at = (t: string) => RESET_ORDER.findIndex((s) => s.table === t);
    expect(at('letter_deliveries')).toBe(-1); // never deleted by receiver; they go with the persona letter
    expect(at('clarity_letters')).toBeLessThan(at('clarity_docs')); // letters reference docs
    expect(at('clarity_letters')).toBeLessThan(at('stories')); // snapshots reference stories
    expect(at('event_rsvps')).toBeLessThan(at('events'));
    expect(at('event_preparations')).toBeLessThan(at('event_rsvps')); // p1336_prep_guard pins rsvp_id
    expect(at('point_positions')).toBeLessThan(at('points'));
    expect(at('story_points')).toBeLessThan(at('stories'));
    expect(at('clarity_letters')).toBeLessThan(at('points')); // letter responses reference points
  });

  it('leaves organizer memberships to the account cascade (P1193 forbids a direct last-organizer delete)', () => {
    const m = RESET_ORDER.find((s) => s.table === 'membership');
    expect(m?.excludeRole).toBe('organizer');
  });
});

describe('seed plan', () => {
  const now = new Date('2026-10-17T05:00:00Z'); // 12:00 in Asia/Bangkok

  it('hosts every event with an organizer of its group (events_org_requires_organizer)', () => {
    const memberships = planMemberships();
    for (const ev of planEvents(now)) {
      expect(memberships.some((m) => m.groupSlug === ev.groupSlug && m.persona === ev.host && m.role === 'organizer')).toBe(true);
    }
  });

  it('puts the schedule where the mock has it', () => {
    const evs = planEvents(now);
    expect(evs.map((e) => [e.groupSlug, e.status, e.datetime.slice(0, 10)])).toEqual([
      ['cm', 'upcoming', '2026-10-17'],
      ['cm', 'completed', '2026-10-03'],
      ['online', 'completed', '2026-09-26'],
      ['online', 'upcoming', '2026-10-24'],
    ]);
    expect(evs[0]!.title).toBe('Clarity Night, Oct 17');
    expect(evs[0]!.datetime).toBe('2026-10-17T19:00:00+07:00');
  });

  it('reads "today" in the local timezone, not UTC', () => {
    const lateUtc = new Date('2026-10-17T20:00:00Z'); // already Oct 18 in Bangkok
    expect(planEvents(lateUtc)[0]!.datetime.slice(0, 10)).toBe('2026-10-18');
  });

  it('memberships mirror the groups', () => {
    const cm = planMemberships().filter((m) => m.groupSlug === 'cm');
    expect(cm.map((m) => [m.persona, m.role])).toEqual([['bob', 'organizer'], ['alice', 'member'], ['carol', 'member']]);
    expect(GROUPS.map((g) => g.slug)).toEqual(['cm', 'online']);
  });

  // Each author holds one `agree` on their own point (70% of real authors on the test project do; without it the
  // point is missing from the author's Share picker). A viewer (bob, dana) never holds one on someone else's point.
  it('the author holds one agree on their own point; viewers hold none on anyone else\'s', () => {
    const { positions } = planPositions();
    const author = new Map(SEED_SHAREABLE.map((s) => [s.id, s.author]));
    for (const p of positions) {
      if (p.persona === author.get(p.pointKey)) expect(p.position).toBe('agree');
      else expect(['bob', 'dana']).not.toContain(p.persona);
    }
    for (const s of SEED_SHAREABLE.filter((x) => x.kind === 'point')) {
      expect(positions.filter((p) => p.pointKey === s.id && p.persona === s.author)).toHaveLength(1);
    }
    expect(new Set(positions.map((p) => `${p.pointKey}:${p.persona}`)).size).toBe(positions.length);
  });

  it('interleaves categories so truncating keeps the mix', () => {
    expect(expandCounts({ agree: 2, unsure: 3, somewhat_disagree: 2 })).toEqual([
      'agree', 'unsure', 'somewhat_disagree', 'agree', 'unsure', 'somewhat_disagree', 'unsure',
    ]);
  });

  // profiles.is_admin has a single-admin unique index (P878 mitigation 4) held by the founder: no persona is admin.
  it('no persona profile row is an admin', () => {
    const admins = PERSONA_IDS.filter((id) => profileRow(id, U1)['is_admin'] === true);
    expect(admins).toEqual([]);
    expect(profileRow('bob', U1)['email']).toBe(personaEmail('bob'));
    expect(profileRow('bob', U1)['slug']).toBe('p1509-bob');
  });
});

describe('secrets file', () => {
  it('lives outside the repository and the guard refuses a path inside it', () => {
    const repo = path.resolve(__dirname, '../..');
    expect(() => assertOutside(repo)).not.toThrow(); // the real file is under the home directory
    expect(() => assertOutside(repo, path.join(repo, '.local', 'p1509-personas.json'))).toThrow(PersonaSecretsError);
    expect(() => assertOutside(repo, path.join(repo, 'public', 'x.json'))).toThrow(PersonaSecretsError);
    expect(() => assertOutside(repo, repo)).toThrow(PersonaSecretsError);
    expect(PERSONA_SECRETS_FILE.startsWith(repo + path.sep)).toBe(false);
  });

  it('is written with mode 0600 and holds one password per persona', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'p1509-secrets-'));
    try {
      const file = path.join(dir, 'nested', 'personas.json');
      const passwords = Object.fromEntries(PERSONA_IDS.map((id) => [id, freshPassword()]));
      writePersonaSecrets(passwords, file, { now: new Date('2026-10-17T00:00:00Z') });
      expect(statSync(file).mode & 0o777).toBe(0o600);
      const parsed = JSON.parse(readFileSync(file, 'utf8'));
      expect(parsed.generatedAt).toBe('2026-10-17T00:00:00.000Z');
      expect(Object.keys(parsed.passwords).sort()).toEqual([...PERSONA_IDS].sort());
      expect(readPersonaSecrets(file)).toEqual(passwords);
      writePersonaSecrets(passwords, file); // a second write replaces the first and keeps the mode
      expect(statSync(file).mode & 0o777).toBe(0o600);
      expect(readdirSync(path.dirname(file))).toEqual(['personas.json']); // no temp file left behind
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('never writes through a symlink', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'p1509-secrets-'));
    try {
      const target = path.join(dir, 'target.json');
      writeFileSync(target, 'untouched');
      const link = path.join(dir, 'link.json');
      symlinkSync(target, link);
      expect(() => writePersonaSecrets({ bob: 'x' }, link)).toThrow(PersonaSecretsError);
      expect(readFileSync(target, 'utf8')).toBe('untouched');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('reads null for an absent or broken file', () => {
    expect(readPersonaSecrets(path.join(tmpdir(), 'p1509-does-not-exist.json'))).toBeNull();
  });

  it('generates a fresh, unguessable password every time', () => {
    const a = freshPassword();
    const b = freshPassword();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[A-Za-z0-9_-]{32}$/); // 24 random bytes, base64url
  });

  it('the seed script keeps no secrets path of its own and checks the location before any network call', () => {
    expect(source).not.toContain('PERSONA_SECRETS_PATH');
    expect(source).not.toMatch(/writeFileSync|chmodSync/);
    expect(source).toContain('{ root: REPO_ROOT }'); // containment re-checked on the real directory at write time
    expect(source.indexOf('assertOutside(REPO_ROOT)')).toBeGreaterThan(-1);
    expect(source.indexOf('assertOutside(REPO_ROOT)')).toBeLessThan(source.indexOf('createClient(url'));
  });
});

describe('admin API rejection', () => {
  it('is recognised by the API error code, never by a keyword in a message that echoes the address', () => {
    expect(REJECTED_ADDRESS_CODES.has('email_address_invalid')).toBe(true);
    expect(REJECTED_ADDRESS_CODES.has('invalid_credentials')).toBe(false);
    expect(REJECTED_ADDRESS_CODES.has('')).toBe(false);
    expect(source).not.toMatch(/\/invalid\|domain/);
  });
});
