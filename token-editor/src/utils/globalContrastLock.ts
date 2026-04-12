import type { HSL } from '@/utils/colorUtils';
import { getContrastRatioHex, hslToHex, solveHslLightnessForContrastRatio } from '@/utils/colorUtils';
import { globalSelectionTokenKey } from '@/utils/selectionFilter';

export type RgbaHsl = HSL & { a: number };

export function resolveRefBgHex(
  currentColors: Record<string, HSL>,
  refToken: string,
  currentRgbaColors?: Record<string, RgbaHsl>,
): string {
  const t = currentColors[refToken] ?? currentRgbaColors?.[refToken];
  if (!t) return '#ffffff';
  return hslToHex(t.h, t.s, t.l);
}

/** Snapshot WCAG contrast ratio vs ref for every token the global shift predicate includes. */
export function captureContrastLocksForGlobalShift(
  currentColors: Record<string, HSL>,
  currentRgbaColors: Record<string, RgbaHsl>,
  shouldShift: (name: string, isRgba: boolean) => boolean,
  refBgHex: string,
): Record<string, number> {
  const ratios: Record<string, number> = {};
  for (const [name, hsl] of Object.entries(currentColors)) {
    if (!shouldShift(name, false)) continue;
    const hex = hslToHex(hsl.h, hsl.s, hsl.l);
    ratios[globalSelectionTokenKey(name, false)] = getContrastRatioHex(hex, refBgHex);
  }
  for (const [name, hsl] of Object.entries(currentRgbaColors)) {
    if (!shouldShift(name, true)) continue;
    const hex = hslToHex(hsl.h, hsl.s, hsl.l);
    ratios[globalSelectionTokenKey(name, true)] = getContrastRatioHex(hex, refBgHex);
  }
  return ratios;
}

/** After a global color transform, restore each locked token's contrast vs ref by adjusting HSL L only. */
export function applyStoredContrastLocksToPalette(
  currentColors: Record<string, HSL>,
  currentRgbaColors: Record<string, RgbaHsl>,
  lockedRatios: Record<string, number>,
  refBgHex: string,
  shouldShift: (name: string, isRgba: boolean) => boolean,
): { currentColors: Record<string, HSL>; currentRgbaColors: Record<string, RgbaHsl> } {
  const nextColors = { ...currentColors };
  const nextRgba = { ...currentRgbaColors };

  for (const [name, hsl] of Object.entries(nextColors)) {
    if (!shouldShift(name, false)) continue;
    const key = globalSelectionTokenKey(name, false);
    const r = lockedRatios[key];
    if (typeof r !== 'number') continue;
    const { hsl: fixed } = solveHslLightnessForContrastRatio(hsl.h, hsl.s, refBgHex, r);
    nextColors[name] = fixed;
  }
  for (const [name, hsl] of Object.entries(nextRgba)) {
    if (!shouldShift(name, true)) continue;
    const key = globalSelectionTokenKey(name, true);
    const r = lockedRatios[key];
    if (typeof r !== 'number') continue;
    const { hsl: fixed } = solveHslLightnessForContrastRatio(hsl.h, hsl.s, refBgHex, r);
    nextRgba[name] = { ...fixed, a: hsl.a };
  }
  return { currentColors: nextColors, currentRgbaColors: nextRgba };
}
