/**
 * @file p1141-seal-rpc-video-canary.test.ts
 * @description Sibling of p819-seal-rpc-imageurl-canary.test.ts, for P1141's
 * two new snapshot keys.
 *
 * 'imageUrl' has been silently dropped from seal_and_send_letter's
 * jsonb_build_object TWICE by a CREATE OR REPLACE built from a stale base
 * (P751 added it, P749/P757 dropped it, P819 restored it, P833 again). The
 * sealed-letter path is this spec's sharp edge for exactly that reason. This
 * canary asserts the same thing for 'videoUrl' and 'videoQuotes', and asserts
 * that 'imageUrl' still survives ALONGSIDE them — a rewrite that adds the video
 * keys while losing the image key is the third instance of the same bug, not a
 * new one.
 *
 * Failure path exercised (epistemic gate 7): pointing TEST_MIGRATIONS_DIR at a
 * copy of supabase/migrations/ with the 'videoUrl' key deleted from the latest
 * definition makes this file exit non-zero.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const MIGRATIONS_DIR =
  process.env.TEST_MIGRATIONS_DIR ??
  join(__dirname, '..', '..', 'supabase', 'migrations');

const FUNCTION_DEF_PATTERN =
  /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+(?:public\.)?seal_and_send_letter\b/i;

function latestSealDefinition(): { file: string | null; body: string } {
  const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();
  let file: string | null = null;
  let body = '';
  for (const name of files) {
    const contents = readFileSync(join(MIGRATIONS_DIR, name), 'utf8');
    if (FUNCTION_DEF_PATTERN.test(contents)) {
      file = name;
      body = contents;
    }
  }
  return { file, body };
}

describe('p1141: seal_and_send_letter carries the story video reference', () => {
  it('a migration redefining seal_and_send_letter exists at all', () => {
    const { file } = latestSealDefinition();
    expect(file, 'No migration redefines seal_and_send_letter — schema regression').not.toBeNull();
  });

  it("the latest definition writes 'videoUrl' into point_config", () => {
    const { file, body } = latestSealDefinition();
    expect(
      /'videoUrl'\s*,\s*COALESCE\s*\(\s*\w+\.video_url/i.test(body),
      `${file} redefines seal_and_send_letter but does not write 'videoUrl' into point_config. ` +
        `Letters seal with no video — silently, with nothing to notice until a recipient reads one.`
    ).toBe(true);
  });

  it("the latest definition writes 'videoQuotes' into point_config", () => {
    const { file, body } = latestSealDefinition();
    expect(
      /'videoQuotes'\s*,\s*COALESCE\s*\(\s*\w+\.video_quotes/i.test(body),
      `${file} redefines seal_and_send_letter but does not write 'videoQuotes'. A letter then ` +
        `renders a player with no quotes under it — the half-broken state that reads as a bug.`
    ).toBe(true);
  });

  it("'imageUrl' still survives alongside the new keys", () => {
    const { file, body } = latestSealDefinition();
    expect(
      /'imageUrl'\s*,\s*COALESCE\s*\(\s*\w+\.image_url/i.test(body),
      `${file} adds the video keys but drops 'imageUrl'. That is the P751/P819 regression for ` +
        `a third time, not a new bug: stories with an image and no video lose their image.`
    ).toBe(true);
  });

  it('the video columns the RPC reads are the ones the schema migration created', () => {
    const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();
    const schema = files
      .map((f) => readFileSync(join(MIGRATIONS_DIR, f), 'utf8'))
      .join('\n');
    expect(/ADD COLUMN IF NOT EXISTS video_url/i.test(schema)).toBe(true);
    expect(/ADD COLUMN IF NOT EXISTS video_quotes/i.test(schema)).toBe(true);
  });
});
