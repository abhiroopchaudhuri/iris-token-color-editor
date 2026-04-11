import { ParsedLine } from './cssParser';
import { HSL, hslToHex, hslToRgb } from './colorUtils';
import { formatOklchCssFromHex } from './oklchFormat';

export function serializeCss(
  originalLines: ParsedLine[],
  currentColors: Record<string, HSL>,
  currentRgbaColors: Record<string, HSL & { a: number }>
): string {
  const outputLines: string[] = [];

  for (const line of originalLines) {
    if (line.type === 'hex' && line.tokenName && currentColors[line.tokenName]) {
      const hsl = currentColors[line.tokenName];
      const hex = hslToHex(hsl.h, hsl.s, hsl.l);
      // Reconstruct the line preserving indentation
      const indent = line.raw.match(/^(\s*)/)?.[1] || '  ';
      outputLines.push(`${indent}${line.tokenName}: ${hex};`);
    } else if (line.type === 'rgba' && line.tokenName && currentRgbaColors[line.tokenName]) {
      const { h, s, l, a } = currentRgbaColors[line.tokenName];
      const { r, g, b } = hslToRgb(h, s, l);
      const indent = line.raw.match(/^(\s*)/)?.[1] || '  ';
      outputLines.push(`${indent}${line.tokenName}: rgba(${r}, ${g}, ${b}, ${a});`);
    } else {
      // Reference tokens, comments, structural lines — keep as-is
      outputLines.push(line.raw);
    }
  }

  return outputLines.join('\n');
}

/**
 * Like `serializeCss`, but hex lines whose token is in `oklchForTokenNames` are written as `oklch(...)`.
 * Other lines (including rgba) stay unchanged from `serializeCss` behavior.
 */
export function serializeCssWithOklchForTokens(
  originalLines: ParsedLine[],
  currentColors: Record<string, HSL>,
  currentRgbaColors: Record<string, HSL & { a: number }>,
  oklchForTokenNames: ReadonlySet<string>,
): string {
  const outputLines: string[] = [];

  for (const line of originalLines) {
    if (line.type === 'hex' && line.tokenName && currentColors[line.tokenName]) {
      const hsl = currentColors[line.tokenName];
      const hex = hslToHex(hsl.h, hsl.s, hsl.l);
      const indent = line.raw.match(/^(\s*)/)?.[1] || '  ';
      if (oklchForTokenNames.has(line.tokenName)) {
        const ok = formatOklchCssFromHex(hex);
        outputLines.push(`${indent}${line.tokenName}: ${ok ?? hex};`);
      } else {
        outputLines.push(`${indent}${line.tokenName}: ${hex};`);
      }
    } else if (line.type === 'rgba' && line.tokenName && currentRgbaColors[line.tokenName]) {
      const { h, s, l, a } = currentRgbaColors[line.tokenName];
      const { r, g, b } = hslToRgb(h, s, l);
      const indent = line.raw.match(/^(\s*)/)?.[1] || '  ';
      outputLines.push(`${indent}${line.tokenName}: rgba(${r}, ${g}, ${b}, ${a});`);
    } else {
      outputLines.push(line.raw);
    }
  }

  return outputLines.join('\n');
}

export function oklchVariantFileName(fileName: string): string {
  if (fileName.toLowerCase().endsWith('.css')) {
    return `${fileName.slice(0, -4)}-oklch.css`;
  }
  return `${fileName}-oklch.css`;
}

export function downloadCssFile(content: string, filename: string = 'index.css'): void {
  const blob = new Blob([content], { type: 'text/css' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
