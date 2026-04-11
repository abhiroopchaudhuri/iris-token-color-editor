declare module 'culori' {
  export function parse(color: string): Record<string, unknown> | undefined;
  export function formatHex(color: unknown): string;
  export function converter(mode: string): (color: unknown) => Record<string, unknown>;
  export function toGamut(
    dest?: string,
    mode?: string,
    delta?: unknown,
    jnd?: number,
  ): (color: unknown) => Record<string, unknown>;
}
