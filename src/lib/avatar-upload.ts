/**
 * P1418: the user's own profile photo, stored in the `avatars` Supabase Storage bucket under
 * `<userId>/<timestamp>.webp`. Storage RLS limits every write to the caller's own folder.
 */
import { supabase } from '@/lib/supabase';

const BUCKET = 'avatars';
export const AVATAR_SIZE_PX = 512;

/** Centre-crop to a square and re-encode as WebP. Re-encoding also drops EXIF/GPS metadata. */
export async function toSquareWebp(file: File, size = AVATAR_SIZE_PX): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = Math.min(size, side);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas unavailable');
  ctx.drawImage(
    bitmap,
    (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side,
    0, 0, canvas.width, canvas.height,
  );
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', 0.85));
  if (!blob) throw new Error('encode failed');
  return blob;
}

/** Uploads the photo and returns its public URL. The path is new each time, so caches never serve the old one. */
export async function uploadAvatar(userId: string, image: Blob): Promise<{ url: string; path: string }> {
  const path = `${userId}/${Date.now()}.webp`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, image, {
    contentType: 'image/webp',
    upsert: false,
  });
  if (error) throw error;
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return { url: data.publicUrl, path };
}

/**
 * The storage path of a photo in our bucket under `userId`'s folder, or null for any other URL
 * (a Google picture, initials, someone else's folder).
 */
export function ownAvatarPath(userId: string, url: string | null | undefined): string | null {
  const marker = `/object/public/${BUCKET}/`;
  const at = url?.indexOf(marker) ?? -1;
  if (!url || at < 0) return null;
  const path = decodeURIComponent(url.slice(at + marker.length).split('?')[0] ?? '');
  return path.startsWith(`${userId}/`) && !path.slice(userId.length + 1).includes('/') ? path : null;
}

/**
 * Best effort: deletes the one photo being replaced or removed. Never lists and sweeps the
 * folder, so a concurrent upload from another tab can't have its new photo deleted (Codex P1).
 * Errors only leave a harmless orphan.
 */
export async function removeAvatarAt(userId: string, url: string | null | undefined): Promise<void> {
  const path = ownAvatarPath(userId, url);
  if (!path) return;
  try {
    await supabase.storage.from(BUCKET).remove([path]);
  } catch {
    // Orphaned file; the profile row is already correct.
  }
}
