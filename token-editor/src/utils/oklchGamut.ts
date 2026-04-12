import { converter, formatHex, parse, toGamut } from 'culori';
import type { HSL } from '@/utils/colorUtils';
import { hexToHsl, hslToHex, clampHSL } from '@/utils/colorUtils';

const toOklch = converter('oklch');
const toRgb = converter('rgb');
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

/**
 * OKLCH → sRGB hex **without** CSS gamut mapping (no L/C/H hue shifts).
 * Use when only chroma should move so perceptual lightness and WCAG luminance stay stable.
 * RGB channels are clamped to [0, 1]; caller should keep c within displayable range.
 */
export function oklchTripletToHexDirect(l: number, c: number, h: number): string {
  const ln = Math.max(0, Math.min(1, l));
  const hn = ((typeof h === 'number' && !Number.isNaN(h) ? h : 0) % 360 + 360) % 360;
  const cn = Math.max(0, c);
  const rgb = toRgb({ mode: 'oklch', l: ln, c: cn, h: hn }) as { r?: number; g?: number; b?: number };
  if (!rgb || typeof rgb.r !== 'number' || typeof rgb.g !== 'number' || typeof rgb.b !== 'number') {
    return '#000000';
  }
  const clamp = (x: number) => Math.max(0, Math.min(1, x));
  const hex = formatHex({ mode: 'rgb', r: clamp(rgb.r), g: clamp(rgb.g), b: clamp(rgb.b) });
  return hex || '#000000';
}

export function oklchTripletToHsl(l: number, c: number, h: number): HSL {
  return hexToHsl(oklchTripletToHex(l, c, h));
}

/** OKLCH coordinates for an HSL-defined sRGB color (via hex). */
export function hslToOklchTriplet(hsl: HSL): OklchTriplet | null {
  return hexToOklchTriplet(hslToHex(hsl.h, hsl.s, hsl.l));
}

/**
 * Additive OKLCH shift: L as percentage points on 0–100 scale (+4 → +0.04 in OKLCH L),
 * C and H in absolute OKLCH units. Result is gamut-mapped to sRGB then returned as HSL.
 */
export function applyOklchDeltaToHsl(hsl: HSL, dLPct: number, dC: number, dH: number): HSL {
  const tri = hslToOklchTriplet(hsl);
  if (!tri) return hsl;
  const l = Math.max(0, Math.min(1, tri.l + dLPct / 100));
  const c = Math.max(0, tri.c + dC);
  const h = ((tri.h + dH) % 360 + 360) % 360;
  const hex = oklchTripletToHexDirect(l, c, h);
  return clampHSL(hexToHsl(hex));
}
