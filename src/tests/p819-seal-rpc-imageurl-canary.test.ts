/**
 * @file p819-seal-rpc-imageurl-canary.test.ts
 * @description Canary for P819. P751 added 'imageUrl' to seal_and_send_letter's
 * jsonb_build_object output. P749/P757/fix_p757 then redefined the function
 * without preserving that key, silently dropping imageUrl from new letter snapshots.
 * Recipients see no image because point_config.imageUrl is absent.
 *
 * This canary fails until the most recent migration that redefines
 * seal_and_send_letter writes 'imageUrl', COALESCE(s.image_url, '').
 * It also catches the same CREATE OR REPLACE override pattern in the future.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const MIGRATIONS_DIR = join(__dirname, '..', '..', 'supabase', 'migrations');
const FUNCTION_DEF_PATTERN = /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+(?:public\.)?seal_and_send_letter\b/i;
const IMAGE_URL_KEY_PATTERN = /'imageUrl'\s*,\s*COALESCE\s*\(\s*\w+\.image_url/i;

describe('p819: seal_and_send_letter migrations preserve imageUrl', () => {
  it(
    'the most recent migration that redefines seal_and_send_letter writes imageUrl into point_config',
    () => {
      const files = readdirSync(MIGRATIONS_DIR)
        .filter((f) => f.endsWith('.sql'))
        .sort();

      let latestMigration: string | null = null;
      let latestBody = '';
      for (const file of files) {
        const body = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
        if (FUNCTION_DEF_PATTERN.test(body)) {
          latestMigration = file;
          latestBody = body;
        }
      }

      expect(latestMigration, 'No migration redefines seal_and_send_letter — schema regression').not.toBeNull();
      expect(
        IMAGE_URL_KEY_PATTERN.test(latestBody),
        `${latestMigration} redefines seal_and_send_letter but does not write 'imageUrl' into ` +
          `point_config. P751 added this key; P749/P757/fix_p757 silently dropped it. New letter ` +
          `snapshots therefore have no imageUrl, so recipients see no story image.`,
      ).toBe(true);
    },
  );
});
