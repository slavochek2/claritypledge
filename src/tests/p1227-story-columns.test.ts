/**
 * P1227: `api/og.ts` selected `stories.title` for five months after P701 dropped the
 * column (20260413110001_p701_drop_story_title.sql). PostgREST answered 400 on every
 * story, the handler swallowed it into the "Preview temporarily unavailable" card, and
 * no test noticed because every og test stubs the fetch and never checks the SELECT
 * against the schema.
 *
 * Oracle: the migrations themselves — CREATE TABLE stories (...) plus every
 * `ALTER TABLE stories ADD/DROP COLUMN` in filename order. Independent of og.ts, so the
 * next dropped column fails here instead of in a crawler's cache.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { STORY_COLUMNS, storyTitle, storyExcerpt } from '../../api/og';
// (replayStoriesSchema / storiesColumnsFromMigrations are defined below and used by the fixtures.)

const MIGRATIONS = join(import.meta.dirname, '../../supabase/migrations');

/** Strip `-- …` line comments so a commented-out statement is not replayed. */
function stripComments(sql: string): string {
  return sql.replace(/--[^\n]*/g, '');
}

/** Split an ALTER TABLE body on top-level commas — commas inside `(...)` or quotes stay put. */
function splitActions(body: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let quote: string | null = null;
  let cur = '';
  for (const ch of body) {
    if (quote) {
      cur += ch;
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === "'" || ch === '"') quote = ch;
    else if (ch === '(') depth++;
    else if (ch === ')') depth--;
    if (ch === ',' && depth === 0) {
      out.push(cur.trim());
      cur = '';
    } else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

const ident = String.raw`"?([a-z_][a-z0-9_]*)"?`;
const TABLE_RE = new RegExp(String.raw`ALTER TABLE(?:\s+IF EXISTS)?(?:\s+ONLY)?\s+(?:"?public"?\.)?"?stories"?(?![a-z0-9_])([\s\S]*?);`, 'gi');
const CREATE_RE = new RegExp(String.raw`CREATE TABLE(?:\s+IF NOT EXISTS)?\s+(?:"?public"?\.)?"?stories"?\s*\(([\s\S]*?)\n\);`, 'i');

/**
 * Apply one `ALTER TABLE stories <action>` clause to the column set. Every action is either
 * understood (column added / dropped / renamed, or provably column-neutral) or the replay
 * THROWS — an action we cannot classify must never leave the set silently unchanged, because
 * a missed DROP is exactly how P1227 stayed green for five months.
 */
function applyAction(cols: Set<string>, action: string, file: string): void {
  const a = action.replace(/\s+/g, ' ').trim();
  let m: RegExpMatchArray | null;
  // Constraint actions are checked BEFORE the column forms: `ADD CONSTRAINT x` would otherwise
  // parse as adding a column named "CONSTRAINT" (a fixture caught exactly that).
  if (/^(?:ADD|DROP|VALIDATE) CONSTRAINT\b/i.test(a)) return;
  if ((m = a.match(new RegExp(String.raw`^ADD(?: COLUMN)?(?: IF NOT EXISTS)? ${ident}(?![a-z0-9_])`, 'i')))) {
    cols.add(m[1]);
    return;
  }
  if ((m = a.match(new RegExp(String.raw`^DROP(?: COLUMN)?(?: IF EXISTS)? ${ident}(?: (?:CASCADE|RESTRICT))?$`, 'i')))) {
    cols.delete(m[1]);
    return;
  }
  if ((m = a.match(new RegExp(String.raw`^RENAME(?: COLUMN)? ${ident} TO ${ident}$`, 'i')))) {
    if (!cols.has(m[1])) throw new Error(`${file}: RENAME of unknown column ${m[1]}`);
    cols.delete(m[1]);
    cols.add(m[2]);
    return;
  }
  // Column-neutral actions: the column set is provably unchanged by each of these.
  if (/^ALTER(?: COLUMN)? "?[a-z_][a-z0-9_]*"? (?:SET|DROP|TYPE)\b/i.test(a)) return;
  if (/^(?:ENABLE|DISABLE|FORCE|NO FORCE) ROW LEVEL SECURITY$/i.test(a)) return;
  if (/^(?:ENABLE|DISABLE)(?: ALWAYS| REPLICA)? TRIGGER\b/i.test(a)) return;
  if (/^OWNER TO\b/i.test(a)) return;
  // RENAME TO (table rename), SET SCHEMA, INHERIT, ADD without a name, anything new: refuse.
  throw new Error(`${file}: unrecognised ALTER TABLE stories action — extend the replay or it fails open: "${a}"`);
}

/** Replay `stories` DDL from an ordered list of migration files. Exported for fixtures. */
export function replayStoriesSchema(files: Array<{ name: string; sql: string }>): Set<string> {
  const cols = new Set<string>();
  for (const { name, sql: raw } of files) {
    const sql = stripComments(raw);
    const create = sql.match(CREATE_RE);
    if (create) {
      for (const line of create[1].split('\n')) {
        const m = line.match(/^\s*"?([a-z_][a-z0-9_]*)"?\s+[A-Za-z]/);
        if (m && !/^(PRIMARY|CONSTRAINT|UNIQUE|CHECK|FOREIGN|LIKE)$/i.test(m[1])) cols.add(m[1]);
      }
    }
    for (const [, body] of sql.matchAll(TABLE_RE)) {
      for (const action of splitActions(body)) applyAction(cols, action, name);
    }
  }
  return cols;
}

/** Columns of `public.stories` as the migrations leave them, replayed in filename order. */
export function storiesColumnsFromMigrations(dir = MIGRATIONS): Set<string> {
  const files = readdirSync(dir)
    .filter(f => f.endsWith('.sql'))
    .sort()
    .map(name => ({ name, sql: readFileSync(join(dir, name), 'utf8') }));
  return replayStoriesSchema(files);
}

describe('P1227: og.ts story select names only columns that exist', () => {
  const schema = storiesColumnsFromMigrations();

  it('the migration parser is not blind (controls: a dropped and a kept column)', () => {
    expect(schema.has('title')).toBe(false); // P701 dropped it
    expect(schema.has('content')).toBe(true); // since the CREATE TABLE
    expect(schema.has('video_url')).toBe(true); // added by P1141 ALTER
  });

  it('every plain column in STORY_COLUMNS exists in the stories schema', () => {
    const plain = STORY_COLUMNS.filter(c => !c.includes('('));
    const missing = plain.filter(c => !schema.has(c));
    expect(missing, `og.ts selects column(s) the migrations do not define: ${missing.join(', ')}`).toEqual([]);
  });

  it('would have caught the P1227 defect (control: the old column list fails)', () => {
    const old = ['title', 'content', 'banner_url', 'video_url'];
    expect(old.filter(c => !schema.has(c))).toEqual(['title']);
  });
});

describe('P1227: schema replay parses every supported ALTER form and fails CLOSED otherwise', () => {
  const base = { name: '0_base.sql', sql: 'CREATE TABLE stories (\n  id UUID PRIMARY KEY,\n  title TEXT NOT NULL,\n  content TEXT NOT NULL\n);' };
  const replay = (sql: string) => [...replayStoriesSchema([base, { name: '1_next.sql', sql }])].sort();

  it.each([
    ['DROP with COLUMN keyword', 'ALTER TABLE stories DROP COLUMN title;', ['content', 'id']],
    ['DROP without COLUMN keyword', 'ALTER TABLE stories DROP title;', ['content', 'id']],
    ['DROP IF EXISTS … CASCADE', 'ALTER TABLE stories DROP COLUMN IF EXISTS title CASCADE;', ['content', 'id']],
    ['ALTER TABLE ONLY', 'ALTER TABLE ONLY stories DROP COLUMN title;', ['content', 'id']],
    ['ALTER TABLE IF EXISTS public.stories', 'ALTER TABLE IF EXISTS public.stories DROP title;', ['content', 'id']],
    ['quoted "stories"', 'ALTER TABLE "public"."stories" DROP COLUMN "title";', ['content', 'id']],
    ['ADD with COLUMN keyword', 'ALTER TABLE stories ADD COLUMN banner_url TEXT;', ['banner_url', 'content', 'id', 'title']],
    ['ADD without COLUMN keyword', 'ALTER TABLE stories ADD video_url TEXT;', ['content', 'id', 'title', 'video_url']],
    ['ADD IF NOT EXISTS', 'ALTER TABLE public.stories ADD COLUMN IF NOT EXISTS image_url TEXT;', ['content', 'id', 'image_url', 'title']],
    ['RENAME COLUMN', 'ALTER TABLE stories RENAME COLUMN title TO headline;', ['content', 'headline', 'id']],
    ['RENAME without COLUMN keyword', 'ALTER TABLE stories RENAME title TO headline;', ['content', 'headline', 'id']],
    ['multiple actions in one statement, comma inside CHECK parens', "ALTER TABLE stories\n  ADD COLUMN video_url TEXT,\n  ADD CONSTRAINT v CHECK (video_url IN ('a', 'b')),\n  DROP COLUMN title;", ['content', 'id', 'video_url']],
    ['multi-line lowercase', 'alter table stories\n  drop column\n  title;', ['content', 'id']],
    ['column-neutral: ALTER COLUMN SET DEFAULT / DROP NOT NULL', "ALTER TABLE stories ALTER COLUMN title SET DEFAULT '';\nALTER TABLE stories ALTER title DROP NOT NULL;", ['content', 'id', 'title']],
    ['column-neutral: constraints and RLS', 'ALTER TABLE stories DROP CONSTRAINT IF EXISTS c;\nALTER TABLE stories ENABLE ROW LEVEL SECURITY;', ['content', 'id', 'title']],
    ['a commented-out DROP is not replayed', '-- ALTER TABLE stories DROP COLUMN title;', ['content', 'id', 'title']],
    ['another table is not stories', 'ALTER TABLE story_versions DROP COLUMN title;\nALTER TABLE stories_archive DROP COLUMN content;', ['content', 'id', 'title']],
  ])('%s', (_label, sql, expected) => {
    expect(replay(sql)).toEqual(expected);
  });

  it.each([
    ['table rename', 'ALTER TABLE stories RENAME TO tales;'],
    ['SET SCHEMA', 'ALTER TABLE stories SET SCHEMA archive;'],
    ['a DROP whose target is not a plain column', 'ALTER TABLE stories DROP title, content;'],
    ['a DROP with trailing junk we do not model', 'ALTER TABLE stories DROP COLUMN title WHATEVER;'],
    ['a made-up future action', 'ALTER TABLE stories REPLACE COLUMN title WITH heading;'],
    ['RENAME of a column that does not exist', 'ALTER TABLE stories RENAME COLUMN nope TO x;'],
  ])('throws on unrecognised form: %s', (_label, sql) => {
    expect(() => replay(sql)).toThrow(/unrecognised ALTER TABLE stories action|RENAME of unknown column/);
  });

  it('the real migrations directory replays without an unrecognised action', () => {
    expect(() => storiesColumnsFromMigrations()).not.toThrow();
  });
});

describe('P1227: story card title is derived like the story page', () => {
  it('a human story reads "Story by {author}" — the page’s own document title', () => {
    expect(storyTitle('Ada Lovelace', false)).toBe('Story by Ada Lovelace');
  });
  it('an agent reading is named as a reading, never as the person (P1141)', () => {
    expect(storyTitle('Analytical Engine', true)).toBe('Story read by Analytical Engine');
  });
  it('excerpt strips markdown, collapses lines and caps at 160 chars', () => {
    const md = '# Heading\n\nSome **bold** _text_ with `code` and [a link](x).\n' + 'y'.repeat(200);
    const out = storyExcerpt(md);
    expect(out.startsWith('Heading  Some bold text with code and a link(x).')).toBe(true);
    expect(out).not.toMatch(/\n/);
    expect(out.length).toBeLessThanOrEqual(160);
  });
});
