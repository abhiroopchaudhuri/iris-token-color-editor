/**
 * Neutrals that must not receive global saturation or OKLCH chroma adjustments
 * (white / black / gray scales stay achromatic while hue and lightness shifts still apply).
 */
export function isChromaSatExemptGlobalToken(tokenName: string): boolean {
  if (tokenName === '--color-white' || tokenName === '--color-black') return true;
  const n = tokenName.toLowerCase();
  return n.startsWith('--color-gray-') || n.startsWith('--color-grey-');
}

/** Wraps a global shift predicate so OKLCH chroma % only touches chromatic tokens. */
export function withChromaSatExemptFiltered(
  base: (name: string, isRgba: boolean) => boolean,
): (name: string, isRgba: boolean) => boolean {
  return (name, isRgba) => {
    if (isChromaSatExemptGlobalToken(name)) return false;
    return base(name, isRgba);
  };
}
