# Token usage analytics (Storybook + IRIS swatches)

This document is the **execution blueprint** for showing **exact (static) usage counts** of design-system **color primitive tokens** (e.g. `--color-blue-900`) across Storybook stories and surfacing them in the **IRIS token-editor** sidesheet and swatch grid.

**Related codebase facts (ground truth):**

| Area | Location |
|------|----------|
| Storybook story globs | `design-system/.storybook/main.js` → `../core/components/**/*.story.*`, `../core/ai-components/**/*.story.*` |
| Primitive palette | `design-system/css/src/tokens/index.css` (`--color-*`) |
| Semantic / alias layer | `design-system/css/src/variables/index.css` (`var(--color-…)` chains) |
| Color sidesheet | `token-editor/src/components/HSLSliders.tsx` (opened from `ColorSwatch` via `activeToken`) |
| Swatch grid + names | `token-editor/src/components/SwatchGrid.tsx`, `ColorSwatch.tsx` |
| “Filter Rules” toolbar | `token-editor/src/components/ColorEditor.tsx` (button left of popover anchor) |

---

## 1. Product definition

### 1.1 Sidesheet (“Color details”) — new **Usage** block

Placed **below** the existing contrast / WCAG section in `HSLSliders`.

- **Title:** `Usage`
- **Component selector (dropdown):**
  - **All components** — aggregate across every included component; show **total** usage count for the active primitive token.
  - **One component** — e.g. `atoms/button`, `organisms/table` — scoped counts only.
- **Visualization:** a chart of **usage count per Storybook story** for the selected component (x = story, y = count). When **All components** is selected, either:
  - **Option A (recommended):** stacked or grouped bars per component × story (can get wide; use scroll + compact labels), or
  - **Option B:** single series = sum per **story file** across all components (less intuitive).
  - **Option C:** table + small sparkline per row if chart noise is too high.

**Numbers must match** the static analysis output (no guessing from runtime DOM).

### 1.2 Swatches page — **Usage** toggle

- **Placement:** immediately **to the left** of the existing **Filter Rules** button in `ColorEditor.tsx` (same toolbar row).
- **Control:** small **switch** (on/off), label e.g. `Usage`.
- **When on:** under each swatch name (`ColorSwatch`), show **numeric occurrence count** for that primitive token.
- **Color coding (count text only):**
  - **Light green** — high usage (see §4.4 for quantile thresholds).
  - **Yellow** — medium.
  - **Red** — very low (including `0`).

### 1.3 Scope exclusions (per product request)

**Exclude** from all usage metrics:

1. **Design Tokens stories** — CSF titles under `Styling/Design Tokens/…` (files live under `design-system/core/components/css-utilities/designTokens/`).
2. **Patterns** — any story whose CSF `title` starts with `Patterns/` **or** file path is under `design-system/core/components/patterns/`.

**Include** normal components under `core/components/**` (except the above) and `core/ai-components/**`, unless you later decide to exclude AI; default plan: **include** `ai-components`.

---

## 2. Technical approach — static analysis

### 2.1 Why static analysis

Storybook renders React trees; **primitive** colors often appear only in **CSS** (e.g. Button styles), not as literal strings in `.story.jsx`. Runtime DOM inspection cannot reliably attribute “which story” without executing every story and scraping computed styles (slow, flaky, still ambiguous with shared CSS).

Therefore: **offline script** that counts **string occurrences** in a defined **file set** per story / component, with a **declared resolution model** for semantic tokens.

### 2.2 “Exact” definition (contract)

For each primitive token `P` (e.g. `--color-blue-900`), the script reports:

- `directHits`: occurrences of `P` as a **CSS identifier** in scanned text (see §2.5).
- `aliasHits`: occurrences of any **alias token** `A` such that the token graph resolves `A → … → P` (see §2.3).
- `total = directHits + aliasHits` (if double-counting is possible in same file, see §2.6).

**Per story:** counts are attributed to **one primary story file** (the `.story.*` module). Optional stretch: split exports within a file per **named export** if you parse CSF exports.

### 2.3 Token graph (primitives + semantic aliases)

**Inputs:**

- `design-system/css/src/tokens/index.css` — defines `--color-*` primitives (and rgba variants).
- `design-system/css/src/variables/index.css` — defines semantic variables referencing `var(--…)` including primitives.

**Build a directed graph:**

- Each custom property `--x` is a node.
- If `--x: var(--y)` (possibly with fallbacks / whitespace), add edge `x → y` (meaning: *x references y*).

**Closure for a primitive `P`:**

- Collect all nodes `A` such that repeatedly following references from the **computed value** of `A` eventually uses `P`.
- Implementation detail: start from `P` and walk **backwards** along reverse edges, or forward from all nodes with memoization — document chosen approach in script comments.

**Transitive `var()` chains** (e.g. `--a: var(--b); --b: var(--color-blue-900);`) must resolve.

**Out of scope (unless added later):**

- `color-mod()`, `calc()`, or PostCSS-only transforms — only treat explicit `var(--token)` edges from parsed CSS values.
- Equating **raw hex** in a file to a primitive **by value** — not part of v1 (avoids false positives when colors collide).

### 2.4 Which files to scan, per story

**Minimum viable (v1 — recommended first ship):**

For each included story file `S`:

1. Always scan **`S` itself** (inline styles, args, decorators, class names — rare but possible).
2. Resolve **component root directory** from `S` path, e.g.  
   `…/atoms/button/__stories__/state/Basic.story.jsx` → root `…/atoms/button/`.
3. Scan **all implementation styles** under that root:
   - Extensions: `.css`, `.module.css`, `.scss`, `.sass`, `.less` (whatever exists in repo).
   - **Exclude** `__stories__/**` **optional flag:** default **include** `__stories__` only in step 1, not in bulk CSS scan — avoids duplicating demo-only CSS as “component usage” (product call). *Decision recorded in tracker §5.*

4. **Attribute all hits from steps 1–3 to every exported story in `S`** equally **or** to the file as a single bucket labeled by default export name — **decision point** in §5.

**v2 (accuracy upgrade):**

- Parse **static imports** from `S` (and from imported local TS/JS) to include **only** reachable style modules (import graph), instead of “entire component folder”.
- Pull **official Storybook story id** via `@storybook/csf-tools` or `storybook` static build — aligns labels with Storybook UI.

### 2.5 Matching rules (avoid false positives)

Count an occurrence when:

- Whole-token match for `--color-…` / alias names in contexts like:
  - `var(--color-blue-900)`
  - `var(--color-blue-900, fallback)`
  - `--color-blue-900:` (definition line — usually in tokens only; **exclude tokens/index.css from “usage”** counts or count separately as “definition only” — see §2.7)
- **Word-boundary style:** token preceded by non-`[-a-zA-Z0-9_]` and followed by same (to avoid matching `--color-blue-9000`).

**Do not count:**

- Occurrences inside `tokens/index.css` as *component usage* (definitions). Either skip file entirely for usage totals or tag as `definition`.

### 2.6 Double-counting policy

If the same line contains both `var(--primary-300)` and expanded knowledge that it maps to `--color-blue-300`, count **once per logical reference** (prefer counting **only** the written alias in source, and map to primitive in post-processing — **do not** also add primitive substring if absent).

### 2.7 Component grouping key

Use **path-based id** stable in UI:

- `core/components/atoms/button` → label `atoms/button`
- `core/ai-components/AIChip` → `ai-components/AIChip`

Map CSF `title` metadata when present for display subtitles, but **do not** rely on it as the primary key (some legacy stories lack consistent titles).

---

## 3. Artifact contract (script output)

Single JSON consumed by token-editor (committed or generated in CI):

**Suggested path:** `token-editor/public/token-usage.json`  
(Or `token-editor/src/data/token-usage.json` imported at build time — prefer `public/` if you want to refresh without rebuild during dev.)

**Shape (illustrative):**

```json
{
  "generatedAt": "ISO-8601",
  "repoRevision": "git sha or unknown",
  "exclusions": {
    "pathPrefixes": ["core/components/css-utilities/designTokens/", "core/components/patterns/"],
    "titlePrefixes": ["Styling/Design Tokens/", "Patterns/"]
  },
  "thresholds": {
    "highMinPercentile": 66,
    "lowMaxPercentile": 33,
    "note": "percentiles over all primitive totals, excluding definition-only files"
  },
  "primitives": {
    "--color-blue-900": {
      "total": 42,
      "byComponent": {
        "atoms/button": {
          "total": 10,
          "byStoryFile": {
            "core/components/atoms/button/__stories__/state/Basic.story.jsx": 10
          }
        }
      }
    }
  }
}
```

**Optional** `byStoryExport` if you implement per-export CSF parsing.

---

## 4. Token-editor UI implementation notes

### 4.1 Data loading

- On app load (or when opening sidesheet first time), `fetch('/token-usage.json')` with graceful **empty state** if missing (“Run `pnpm run build:token-usage`” or similar).
- Type-safe parser + version field for future schema migrations.

### 4.2 State

- Extend `useColorStore` **or** a small `useTokenUsageStore`:
  - `usageOverlayEnabled: boolean`
  - cached `usageData` / error / loaded flag

### 4.3 Sidesheet (`HSLSliders`)

- New section at bottom: heading **Usage**, `@radix-ui/react-select` (already in dependencies) for component filter.
- **Chart library:** none in `token-editor/package.json` today — add **one** of:
  - `recharts` (bar chart, good for Storybook-scale counts), or
  - lightweight custom **CSS flex bars** (zero new deps) if bundle size is critical.

### 4.4 Swatch overlay thresholds

- Compute once from JSON: array of all `primitives[*].total`, sort, pick cutoffs at configured percentiles.
- **Accessibility:** do not rely on color alone — use **subtle background pill** or **icon** + `title` with exact count; meet WCAG for contrast on dark UI (see `design-system/.cursor/rules` if you touch shared patterns).

### 4.5 Toolbar switch (`ColorEditor`)

- New switch left of **Filter Rules**; toggles `usageOverlayEnabled`.
- Persist in `localStorage` (same pattern as other editor prefs) **optional**.

---

## 5. Minute-step tracker

Use this as the **single checklist** during implementation. Mark `[x]` when done.

### Phase 0 — Decisions (blockers)

- [ ] **D1 — Attribution:** For v1, attribute folder-scan hits to **(a)** whole story file as one bar, **(b)** split per named CSF export, or **(c)** duplicate full count for every export in file. *Recommendation: (a) or parse exports for (b).*
- [ ] **D2 — `__stories__` CSS:** Include styles under `__stories__/` in folder scan **yes/no**. *Recommendation: no — only scan story source for those; implementation CSS lives outside `__stories__`.*
- [ ] **D3 — Chart library:** `recharts` vs pure CSS bars.
- [ ] **D4 — JSON delivery:** commit `public/token-usage.json` vs generate in CI only vs both.

### Phase 1 — Analysis script (Node, repo root or `token-editor/scripts/`)

- [ ] **S1** Create script entry file, e.g. `token-editor/scripts/build-token-usage.mjs` (or `design-system/scripts/…`).
- [ ] **S2** Implement CSS custom-property parser sufficient for `tokens/index.css` + `variables/index.css` (regex + balanced parens for `var()` or use `postcss-value-parser` if allowed).
- [ ] **S3** Build **reference graph** and **reverse closure** map: `primitive → Set<alias token names>`.
- [ ] **S4** Glob all candidate story files matching Storybook config **minus** exclusion rules (path + `title` scan).
- [ ] **S5** For each story file, resolve component root path (walk up until leaving `__stories__` chain).
- [ ] **S6** Collect scan file list: story file + style files under root per D2.
- [ ] **S7** Implement tokenizer-aware counting for `--color-*` and aliases (§2.5).
- [ ] **S8** Aggregate: `primitive → component → storyFile → count` + `total`.
- [ ] **S9** Compute global percentiles for thresholds (§4.4).
- [ ] **S10** Write `token-editor/public/token-usage.json` + log summary (story count, file count, time).
- [ ] **S11** Add `package.json` script at monorepo level or `token-editor` README line: `build:token-usage`.

### Phase 2 — Token-editor: data + store

- [ ] **U1** Add TypeScript types for JSON schema.
- [ ] **U2** Implement loader hook with `fetch`, error boundary, empty state.
- [ ] **U3** Add `usageOverlayEnabled` state (+ optional persistence).

### Phase 3 — Swatches UI

- [ ] **W1** Add switch control in `ColorEditor.tsx` left of Filter Rules.
- [ ] **W2** Pass usage map + toggle into `SwatchGrid` / `ColorSwatch` (props or store).
- [ ] **W3** Render count under name; apply green/yellow/red from percentiles.
- [ ] **W4** CSS polish in `ColorSwatch.module.css` (spacing, font size, contrast).

### Phase 4 — Sidesheet UI

- [ ] **P1** Add **Usage** section to `HSLSliders.tsx` below contrast block.
- [ ] **P2** Dropdown: **All components** + sorted component list from JSON keys for active primitive.
- [ ] **P3** Show **total** for selection next to title or in subtitle.
- [ ] **P4** Render chart (or table) for `byStoryFile` / export keys.
- [ ] **P5** Loading / no-data / primitive not found states.

### Phase 5 — QA & hygiene

- [ ] **Q1** Run script on clean checkout; verify a known token (e.g. `--color-blue-900`) has non-zero counts if used in Button styles.
- [ ] **Q2** Confirm excluded stories (`Colors.story.tsx` under Design Tokens, `Patterns/…`) contribute **zero**.
- [ ] **Q3** Spot-check: semantic-only reference (`--primary-300`) increments `--color-blue-300` (or actual mapped primitive).
- [ ] **Q4** Bundle size check if chart lib added.
- [ ] **Q5** Document regeneration command in existing internal doc **only if** the team already maintains one nearby (avoid new docs sprawl beyond this file unless requested).

---

## 6. Risks & follow-ups

| Risk | Mitigation |
|------|------------|
| Folder-wide CSS scan attributes shared tokens to all stories in that package | v2 import-graph narrowing; document limitation in UI (“approximate at package level”). |
| Dynamic class names / theme strings | not visible statically — acceptable v1 gap. |
| Stories importing remote or generated CSS | rare; ignore or extend globs. |
| Duplicate stories / MDX | if MDX exists outside globs, extend glob list later. |

---

## 7. Suggested order of execution

1. Phase 0 decisions (short team sync or solo defaults above).  
2. Phase 1 script + sample JSON checked in.  
3. Phase 2 loader.  
4. Phase 3 swatch toggle (validates data shape early).  
5. Phase 4 sidesheet chart.  
6. Phase 5 QA.

---

*Last updated: 2026-04-12 — planning only; implementation should reference this tracker and tick items in place.*
