/**
 * Token usage for color primitives (`--color-*`):
 * - Resolves every `--token` occurrence through the full variable graph: tokens + variables
 *   + every other stylesheet in css/src (local aliases like --foo: var(--primary)).
 * - Counts implementation (core + css/src, excluding *.story.*) + Storybook stories separately,
 *   then sums per primitive (no double-count).
 *
 * Run: node scripts/build-token-usage.mjs
 * (token-editor predev / prebuild)
 * Output: token-editor/public/token-usage.json
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const CORE_ROOT = path.join(REPO_ROOT, 'design-system', 'core');
const CSS_SRC = path.join(REPO_ROOT, 'design-system', 'css', 'src');
const TOKENS_CSS = path.join(CSS_SRC, 'tokens', 'index.css');
const VARIABLES_CSS = path.join(CSS_SRC, 'variables', 'index.css');
const OUT_JSON = path.join(REPO_ROOT, 'token-editor', 'public', 'token-usage.json');

const CODE_EXT = new Set(['.tsx', '.ts', '.jsx', '.js', '.mjs', '.cjs']);
const STYLE_EXT = new Set(['.css', '.scss', '.sass', '.less']);

const SKIP_DIR_NAMES = new Set([
  '__tests__',
  '__snapshots__',
  'node_modules',
  '.git',
  'dist',
  '.dist',
  '.next',
  'coverage',
]);

/** Skipped when aggregating occurrences (graph still built from these in buildDefinitionMap). */
function isExcludedFromUsageCount(fp) {
  const n = fp.replace(/\\/g, '/');
  return (
    n.endsWith('css/src/tokens/index.css') || n.endsWith('css/src/variables/index.css')
  );
}

function read(p) {
  return fs.readFileSync(p, 'utf8');
}

function exists(p) {
  try {
    fs.accessSync(p);
    return true;
  } catch {
    return false;
  }
}

function isTokensIndexFile(fp) {
  return fp.replace(/\\/g, '/').endsWith('css/src/tokens/index.css');
}

/**
 * Match custom properties only: `--foo: value;`
 * Exclude BEM-style selectors like `.Select-trigger--filled:disabled {` where `--filled:` is not a declaration
 * (naive `/--name:/` would swallow the next `;` inside the rule block).
 */
const CSS_CUSTOM_PROP_RE = /(?<![\w-])--([\w-]+)\s*:\s*([^;]+);/g;

/** First write wins (tokens + variables loaded first). */
function parseCssCustomPropertiesFirstWins(filePath, into) {
  const text = read(filePath);
  const re = new RegExp(CSS_CUSTOM_PROP_RE.source, 'g');
  let m;
  while ((m = re.exec(text))) {
    const name = `--${m[1]}`;
    const value = m[2].trim();
    if (!into.has(name)) into.set(name, value);
  }
}

/** Add only *new* property names so tokens/variables stay canonical. */
function parseCssCustomPropertiesMergeNewNames(filePath, into) {
  const text = read(filePath);
  const re = new RegExp(CSS_CUSTOM_PROP_RE.source, 'g');
  let m;
  while ((m = re.exec(text))) {
    const name = `--${m[1]}`;
    const value = m[2].trim();
    if (!into.has(name)) into.set(name, value);
  }
}

function collectAllCssFilesUnderCssSrc() {
  const out = [];
  function walk(dir) {
    if (!exists(dir)) return;
    if (SKIP_DIR_NAMES.has(path.basename(dir))) return;
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const ent of entries) {
      const p = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        if (!SKIP_DIR_NAMES.has(ent.name)) walk(p);
      } else if (ent.name.endsWith('.css')) {
        out.push(p);
      }
    }
  }
  walk(CSS_SRC);
  return out.sort((a, b) => a.localeCompare(b));
}

function buildDefinitionMap() {
  const definitions = new Map();
  parseCssCustomPropertiesFirstWins(TOKENS_CSS, definitions);
  parseCssCustomPropertiesFirstWins(VARIABLES_CSS, definitions);

  for (const cssPath of collectAllCssFilesUnderCssSrc()) {
    if (isTokensIndexFile(cssPath)) continue;
    parseCssCustomPropertiesMergeNewNames(cssPath, definitions);
  }
  return definitions;
}

function varsInValue(value) {
  const out = [];
  const re = /var\(\s*(--[\w-]+)/g;
  let m;
  while ((m = re.exec(value))) out.push(m[1]);
  return out;
}

function buildPrimitiveSet(definitions) {
  const prim = new Set();
  for (const [k] of definitions) {
    if (k.startsWith('--color-')) prim.add(k);
  }
  return prim;
}

function buildPrimitivesMemo(definitions, primitiveSet) {
  const memo = new Map();
  const stack = new Set();

  function resolve(name) {
    if (memo.has(name)) return memo.get(name);
    if (stack.has(name)) {
      memo.set(name, new Set());
      return memo.get(name);
    }
    stack.add(name);
    const out = new Set();
    if (primitiveSet.has(name)) {
      out.add(name);
    } else {
      const val = definitions.get(name);
      if (val) {
        for (const ref of varsInValue(val)) {
          for (const p of resolve(ref)) out.add(p);
        }
      }
    }
    stack.delete(name);
    memo.set(name, out);
    return out;
  }

  for (const n of definitions.keys()) resolve(n);
  return memo;
}

/** Every custom property name (except the primitive itself) whose var() chain resolves to this `--color-*`. */
function buildAliasesByPrimitive(memo, primitiveSet) {
  const byPrim = new Map();
  for (const p of primitiveSet) byPrim.set(p, new Set());

  for (const [tokenName, resolvedPrimitives] of memo) {
    for (const p of resolvedPrimitives) {
      if (!primitiveSet.has(p)) continue;
      if (tokenName === p) continue;
      byPrim.get(p).add(tokenName);
    }
  }

  const out = new Map();
  for (const [p, set] of byPrim) {
    out.set(p, [...set].sort((a, b) => a.localeCompare(b)));
  }
  return out;
}

function isStoryFilePath(fp) {
  return /\.story\.(tsx|ts|jsx|js)$/i.test(fp);
}

function collectImplementationFiles() {
  const files = [];

  function walk(dir, skipStoryModules) {
    if (!exists(dir)) return;
    if (SKIP_DIR_NAMES.has(path.basename(dir))) return;
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const ent of entries) {
      if (SKIP_DIR_NAMES.has(ent.name)) continue;
      const p = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        walk(p, skipStoryModules);
      } else {
        const ext = path.extname(ent.name);
        if (!CODE_EXT.has(ext) && !STYLE_EXT.has(ext)) continue;
        if (skipStoryModules && isStoryFilePath(p)) continue;
        if (isTokensIndexFile(p)) continue;
        files.push(p);
      }
    }
  }

  walk(CORE_ROOT, true);
  walk(CSS_SRC, false);
  return files;
}

function shouldExcludeStory(storyPath, source) {
  const norm = storyPath.replace(/\\/g, '/');
  if (norm.includes('/components/patterns/')) return true;
  if (norm.includes('/components/css-utilities/designTokens/')) return true;
  const titleM = source.match(/title:\s*['"]([^'"]+)['"]/);
  if (titleM) {
    const t = titleM[1];
    if (t.startsWith('Styling/Design Tokens/')) return true;
    if (t.startsWith('Patterns/')) return true;
  }
  return false;
}

function collectStorybookStoryFiles() {
  const out = [];
  const roots = [
    path.join(CORE_ROOT, 'components'),
    path.join(CORE_ROOT, 'ai-components'),
  ];

  function walk(dir) {
    if (!exists(dir)) return;
    if (SKIP_DIR_NAMES.has(path.basename(dir))) return;
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const ent of entries) {
      const p = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        walk(p);
      } else if (isStoryFilePath(p)) {
        let src = '';
        try {
          src = read(p);
        } catch {
          continue;
        }
        if (shouldExcludeStory(p, src)) continue;
        out.push(p);
      }
    }
  }

  for (const r of roots) walk(r);
  return out;
}

function countPrimitivesInText(text, memo, primitiveSet) {
  const counts = new Map();
  for (const p of primitiveSet) counts.set(p, 0);
  const re = /--[\w-]+/g;
  let m;
  while ((m = re.exec(text))) {
    const tok = m[0];
    const primaries = memo.get(tok);
    if (!primaries || primaries.size === 0) continue;
    for (const p of primaries) {
      if (primitiveSet.has(p)) counts.set(p, counts.get(p) + 1);
    }
  }
  return counts;
}

function addFileCountsToTotals(fpList, totals, memo, primitiveSet) {
  for (const fp of fpList) {
    if (isExcludedFromUsageCount(fp)) continue;
    let text;
    try {
      text = read(fp);
    } catch {
      continue;
    }
    const fileCounts = countPrimitivesInText(text, memo, primitiveSet);
    for (const prim of primitiveSet) {
      totals.set(prim, totals.get(prim) + (fileCounts.get(prim) || 0));
    }
  }
}

function gitSha() {
  try {
    return execSync('git rev-parse HEAD', { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
}

function main() {
  const definitions = buildDefinitionMap();
  const primitiveSet = buildPrimitiveSet(definitions);
  const tokenToPrimitives = buildPrimitivesMemo(definitions, primitiveSet);

  const implFiles = collectImplementationFiles();
  const storyFiles = collectStorybookStoryFiles();

  const totals = new Map();
  const fromImpl = new Map();
  const fromStories = new Map();
  for (const p of primitiveSet) {
    totals.set(p, 0);
    fromImpl.set(p, 0);
    fromStories.set(p, 0);
  }

  addFileCountsToTotals(implFiles, fromImpl, tokenToPrimitives, primitiveSet);
  addFileCountsToTotals(storyFiles, fromStories, tokenToPrimitives, primitiveSet);

  for (const prim of primitiveSet) {
    totals.set(prim, fromImpl.get(prim) + fromStories.get(prim));
  }

  const aliasesByPrimitive = buildAliasesByPrimitive(tokenToPrimitives, primitiveSet);

  const primitivesOut = {};
  const primTotals = [];
  for (const prim of [...primitiveSet].sort()) {
    const total = totals.get(prim) || 0;
    primTotals.push(total);
    primitivesOut[prim] = {
      total,
      fromImplementation: fromImpl.get(prim) || 0,
      fromStorybook: fromStories.get(prim) || 0,
      aliases: aliasesByPrimitive.get(prim) || [],
    };
  }

  primTotals.sort((a, b) => a - b);
  const nonzero = primTotals.filter((t) => t > 0).sort((a, b) => a - b);
  const pct = (arr, p) => {
    if (arr.length === 0) return 0;
    const i = Math.min(arr.length - 1, Math.max(0, Math.floor((p / 100) * arr.length)));
    return arr[i];
  };
  const thresholds =
    nonzero.length === 0
      ? { highMinPercentile: 66, lowMaxPercentile: 33, highMinCount: 1, lowMaxCount: 0 }
      : {
          highMinPercentile: 66,
          lowMaxPercentile: 33,
          highMinCount: pct(nonzero, 66),
          lowMaxCount: pct(nonzero, 33),
        };

  const payload = {
    version: 3,
    scope: 'design-system+storybook',
    description:
      'Per primitive: transitive var() resolution (tokens + variables + all css/src). Totals = implementation files + Storybook story files (no overlap).',
    generatedAt: new Date().toISOString(),
    repoRevision: gitSha(),
    scan: {
      implementationRoots: [
        path.relative(REPO_ROOT, CORE_ROOT).replace(/\\/g, '/'),
        path.relative(REPO_ROOT, CSS_SRC).replace(/\\/g, '/'),
      ],
      implementationFileCount: implFiles.length,
      storyFileCount: storyFiles.length,
      cssDefinitionFilesMerged: collectAllCssFilesUnderCssSrc().filter((p) => !isTokensIndexFile(p)).length,
    },
    thresholds,
    primitives: primitivesOut,
  };

  fs.mkdirSync(path.dirname(OUT_JSON), { recursive: true });
  fs.writeFileSync(OUT_JSON, JSON.stringify(payload, null, 0), 'utf8');
  console.log(
    `Wrote ${OUT_JSON} (impl=${implFiles.length} files, stories=${storyFiles.length} files, ${primitiveSet.size} primitives)`,
  );
}

main();
