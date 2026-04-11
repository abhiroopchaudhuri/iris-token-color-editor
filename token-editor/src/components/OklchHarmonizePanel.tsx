'use client';

import React, { useMemo, useState } from 'react';
import { useColorStore } from '@/hooks/useColorStore';
import type { ParsedLine } from '@/utils/cssParser';
import { collectFamiliesAndShadesFromLines } from '@/utils/selectionFilter';
import {
  downloadCssFile,
  oklchVariantFileName,
  serializeCssWithOklchForTokens,
} from '@/utils/cssSerializer';
import filterStyles from './SelectionFilterPanel.module.css';
import styles from './OklchHarmonizePanel.module.css';

function initFromLines(lines: ParsedLine[]) {
  const { families, shades } = collectFamiliesAndShadesFromLines(lines);
  return {
    selectedFamilies: [...families],
    referenceFamily: families[0] ?? '',
    shadeMulti: [] as number[],
    shadeMin: shades.length ? String(shades[0]) : '',
    shadeMax: shades.length ? String(shades[shades.length - 1]) : '',
  };
}

interface OklchHarmonizePanelProps {
  onClose?: () => void;
}

export default function OklchHarmonizePanel({ onClose }: OklchHarmonizePanelProps) {
  const originalLines = useColorStore(s => s.originalLines);
  const currentColors = useColorStore(s => s.currentColors);
  const currentRgbaColors = useColorStore(s => s.currentRgbaColors);
  const fileName = useColorStore(s => s.fileName);
  const oklchHarmonizeExportTokenKeys = useColorStore(s => s.oklchHarmonizeExportTokenKeys);
  const applyOklchHarmonize = useColorStore(s => s.applyOklchHarmonize);

  const { families: allFamilies, shades: allShades } = useMemo(
    () => collectFamiliesAndShadesFromLines(originalLines),
    [originalLines],
  );

  const [selectedFamilies, setSelectedFamilies] = useState<string[]>(() =>
    initFromLines(originalLines).selectedFamilies,
  );
  const [referenceFamily, setReferenceFamily] = useState(() => initFromLines(originalLines).referenceFamily);
  const [shadeMode, setShadeMode] = useState<'multi' | 'range'>('multi');
  const [shadeMulti, setShadeMulti] = useState<number[]>(() => initFromLines(originalLines).shadeMulti);
  const [shadeMin, setShadeMin] = useState(() => initFromLines(originalLines).shadeMin);
  const [shadeMax, setShadeMax] = useState(() => initFromLines(originalLines).shadeMax);
  const [standardizeReference, setStandardizeReference] = useState(false);
  const [chromaMode, setChromaMode] = useState<'average' | 'fixed'>('average');
  const [chromaFixed, setChromaFixed] = useState('0.08');
  const [message, setMessage] = useState<string | null>(null);

  const effectiveReference =
    selectedFamilies.includes(referenceFamily) ? referenceFamily : (selectedFamilies[0] ?? '');

  const toggleFamily = (fam: string) => {
    setSelectedFamilies((prev) => {
      if (prev.includes(fam)) {
        const next = prev.filter((x) => x !== fam);
        return next.length === 0 ? prev : next;
      }
      return [...prev, fam].sort((a, b) => a.localeCompare(b));
    });
  };

  const selectAllFamilies = () => {
    setSelectedFamilies([...allFamilies]);
    setReferenceFamily((r) => (allFamilies.includes(r) ? r : allFamilies[0] ?? ''));
  };

  const deselectAllFamilies = () => {
    setSelectedFamilies([]);
  };

  const toggleShade = (shade: number) => {
    setShadeMulti((prev) =>
      prev.includes(shade) ? prev.filter((x) => x !== shade) : [...prev, shade].sort((a, b) => a - b),
    );
  };

  const selectAllShades = () => setShadeMulti([...allShades]);

  const getFamilyColor = (fam: string) => {
    const bgKey = `--color-${fam}-1000`;
    const borderKey = `--color-${fam}-400`;
    const fallbackBg = { h: 0, s: 0, l: 15 };
    const fallbackBorder = { h: 0, s: 0, l: 50 };
    const bg = currentColors[bgKey] || currentColors[`--color-${fam}-900`] || currentColors[`--color-${fam}-1100`] || fallbackBg;
    const border = currentColors[borderKey] || currentColors[`--color-${fam}-300`] || fallbackBorder;
    return {
      backgroundColor: `hsl(${Math.round(bg.h)}, ${Math.round(bg.s)}%, ${Math.round(bg.l)}%)`,
      borderColor: `hsl(${Math.round(border.h)}, ${Math.round(border.s)}%, ${Math.round(border.l)}%)`,
    };
  };

  const handleApply = () => {
    setMessage(null);
    const min = parseInt(shadeMin, 10);
    const max = parseInt(shadeMax, 10);
    const chromaVal = parseFloat(chromaFixed);
    const result = applyOklchHarmonize({
      families: selectedFamilies,
      referenceFamily: effectiveReference,
      shadeMode,
      shadeMulti,
      shadeMin: Number.isNaN(min) ? 0 : min,
      shadeMax: Number.isNaN(max) ? 0 : max,
      standardizeReference,
      referenceChromaMode: chromaMode,
      referenceChromaFixed: chromaMode === 'fixed' ? chromaVal : undefined,
    });
    if (!result.ok) {
      setMessage(result.message);
      return;
    }
    setMessage(`Updated ${Object.keys(result.updates).length} token(s). Undo with toolbar ↩.`);
  };

  const handleExportOklchCss = () => {
    if (oklchHarmonizeExportTokenKeys.length === 0) return;
    const keys = new Set(oklchHarmonizeExportTokenKeys);
    const css = serializeCssWithOklchForTokens(originalLines, currentColors, currentRgbaColors, keys);
    downloadCssFile(css, oklchVariantFileName(fileName || 'index.css'));
  };

  const canApply =
    selectedFamilies.length > 0 &&
    effectiveReference &&
    (shadeMode === 'range' || shadeMulti.length > 0);

  return (
    <div className={filterStyles.panel}>
      <div className={filterStyles.head}>
        <div className={filterStyles.headLeft}>
          <span className={filterStyles.title}>OKLCH harmonize</span>
        </div>
        {onClose && (
          <button type="button" className={filterStyles.closeBtn} onClick={onClose} aria-label="Close" title="Close">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      <p className={filterStyles.hint}>
        Pick groups and shades, choose a reference family, then apply. Non-reference swatches keep their hue; lightness
        and chroma match the reference at the same shade step. Neutral ramps (gray/grey/white/black) only adopt reference
        lightness; their chroma stays put. Out-of-gamut OKLCH is mapped to sRGB automatically (culori{' '}
        <code className={styles.code}>toGamut</code>). Swatches and export use hex.
      </p>

      <div>
        <div className={styles.groupsLabelRow}>
          <span className={styles.groupsSectionTitle}>Groups (OR)</span>
          <button
            type="button"
            className={styles.deselectAllLink}
            onClick={deselectAllFamilies}
            disabled={selectedFamilies.length === 0}
          >
            Deselect all
          </button>
        </div>
        <div className={filterStyles.row}>
          <button type="button" className={filterStyles.chip} onClick={selectAllFamilies} title="Select every group">
            All groups
          </button>
          {allFamilies.map((fam) => {
            const picked = selectedFamilies.includes(fam);
            const dimmed = selectedFamilies.length > 0 && !picked;
            return (
              <button
                key={fam}
                type="button"
                className={`${filterStyles.chip} ${picked ? filterStyles.dynamicChip : ''} ${dimmed ? filterStyles.chipMuted : ''}`}
                onClick={() => toggleFamily(fam)}
                style={picked ? getFamilyColor(fam) : undefined}
              >
                {fam}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <div className={filterStyles.rowLabel}>Shade steps</div>
        <div className={styles.modeRow}>
          <button
            type="button"
            className={`${styles.modeBtn} ${shadeMode === 'multi' ? styles.modeBtnOn : ''}`}
            onClick={() => setShadeMode('multi')}
          >
            Multi-select
          </button>
          <button
            type="button"
            className={`${styles.modeBtn} ${shadeMode === 'range' ? styles.modeBtnOn : ''}`}
            onClick={() => setShadeMode('range')}
          >
            Range
          </button>
        </div>
        {shadeMode === 'multi' ? (
          <div className={filterStyles.row}>
            <button type="button" className={filterStyles.chip} onClick={selectAllShades}>
              All steps
            </button>
            {allShades.map((s) => (
              <button
                key={s}
                type="button"
                className={`${filterStyles.chip} ${shadeMulti.includes(s) ? filterStyles.chipActive : filterStyles.chipMuted}`}
                onClick={() => toggleShade(s)}
              >
                {s}
              </button>
            ))}
          </div>
        ) : (
          <div className={styles.rangeRow}>
            <label className={styles.rangeLabel}>
              Min
              <input
                type="number"
                value={shadeMin}
                onChange={(e) => setShadeMin(e.target.value)}
                className={styles.rangeInput}
              />
            </label>
            <span className={styles.rangeDash}>–</span>
            <label className={styles.rangeLabel}>
              Max
              <input
                type="number"
                value={shadeMax}
                onChange={(e) => setShadeMax(e.target.value)}
                className={styles.rangeInput}
              />
            </label>
          </div>
        )}
      </div>

      <div>
        <div className={filterStyles.rowLabel}>Reference group (L &amp; C source per shade)</div>
        <select
          className={styles.refSelect}
          value={effectiveReference}
          onChange={(e) => setReferenceFamily(e.target.value)}
          disabled={selectedFamilies.length === 0}
        >
          {selectedFamilies.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </select>
      </div>

      <div className={styles.standardBlock}>
        <label className={styles.checkRow}>
          <input
            type="checkbox"
            checked={standardizeReference}
            onChange={(e) => setStandardizeReference(e.target.checked)}
          />
          <span>Standardize reference shades first</span>
        </label>
        <p className={styles.standardHint}>
          Evenly spaces OKLCH lightness across selected reference shades (endpoints kept); chroma from average or a fixed
          value. Hue stays per swatch.
        </p>
        {standardizeReference && (
          <div className={styles.chromaRow}>
            <span className={styles.chromaLabel}>Chroma</span>
            <label className={styles.radio}>
              <input
                type="radio"
                name="chromaMode"
                checked={chromaMode === 'average'}
                onChange={() => setChromaMode('average')}
              />
              Average of selection
            </label>
            <label className={styles.radio}>
              <input
                type="radio"
                name="chromaMode"
                checked={chromaMode === 'fixed'}
                onChange={() => setChromaMode('fixed')}
              />
              Fixed
            </label>
            <input
              type="number"
              step="0.001"
              min="0"
              className={styles.chromaInput}
              disabled={chromaMode !== 'fixed'}
              value={chromaFixed}
              onChange={(e) => setChromaFixed(e.target.value)}
              title="OKLCH chroma (same units as culori / CSS oklch second number)"
            />
          </div>
        )}
      </div>

      {message && (
        <p className={message.startsWith('Updated') ? styles.msgOk : styles.msgErr} role="status">
          {message}
        </p>
      )}

      <div className={filterStyles.applySection}>
        <div className={styles.applyBtnRow}>
          <button type="button" className={filterStyles.applyBtn} disabled={!canApply} onClick={handleApply}>
            Apply harmonize
          </button>
          {oklchHarmonizeExportTokenKeys.length > 0 && (
            <button type="button" className={styles.exportOklchBtn} onClick={handleExportOklchCss}>
              Export OKLCH CSS
            </button>
          )}
        </div>
        <p className={filterStyles.applyCaption}>
          Hex values in the file preview update; use Copy CSS / Export in the navbar for hex output. Per-token popover can
          copy OKLCH. After you apply harmonize, Export OKLCH CSS downloads the full sheet with{' '}
          <code className={styles.code}>oklch()</code> for tokens touched by harmonize (others stay hex).
        </p>
      </div>
    </div>
  );
}
