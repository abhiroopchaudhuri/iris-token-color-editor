import { ParsedLine } from '@/utils/cssParser';

export type ScalarDimension = 'shade' | 'hue' | 'saturation' | 'lightness' | 'alpha';
export type ScalarOp = 'eq' | 'lt' | 'lte' | 'gt' | 'gte' | 'between';

export interface SelectionRule {
  id: string;
  dimension: ScalarDimension;
  op: ScalarOp;
  value?: number;
  min?: number;
  max?: number;
}

export interface GlobalHslSelectionFilter {
  active: boolean;
  /** null = any color group */
  families: string[] | null;
  /** OR-list on the numeric step from the token name; empty = no constraint */
  shadeIn: number[];
  rules: SelectionRule[];
}

export const defaultGlobalHslSelectionFilter = (): GlobalHslSelectionFilter => ({
  active: false,
  families: null,
  shadeIn: [],
  rules: [],
});

export function parseTokenFamilyShade(tokenName: string): { family: string; shade: number | null } {
  const m = tokenName.match(/^--color-([\w]+)-(\d+)(?:-[\d]+a)?$/);
  if (m) return { family: m[1], shade: parseInt(m[2], 10) };
  const loose = tokenName.match(/^--color-([\w]+)-(\d+)/);
  if (loose) return { family: loose[1], shade: parseInt(loose[2], 10) };
  return { family: 'defaults', shade: null };
}

function getScalar(
  dimension: ScalarDimension,
  tokenName: string,
  isRgba: boolean,
  hsl: { h: number; s: number; l: number; a?: number },
): number | null {
  const { shade } = parseTokenFamilyShade(tokenName);
  switch (dimension) {
    case 'shade':
      return shade;
    case 'hue':
      return hsl.h;
    case 'saturation':
      return hsl.s;
    case 'lightness':
      return hsl.l;
    case 'alpha':
      return isRgba && typeof hsl.a === 'number' ? hsl.a : 1;
    default:
      return null;
  }
}

function compareScalar(x: number, op: ScalarOp, value?: number, min?: number, max?: number): boolean {
  switch (op) {
    case 'eq':
      return value !== undefined && x === value;
    case 'lt':
      return value !== undefined && x < value;
    case 'lte':
      return value !== undefined && x <= value;
    case 'gt':
      return value !== undefined && x > value;
    case 'gte':
      return value !== undefined && x >= value;
    case 'between':
      return min !== undefined && max !== undefined && x >= min && x <= max;
    default:
      return false;
  }
}

export function evalSelectionRule(
  rule: SelectionRule,
  tokenName: string,
  isRgba: boolean,
  hsl: { h: number; s: number; l: number; a?: number },
): boolean {
  const x = getScalar(rule.dimension, tokenName, isRgba, hsl);
  if (x === null) return false;
  return compareScalar(x, rule.op, rule.value, rule.min, rule.max);
}

export function tokenMatchesGlobalHslSelection(
  tokenName: string,
  isRgba: boolean,
  hsl: { h: number; s: number; l: number; a?: number },
  filter: GlobalHslSelectionFilter,
): boolean {
  if (!filter.active) return false;

  const { family, shade } = parseTokenFamilyShade(tokenName);

  if (filter.families !== null && filter.families.length > 0 && !filter.families.includes(family)) {
    return false;
  }

  if (filter.shadeIn.length > 0) {
    if (shade === null || !filter.shadeIn.includes(shade)) return false;
  }

  for (const rule of filter.rules) {
    if (!evalSelectionRule(rule, tokenName, isRgba, hsl)) return false;
  }

  return true;
}

export function globalHslSelectionHasConstraints(filter: GlobalHslSelectionFilter): boolean {
  return (
    (filter.families !== null && filter.families.length > 0) ||
    filter.shadeIn.length > 0 ||
    filter.rules.length > 0
  );
}

/** When active but nothing is constrained, global HSL still affects everyone (same as inactive). */
export function globalHslSelectionRestrictsGlobal(filter: GlobalHslSelectionFilter): boolean {
  return filter.active && globalHslSelectionHasConstraints(filter);
}

export function collectFamiliesAndShadesFromLines(lines: ParsedLine[]): { families: string[]; shades: number[] } {
  const familySet = new Set<string>();
  const shadeSet = new Set<number>();
  const hex = lines.filter(l => l.type === 'hex' && l.tokenName);
  const rgba = lines.filter(l => l.type === 'rgba' && l.tokenName);
  for (const t of [...hex, ...rgba] as ParsedLine[]) {
    const name = t.tokenName!;
    const { family, shade } = parseTokenFamilyShade(name);
    familySet.add(family);
    if (shade !== null) shadeSet.add(shade);
  }
  const families = [...familySet].filter(f => f !== 'defaults').sort((a, b) => a.localeCompare(b));
  const shades = [...shadeSet].sort((a, b) => a - b);
  return { families, shades };
}

export function newSelectionRuleId(): string {
  return `rule_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}
