/**
 * P1705 B: the GCS CORS lists keep exact localhost origins (GCS takes no wildcard), and their
 * localhost subset must equal slotOrigins() from the allocator. Neither script is run here.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { slotOrigins } from '../../scripts/lib/worktree-port.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const localhost = (list: string[]) => list.filter((o) => o.startsWith('http://localhost:'));
const sorted = (xs: string[]) => [...xs].sort();

describe('P1705 GCS localhost origins equal slotOrigins()', () => {
  it('scripts/gcs-cors.json', () => {
    const json = JSON.parse(readFileSync(path.join(REPO_ROOT, 'scripts/gcs-cors.json'), 'utf8'));
    const origins: string[] = json.flatMap((r: { origin: string[] }) => r.origin);
    const local = localhost(origins);
    expect(new Set(local).size).toBe(local.length);
    expect(sorted(local)).toEqual(sorted(slotOrigins()));
  });

  it('ORIGINS in scripts/gcs-chat-voice-bucket.sh', () => {
    const src = readFileSync(path.join(REPO_ROOT, 'scripts/gcs-chat-voice-bucket.sh'), 'utf8');
    const block = src.match(/^ORIGINS=\(([\s\S]*?)^\)/m);
    expect(block, 'ORIGINS=( ... ) block not found').not.toBeNull();
    const origins = [...block![1].matchAll(/"(http[^"]+)"/g)].map((m) => m[1]);
    const local = localhost(origins);
    expect(new Set(local).size).toBe(local.length);
    expect(sorted(local)).toEqual(sorted(slotOrigins()));
    expect(origins).toContain('https://claritypledge.com');
  });
});
