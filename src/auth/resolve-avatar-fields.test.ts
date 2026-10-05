import { describe, it, expect } from 'vitest';
import { resolveAvatarFields } from './resolve-avatar-fields';

const GOOGLE = 'https://lh3.googleusercontent.com/a/pic';
const UPLOAD = 'https://x.supabase.co/storage/v1/object/public/avatars/u1/1.webp';

describe('P1418 resolveAvatarFields', () => {
  it('keeps an uploaded photo when the user signs in with Google', () => {
    const r = resolveAvatarFields({ avatarUrl: UPLOAD, avatarProvider: 'upload' }, GOOGLE, true);
    expect(r).toMatchObject({ avatarUrl: UPLOAD, avatarProvider: 'upload' });
  });

  it('still refreshes the Google picture when nothing was uploaded (P63)', () => {
    const r = resolveAvatarFields({ avatarUrl: 'old', avatarProvider: 'google' }, GOOGLE, true);
    expect(r).toMatchObject({ avatarUrl: GOOGLE, avatarProvider: 'google', avatarColor: undefined });
  });

  it('after Remove, a Google sign-in brings the Google picture back', () => {
    const r = resolveAvatarFields({ avatarProvider: 'generated', avatarColor: '#123' }, GOOGLE, true);
    expect(r.avatarUrl).toBe(GOOGLE);
  });

  it('keeps an uploaded photo for an email sign-in', () => {
    const r = resolveAvatarFields({ avatarUrl: UPLOAD, avatarProvider: 'upload' }, undefined, false);
    expect(r).toMatchObject({ avatarUrl: UPLOAD, avatarProvider: 'upload' });
  });

  it('gives a new email user generated initials', () => {
    expect(resolveAvatarFields({}, undefined, false).avatarProvider).toBe('generated');
  });
});
