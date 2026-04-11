# OKLCH harmonize feature — logic and implementation tasks

## Goal

Add a workflow (separate from **Filter Rules**) that:

1. Lets the user pick **which color groups** participate (e.g. blue, green, yellow), same chip UX as the selection filter.
2. Lets the user pick **which shade steps** apply, either **multi-select** (OR list) or a **numeric range** (min–max, inclusive) on the shade number parsed from token names (`--color-{family}-{shade}`).
3. Lets the user pick exactly one **reference group** (the “standard”). For each selected shade `N`, the reference swatch `--color-{ref}-{N}` supplies **OKLCH perceived lightness `L`** and **chroma `C`**.
4. For every **other** selected group `G` and each selected shade `N`, update `--color-{G}-{N}` in OKLCH by **keeping that swatch’s current hue `h`** and setting **`L` and `C` to the reference values for the same shade `N`**, **except** for neutral groups **`gray` / `grey` / `white` / `black`** (case-insensitive): those keep **their own chroma and hue** and only take the reference **`L`** (perceived lightness). Then convert back to **sRGB hex** and write into the store as HSL (same as the rest of the app).
5. Optional **standardize reference** (runs **before** cross-group harmonization):
   - Only touches the **reference** group’s selected shades.
   - **Lightness:** along shades sorted by step number, assign **evenly spaced `L`** in OKLCH from the **current `L` of the lightest selected step** to the **current `L` of the darkest selected step** (endpoints preserved, interior points linearly interpolated).
   - **Chroma:** either **mean `C`** of those reference swatches before standardization, or a **user-fixed `C`** applied to all selected reference shades — **unless** the reference group is neutral (`gray` / `grey` / `white` / `black`), in which case **each shade keeps its own `C`** (only `L` is spaced).
   - **Hue:** **unchanged** per token (each shade keeps its own `h`).
6. **Gamut:** Many OKLCH triples are outside sRGB. After each intended `(L, C, h)`, **automatically** map into gamut: **reduce `C`** iteratively (or use library gamut mapping), then if needed **nudge `L` slightly** until the color is representable as sRGB. All final values shown on swatches and in navbar **Copy / Export CSS** must be **hex** (the gamut-mapped result).

## Non-goals / constraints

- **Navbar Copy CSS and Export CSS** stay **hex** (and rgba for rgba lines), matching **serialized output** from `serializeCss` — **no OKLCH** there.
- **Per-token editor popover** (`HSLSliders`): add **Copy OKLCH** and **Download snippet** (CSS variable line in `oklch()`), derived from the **current** hex → OKLCH (gamut-safe), for that token only.
- **RGBA tokens:** harmonize tool applies to **hex palette tokens** only (`--color-*` with hex values). RGBA variants are unchanged by this feature unless we extend later.

## Token and shade model (existing)

- `parseTokenFamilyShade` in `selectionFilter.ts`: `--color-{family}-{shade}` with optional `-{alpha}a` suffix.
- Families and shade lists are already discoverable via `collectFamiliesAndShadesFromLines`.

## Dependencies

- Add **`culori`** for OKLCH conversion, `formatCss` / `formatHex`, and **`toGamut('rgb')`** (or equivalent) so gamut handling is robust and maintained.

## Core algorithms

### A. Hex ↔ OKLCH (with gamut-safe hex output)

1. Parse hex → color object → convert to **OKLCH** (degrees for `h` where applicable).
2. To produce hex from a target OKLCH: apply **`toGamut('rgb')`**, then **`formatHex`** (or rgb → existing `hexToHsl` / store pipeline).
3. If the library’s mapper still edge-cases, optional fallback: small binary search on `C` down to 0, then tiny `L` nudges — prefer single library path first.

### B. Standardize reference (optional)

Input: reference family `R`, set of shade numbers `S` (sorted ascending).

For each `n ∈ S`, read current hex → OKLCH → store `(L_n, C_n, h_n)`.

- Let `L_start = L_{min(S)}`, `L_end = L_{max(S)}` where min/max are by **shade index order** (first and last in sorted `S`).
- For `i = 0..|S|-1`, `L'_i = L_start + (L_end - L_start) * (i / (|S|-1))` (if `|S|===1`, skip spacing; keep single `L`).
- `C'`: if mode **average**, `C' = mean(C_n)`; if **fixed**, `C' = user value`.
- New color for each shade: `oklch(L'_i, C', h_i)` → gamut map → hex → HSL into store.

### C. Harmonize non-reference groups

After optional B, for each shade `n ∈ S`:

1. Read reference token `--color-{R}-{n}` → OKLCH → `(L_ref(n), C_ref(n), _)`.
2. For each other family `G ∈ families` where `G !== R`:
   - If token `--color-{G}-{n}` exists, is hex-backed, and not locked: read OKLCH → `(., ., h_G)`.
   - Set `(L_ref(n), C_ref(n), h_G)` → gamut map → hex → HSL → store.

Locked tokens: **never** modified.

Missing token for a (family, shade): **skip** (no error).

### D. Undo

Single **`pushSnapshot()`** before applying B+C so one undo restores prior palette.

## UI specification

### New control: “OKLCH harmonize” (next to Filter Rules)

- Popover panel (portal + layout mirroring Filter Rules):
  - **Groups (OR):** chips; “All groups” clears to mean “any” is **not** used here — user must pick at least one family (same pattern as filter: null = all is confusing; require explicit selection or default to all families toggled — **require at least one selected family**).
  - **Shades:** toggle **Multi** vs **Range**; multi = chip list like filter; range = min/max inputs; effective set = intersection with shades that exist in file (optional: allow any integer in range and still skip missing).
  - **Reference group:** single-select (radio or select) among **selected families**.
  - **Standardize reference:** checkbox.
    - If on: **Chroma** sub-choice — **Average** / **Fixed** + number input for OKLCH `C`.
  - **Apply** button: validates, runs B then C, closes or shows toast on success.
  - Short hint text about gamut + hex output.

### HSLSliders popover

- Show computed **OKLCH** string (e.g. `oklch(0.85 0.04 95)` or `%` form per `formatCss`).
- Buttons: **Copy OKLCH**, **Download** (one-line or small `.css` snippet for that variable).

## File-level task list

| # | Task | Status |
|---|------|--------|
| 1 | Add `culori` dependency | done |
| 2 | Add `src/utils/oklchGamut.ts` — hex↔OKLCH + gamut-mapped hex | done |
| 3 | Add `src/utils/oklchHarmonize.ts` (+ `oklchFormat.ts`) | done |
| 4 | Extend `useColorStore` with `applyOklchHarmonize` | done |
| 5 | Add `OklchHarmonizePanel.tsx` + CSS | done |
| 6 | Wire popover + button in `ColorEditor.tsx` | done |
| 7 | Extend `HSLSliders.tsx` — OKLCH copy + snippet download | done |
| 8 | `culori` ambient types `src/types/culori.d.ts`; build + lint | done |

## Testing notes (manual)

- Load real `index.css`; pick yellow as reference, blue/green as others; shades 100–900; Apply — blues/greens should track yellow’s L/C per shade while staying visibly “blue”/“green”.
- Enable standardize reference with average C — reference ramp should show even OKLCH L steps.
- Pick extreme chroma; confirm no NaN hex and swatches stay valid sRGB.
- Confirm navbar export is still hex; single-token popover OKLCH copy matches displayed hex after harmonize.
