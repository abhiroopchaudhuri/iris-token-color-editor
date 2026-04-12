# IRIS Token Color Editor — Design Reference

This document describes the **implemented** visual language and UI components in the `token-editor` Next.js app (IRIS). It replaces an earlier draft that described a purely photographic SpaceX marketing layout; the live product is a **browser-based CSS token editor** that **reuses** a compact dark “spectral / industrial” token set and extends it with tool-specific surfaces, accent colors, and monospace data typography.

## 1. Product & Screen Structure

- **Entry (`page.tsx`)**: After session restore, either **`UploadZone`** (no file loaded) or **`ColorEditor`** (file loaded).
- **`UploadZone`**: Centered hero (logo, title, subtitle), dashed drop zone, optional paste flow. Decorative **conic rainbow blur** and **panning grid** behind content.
- **`ColorEditor`**: Full-height column layout — **`GlobalControls`** (sticky), file/info bar, **`SwatchGrid`**, optional fixed **`HSLSliders`** drawer when a swatch is active. **Filter** and **OKLCH harmonize** open as **fixed-position portaled popovers** anchored to toolbar buttons. Drag-over-CSS shows a **blur overlay**.

## 2. Global Theme Tokens (`globals.css`)

CSS variables on `:root` define the default **dark** theme (comments in code call this “SpaceX Dark”):

| Token | Dark value | Role |
|--------|------------|------|
| `--bg` | `#000000` | Page background |
| `--surface-1`–`--surface-2` | `transparent` | Unused as solid fills in many places |
| `--surface-3` | `rgba(240, 240, 250, 0.05)` | Subtle fill |
| `--surface-4` | `rgba(240, 240, 250, 0.1)` | Hover / track surfaces (“ghost”) |
| `--text-primary` | `#f0f0fa` | Primary copy |
| `--text-secondary` | `rgba(240, 240, 250, 0.7)` | Secondary |
| `--text-tertiary` | `rgba(240, 240, 250, 0.5)` | Muted |
| `--border-color` | `rgba(240, 240, 250, 0.35)` | Default borders |
| `--border-subtle` | `rgba(240, 240, 250, 0.15)` | Dividers |
| `--accent` / `--accent-hover` | `0.1` / `0.2` spectral white | Ghost fills, slider thumbs |
| `--radius` | `0px` | Declared; components still use explicit radii |

**Light theme**: Adding class **`body.light-theme`** (done when the user picks a **light** background in **GlobalControls** so contrast flips) inverts the palette to white / near-black spectral tints (`rgba(0, 0, 10, …)`).

**Other globals**: Smooth scroll; thin **scrollbar** thumb; **`select`** extra end padding; **`::selection`** purple tint `rgba(111, 33, 228, 0.3)`; **`:focus-visible`** outline uses `var(--accent)`.

## 3. Typography

- **Default UI (`body`)**: `'D-DIN', 'D-DIN-Bold', Arial, Verdana, sans-serif` with **`text-transform: uppercase`** and **`letter-spacing: 0.96px`**. The repo does **not** ship `@font-face` for D-DIN in this app — browsers use **Arial/Verdana** unless D-DIN is installed locally.
- **Google Fonts** are imported in `globals.css` (Inter weight 300–700 and a bundle including **Orbitron**, Cormorant, etc.). **`GlobalControls`** uses **Orbitron** for the wordmark with a **silver gradient** clip.
- **Data / tokens**: **`JetBrains Mono`** is used across editors, swatch labels, numeric inputs, paste areas, and OKLCH UI. It is **not** added to the Google Fonts `@import` in `globals.css`; expect **system monospace** fallback unless the user has JetBrains Mono installed.
- **Exceptions**: **`UploadZone`** hero **title** uses **sentence case**, negative tracking (`-0.01em`), and **`text-transform: none`** to read as a product headline, not all-caps chrome.

## 4. Layout & Density

- **Spacing**: Mostly **rem**-based (`0.35rem`–`1.5rem` gaps, `1rem` swatch area padding). Sticky header uses **`backdrop-filter`** for depth.
- **Radius vocabulary** (implemented, not only `--radius`): **32px** pills for primary actions and toggles; **0px** for some panels, inputs, and drop zone; **12px** color swatches; **16px** popover shells; **6–10px** small controls in panels.
- **Elevation**: Unlike a flat photo site, the editor uses **blur**, **borders**, and **box-shadow** on popovers, sliders, hover swatches, and active toggles.

## 5. Component Inventory & Styling Notes

| Component | Responsibility | Notable styling |
|-----------|----------------|-----------------|
| **`UploadZone`** | Load CSS via drop, click, or paste | Animated conic background + grid; dashed border dropzone; purple hover shadow (`rgba(111, 33, 228, …)`); pill **Paste** / **Cancel** / **Load** |
| **`GlobalControls`** | Logo, view/sort, BG picker, global HSL, undo/redo, reset, copy, export | Sticky bar `rgba(0,0,0,0.5)` + blur; segmented **32px** view buttons; **green** active state for **Global HSL**; **coral** reset family; **mono** global numeric inputs **sharp** corners |
| **`ColorEditor`** | Orchestrates grid, drawer, popovers, drag replace | Info bar with **mono** filename; **Usage** row = pill + **hidden checkbox** + mini **toggle** (green when on); **Filter Rules** green active ring; **OKLCH harmonize** **purple** active; **Storybook** link gradient pink/purple + **pulse** live dot; **New file** coral outline |
| **`SwatchGrid`** | Grouped or list + interleaved / hex-first sort | Uppercase family headers; optional **per-group HSL** compact panel (`8px` radius); list mode uses mono token names |
| **`ColorSwatch`** | Single token tile | **72×72**, **12px** radius, checkerboard for alpha; hover scale + shadow; **selection** white outline; **locked** hatch overlay |
| **`HSLSliders`** | Per-token editor | **Fixed right** `300px` drawer, dark glass, **slide-in** animation; checkerboard preview; mono labels/values |
| **`SelectionFilterPanel`** | Advanced HSL selection rules | Glass panel `16px` radius inside popover; uppercase section labels |
| **`OklchHarmonizePanel`** | OKLCH harmonize workflow | Same popover pattern; mono for code-like strings; mode buttons and export row |

**Storybook**: Toolbar link to **`mds-storybook/`** (static preview) with external Storybook symbol image.

## 6. Semantic Accent Colors (beyond CSS variables)

Used consistently in modules:

- **Success / active filter / usage on**: greens e.g. `rgba(34, 197, 94, …)`, `#27b933` (live dot, copied state).
- **OKLCH / purple tooling**: `rgba(168, 85, 247, …)`, violet shadows on harmonize toggle.
- **Destructive / reset / clear**: coral `#f56b4f` / `#ff8c73` (reset buttons, New file, some hovers).
- **Storybook / “live”**: pink gradient `#f472b6`, `#fbcfe8`.
- **Purple UX highlights** (upload hover, selection): `rgba(111, 33, 228, …)` aligned with selection highlight.

## 7. Interaction Patterns

- **Session**: Zustand store + **`localStorage`** (`token-editor-state`, usage overlay flag).
- **Popovers**: `createPortal` to `document.body`, position from button `getBoundingClientRect`, max height from **visual viewport**, scroll contained inside **`popoverScroll`**.
- **Global HSL**: Live incremental deltas with undo snapshot on drag start; persists on slider **mouseup** / **touchend**.
- **Drag-and-drop**: Replace file from editor surface; overlay with dashed `var(--accent)` border and blur.

## 8. Responsive & Accessibility Notes

- Controls **`flex-wrap`** on narrow widths; popover **`max-width: calc(100vw - 1.5rem)`**.
- Icon-only buttons rely on **`title`**; some switches pair **visually hidden** `<input>` with custom UI — maintain label + focus styles when changing markup.
- **`prefers-reduced-motion`**: Not globally handled; consider when extending animations.

## 9. Agent Prompt Guide (for this codebase)

**Quick tokens**

- Background: `var(--bg)` / `#000000` default  
- Text: `var(--text-primary)` `#f0f0fa`  
- Borders: `var(--border-color)`  
- Ghost control fill: `var(--surface-4)` / `var(--accent)`  
- Active filter: green `rgba(34, 197, 94, 0.45)` borders + light glow  
- Harmonize active: purple `rgba(168, 85, 247, 0.5)`  
- Mono strings: `font-family: 'JetBrains Mono', monospace`

**Example prompts**

- “Add a toolbar control: **32px** pill, `1px solid var(--border-color)`, transparent background, `0.8rem` medium weight text, hover `var(--surface-4)`, icon + label like existing **Filter Rules**.”
- “Add a settings row in **`GlobalControls`**: use **`globalRow`** / **`globalLabel`** spacing; numeric field **`JetBrains Mono`**, sharp border, `var(--border-color)`.”
- “Add a popover panel: fixed position, **`border-radius: 16px`**, `backdrop-filter: blur(24px)`, border `rgba(255,255,255,0.1)`, shadow from **`.popoverAnchor`** in **`ColorEditor.module.css`**, scroll child with **`min-height: 0`** and **`overflow-y: auto`**.”

**Iteration checklist**

1. Prefer **`var(--text-*)`**, **`var(--border-*)`**, **`var(--surface-*)`** for theme compatibility with **`body.light-theme`**.  
2. Keep **toolbar** height and **sticky** behavior in mind (`GlobalControls`).  
3. Reserve **green** for “active / success / global scope”, **purple** for OKLCH-specific affordances, **coral** for destructive reset.  
4. Token names and hex/rgb copy → **monospace**; chrome labels → **uppercase D-DIN stack** unless deliberately human-readable (hero titles).  
5. New overlays: follow **portal + layout** pattern in **`ColorEditor`** to avoid clipping by scroll parents.
