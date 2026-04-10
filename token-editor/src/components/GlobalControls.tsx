'use client';

import React, { useState, useCallback, useRef } from 'react';
import { useColorStore, ViewMode, SortMode } from '@/hooks/useColorStore';
import { clampHSL } from '@/utils/colorUtils';
import { serializeCss, downloadCssFile } from '@/utils/cssSerializer';
import styles from './GlobalControls.module.css';

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

  const [showGlobal, setShowGlobal] = useState(false);
  const [copied, setCopied] = useState(false);

  // Track cumulative deltas for live global adjustment
  const [liveH, setLiveH] = useState(0);
  const [liveS, setLiveS] = useState(0);
  const [liveL, setLiveL] = useState(0);
  const prevDelta = useRef({ h: 0, s: 0, l: 0 });
  const hasSnapshotted = useRef(false);

  // Background color state
  const [bgColor, setBgColor] = useState<string | null>(null);

  const handleLiveChange = useCallback((channel: 'h' | 's' | 'l', value: number) => {
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
      // Apply delta without pushing another snapshot
      const { currentColors, currentRgbaColors, lockedTokens } = useColorStore.getState();


      const newColors: Record<string, { h: number; s: number; l: number }> = {};
      for (const [name, hsl] of Object.entries(currentColors)) {
        if (lockedTokens.has(name)) {
          newColors[name] = hsl;
        } else {
          newColors[name] = clampHSL({ h: hsl.h + dh, s: hsl.s + ds, l: hsl.l + dl });
        }
      }

      const newRgba: Record<string, { h: number; s: number; l: number; a: number }> = {};
      for (const [name, hsl] of Object.entries(currentRgbaColors)) {
        if (lockedTokens.has(name)) {
          newRgba[name] = hsl;
        } else {
          const clamped = clampHSL({ h: hsl.h + dh, s: hsl.s + ds, l: hsl.l + dl });
          newRgba[name] = { ...clamped, a: hsl.a };
        }
      }

      useColorStore.setState({ currentColors: newColors, currentRgbaColors: newRgba });
    }

    prevDelta.current = { h: newH, s: newS, l: newL };
    if (channel === 'h') setLiveH(newH);
    if (channel === 's') setLiveS(newS);
    if (channel === 'l') setLiveL(newL);
  }, [liveH, liveS, liveL]);

  const handleSliderMouseUp = useCallback(() => {
    // Save to localStorage after user lifts mouse
    const { currentColors, currentRgbaColors, lockedTokens, fileName } = useColorStore.getState();
    try {
      localStorage.setItem('token-editor-state', JSON.stringify({
        currentColors, currentRgbaColors, lockedTokens: Array.from(lockedTokens), fileName,
      }));
    } catch { /* ignore */ }
  }, []);

  const resetGlobalSliders = useCallback(() => {
    setLiveH(0);
    setLiveS(0);
    setLiveL(0);
    prevDelta.current = { h: 0, s: 0, l: 0 };
    hasSnapshotted.current = false;
  }, []);

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

  const viewModes: { key: ViewMode; label: string; icon: string }[] = [
    { key: 'grouped', label: 'Grouped', icon: '▦' },
    { key: 'list', label: 'List', icon: '☷' },
  ];

  return (
    <div className={styles.controls}>
      <div className={styles.topRow}>
        <div className={styles.logoWrap}>
          <div className={styles.logoIcon} style={{ display: 'flex', alignItems: 'center', marginRight: '0.2rem' }}>
            <svg width="24" height="24" viewBox="0 0 48 48" fill="none">
              <rect x="4" y="4" width="16" height="16" rx="4" fill="#6f21e4" />
              <rect x="28" y="4" width="16" height="16" rx="4" fill="#0060d6" />
              <rect x="4" y="28" width="16" height="16" rx="4" fill="#f5ba0a" />
              <rect x="28" y="28" width="16" height="16" rx="4" fill="#d62400" />
            </svg>
          </div>
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
                  setBgColor(e.target.value);
                  document.body.style.background = e.target.value;
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
                }}
                title="Reset background"
              >
                ×
              </button>
            )}
          </div>

          <button
            className={styles.globalToggle}
            onClick={() => setShowGlobal(!showGlobal)}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z" />
            </svg>
            Global HSL
          </button>

          <button
            className={styles.actionBtn}
            onClick={undo}
            disabled={undoStack.length === 0}
            title="Undo"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="1 4 1 10 7 10" />
              <path d="M3.51 15a9 9 0 102.13-9.36L1 10" />
            </svg>
            Undo
          </button>

          <button
            className={styles.actionBtn}
            onClick={redo}
            disabled={redoStack.length === 0}
            title="Redo"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ transform: 'scaleX(-1)' }}>
              <polyline points="1 4 1 10 7 10" />
              <path d="M3.51 15a9 9 0 102.13-9.36L1 10" />
            </svg>
            Redo
          </button>

          <button
            className={styles.resetBtn}
            onClick={resetAll}
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
            Global HSL Adjustment
            <span className={styles.globalHint}>Live — drag sliders to shift all unlocked colors</span>
          </div>

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
              />
              <input
                type="number"
                min={-100}
                max={100}
                value={liveL}
                onChange={(e) => handleLiveChange('l', parseInt(e.target.value) || 0)}
                onBlur={handleSliderMouseUp}
                className={styles.globalNum}
              />
            </div>
          </div>

          <button className={styles.resetSlidersBtn} onClick={resetGlobalSliders}>
            Reset Sliders to 0
          </button>
        </div>
      )}
    </div>
  );
}
