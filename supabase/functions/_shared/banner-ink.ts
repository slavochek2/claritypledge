/**
 * P1453: pixel measurements for artist banners — how dark an image is, and which ink the
 * "after <artist>" signature needs where it sits on screen.
 *
 * Pure: no Deno or esm.sh imports, so vitest (src/tests/p1453-banner-ink.test.ts) loads it
 * directly. Pixels come in as RGBA rows (ImageData's layout) from the shared jsquash decoder.
 *
 * One luminance definition everywhere: Rec.709 luma on gamma-encoded 0–255 values, the metric
 * the prototype was measured with and the one the UI Contract's 140 threshold is stated in.
 */

export interface Pixels {
  width: number;
  height: number;
  /** RGBA, 4 bytes per pixel, row-major. */
  data: ArrayLike<number>;
}

export interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** Below this mean luma (central band) a banner is regenerated once. Calibrated in P1453 /dev on
 *  36 real banners: near-black art reads 23 (Caravaggio); deliberately dark but legible art reads
 *  50–53 (Otto Dix, John Martin) and looked fine at banner size, so 60 retried good images. */
export const DARK_FLOOR = 45;
/** Above this mean luma under the signature, the ink is sepia; otherwise cream (UI Contract). */
export const SEPIA_ABOVE = 140;
/** Sample every Nth pixel in both axes. */
const STEP = 4;

export type Ink = 'cream' | 'sepia';

/** Rendered extent of the longest sig (19 chars) in Caveat 700, rotated -2°: 22px at md, 18px on
 *  phones. Checked against the real render (P1453 /dev). */
const SIG_TEXT_WIDE = { w: 130, h: 34 };
const SIG_TEXT_PHONE = { w: 108, h: 28 };

/**
 * Where the profile banner is shown, in CSS px: the card is `max-w-2xl` with `px-4`, so it is at
 * most 640px wide, 120px tall below `md` and 160px from `md`. 288 and 343 are the 320px and 375px
 * phones; 640x120 is the widest phone-height slot (a viewport just under `md`).
 */
export const DISPLAY_SLOTS: ReadonlyArray<{ w: number; h: number; text: { w: number; h: number } }> = [
  { w: 288, h: 120, text: SIG_TEXT_PHONE },
  { w: 343, h: 120, text: SIG_TEXT_PHONE },
  { w: 640, h: 120, text: SIG_TEXT_PHONE },
  { w: 640, h: 160, text: SIG_TEXT_WIDE },
];
/** Signature offsets from the banner's bottom-right corner (UI Contract). */
export const SIG_RIGHT = 14;
export const SIG_BOTTOM = 8;

/** Mean luma over `box` (source px, clamped), sampling every STEP-th pixel. NaN for an empty box. */
export function meanLuma(px: Pixels, box: Box): number {
  const x0 = Math.max(0, Math.floor(box.x0));
  const y0 = Math.max(0, Math.floor(box.y0));
  const x1 = Math.min(px.width, Math.ceil(box.x1));
  const y1 = Math.min(px.height, Math.ceil(box.y1));
  let sum = 0;
  let n = 0;
  for (let y = y0; y < y1; y += STEP) {
    for (let x = x0; x < x1; x += STEP) {
      const i = (y * px.width + x) * 4;
      sum += 0.2126 * (px.data[i] ?? 0) + 0.7152 * (px.data[i + 1] ?? 0) + 0.0722 * (px.data[i + 2] ?? 0);
      n++;
    }
  }
  return n === 0 ? NaN : sum / n;
}

/** Mean luma of the central horizontal band y ∈ [0.25, 0.75] — what survives the cover crop. */
export function centralLuma(px: Pixels): number {
  return meanLuma(px, { x0: 0, y0: px.height * 0.25, x1: px.width, y1: px.height * 0.75 });
}

export function isTooDark(luma: number): boolean {
  return luma < DARK_FLOOR;
}

/**
 * The source-pixel rectangle under the signature in one display slot, for an `object-fit: cover`
 * centered image of size iw x ih.
 */
export function slotSignatureBox(iw: number, ih: number, slot: { w: number; h: number; text: { w: number; h: number } }): Box {
  const s = Math.max(slot.w / iw, slot.h / ih);
  const offX = (iw * s - slot.w) / 2;
  const offY = (ih * s - slot.h) / 2;
  const dx0 = slot.w - SIG_RIGHT - slot.text.w;
  const dx1 = slot.w - SIG_RIGHT;
  const dy0 = slot.h - SIG_BOTTOM - slot.text.h;
  const dy1 = slot.h - SIG_BOTTOM;
  return {
    x0: (dx0 + offX) / s,
    x1: (dx1 + offX) / s,
    y0: (dy0 + offY) / s,
    y1: (dy1 + offY) / s,
  };
}

/** Bounding box (source px) of the signature across every display slot. */
export function signatureBox(iw: number, ih: number): Box {
  const boxes = DISPLAY_SLOTS.map((slot) => slotSignatureBox(iw, ih, slot));
  return {
    x0: Math.max(0, Math.min(...boxes.map((b) => b.x0))),
    y0: Math.max(0, Math.min(...boxes.map((b) => b.y0))),
    x1: Math.min(iw, Math.max(...boxes.map((b) => b.x1))),
    y1: Math.min(ih, Math.max(...boxes.map((b) => b.y1))),
  };
}

export function inkForLuma(luma: number): Ink {
  return luma > SEPIA_ABOVE ? 'sepia' : 'cream';
}

/** Ink for the signature on this image, measured on the corner as it is displayed. */
export function inkFor(px: Pixels): Ink {
  const l = meanLuma(px, signatureBox(px.width, px.height));
  return Number.isNaN(l) ? 'cream' : inkForLuma(l);
}
