// The stage is drawn in viewBox units and scales to its column, so nothing here is a pixel.
// One person is drawn in a 56 x 80 box; with fewer people each one is drawn a little larger.
export const W = 280;
export const BOX = { width: 56, height: 80 };

/**
 * Five or more people spread across the row; a small group stands close together, centred and larger.
 * A small group is drawn at 1.6 at most, and shrunk until the whole group, with its 1.1 pitch and a
 * ~1.08 pop overshoot (1.2 allowance per box), fits inside W, so no figure is ever clipped.
 */
export const layoutFor = (count: number): { size: number; xs: number[] } => {
  if (count <= 0) return { size: 1, xs: [] };
  if (count >= 5) return { size: Math.min(1.25, W / count / BOX.width), xs: Array.from({ length: count }, (_, i) => (W / count) * (i + 0.5)) };
  const size = Math.min(1.6, W / count / (BOX.width * 1.2));
  const pitch = BOX.width * size * 1.1;
  return { size, xs: Array.from({ length: count }, (_, i) => W / 2 + (i - (count - 1) / 2) * pitch) };
};
