/**
 * P1705 B: the dev-origin sets derive from the one allocator (scripts/lib/worktree-port.mjs).
 * The generated edge-function file must equal the CLI output byte for byte, every port is four
 * digits and never a port a dev server cannot bind, the two reserved shifts hold, and the slot
 * cap is enforced.
 */
import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { devOrigins, portForSlot, slotOrigins } from '../../scripts/lib/worktree-port.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const CLI = path.join(REPO_ROOT, 'scripts', 'lib', 'worktree-port.mjs');
const portOf = (o: string) => Number(new URL(o).port);

describe('P1705 generated dev-origins.ts', () => {
  it('equals the CLI output byte for byte (regenerate: node scripts/lib/worktree-port.mjs --dev-origins-ts > supabase/functions/_shared/dev-origins.ts)', () => {
    const generated = readFileSync(path.join(REPO_ROOT, 'supabase/functions/_shared/dev-origins.ts'), 'utf8');
    const cli = execFileSync(process.execPath, [CLI, '--dev-origins-ts'], { encoding: 'utf8' });
    expect(generated).toBe(cli);
  });

  it('holds exactly devOrigins()', () => {
    const generated = readFileSync(path.join(REPO_ROOT, 'supabase/functions/_shared/dev-origins.ts'), 'utf8');
    const listed = [...generated.matchAll(/'(http:\/\/localhost:\d+)'/g)].map((m) => m[1]);
    expect(listed).toEqual(devOrigins());
  });
});

describe('P1705 origin sets', () => {
  it('every port is four digits and none is 5000, 6000 or 7000', () => {
    for (const o of [...slotOrigins(), ...devOrigins()]) {
      const p = portOf(o);
      expect(p, o).toBeGreaterThanOrEqual(1024);
      expect(p, o).toBeLessThanOrEqual(9999);
      expect([5000, 6000, 7000], o).not.toContain(p);
    }
  });

  it('slotOrigins is main plus w1..w49 and a subset of devOrigins', () => {
    expect(slotOrigins()).toHaveLength(50);
    const dev = new Set(devOrigins());
    for (const o of slotOrigins()) expect(dev.has(o), o).toBe(true);
  });
});

describe('P1705 slot ports', () => {
  it('w20 -> 7050 and w10 -> 6050', () => {
    expect(portForSlot('w20')).toBe(7050);
    expect(portForSlot('w10')).toBe(6050);
  });

  it('w0, w50, legacy0 and legacy50 throw', () => {
    for (const s of ['w0', 'w50', 'legacy0', 'legacy50']) {
      expect(() => portForSlot(s), s).toThrow(/MAX_SLOT|1\.\.49/);
    }
  });

  it('2000 sample names never map to 5800 and stay in 5801..5899', () => {
    for (let i = 0; i < 2000; i++) {
      const p = portForSlot(`sample-worktree-${i}-${(i * 7919).toString(36)}`);
      expect(p, `name ${i}`).not.toBe(5800);
      expect(p, `name ${i}`).toBeGreaterThanOrEqual(5801);
      expect(p, `name ${i}`).toBeLessThanOrEqual(5899);
    }
  });
});

describe('P1705 CLI', () => {
  it('--max-slot prints 49', () => {
    expect(execFileSync(process.execPath, [CLI, '--max-slot'], { encoding: 'utf8' })).toBe('49\n');
  });
});
