'use client';

import React, { useState, useCallback, useRef } from 'react';
import { useColorStore, SortMode } from '@/hooks/useColorStore';
import { getEditableTokens, getRgbaTokens, ParsedLine } from '@/utils/cssParser';
import type { HSL } from '@/utils/colorUtils';
import { hslToHex, clampHSL } from '@/utils/colorUtils';
import { applyOklchDeltaToHsl } from '@/utils/oklchGamut';
import {
  applyNormalizedChromaPercent,
  deriveMeanChromaPercent,
  formatTokenShortName,
  type RgbaHsl,
} from '@/utils/oklchChromaNormalize';
import ColorSwatch from './ColorSwatch';
import { tokenShowsGlobalSelectionHighlight } from '@/utils/selectionFilter';
import { useTokenUsageData, usageHeatForTotal } from '@/hooks/useTokenUsageData';
import styles from './SwatchGrid.module.css';

/** Group hex+rgba tokens by color family */
function groupAllByFamily(hexTokens: ParsedLine[], rgbaTokens: ParsedLine[]): Record<string, ParsedLine[]> {
  const allTokens = [...hexTokens, ...rgbaTokens];
  const groups: Record<string, ParsedLine[]> = {};

  for (const token of allTokens) {
    if (!token.tokenName) continue;
    const match = token.tokenName.match(/^--color-([\w]+)-\d/);
    const family = match ? match[1] : 'defaults';
    if (!groups[family]) groups[family] = [];
    groups[family].push(token);
  }
  return groups;
}

/** Sort tokens within a family */
function sortTokens(tokens: ParsedLine[], mode: SortMode): ParsedLine[] {
  return [...tokens].sort((a, b) => {
    const nameA = a.tokenName || '';
    const nameB = b.tokenName || '';

    // Extract numeric part and optional alpha suffix
    const parseNum = (n: string) => {
      // e.g. --color-blue-1000-16a -> base=1000, suffix='16a'
      const parts = n.match(/(\d+)(?:-([\d]+a))?(?:\s*$)/);
      if (!parts) return { base: 0, alphaSuffix: '', isRgba: false };
      return {
        base: parseInt(parts[1]),
        alphaSuffix: parts[2] || '',
        isRgba: !!parts[2],
      };
    };

    const pA = parseNum(nameA);
    const pB = parseNum(nameB);

    if (mode === 'hex-first') {
      // All hex tokens first (sorted by base num), then all rgba tokens (sorted by base num)
      if (pA.isRgba !== pB.isRgba) return pA.isRgba ? 1 : -1;
      if (pA.base !== pB.base) return pA.base - pB.base;
      return pA.alphaSuffix.localeCompare(pB.alphaSuffix);
    }

    // Interleaved: sort by base number, rgba after hex for same base
    if (pA.base !== pB.base) return pA.base - pB.base;
    if (pA.isRgba !== pB.isRgba) return pA.isRgba ? 1 : -1;
    return pA.alphaSuffix.localeCompare(pB.alphaSuffix);
  });
}

export default function SwatchGrid() {
  const originalLines = useColorStore(s => s.originalLines);
  const viewMode = useColorStore(s => s.viewMode);
  const sortMode = useColorStore(s => s.sortMode);
  const currentColors = useColorStore(s => s.currentColors);
  const currentRgbaColors = useColorStore(s => s.currentRgbaColors);

  const hexTokens = getEditableTokens(originalLines);
  const rgbaTokens = getRgbaTokens(originalLines);

  if (viewMode === 'list') {
    return <ListView hexTokens={hexTokens} rgbaTokens={rgbaTokens} currentColors={currentColors} currentRgbaColors={currentRgbaColors} sortMode={sortMode} />;
  }

  return <GroupedView hexTokens={hexTokens} rgbaTokens={rgbaTokens} sortMode={sortMode} />;
}

function GroupedView({ hexTokens, rgbaTokens, sortMode }: { hexTokens: ParsedLine[]; rgbaTokens: ParsedLine[]; sortMode: SortMode }) {
  const families = groupAllByFamily(hexTokens, rgbaTokens);

  return (
    <div className={styles.grouped}>
      {Object.entries(families).map(([family, familyTokens]) => (
        <FamilyGroup key={family} family={family} tokens={sortTokens(familyTokens, sortMode)} />
      ))}
    </div>
  );
}

type TuneBaseline = { hex: Record<string, HSL>; rgba: Record<string, RgbaHsl> };

function FamilyGroup({ family, tokens }: { family: string; tokens: ParsedLine[] }) {
  const tuneBaselineRef = useRef<TuneBaseline | null>(null);
  const [showTune, setShowTune] = useState(false);
  const [dh, setDh] = useState(0);
  const [ds, setDs] = useState(0);
  const [dl, setDl] = useState(0);
  const prevDelta = useRef({ h: 0, s: 0, l: 0 });
  const hasSnapped = useRef(false);

  const [okL, setOkL] = useState(0);
  const [okH, setOkH] = useState(0);
  const prevOkDelta = useRef({ l: 0, h: 0 });
  const hasSnappedOk = useRef(false);

  const [liveChromaPct, setLiveChromaPct] = useState(100);
  const hasSnappedChroma = useRef(false);
  const prevClippedCount = useRef(0);
  const [chromaClipSession, setChromaClipSession] = useState(0);
  const [chromaLimitLabels, setChromaLimitLabels] = useState<string[]>([]);
  const [chromaAtCapNow, setChromaAtCapNow] = useState(0);

  const isGroupToken = useCallback((name: string, isRgba: boolean) => {
    const locked = useColorStore.getState().lockedTokens;
    if (locked.has(name)) return false;
    return tokens.some(t => t.tokenName === name && (t.type === 'rgba') === isRgba);
  }, [tokens]);

  const captureTuneOpen = useCallback(() => {
    const { currentColors, currentRgbaColors, lockedTokens } = useColorStore.getState();
    const hex: Record<string, HSL> = {};
    const rgba: Record<string, RgbaHsl> = {};
    for (const t of tokens) {
      const n = t.tokenName!;
      if (lockedTokens.has(n)) continue;
      if (t.type === 'hex' && currentColors[n]) hex[n] = { ...currentColors[n] };
      else if (t.type === 'rgba' && currentRgbaColors[n]) rgba[n] = { ...currentRgbaColors[n] };
    }
    tuneBaselineRef.current = { hex, rgba };
    const pct = deriveMeanChromaPercent(currentColors, currentRgbaColors, isGroupToken);
    setLiveChromaPct(pct);
    prevClippedCount.current = 0;
    setChromaClipSession(0);
    setChromaLimitLabels([]);
    setChromaAtCapNow(0);
    hasSnappedChroma.current = false;
  }, [tokens, isGroupToken]);

  const handleLive = useCallback((ch: 'h' | 's' | 'l', value: number) => {
    if (!hasSnapped.current) {
      useColorStore.getState().pushSnapshot();
      hasSnapped.current = true;
    }

    const newH = ch === 'h' ? value : dh;
    const newS = ch === 's' ? value : ds;
    const newL = ch === 'l' ? value : dl;

    const deltaH = newH - prevDelta.current.h;
    const deltaS = newS - prevDelta.current.s;
    const deltaL = newL - prevDelta.current.l;

    if (deltaH !== 0 || deltaS !== 0 || deltaL !== 0) {
      // Apply incremental delta directly to this group
      const { currentColors, currentRgbaColors, lockedTokens } = useColorStore.getState();

      const nc: Record<string, { h: number; s: number; l: number }> = { ...currentColors };
      const nr: Record<string, { h: number; s: number; l: number; a: number }> = { ...currentRgbaColors };

      for (const t of tokens) {
        const name = t.tokenName!;
        if (lockedTokens.has(name)) continue;
        if (t.type === 'hex' && nc[name]) {
          nc[name] = clampHSL({ h: nc[name].h + deltaH, s: nc[name].s + deltaS, l: nc[name].l + deltaL });
        } else if (t.type === 'rgba' && nr[name]) {
          const c = clampHSL({ h: nr[name].h + deltaH, s: nr[name].s + deltaS, l: nr[name].l + deltaL });
          nr[name] = { ...c, a: nr[name].a };
        }
      }

      useColorStore.setState({ currentColors: nc, currentRgbaColors: nr });
    }

    prevDelta.current = { h: newH, s: newS, l: newL };
    if (ch === 'h') setDh(newH);
    if (ch === 's') setDs(newS);
    if (ch === 'l') setDl(newL);
  }, [dh, ds, dl, tokens]);

  const handleLiveOklch = useCallback((ch: 'l' | 'h', value: number) => {
    if (!hasSnappedOk.current) {
      useColorStore.getState().pushSnapshot();
      hasSnappedOk.current = true;
    }

    const newL = ch === 'l' ? value : okL;
    const newH = ch === 'h' ? value : okH;

    const dL = newL - prevOkDelta.current.l;
    const dH = newH - prevOkDelta.current.h;

    if (dL !== 0 || dH !== 0) {
      const { currentColors, currentRgbaColors, lockedTokens } = useColorStore.getState();
      const nc = { ...currentColors };
      const nr = { ...currentRgbaColors };

      for (const t of tokens) {
        const name = t.tokenName!;
        if (lockedTokens.has(name)) continue;
        if (t.type === 'hex' && nc[name]) {
          nc[name] = applyOklchDeltaToHsl(nc[name], dL, 0, dH);
        } else if (t.type === 'rgba' && nr[name]) {
          const c = applyOklchDeltaToHsl(nr[name], dL, 0, dH);
          nr[name] = { ...c, a: nr[name].a };
        }
      }

      useColorStore.setState({ currentColors: nc, currentRgbaColors: nr });
    }

    prevOkDelta.current = { l: newL, h: newH };
    if (ch === 'l') setOkL(newL);
    if (ch === 'h') setOkH(newH);
  }, [okL, okH, tokens]);

  const handleGroupChromaPercent = useCallback((value: number) => {
    if (!hasSnappedChroma.current) {
      useColorStore.getState().pushSnapshot();
      hasSnappedChroma.current = true;
    }
    const s = useColorStore.getState();
    const { nextColors, nextRgba, clippedTokens } = applyNormalizedChromaPercent(
      value,
      s.currentColors,
      s.currentRgbaColors,
      isGroupToken,
    );
    useColorStore.setState({ currentColors: nextColors, currentRgbaColors: nextRgba });
    setLiveChromaPct(value);
    const nClip = clippedTokens.length;
    if (nClip > prevClippedCount.current) {
      setChromaClipSession(c => c + (nClip - prevClippedCount.current));
    }
    prevClippedCount.current = nClip;
    setChromaLimitLabels(clippedTokens.slice(0, 4).map(formatTokenShortName));
    setChromaAtCapNow(nClip);
  }, [isGroupToken]);

  const handleMouseUp = useCallback(() => {
    const { currentColors, currentRgbaColors, lockedTokens, fileName } = useColorStore.getState();
    try {
      localStorage.setItem('token-editor-state', JSON.stringify({
        currentColors, currentRgbaColors, lockedTokens: Array.from(lockedTokens), fileName,
      }));
    } catch { /* ignore */ }
  }, []);

  const resetSliders = useCallback(() => {
    const b = tuneBaselineRef.current;
    if (b) {
      const { currentColors, currentRgbaColors } = useColorStore.getState();
      const nc = { ...currentColors };
      const nr = { ...currentRgbaColors };
      for (const [k, v] of Object.entries(b.hex)) nc[k] = { ...v };
      for (const [k, v] of Object.entries(b.rgba)) nr[k] = { ...v };
      useColorStore.setState({ currentColors: nc, currentRgbaColors: nr });
    }
    setDh(0); setDs(0); setDl(0);
    prevDelta.current = { h: 0, s: 0, l: 0 };
    hasSnapped.current = false;
    setOkL(0); setOkH(0);
    prevOkDelta.current = { l: 0, h: 0 };
    hasSnappedOk.current = false;

    const s = useColorStore.getState();
    const pct = deriveMeanChromaPercent(s.currentColors, s.currentRgbaColors, isGroupToken);
    setLiveChromaPct(pct);
    hasSnappedChroma.current = false;
    prevClippedCount.current = 0;
    setChromaClipSession(0);
    setChromaLimitLabels([]);
    setChromaAtCapNow(0);

    const { currentColors, currentRgbaColors, lockedTokens, fileName } = useColorStore.getState();
    try {
      localStorage.setItem('token-editor-state', JSON.stringify({
        currentColors, currentRgbaColors, lockedTokens: Array.from(lockedTokens), fileName,
      }));
    } catch { /* ignore */ }
  }, [isGroupToken]);

  return (
    <div className={styles.familyGroup}>
      <div className={styles.familyHeader}>
        <h3 className={styles.familyTitle}>{family}</h3>
        <button
          className={styles.groupHslBtn}
          onClick={() => {
            if (showTune) {
              setShowTune(false);
              return;
            }
            captureTuneOpen();
            setDh(0); setDs(0); setDl(0);
            prevDelta.current = { h: 0, s: 0, l: 0 };
            hasSnapped.current = false;
            setOkL(0); setOkH(0);
            prevOkDelta.current = { l: 0, h: 0 };
            hasSnappedOk.current = false;
            setShowTune(true);
          }}
          title="Adjust group colors (HSL and OKLCH)"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
          </svg>
          Tune
        </button>
      </div>

      {showTune && (
        <div className={styles.groupTunePanel}>
          <div className={styles.groupTuneCol}>
            <span className={styles.groupTuneTitle}>HSL Δ</span>
            {(['h', 's', 'l'] as const).map((ch) => {
              const val = ch === 'h' ? dh : ch === 's' ? ds : dl;
              const min = ch === 'h' ? -180 : -100;
              const max = ch === 'h' ? 180 : 100;
              return (
                <div key={ch} className={styles.groupSliderRow}>
                  <span className={styles.groupSliderLabel}>{ch.toUpperCase()}</span>
                  <input type="range" min={min} max={max} value={val}
                    onChange={(e) => handleLive(ch, parseInt(e.target.value))}
                    onMouseUp={handleMouseUp} onTouchEnd={handleMouseUp}
                    className={styles.groupSlider} />
                  <input type="number" min={min} max={max} value={val}
                    onChange={(e) => handleLive(ch, parseInt(e.target.value) || 0)}
                    onBlur={handleMouseUp}
                    className={styles.groupNum} />
                </div>
              );
            })}
          </div>
          <div className={styles.groupTuneCol}>
            <span className={styles.groupTuneTitle}>OKLCH</span>
            <div className={styles.groupSliderRow}>
              <span className={styles.groupSliderLabel}>C</span>
              <input type="range" min={0} max={100} value={liveChromaPct}
                onChange={(e) => handleGroupChromaPercent(parseInt(e.target.value))}
                onMouseUp={handleMouseUp} onTouchEnd={handleMouseUp}
                className={styles.groupSlider} />
              <input type="number" min={0} max={100} value={liveChromaPct}
                onChange={(e) => handleGroupChromaPercent(Math.max(0, Math.min(100, parseInt(e.target.value) || 0)))}
                onBlur={handleMouseUp}
                className={styles.groupNum} />
            </div>
            {(chromaAtCapNow > 0 || chromaClipSession > 0 || chromaLimitLabels.length > 0) && (
              <div className={styles.groupChromaLimits}>
                {chromaAtCapNow > 0 && <span className={styles.groupChromaRed}>{chromaAtCapNow}</span>}
                {chromaClipSession > 0 && <span className={styles.groupChromaRed}>+{chromaClipSession}</span>}
                {chromaLimitLabels.length > 0 && (
                  <span className={styles.groupChromaNames}>{chromaLimitLabels.join(', ')}{chromaLimitLabels.length >= 4 ? '…' : ''}</span>
                )}
              </div>
            )}
            <div className={styles.groupSliderRow}>
              <span className={styles.groupSliderLabel}>L</span>
              <input type="range" min={-100} max={100} value={okL}
                onChange={(e) => handleLiveOklch('l', parseInt(e.target.value))}
                onMouseUp={handleMouseUp} onTouchEnd={handleMouseUp}
                className={styles.groupSlider} />
              <input type="number" min={-100} max={100} value={okL}
                onChange={(e) => handleLiveOklch('l', parseInt(e.target.value) || 0)}
                onBlur={handleMouseUp}
                className={styles.groupNum} />
            </div>
            <div className={styles.groupSliderRow}>
              <span className={styles.groupSliderLabel}>H</span>
              <input type="range" min={-180} max={180} value={okH}
                onChange={(e) => handleLiveOklch('h', parseInt(e.target.value))}
                onMouseUp={handleMouseUp} onTouchEnd={handleMouseUp}
                className={styles.groupSlider} />
              <input type="number" min={-180} max={180} value={okH}
                onChange={(e) => handleLiveOklch('h', parseInt(e.target.value) || 0)}
                onBlur={handleMouseUp}
                className={styles.groupNum} />
            </div>
          </div>
          <button className={styles.groupResetBtn} onClick={resetSliders} title="Restore this group to when Tune opened">
            Reset
          </button>
        </div>
      )}

      <div className={styles.familySwatches}>
        {tokens.map(t => (
          <ColorSwatch key={t.id} tokenName={t.tokenName!} isRgba={t.type === 'rgba'} />
        ))}
      </div>
    </div>
  );
}

function ListColorCell({
  tokenName,
  isRgba,
  bgColor,
}: {
  tokenName: string;
  isRgba: boolean;
  bgColor: string;
}) {
  const inSelection = useColorStore((s) => {
    const f = s.globalHslSelectionFilter;
    const c = isRgba ? s.currentRgbaColors[tokenName] : s.currentColors[tokenName];
    if (!c) return false;
    return tokenShowsGlobalSelectionHighlight(tokenName, isRgba, c, f);
  });
  return (
    <div className={`${styles.listColor} ${inSelection ? styles.listColorSelection : ''}`} style={{ background: bgColor }} />
  );
}

function ListView({
  hexTokens, rgbaTokens, currentColors, currentRgbaColors, sortMode,
}: {
  hexTokens: ParsedLine[];
  rgbaTokens: ParsedLine[];
  currentColors: Record<string, { h: number; s: number; l: number }>;
  currentRgbaColors: Record<string, { h: number; s: number; l: number; a: number }>;
  sortMode: SortMode;
}) {
  const toggleLock = useColorStore(s => s.toggleLock);
  const lockedTokens = useColorStore(s => s.lockedTokens);
  const usageOverlayEnabled = useColorStore(s => s.usageOverlayEnabled);
  const { data: usageData } = useTokenUsageData();
  const allTokens = sortTokens([...hexTokens, ...rgbaTokens], sortMode);

  return (
    <div className={`${styles.list} ${usageOverlayEnabled ? styles.listUsageOn : ''}`}>
      <div className={styles.listHeader}>
        <span>Color</span>
        <span>Token Name</span>
        <span className={styles.listUsageHead}>Use</span>
        <span>HEX / RGBA</span>
        <span>HSL</span>
        <span>Lock</span>
      </div>
      {allTokens.map(t => {
        const name = t.tokenName!;
        const isRgba = t.type === 'rgba';
        const hsl = isRgba ? currentRgbaColors[name] : currentColors[name];
        if (!hsl) return null;
        const hex = hslToHex(hsl.h, hsl.s, hsl.l);
        const alpha = isRgba ? (hsl as unknown as { a: number }).a : 1;
        const c = hex.replace('#', '');
        const r = parseInt(c.substring(0, 2), 16);
        const g = parseInt(c.substring(2, 4), 16);
        const b = parseInt(c.substring(4, 6), 16);
        const bgColor = isRgba ? `rgba(${r}, ${g}, ${b}, ${alpha})` : hex;
        const isLocked = lockedTokens.has(name);
        const usageTotal = usageData?.primitives[name]?.total ?? 0;
        const heat =
          usageOverlayEnabled && usageData && usageTotal > 0
            ? usageHeatForTotal(usageData, usageTotal)
            : null;

        return (
          <div key={t.id} className={styles.listRow}>
            <div className={styles.listColorWrap}>
              <div className={styles.listCheckerboard} />
              <ListColorCell tokenName={name} isRgba={isRgba} bgColor={bgColor} />
            </div>
            <span className={styles.listName}>{name}</span>
            <span
              className={`${styles.listUsage} ${heat ? styles[`listUsage_${heat}`] : ''}`}
              title={
                !usageOverlayEnabled
                  ? undefined
                  : usageData?.primitives[name]?.fromStorybook != null
                    ? `${usageTotal} refs (impl + Storybook); counts var(--primary) etc. that resolve to this primitive`
                    : 'Token usage count'
              }
            >
              {usageOverlayEnabled
                ? usageData
                  ? usageTotal > 0
                    ? usageTotal
                    : ''
                  : '…'
                : '\u00a0'}
            </span>
            <span className={styles.listHex}>{isRgba ? `${hex} @ ${Math.round(alpha * 100)}%` : hex}</span>
            <span className={styles.listHsl}>{`${hsl.h}° ${hsl.s}% ${hsl.l}%`}</span>
            <button
              className={`${styles.listLockBtn} ${isLocked ? styles.listLocked : ''}`}
              onClick={() => toggleLock(name)}
            >
              {isLocked ? '🔒' : '🔓'}
            </button>
          </div>
        );
      })}
    </div>
  );
}
