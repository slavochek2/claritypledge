/**
 * P1417: encode an event banner's small copy — 800px wide WebP, never enlarged, EXIF-oriented.
 * The path it is stored at comes from `src/lib/banner-small.ts`, shared with the app.
 * Quality 75: measured on prod originals, a flat-art 2400px PNG drops from 358 KB to 8 KB (the
 * speakers' names on it stay legible) and a photographic 1376px PNG from 2.1 MB to 79 KB.
 */
import sharp from 'sharp';
import { BANNER_SMALL_WIDTH } from '../../src/lib/banner-small';

export const BANNER_SMALL_QUALITY = 75;

export async function encodeSmallBanner(input: Buffer): Promise<{ data: Buffer; width: number; height: number }> {
  const { data, info } = await sharp(input)
    .rotate()
    .resize({ width: BANNER_SMALL_WIDTH, withoutEnlargement: true })
    .webp({ quality: BANNER_SMALL_QUALITY, effort: 5 })
    .toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}
