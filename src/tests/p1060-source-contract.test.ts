/**
 * @file p1060-source-contract.test.ts
 * @description P1060 contract row M1 — the SOURCE contract.
 *
 * These are the Done-When lines whose subject is a property of the source itself
 * rather than of a running page: what the migration literally contains, what the
 * seed literally writes, which pattern the avatar row reuses, and whether the
 * founder-approved reference the blind reviewer judges against is still the one
 * the spec records. A browser cannot see any of them, and every one of them is a
 * claim that reads as satisfied while being false.
 *
 * Deliberately assertions about TEXT, not behaviour. "The backfill uses no
 * location substring match" is not observable from a green query — it is
 * observable from the absence of a `location LIKE` in the file, and the spec
 * makes that absence a hard requirement (D2: a substring match misclassifies 4
 * of the 8 rows).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { resolve } from 'path';

const root = resolve(__dirname, '../..');
const read = (p: string) => readFileSync(resolve(root, p), 'utf8');

/**
 * Source with comments removed. The "no create-organization affordance" assertion
 * is about what the page RENDERS, not about the prose explaining why it renders
 * nothing — and this file's own doc comment says the words out loud on purpose.
 */
const codeOnly = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const MIGRATION = (() => {
  const dir = resolve(root, 'supabase/migrations');
  const p1060 = readdirSync(dir).filter((f) => f.includes('p1060'));
  // The invariant is about the BACKFILL AND SEED specifically: if those two could
  // land in separate migrations they could apply out of order, and the order is
  // load-bearing (backfill BEFORE org #2). So the assertion is "exactly one file
  // carries the backfill", NOT "exactly one file mentions p1060" — the latter was a
  // proxy that also banned unrelated P1060 migrations. A second migration that adds,
  // say, a trigger touches neither the backfill nor the seed and cannot reorder them.
  const hits = p1060.filter((f) => /_p1060_events_org_id\.sql$/.test(f));
  expect(
    hits.length,
    `expected exactly 1 p1060 backfill/seed migration, found: ${hits.join(', ') || '(none)'} (all p1060 files: ${p1060.join(', ')})`,
  ).toBe(1);
  const contents = readFileSync(resolve(dir, hits[0]), 'utf8');
  // Belt and braces: the one file we selected must actually carry BOTH halves, so a
  // future split into two files fails here rather than silently passing the count.
  expect(contents, 'the backfill migration must also carry the org #2 seed').toContain(
    "INSERT INTO public.organization",
  );
  return contents;
})();

/** The 8 Chiang Mai slugs, verbatim from the spec's Solution item 2. */
const CM_SLUGS = [
  'clarity-dinner-1-exploring-coordination-understanding-2026-02-12-ld5e',
  'ai-run-1',
  'ai-running-club-chiang-mai-2-sun-may-24-2026-05-17-b0rc',
  'ai-running-club-chiang-mai-3-sun-may-31-2026-05-24-gfmi',
  'how-well-do-your-ai-clients-and-partners-understand-your-business-model-2026-06-08-bpl3',
  'clarity-hike-doi-pui-peak-double-loop-2026-06-21-w4k2mj',
  'clarity-hike-buddha-footprint-doi-pui-peak-2026-07-05-76dde6',
  'social-hike-buddhas-footprint-trail-2026-08-30-9099c3',
];
const KO_PHANGAN_SLUGS = [
  'clarity-run-phaeng-noi-waterfall-loop-2026-02-25-jizou5',
  'clarity-lab-koh-phangan-2026-03-12-ad3385',
];

describe('P1060 M1 — DW-2: the backfill is a literal slug list, not a classifier', () => {
  it('enumerates all 8 named Chiang Mai slugs verbatim', () => {
    for (const slug of CM_SLUGS) {
      expect(MIGRATION, `migration must name ${slug} literally`).toContain(slug);
    }
  });

  it('names the 2 Ko Phangan slugs so their NULL is asserted, not assumed', () => {
    for (const slug of KO_PHANGAN_SLUGS) {
      expect(MIGRATION).toContain(slug);
    }
  });

  it('asserts the touched row count against the literal 8 and raises on a mismatch', () => {
    expect(MIGRATION).toMatch(/ROW_COUNT/);
    expect(MIGRATION).toMatch(/RAISE EXCEPTION/);
    // The literal 8 must appear in an assertion, not only in prose.
    expect(MIGRATION).toMatch(/touched\s*>\s*8|<>\s*8|!=\s*8/);
  });

  it('contains NO location substring match — a LIKE on location misclassifies 4 of the 8 (D2)', () => {
    // Comment lines are allowed to mention it (the migration explains why it does
    // not do this); executable SQL is not.
    const executable = MIGRATION.split('\n')
      .filter((line) => !line.trimStart().startsWith('--'))
      .join('\n');
    expect(executable).not.toMatch(/location\s+(I?LIKE|~)/i);
    expect(executable).not.toMatch(/Chiang Mai%/);
  });

  it('runs the backfill BEFORE seeding org #2 — order is load-bearing', () => {
    const backfillAt = MIGRATION.indexOf(CM_SLUGS[0]);
    const seedAt = MIGRATION.indexOf("'online'");
    expect(backfillAt).toBeGreaterThan(-1);
    expect(seedAt).toBeGreaterThan(-1);
    expect(backfillAt, 'backfill must precede the · Online seed').toBeLessThan(seedAt);
  });
});

describe('P1060 M1 — DW-3/D7: the · Online seed writes a NULL blurb and no placeholder', () => {
  it('seeds slug "online" with a literal NULL blurb', () => {
    expect(MIGRATION).toMatch(/'online',\s*'Clarity Practice Community · Online',\s*NULL/);
  });

  it('introduces no placeholder blurb string for the new org', () => {
    // The exact filler the UI must also never print. Its presence anywhere in the
    // seed would be the Non-Goal "Do NOT invent the · Online blurb" being violated.
    expect(MIGRATION).not.toContain('A Clarity Organization.');
    expect(MIGRATION).not.toMatch(/Calibrated communication practice online/i);
  });

  it('seeds an organizer membership row for the new org', () => {
    expect(MIGRATION).toMatch(/INSERT INTO public\.membership[\s\S]*'organizer'[\s\S]*o\.slug = 'online'/);
  });
});

describe('P1060 M1 — DW-16: the migration comment states events RLS is unchanged', () => {
  it('says so in words, in the migration itself', () => {
    expect(MIGRATION).toMatch(/EVENTS RLS IS UNCHANGED/i);
    expect(MIGRATION).toMatch(/USING \(true\)/);
  });

  it('changes no policy', () => {
    const executable = MIGRATION.split('\n')
      .filter((line) => !line.trimStart().startsWith('--'))
      .join('\n');
    expect(executable).not.toMatch(/CREATE POLICY|DROP POLICY|ALTER POLICY/i);
  });
});

describe('P1060 M1 — DW-13: the avatar row REUSES the social-proof pattern', () => {
  const row = read('src/app/components/organizations/org-participant-row.tsx');
  const socialProof = read('src/app/components/landing/social-proof.tsx');

  it('carries the +N badge z-10 that social-proof.tsx records as load-bearing', () => {
    expect(socialProof, 'the pattern being reused must still carry it').toContain('relative z-10');
    expect(row, 'a fresh implementation rediscovers the badge-under-avatar bug').toContain('relative z-10');
  });

  it('reuses the overlap and fixed row height rather than inventing spacing', () => {
    expect(row).toContain('-space-x-2');
    expect(row).toContain('h-8');
  });

  it('renders PersonAvatar, not a bespoke avatar div', () => {
    expect(row).toContain('PersonAvatar');
    expect(row).toMatch(/size="sm"/);
  });

  it('derives the +N badge from what is DRAWN, never from the limit constant', () => {
    // social-proof.tsx's badge was permanently short by 2 for exactly this reason.
    expect(row).toMatch(/participation\.count\s*-\s*shown\.length/);
  });

  it('renders nothing at all for a zero-participant organization — no row, no "0"', () => {
    expect(row).toMatch(/count === 0\)?\s*return null|return null/);
    expect(row).toMatch(/!participation \|\| participation\.count === 0/);
  });

  it('uses the verbatim resolved wording "N have joined events"', () => {
    expect(row).toContain('have joined events');
    expect(row, 'RSVPs are not attendance — "participants" overclaims').not.toMatch(
      /\{participation\.count\} participants/,
    );
  });
});

describe('P1060 M1 — both differentiator lines render verbatim', () => {
  const directory = read('src/app/pages/org-directory-page.tsx');

  it('carries the founder-approved line for each seeded organization', () => {
    expect(directory).toContain('The room brings the topic');
    // Founder-approved 2026-08-31, REPLACING "The topic is set in advance". That
    // line was rejected for describing one event format rather than a community —
    // and because · Chiang Mai's own About already says "in person and online", so
    // the medium never distinguished the two groups. This test intentionally pins
    // the exact string: it is founder copy, and a silent edit to it is the thing
    // being guarded against. Changing it requires a founder decision, not a patch.
    expect(directory).toContain('Practise with people outside your own field');
  });

  it('keys them to the two seeded slugs', () => {
    expect(directory).toMatch(/cm:\s*"The room brings the topic"/);
    expect(directory).toMatch(/online:\s*"Practise with people outside your own field"/);
  });
});

describe('P1060 M1 — /org is a registered route and never a creation surface', () => {
  const app = read('src/App.tsx');
  const directory = read('src/app/pages/org-directory-page.tsx');

  it('declares the bare /org route', () => {
    expect(app).toMatch(/<Route path="\/org" /);
  });

  it('declares /org BEFORE /org/:slug so the bare path is not captured as a slug', () => {
    expect(app.indexOf('path="/org"')).toBeLessThan(app.indexOf('path="/org/:slug"'));
  });

  it('offers no create-organization affordance (p1010 Decision 7 stands)', () => {
    expect(codeOnly(directory)).not.toMatch(/create.{0,20}organization/i);
    expect(codeOnly(directory)).not.toMatch(/\/org\/new/);
  });

  it('is registered in PROD_HEALTH_ROUTES in this same diff', () => {
    // decisions.md 2026-06-06: "a new public route joins PROD_HEALTH_ROUTES in the
    // same diff that ships it" — a standing rule with nothing else enforcing it.
    expect(read('e2e/helpers/prod-health.ts')).toMatch(/PROD_HEALTH_ROUTES[\s\S]{0,200}'\/org'/);
  });
});

describe('P1060 M1 — the approved visual reference is unchanged', () => {
  it('the spec still records the artifact URL the blind reviewer is given', () => {
    // Frozen at pin time. A republished reference silently changes what the
    // reviewer judges against, mid-run, with nothing to detect it — so the URL
    // itself is pinned here rather than only in prose.
    const spec = read('features/p1060_link_events_to_organizations.md');
    expect(spec).toContain(
      'https://claude.ai/code/artifact/10cedd0b-ddac-42f6-8c45-4fa002319810',
    );
  });
});
