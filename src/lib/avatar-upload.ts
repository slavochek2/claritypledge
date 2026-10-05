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

/** Best effort: removes the user's stored photos except `keepPath`. Errors only leave orphans. */
export async function removeOldAvatars(userId: string, keepPath?: string): Promise<void> {
  try {
    const { data } = await supabase.storage.from(BUCKET).list(userId);
    const stale = (data ?? []).map((o) => `${userId}/${o.name}`).filter((p) => p !== keepPath);
    if (stale.length) await supabase.storage.from(BUCKET).remove(stale);
  } catch {
    // Orphaned files are harmless; the profile row is already correct.
  }
}
