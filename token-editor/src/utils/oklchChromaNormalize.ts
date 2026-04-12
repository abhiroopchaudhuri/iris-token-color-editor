import { converter } from 'culori';
import type { HSL } from '@/utils/colorUtils';
import { hexToHsl, clampHSL } from '@/utils/colorUtils';
import { hexToOklchTriplet, hslToOklchTriplet, oklchTripletToHexDirect } from '@/utils/oklchGamut';

const CLIP_C_EPS = 0.002;
const toRgb = converter('rgb');

export interface RgbaHsl extends HSL {
  a: number;
}

function oklchInSrgbUnitCube(l: number, c: number, h: number): boolean {
  const ln = Math.max(0, Math.min(1, l));
  const hn = ((typeof h === 'number' && !Number.isNaN(h) ? h : 0) % 360 + 360) % 360;
  const rgb = toRgb({ mode: 'oklch', l: ln, c, h: hn }) as { r?: number; g?: number; b?: number };
  if (!rgb || typeof rgb.r !== 'number' || typeof rgb.g !== 'number' || typeof rgb.b !== 'number') {
    return false;
  }
  return rgb.r >= 0 && rgb.r <= 1 && rgb.g >= 0 && rgb.g <= 1 && rgb.b >= 0 && rgb.b <= 1;
}

/** Largest OKLCH chroma that maps into the sRGB unit cube at this L and hue (binary search). */
export function maxDisplayableChromaOklch(l: number, h: number): number {
  const ln = Math.max(0, Math.min(1, l));
  const hn = ((typeof h === 'number' && !Number.isNaN(h) ? h : 0) % 360 + 360) % 360;
  if (!oklchInSrgbUnitCube(ln, 0, hn)) return 0;
  let lo = 0;
  let hi = 0.45;
  for (let i = 0; i < 22; i++) {
    const mid = (lo + hi) * 0.5;
    if (oklchInSrgbUnitCube(ln, mid, hn)) lo = mid;
    else hi = mid;
  }
  return lo;
}

/**
 * Mean of (current chroma / max chroma) for affected tokens → 0–100 slider position.
 */
export function deriveMeanChromaPercent(
  currentColors: Record<string, HSL>,
  currentRgbaColors: Record<string, RgbaHsl>,
  isAffected: (name: string, isRgba: boolean) => boolean,
): number {
  let sum = 0;
  let n = 0;
  for (const [name, hsl] of Object.entries(currentColors)) {
    if (!isAffected(name, false)) continue;
    const tri = hslToOklchTriplet(hsl);
    if (!tri) continue;
    const cMax = maxDisplayableChromaOklch(tri.l, tri.h);
    if (cMax < 1e-6) continue;
    sum += Math.min(1, tri.c / cMax);
    n++;
  }
  for (const [name, hsl] of Object.entries(currentRgbaColors)) {
    if (!isAffected(name, true)) continue;
    const tri = hslToOklchTriplet(hsl);
    if (!tri) continue;
    const cMax = maxDisplayableChromaOklch(tri.l, tri.h);
    if (cMax < 1e-6) continue;
    sum += Math.min(1, tri.c / cMax);
    n++;
  }
  if (n === 0) return 100;
  return Math.round((sum / n) * 100);
}

/**
 * Set each affected color's chroma to (pct/100)×maxChroma(L,H) from its current L/H; 0 = grey.
 */
export function applyNormalizedChromaPercent(
  pct: number,
  currentColors: Record<string, HSL>,
  currentRgbaColors: Record<string, RgbaHsl>,
  isAffected: (name: string, isRgba: boolean) => boolean,
): {
  nextColors: Record<string, HSL>;
  nextRgba: Record<string, RgbaHsl>;
  clippedTokens: string[];
} {
  const nextColors = { ...currentColors };
  const nextRgba = { ...currentRgbaColors };
  const clippedTokens: string[] = [];

  for (const [name, hsl] of Object.entries(currentColors)) {
    if (!isAffected(name, false)) continue;
    const tri = hslToOklchTriplet(hsl);
    if (!tri) continue;
    const cMax = maxDisplayableChromaOklch(tri.l, tri.h);
    const cReq = (pct / 100) * cMax;
    const hex = oklchTripletToHexDirect(tri.l, cReq, tri.h);
    const hslNew = clampHSL(hexToHsl(hex));
    nextColors[name] = hslNew;
    const t2 = hexToOklchTriplet(hex);
    if (pct > 0.5 && t2 && t2.c + CLIP_C_EPS < cReq) {
      clippedTokens.push(name);
    }
  }

  for (const [name, hsl] of Object.entries(currentRgbaColors)) {
    if (!isAffected(name, true)) continue;
    const tri = hslToOklchTriplet(hsl);
    if (!tri) continue;
    const cMax = maxDisplayableChromaOklch(tri.l, tri.h);
    const cReq = (pct / 100) * cMax;
    const hex = oklchTripletToHexDirect(tri.l, cReq, tri.h);
    const hslNew = clampHSL(hexToHsl(hex));
    nextRgba[name] = { ...hslNew, a: hsl.a };
    const t2 = hexToOklchTriplet(hex);
    if (pct > 0.5 && t2 && t2.c + CLIP_C_EPS < cReq) {
      clippedTokens.push(name);
    }
  }

  return { nextColors, nextRgba, clippedTokens };
}

export function formatTokenShortName(tokenName: string): string {
  return tokenName.replace(/^--color-/, '');
}
