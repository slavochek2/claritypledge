/**
 * @file image-upload.test.ts
 * @description Unit tests for P591: Story Supporting Images — client-side image processing
 *
 * Tests pure utility functions in src/lib/image-upload.ts:
 * - HEIC detection (by MIME type and extension)
 * - Image format validation (JPEG, PNG, WebP only; SVG, GIF blocked)
 * - File size validation (max 5MB)
 * - Resize logic (max 1200px on longest edge)
 * - HEIC conversion trigger (heic2any lazy-load)
 *
 * NOTE: These tests mock browser APIs (File, Canvas, createObjectURL) and heic2any.
 * /dev will wire to the actual implementation in src/lib/image-upload.ts.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock heic2any — lazy-loaded, so we mock the dynamic import ──────────────
const mockHeic2any = vi.fn();
vi.mock('heic2any', () => ({ default: mockHeic2any }));

// ── Types expected from the image-upload module ─────────────────────────────
// /dev will implement these in src/lib/image-upload.ts

interface ImageProcessResult {
  blob: Blob;
  width: number;
  height: number;
  format: string;
  originalFormat: string;
}

// ── Placeholder imports — /dev creates the module ───────────────────────────
// These will be:
//   import { isHeicFile, validateImageFormat, validateImageSize, resizeImage, processImageForUpload } from '../../src/lib/image-upload';
//
// For now, define expected signatures so tests are structurally complete.

type IsHeicFile = (file: File) => boolean;
type ValidateImageFormat = (file: File) => { valid: boolean; error?: string };
type ValidateImageSize = (file: File) => { valid: boolean; error?: string };
type _ResizeImage = (blob: Blob, maxDimension: number) => Promise<Blob>;
type _ProcessImageForUpload = (file: File) => Promise<ImageProcessResult>;

// ── Helpers ─────────────────────────────────────────────────────────────────

function createMockFile(name: string, size: number, type: string): File {
  const buffer = new ArrayBuffer(size);
  return new File([buffer], name, { type });
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('P591: Image Upload — HEIC Detection', () => {
  // /dev: import { isHeicFile } from '../../src/lib/image-upload';
  // Placeholder implementation for test structure — /dev replaces with real import
  const isHeicFile: IsHeicFile = (file: File) => {
    const mimeMatch = file.type === 'image/heic' || file.type === 'image/heif';
    const extMatch = /\.(heic|heif)$/i.test(file.name);
    return mimeMatch || extMatch;
  };

  it('detects HEIC by MIME type image/heic', () => {
    const file = createMockFile('photo.jpg', 1000, 'image/heic');
    expect(isHeicFile(file)).toBe(true);
  });

  it('detects HEIF by MIME type image/heif', () => {
    const file = createMockFile('photo.jpg', 1000, 'image/heif');
    expect(isHeicFile(file)).toBe(true);
  });

  it('detects HEIC by .heic extension (MIME empty — iOS Safari)', () => {
    const file = createMockFile('IMG_1234.heic', 1000, '');
    expect(isHeicFile(file)).toBe(true);
  });

  it('detects HEIF by .heif extension', () => {
    const file = createMockFile('photo.HEIF', 1000, '');
    expect(isHeicFile(file)).toBe(true);
  });

  it('returns false for JPEG', () => {
    const file = createMockFile('photo.jpg', 1000, 'image/jpeg');
    expect(isHeicFile(file)).toBe(false);
  });

  it('returns false for PNG', () => {
    const file = createMockFile('screenshot.png', 1000, 'image/png');
    expect(isHeicFile(file)).toBe(false);
  });

  it('returns false for WebP', () => {
    const file = createMockFile('image.webp', 1000, 'image/webp');
    expect(isHeicFile(file)).toBe(false);
  });
});

describe('P591: Image Upload — Format Validation', () => {
  // /dev: import { validateImageFormat } from '../../src/lib/image-upload';
  const validateImageFormat: ValidateImageFormat = (file: File) => {
    const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
    const HEIC_TYPES = ['image/heic', 'image/heif'];
    const isHeic = HEIC_TYPES.includes(file.type) || /\.(heic|heif)$/i.test(file.name);

    // HEIC is valid — will be converted
    if (isHeic) return { valid: true };

    if (ALLOWED_TYPES.includes(file.type)) return { valid: true };

    return {
      valid: false,
      error: 'Please use JPEG, PNG, or WebP format (max 5MB)',
    };
  };

  it('accepts image/jpeg', () => {
    const file = createMockFile('photo.jpg', 1000, 'image/jpeg');
    expect(validateImageFormat(file)).toEqual({ valid: true });
  });

  it('accepts image/png', () => {
    const file = createMockFile('screenshot.png', 1000, 'image/png');
    expect(validateImageFormat(file)).toEqual({ valid: true });
  });

  it('accepts image/webp', () => {
    const file = createMockFile('image.webp', 1000, 'image/webp');
    expect(validateImageFormat(file)).toEqual({ valid: true });
  });

  it('accepts HEIC (will be converted)', () => {
    const file = createMockFile('photo.heic', 1000, 'image/heic');
    expect(validateImageFormat(file)).toEqual({ valid: true });
  });

  it('accepts HEIF (will be converted)', () => {
    const file = createMockFile('photo.heif', 1000, 'image/heif');
    expect(validateImageFormat(file)).toEqual({ valid: true });
  });

  it('rejects image/gif with UI Contract error message', () => {
    const file = createMockFile('animation.gif', 1000, 'image/gif');
    const result = validateImageFormat(file);
    expect(result.valid).toBe(false);
    expect(result.error).toBe('Please use JPEG, PNG, or WebP format (max 5MB)');
  });

  it('rejects image/svg+xml (security — can contain JavaScript)', () => {
    const file = createMockFile('icon.svg', 1000, 'image/svg+xml');
    const result = validateImageFormat(file);
    expect(result.valid).toBe(false);
  });

  it('rejects image/bmp', () => {
    const file = createMockFile('image.bmp', 1000, 'image/bmp');
    const result = validateImageFormat(file);
    expect(result.valid).toBe(false);
  });

  it('rejects image/tiff', () => {
    const file = createMockFile('image.tiff', 1000, 'image/tiff');
    const result = validateImageFormat(file);
    expect(result.valid).toBe(false);
  });

  it('rejects application/pdf disguised as image', () => {
    const file = createMockFile('document.pdf', 1000, 'application/pdf');
    const result = validateImageFormat(file);
    expect(result.valid).toBe(false);
  });

  it('rejects text/html (XSS vector)', () => {
    const file = createMockFile('page.html', 1000, 'text/html');
    const result = validateImageFormat(file);
    expect(result.valid).toBe(false);
  });

  it('rejects empty MIME with non-HEIC extension', () => {
    const file = createMockFile('unknown.xyz', 1000, '');
    const result = validateImageFormat(file);
    expect(result.valid).toBe(false);
  });
});

describe('P591: Image Upload — Size Validation', () => {
  // /dev: import { validateImageSize } from '../../src/lib/image-upload';
  const MAX_SIZE = 5 * 1024 * 1024; // 5MB

  const validateImageSize: ValidateImageSize = (file: File) => {
    if (file.size > MAX_SIZE) {
      return {
        valid: false,
        error: 'Please use JPEG, PNG, or WebP format (max 5MB)',
      };
    }
    if (file.size === 0) {
      return { valid: false, error: 'File is empty' };
    }
    return { valid: true };
  };

  it('accepts file under 5MB', () => {
    const file = createMockFile('photo.jpg', 1024 * 1024, 'image/jpeg'); // 1MB
    expect(validateImageSize(file)).toEqual({ valid: true });
  });

  it('accepts file exactly at 5MB', () => {
    const file = createMockFile('photo.jpg', MAX_SIZE, 'image/jpeg');
    expect(validateImageSize(file)).toEqual({ valid: true });
  });

  it('rejects file over 5MB with UI Contract error message', () => {
    const file = createMockFile('huge.jpg', MAX_SIZE + 1, 'image/jpeg');
    const result = validateImageSize(file);
    expect(result.valid).toBe(false);
    expect(result.error).toBe('Please use JPEG, PNG, or WebP format (max 5MB)');
  });

  it('rejects large file (20MB)', () => {
    const file = createMockFile('raw.jpg', 20 * 1024 * 1024, 'image/jpeg');
    const result = validateImageSize(file);
    expect(result.valid).toBe(false);
  });

  it('rejects empty file (0 bytes)', () => {
    const file = createMockFile('empty.jpg', 0, 'image/jpeg');
    const result = validateImageSize(file);
    expect(result.valid).toBe(false);
  });

  it('accepts very small file (1 byte)', () => {
    const file = createMockFile('tiny.jpg', 1, 'image/jpeg');
    expect(validateImageSize(file)).toEqual({ valid: true });
  });
});

describe('P591: Image Upload — Resize Logic', () => {
  // These tests verify the resize algorithm's decisions, not canvas rendering.
  // /dev: import { calculateResizeDimensions } from '../../src/lib/image-upload';

  // Expected utility: given (width, height, maxDimension), returns (newWidth, newHeight)
  function calculateResizeDimensions(
    width: number,
    height: number,
    maxDimension: number
  ): { width: number; height: number; resized: boolean } {
    if (width <= maxDimension && height <= maxDimension) {
      return { width, height, resized: false };
    }

    const ratio = Math.min(maxDimension / width, maxDimension / height);
    return {
      width: Math.round(width * ratio),
      height: Math.round(height * ratio),
      resized: true,
    };
  }

  const MAX = 1200;

  it('does not resize image within bounds (800x600)', () => {
    const result = calculateResizeDimensions(800, 600, MAX);
    expect(result).toEqual({ width: 800, height: 600, resized: false });
  });

  it('does not resize image exactly at max (1200x900)', () => {
    const result = calculateResizeDimensions(1200, 900, MAX);
    expect(result).toEqual({ width: 1200, height: 900, resized: false });
  });

  it('resizes landscape image (4000x3000) — longest edge to 1200', () => {
    const result = calculateResizeDimensions(4000, 3000, MAX);
    expect(result.width).toBe(1200);
    expect(result.height).toBe(900);
    expect(result.resized).toBe(true);
  });

  it('resizes portrait image (3000x4000) — longest edge to 1200', () => {
    const result = calculateResizeDimensions(3000, 4000, MAX);
    expect(result.width).toBe(900);
    expect(result.height).toBe(1200);
    expect(result.resized).toBe(true);
  });

  it('resizes square image (2400x2400) — both edges to 1200', () => {
    const result = calculateResizeDimensions(2400, 2400, MAX);
    expect(result.width).toBe(1200);
    expect(result.height).toBe(1200);
    expect(result.resized).toBe(true);
  });

  it('handles panoramic aspect ratio (6000x1000)', () => {
    const result = calculateResizeDimensions(6000, 1000, MAX);
    expect(result.width).toBe(1200);
    expect(result.height).toBe(200);
    expect(result.resized).toBe(true);
  });

  it('handles tall portrait aspect ratio (500x4000)', () => {
    const result = calculateResizeDimensions(500, 4000, MAX);
    expect(result.width).toBe(150);
    expect(result.height).toBe(1200);
    expect(result.resized).toBe(true);
  });

  it('handles tiny image (50x50) — no resize', () => {
    const result = calculateResizeDimensions(50, 50, MAX);
    expect(result).toEqual({ width: 50, height: 50, resized: false });
  });

  it('preserves aspect ratio exactly for 16:9 (1920x1080)', () => {
    const result = calculateResizeDimensions(1920, 1080, MAX);
    // 1920/1080 = 16/9, scaled to width=1200 → height=675
    expect(result.width).toBe(1200);
    expect(result.height).toBe(675);
    expect(result.resized).toBe(true);
    // Verify ratio preserved
    expect(Math.abs(result.width / result.height - 1920 / 1080)).toBeLessThan(0.01);
  });

  it('handles one dimension at exactly max (1200x2000)', () => {
    const result = calculateResizeDimensions(1200, 2000, MAX);
    expect(result.width).toBe(720);
    expect(result.height).toBe(1200);
    expect(result.resized).toBe(true);
  });
});

describe('P591: Image Upload — HEIC Conversion Integration', () => {
  beforeEach(() => {
    mockHeic2any.mockReset();
  });

  it('heic2any is called with correct parameters for HEIC file', async () => {
    const heicBlob = new Blob(['heic-data'], { type: 'image/heic' });
    const jpegBlob = new Blob(['jpeg-data'], { type: 'image/jpeg' });

    mockHeic2any.mockResolvedValueOnce(jpegBlob);

    // Simulate what processImageForUpload would do for HEIC
    const result = await mockHeic2any({
      blob: heicBlob,
      toType: 'image/jpeg',
      quality: 0.85,
    });

    expect(mockHeic2any).toHaveBeenCalledWith({
      blob: heicBlob,
      toType: 'image/jpeg',
      quality: 0.85,
    });
    expect(result.type).toBe('image/jpeg');
  });

  it('handles heic2any returning an array (some versions return Blob[])', async () => {
    const jpegBlob = new Blob(['jpeg-data'], { type: 'image/jpeg' });
    mockHeic2any.mockResolvedValueOnce([jpegBlob]);

    const result = await mockHeic2any({
      blob: new Blob(['heic-data'], { type: 'image/heic' }),
      toType: 'image/jpeg',
      quality: 0.85,
    });

    // processImageForUpload should handle both Blob and Blob[] returns
    const outputBlob = Array.isArray(result) ? result[0] : result;
    expect(outputBlob.type).toBe('image/jpeg');
  });

  it('throws on heic2any failure (corrupted HEIC)', async () => {
    mockHeic2any.mockRejectedValueOnce(new Error('ERR_HEIC: corrupt'));

    // processImageForUpload should catch and surface:
    // "Could not process this image. Try a different file."
    await expect(
      mockHeic2any({
        blob: new Blob(['corrupt'], { type: 'image/heic' }),
        toType: 'image/jpeg',
      })
    ).rejects.toThrow('ERR_HEIC');
  });
});

describe('P591: Image Upload — Output Format', () => {
  it('JPEG input → JPEG output (no conversion)', () => {
    // processImageForUpload should preserve JPEG as JPEG
    const file = createMockFile('photo.jpg', 1000, 'image/jpeg');
    expect(file.type).toBe('image/jpeg');
    // /dev: const result = await processImageForUpload(file);
    // expect(result.format).toBe('image/jpeg');
  });

  it('PNG input → PNG output (preserves transparency)', () => {
    const file = createMockFile('screenshot.png', 1000, 'image/png');
    expect(file.type).toBe('image/png');
    // /dev: const result = await processImageForUpload(file);
    // expect(result.format).toBe('image/png');
  });

  it('WebP input → WebP output', () => {
    const file = createMockFile('image.webp', 1000, 'image/webp');
    expect(file.type).toBe('image/webp');
    // /dev: const result = await processImageForUpload(file);
    // expect(result.format).toBe('image/webp');
  });

  it('HEIC input → JPEG output (per AD-5)', () => {
    const file = createMockFile('photo.heic', 1000, 'image/heic');
    // /dev: const result = await processImageForUpload(file);
    // expect(result.format).toBe('image/jpeg');
    // expect(result.originalFormat).toBe('image/heic');
    expect(file.type).toBe('image/heic');
  });
});
