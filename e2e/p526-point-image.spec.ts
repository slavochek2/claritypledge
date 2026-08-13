/**
 * @file p526-point-image.spec.ts
 * @description E2E tests for P526: Point Supporting Images — user flows
 *
 * Covers:
 * - Add image to existing point (author)
 * - Change image on existing point (author)
 * - Remove image from existing point (author)
 * - View point with image (visitor — no author controls visible)
 * - Click image to open lightbox, close with Escape
 * - Upload failure shows toast, point saves without image
 * - Invalid file format shows error toast
 *
 * NOTE: Tests that require real GCS uploads are marked test.skip with TODOs.
 * /dev will decide on mocking strategy (route intercept vs mock service).
 */

import { test, expect } from '@playwright/test';
import {
  createTestUser,
  deleteTestUser,
  setTestSession,
  type TestUser,
} from './helpers/test-user';
import { createTestPoint, deleteTestPoint, type TestPoint } from './helpers/test-point';
import { supabaseAdmin } from './helpers/supabase-admin';

const MOCK_IMAGE_URL = 'https://storage.googleapis.com/claritypledge-uploads/points/test/p526-e2e.jpg';
const _MOCK_IMAGE_URL_2 = 'https://storage.googleapis.com/claritypledge-uploads/points/test/p526-e2e-v2.jpg';

interface Fixtures {
  author: TestUser;
  visitor: TestUser;
  pointWithImage: TestPoint;
  pointNoImage: TestPoint;
}

async function buildFixtures(): Promise<Fixtures> {
  const author = await createTestUser({ name: 'P526 E2E Author' });
  const visitor = await createTestUser({ name: 'P526 E2E Visitor' });

  const pointWithImage = await createTestPoint(author.user.id, {
    statement: `P526 E2E point with image ${Date.now()}`,
  });
  await supabaseAdmin
    .from('points')
    .update({ image_url: MOCK_IMAGE_URL })
    .eq('id', pointWithImage.id);

  const pointNoImage = await createTestPoint(author.user.id, {
    statement: `P526 E2E point no image ${Date.now()}`,
  });

  return { author, visitor, pointWithImage, pointNoImage };
}

async function cleanupFixtures(f: Fixtures) {
  if (f.pointNoImage?.id) await deleteTestPoint(f.pointNoImage.id);
  if (f.pointWithImage?.id) await deleteTestPoint(f.pointWithImage.id);
  if (f.author?.user?.id) await deleteTestUser(f.author.user.id);
  if (f.visitor?.user?.id) await deleteTestUser(f.visitor.user.id);
}

test.describe('P526: Point Image — Visitor View', () => {
  let fixtures: Fixtures;

  test.beforeAll(async () => {
    fixtures = await buildFixtures();
  });

  test.afterAll(async () => {
    await cleanupFixtures(fixtures);
  });

  test('point with image displays the image element on detail page', async ({ page }) => {
    await page.goto(`/point/${fixtures.pointWithImage.id}`);
    await page.waitForLoadState('networkidle');

    const img = page.locator(`img[src="${MOCK_IMAGE_URL}"]`);
    await expect(img).toBeVisible({ timeout: 10000 });
  });

  test('point without image has no image element', async ({ page }) => {
    await page.goto(`/point/${fixtures.pointNoImage.id}`);
    await page.waitForLoadState('networkidle');

    // No broken image tags
    const img = page.locator('img[src*="claritypledge-uploads/points"]');
    await expect(img).not.toBeAttached();
  });

  test('visitor does not see author controls (Add/Change/Remove)', async ({ page }) => {
    await setTestSession(page, fixtures.visitor.email);

    await page.goto(`/point/${fixtures.pointWithImage.id}`);
    await page.waitForLoadState('networkidle');

    // No "Add image", "Change", or "Remove" buttons visible
    const addBtn = page.getByRole('button', { name: /add.*image/i });
    const changeBtn = page.getByRole('button', { name: /change/i });
    const removeBtn = page.getByRole('button', { name: /remove/i });

    await expect(addBtn).not.toBeAttached();
    await expect(changeBtn).not.toBeAttached();
    await expect(removeBtn).not.toBeAttached();
  });

  test('non-author does not see "Add image" on point without image', async ({ page }) => {
    await setTestSession(page, fixtures.visitor.email);

    await page.goto(`/point/${fixtures.pointNoImage.id}`);
    await page.waitForLoadState('networkidle');

    const addBtn = page.getByRole('button', { name: /add.*image/i });
    await expect(addBtn).not.toBeAttached();
  });
});

test.describe('P526: Point Image — Lightbox', () => {
  let fixtures: Fixtures;

  test.beforeAll(async () => {
    fixtures = await buildFixtures();
  });

  test.afterAll(async () => {
    await cleanupFixtures(fixtures);
  });

  test('clicking image opens lightbox dialog', async ({ page }) => {
    await page.goto(`/point/${fixtures.pointWithImage.id}`);
    await page.waitForLoadState('networkidle');

    const img = page.locator(`img[src="${MOCK_IMAGE_URL}"]`);
    await expect(img).toBeVisible({ timeout: 10000 });

    // Click the image to open lightbox
    await img.click();

    // Dialog should appear
    const dialog = page.getByRole('dialog', { name: /image viewer/i });
    await expect(dialog).toBeVisible({ timeout: 5000 });
  });

  test('Escape key closes lightbox', async ({ page }) => {
    await page.goto(`/point/${fixtures.pointWithImage.id}`);
    await page.waitForLoadState('networkidle');

    const img = page.locator(`img[src="${MOCK_IMAGE_URL}"]`);
    await expect(img).toBeVisible({ timeout: 10000 });

    await img.click();

    const dialog = page.getByRole('dialog', { name: /image viewer/i });
    await expect(dialog).toBeVisible({ timeout: 5000 });

    // Press Escape to close
    await page.keyboard.press('Escape');

    await expect(dialog).not.toBeAttached({ timeout: 3000 });
  });

  test('clicking backdrop closes lightbox', async ({ page }) => {
    await page.goto(`/point/${fixtures.pointWithImage.id}`);
    await page.waitForLoadState('networkidle');

    const img = page.locator(`img[src="${MOCK_IMAGE_URL}"]`);
    await expect(img).toBeVisible({ timeout: 10000 });

    await img.click();

    const dialog = page.getByRole('dialog', { name: /image viewer/i });
    await expect(dialog).toBeVisible({ timeout: 5000 });

    // Click the backdrop (dialog overlay)
    const overlay = page.locator('[data-radix-dialog-overlay], [class*="DialogOverlay"]').first();
    if (await overlay.isVisible()) {
      await overlay.click({ position: { x: 5, y: 5 } });
    } else {
      // Fallback: click outside the image in the dialog
      await page.mouse.click(10, 10);
    }

    await expect(dialog).not.toBeAttached({ timeout: 3000 });
  });

  test('close button closes lightbox', async ({ page }) => {
    await page.goto(`/point/${fixtures.pointWithImage.id}`);
    await page.waitForLoadState('networkidle');

    const img = page.locator(`img[src="${MOCK_IMAGE_URL}"]`);
    await expect(img).toBeVisible({ timeout: 10000 });

    await img.click();

    const dialog = page.getByRole('dialog', { name: /image viewer/i });
    await expect(dialog).toBeVisible({ timeout: 5000 });

    // Close button in dialog
    const closeBtn = dialog.getByRole('button', { name: /close/i });
    await closeBtn.click();

    await expect(dialog).not.toBeAttached({ timeout: 3000 });
  });
});

test.describe('P526: Point Image — Author Controls', () => {
  let fixtures: Fixtures;

  test.beforeAll(async () => {
    fixtures = await buildFixtures();
  });

  test.afterAll(async () => {
    await cleanupFixtures(fixtures);
  });

  test('author sees "Add image" button on point without image', async ({ page }) => {
    await setTestSession(page, fixtures.author.email);

    await page.goto(`/point/${fixtures.pointNoImage.id}`);
    await page.waitForLoadState('networkidle');

    const addBtn = page.getByRole('button', { name: /add.*image/i });
    await expect(addBtn).toBeVisible({ timeout: 10000 });
  });

  test('author sees "Change" and "Remove" controls on point with image', async ({ page }) => {
    await setTestSession(page, fixtures.author.email);

    await page.goto(`/point/${fixtures.pointWithImage.id}`);
    await page.waitForLoadState('networkidle');

    // Image should be visible
    const img = page.locator(`img[src="${MOCK_IMAGE_URL}"]`);
    await expect(img).toBeVisible({ timeout: 10000 });

    // Hover over image to reveal controls (desktop) or they should be visible (mobile)
    await img.hover();

    // Change and Remove controls
    const changeBtn = page.getByRole('button', { name: /change/i });
    const removeBtn = page.getByRole('button', { name: /remove/i });

    await expect(changeBtn).toBeVisible({ timeout: 5000 });
    await expect(removeBtn).toBeVisible({ timeout: 5000 });
  });

  test('author can remove image from point', async ({ page }) => {
    await setTestSession(page, fixtures.author.email);

    // Ensure point has image
    await supabaseAdmin
      .from('points')
      .update({ image_url: MOCK_IMAGE_URL })
      .eq('id', fixtures.pointWithImage.id);

    await page.goto(`/point/${fixtures.pointWithImage.id}`);
    await page.waitForLoadState('networkidle');

    const img = page.locator(`img[src="${MOCK_IMAGE_URL}"]`);
    await expect(img).toBeVisible({ timeout: 10000 });

    // Hover to reveal controls
    await img.hover();

    const removeBtn = page.getByRole('button', { name: /remove/i });
    await expect(removeBtn).toBeVisible({ timeout: 5000 });
    await removeBtn.click();

    // Image should disappear
    await expect(img).not.toBeAttached({ timeout: 10000 });

    // "Add image" button should appear
    const addBtn = page.getByRole('button', { name: /add.*image/i });
    await expect(addBtn).toBeVisible({ timeout: 5000 });

    // Restore image for subsequent tests
    await supabaseAdmin
      .from('points')
      .update({ image_url: MOCK_IMAGE_URL })
      .eq('id', fixtures.pointWithImage.id);
  });

  // TODO: These tests require real GCS upload mocking. /dev will decide strategy.
  test.skip('author can add image to existing point via file picker', async ({ page }) => {
    await setTestSession(page, fixtures.author.email);
    await page.goto(`/point/${fixtures.pointNoImage.id}`);
    await page.waitForLoadState('networkidle');

    // Mock GCS signed URL endpoint
    await page.route('**/gcs-signed-url**', route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ signedUrl: 'https://storage.googleapis.com/mock-signed-url' }),
    }));

    // Mock GCS PUT
    await page.route('https://storage.googleapis.com/mock-signed-url', route => route.fulfill({
      status: 200,
    }));

    const addBtn = page.getByRole('button', { name: /add.*image/i });
    await expect(addBtn).toBeVisible({ timeout: 10000 });

    // Trigger file picker and upload
    const _fileChooserPromise = page.waitForEvent('filechooser');
    await addBtn.click();
    const _fileChooser = await fileChooserPromise;
    // Would need a test image file — /dev will set up test fixtures
  });

  test.skip('author can change image on existing point', async ({ page: _page }) => {
    // Similar to add flow but starts from a point that already has an image
    // /dev will implement with proper GCS mocking
  });
});

test.describe('P526: Point Image — Error Handling', () => {
  let fixtures: Fixtures;

  test.beforeAll(async () => {
    fixtures = await buildFixtures();
  });

  test.afterAll(async () => {
    await cleanupFixtures(fixtures);
  });

  test('invalid file format shows error toast', async ({ page }) => {
    await setTestSession(page, fixtures.author.email);

    await page.goto(`/point/${fixtures.pointNoImage.id}`);
    await page.waitForLoadState('networkidle');

    const addBtn = page.getByRole('button', { name: /add.*image/i });
    await expect(addBtn).toBeVisible({ timeout: 10000 });

    // Trigger file picker with invalid file
    const _fileChooserPromise = page.waitForEvent('filechooser');
    await addBtn.click();
    const _fileChooser = await fileChooserPromise;

    // Create a GIF file (not accepted)
    await fileChooser.setFiles({
      name: 'animation.gif',
      mimeType: 'image/gif',
      buffer: Buffer.from('GIF89a'),
    });

    // Error toast should appear
    const toast = page.locator('[data-sonner-toast]').filter({ hasText: /jpeg|png|webp/i });
    await expect(toast).toBeVisible({ timeout: 5000 });
  });

  test('HEIC file shows specific error toast', async ({ page }) => {
    await setTestSession(page, fixtures.author.email);

    await page.goto(`/point/${fixtures.pointNoImage.id}`);
    await page.waitForLoadState('networkidle');

    const addBtn = page.getByRole('button', { name: /add.*image/i });
    await expect(addBtn).toBeVisible({ timeout: 10000 });

    const _fileChooserPromise = page.waitForEvent('filechooser');
    await addBtn.click();
    const _fileChooser = await fileChooserPromise;

    await fileChooser.setFiles({
      name: 'photo.heic',
      mimeType: 'image/heic',
      buffer: Buffer.from('heic-data'),
    });

    // HEIC-specific error message per spec
    const toast = page.locator('[data-sonner-toast]').filter({ hasText: /heic/i });
    await expect(toast).toBeVisible({ timeout: 5000 });
  });

  // TODO: Upload failure test requires GCS mocking. /dev will implement.
  test.skip('upload failure shows toast and point saves without image', async ({ page }) => {
    await setTestSession(page, fixtures.author.email);

    // Mock GCS signed URL to fail
    await page.route('**/gcs-signed-url**', route => route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'Internal error' }),
    }));

    // Attempt to add image — should show error toast
    // Point should save without image
  });
});
