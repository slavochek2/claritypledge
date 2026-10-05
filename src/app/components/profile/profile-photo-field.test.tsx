import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const updateProfile = vi.fn();
const toSquareWebp = vi.fn();
const uploadAvatar = vi.fn();
const removeOldAvatars = vi.fn();
vi.mock('@/app/data/api', () => ({ updateProfile: (...a: unknown[]) => updateProfile(...a) }));
vi.mock('@/lib/avatar-upload', () => ({
  toSquareWebp: (...a: unknown[]) => toSquareWebp(...a),
  uploadAvatar: (...a: unknown[]) => uploadAvatar(...a),
  removeOldAvatars: (...a: unknown[]) => removeOldAvatars(...a),
}));

import { ProfilePhotoField } from './profile-photo-field';
import { PHOTO_COPY } from './profile-photo-copy';

const png = new File(['x'], 'me.png', { type: 'image/png' });

function setup(provider?: string) {
  const onChanged = vi.fn();
  render(<ProfilePhotoField userId="u1" name="Ann Lee" avatarProvider={provider} isPledger={false} onChanged={onChanged} />);
  return { onChanged, input: screen.getByTestId('photo-input') };
}

describe('P1418 ProfilePhotoField', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    toSquareWebp.mockResolvedValue(new Blob(['w'], { type: 'image/webp' }));
    uploadAvatar.mockResolvedValue({ url: 'https://cdn/u1/1.webp', path: 'u1/1.webp' });
    updateProfile.mockResolvedValue({ error: null });
  });

  it('shows Upload photo and no Remove when no photo was uploaded', () => {
    setup('google');
    expect(screen.getByRole('button', { name: PHOTO_COPY.upload })).toBeTruthy();
    expect(screen.queryByRole('button', { name: PHOTO_COPY.remove })).toBeNull();
  });

  it('uploads, saves provider=upload, cleans old files, refreshes the profile', async () => {
    const { onChanged, input } = setup('google');
    fireEvent.change(input, { target: { files: [png] } });
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    expect(updateProfile).toHaveBeenCalledWith('u1', { avatar_url: 'https://cdn/u1/1.webp', avatar_provider: 'upload' });
    expect(removeOldAvatars).toHaveBeenCalledWith('u1', 'u1/1.webp');
    // profile written before old files are removed
    expect(updateProfile.mock.invocationCallOrder[0]!).toBeLessThan(removeOldAvatars.mock.invocationCallOrder[0]!);
  });

  it('rejects a non-image with the type message and uploads nothing', async () => {
    const { input } = setup();
    fireEvent.change(input, { target: { files: [new File(['x'], 'a.pdf', { type: 'application/pdf' })] } });
    expect(await screen.findByRole('alert')).toHaveTextContent(PHOTO_COPY.badType);
    expect(uploadAvatar).not.toHaveBeenCalled();
  });

  it('shows the failure message when the upload fails and saves nothing', async () => {
    uploadAvatar.mockRejectedValue(new Error('net'));
    const { input, onChanged } = setup();
    fireEvent.change(input, { target: { files: [png] } });
    expect(await screen.findByRole('alert')).toHaveTextContent(PHOTO_COPY.failed);
    expect(updateProfile).not.toHaveBeenCalled();
    expect(onChanged).not.toHaveBeenCalled();
  });

  it('Remove clears the photo, then deletes the files', async () => {
    const { onChanged } = setup('upload');
    expect(screen.getByRole('button', { name: PHOTO_COPY.change })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: PHOTO_COPY.remove }));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    expect(updateProfile).toHaveBeenCalledWith('u1', { avatar_url: null, avatar_provider: 'generated' });
    expect(removeOldAvatars).toHaveBeenCalledWith('u1');
  });
});
