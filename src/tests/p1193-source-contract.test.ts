/**
 * @file p1193-source-contract.test.ts
 * @description P1193 — the SOURCE contract for the Clarity Groups rename.
 *
 * These are the Done-When lines whose subject is a property of the source, not of a
 * running page. Three kinds live here and no browser can see any of them:
 *
 *  1. **Absence.** "No user-visible string reads Organization" is not observable from
 *     a green page — a page renders one screen, and the claim is about all of them.
 *     It is observable from a grep, and only from a grep.
 *  2. **Permanence.** The /org* redirect exists to serve links that were shared before
 *     the rename. Its whole value is that it is still there in a year, which is a
 *     property of the file, not of a request.
 *  3. **Route ordering.** /groups must be declared before /groups/:slug or the bare
 *     path is captured as a slug — an ordering fact, invisible to a test that only
 *     visits one URL.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { resolve } from 'path';

const root = resolve(__dirname, '../..');
const read = (p: string) => readFileSync(resolve(root, p), 'utf8');

/** Source with comments stripped. Every claim here is about what the code DOES; the
 *  prose explaining why is not the subject, and this file argues its own case at
 *  length in comments that must not themselves trip the assertions. */
const codeOnly = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const app = read('src/App.tsx');
const navLinks = read('src/app/components/layout/nav-links.ts');
const eventsList = read('src/app/prototypes/events/components/EventsList.tsx');

describe('P1193 — the route moved to /groups', () => {
  it('registers the three /groups routes', () => {
    expect(app).toMatch(/<Route path="\/groups" /);
    expect(app).toMatch(/<Route path="\/groups\/:slug" /);
    expect(app).toMatch(/<Route path="\/groups\/:slug\/join" /);
  });

  it('declares /groups BEFORE /groups/:slug so the bare path is not captured as a slug', () => {
    expect(app.indexOf('path="/groups"')).toBeLessThan(app.indexOf('path="/groups/:slug"'));
  });
});

describe('P1193 — /org* keeps working, permanently', () => {
  it('registers both the bare /org path and the /org/* splat', () => {
    // Both are needed: React Router's "/org/*" does not match the bare "/org".
    expect(app).toMatch(/<Route path="\/org" element=\{<OrgLegacyRedirect \/>\}/);
    expect(app).toMatch(/<Route path="\/org\/\*" element=\{<OrgLegacyRedirect \/>\}/);
  });

  it('carries the query string AND the hash across the hop', () => {
    // P1076: invite links carry ?from= attribution, which is COLLECTED at the moment
    // the link is followed. Dropping the search string on the redirect loses the
    // attribution silently — no error, no missing page, just a number that never
    // arrives. The hash rides along for the same reason at lower stakes.
    const redirect = app.match(/function OrgLegacyRedirect\(\)[\s\S]*?\n}/)?.[0];
    expect(redirect, 'OrgLegacyRedirect not found in App.tsx').toBeTruthy();
    expect(redirect).toContain('location.search');
    expect(redirect).toContain('location.hash');
  });

  it('rewrites only the /org PREFIX, keeping the rest of the path', () => {
    const redirect = app.match(/function OrgLegacyRedirect\(\)[\s\S]*?\n}/)?.[0] ?? '';
    // Anchored at the start. An unanchored replace would corrupt any path with "/org"
    // in the middle of it.
    expect(redirect).toMatch(/replace\(\/\^\\\/org\//);
    expect(redirect).toContain('/groups${rest}');
  });

  it('the auth redirect allowlist keeps /org AND gains /groups', () => {
    // This check runs on the redirect target BEFORE any router redirect renders, so
    // /org cannot be dropped from it just because App.tsx redirects that path.
    // P1223 moved the list from AuthCallbackPage.tsx into its own module so the shape
    // check is unit-testable; the contract (both prefixes present) is unchanged.
    const auth = read('src/auth/redirect-allowlist.ts');
    const list = auth.match(/ALLOWED_REDIRECT_PREFIXES\s*=\s*\[([^\]]+)\]/)?.[1];
    expect(list, 'ALLOWED_REDIRECT_PREFIXES not found').toBeTruthy();
    expect(list).toContain("'/org'");
    expect(list).toContain("'/groups'");
  });
});

describe('P1193 — the nav item is Groups', () => {
  it('points at the directory, not at one hardcoded group', () => {
    expect(navLinks).toMatch(/export const EVENTS_NAV_TO = "\/groups";/);
    // The one-group hack this replaces. If it comes back, the menu sends everyone
    // into Chiang Mai regardless of what they belong to.
    expect(codeOnly(navLinks)).not.toContain('/org/cm');
  });

  it('labels every call site "Groups" and none of them "Events"', () => {
    const code = codeOnly(navLinks);
    expect(code).not.toMatch(/label: "Events"/);
    expect(code.match(/label: "Groups"/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
  });

  it('no nav component still renders a hardcoded "Events" label', () => {
    // Scoped to nav-links.ts, the check above missed the desktop top-nav link in
    // simple-navigation.tsx, which is hand-written (icon above label) instead of
    // mapping over PUBLIC_NAV_GROUPS — so it carried its own literal <span>Events</span>
    // and no gate, source or browser, was looking at it. Sweep the whole folder.
    const offenders: string[] = [];
    for (const f of readdirSync(resolve(root, 'src/app/components/layout'))) {
      if (!/\.tsx?$/.test(f)) continue;
      const src = codeOnly(read(`src/app/components/layout/${f}`));
      for (const line of src.split('\n')) {
        if (/>\s*Events\s*</.test(line) || /label:\s*["']Events["']/.test(line)) {
          offenders.push(`src/app/components/layout/${f}: ${line.trim()}`);
        }
      }
    }
    expect(offenders, `hardcoded "Events" nav labels:\n${offenders.join('\n')}`).toEqual([]);
  });

  it('lights the active state on BOTH /groups and /events routes', () => {
    // A visitor who clicks through to an event lands on /events/:slug. The tab must
    // not go dark there.
    const matcher = navLinks.match(/export function isEventsNavActive[\s\S]*?\n}/)?.[0] ?? '';
    expect(matcher).toContain('"/events"');
    expect(matcher).toContain('"/events/"');
    expect(matcher).toContain('EVENTS_NAV_TO');
  });
});

describe('P1193 — the rename reached REGEX path patterns, not only string literals', () => {
  // The branch-wide sweep rewrote quoted paths ('/org/...', `/org/${slug}`) and missed
  // every pattern written as a regex, because `\/org\/` matches none of those forms.
  // Two real defects hid there: this bottom-nav focus rule, and a pair of redirect
  // assertions in p1010's e2e. Both are the same shape — a matcher that simply stops
  // matching, with no error anywhere.
  it('the bottom nav still treats the join page as a focus surface', () => {
    // If this stops matching, BottomNav renders on top of the join page's own action
    // on mobile — the exact overlap the focus-route list exists to prevent.
    const bottomNav = read('src/app/components/layout/bottom-nav.tsx');
    expect(bottomNav).toMatch(/\/\^\\\/\(org\|groups\)\\\/\[\^\/\]\+\\\/join/);
  });

  it('no regex-form /org path pattern survives unmigrated in src/', () => {
    const offenders: string[] = [];
    const walkAll = (dir: string): string[] =>
      readdirSync(resolve(root, dir), { withFileTypes: true }).flatMap((e) =>
        e.isDirectory() ? walkAll(`${dir}/${e.name}`) : /\.tsx?$/.test(e.name) ? [`${dir}/${e.name}`] : [],
      );
    for (const f of walkAll('src')) {
      if (f.startsWith('src/tests')) continue;
      for (const line of read(f).split('\n')) {
        // A regex-escaped /org that does NOT also admit `groups`, and is not the
        // legacy-redirect's own prefix strip (which must match /org exactly).
        if (!/\\\/org\\\//.test(line)) continue;
        if (/\(org\|groups\)/.test(line)) continue;
        offenders.push(`${f}: ${line.trim()}`);
      }
    }
    expect(offenders, `unmigrated regex path patterns:\n${offenders.join('\n')}`).toEqual([]);
  });
});

describe('P1193 — Co-create leaves the group list and stays on the standalone one', () => {
  it('guards the Co-create link on !isOrgScoped', () => {
    expect(eventsList).toMatch(/\{!isOrgScoped && \(\s*<Link to="\/co-create">/);
  });

  it('still renders Host Event unconditionally — the group list is not left actionless', () => {
    // The failure this catches: guarding the whole actionButtons block instead of the
    // one link, which would strip Host Event from group pages too and remove the only
    // way an organizer schedules anything.
    const block = eventsList.match(/const actionButtons = \([\s\S]*?\n {2}\);/)?.[0] ?? '';
    expect(block).toContain('Host Event');
    // Read the guarded region itself — from the guard to its closing `)}` — and
    // confirm Host Event is not inside it. A greedy scan of the whole block would
    // "find" Host Event past the guard's end and fail on correct code.
    const guarded = block.match(/\{!isOrgScoped && \(([\s\S]*?)\n {6}\)\}/)?.[1] ?? '';
    expect(guarded, 'the !isOrgScoped guard was not found').toContain('Co-create');
    expect(guarded).not.toContain('Host Event');
  });

  it('no longer claims Co-create travels everywhere', () => {
    // The reversed comment. A comment that contradicts the code is worse than none:
    // the next reader trusts it and re-adds the button.
    expect(eventsList).not.toContain('Co-create travels with it');
  });
});

describe('P1193 — "Organization" is gone from every user-visible string', () => {
  /** Every source file under src/, minus the ones this rename deliberately spares. */
  const walk = (dir: string): string[] =>
    readdirSync(resolve(root, dir), { withFileTypes: true }).flatMap((e) =>
      e.isDirectory()
        ? walk(`${dir}/${e.name}`)
        : /\.tsx?$/.test(e.name)
          ? [`${dir}/${e.name}`]
          : [],
    );

  // Each exemption is a decision, not an oversight, and each is load-bearing:
  //  - coa-versions.ts       — v4/v5 titles ARE the legal record. Retitling them in
  //                            place would rewrite what members accepted. Asserted
  //                            positively in coa-versions.test.ts.
  //  - src/tests             — these files quote the strings in order to check them.
  //  - the Schegloff citation — a real 1977 paper title ("...Organization of Repair
  //                            in Conversation"). Renaming a citation is falsifying it.
  //  - "in organizations alone" — the Clarity Tax statistic, about companies. Ordinary
  //                            English, never the product noun.
  const EXEMPT_FILES = ['src/app/content/coa-versions.ts'];
  const EXEMPT_STRINGS = [
    'Organization of Repair in Conversation',
    'In organizations alone',
    '"@type": "Organization"',
    // Generic English about the READER'S OWN employer, not a Clarity Group. Renaming
    // these would claim the reader belongs to a Clarity Group, which is the opposite
    // of what the marketing copy is saying. The program-timeline line carries a
    // [FOUNDER DECISION: wording] marker directly above it.
    'Carry it into your own organization',
    'their organization — run as a group',
    'Bring clarity into your organization',
  ];

  /** Lines that mention the noun but that no user ever reads. */
  const isInternal = (line: string) =>
    // Error messages thrown to the console/Sentry, never rendered.
    /new Error\(/.test(line)
    // The DB table is named `organization` and stays that way — same reasoning as
    // the `role = 'organizer'` value the spec explicitly leaves alone.
    || /\.from\(['"]organization['"]\)/.test(line)
    // Bare identifiers inside a multi-line import or type list.
    || /^\s*Organizations?[,;]?\s*$/.test(line)
    // A TYPE ANNOTATION — `org: Organization;`, `myOrg: Organization | null`. The
    // TYPE is called Organization and stays that way; only what a person READS is in
    // scope, same reasoning as the DB table and the 'organizer' role value.
    || /:\s*Organizations?\b/.test(line);

  it('has no user-visible Organization string left outside the recorded exemptions', () => {
    const offenders: string[] = [];
    for (const file of walk('src')) {
      if (file.startsWith('src/tests') || EXEMPT_FILES.includes(file)) continue;
      const code = codeOnly(read(file));
      for (const line of code.split('\n')) {
        // CASE-INSENSITIVE. The first version of this check matched capital-O
        // `Organization` only, and shipped past "This organization hasn't hosted an
        // event yet" in the group-page empty state — a string a screenshot caught and
        // this gate did not. A rename check that only sees the title-cased spelling
        // is blind to exactly the prose forms where the noun appears mid-sentence.
        if (!/\borganizations?\b/i.test(line)) continue;
        if (EXEMPT_STRINGS.some((s) => line.includes(s))) continue;
        // A quoted string or JSX text — i.e. something a person could read. Type
        // names, imports and identifiers (`Organization`, `organizationsService`)
        // are internal and deliberately unchanged, same reasoning as the DB table.
        // HTML entities are stripped FIRST. `&apos;` and friends end in a semicolon,
        // and a prose-detector that treats `;` as a code signal therefore classifies
        // "This organization hasn&apos;t hosted an event yet" as code and waves it
        // through. That is not hypothetical — it is the exact line this gate shipped
        // past on its first version, and re-running a known-bad control through the
        // FIXED gate is the only reason it was caught the second time either.
        // Trailing `//` comments too — codeOnly() only strips comments that occupy a
        // whole line, so an explanatory tail on a code line survives into `prose`.
        const prose = line.replace(/\/\/.*$/, '').replace(/&[a-zA-Z]+;/g, "'");
        const quoted = /["'`][^"'`]*\borganizations?\b[^"'`]*["'`]/i.test(prose);
        // JSX text: between tags, or a bare line of prose carrying no code syntax.
        // `=` and `;` are deliberately NOT code signals here — see above.
        const jsxText =
          />[^<]*\borganizations?\b[^<]*</i.test(prose) ||
          (!/[<>{}]/.test(prose) && /\borganizations?\b/i.test(prose));
        if (!quoted && !jsxText) continue;
        // Identifier-position matches inside import/type lines.
        if (/^\s*import\b/.test(line) || /from ["']/.test(line)) continue;
        if (/\bconsole\.(error|warn|log)\b/.test(line)) continue;
        if (isInternal(line)) continue;
        offenders.push(`${file}: ${line.trim()}`);
      }
    }
    expect(offenders, `user-visible "Organization" strings still present:\n${offenders.join('\n')}`).toEqual([]);
  });

  it('the group surfaces say Group where they used to say Organization', () => {
    // The positive half. The absence check above passes on a file that simply deleted
    // its copy; these prove the replacement actually landed.
    expect(read('src/app/pages/org-directory-page.tsx')).toContain('Clarity Groups');
    expect(read('src/app/pages/org-page.tsx')).toContain('Clarity Group Terms');
    expect(read('src/app/pages/org-join-page.tsx')).toContain('Clarity Group Terms');
    expect(read('src/app/components/organizations/org-header.tsx')).toContain('Leave this group?');
  });
});

describe('P1193 — the last-organizer guard exists in the DATABASE, not only the UI', () => {
  const migration = read('supabase/migrations/20260831190000_p1193_last_organizer_cannot_leave.sql');

  it('is a BEFORE DELETE trigger on membership', () => {
    expect(migration).toMatch(/BEFORE DELETE ON public\.membership/);
    expect(migration).toMatch(/FOR EACH ROW/);
  });

  it('raises rather than silently deleting zero rows', () => {
    // An RLS tightening would match zero rows, and zero-rows-deleted already MEANS
    // "you had already left" in leaveOrganization's { left: false } contract. Only a
    // raise can tell the caller why.
    expect(migration).toContain('RAISE EXCEPTION');
  });

  it('stands aside for cascade deletes', () => {
    // org_id and user_id are both ON DELETE CASCADE. Without this, deleting an
    // organization or a profile is blocked by the very trigger meant to protect it.
    expect(migration).toContain('pg_trigger_depth()');
  });

  it('scopes the block to organizers only', () => {
    expect(migration).toMatch(/OLD\.role IS DISTINCT FROM 'organizer'/);
  });
});
