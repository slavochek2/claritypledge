/**
 * @file image-upload.ts
 * @description P591: Client-side image processing for story supporting images.
 *
 * - HEIC detection by MIME type and extension
 * - Format validation (JPEG, PNG, WebP, HEIC/HEIF)
 * - Size validation (max 5MB)
 * - Resize to max 1200px on longest edge
 * - HEIC->JPEG conversion via lazy-loaded heic2any
 * - Output as processed Blob with metadata
 */

// ── Constants ────────────────────────────────────────────────────────────────

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const HEIC_TYPES = ['image/heic', 'image/heif'];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const MAX_DIMENSION = 1200;
const JPEG_QUALITY = 0.85;

// ── Types ────────────────────────────────────────────────────────────────────

export interface ImageProcessResult {
  blob: Blob;
  width: number;
  height: number;
  format: string;
  originalFormat: string;
}

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

// ── HEIC Detection ───────────────────────────────────────────────────────────

/**
 * Detects HEIC/HEIF files by MIME type or file extension.
 * iOS Safari sometimes sends HEIC files with empty MIME type,
 * so extension check is essential.
 */
export function isHeicFile(file: File): boolean {
  const mimeMatch = HEIC_TYPES.includes(file.type);
  const extMatch = /\.(heic|heif)$/i.test(file.name);
  return mimeMatch || extMatch;
}

// ── Format Validation ────────────────────────────────────────────────────────

/**
 * Validates image format. Accepts JPEG, PNG, WebP directly.
 * HEIC/HEIF accepted (will be converted downstream).
 * Rejects GIF, SVG, BMP, TIFF, PDF, HTML, and unknown types.
 */
export function validateImageFormat(file: File): ValidationResult {
  // HEIC is valid — will be converted to JPEG
  if (isHeicFile(file)) return { valid: true };

  if (ALLOWED_TYPES.includes(file.type)) return { valid: true };

  return {
    valid: false,
    error: 'Please use JPEG, PNG, or WebP format (max 5MB)',
  };
}

// ── Size Validation ──────────────────────────────────────────────────────────

/**
 * Validates file size. Max 5MB (5,242,880 bytes).
 * Rejects empty files (0 bytes).
 */
export function validateImageSize(file: File): ValidationResult {
  if (file.size > MAX_FILE_SIZE) {
    return {
      valid: false,
      error: 'Please use JPEG, PNG, or WebP format (max 5MB)',
    };
  }
  if (file.size === 0) {
    return { valid: false, error: 'File is empty' };
  }
  return { valid: true };
}

// ── Resize Dimensions Calculator ─────────────────────────────────────────────

/**
 * Calculates new dimensions to fit within maxDimension on the longest edge.
 * Preserves aspect ratio. Returns resized=false if already within bounds.
 */
export function calculateResizeDimensions(
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

// ── HEIC Conversion ──────────────────────────────────────────────────────────

/**
 * Converts a HEIC/HEIF blob to JPEG using heic2any (lazy-loaded).
 * Handles both single Blob and Blob[] returns from heic2any.
 */
async function convertHeicToJpeg(blob: Blob): Promise<Blob> {
  const heic2any = (await import('heic2any')).default;
  const result = await heic2any({
    blob,
    toType: 'image/jpeg',
    quality: JPEG_QUALITY,
  });
  // heic2any can return Blob or Blob[] depending on version
  return Array.isArray(result) ? result[0] : result;
}

// ── Image Resize ─────────────────────────────────────────────────────────────

/**
 * Resizes an image blob to fit within maxDimension on the longest edge.
 * Uses canvas for rendering, outputs as the specified MIME type.
 */
export async function resizeImage(
  blob: Blob,
  maxDimension: number = MAX_DIMENSION
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(blob);

    img.onload = () => {
      URL.revokeObjectURL(url);

      const dims = calculateResizeDimensions(
        img.naturalWidth,
        img.naturalHeight,
        maxDimension
      );

      if (!dims.resized) {
        resolve(blob);
        return;
      }

      const canvas = document.createElement('canvas');
      canvas.width = dims.width;
      canvas.height = dims.height;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Could not get canvas context'));
        return;
      }

      ctx.drawImage(img, 0, 0, dims.width, dims.height);

      canvas.toBlob(
        (resultBlob) => {
          if (!resultBlob) {
            reject(new Error('Canvas toBlob failed'));
            return;
          }
          resolve(resultBlob);
        },
        blob.type || 'image/jpeg',
        JPEG_QUALITY
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not process this image. Try a different file.'));
    };

    img.src = url;
  });
}

// ── Main Processing Pipeline ─────────────────────────────────────────────────

/**
 * Full image processing pipeline:
 * 1. Validate format
 * 2. Validate size (pre-conversion)
 * 3. Convert HEIC to JPEG if needed
 * 4. Resize to max 1200px
 * 5. Validate final size (post-conversion)
 * 6. Return processed blob + metadata
 */
export async function processImageForUpload(
  file: File
): Promise<ImageProcessResult> {
  // Step 1: Validate format
  const formatCheck = validateImageFormat(file);
  if (!formatCheck.valid) {
    throw new Error(formatCheck.error);
  }

  // Step 2: Validate original size
  const sizeCheck = validateImageSize(file);
  if (!sizeCheck.valid) {
    throw new Error(sizeCheck.error);
  }

  const originalFormat = file.type || 'image/heic';
  let blob: Blob = file;
  let format = file.type;

  // Step 3: Convert HEIC to JPEG
  if (isHeicFile(file)) {
    try {
      blob = await convertHeicToJpeg(file);
      format = 'image/jpeg';
    } catch {
      throw new Error('Could not process this image. Try a different file.');
    }
  }

  // Step 4: Resize
  blob = await resizeImage(blob, MAX_DIMENSION);

  // Step 5: Validate final size (post-conversion/resize)
  if (blob.size > MAX_FILE_SIZE) {
    throw new Error('Please use JPEG, PNG, or WebP format (max 5MB)');
  }

  // Step 6: Get final dimensions
  const { width, height } = await getImageDimensions(blob);

  return {
    blob,
    width,
    height,
    format: format || 'image/jpeg',
    originalFormat,
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Reads image dimensions from a blob using an Image element.
 */
function getImageDimensions(
  blob: Blob
): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(blob);

    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not read image dimensions'));
    };

    img.src = url;
  });
}
