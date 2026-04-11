import type { HSL } from '@/utils/colorUtils';
import { hslToHex } from '@/utils/colorUtils';
import { hexToOklchTriplet, oklchTripletToHsl } from '@/utils/oklchGamut';

export interface OklchHarmonizeOptions {
  families: string[];
  referenceFamily: string;
  shadeMode: 'multi' | 'range';
  shadeMulti: number[];
  shadeMin: number;
  shadeMax: number;
  standardizeReference: boolean;
  referenceChromaMode: 'average' | 'fixed';
  /** OKLCH chroma (culori scale) when mode is fixed */
  referenceChromaFixed?: number;
}

export type OklchHarmonizeResult =
  | { ok: true; updates: Record<string, HSL> }
  | { ok: false; message: string };

function tokenFor(family: string, shade: number): string {
  return `--color-${family}-${shade}`;
}

/** Neutrals: match reference OKLCH L only; keep each swatch’s own chroma and hue (avoids pink/saturated grays). */
const NEUTRAL_FAMILIES = new Set(['white', 'black', 'gray', 'grey']);

export function isNeutralColorFamily(family: string): boolean {
  return NEUTRAL_FAMILIES.has(family.toLowerCase());
}

function resolveShades(
  shadeMode: 'multi' | 'range',
  shadeMulti: number[],
  shadeMin: number,
  shadeMax: number,
  availableShades: number[],
): number[] {
  const avail = new Set(availableShades);
  if (shadeMode === 'multi') {
    return [...new Set(shadeMulti)]
      .filter((s) => avail.has(s))
      .sort((a, b) => a - b);
  }
  const lo = Math.min(shadeMin, shadeMax);
  const hi = Math.max(shadeMin, shadeMax);
  return availableShades.filter((s) => s >= lo && s <= hi);
}

/**
 * Computes HSL updates for hex tokens. Does not apply locks — caller skips locked names.
 */
export function computeOklchHarmonizePatches(
  currentColors: Record<string, HSL>,
  lockedTokens: Set<string>,
  availableShades: number[],
  opts: OklchHarmonizeOptions,
): OklchHarmonizeResult {
  const { families, referenceFamily } = opts;
  if (families.length === 0) {
    return { ok: false, message: 'Select at least one color group.' };
  }
  if (!families.includes(referenceFamily)) {
    return { ok: false, message: 'Reference group must be one of the selected groups.' };
  }

  const shades = resolveShades(
    opts.shadeMode,
    opts.shadeMulti,
    opts.shadeMin,
    opts.shadeMax,
    availableShades,
  );
  if (shades.length === 0) {
    return { ok: false, message: 'No shades match your selection for this file.' };
  }

  const nonReferenceFamilies = families.filter((f) => f !== referenceFamily);
  if (!opts.standardizeReference && nonReferenceFamilies.length === 0) {
    return {
      ok: false,
      message: 'Select at least one other group besides the reference, or enable “Standardize reference”.',
    };
  }

  const workingHex: Record<string, string> = {};
  for (const [name, hsl] of Object.entries(currentColors)) {
    workingHex[name] = hslToHex(hsl.h, hsl.s, hsl.l);
  }

  const updates: Record<string, HSL> = {};

  const readTriplet = (name: string) => {
    const hex = workingHex[name];
    if (!hex) return null;
    return hexToOklchTriplet(hex);
  };

  const writeTriplet = (name: string, t: { l: number; c: number; h: number }) => {
    if (lockedTokens.has(name)) return;
    const hsl = oklchTripletToHsl(t.l, t.c, t.h);
    workingHex[name] = hslToHex(hsl.h, hsl.s, hsl.l);
    updates[name] = hsl;
  };

  // --- Optional: standardize reference ramp (L steps, unified C) ---
  if (opts.standardizeReference) {
    const refTokens = shades
      .map((s) => tokenFor(referenceFamily, s))
      .filter((name) => currentColors[name] !== undefined);

    if (refTokens.length === 0) {
      return { ok: false, message: 'Reference group has no matching tokens for the selected shades.' };
    }

    const triplets: { name: string; t: NonNullable<ReturnType<typeof readTriplet>> }[] = [];
    for (const name of refTokens) {
      const t = readTriplet(name);
      if (t) triplets.push({ name, t });
    }
    if (triplets.length === 0) {
      return { ok: false, message: 'Could not read OKLCH for reference tokens.' };
    }

    // Sort by shade number (token order matches shades order for refTokens)
    triplets.sort((a, b) => {
      const sa = parseInt(a.name.match(/-(\d+)$/)?.[1] ?? '0', 10);
      const sb = parseInt(b.name.match(/-(\d+)$/)?.[1] ?? '0', 10);
      return sa - sb;
    });

    const L0 = triplets[0].t.l;
    const L1 = triplets[triplets.length - 1].t.l;
    const n = triplets.length;

    const refIsNeutral = isNeutralColorFamily(referenceFamily);

    if (refIsNeutral) {
      if (n === 1) {
        const { name, t } = triplets[0];
        writeTriplet(name, { l: t.l, c: t.c, h: t.h });
      } else {
        triplets.forEach((row, i) => {
          const L = L0 + ((L1 - L0) * i) / (n - 1);
          writeTriplet(row.name, { l: L, c: row.t.c, h: row.t.h });
        });
      }
    } else {
      let cUnified: number;
      if (opts.referenceChromaMode === 'fixed') {
        const v = opts.referenceChromaFixed;
        if (v === undefined || Number.isNaN(v) || v < 0) {
          return { ok: false, message: 'Enter a valid fixed chroma (≥ 0).' };
        }
        cUnified = v;
      } else {
        const sum = triplets.reduce((acc, x) => acc + x.t.c, 0);
        cUnified = sum / triplets.length;
      }
      if (n === 1) {
        const { name, t } = triplets[0];
        writeTriplet(name, { l: t.l, c: cUnified, h: t.h });
      } else {
        triplets.forEach((row, i) => {
          const L = L0 + ((L1 - L0) * i) / (n - 1);
          writeTriplet(row.name, { l: L, c: cUnified, h: row.t.h });
        });
      }
    }
  }

  // --- Harmonize non-reference families to reference L/C per shade ---
  for (const shade of shades) {
    const refName = tokenFor(referenceFamily, shade);
    if (currentColors[refName] === undefined) continue;

    const refT = readTriplet(refName);
    if (!refT) continue;

    for (const fam of families) {
      if (fam === referenceFamily) continue;
      const name = tokenFor(fam, shade);
      if (currentColors[name] === undefined) continue;

      const targetT = readTriplet(name);
      if (!targetT) continue;

      if (isNeutralColorFamily(fam)) {
        writeTriplet(name, { l: refT.l, c: targetT.c, h: targetT.h });
      } else {
        writeTriplet(name, { l: refT.l, c: refT.c, h: targetT.h });
      }
    }
  }

  if (Object.keys(updates).length === 0) {
    return { ok: false, message: 'Nothing to update (check groups, shades, and locks).' };
  }

  return { ok: true, updates };
}
