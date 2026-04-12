'use client';

import React, { useState, useCallback, useRef, useEffect, useMemo, useId } from 'react';
import { useColorStore, ViewMode, SortMode } from '@/hooks/useColorStore';
import { serializeCss, downloadCssFile } from '@/utils/cssSerializer';
import { globalHslSelectionRestrictsGlobal } from '@/utils/selectionFilter';
import { getContrastColor } from '@/utils/colorUtils';
import {
  applyNormalizedChromaPercent,
  deriveMeanChromaPercent,
  formatTokenShortName,
} from '@/utils/oklchChromaNormalize';
import {
  applyStoredContrastLocksToPalette,
  captureContrastLocksForGlobalShift,
  resolveRefBgHex,
} from '@/utils/globalContrastLock';
import { withChromaSatExemptFiltered } from '@/utils/chromaSatExemptTokens';
import styles from './GlobalControls.module.css';

type ColorSnapshot = {
  colors: Record<string, { h: number; s: number; l: number }>;
  rgbaColors: Record<string, { h: number; s: number; l: number; a: number }>;
};

type ContrastRefTokenRow = {
  name: string;
  hsl: { h: number; s: number; l: number };
  isRgba: boolean;
  alpha: number;
};

export default function GlobalControls() {
  const undoStack = useColorStore(s => s.undoStack);
  const redoStack = useColorStore(s => s.redoStack);
  const undo = useColorStore(s => s.undo);
  const redo = useColorStore(s => s.redo);
  const resetAll = useColorStore(s => s.resetAll);

  const viewMode = useColorStore(s => s.viewMode);
  const sortMode = useColorStore(s => s.sortMode);
  const setSortMode = useColorStore(s => s.setSortMode);
  const setViewMode = useColorStore(s => s.setViewMode);
  const originalLines = useColorStore(s => s.originalLines);
  const currentColors = useColorStore(s => s.currentColors);
  const currentRgbaColors = useColorStore(s => s.currentRgbaColors);
  const fileName = useColorStore(s => s.fileName);
  const globalHslSelectionFilter = useColorStore(s => s.globalHslSelectionFilter);
  const applyIncrementalGlobalHslDelta = useColorStore(s => s.applyIncrementalGlobalHslDelta);
  const applyIncrementalGlobalOklchDelta = useColorStore(s => s.applyIncrementalGlobalOklchDelta);
  const [showGlobal, setShowGlobal] = useState(false);
  const [copied, setCopied] = useState(false);

  const panelBaselineRef = useRef<ColorSnapshot | null>(null);
  const [openedChromaPct, setOpenedChromaPct] = useState(100);

  // Track cumulative deltas for live global adjustment
  const [liveH, setLiveH] = useState(0);
  const [liveS, setLiveS] = useState(0);
  const [liveL, setLiveL] = useState(0);
  const prevDelta = useRef({ h: 0, s: 0, l: 0 });
  const hasSnapshotted = useRef(false);

  const [liveOkL, setLiveOkL] = useState(0);
  const [liveOkH, setLiveOkH] = useState(0);
  const prevOklchDelta = useRef({ l: 0, h: 0 });
  const hasSnapshottedOklch = useRef(false);

  const [liveChromaPct, setLiveChromaPct] = useState(100);
  const hasSnapshottedChroma = useRef(false);
  const prevClippedCount = useRef(0);
  const [chromaClipSession, setChromaClipSession] = useState(0);
  const [chromaLimitLabels, setChromaLimitLabels] = useState<string[]>([]);
  const [chromaAtCapNow, setChromaAtCapNow] = useState(0);

  const [contrastLockGlobal, setContrastLockGlobal] = useState(false);
  const [contrastRefToken, setContrastRefToken] = useState('--color-white');
  const lockedRatiosRef = useRef<Record<string, number> | null>(null);

  // Background color state
  const [bgColor, setBgColor] = useState<string | null>(null);

  const reapplyGlobalContrastLocks = useCallback(() => {
    if (!contrastLockGlobal) return;
    const ratios = lockedRatiosRef.current;
    if (!ratios || Object.keys(ratios).length === 0) return;
    const s = useColorStore.getState();
    const refBg = resolveRefBgHex(s.currentColors, contrastRefToken, s.currentRgbaColors);
    const pred = s.tokenIncludedInGlobalShift;
    const out = applyStoredContrastLocksToPalette(
      s.currentColors,
      s.currentRgbaColors,
      ratios,
      refBg,
      pred,
    );
    useColorStore.setState(out);
  }, [contrastLockGlobal, contrastRefToken]);

  const updateGlobalContrastLock = useCallback(
    (enabled: boolean) => {
      if (!enabled) {
        lockedRatiosRef.current = null;
        setContrastLockGlobal(false);
        return;
      }
      const s = useColorStore.getState();
      const refBg = resolveRefBgHex(s.currentColors, contrastRefToken, s.currentRgbaColors);
      const pred = s.tokenIncludedInGlobalShift;
      lockedRatiosRef.current = captureContrastLocksForGlobalShift(
        s.currentColors,
        s.currentRgbaColors,
        pred,
        refBg,
      );
      setContrastLockGlobal(true);
    },
    [contrastRefToken],
  );

  useEffect(() => {
    if (!showGlobal) return;
    const s = useColorStore.getState();
    panelBaselineRef.current = {
      colors: structuredClone(s.currentColors),
      rgbaColors: structuredClone(s.currentRgbaColors),
    };
    const pred = (name: string, isRgba: boolean) => s.tokenIncludedInGlobalShift(name, isRgba);
    const pct = deriveMeanChromaPercent(
      s.currentColors,
      s.currentRgbaColors,
      withChromaSatExemptFiltered(pred),
    );
    setOpenedChromaPct(pct);
    setLiveChromaPct(pct);
    prevClippedCount.current = 0;
    setChromaClipSession(0);
    setChromaLimitLabels([]);
    setChromaAtCapNow(0);
    hasSnapshottedChroma.current = false;
  }, [showGlobal]);

  /** Re-snapshot per-token ratios when the reference token changes, or when the panel opens with lock on. */
  useEffect(() => {
    if (!contrastLockGlobal || !showGlobal) return;
    const s = useColorStore.getState();
    const refBg = resolveRefBgHex(s.currentColors, contrastRefToken, s.currentRgbaColors);
    const pred = s.tokenIncludedInGlobalShift;
    lockedRatiosRef.current = captureContrastLocksForGlobalShift(
      s.currentColors,
      s.currentRgbaColors,
      pred,
      refBg,
    );
  }, [contrastRefToken, contrastLockGlobal, showGlobal]);

  const handleLiveChange = useCallback((channel: 'h' | 's' | 'l', value: number) => {
    if (contrastLockGlobal && channel === 'l') return;

    // Push undo snapshot once at the start of a drag session
    if (!hasSnapshotted.current) {
      useColorStore.getState().pushSnapshot();
      hasSnapshotted.current = true;
    }

    const newH = channel === 'h' ? value : liveH;
    const newS = channel === 's' ? value : liveS;
    const newL = channel === 'l' ? value : liveL;

    // Compute incremental delta from previous
    const dh = newH - prevDelta.current.h;
    const ds = newS - prevDelta.current.s;
    const dl = newL - prevDelta.current.l;

    if (dh !== 0 || ds !== 0 || dl !== 0) {
      applyIncrementalGlobalHslDelta(dh, ds, dl);
      if (contrastLockGlobal) reapplyGlobalContrastLocks();
    }

    prevDelta.current = { h: newH, s: newS, l: newL };
    if (channel === 'h') setLiveH(newH);
    if (channel === 's') setLiveS(newS);
    if (channel === 'l') setLiveL(newL);
  }, [liveH, liveS, liveL, applyIncrementalGlobalHslDelta, contrastLockGlobal, reapplyGlobalContrastLocks]);

  const handleLiveOklchChange = useCallback((channel: 'l' | 'h', value: number) => {
    if (contrastLockGlobal && channel === 'l') return;

    if (!hasSnapshottedOklch.current) {
      useColorStore.getState().pushSnapshot();
      hasSnapshottedOklch.current = true;
    }

    const newL = channel === 'l' ? value : liveOkL;
    const newH = channel === 'h' ? value : liveOkH;

    const dL = newL - prevOklchDelta.current.l;
    const dH = newH - prevOklchDelta.current.h;

    if (dL !== 0 || dH !== 0) {
      applyIncrementalGlobalOklchDelta(dL, 0, dH);
      if (contrastLockGlobal) reapplyGlobalContrastLocks();
    }

    prevOklchDelta.current = { l: newL, h: newH };
    if (channel === 'l') setLiveOkL(newL);
    if (channel === 'h') setLiveOkH(newH);
  }, [liveOkL, liveOkH, applyIncrementalGlobalOklchDelta, contrastLockGlobal, reapplyGlobalContrastLocks]);

  const persistSession = useCallback(() => {
    const { currentColors, currentRgbaColors, lockedTokens, fileName } = useColorStore.getState();
    try {
      localStorage.setItem('token-editor-state', JSON.stringify({
        currentColors, currentRgbaColors, lockedTokens: Array.from(lockedTokens), fileName,
      }));
    } catch { /* ignore */ }
  }, []);

  const handleChromaPercentChange = useCallback((value: number) => {
    if (!hasSnapshottedChroma.current) {
      useColorStore.getState().pushSnapshot();
      hasSnapshottedChroma.current = true;
    }
    const s = useColorStore.getState();
    const pred = (name: string, isRgba: boolean) => s.tokenIncludedInGlobalShift(name, isRgba);
    const { nextColors, nextRgba, clippedTokens } = applyNormalizedChromaPercent(
      value,
      s.currentColors,
      s.currentRgbaColors,
      withChromaSatExemptFiltered(pred),
    );
    useColorStore.setState({ currentColors: nextColors, currentRgbaColors: nextRgba });
    setLiveChromaPct(value);

    if (contrastLockGlobal) reapplyGlobalContrastLocks();

    const nClip = clippedTokens.length;
    if (nClip > prevClippedCount.current) {
      setChromaClipSession(c => c + (nClip - prevClippedCount.current));
    }
    prevClippedCount.current = nClip;
    setChromaLimitLabels(clippedTokens.slice(0, 6).map(formatTokenShortName));
    setChromaAtCapNow(nClip);
  }, [contrastLockGlobal, reapplyGlobalContrastLocks]);

  const handleSliderMouseUp = useCallback(() => {
    persistSession();
  }, [persistSession]);

  /**
   * @param applyPanelBaselineColors true = popover "Reset sliders": restore colors from when the panel opened.
   *   false = after full document reset: keep store as-is and re-snapshot baseline from current colors (do not re-apply stale panel-open colors).
   */
  const resetGlobalPanelState = useCallback((applyPanelBaselineColors: boolean) => {
    if (applyPanelBaselineColors) {
      const b = panelBaselineRef.current;
      if (b) {
        useColorStore.setState({
          currentColors: structuredClone(b.colors),
          currentRgbaColors: structuredClone(b.rgbaColors),
        });
      }
    } else {
      const s = useColorStore.getState();
      panelBaselineRef.current = {
        colors: structuredClone(s.currentColors),
        rgbaColors: structuredClone(s.currentRgbaColors),
      };
    }

    setLiveH(0);
    setLiveS(0);
    setLiveL(0);
    prevDelta.current = { h: 0, s: 0, l: 0 };
    hasSnapshotted.current = false;
    setLiveOkL(0);
    setLiveOkH(0);
    prevOklchDelta.current = { l: 0, h: 0 };
    hasSnapshottedOklch.current = false;

    const s = useColorStore.getState();
    const pred = (name: string, isRgba: boolean) => useColorStore.getState().tokenIncludedInGlobalShift(name, isRgba);
    const pct = deriveMeanChromaPercent(
      s.currentColors,
      s.currentRgbaColors,
      withChromaSatExemptFiltered(pred),
    );
    setOpenedChromaPct(pct);
    setLiveChromaPct(pct);
    hasSnapshottedChroma.current = false;
    prevClippedCount.current = 0;
    setChromaClipSession(0);
    setChromaLimitLabels([]);
    setChromaAtCapNow(0);

    lockedRatiosRef.current = null;
    setContrastLockGlobal(false);

    persistSession();
  }, [persistSession]);

  const resetGlobalSliders = useCallback(() => {
    resetGlobalPanelState(true);
  }, [resetGlobalPanelState]);

  const handleExport = useCallback(() => {
    const css = serializeCss(originalLines, currentColors, currentRgbaColors);
    downloadCssFile(css, fileName);
  }, [originalLines, currentColors, currentRgbaColors, fileName]);

  const handleCopy = useCallback(async () => {
    const css = serializeCss(originalLines, currentColors, currentRgbaColors);
    try {
      await navigator.clipboard.writeText(css);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
      const ta = document.createElement('textarea');
      ta.value = css;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [originalLines, currentColors, currentRgbaColors]);

  const handleResetAll = useCallback(() => {
    resetAll();
    // Must not call resetGlobalSliders here: that reapplies panelBaselineRef from the last time the
    // global panel opened, undoing resetAll's restore to original uploaded/pasted colors.
    resetGlobalPanelState(false);
  }, [resetAll, resetGlobalPanelState]);

  const selectionRestrictsGlobal = globalHslSelectionRestrictsGlobal(globalHslSelectionFilter);

  const [refTokenMenuOpen, setRefTokenMenuOpen] = useState(false);
  const refTokenPickerWrapRef = useRef<HTMLDivElement>(null);
  const refPickerBaseId = useId();
  const refTokenListboxId = `${refPickerBaseId}-contrast-ref-list`;
  const refTokenTriggerId = `${refPickerBaseId}-contrast-ref-trigger`;

  const refTokenRows = useMemo((): ContrastRefTokenRow[] => {
    const keys = Array.from(new Set([...Object.keys(currentColors), ...Object.keys(currentRgbaColors)])).sort();
    const rows: ContrastRefTokenRow[] = [];
    for (const name of keys) {
      const fromHex = currentColors[name];
      const fromRgba = currentRgbaColors[name];
      const hsl = fromHex ?? fromRgba;
      if (!hsl) continue;
      const isRgba = !fromHex && !!fromRgba;
      const alpha = fromRgba != null ? Number(fromRgba.a) : 1;
      rows.push({ name, hsl: { h: hsl.h, s: hsl.s, l: hsl.l }, isRgba, alpha });
    }
    return rows;
  }, [currentColors, currentRgbaColors]);

  const activeRefHsl = useMemo(
    () => currentColors[contrastRefToken] ?? currentRgbaColors[contrastRefToken] ?? { h: 0, s: 0, l: 100 },
    [currentColors, currentRgbaColors, contrastRefToken],
  );
  const activeRefAlpha: number =
    'a' in activeRefHsl && typeof (activeRefHsl as { a?: unknown }).a === 'number'
      ? (activeRefHsl as { a: number }).a
      : 1;

  useEffect(() => {
    if (!refTokenMenuOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      const el = refTokenPickerWrapRef.current;
      if (el && !el.contains(e.target as Node)) setRefTokenMenuOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setRefTokenMenuOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [refTokenMenuOpen]);

  useEffect(() => {
    if (!showGlobal) setRefTokenMenuOpen(false);
  }, [showGlobal]);

  const viewModes: { key: ViewMode; label: string; icon: string }[] = [
    { key: 'grouped', label: 'Grouped', icon: '▦' },
    { key: 'list', label: 'List', icon: '☷' },
  ];

  return (
    <div className={styles.controls}>
      <div className={styles.topRow}>
        <div className={styles.logoWrap}>
          <img src="iris-logo.png" alt="IRIS Logo" width={36} height={36} style={{ marginRight: '0.6rem', objectFit: 'contain' }} />
          <span className={styles.logo}>IRIS</span>
        </div>

        <div className={styles.actions}>
          <div className={styles.viewModes}>
            {viewModes.map(vm => (
              <button
                key={vm.key}
                className={`${styles.viewBtn} ${viewMode === vm.key ? styles.active : ''}`}
                onClick={() => setViewMode(vm.key)}
                title={vm.label}
              >
                <span className={styles.viewIcon}>{vm.icon}</span>
                <span className={styles.viewLabel}>{vm.label}</span>
              </button>
            ))}
          </div>

          <div className={styles.viewModes}>
            <button
              className={`${styles.viewBtn} ${sortMode === 'interleaved' ? styles.active : ''}`}
              onClick={() => setSortMode('interleaved')}
              title="Interleaved: rgba after matching hex (blue-1000 → blue-1000-16a → blue-1100)"
            >
              <span className={styles.viewLabel}>Interleaved</span>
            </button>
            <button
              className={`${styles.viewBtn} ${sortMode === 'hex-first' ? styles.active : ''}`}
              onClick={() => setSortMode('hex-first')}
              title="Hex First: all hex colors, then all rgba colors"
            >
              <span className={styles.viewLabel}>Hex First</span>
            </button>
          </div>

          {/* Background color picker */}
          <div className={styles.bgColorWrap}>
            <label className={styles.bgLabel} title="Change background color">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="18" height="18" rx="3" />
                <path d="M3 9h18" />
              </svg>
              BG
              <input
                type="color"
                value={bgColor || '#0a0a0f'}
                onChange={(e) => {
                  const val = e.target.value;
                  setBgColor(val);
                  document.body.style.background = val;
                  if (getContrastColor(val) === '#000000') {
                    document.body.classList.add('light-theme');
                  } else {
                    document.body.classList.remove('light-theme');
                  }
                }}
                className={styles.colorPicker}
              />
            </label>
            {bgColor && (
              <button
                className={styles.bgResetBtn}
                onClick={() => {
                  setBgColor(null);
                  document.body.style.background = '';
                  document.body.classList.remove('light-theme');
                }}
                title="Reset background"
              >
                ×
              </button>
            )}
          </div>

          <button
            className={`${styles.globalToggle} ${(liveH !== 0 || liveS !== 0 || liveL !== 0 || liveOkL !== 0 || liveOkH !== 0 || Math.abs(liveChromaPct - openedChromaPct) > 0.5 || contrastLockGlobal) ? styles.globalActive : ''}`}
            onClick={() => setShowGlobal(!showGlobal)}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z" />
            </svg>
            Global HSL / OKLCH
          </button>

          <button
            className={styles.iconBtn}
            onClick={undo}
            disabled={undoStack.length === 0}
            title="Undo"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="1 4 1 10 7 10" />
              <path d="M3.51 15a9 9 0 102.13-9.36L1 10" />
            </svg>
          </button>

          <button
            className={styles.iconBtn}
            onClick={redo}
            disabled={redoStack.length === 0}
            title="Redo"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ transform: 'scaleX(-1)' }}>
              <polyline points="1 4 1 10 7 10" />
              <path d="M3.51 15a9 9 0 102.13-9.36L1 10" />
            </svg>
          </button>

          <button
            className={styles.resetBtn}
            onClick={handleResetAll}
            title="Reset All"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
              <path d="M3 3v5h5" />
            </svg>
            Reset
          </button>

          <button
            className={`${styles.copyBtn} ${copied ? styles.copied : ''}`}
            onClick={handleCopy}
            title="Copy CSS to clipboard"
          >
            {copied ? (
              <>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                Copied!
              </>
            ) : (
              <>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="9" y="9" width="13" height="13" rx="2" />
                  <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                </svg>
                Copy CSS
              </>
            )}
          </button>

          <button className={styles.exportBtn} onClick={handleExport}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            Export CSS
          </button>
        </div>
      </div>

      {showGlobal && (
        <div className={styles.globalPanel}>
          <div className={styles.globalTitle}>
            Global color adjustment
            <span className={styles.globalHint}>
              {contrastLockGlobal
                ? 'Contrast lock on — each in-scope token keeps its WCAG ratio vs the reference; global HSL/OKLCH lightness sliders are disabled while hue/sat/chroma still drive edits (per-token lightness is solved after each step).'
                : selectionRestrictsGlobal
                  ? 'Live — HSL and OKLCH affect only the fixed ringed set (unlocked); Re-apply in Filter Rules to refresh rings'
                  : 'Live — HSL and OKLCH shift all unlocked colors (hex values update). Use Filters to scope.'}
            </span>
          </div>

          <div className={styles.globalContrastLock}>
            <label className={styles.globalContrastLockLabel}>
              <input
                type="checkbox"
                checked={contrastLockGlobal}
                onChange={e => updateGlobalContrastLock(e.target.checked)}
              />
              Lock WCAG contrast per token
            </label>
            <span className={styles.globalContrastLockVs}>vs</span>
            <div className={styles.contrastRefPicker} ref={refTokenPickerWrapRef}>
              <button
                type="button"
                id={refTokenTriggerId}
                className={styles.contrastRefTrigger}
                aria-haspopup="listbox"
                aria-expanded={refTokenMenuOpen}
                aria-controls={refTokenListboxId}
                onClick={() => setRefTokenMenuOpen(o => !o)}
              >
                <span
                  className={styles.contrastRefSwatch}
                  style={
                    activeRefAlpha < 1
                      ? {
                          background: `hsla(${activeRefHsl.h}, ${activeRefHsl.s}%, ${activeRefHsl.l}%, ${activeRefAlpha})`,
                        }
                      : { background: `hsl(${activeRefHsl.h}, ${activeRefHsl.s}%, ${activeRefHsl.l}%)` }
                  }
                  aria-hidden
                />
                <span className={styles.contrastRefTokenText} title={contrastRefToken}>
                  {contrastRefToken.replace(/^--color-/, '')}
                </span>
                <svg className={styles.contrastRefChevron} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </button>
              {refTokenMenuOpen && (
                <div
                  id={refTokenListboxId}
                  role="listbox"
                  aria-labelledby={refTokenTriggerId}
                  className={styles.contrastRefMenu}
                >
                  {!refTokenRows.some(r => r.name === contrastRefToken) && (
                    <div
                      role="option"
                      aria-selected={true}
                      className={`${styles.contrastRefOption} ${styles.contrastRefOptionSelected}`}
                      onClick={() => setRefTokenMenuOpen(false)}
                    >
                      <span className={styles.contrastRefSwatch} style={{ background: '#3a3a45' }} aria-hidden />
                      <span className={styles.contrastRefTokenText} title={contrastRefToken}>{contrastRefToken}</span>
                    </div>
                  )}
                  {refTokenRows.map(row => {
                    const selected = row.name === contrastRefToken;
                    const swatchBg =
                      row.alpha < 1
                        ? `hsla(${row.hsl.h}, ${row.hsl.s}%, ${row.hsl.l}%, ${row.alpha})`
                        : `hsl(${row.hsl.h}, ${row.hsl.s}%, ${row.hsl.l}%)`;
                    return (
                      <div
                        key={row.name}
                        role="option"
                        aria-selected={selected}
                        className={`${styles.contrastRefOption} ${selected ? styles.contrastRefOptionSelected : ''}`}
                        onClick={() => {
                          setContrastRefToken(row.name);
                          setRefTokenMenuOpen(false);
                        }}
                      >
                        <span className={styles.contrastRefSwatch} style={{ background: swatchBg }} aria-hidden />
                        <span className={styles.contrastRefTokenText} title={row.name}>
                          {row.name.replace(/^--color-/, '')}
                          {row.isRgba && <span className={styles.contrastRefRgbaTag}>rgba</span>}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <div className={styles.globalColumns}>
            <div className={styles.globalColumn}>
              <div className={styles.globalColumnTitle}>HSL (additive)</div>
              <div className={styles.globalSliders}>
                <div className={styles.globalRow}>
                  <label className={styles.globalLabel}>Hue</label>
                  <input
                    type="range"
                    min={-180}
                    max={180}
                    value={liveH}
                    onChange={(e) => handleLiveChange('h', parseInt(e.target.value))}
                    onMouseUp={handleSliderMouseUp}
                    onTouchEnd={handleSliderMouseUp}
                    className={styles.globalSlider}
                  />
                  <input
                    type="number"
                    min={-180}
                    max={180}
                    value={liveH}
                    onChange={(e) => handleLiveChange('h', parseInt(e.target.value) || 0)}
                    onBlur={handleSliderMouseUp}
                    className={styles.globalNum}
                  />
                </div>

                <div className={styles.globalRow}>
                  <label className={styles.globalLabel}>Saturation</label>
                  <input
                    type="range"
                    min={-100}
                    max={100}
                    value={liveS}
                    onChange={(e) => handleLiveChange('s', parseInt(e.target.value))}
                    onMouseUp={handleSliderMouseUp}
                    onTouchEnd={handleSliderMouseUp}
                    className={styles.globalSlider}
                  />
                  <input
                    type="number"
                    min={-100}
                    max={100}
                    value={liveS}
                    onChange={(e) => handleLiveChange('s', parseInt(e.target.value) || 0)}
                    onBlur={handleSliderMouseUp}
                    className={styles.globalNum}
                  />
                </div>

                <div className={styles.globalRow}>
                  <label className={styles.globalLabel}>Lightness</label>
                  <input
                    type="range"
                    min={-100}
                    max={100}
                    value={liveL}
                    onChange={(e) => handleLiveChange('l', parseInt(e.target.value))}
                    onMouseUp={handleSliderMouseUp}
                    onTouchEnd={handleSliderMouseUp}
                    className={styles.globalSlider}
                    disabled={contrastLockGlobal}
                  />
                  <input
                    type="number"
                    min={-100}
                    max={100}
                    value={liveL}
                    onChange={(e) => handleLiveChange('l', parseInt(e.target.value) || 0)}
                    onBlur={handleSliderMouseUp}
                    className={styles.globalNum}
                    disabled={contrastLockGlobal}
                  />
                </div>
              </div>
            </div>

            <div className={styles.globalColumnSep} aria-hidden />

            <div className={styles.globalColumn}>
              <div className={styles.globalColumnTitle}>OKLCH</div>
              <div className={styles.globalSliders}>
                <div className={styles.globalRow}>
                  <label className={styles.globalLabel}>Chroma</label>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={liveChromaPct}
                    onChange={(e) => handleChromaPercentChange(parseInt(e.target.value))}
                    onMouseUp={handleSliderMouseUp}
                    onTouchEnd={handleSliderMouseUp}
                    className={styles.globalSlider}
                  />
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={liveChromaPct}
                    onChange={(e) => handleChromaPercentChange(Math.max(0, Math.min(100, parseInt(e.target.value) || 0)))}
                    onBlur={handleSliderMouseUp}
                    className={styles.globalNum}
                  />
                </div>
                <div className={styles.globalChromaMeta}>
                  <span className={styles.globalSubHintInline}>
                    0 = all grey · 100 = max vivid per shade (sRGB)
                  </span>
                  {(chromaAtCapNow > 0 || chromaClipSession > 0 || chromaLimitLabels.length > 0) && (
                    <span className={styles.globalChromaLimits}>
                      {chromaAtCapNow > 0 && (
                        <span className={styles.globalChromaAtCap} title="Tokens at gamut chroma ceiling right now">
                          {chromaAtCapNow}
                        </span>
                      )}
                      {chromaClipSession > 0 && (
                        <span className={styles.globalChromaClipCount} title="How many additional tokens reached the ceiling since you started dragging (increases as more hit)">
                          +{chromaClipSession}
                        </span>
                      )}
                      {chromaLimitLabels.length > 0 && (
                        <span className={styles.globalChromaNames}>{chromaLimitLabels.join(', ')}{chromaLimitLabels.length >= 6 ? '…' : ''}</span>
                      )}
                    </span>
                  )}
                </div>

                <div className={styles.globalRow}>
                  <label className={styles.globalLabel}>Lightness</label>
                  <input
                    type="range"
                    min={-100}
                    max={100}
                    value={liveOkL}
                    onChange={(e) => handleLiveOklchChange('l', parseInt(e.target.value))}
                    onMouseUp={handleSliderMouseUp}
                    onTouchEnd={handleSliderMouseUp}
                    className={styles.globalSlider}
                    disabled={contrastLockGlobal}
                  />
                  <input
                    type="number"
                    min={-100}
                    max={100}
                    value={liveOkL}
                    onChange={(e) => handleLiveOklchChange('l', parseInt(e.target.value) || 0)}
                    onBlur={handleSliderMouseUp}
                    className={styles.globalNum}
                    disabled={contrastLockGlobal}
                  />
                </div>
                <div className={styles.globalSubHint}>ΔL additive (% on 0–100 scale)</div>

                <div className={styles.globalRow}>
                  <label className={styles.globalLabel}>Hue</label>
                  <input
                    type="range"
                    min={-180}
                    max={180}
                    value={liveOkH}
                    onChange={(e) => handleLiveOklchChange('h', parseInt(e.target.value))}
                    onMouseUp={handleSliderMouseUp}
                    onTouchEnd={handleSliderMouseUp}
                    className={styles.globalSlider}
                  />
                  <input
                    type="number"
                    min={-180}
                    max={180}
                    value={liveOkH}
                    onChange={(e) => handleLiveOklchChange('h', parseInt(e.target.value) || 0)}
                    onBlur={handleSliderMouseUp}
                    className={styles.globalNum}
                  />
                </div>
                <div className={styles.globalSubHint}>Δhue in degrees (wraps per color)</div>
              </div>
            </div>
          </div>

          <button className={styles.resetSlidersBtn} onClick={resetGlobalSliders}>
            Reset sliders (restore colors from when panel opened)
          </button>
        </div>
      )}
    </div>
  );
}
