import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { publicMediaUrl } from '../lib/public-media';
// @ts-expect-error plain .mjs helper, no types
import * as h from '../../scripts/lib/p1528-agent-avatars.mjs';

const SB = 'https://besjtuodziykmjidubzw.supabase.co';
const U = '0a1b2c3d-1111-2222-3333-444455556666';
const old = `${SB}/storage/v1/object/public/agent-avatars/donald-trump/${U}.png`;

describe('P1528 agent-avatar helpers', () => {
  it('maps an old URL to the media path and URL', () => {
    const p = h.parseOldUrl(SB, old);
    expect(p).toEqual({ slug: 'donald-trump', uuid: U });
    expect(h.newObjectPath('prod', p)).toBe(`agent-avatars/donald-trump/${U}.webp`);
    expect(h.newObjectPath('test', p)).toBe(`test/agent-avatars/donald-trump/${U}.webp`);
    expect(h.mediaUrl(h.newObjectPath('prod', p))).toBe(publicMediaUrl(`agent-avatars/donald-trump/${U}.webp`));
  });
  it('rejects anything that is not exactly an agent-avatars object on this env', () => {
    expect(h.parseOldUrl(SB, null)).toBeNull();
    expect(h.parseOldUrl(SB, old.replace('agent-avatars', 'avatars'))).toBeNull();
    expect(h.parseOldUrl(SB, old.replace('besjtuodziykmjidubzw', 'gfjctyxqlwexxwsmkakq'))).toBeNull();
    expect(h.parseOldUrl(SB, `${old}?x=1`)).toBeNull();
    expect(h.parseOldUrl(SB, old.replace('donald-trump/', '../x/'))).toBeNull();
    expect(h.parseOldUrl(SB, 'https://www.gravatar.com/avatar/abc')).toBeNull();
  });
  it('manifest must match the selected set exactly', () => {
    expect(h.checkManifest(['a', 'b'], ['b', 'a']).ok).toBe(true);
    expect(h.checkManifest(['a', 'b', 'c'], ['a', 'b'])).toMatchObject({ ok: false, unexpected: ['c'] });
    expect(h.checkManifest(['a'], ['a', 'b'])).toMatchObject({ ok: false, missing: ['b'] });
  });
  it('parses manifests and refuses bad lines or duplicates', () => {
    expect(h.parseManifest(`# c\n${U}\n\n`)).toEqual([U]);
    expect(() => h.parseManifest('nope')).toThrow();
    expect(() => h.parseManifest(`${U}\n${U}`)).toThrow();
  });
  it.skipIf(!existsSync('/opt/homebrew/bin/cwebp') || !existsSync('/opt/homebrew/bin/ffmpeg'))('accepts a real 256x256 WebP and rejects PNG bytes / wrong size', () => {
    const dir = mkdtempSync(join(tmpdir(), 'p1528t-'));
    const png = join(dir, 'a.png');
    execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'color=c=red:s=64x64', '-frames:v', '1', png]);
    const w256 = join(dir, '256.webp');
    const w10 = join(dir, '10.webp');
    execFileSync('/opt/homebrew/bin/cwebp', ['-quiet', '-resize', '256', '256', png, '-o', w256]);
    execFileSync('/opt/homebrew/bin/cwebp', ['-quiet', '-resize', '10', '10', png, '-o', w10]);
    expect(h.isWebpOfSize(readFileSync(w256))).toBe(true);
    expect(h.isWebpOfSize(readFileSync(w10))).toBe(false);
    expect(h.isWebpOfSize(readFileSync(png))).toBe(false);
  });
});
