import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const DIR = resolve(__dirname, '../../../supabase/migrations');

/** The path of the newest migration (by 14-digit timestamp name) whose text contains `needle`. */
export function newestMigrationDefining(needle: string): string {
  const hit = readdirSync(DIR)
    .filter((f) => /^\d{14}_.*\.sql$/.test(f))
    .sort()
    .reverse()
    .find((f) => readFileSync(resolve(DIR, f), 'utf8').includes(needle));
  if (!hit) throw new Error(`no migration contains ${needle}`);
  return resolve(DIR, hit);
}
