import { describe, it, expect, vi, beforeEach } from 'vitest';

const remove = vi.fn();
const list = vi.fn();
vi.mock('@/lib/supabase', () => ({
  supabase: { storage: { from: () => ({ remove: (...a: unknown[]) => remove(...a), list: (...a: unknown[]) => list(...a) }) } },
}));

import { ownAvatarPath, removeAvatarAt } from './avatar-upload';

const base = 'https://x.supabase.co/storage/v1/object/public/avatars';

describe('P1418 ownAvatarPath', () => {
  it('returns the path of a photo in the user\'s own folder', () => {
    expect(ownAvatarPath('u1', `${base}/u1/17.webp`)).toBe('u1/17.webp');
  });
  it.each([
    ['a Google picture', 'https://lh3.googleusercontent.com/a/x'],
    ["another user's photo", `${base}/u2/17.webp`],
    ['a nested path', `${base}/u1/sub/17.webp`],
    ['another bucket', 'https://x.supabase.co/storage/v1/object/public/banners/u1/17.webp'],
    ['nothing', undefined],
  ])('returns null for %s', (_label, url) => {
    expect(ownAvatarPath('u1', url)).toBeNull();
  });
});

describe('P1418 removeAvatarAt (Codex P1: never sweep the folder)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('deletes exactly the replaced photo and never lists the folder', async () => {
    await removeAvatarAt('u1', `${base}/u1/old.webp`);
    expect(remove).toHaveBeenCalledWith(['u1/old.webp']);
    expect(list).not.toHaveBeenCalled();
  });

  it('two tabs replacing the same photo: neither deletes the other tab\'s new upload', async () => {
    // Tab A and tab B both started from old.webp; each deletes only old.webp.
    await removeAvatarAt('u1', `${base}/u1/old.webp`);
    await removeAvatarAt('u1', `${base}/u1/old.webp`);
    const deleted = remove.mock.calls.flatMap((c) => c[0] as string[]);
    expect(deleted.every((p) => p === 'u1/old.webp')).toBe(true);
  });

  it('does nothing for a Google picture', async () => {
    await removeAvatarAt('u1', 'https://lh3.googleusercontent.com/a/x');
    expect(remove).not.toHaveBeenCalled();
  });
});
