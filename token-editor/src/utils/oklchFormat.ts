import { hexToOklchTriplet } from '@/utils/oklchGamut';

/** Readable OKLCH for CSS (culori coordinates: L 0–1, C chroma, H degrees). */
export function formatOklchCssFromHex(hex: string): string | null {
  const t = hexToOklchTriplet(hex);
  if (!t) return null;
  const l = Math.round(t.l * 10000) / 10000;
  const c = Math.round(t.c * 10000) / 10000;
  const h = Math.round(t.h * 100) / 100;
  return `oklch(${l} ${c} ${h})`;
}
