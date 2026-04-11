export interface TokenUsagePrimitiveEntry {
  total: number;
  /** v3+: optional; implementation (core + css) vs story modules */
  fromImplementation?: number;
  fromStorybook?: number;
  /** Other `--*` names whose var() chain resolves to this primitive (from token-usage build). */
  aliases?: string[];
}

export interface TokenUsagePayload {
  version: number;
  scope?: string;
  description?: string;
  generatedAt: string;
  repoRevision: string;
  scan?: {
    implementationRoots?: string[];
    implementationFileCount?: number;
    storyFileCount?: number;
    cssDefinitionFilesMerged?: number;
  };
  /** @deprecated v2 */
  scanRoots?: string[];
  /** @deprecated v2 */
  fileCount?: number;
  thresholds: {
    highMinPercentile: number;
    lowMaxPercentile: number;
    highMinCount: number;
    lowMaxCount: number;
  };
  primitives: Record<string, TokenUsagePrimitiveEntry>;
}
