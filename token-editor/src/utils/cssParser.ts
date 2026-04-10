export type LineType = 'hex' | 'rgba' | 'reference' | 'comment' | 'structural';

export interface ParsedLine {
  raw: string;
  type: LineType;
  tokenName?: string;
  value?: string; // hex value like #ffffff, or rgba(...) string
  referenceTo?: string; // for var() references, the referenced token name
  id: string; // unique id for this line
}

let lineCounter = 0;

function generateId(): string {
  return `line_${lineCounter++}`;
}

export function resetLineCounter(): void {
  lineCounter = 0;
}

const HEX_REGEX = /^\s*(--[\w-]+)\s*:\s*(#[0-9a-fA-F]{3,8})\s*;\s*$/;
const RGBA_REGEX = /^\s*(--[\w-]+)\s*:\s*(rgba?\([^)]+\))\s*;\s*$/;
const VAR_REGEX = /^\s*(--[\w-]+)\s*:\s*var\((--[\w-]+)\)\s*;\s*$/;

export function parseCssTokens(css: string): ParsedLine[] {
  resetLineCounter();
  const lines = css.split('\n');
  const result: ParsedLine[] = [];

  for (const line of lines) {
    // Remove trailing \r
    const cleanLine = line.replace(/\r$/, '');

    const hexMatch = cleanLine.match(HEX_REGEX);
    if (hexMatch) {
      result.push({
        raw: cleanLine,
        type: 'hex',
        tokenName: hexMatch[1],
        value: hexMatch[2].toLowerCase(),
        id: generateId(),
      });
      continue;
    }

    const rgbaMatch = cleanLine.match(RGBA_REGEX);
    if (rgbaMatch) {
      result.push({
        raw: cleanLine,
        type: 'rgba',
        tokenName: rgbaMatch[1],
        value: rgbaMatch[2],
        id: generateId(),
      });
      continue;
    }

    const varMatch = cleanLine.match(VAR_REGEX);
    if (varMatch) {
      result.push({
        raw: cleanLine,
        type: 'reference',
        tokenName: varMatch[1],
        referenceTo: varMatch[2],
        id: generateId(),
      });
      continue;
    }

    // Everything else: comments, empty lines, :root {, }, etc.
    result.push({
      raw: cleanLine,
      type: cleanLine.trim().startsWith('/*') || cleanLine.trim().startsWith('*') || cleanLine.trim().endsWith('*/')
        ? 'comment'
        : 'structural',
      id: generateId(),
    });
  }

  return result;
}

export function getEditableTokens(lines: ParsedLine[]): ParsedLine[] {
  return lines.filter(l => l.type === 'hex');
}

export function getRgbaTokens(lines: ParsedLine[]): ParsedLine[] {
  return lines.filter(l => l.type === 'rgba');
}

export function getReferenceTokens(lines: ParsedLine[]): ParsedLine[] {
  return lines.filter(l => l.type === 'reference');
}

/** Group hex tokens by their color family (e.g., "blue", "red", etc.) */
export function groupByFamily(tokens: ParsedLine[]): Record<string, ParsedLine[]> {
  const groups: Record<string, ParsedLine[]> = {};

  for (const token of tokens) {
    if (!token.tokenName) continue;
    // Extract family: --color-blue-100 → "blue", --shadow-0 → "shadow", --color-white → "defaults"
    const match = token.tokenName.match(/^--color-([\w]+)-\d/);
    const family = match ? match[1] : 'defaults';
    if (!groups[family]) groups[family] = [];
    groups[family].push(token);
  }

  return groups;
}
