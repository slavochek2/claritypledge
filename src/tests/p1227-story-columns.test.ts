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

const MIGRATIONS = join(import.meta.dirname, '../../supabase/migrations');

/** Columns of `public.stories` as the migrations leave them, replayed in filename order. */
export function storiesColumnsFromMigrations(dir = MIGRATIONS): Set<string> {
  const cols = new Set<string>();
  const files = readdirSync(dir).filter(f => f.endsWith('.sql')).sort();
  for (const file of files) {
    const sql = readFileSync(join(dir, file), 'utf8').replace(/--[^\n]*/g, '');
    const create = sql.match(/CREATE TABLE(?: IF NOT EXISTS)?\s+(?:public\.)?stories\s*\(([\s\S]*?)\n\);/i);
    if (create) {
      for (const line of create[1].split('\n')) {
        const m = line.match(/^\s*([a-z_][a-z0-9_]*)\s+[A-Z]/);
        if (m && !/^(PRIMARY|CONSTRAINT|UNIQUE|CHECK|FOREIGN)$/i.test(m[1])) cols.add(m[1]);
      }
    }
    // One statement may carry several ADD/DROP clauses; walk each ALTER TABLE stories … ;
    const alters = sql.matchAll(/ALTER TABLE(?: IF EXISTS)?\s+(?:public\.)?stories\b([\s\S]*?);/gi);
    for (const [, body] of alters) {
      for (const [, verb, col] of body.matchAll(/\b(ADD|DROP)\s+COLUMN(?:\s+IF\s+(?:NOT\s+)?EXISTS)?\s+"?([a-z_][a-z0-9_]*)"?/gi)) {
        if (verb.toUpperCase() === 'ADD') cols.add(col);
        else cols.delete(col);
      }
    }
  }
  return cols;
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
