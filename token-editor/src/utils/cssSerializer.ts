import { ParsedLine } from './cssParser';
import { HSL, hslToHex, hslToRgb, parseRgba, rgbToHsl } from './colorUtils';

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
