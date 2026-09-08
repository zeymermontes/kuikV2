// The part of background removal the person controls: how hard the edge is.
// The cut itself is lib/media/segment.ts; this is pure, so the sheet can
// redraw on every slider move and the tests can check the curve.

/**
 * Remap the alpha channel in place by "sensitivity" (0..1). The model gives
 * soft edges: 0 keeps them exactly as they came, higher values push faint
 * pixels (shadows, a bit of table) to transparent and firm ones to opaque,
 * so at 1 the cut is a hard mask.
 */
export function applySensitivity(data: Uint8ClampedArray, sensitivity: number): void {
  const s = Math.min(1, Math.max(0, sensitivity));
  if (s === 0) return;
  // Cut everything under `low`, stretch what is left to full opacity.
  const low = Math.round(s * 200);
  const span = 255 - low;
  for (let i = 3; i < data.length; i += 4) {
    const a = data[i];
    data[i] = a <= low ? 0 : span > 0 ? Math.min(255, Math.round(((a - low) * 255) / span)) : 255;
  }
}
