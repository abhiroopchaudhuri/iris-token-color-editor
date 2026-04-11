'use client';

import React, { useState, useCallback, useRef } from 'react';
import { useColorStore, SortMode } from '@/hooks/useColorStore';
import { getEditableTokens, getRgbaTokens, ParsedLine } from '@/utils/cssParser';
import { hslToHex, clampHSL } from '@/utils/colorUtils';
import ColorSwatch from './ColorSwatch';
import { globalHslSelectionHasConstraints, tokenMatchesGlobalHslSelection } from '@/utils/selectionFilter';
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

function FamilyGroup({ family, tokens }: { family: string; tokens: ParsedLine[] }) {
  const [showHSL, setShowHSL] = useState(false);
  const [dh, setDh] = useState(0);
  const [ds, setDs] = useState(0);
  const [dl, setDl] = useState(0);
  const prevDelta = useRef({ h: 0, s: 0, l: 0 });
  const hasSnapped = useRef(false);
  const applyGroupDelta = useColorStore(s => s.applyGroupDelta);

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

  const handleMouseUp = useCallback(() => {
    const { currentColors, currentRgbaColors, lockedTokens, fileName } = useColorStore.getState();
    try {
      localStorage.setItem('token-editor-state', JSON.stringify({
        currentColors, currentRgbaColors, lockedTokens: Array.from(lockedTokens), fileName,
      }));
    } catch { /* ignore */ }
  }, []);

  const resetSliders = useCallback(() => {
    useColorStore.getState().resetGroup(family);
    setDh(0); setDs(0); setDl(0);
    prevDelta.current = { h: 0, s: 0, l: 0 };
    hasSnapped.current = false;
  }, [family]);

  return (
    <div className={styles.familyGroup}>
      <div className={styles.familyHeader}>
        <h3 className={styles.familyTitle}>{family}</h3>
        <button className={styles.groupHslBtn} onClick={() => setShowHSL(!showHSL)} title="Adjust group HSL">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
          </svg>
          HSL
        </button>
      </div>

      {showHSL && (
        <div className={styles.groupHslPanel}>
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
          <button className={styles.groupResetBtn} onClick={resetSliders}>Reset</button>
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
    if (!c || !f.active || !globalHslSelectionHasConstraints(f)) return false;
    return tokenMatchesGlobalHslSelection(tokenName, isRgba, c, f);
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
  const allTokens = sortTokens([...hexTokens, ...rgbaTokens], sortMode);

  return (
    <div className={styles.list}>
      <div className={styles.listHeader}>
        <span>Color</span>
        <span>Token Name</span>
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

        return (
          <div key={t.id} className={styles.listRow}>
            <div className={styles.listColorWrap}>
              <div className={styles.listCheckerboard} />
              <ListColorCell tokenName={name} isRgba={isRgba} bgColor={bgColor} />
            </div>
            <span className={styles.listName}>{name}</span>
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
