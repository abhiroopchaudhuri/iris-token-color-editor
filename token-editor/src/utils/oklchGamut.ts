import { converter, formatHex, parse, toGamut } from 'culori';
import type { HSL } from '@/utils/colorUtils';
import { hexToHsl } from '@/utils/colorUtils';

const toOklch = converter('oklch');
const mapToSrgb = toGamut('rgb');

export interface OklchTriplet {
  l: number;
  c: number;
  h: number;
}

/** OKLCH as used by culori: L 0–1, C chroma, H degrees. */
export function hexToOklchTriplet(hex: string): OklchTriplet | null {
  const p = parse(hex);
  if (!p) return null;
  const o = toOklch(p) as { l?: number; c?: number; h?: number };
  if (typeof o.l !== 'number' || typeof o.c !== 'number') return null;
  const h = typeof o.h === 'number' && !Number.isNaN(o.h) ? o.h : 0;
  return { l: o.l, c: o.c, h };
}

/**
 * Map (L, C, h) into sRGB gamut (CSS-style OKLCH gamut mapping), return #rrggbb.
 */
export function oklchTripletToHex(l: number, c: number, h: number): string {
  const mapped = mapToSrgb({ mode: 'oklch', l, c, h });
  const hex = formatHex(mapped);
  return hex || '#000000';
}

export function oklchTripletToHsl(l: number, c: number, h: number): HSL {
  return hexToHsl(oklchTripletToHex(l, c, h));
}
