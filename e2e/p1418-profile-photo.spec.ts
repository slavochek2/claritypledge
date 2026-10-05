/**
 * P1418: an email/password user uploads a photo in Settings; it shows in Settings, the header
 * and survives a reload. Remove brings back initials. Screenshots at 375, 320 and desktop.
 */
import { test, expect, type Page } from '@playwright/test';
import { deflateSync } from 'zlib';
import { createTestUser, setTestSession, deleteTestUser, type TestUser } from './helpers/test-user';
import { supabaseAdmin } from './helpers/supabase-admin';

/** A real, decodable 64x48 PNG (landscape, so the square crop is exercised). */
function makePng(w = 64, h = 48): Buffer {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (b: Buffer) => {
    let c = 0xffffffff;
    for (const x of b) c = crcTable[(c ^ x) & 0xff]! ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const c = Buffer.alloc(4);
    c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const rows = [];
  for (let y = 0; y < h; y++) {
    const row = Buffer.alloc(1 + w * 3);
    for (let x = 0; x < w; x++) row.set([x * 4, 120, 255 - y * 5], 1 + x * 3);
    rows.push(row);
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(Buffer.concat(rows))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

async function shoot(page: Page, name: string, width: number) {
  await page.setViewportSize({ width, height: 800 });
  expect(await page.evaluate(() => window.innerWidth)).toBe(width);
  await page.screenshot({ path: `test-results/p1418/${name}-${width}.png` });
}

test.describe('P1418 profile photo', () => {
  test.describe.configure({ timeout: 120_000 });
  let user: TestUser;

  test.beforeAll(async () => {
    user = await createTestUser({ name: 'Photo Tester' });
  });

  test.afterAll(async () => {
    const { data } = await supabaseAdmin.storage.from('avatars').list(user.user.id);
    if (data?.length) await supabaseAdmin.storage.from('avatars').remove(data.map((o) => `${user.user.id}/${o.name}`));
    await deleteTestUser(user.user.id);
  });

  test('smoke: upload, see it everywhere, remove', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await setTestSession(page, user.email);
    await page.goto('/settings');

    await expect(page.getByText('Photo', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Remove' })).toHaveCount(0);
    for (const w of [1280, 375, 320]) await shoot(page, 'before', w);
    await page.setViewportSize({ width: 1280, height: 800 });

    await page.getByTestId('photo-input').setInputFiles({ name: 'me.png', mimeType: 'image/png', buffer: makePng() });
    await expect(page.getByRole('button', { name: 'Change' })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole('button', { name: 'Remove' })).toBeVisible();

    // Header avatar shows the uploaded photo without a reload.
    const photos = page.locator('img[src*="/avatars/"]');
    await expect(photos.first()).toBeVisible();
    expect(await photos.count()).toBeGreaterThanOrEqual(2);
    // The photo actually decodes (not just an <img> tag pointing at it).
    await expect
      .poll(() => photos.evaluateAll((els) => els.filter((e) => (e as HTMLImageElement).naturalWidth > 0).length))
      .toBeGreaterThanOrEqual(2);
    for (const w of [1280, 375, 320]) await shoot(page, 'after', w);
    await page.setViewportSize({ width: 1280, height: 800 });

    // Stored as a square WebP under the user's own folder.
    const { data: profile } = await supabaseAdmin
      .from('profiles').select('avatar_url, avatar_provider').eq('id', user.user.id).single();
    expect(profile?.avatar_provider).toBe('upload');
    expect(profile?.avatar_url).toContain(`/avatars/${user.user.id}/`);
    expect(profile?.avatar_url).toMatch(/\.webp$/);

    // Survives reload and shows on the public profile page.
    await page.reload();
    await expect(page.locator('img[src*="/avatars/"]').filter({ visible: true }).first()).toBeVisible();
    await page.goto(`/p/${user.slug}`);
    await expect(page.locator('img[src*="/avatars/"]').filter({ visible: true }).first()).toBeVisible({ timeout: 15_000 });
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: 'test-results/p1418/profile-page-1280.png' });

    // Remove → initials, file gone.
    await page.goto('/settings');
    await page.getByRole('button', { name: 'Remove' }).click();
    await expect(page.getByRole('button', { name: 'Upload photo' })).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('img[src*="/avatars/"]')).toHaveCount(0);
    const { data: left } = await supabaseAdmin.storage.from('avatars').list(user.user.id);
    expect(left ?? []).toHaveLength(0);

    expect(errors).toEqual([]);
  });

  test('a non-image shows the type message', async ({ page }) => {
    await setTestSession(page, user.email);
    await page.goto('/settings');
    await page.getByTestId('photo-input').setInputFiles({ name: 'a.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF') });
    await expect(page.getByRole('alert')).toHaveText('Use a JPG, PNG or WebP image.');
  });
});
