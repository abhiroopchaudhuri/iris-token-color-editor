'use client';

import { create } from 'zustand';
import { ParsedLine, parseCssTokens, getEditableTokens, getRgbaTokens } from '@/utils/cssParser';
import { HSL, hexToHsl, clampHSL, parseRgba, rgbToHsl, hslToHex, hslToRgb } from '@/utils/colorUtils';
import {
  GlobalHslSelectionFilter,
  computeGlobalHslFrozenKeys,
  defaultGlobalHslSelectionFilter,
  globalHslSelectionHasConstraints,
  globalHslSelectionRestrictsGlobal,
  globalSelectionTokenKey,
  newSelectionRuleId,
  type SelectionRule,
} from '@/utils/selectionFilter';

export type ViewMode = 'grouped' | 'list';
export type SortMode = 'hex-first' | 'interleaved';

interface RgbaHSL extends HSL {
  a: number;
}

interface Snapshot {
  colors: Record<string, HSL>;
  rgbaColors: Record<string, RgbaHSL>;
}

interface ColorStore {
  originalLines: ParsedLine[];
  originalColors: Record<string, HSL>;
  originalRgbaColors: Record<string, RgbaHSL>;
  currentColors: Record<string, HSL>;
  currentRgbaColors: Record<string, RgbaHSL>;
  lockedTokens: Set<string>;
  activeToken: { name: string; isRgba: boolean } | null;
  undoStack: Snapshot[];
  redoStack: Snapshot[];
  viewMode: ViewMode;
  sortMode: SortMode;
  isLoaded: boolean;
  fileName: string;

  loadCss: (css: string, fileName?: string) => void;
  updateColor: (tokenName: string, hsl: HSL) => void;
  updateRgbaColor: (tokenName: string, hsl: RgbaHSL) => void;
  applyGlobalDelta: (dh: number, ds: number, dl: number) => void;
  applyGroupDelta: (family: string, dh: number, ds: number, dl: number) => void;
  toggleLock: (tokenName: string) => void;
  undo: () => void;
  redo: () => void;
  resetAll: () => void;
  resetGroup: (family: string) => void;
  restoreSession: () => boolean;
  setViewMode: (mode: ViewMode) => void;
  setSortMode: (mode: SortMode) => void;
  setActiveToken: (token: { name: string; isRgba: boolean } | null) => void;
  pushSnapshot: () => void;

  globalHslSelectionFilter: GlobalHslSelectionFilter;
  /** Snapshot tokens matching current rules; global HSL then only affects this set until Re-apply or Reset. */
  commitGlobalHslSelectionScope: () => void;
  toggleGlobalHslSelectionFamily: (family: string) => void;
  setGlobalHslSelectionFamiliesAny: () => void;
  toggleGlobalHslSelectionShade: (shade: number) => void;
  addGlobalHslSelectionRule: (rule: Omit<SelectionRule, 'id'> & { id?: string }) => void;
  removeGlobalHslSelectionRule: (id: string) => void;
  clearGlobalHslSelectionFilter: () => void;
  applyIncrementalGlobalHslDelta: (dh: number, ds: number, dl: number) => void;
}

const STORAGE_KEY = 'token-editor-state';

function saveToStorage(state: {
  currentColors: Record<string, HSL>;
  currentRgbaColors: Record<string, RgbaHSL>;
  lockedTokens: Set<string>;
  fileName: string;
}) {
  try {
    const fullState = useColorStore.getState();
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      originalLines: fullState ? fullState.originalLines : [],
      originalColors: fullState ? fullState.originalColors : {},
      originalRgbaColors: fullState ? fullState.originalRgbaColors : {},
      currentColors: state.currentColors,
      currentRgbaColors: state.currentRgbaColors,
      lockedTokens: Array.from(state.lockedTokens),
      fileName: state.fileName,
    }));
  } catch { /* ignore */ }
  broadcastColors(state.currentColors, state.currentRgbaColors);
}

// --- Live Sync via BroadcastChannel + postMessage ---
let _channel: BroadcastChannel | null = null;
function getChannel(): BroadcastChannel | null {
  if (typeof window === 'undefined') return null;
  if (!_channel) {
    try { _channel = new BroadcastChannel('token-editor-live'); } catch { /* ignore */ }
  }
  return _channel;
}

function broadcastColors(
  colors: Record<string, HSL>,
  rgbaColors: Record<string, RgbaHSL>,
) {
  const vars: Record<string, string> = {};
  for (const [name, hsl] of Object.entries(colors)) {
    vars[name] = hslToHex(hsl.h, hsl.s, hsl.l);
  }
  for (const [name, hsl] of Object.entries(rgbaColors)) {
    const { r, g, b } = hslToRgb(hsl.h, hsl.s, hsl.l);
    vars[name] = `rgba(${r}, ${g}, ${b}, ${hsl.a})`;
  }

  const msg = { type: 'token-update', vars };

  // BroadcastChannel (same-origin tabs)
  try { getChannel()?.postMessage(msg); } catch { /* ignore */ }

  // postMessage to all iframes (for embedded storybook)
  try {
    const iframes = document.querySelectorAll('iframe');
    iframes.forEach(iframe => {
      iframe.contentWindow?.postMessage(msg, '*');
    });
  } catch { /* ignore */ }
}

function loadFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed.originalLines || parsed.originalLines.length === 0) return null;
    return {
      originalLines: parsed.originalLines,
      originalColors: parsed.originalColors,
      originalRgbaColors: parsed.originalRgbaColors,
      currentColors: parsed.currentColors || {},
      currentRgbaColors: parsed.currentRgbaColors || {},
      lockedTokens: new Set(parsed.lockedTokens || []),
      fileName: parsed.fileName || '',
    };
  } catch {
    return null;
  }
}

function belongsToFamily(tokenName: string, family: string): boolean {
  if (family === 'defaults') {
    // tokens like --color-white, --color-black, --shadow-X
    const match = tokenName.match(/^--color-([\w]+)-\d/);
    return !match;
  }
  return tokenName.startsWith(`--color-${family}-`);
}

export const useColorStore = create<ColorStore>((set, get) => ({
  originalLines: [],
  originalColors: {},
  originalRgbaColors: {},
  currentColors: {},
  currentRgbaColors: {},
  lockedTokens: new Set(),
  activeToken: null,
  undoStack: [],
  redoStack: [],
  viewMode: 'grouped',
  sortMode: 'interleaved',
  isLoaded: false,
  fileName: '',
  globalHslSelectionFilter: defaultGlobalHslSelectionFilter(),

  loadCss: (css: string, fileName: string = 'index.css') => {
    const lines = parseCssTokens(css);
    const hexTokens = getEditableTokens(lines);
    const rgbaTokens = getRgbaTokens(lines);

    const originalColors: Record<string, HSL> = {};
    for (const t of hexTokens) {
      if (t.tokenName && t.value) {
        originalColors[t.tokenName] = hexToHsl(t.value);
      }
    }

    const originalRgbaColors: Record<string, RgbaHSL> = {};
    for (const t of rgbaTokens) {
      if (t.tokenName && t.value) {
        const rgba = parseRgba(t.value);
        if (rgba) {
          const hsl = rgbToHsl(rgba.r, rgba.g, rgba.b);
          originalRgbaColors[t.tokenName] = { ...hsl, a: rgba.a };
        }
      }
    }

    const saved = loadFromStorage();
    let currentColors = { ...originalColors };
    let currentRgbaColors = { ...originalRgbaColors };
    let lockedTokens = new Set<string>();

    if (saved && saved.fileName === fileName) {
      for (const key of Object.keys(saved.currentColors)) {
        if (originalColors[key]) currentColors[key] = saved.currentColors[key];
      }
      for (const key of Object.keys(saved.currentRgbaColors)) {
        if (originalRgbaColors[key]) currentRgbaColors[key] = saved.currentRgbaColors[key];
      }
      lockedTokens = saved.lockedTokens as Set<string>;
    }

    set({
      originalLines: lines, originalColors, originalRgbaColors,
      currentColors, currentRgbaColors, lockedTokens,
      undoStack: [], redoStack: [], isLoaded: true, fileName,
      globalHslSelectionFilter: defaultGlobalHslSelectionFilter(),
    });
    saveToStorage({ currentColors, currentRgbaColors, lockedTokens, fileName });
  },

  pushSnapshot: () => {
    const { currentColors, currentRgbaColors, undoStack } = get();
    set({
      undoStack: [...undoStack, { colors: { ...currentColors }, rgbaColors: { ...currentRgbaColors } }],
      redoStack: [],
    });
  },

  updateColor: (tokenName: string, hsl: HSL) => {
    get().pushSnapshot();
    const currentColors = { ...get().currentColors, [tokenName]: clampHSL(hsl) };
    set({ currentColors });
    saveToStorage({ currentColors, currentRgbaColors: get().currentRgbaColors, lockedTokens: get().lockedTokens, fileName: get().fileName });
  },

  updateRgbaColor: (tokenName: string, hsl: RgbaHSL) => {
    get().pushSnapshot();
    const clamped = clampHSL(hsl);
    const currentRgbaColors = { ...get().currentRgbaColors, [tokenName]: { ...clamped, a: hsl.a } };
    set({ currentRgbaColors });
    saveToStorage({ currentColors: get().currentColors, currentRgbaColors, lockedTokens: get().lockedTokens, fileName: get().fileName });
  },

  applyGlobalDelta: (dh: number, ds: number, dl: number) => {
    get().pushSnapshot();
    get().applyIncrementalGlobalHslDelta(dh, ds, dl);
    const { currentColors, currentRgbaColors, lockedTokens, fileName } = get();
    saveToStorage({ currentColors, currentRgbaColors, lockedTokens, fileName });
  },

  /** Live global HSL during drag — does not persist (GlobalControls saves on pointer up). */
  applyIncrementalGlobalHslDelta: (dh: number, ds: number, dl: number) => {
    const { currentColors, currentRgbaColors, lockedTokens, globalHslSelectionFilter } = get();
    const frozen = globalHslSelectionFilter.globalHslFrozenTokenKeys;
    const restrict = globalHslSelectionRestrictsGlobal(globalHslSelectionFilter);

    const shouldShift = (name: string, isRgba: boolean): boolean => {
      if (lockedTokens.has(name)) return false;
      if (!restrict || !frozen) return true;
      return frozen.includes(globalSelectionTokenKey(name, isRgba));
    };

    const newColors: Record<string, HSL> = {};
    for (const [name, hsl] of Object.entries(currentColors)) {
      newColors[name] = shouldShift(name, false)
        ? clampHSL({ h: hsl.h + dh, s: hsl.s + ds, l: hsl.l + dl })
        : hsl;
    }

    const newRgbaColors: Record<string, RgbaHSL> = {};
    for (const [name, hsl] of Object.entries(currentRgbaColors)) {
      if (!shouldShift(name, true)) {
        newRgbaColors[name] = hsl;
      } else {
        const c = clampHSL({ h: hsl.h + dh, s: hsl.s + ds, l: hsl.l + dl });
        newRgbaColors[name] = { ...c, a: hsl.a };
      }
    }

    set({ currentColors: newColors, currentRgbaColors: newRgbaColors });
  },

  commitGlobalHslSelectionScope: () => {
    const { currentColors, currentRgbaColors, globalHslSelectionFilter } = get();
    const f = globalHslSelectionFilter;
    if (!globalHslSelectionHasConstraints(f)) {
      set(s => ({
        globalHslSelectionFilter: { ...s.globalHslSelectionFilter, globalHslFrozenTokenKeys: null },
      }));
      return;
    }
    const keys = computeGlobalHslFrozenKeys(currentColors, currentRgbaColors, f);
    set(s => ({
      globalHslSelectionFilter: { ...s.globalHslSelectionFilter, globalHslFrozenTokenKeys: keys },
    }));
  },

  toggleGlobalHslSelectionFamily: (family: string) => {
    set(s => {
      const f = s.globalHslSelectionFilter;
      let families: string[] | null;
      if (f.families === null) {
        families = [family];
      } else if (f.families.includes(family)) {
        const next = f.families.filter(x => x !== family);
        families = next.length === 0 ? null : next;
      } else {
        families = [...f.families, family].sort((a, b) => a.localeCompare(b));
      }
      const nextFilter = { ...f, families };
      if (!globalHslSelectionHasConstraints(nextFilter)) nextFilter.globalHslFrozenTokenKeys = null;
      return { globalHslSelectionFilter: nextFilter };
    });
  },

  setGlobalHslSelectionFamiliesAny: () => {
    set(s => {
      const f = { ...s.globalHslSelectionFilter, families: null };
      if (!globalHslSelectionHasConstraints(f)) f.globalHslFrozenTokenKeys = null;
      return { globalHslSelectionFilter: f };
    });
  },

  toggleGlobalHslSelectionShade: (shade: number) => {
    set(s => {
      const f = s.globalHslSelectionFilter;
      const has = f.shadeIn.includes(shade);
      const shadeIn = has
        ? f.shadeIn.filter(x => x !== shade)
        : [...f.shadeIn, shade].sort((a, b) => a - b);
      const nextFilter = { ...f, shadeIn };
      if (!globalHslSelectionHasConstraints(nextFilter)) nextFilter.globalHslFrozenTokenKeys = null;
      return { globalHslSelectionFilter: nextFilter };
    });
  },

  addGlobalHslSelectionRule: (partial: Omit<SelectionRule, 'id'> & { id?: string }) => {
    const rule: SelectionRule = { ...partial, id: partial.id ?? newSelectionRuleId() };
    set(s => {
      const nextFilter = {
        ...s.globalHslSelectionFilter,
        rules: [...s.globalHslSelectionFilter.rules, rule],
      };
      if (!globalHslSelectionHasConstraints(nextFilter)) nextFilter.globalHslFrozenTokenKeys = null;
      return { globalHslSelectionFilter: nextFilter };
    });
  },

  removeGlobalHslSelectionRule: (id: string) => {
    set(s => {
      const nextFilter = {
        ...s.globalHslSelectionFilter,
        rules: s.globalHslSelectionFilter.rules.filter(r => r.id !== id),
      };
      if (!globalHslSelectionHasConstraints(nextFilter)) nextFilter.globalHslFrozenTokenKeys = null;
      return { globalHslSelectionFilter: nextFilter };
    });
  },

  clearGlobalHslSelectionFilter: () => {
    set({ globalHslSelectionFilter: defaultGlobalHslSelectionFilter() });
  },

  applyGroupDelta: (family: string, dh: number, ds: number, dl: number) => {
    get().pushSnapshot();
    const { currentColors, currentRgbaColors, lockedTokens } = get();

    const newColors: Record<string, HSL> = {};
    for (const [name, hsl] of Object.entries(currentColors)) {
      if (!lockedTokens.has(name) && belongsToFamily(name, family)) {
        newColors[name] = clampHSL({ h: hsl.h + dh, s: hsl.s + ds, l: hsl.l + dl });
      } else {
        newColors[name] = hsl;
      }
    }

    const newRgbaColors: Record<string, RgbaHSL> = {};
    for (const [name, hsl] of Object.entries(currentRgbaColors)) {
      if (!lockedTokens.has(name) && belongsToFamily(name, family)) {
        const c = clampHSL({ h: hsl.h + dh, s: hsl.s + ds, l: hsl.l + dl });
        newRgbaColors[name] = { ...c, a: hsl.a };
      } else {
        newRgbaColors[name] = hsl;
      }
    }

    set({ currentColors: newColors, currentRgbaColors: newRgbaColors });
    saveToStorage({ currentColors: newColors, currentRgbaColors: newRgbaColors, lockedTokens, fileName: get().fileName });
  },

  resetGroup: (family: string) => {
    get().pushSnapshot();
    const { currentColors, currentRgbaColors, originalColors, originalRgbaColors, lockedTokens } = get();

    const newColors: Record<string, HSL> = { ...currentColors };
    for (const name of Object.keys(currentColors)) {
      if (!lockedTokens.has(name) && belongsToFamily(name, family) && originalColors[name]) {
        newColors[name] = originalColors[name];
      }
    }

    const newRgbaColors: Record<string, RgbaHSL> = { ...currentRgbaColors };
    for (const name of Object.keys(currentRgbaColors)) {
      if (!lockedTokens.has(name) && belongsToFamily(name, family) && originalRgbaColors[name]) {
        newRgbaColors[name] = originalRgbaColors[name];
      }
    }

    set({ currentColors: newColors, currentRgbaColors: newRgbaColors });
    saveToStorage({ currentColors: newColors, currentRgbaColors: newRgbaColors, lockedTokens, fileName: get().fileName });
  },

  toggleLock: (tokenName: string) => {
    const lockedTokens = new Set(get().lockedTokens);
    if (lockedTokens.has(tokenName)) lockedTokens.delete(tokenName);
    else lockedTokens.add(tokenName);
    set({ lockedTokens });
    saveToStorage({ currentColors: get().currentColors, currentRgbaColors: get().currentRgbaColors, lockedTokens, fileName: get().fileName });
  },

  restoreSession: () => {
    const saved = loadFromStorage();
    if (saved) {
      set({
        originalLines: saved.originalLines,
        originalColors: saved.originalColors,
        originalRgbaColors: saved.originalRgbaColors,
        currentColors: saved.currentColors,
        currentRgbaColors: saved.currentRgbaColors,
        lockedTokens: saved.lockedTokens as Set<string>,
        fileName: saved.fileName,
        isLoaded: true,
      });
      return true;
    }
    return false;
  },

  undo: () => {
    const { undoStack, currentColors, currentRgbaColors } = get();
    if (undoStack.length === 0) return;
    const prev = undoStack[undoStack.length - 1];
    set({
      currentColors: prev.colors, currentRgbaColors: prev.rgbaColors,
      undoStack: undoStack.slice(0, -1),
      redoStack: [...get().redoStack, { colors: currentColors, rgbaColors: currentRgbaColors }],
    });
    saveToStorage({ currentColors: prev.colors, currentRgbaColors: prev.rgbaColors, lockedTokens: get().lockedTokens, fileName: get().fileName });
  },

  redo: () => {
    const { redoStack, currentColors, currentRgbaColors } = get();
    if (redoStack.length === 0) return;
    const next = redoStack[redoStack.length - 1];
    set({
      currentColors: next.colors, currentRgbaColors: next.rgbaColors,
      redoStack: redoStack.slice(0, -1),
      undoStack: [...get().undoStack, { colors: currentColors, rgbaColors: currentRgbaColors }],
    });
    saveToStorage({ currentColors: next.colors, currentRgbaColors: next.rgbaColors, lockedTokens: get().lockedTokens, fileName: get().fileName });
  },

  resetAll: () => {
    get().pushSnapshot();
    const { originalColors, originalRgbaColors } = get();
    set({ currentColors: { ...originalColors }, currentRgbaColors: { ...originalRgbaColors }, lockedTokens: new Set() });
    saveToStorage({ currentColors: originalColors, currentRgbaColors: originalRgbaColors, lockedTokens: new Set(), fileName: get().fileName });
  },

  setViewMode: (mode: ViewMode) => set({ viewMode: mode }),
  setSortMode: (mode: SortMode) => set({ sortMode: mode }),
  setActiveToken: (token) => set({ activeToken: token }),
}));

// Auto-broadcast on every color state change (covers live slider updates)
if (typeof window !== 'undefined') {
  let prevColors = useColorStore.getState().currentColors;
  let prevRgba = useColorStore.getState().currentRgbaColors;
  useColorStore.subscribe((state) => {
    if (state.currentColors !== prevColors || state.currentRgbaColors !== prevRgba) {
      prevColors = state.currentColors;
      prevRgba = state.currentRgbaColors;
      broadcastColors(state.currentColors, state.currentRgbaColors);
    }
  });
}
